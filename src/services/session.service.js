const httpStatus = require('http-status');
const mongoose = require('mongoose');
const {
  Session,
  User,
  SessionStatusTracking,
  ApproveSessionHistory,
  RequestSessionSignature,
  NotarizationField,
  NotarizationService,
  Payment,
} = require('../models');
const ApiError = require('../utils/ApiError');
const { userService, notarizationService } = require('.');
const emailService = require('./email.service');
const { payOS } = require('../config/payos');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const statusTranslations = {
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  verification: 'Đang xác minh',
  digitalSignature: 'Sẵn sàng ký số',
  completed: 'Hoàn tất',
  rejected: 'Không hợp lệ',
};

const generateOrderCode = () => {
  const MAX_SAFE_INTEGER = 9007199254740991;
  const MAX_ORDER_CODE = Math.floor(MAX_SAFE_INTEGER / 10);

  return Math.floor(Math.random() * MAX_ORDER_CODE) + 1;
};

const validateEmails = async (emails) => {
  if (!Array.isArray(emails)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Emails must be an array');
  }
  emails.forEach((emailItem) => {
    if (!emailRegex.test(emailItem)) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Invalid email format: ${emailItem}`);
    }
  });
  return true;
};

const isValidFullDate = async (input) => {
  const fullDateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const isValidFormat = fullDateRegex.test(input);
  if (!isValidFormat) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date format');
  }
  const date = new Date(input);
  if (!(date instanceof Date) || Number.isNaN(date)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date');
  }
  return true;
};

const isValidMonth = async (input) => {
  const monthRegex = /^\d{4}-\d{2}$/;
  const isValidFormat = monthRegex.test(input);
  if (!isValidFormat) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date format');
  }
  const date = new Date(input);
  if (!(date instanceof Date) || Number.isNaN(date)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date');
  }
  return true;
};

const findBySessionId = async (sessionId) => {
  const session = await Session.findById(sessionId);
  if (!session) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Session not found');
  }
  return session;
};

const createSession = async (sessionBody) => {
  const { sessionName, notaryField, notaryService, startTime, startDate, endTime, endDate, users, createdBy } = sessionBody;

  if (!sessionName || !notaryField || !notaryService || !startTime || !startDate || !endTime || !endDate || !users) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Missing required fields');
  }

  const startDateTime = new Date(`${startDate}T${startTime}`);
  const endDateTime = new Date(`${endDate}T${endTime}`);

  if (endDateTime <= startDateTime) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'End time must be after start time');
  }

  if (!mongoose.Types.ObjectId.isValid(notaryField.id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid notaryField ID');
  }

  const fieldExists = await NotarizationField.findById(notaryField.id);
  if (!fieldExists) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Notarization Field not found');
  }

  if (!mongoose.Types.ObjectId.isValid(notaryService.id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid notaryService ID');
  }

  const serviceExists = await NotarizationService.findById(notaryService.id);
  if (!serviceExists) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Notarization Service not found');
  }

  if (serviceExists.fieldId.toString() !== fieldExists._id.toString()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Notarization Service does not belong to the specified Field');
  }

  const notaryFieldObj = {
    name: fieldExists.name,
    _id: fieldExists._id,
    description: fieldExists.description,
  };

  const notaryServiceObj = {
    name: serviceExists.name,
    _id: serviceExists._id,
    description: serviceExists.description,
    price: serviceExists.price,
    fieldId: serviceExists.fieldId,
  };

  if (!Array.isArray(users) || users.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'At least one user is required');
  }

  const userEmails = users.map((u) => u.email);
  const existingUsers = await User.find({ email: { $in: userEmails } });

  if (existingUsers.length !== userEmails.length) {
    const existingEmails = existingUsers.map((u) => u.email);
    const missingEmails = userEmails.filter((email) => !existingEmails.includes(email));
    throw new ApiError(httpStatus.BAD_REQUEST, `Users not found for emails: ${missingEmails.join(', ')}`);
  }

  const usersWithIds = existingUsers.map((user) => ({
    _id: user._id,
    email: user.email,
    status: 'pending',
  }));

  try {
    const sessionData = {
      sessionName,
      notaryField: notaryFieldObj,
      notaryService: notaryServiceObj,
      startTime,
      startDate,
      endTime,
      endDate,
      users: usersWithIds,
      createdBy,
      status: 'scheduled',
      createdAt: new Date(),
    };

    const session = await Session.create(sessionData);
    return session;
  } catch (error) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Error creating session', error);
  }
};

const addUserToSession = async (sessionId, emails) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid session ID');
    }

    const session = await findBySessionId(sessionId);

    if (!session) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Session not found');
    }

    if (!Array.isArray(emails) || emails.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Emails must be a non-empty array');
    }

    const invalidEmails = emails.filter((email) => !emailRegex.test(email));
    if (invalidEmails.length > 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Invalid email format for: ${invalidEmails.join(', ')}`);
    }

    const existingUsers = await User.find({ email: { $in: emails } });

    if (existingUsers.length !== emails.length) {
      const existingEmails = existingUsers.map((u) => u.email);
      const missingEmails = emails.filter((email) => !existingEmails.includes(email));
      throw new ApiError(httpStatus.BAD_REQUEST, `Users not found for emails: ${missingEmails.join(', ')}`);
    }

    const alreadyAddedEmails = session.users.filter((user) => emails.includes(user.email)).map((user) => user.email);

    if (alreadyAddedEmails.length > 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Users already added to this session: ${alreadyAddedEmails.join(', ')}`);
    }

    const usersToAdd = existingUsers.map((user) => ({
      _id: user._id,
      email: user.email,
      status: 'pending',
    }));

    session.users.push(...usersToAdd);
    await session.save();

    return session;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error adding users to session:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add users to session');
  }
};

const deleteUserOutOfSession = async (sessionId, email, userId) => {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid session ID');
  }
  const session = await findBySessionId(sessionId);
  if (session.createdBy.toString() !== userId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You are not authorized to delete users from this session');
  }

  const userIndex = session.users.findIndex((user) => user.email === email);
  if (userIndex !== -1) {
    session.users.splice(userIndex, 1);
  } else {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found in session');
  }

  await session.save();
  return session;
};
const joinSession = async (sessionId, action, userId) => {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid session ID');
  }
  const session = await Session.findById(sessionId);
  if (!session) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Session not found');
  }
  const user = await userService.getUserById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  const userIndex = session.users.findIndex((userItem) => userItem.email === user.email);
  if (userIndex === -1) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found in session');
  }
  if (action === 'accept') {
    session.users[userIndex].status = 'accepted';
  } else if (action === 'reject') {
    session.users[userIndex].status = 'rejected';
  } else {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid action');
  }
  await session.save();
  return session;
};

const getAllSessions = async (filter, options) => {
  const { page, limit } = options;

  try {
    const sessions = await Session.find(filter);

    if (!sessions || sessions.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'No sessions found');
    }

    const sessionCreators = await Promise.all(
      sessions.map(async (session) => {
        const creator = await userService.getUserById(session.createdBy);
        return {
          _id: session._id,
          sessionName: session.sessionName,
          notaryField: session.notaryField,
          notaryService: session.notaryService,
          startTime: session.startTime,
          startDate: session.startDate,
          endTime: session.endTime,
          endDate: session.endDate,
          users: session.users,
          files: session.files,
          creator: creator ? { _id: creator._id, email: creator.email, name: creator.name } : null,
        };
      })
    );

    const totalResults = sessionCreators.length;
    const totalPages = Math.ceil(totalResults / limit);
    const paginatedResults = sessionCreators.slice((page - 1) * limit, page * limit);

    return {
      results: paginatedResults,
      page,
      limit,
      totalPages,
      totalResults,
    };
  } catch (error) {
    console.error('Error retrieving all sessions:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An error occurred while retrieving sessions');
  }
};

const getSessionsByDate = async (date) => {
  try {
    if (!date) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Date is required');
    }
    await isValidFullDate(date);
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);
    const sessions = await Session.find({
      startDate: {
        $gte: startOfDay,
        $lt: endOfDay,
      },
    });

    if (!sessions || sessions.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'No sessions found for the specified date');
    }

    return sessions;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An error occurred while retrieving sessions');
  }
};

const getSessionsByMonth = async (date) => {
  try {
    if (!date) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Date is required');
    }
    await isValidMonth(date);
    const givenDate = new Date(date);
    const startOfMonth = new Date(givenDate.getFullYear(), givenDate.getMonth(), 1, 0, 0, 0, 0);
    const endOfMonth = new Date(givenDate.getFullYear(), givenDate.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);
    const sessions = await Session.find({
      startDate: {
        $gte: startOfMonth,
        $lt: endOfMonth,
      },
    });

    if (!sessions || sessions.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'No sessions found for the specified month');
    }

    return sessions;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An error occurred while retrieving sessions');
  }
};

const getActiveSessions = async () => {
  try {
    const sessions = await Session.find({
      endDate: {
        $gte: new Date(),
      },
    });

    if (!sessions || sessions.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'No sessions found at present');
    }

    return sessions;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error retrieving active sessions:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An error occurred while retrieving sessions');
  }
};

const getSessionsByUserId = async (userId) => {
  try {
    const user = await userService.getUserById(userId);
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    const sessionsCreated = await Session.find({ createdBy: userId }).lean();

    const joinedSessions = await Session.find({ 'users.email': user.email }).lean();

    const allSessions = [...sessionsCreated, ...joinedSessions];

    if (allSessions.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Sessions not found');
    }

    const sessionCreators = await Promise.all(
      allSessions.map(async (session) => {
        const creator = await userService.getUserById(session.createdBy);
        return {
          ...session,
          creator: creator ? { _id: creator._id, email: creator.email, name: creator.name } : null,
        };
      })
    );

    return { results: sessionCreators };
  } catch (err) {
    console.error('Error retrieving sessions by user ID:', err);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An error occurred while retrieving sessions');
  }
};

const getSessionBySessionId = async (sessionId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid session ID');
  }
  const session = await Session.findById(sessionId);
  if (!session) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Session not found');
  }
  const user = await User.findById(userId);
  const isSessionCreator = session.createdBy.toString() === userId.toString();
  const isSessionUser = session.users.some((u) => u.email === user.email);
  if (!isSessionCreator && !isSessionUser) {
    throw new ApiError(httpStatus.FORBIDDEN, 'User does not have access to this session');
  }
  return session;
};

const uploadSessionDocument = async (sessionId, userId, files) => {
  try {
    if (!files || files.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No files provided');
    }

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid session ID');
    }

    const session = await findBySessionId(sessionId);
    if (!session) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Session not found');
    }

    const user = await userService.getUserById(userId);
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    const isSessionUser = session.users.some((u) => u.email === user.email) || session.createdBy.equals(userId);
    if (!isSessionUser) {
      throw new ApiError(httpStatus.FORBIDDEN, 'User is not part of this session');
    }

    if (!session.createdBy.equals(userId)) {
      const isUserAccepted = session.users.some((u) => u.email === user.email && u.status === 'accepted');
      if (!isUserAccepted) {
        throw new ApiError(httpStatus.FORBIDDEN, 'User is not accepted as part of this session');
      }
    }

    const existingStatus = await SessionStatusTracking.findOne({ sessionId });
    if (existingStatus) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Session already sent for notarization');
    }

    const fileUrls = await Promise.all(
      files.map((file) => notarizationService.uploadFileToFirebase(file, 'sessionDocuments', sessionId))
    );

    if (!session.files) {
      session.files = [];
    }

    const newFiles = fileUrls.map((url, index) => ({
      filename: `${Date.now()}-${files[index].originalname}-by-${userId}`,
      firebaseUrl: url,
      createAt: new Date(),
      uploadedBy: userId,
    }));

    session.files.push(...newFiles);
    await session.save();

    return {
      message: 'Files uploaded successfully',
      uploadedFiles: newFiles,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error uploading files to session:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An error occurred while uploading files');
  }
};

const createSessionStatusTracking = async (sessionId, status) => {
  try {
    const statusTracking = new SessionStatusTracking({
      sessionId,
      status,
      updatedAt: new Date(),
    });

    await statusTracking.save();
    return statusTracking;
  } catch (error) {
    console.error('Error creating status tracking:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create status tracking');
  }
};

const sendSessionForNotarization = async (sessionId, userId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid session ID');
    }

    const session = await findBySessionId(sessionId);
    if (!session) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Session not found');
    }

    if (session.createdBy.toString() !== userId.toString()) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Only the session creator can send for notarization');
    }

    if (session.files.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No documents to send for notarization');
    }

    const existingStatus = await SessionStatusTracking.findOne({ sessionId });
    if (existingStatus) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Session already sent for notarization');
    }

    const sessionStatusTracking = await createSessionStatusTracking(sessionId, 'pending');

    return {
      message: 'Session sent for notarization successfully',
      session,
      status: sessionStatusTracking.status,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error sending session for notarization:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An error occurred while sending session for notarization');
  }
};

const getSessionStatus = async (sessionId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid session ID');
    }

    const session = await findBySessionId(sessionId);
    if (!session) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Session not found');
    }

    const status = await SessionStatusTracking.findOne({ sessionId });
    if (!status) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Session not ready for notarization');
    }

    return {
      status,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error retrieving session status:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An error occurred while retrieving session status');
  }
};

const getSessionByRole = async (role) => {
  try {
    let statusFilter = [];

    if (role === 'notary') {
      statusFilter = ['processing'];
    } else if (role === 'secretary') {
      statusFilter = ['pending', 'verification', 'digitalSignature'];
    } else {
      throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to access these sessions');
    }

    const sessionStatusTrackings = await SessionStatusTracking.find({ status: { $in: statusFilter } });

    const sessionIds = sessionStatusTrackings.map((tracking) => tracking.sessionId);

    const sessions = await Session.find({ _id: { $in: sessionIds } });

    const result = sessions.map((doc) => {
      const statusTracking = sessionStatusTrackings.find((tracking) => tracking.sessionId.toString() === doc._id.toString());
      return {
        ...doc.toObject(),
        status: statusTracking.status,
      };
    });

    return result;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error retrieving sessions by role:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve sessions');
  }
};

const forwardSessionStatus = async (sessionId, action, role, userId, feedBack) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid session ID');
    }

    const validStatuses = ['pending', 'verification', 'processing', 'digitalSignature', 'completed'];
    const roleStatusMap = {
      notary: ['processing'],
      secretary: ['pending', 'verification', 'digitalSignature'],
    };

    let newStatus;
    const currentStatus = await SessionStatusTracking.findOne({ sessionId }, 'status');

    if (action === 'accept') {
      if (!currentStatus) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Session status not found');
      }
      if (currentStatus.status === 'rejected') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Session already been rejected');
      }
      if (!roleStatusMap[role]) {
        throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to access these sessions');
      }
      if (!roleStatusMap[role].includes(currentStatus.status)) {
        throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to access these sessions');
      }
      const currentStatusIndex = validStatuses.indexOf(currentStatus.status);

      if (currentStatusIndex === -1) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid current status');
      }
      newStatus = validStatuses[currentStatusIndex + 1];
      if (!newStatus) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Session has already reached final status');
      }
    } else if (action === 'reject') {
      newStatus = 'rejected';
    } else {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid action provided');
    }

    const approveSessionHistory = new ApproveSessionHistory({
      userId,
      sessionId,
      beforeStatus: (await SessionStatusTracking.findOne({ sessionId }, 'status')).status,
      afterStatus: newStatus,
    });

    await approveSessionHistory.save();

    const updateData = {
      status: newStatus,
      updatedAt: new Date(),
    };

    if (newStatus === 'rejected') {
      if (!feedBack) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'feedBack is required for rejected status');
      }
      if (typeof feedBack !== 'string') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid feedBack format');
      }
      updateData.feedBack = feedBack;
    }

    const email = await Session.findOne({ _id: sessionId }, 'users email createdBy');
    if (!email) {
      console.log('This is email', email);
      throw new ApiError(httpStatus.NOT_FOUND, 'Email not found');
    }

    const userEmails = email.users.map((user) => user.email);

    const creator = await User.findById(email.createdBy);
    if (creator && creator.email) {
      userEmails.push(creator.email);
    }

    await emailService.sendDocumentStatusUpdateEmail(userEmails, sessionId, currentStatus.status, newStatus, feedBack);

    const result = await SessionStatusTracking.updateOne({ sessionId }, updateData);

    if (result.nModified === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'No status found for this session');
    }

    return {
      message: `Session status updated to ${newStatus}`,
      sessionId,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error forwarding session status:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred');
  }
};

const approveSignatureSessionByUser = async (sessionId, amount, signatureImage) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid session ID');
    }

    const sessionStatusTracking = await SessionStatusTracking.findOne({ sessionId });

    if (sessionStatusTracking.status !== 'digitalSignature') {
      throw new ApiError(httpStatus.CONFLICT, 'Session is not ready for digital signature');
    }

    let requestSessionSignature = await RequestSessionSignature.findOne({ sessionId });

    if (!requestSessionSignature) {
      if (!signatureImage || signatureImage.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No signature image provided');
      }

      const newRequestSessionSignature = new RequestSessionSignature({
        sessionId,
        amount,
        signatureImage,
        approvalStatus: {
          secretary: {
            approved: false,
            approvedAt: null,
          },
          user: {
            approved: true,
            approvedAt: new Date(),
          },
        },
      });

      await newRequestSessionSignature.save();
      requestSessionSignature = await RequestSessionSignature.findOne({ sessionId });
    }

    requestSessionSignature.signatureImage = signatureImage || requestSessionSignature.signatureImage;

    await requestSessionSignature.save();

    return requestSessionSignature;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error approve signature by user:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to approve signature by user');
  }
};
const approveSignatureSessionBySecretary = async (sessionId, userId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid session ID');
    }

    const sessionStatusTracking = await SessionStatusTracking.findOne({ sessionId });

    if (sessionStatusTracking.status !== 'digitalSignature') {
      throw new ApiError(httpStatus.CONFLICT, 'Session is not ready for digital signature');
    }

    const requestSessionSignature = await RequestSessionSignature.findOne({ sessionId });
    if (!requestSessionSignature) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Signature request not found. User has not approved the session yet');
    }

    if (!requestSessionSignature.approvalStatus.user.approved) {
      throw new ApiError(httpStatus.CONFLICT, 'Cannot approve. User has not approved the session yet');
    }

    const session = await Session.findById(sessionId);
    if (!session) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Session not found');
    }

    if (session.payment) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Session has already been paid');
    }

    const payment = new Payment({
      orderCode: generateOrderCode(),
      amount: session.notaryService.price * requestSessionSignature.amount,
      description: `Session: ${sessionId.toString().slice(-15)}`,
      returnUrl: `${process.env.SERVER_URL}/success.html`,
      cancelUrl: `${process.env.SERVER_URL}/cancel.html`,
      userId,
      sessionId,
      serviceId: session.notaryService.id,
      fieldId: session.notaryField.id,
    });

    await payment.save();

    const paymentLinkResponse = await payOS.createPaymentLink({
      orderCode: payment.orderCode,
      amount: payment.amount,
      description: payment.description,
      returnUrl: payment.returnUrl,
      cancelUrl: payment.cancelUrl,
    });

    payment.checkoutUrl = paymentLinkResponse.checkoutUrl;
    await payment.save();

    console.log(paymentLinkResponse);

    session.payment = payment._id;
    session.checkoutUrl = paymentLinkResponse.checkoutUrl;
    session.orderCode = payment.orderCode;
    await session.save();
    console.log(session);

    await SessionStatusTracking.updateOne(
      { sessionId },
      {
        status: 'completed',
        updatedAt: new Date(),
      }
    );

    const approveSessionHistory = new ApproveSessionHistory({
      userId,
      sessionId,
      beforeStatus: 'digitalSignature',
      afterStatus: 'completed',
    });

    requestSessionSignature.approvalStatus.secretary = {
      approved: true,
      approvedAt: new Date(),
    };

    await requestSessionSignature.save();

    await approveSessionHistory.save();
    const user = await userService.getUserById(userId);

    await emailService.sendPaymentEmail(user.email, session._id, paymentLinkResponse.checkoutUrl);

    return {
      message: 'Secretary approved and signed the session successfully',
      sessionId,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error approve signature by secretary:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to approve signature by secretary');
  }
};

const autoForwardSessionStatus = async () => {
  try {
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);

    const pendingSessions = await SessionStatusTracking.find({
      status: 'pending',
      updatedAt: { $lte: oneMinuteAgo },
    });

    const updatePromises = pendingSessions.map(async (tracking) => {
      const updatedTracking = {
        ...tracking.toObject(),
        status: 'verification',
        updatedAt: new Date(),
      };
      await SessionStatusTracking.updateOne({ _id: tracking._id }, updatedTracking);

      const approveSessionHistory = new ApproveSessionHistory({
        userId: null,
        sessionId: tracking.sessionId,
        beforeStatus: 'pending',
        afterStatus: 'verification',
      });
      await approveSessionHistory.save();
    });

    console.log(`Auto-forwarded ${updatePromises.length} sessions from 'pending' to 'verification' status`);

    await Promise.all(updatePromises);
  } catch (error) {
    console.error('Error auto-forwarding sessions:', error.message);
  }
};

module.exports = {
  validateEmails,
  findBySessionId,
  createSession,
  addUserToSession,
  deleteUserOutOfSession,
  joinSession,
  getAllSessions,
  getSessionsByDate,
  getSessionsByMonth,
  getActiveSessions,
  isValidFullDate,
  isValidMonth,
  getSessionsByUserId,
  getSessionBySessionId,
  uploadSessionDocument,
  sendSessionForNotarization,
  createSessionStatusTracking,
  getSessionStatus,
  getSessionByRole,
  forwardSessionStatus,
  approveSignatureSessionByUser,
  approveSignatureSessionBySecretary,
  autoForwardSessionStatus,
};
