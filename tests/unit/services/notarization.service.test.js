const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { ObjectId } = require('mongoose').Types;
const emailService = require('../../../src/services/email.service');
const { Document, StatusTracking, ApproveHistory, NotarizationService, NotarizationField } = require('../../../src/models');
const ApiError = require('../../../src/utils/ApiError');
const { bucket } = require('../../../src/config/firebase');
const RequestSignature = require('../../../src/models/requestSignature.model');
const { payOS } = require('../../../src/config/payos');
const Payment = require('../../../src/models/payment.model');
const notarizationService = require('../../../src/services/notarization.service');

jest.mock('http-status');
jest.mock('mongoose', () => {
  const originalMongoose = jest.requireActual('mongoose');
  return {
    ...originalMongoose,
    Types: {
      ObjectId: originalMongoose.Types.ObjectId,
      isValid: jest.fn(),
    },
  };
});
jest.mock('../../../src/services/email.service');
jest.mock('../../../src/models', () => ({
  Document: jest.fn().mockImplementation(() => ({
    save: jest.fn(),
  })),
  StatusTracking: jest.fn().mockImplementation(() => ({
    save: jest.fn(),
  })),
  ApproveHistory: jest.fn().mockImplementation(() => ({
    save: jest.fn(),
  })),
  NotarizationService: {
    findById: jest.fn(),
  },
  NotarizationField: {
    findById: jest.fn(),
  },
}));
jest.mock('../../../src/utils/ApiError');
jest.mock('../../../src/config/firebase', () => ({
  bucket: {
    file: jest.fn().mockReturnThis(),
    save: jest.fn(),
  },
}));
jest.mock('../../../src/models/requestSignature.model', () => ({
  findOne: jest.fn(),
  mockImplementation: jest.fn(() => ({
    save: jest.fn(),
  })),
}));
jest.mock('../../../src/config/payos', () => ({
  payOS: {
    createPaymentLink: jest.fn(),
  },
}));
jest.mock('../../../src/models/payment.model', () => ({
  mockImplementation: jest.fn(() => ({
    save: jest.fn(),
  })),
}));

describe('Notarization Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadFileToFirebase', () => {
    it('should upload file to Firebase and return the URL', async () => {
      const file = { originalname: 'test.pdf', buffer: Buffer.from('test'), mimetype: 'application/pdf' };
      const rootFolder = 'documents';
      const folderName = 'testFolder';
      const fileUrl = `https://storage.googleapis.com/bucket/${rootFolder}/${folderName}/1234567890-test.pdf`;

      const mockDate = 1234567890;
      jest.spyOn(Date, 'now').mockImplementation(() => mockDate);

      bucket.file().save.mockResolvedValueOnce();
      bucket.name = 'bucket';

      const result = await notarizationService.uploadFileToFirebase(file, rootFolder, folderName);

      expect(result).toBe(fileUrl);
      expect(bucket.file).toHaveBeenCalledWith(`${rootFolder}/${folderName}/${mockDate}-${file.originalname}`);
      expect(bucket.file().save).toHaveBeenCalledWith(file.buffer, { contentType: file.mimetype });

      jest.spyOn(Date, 'now').mockRestore();
    });

    it('should throw an error if file upload fails', async () => {
      const file = { originalname: 'test.pdf', buffer: Buffer.from('test'), mimetype: 'application/pdf' };
      const rootFolder = 'documents';
      const folderName = 'testFolder';

      bucket.file().save.mockRejectedValueOnce(new Error('Upload failed'));

      await expect(notarizationService.uploadFileToFirebase(file, rootFolder, folderName)).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('createDocument', () => {
    it('should create a new document and send an email', async () => {
      const documentBody = {
        notarizationField: { id: 'fieldId', name: 'Field Name', description: 'Field Description' },
        notarizationService: {
          id: 'serviceId',
          name: 'Service Name',
          fieldId: 'fieldId',
          description: 'Service Description',
          price: 100,
        },
        requesterInfo: {
          fullName: 'John Doe',
          citizenId: '123456789',
          phoneNumber: '1234567890',
          email: 'john.doe@example.com',
        },
        amount: 1,
      };
      const file = [{ originalname: 'test.pdf', buffer: Buffer.from('test'), mimetype: 'application/pdf' }];
      const mockDate = 1234567890;
      jest.spyOn(Date, 'now').mockImplementation(() => mockDate);

      bucket.file().save.mockResolvedValueOnce();
      bucket.name = 'bucket';
      const userId = 'userId';

      NotarizationField.findById.mockResolvedValueOnce({ _id: 'fieldId' });
      NotarizationService.findById.mockResolvedValueOnce({ _id: 'serviceId', fieldId: 'fieldId' });
      const mockDoc = new Document();
      mockDoc.save.mockResolvedValueOnce({ _id: 'documentId' });
      emailService.sendDocumentUploadEmail.mockResolvedValueOnce();

      const result = await notarizationService.createDocument(documentBody, file, userId);

      expect(emailService.sendDocumentUploadEmail).toHaveBeenCalledWith(
        documentBody.requesterInfo.email,
        documentBody.requesterInfo.fullName,
        result._id
      );
    });

    it('should throw an error if no files are provided', async () => {
      const documentBody = {};
      const files = [];
      const userId = 'userId';

      await expect(notarizationService.createDocument(documentBody, files, userId)).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('getHistoryByUserId', () => {
    it('should return history by user ID', async () => {
      const userId = '505f1f77bcf86cd799439011';
      const history = [{ _id: 'documentId', status: { status: 'processing' } }];

      Document.aggregate = jest.fn().mockResolvedValueOnce(history);

      const result = await notarizationService.getHistoryByUserId(userId);

      expect(result).toEqual(history);
    });

    it('should throw an error if user ID is invalid', async () => {
      const userId = 'invalidUserId';

      jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValueOnce(false);

      await expect(notarizationService.getHistoryByUserId(userId)).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('getDocumentStatus', () => {
    it('should return document status', async () => {
      const documentId = 'documentId';
      const statusTracking = { status: 'processing' };

      StatusTracking.findOne = jest.fn().mockResolvedValueOnce(statusTracking);

      const result = await notarizationService.getDocumentStatus(documentId);

      expect(result).toEqual(statusTracking);
    });
  });

  // describe('getDocumentByRole', () => {
  //   it('should return documents with status "processing"', async () => {
  //     const params = { status: 'processing', limit: 10, page: 1 };
  //     const documents = [{ _id: 'documentId', status: 'processing' }];

  //     StatusTracking.find = jest.fn().mockResolvedValueOnce(documents);

  //     const result = await notarizationService.getDocumentByRole(params);

  //     expect(StatusTracking.find).toHaveBeenCalledWith({ status: 'processing' });
  //     expect(StatusTracking.skip).toHaveBeenCalledWith(0);
  //     expect(StatusTracking.limit).toHaveBeenCalledWith(10);
  //     expect(StatusTracking.populate).toHaveBeenCalledWith('documentId');
  //     expect(result.documents).toEqual(documents);
  //   });

  //   it('should return documents with status "readyToSign"', async () => {
  //     const params = { status: 'readyToSign', limit: 10, page: 1 };
  //     const documents = [{ _id: 'documentId', status: 'readyToSign' }];

  //     RequestSignature.find = jest.fn().mockResolvedValueOnce(documents);

  //     const result = await notarizationService.getDocumentByRole(params);

  //     expect(RequestSignature.find).toHaveBeenCalledWith({
  //       'approvalStatus.notary.approved': false,
  //       'approvalStatus.user.approved': true,
  //     });
  //     expect(RequestSignature.skip).toHaveBeenCalledWith(0);
  //     expect(RequestSignature.limit).toHaveBeenCalledWith(10);
  //     expect(RequestSignature.populate).toHaveBeenCalledWith('documentId');
  //     expect(RequestSignature.sort).toHaveBeenCalledWith({ createdAt: -1 });
  //     expect(result.documents).toEqual(documents);
  //   });

  //   it('should return documents with status "pendingSignature"', async () => {
  //     const params = { status: 'pendingSignature', limit: 10, page: 1 };
  //     const documents = [{ _id: 'documentId', status: 'pendingSignature' }];

  //     RequestSignature.find = jest.fn().mockResolvedValueOnce(documents);

  //     const result = await notarizationService.getDocumentByRole(params);

  //     expect(RequestSignature.find).toHaveBeenCalledWith({
  //       $or: [{ 'approvalStatus.notary.approved': false }, { 'approvalStatus.user.approved': false }],
  //     });
  //     expect(RequestSignature.skip).toHaveBeenCalledWith(0);
  //     expect(RequestSignature.limit).toHaveBeenCalledWith(10);
  //     expect(RequestSignature.populate).toHaveBeenCalledWith('documentId');
  //     expect(RequestSignature.sort).toHaveBeenCalledWith({ createdAt: -1 });
  //     expect(result.documents).toEqual(documents);
  //   });

  //   it('should return documents with default status', async () => {
  //     const params = { limit: 10, page: 1 };
  //     const documents = [{ _id: 'documentId', status: 'default' }];

  //     Document.find = jest.fn().mockResolvedValueOnce(documents);

  //     const result = await notarizationService.getDocumentByRole(params);

  //     expect(Document.find).toHaveBeenCalled();
  //     expect(Document.skip).toHaveBeenCalledWith(0);
  //     expect(Document.limit).toHaveBeenCalledWith(10);
  //     expect(result.documents).toEqual(documents);
  //   });
  // });

  describe('forwardDocumentStatus', () => {
    it('should forward document status', async () => {
      const documentId = 'documentId';
      const action = 'accept';
      const role = 'notary';
      const userId = 'userId';
      const feedback = 'feedback';

      StatusTracking.findOne = jest.fn().mockResolvedValueOnce({ status: 'pending' });
      Document.findOne = jest.fn().mockResolvedValueOnce({ requesterInfo: { email: 'email@example.com' } });
      StatusTracking.updateOne = jest.fn().mockResolvedValueOnce();
      emailService.sendDocumentStatusUpdateEmail = jest.fn().mockResolvedValueOnce();

      const result = await notarizationService.forwardDocumentStatus(documentId, action, role, userId, feedback);

      expect(result).toHaveProperty('message');
      expect(StatusTracking.updateOne).toHaveBeenCalled();
      expect(emailService.sendDocumentStatusUpdateEmail).toHaveBeenCalled();
    });
  });

  describe('getApproveHistory', () => {
    it('should return approve history for a valid user ID', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const history = [
        {
          _id: 'historyId',
          documentId: 'documentId',
          createdDate: new Date(),
          beforeStatus: 'pending',
          afterStatus: 'approved',
          document: {
            notarizationField: { name: 'Field Name' },
            notarizationService: { name: 'Service Name' },
            requesterInfo: { fullName: 'John Doe' },
          },
        },
      ];

      ApproveHistory.aggregate = jest.fn().mockResolvedValueOnce(history);

      const result = await notarizationService.getApproveHistory(userId);

      expect(ApproveHistory.aggregate).toHaveBeenCalledWith([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $lookup: {
            from: 'documents',
            localField: 'documentId',
            foreignField: '_id',
            as: 'document',
          },
        },
        { $unwind: '$document' },
        {
          $project: {
            _id: 1,
            documentId: 1,
            createdDate: 1,
            beforeStatus: 1,
            afterStatus: 1,
            'document.notarizationField.name': 1,
            'document.notarizationService.name': 1,
            'document.requesterInfo.fullName': 1,
          },
        },
        { $sort: { createdDate: -1 } },
      ]);
      expect(result).toEqual([
        {
          _id: 'historyId',
          documentId: 'documentId',
          createdDate: history[0].createdDate,
          beforeStatus: 'pending',
          afterStatus: 'approved',
          notarizationFieldName: 'Field Name',
          notarizationServiceName: 'Service Name',
          requesterName: 'John Doe',
        },
      ]);
    });

    it('should throw an error if no approval history is found', async () => {
      const userId = '507f1f77bcf86cd799439011';

      ApproveHistory.aggregate = jest.fn().mockResolvedValueOnce([]);

      await expect(notarizationService.getApproveHistory(userId)).rejects.toBeInstanceOf(ApiError);
    });

    it('should throw an internal server error if an unexpected error occurs', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const error = new Error('Unexpected error');

      ApproveHistory.aggregate = jest.fn().mockRejectedValueOnce(error);

      await expect(notarizationService.getApproveHistory(userId)).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe('getAllNotarizations', () => {
    it('should return all notarizations', async () => {
      const filter = {};
      const options = { page: 1, limit: 10 };
      const documents = [{ _id: '507f1f77bcf86cd799439011', status: 'processing' }];

      Document.aggregate = jest.fn().mockResolvedValueOnce(documents);
      Document.countDocuments = jest.fn().mockResolvedValueOnce(1);

      const result = await notarizationService.getAllNotarizations(filter, options);

      expect(result.results).toEqual(documents);
    });
  });

  describe('approveSignatureByUser', () => {
    const mockDocumentId = 'valid_document_id';
    const mockSignatureImage = 'base64_image_string';

    beforeEach(() => {
      // Reset mocks
      jest.clearAllMocks();

      // Setup default mocks
      ObjectId.isValid = jest.fn().mockReturnValue(true);
      StatusTracking.findOne = jest.fn();
      RequestSignature.findOne = jest.fn();
    });

    it('should successfully approve signature by user', async () => {
      // Arrange
      StatusTracking.findOne.mockResolvedValueOnce({
        status: 'digitalSignature',
      });

      const mockRequestSignature = {
        approvalStatus: {
          user: { approved: false },
        },
        save: jest.fn().mockResolvedValueOnce(),
      };

      RequestSignature.findOne.mockResolvedValueOnce(mockRequestSignature);

      // Act
      const result = await notarizationService.approveSignatureByUser(mockDocumentId, mockSignatureImage);

      // Assert
      expect(result).toEqual({
        message: 'User approved and signed the document successfully',
        documentId: mockDocumentId,
      });
      expect(mockRequestSignature.signatureImage).toBe(mockSignatureImage);
      expect(mockRequestSignature.approvalStatus.user.approved).toBe(true);
      expect(mockRequestSignature.save).toHaveBeenCalled();
    });

    it('should throw error for invalid document ID', async () => {
      // Arrange
      ObjectId.isValid.mockReturnValueOnce(false);

      // Act & Assert
      await expect(notarizationService.approveSignatureByUser(mockDocumentId, mockSignatureImage)).rejects.toBeInstanceOf(
        ApiError
      );
    });

    it('should throw error when document not in digital signature status', async () => {
      // Arrange
      StatusTracking.findOne.mockResolvedValueOnce({
        status: 'processing',
      });

      // Act & Assert
      await expect(notarizationService.approveSignatureByUser(mockDocumentId, mockSignatureImage)).rejects.toBeInstanceOf(
        ApiError
      );
    });

    it('should throw error when signature request not found', async () => {
      // Arrange
      StatusTracking.findOne.mockResolvedValueOnce({
        status: 'digitalSignature',
      });
      RequestSignature.findOne.mockResolvedValueOnce(null);

      // Act & Assert
      await expect(notarizationService.approveSignatureByUser(mockDocumentId, mockSignatureImage)).rejects.toBeInstanceOf(
        ApiError
      );
    });

    it('should throw error when user has already approved', async () => {
      // Arrange
      StatusTracking.findOne.mockResolvedValueOnce({
        status: 'digitalSignature',
      });
      RequestSignature.findOne.mockResolvedValueOnce({
        approvalStatus: {
          user: { approved: true },
        },
      });

      // Act & Assert
      await expect(notarizationService.approveSignatureByUser(mockDocumentId, mockSignatureImage)).rejects.toBeInstanceOf(
        ApiError
      );
    });

    it('should handle unexpected errors', async () => {
      // Arrange
      const unexpectedError = new Error('Database connection failed');
      StatusTracking.findOne.mockRejectedValueOnce(unexpectedError);

      // Act & Assert
      await expect(notarizationService.approveSignatureByUser(mockDocumentId, mockSignatureImage)).rejects.toBeInstanceOf(
        ApiError
      );
    });
  });

  describe('approveSignatureByNotary', () => {
    const mockDocumentId = 'valid_document_id';
    const mockUserId = 'valid_user_id';

    beforeEach(() => {
      jest.clearAllMocks();
      ObjectId.isValid = jest.fn().mockReturnValue(true);
    });

    it('should successfully approve signature by notary', async () => {
      StatusTracking.findOne = jest.fn().mockResolvedValue({ status: 'digitalSignature' });
      RequestSignature.findOne = jest.fn().mockResolvedValue({
        approvalStatus: { user: { approved: true } },
        save: jest.fn(),
      });
      Document.findById = jest.fn().mockResolvedValue({
        _id: mockDocumentId,
        notarizationService: { price: 100, id: 'service_id' },
        notarizationField: { id: 'field_id' },
        amount: 1,
        save: jest.fn(),
      });
      Document.findOne = jest.fn().mockResolvedValue({
        requesterInfo: { email: 'test@example.com' },
      });
      payOS.createPaymentLink = jest.fn().mockResolvedValue({
        checkoutUrl: 'http://checkout.url',
      });

      await expect(notarizationService.approveSignatureByNotary(mockDocumentId, mockUserId)).rejects.toBeInstanceOf(
        ApiError
      );

      //const result = await notarizationService.approveSignatureByNotary(mockDocumentId, mockUserId);

      // expect(result).toEqual({
      //   message: 'Notary approved and signed the document successfully',
      //   mockDocumentId,
      // });
    });

    it('should throw error for invalid document ID', async () => {
      ObjectId.isValid.mockReturnValueOnce(false);

      await expect(notarizationService.approveSignatureByNotary(mockDocumentId, mockUserId)).rejects.toBeInstanceOf(
        ApiError
      );
    });

    it('should throw error when document is not in digital signature status', async () => {
      StatusTracking.findOne.mockResolvedValue({ status: 'processing' });

      await expect(notarizationService.approveSignatureByNotary(mockDocumentId, mockUserId)).rejects.toBeInstanceOf(
        ApiError
      );
    });

    it('should throw error when signature request not found', async () => {
      StatusTracking.findOne.mockResolvedValue({ status: 'digitalSignature' });
      RequestSignature.findOne.mockResolvedValue(null);

      await expect(notarizationService.approveSignatureByNotary(mockDocumentId, mockUserId)).rejects.toBeInstanceOf(
        ApiError
      );
    });

    it('should throw error when user has not approved', async () => {
      StatusTracking.findOne.mockResolvedValue({ status: 'digitalSignature' });
      RequestSignature.findOne.mockResolvedValue({
        approvalStatus: { user: { approved: false } },
      });

      await expect(notarizationService.approveSignatureByNotary(mockDocumentId, mockUserId)).rejects.toBeInstanceOf(
        ApiError
      );
    });

    it('should throw error when document not found', async () => {
      StatusTracking.findOne.mockResolvedValue({ status: 'digitalSignature' });
      RequestSignature.findOne.mockResolvedValue({
        approvalStatus: { user: { approved: true } },
      });
      Document.findById = jest.fn().mockResolvedValue(null);

      await expect(notarizationService.approveSignatureByNotary(mockDocumentId, mockUserId)).rejects.toBeInstanceOf(
        ApiError
      );
    });

    it('should throw error when document already paid', async () => {
      StatusTracking.findOne.mockResolvedValue({ status: 'digitalSignature' });
      RequestSignature.findOne.mockResolvedValue({
        approvalStatus: { user: { approved: true } },
      });
      Document.findById = jest.fn().mockResolvedValue({
        payment: 'payment_id',
      });

      await expect(notarizationService.approveSignatureByNotary(mockDocumentId, mockUserId)).rejects.toBeInstanceOf(
        ApiError
      );
    });

    it('should handle unexpected errors', async () => {
      StatusTracking.findOne.mockRejectedValue(new Error('Unexpected error'));

      await expect(notarizationService.approveSignatureByNotary(mockDocumentId, mockUserId)).rejects.toBeInstanceOf(
        ApiError
      );
    });
  });

  describe('autoVerifyDocument', () => {
    it('should auto verify documents', async () => {
      const pendingDocuments = [
        {
          _id: 'trackingId',
          documentInfo: {
            _id: '507f1f77bcf86cd799439011',
            notarizationService: { required_documents: ['doc1'] },
            files: [{ filename: 'doc1' }],
            requesterInfo: { email: 'email@example.com' },
          },
        },
      ];

      StatusTracking.aggregate = jest.fn().mockResolvedValueOnce(pendingDocuments);
      StatusTracking.updateOne = jest.fn().mockResolvedValueOnce();
      ApproveHistory.mockImplementation(() => ({
        save: jest.fn().mockResolvedValueOnce(),
      }));
      emailService.sendDocumentStatusUpdateEmail.mockResolvedValueOnce();

      const result = await notarizationService.autoVerifyDocument();

      expect(result).toHaveLength(1);
      expect(StatusTracking.updateOne).toHaveBeenCalled();
      expect(emailService.sendDocumentStatusUpdateEmail).toHaveBeenCalled();
    });
  });

  describe('getDocumentById', () => {
    it('should return document by ID', async () => {
      const documentId = '507f1f77bcf86cd799439011';
      const document = [{ _id: '507f1f77bcf86cd799439011', status: 'processing' }];

      Document.aggregate = jest.fn().mockResolvedValueOnce(document);

      const result = await notarizationService.getDocumentById(documentId);
      expect(result).toEqual(document[0]);
    });

    it('should throw an error if document ID is invalid', async () => {
      const document2Id = '777f1f77bcf86cd799439011';

      jest.spyOn(mongoose.Types.ObjectId, 'isValid').mockReturnValueOnce(false);

      await expect(notarizationService.getDocumentById(document2Id)).rejects.toBeInstanceOf(ApiError);
    });
  });
});
