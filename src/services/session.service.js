const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Session, User, SessionStatusTracking, ApproveSessionHistory, RequestSessionSignature } = require('../models');
const ApiError = require('../utils/ApiError');
const { userService, notarizationService } = require('.');
const emailService = require('./email.service');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const statusTranslations = {
  pending: 'Chờ xử lý',
  processing: 'Đang xử lý',
  verification: 'Đang xác minh',
  digitalSignature: 'Sẵn sàng ký số',
  completed: 'Hoàn tất',
  rejected: 'Không hợp lệ',
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
  const session = await Session.create(sessionBody);
  return session;
};

const addUserToSession = async (sessionId, emails) => {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid session ID');
  }
  const session = await findBySessionId(sessionId);

  if (!session) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Session not found');
  }

  await validateEmails(emails);
  if (session.users.some((user) => emails.includes(user.email))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'User already added to this session');
  }
  emails.forEach((email) => {
    session.users.push({ email, status: 'pending' });
  });
  await session.save();
  return session;
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

    let subject;
    let message;

    const currentStatusInVietnamese = statusTranslations[currentStatus.status];
    const newStatusInVietnamese = statusTranslations[newStatus];

    console.log(currentStatusInVietnamese, newStatusInVietnamese);

    if (newStatus === 'rejected') {
      subject = 'Phiên công chứng bị từ chối';
      message = `Phiên công chứng của bạn với ID: ${sessionId} đã bị từ chối công chứng!\nLý do: ${feedBack}`;
    } else {
      subject = 'Cập nhật trạng thái phiên công chứng';
      message = `Phiên công chứng của bạn với ID: ${sessionId} đã được cập nhật từ trạng thái ${currentStatusInVietnamese} sang ${newStatusInVietnamese}.`;
    }

    await Promise.all(
      userEmails.map(async (userEmail) => {
        await emailService.sendEmail(userEmail, subject, message);
      })
    );

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
    return {
      message: 'Secretary approved and signed the session successfully',
      sessionId,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error approve session signature by secretary:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to approve session signature by secretary');
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
};
