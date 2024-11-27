const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { ObjectId } = require('mongoose').Types;
const emailService = require('./email.service');
const { Document, StatusTracking, ApproveHistory, NotarizationService, NotarizationField } = require('../models');
const ApiError = require('../utils/ApiError');
const { bucket } = require('../config/firebase');
const RequestSignature = require('../models/requestSignature.model');
const { payOS } = require('../config/payos');
const Payment = require('../models/payment.model');

const generateOrderCode = () => {
  const MAX_SAFE_INTEGER = 9007199254740991;
  const MAX_ORDER_CODE = Math.floor(MAX_SAFE_INTEGER / 10);

  return Math.floor(Math.random() * MAX_ORDER_CODE) + 1;
};

const uploadFileToFirebase = async (file, rootFolder, folderName) => {
  const fileName = `${Date.now()}-${file.originalname}`;
  const fileRef = bucket.file(`${rootFolder}/${folderName}/${fileName}`);

  try {
    await fileRef.save(file.buffer, { contentType: file.mimetype });
    return `https://storage.googleapis.com/${bucket.name}/${rootFolder}/${folderName}/${fileName}`;
  } catch (error) {
    console.error('Error uploading file:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to upload file');
  }
};

const createDocument = async (documentBody, files, userId) => {
  try {
    if (!files || files.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No files provided');
    }

    const { notarizationField, notarizationService, requesterInfo, amount } = documentBody;

    const notarizationFieldDoc = await NotarizationField.findById(notarizationField.id);
    if (!notarizationFieldDoc) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid notarization field ID provided');
    }

    const notarizationServiceDoc = await NotarizationService.findById(notarizationService.id);
    if (!notarizationServiceDoc) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid notarization service ID provided');
    }

    if (String(notarizationServiceDoc.fieldId) !== String(notarizationFieldDoc._id)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Notarization service does not match the provided field');
    }

    // if (notarizationFieldDoc.name !== notarizationField.name) {
    //   throw new ApiError(httpStatus.BAD_REQUEST, 'Notarization field name does not match');
    // }

    // if (notarizationFieldDoc.description !== notarizationField.description) {
    //   throw new ApiError(httpStatus.BAD_REQUEST, 'Notarization field description does not match');
    // }
    // if (notarizationServiceDoc.name !== notarizationService.name) {
    //   throw new ApiError(httpStatus.BAD_REQUEST, 'Notarization service name does not match');
    // }

    // if (notarizationServiceDoc.description !== notarizationService.description) {
    //   throw new ApiError(httpStatus.BAD_REQUEST, 'Notarization service description does not match');
    // }

    // if (notarizationServiceDoc.price !== notarizationService.price) {
    //   throw new ApiError(httpStatus.BAD_REQUEST, 'Notarization service price does not match');
    // }

    const newDocument = new Document({
      files: [],
      notarizationService: {
        id: notarizationService.id,
        name: notarizationService.name,
        fieldId: notarizationService.fieldId,
        description: notarizationService.description,
        price: notarizationService.price,
        required_documents: notarizationService.required_documents,
        code: notarizationService.code,
      },
      notarizationField: {
        id: notarizationField.id,
        name: notarizationField.name,
        description: notarizationField.description,
        name_en: notarizationField.name_en,
        code: notarizationField.code,
      },
      requesterInfo: {
        fullName: requesterInfo.fullName,
        citizenId: requesterInfo.citizenId,
        phoneNumber: requesterInfo.phoneNumber,
        email: requesterInfo.email,
      },
      userId,
      createdAt: Date.now(),
      amount,
    });

    const fileUrls = await Promise.all(files.map((file) => uploadFileToFirebase(file, 'documents', newDocument._id)));
    const formattedFiles = files.map((file, index) => ({
      filename: `${Date.now()}-${file.originalname}`,
      firebaseUrl: fileUrls[index],
    }));

    newDocument.files = formattedFiles;
    await newDocument.save();

    await emailService.sendDocumentUploadEmail(requesterInfo.email, requesterInfo.fullName, newDocument._id);

    return newDocument;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error creating document:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to upload document');
  }
};

const createStatusTracking = async (documentId, status) => {
  try {
    const statusTracking = new StatusTracking({
      documentId,
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

const getHistoryByUserId = async (userId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid user ID');
    }

    const history = await Document.aggregate([
      {
        $match: { userId: new mongoose.Types.ObjectId(userId) },
      },
      {
        $lookup: {
          from: 'statustrackings',
          localField: '_id',
          foreignField: 'documentId',
          as: 'status',
          pipeline: [{ $sort: { updatedAt: -1 } }, { $limit: 1 }],
        },
      },
      {
        $addFields: {
          status: { $arrayElemAt: ['$status', 0] },
        },
      },
    ]);

    return history;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error fetching history by user ID:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch history by user ID');
  }
};

const getHistoryWithStatus = async (userId) => {
  const history = await Document.aggregate([
    {
      $match: { userId: new ObjectId(userId) },
    },
    {
      $lookup: {
        from: 'statustrackings',
        localField: '_id',
        foreignField: 'documentId',
        as: 'status',
        pipeline: [{ $sort: { updatedAt: -1 } }, { $limit: 1 }],
      },
    },
  ]);

  return history.map((doc) => ({
    ...doc,
    status: doc.status.length > 0 ? doc.status[0] : null,
  }));
};

const getDocumentStatus = async (documentId) => {
  try {
    const statusTracking = await StatusTracking.findOne({ documentId });
    return statusTracking;
  } catch (error) {
    console.log(error);
    throw error;
  }
};

const getDocumentByRole = async (role) => {
  try {
    let statusFilter = [];

    if (role === 'notary') {
      statusFilter = ['pending', 'digitalSignature', 'processing'];
    } else {
      throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to access these documents');
    }

    const statusTrackings = await StatusTracking.find({ status: { $in: statusFilter } });

    const documentIds = statusTrackings.map((tracking) => tracking.documentId);

    const documents = await Document.find({ _id: { $in: documentIds } });

    const result = documents.map((doc) => {
      const statusTracking = statusTrackings.find((tracking) => tracking.documentId.toString() === doc._id.toString());
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
    console.error('Error retrieving documents by role:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve documents');
  }
};
const forwardDocumentStatus = async (documentId, action, role, userId, feedback) => {
  try {
    const validStatuses = ['pending', 'processing', 'digitalSignature', 'completed'];
    const roleStatusMap = {
      notary: ['pending', 'processing', 'digitalSignature'],
    };

    // Fetch current status once and reuse
    const currentStatus = await StatusTracking.findOne({ documentId }, 'status');
    if (!currentStatus) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Document status not found');
    }

    // Validate role permissions
    if (!roleStatusMap[role].includes(currentStatus.status)) {
      throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to access these documents');
    }

    // Validate action and handle feedback requirements
    let newStatus;
    if (action === 'accept') {
      if (currentStatus.status === 'rejected') {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Document already been rejected');
      }

      const currentStatusIndex = validStatuses.indexOf(currentStatus.status);
      newStatus = validStatuses[currentStatusIndex + 1];

      if (!newStatus) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Document has already reached final status');
      }
    } else if (action === 'reject') {
      if (!feedback) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Feedback is required for rejection');
      }
      newStatus = 'rejected';
    } else {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid action provided');
    }

    // Create approve history
    const approveHistory = new ApproveHistory({
      userId,
      documentId,
      beforeStatus: currentStatus.status,
      afterStatus: newStatus,
    });
    await approveHistory.save();

    // Prepare update data
    const updateData = {
      status: newStatus,
      updatedAt: new Date(),
      ...(feedback && { feedback }), // Only include feedback if it exists
    };

    // Fetch email in parallel with approve history save
    const [email] = await Promise.all([
      Document.findOne({ _id: documentId }, 'requesterInfo.email'),
      StatusTracking.updateOne({ documentId }, updateData),
    ]);

    if (!email.requesterInfo.email) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Email not found');
    }

    // Send email notification
    await emailService.sendDocumentStatusUpdateEmail(
      email.requesterInfo.email,
      documentId,
      currentStatus.status,
      newStatus,
      feedback
    );

    return {
      message: `Document status updated to ${newStatus}`,
      documentId,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error forwarding document status:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An unexpected error occurred');
  }
};

const getApproveHistory = async (userId) => {
  try {
    const history = await ApproveHistory.find({ userId });

    if (history.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'No approval history found for this user.');
    }

    return history;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error fetching approve history:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to fetch approve history');
  }
};

const getAllNotarizations = async (filter, options) => {
  const page = options.page && options.page > 0 ? parseInt(options.page, 10) : 1;
  const limit = options.limit && options.limit > 0 ? parseInt(options.limit, 10) : 10;
  const skip = (page - 1) * limit;

  const sortBy = options.sortBy || 'createdAt';

  const documents = await Document.aggregate([
    { $match: filter },
    {
      $lookup: {
        from: 'statustrackings',
        let: { documentId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$documentId', '$$documentId'] } } },
          { $sort: { updatedAt: -1 } },
          { $limit: 1 },
        ],
        as: 'status',
      },
    },
    {
      $addFields: {
        status: { $arrayElemAt: ['$status', 0] },
      },
    },
    {
      $sort: { [sortBy]: -1 },
    },
    {
      $skip: skip,
    },
    {
      $limit: limit,
    },
  ]);

  const totalDocuments = await Document.countDocuments(filter);

  return {
    results: documents,
    page,
    limit,
    totalPages: Math.ceil(totalDocuments / limit),
    totalResults: totalDocuments,
  };
};

const approveSignatureByUser = async (documentId, signatureImage) => {
  try {
    console.log(signatureImage);
    const statusTracking = await StatusTracking.findOne({ documentId });
    // Check if the document is in the correct status
    if (statusTracking.status !== 'digitalSignature') {
      throw new ApiError(httpStatus.CONFLICT, 'Document is not ready for digital signature');
    }

    let requestSignature = await RequestSignature.findOne({ documentId });

    if (!requestSignature) {
      if (!signatureImage || signatureImage.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'No signature image provided');
      }

      const newRequestSignature = new RequestSignature({
        documentId,
        signatureImage,
        approvalStatus: {
          notary: {
            approved: false,
            approvedAt: null,
          },
          user: {
            approved: true,
            approvedAt: new Date(),
          },
        },
      });

      await newRequestSignature.save();
      requestSignature = await RequestSignature.findOne({ documentId });
    }

    requestSignature.signatureImage = signatureImage || requestSignature.signatureImage;

    await requestSignature.save();

    return requestSignature;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error approve signature by user:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to approve signature by user');
  }
};

const approveSignatureByNotary = async (documentId, userId) => {
  try {
    const statusTracking = await StatusTracking.findOne({ documentId });
    // Check if the document is in the correct status
    if (statusTracking.status !== 'digitalSignature') {
      throw new ApiError(httpStatus.CONFLICT, 'Document is not ready for digital signature');
    }

    const requestSignature = await RequestSignature.findOne({ documentId });
    if (!requestSignature) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Signature request not found. User has not approved the document yet');
    }

    if (!requestSignature.approvalStatus.user.approved) {
      throw new ApiError(httpStatus.CONFLICT, 'Cannot approve. User has not approved the document yet');
    }

    const document = await Document.findById(documentId);
    if (!document) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Document not found');
    }

    // Check if the document has already been paid
    if (document.payment) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Document has already been paid');
    }

    // // Create a new payment object
    // const payment = new Payment({
    //   orderCode: generateOrderCode(),
    //   amount: document.notarizationService.price * requestSignature.amount,
    //   description: `${document._id}`,
    //   returnUrl: `${process.env.SERVER_URL}/success.html`,
    //   cancelUrl: `${process.env.SERVER_URL}/cancel.html`,
    //   userId,
    //   documentId,
    //   serviceId: document.notarizationService.id,
    //   fieldId: document.notarizationField.id,
    // });

    // await payment.save();

    // // Create a payment link using PayOS
    // const paymentLinkResponse = await payOS.createPaymentLink({
    //   orderCode: payment.orderCode,
    //   amount: payment.amount,
    //   description: payment.description,
    //   returnUrl: payment.returnUrl,
    //   cancelUrl: payment.cancelUrl,
    // });

    // payment.checkoutUrl = paymentLinkResponse.checkoutUrl;
    // await payment.save();

    // console.log(paymentLinkResponse);

    // document.payment = payment._id;
    // document.checkoutUrl = paymentLinkResponse.checkoutUrl;
    // document.orderCode = payment.orderCode;
    // await document.save();
    // console.log(document);

    await StatusTracking.updateOne(
      { documentId },
      {
        status: 'completed',
        updatedAt: new Date(),
      }
    );

    const approveHistory = new ApproveHistory({
      userId,
      documentId,
      beforeStatus: 'digitalSignature',
      afterStatus: 'completed',
    });

    requestSignature.approvalStatus.notary = {
      approved: true,
      approvedAt: new Date(),
    };

    await requestSignature.save();

    await approveHistory.save();

    const user = await Document.findOne({ _id: documentId }, 'requesterInfo.email');
    if (!user) {
      console.log('This is email', user);
      throw new ApiError(httpStatus.NOT_FOUND, 'Email not found');
    }

    // await emailService.sendPaymentEmail(user.requesterInfo.email, documentId, paymentLinkResponse);

    return {
      message: 'Notary approved and signed the document successfully',
      documentId,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error approve signature by notary:', error.message);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to approve signature by notary');
  }
};

const autoForwardPendingToVerification = async () => {
  try {
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);

    // Find documents with status 'pending' and updatedAt older than 1 minute ago
    const pendingDocuments = await StatusTracking.find({
      status: 'pending',
      updatedAt: { $lte: oneMinuteAgo },
    });

    const updatePromises = pendingDocuments.map(async (tracking) => {
      // Update status to 'verification'
      const updatedTracking = {
        ...tracking.toObject(),
        status: 'verification',
        updatedAt: new Date(),
      };
      await StatusTracking.updateOne({ _id: tracking._id }, updatedTracking);

      // Record the status change in ApproveHistory
      const approveHistory = new ApproveHistory({
        userId: null,
        documentId: tracking.documentId,
        beforeStatus: 'pending',
        afterStatus: 'verification',
        updatedAt: new Date(),
      });
      await approveHistory.save();
    });

    console.log(`Auto-forwarded ${updatePromises.length} documents from 'pending' to 'verification' status`);

    await Promise.all(updatePromises);
  } catch (error) {
    console.error('Error auto-forwarding documents:', error.message);
  }
};

module.exports = {
  uploadFileToFirebase,
  createDocument,
  createStatusTracking,
  getHistoryByUserId,
  getDocumentStatus,
  getDocumentByRole,
  forwardDocumentStatus,
  getApproveHistory,
  getAllNotarizations,
  approveSignatureByUser,
  approveSignatureByNotary,
  getHistoryWithStatus,
  autoForwardPendingToVerification,
};
