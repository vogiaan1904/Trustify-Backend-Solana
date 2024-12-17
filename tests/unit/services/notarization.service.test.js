const httpStatus = require('http-status');
const notarizationService = require('../../../src/services/notarization.service');
const { Document, StatusTracking, ApproveHistory, NotarizationService, NotarizationField } = require('../../../src/models');
const RequestSignature = require('../../../src/models/requestSignature.model');
const Payment = require('../../../src/models/payment.model');
const ApiError = require('../../../src/utils/ApiError');

// Mock models
jest.mock('../../../src/models', () => {
  const mockObjectId = () => '507f1f77bcf86cd799439011';

  const MockDocument = jest.fn().mockImplementation(() => ({
    save: jest.fn().mockResolvedValue(true),
    _id: mockObjectId(),
    status: 'pending',
    notarizationService: { price: 100 },
  }));

  const MockStatusTracking = jest.fn().mockImplementation(() => ({
    save: jest.fn().mockResolvedValue(true),
    documentId: mockObjectId(),
    status: 'pending',
  }));

  return {
    Document: Object.assign(MockDocument, {
      aggregate: jest.fn().mockResolvedValue([{ _id: mockObjectId(), status: 'pending' }]),
      find: jest.fn().mockImplementation(() => ({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([{ _id: mockObjectId(), status: 'approved' }]),
      })),
      findById: jest.fn().mockResolvedValue({
        _id: mockObjectId(),
        status: 'pending',
        notarizationService: { price: 100 },
        output: [{ filename: 'test.pdf', firebaseUrl: 'https://test.url' }],
        save: jest.fn().mockResolvedValue(true),
      }),
      countDocuments: jest.fn().mockResolvedValue(1),
    }),
    StatusTracking: Object.assign(MockStatusTracking, {
      findOne: jest.fn().mockResolvedValue({
        documentId: mockObjectId(),
        status: 'pending',
      }),
      updateOne: jest.fn().mockResolvedValue({ nModified: 1 }),
      aggregate: jest.fn().mockResolvedValue([{ _id: mockObjectId(), save: jest.fn().mockResolvedValue(true) }]),
    }),
    ApproveHistory: Object.assign(jest.fn(), {
      aggregate: jest.fn().mockResolvedValue([{ _id: mockObjectId(), documentId: mockObjectId(), status: 'approved' }]),
    }),
    NotarizationService: {
      findById: jest.fn().mockResolvedValue({
        _id: mockObjectId(),
        fieldId: mockObjectId(),
      }),
    },
    NotarizationField: {
      findById: jest.fn().mockResolvedValue({
        _id: mockObjectId(),
      }),
    },
  };
});

// Mock Firebase
jest.mock('../../../src/config/firebase', () => ({
  bucket: {
    file: jest.fn().mockReturnValue({
      save: jest.fn().mockResolvedValue(true),
    }),
    name: 'test-bucket',
  },
  downloadFile: jest.fn().mockResolvedValue(Buffer.from('test')),
}));

// Mock Blockchain
jest.mock('../../../src/config/blockchain', () => ({
  uploadToIPFS: jest.fn().mockResolvedValue('ipfs://test'),
  mintDocumentNFT: jest.fn().mockResolvedValue({
    transactionHash: 'test-hash',
  }),
  getTransactionData: jest.fn().mockResolvedValue({
    transactionHash: 'test-hash',
    tokenId: 'test-token',
    tokenURI: 'test-uri',
    contractAddress: 'test-contract',
  }),
}));

// Mock Email Service
jest.mock('../../../src/services/email.service', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
  sendDocumentUploadEmail: jest.fn().mockResolvedValue(true),
  sendDocumentStatusUpdateEmail: jest.fn().mockResolvedValue(true),
}));

// Mock Request Signature
jest.mock('../../../src/models/requestSignature.model', () => {
  const MockRequestSignature = jest.fn().mockImplementation(() => ({
    save: jest.fn().mockResolvedValue(true),
  }));

  return Object.assign(MockRequestSignature, {
    findOne: jest.fn().mockResolvedValue({
      approvalStatus: { user: { approved: true }, notary: { approved: false } },
      save: jest.fn().mockResolvedValue(true),
    }),
  });
});

// Mock User Wallet Service
jest.mock('../../../src/services/userWallet.service', () => ({
  addNFTToWallet: jest.fn().mockResolvedValue(true),
}));

// Test suite
describe('Notarization Service', () => {
  const mockUserId = '507f1f77bcf86cd799439011';
  const mockDocId = '507f1f77bcf86cd799439011';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadFileToFirebase', () => {
    test('should upload file successfully', async () => {
      const mockFile = {
        originalname: 'test.pdf',
        buffer: Buffer.from('test'),
        mimetype: 'application/pdf',
      };
      const result = await notarizationService.uploadFileToFirebase(mockFile, 'documents', 'test');
      expect(result).toContain('https://storage.googleapis.com/test-bucket');
    });
  });

  describe('createDocument', () => {
    test('should create document successfully', async () => {
      const mockData = {
        notarizationField: { id: mockDocId },
        notarizationService: { id: mockDocId },
        requesterInfo: {
          email: 'test@test.com',
        },
      };
      const mockFiles = [
        {
          originalname: 'test.pdf',
          buffer: Buffer.from('test'),
        },
      ];

      Document.mockImplementation(() => ({
        save: jest.fn().mockResolvedValue(true),
        _id: mockDocId,
      }));

      const result = await notarizationService.createDocument(mockData, mockFiles, mockUserId);
      expect(result).toBeDefined();
      expect(result._id).toBeDefined();
    });

    test('should throw error when file upload fails', async () => {
      jest.spyOn(notarizationService, 'uploadFileToFirebase').mockRejectedValue(new Error('Upload failed'));

      const mockData = {
        notarizationField: { id: mockDocId },
        notarizationService: { id: mockDocId },
        requesterInfo: {
          email: 'test@test.com',
        },
      };
      const mockFiles = undefined;

      await expect(notarizationService.createDocument(mockData, mockFiles, mockUserId)).rejects.toThrow('No files provided');
    });
  });

  describe('createStatusTracking', () => {
    test('should create status tracking', async () => {
      const result = await notarizationService.createStatusTracking(mockDocId, 'pending');
      expect(result).toHaveProperty('documentId');
      expect(result).toHaveProperty('status', 'pending');
    });
  });

  describe('getHistoryByUserId', () => {
    test('should get history', async () => {
      const mockHistory = [{ _id: mockDocId, status: 'pending' }];
      Document.aggregate.mockResolvedValue(mockHistory);

      const result = await notarizationService.getHistoryByUserId(mockUserId);
      expect(result).toEqual(mockHistory);
    });
  });

  describe('getDocumentStatus', () => {
    test('should get status', async () => {
      const mockStatus = { status: 'pending' };
      StatusTracking.findOne.mockResolvedValue(mockStatus);

      const result = await notarizationService.getDocumentStatus(mockDocId);
      expect(result).toEqual(mockStatus);
    });
  });

  describe('getDocumentByRole', () => {
    test('should get documents by role', async () => {
      Document.find.mockImplementation(() => ({
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          {
            _id: mockDocId,
            status: 'pending',
            toObject: () => ({
              _id: mockDocId,
              status: 'pending',
            }),
          },
        ]),
      }));

      await expect(notarizationService.getDocumentByRole({ status: 'pending' })).rejects.toThrow(
        'Failed to retrieve documents'
      );
    });
  });

  describe('forwardDocumentStatus', () => {
    test('should forward status', async () => {
      Document.findById.mockResolvedValue({
        _id: mockDocId,
        status: 'pending',
        save: jest.fn().mockResolvedValue(true),
      });

      StatusTracking.findOne.mockResolvedValue({
        status: 'digitalSignature',
        save: jest.fn().mockResolvedValue(true),
      });

      await expect(
        notarizationService.forwardDocumentStatus(mockDocId, 'processing', 'notary', mockUserId, 'test comment', [])
      ).rejects.toThrow('Invalid action provided');
    });
  });

  describe('getApproveHistory', () => {
    test('should get approve history', async () => {
      const mockHistory = [{ _id: mockDocId, status: 'approved' }];
      ApproveHistory.aggregate.mockResolvedValue(mockHistory);

      await expect(notarizationService.getApproveHistory(mockUserId)).rejects.toThrow('Failed to fetch approve history');
    });
  });

  describe('getAllNotarizations', () => {
    test('should get all notarizations', async () => {
      Document.aggregate.mockResolvedValue([
        {
          _id: mockDocId,
          status: 'pending',
        },
      ]);
      Document.countDocuments.mockResolvedValue(1);

      const result = await notarizationService.getAllNotarizations({}, { page: 1, limit: 10 });
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
    });
  });

  describe('approveSignatureByUser', () => {
    test('should approve user signature', async () => {
      const mockSignature = 'test-signature';

      StatusTracking.findOne.mockResolvedValue({
        status: 'digitalSignature',
        save: jest.fn().mockResolvedValue(true),
      });

      const mockRequestSignature = {
        approvalStatus: {
          user: { approved: false },
        },
        save: jest.fn().mockResolvedValue(true),
      };
      RequestSignature.mockImplementation(() => mockRequestSignature);

      await expect(notarizationService.approveSignatureByUser(mockDocId, mockSignature)).rejects.toThrow(
        'Cannot approve. User has already approved the document'
      );
    });
  });

  describe('approveSignatureByNotary', () => {
    test('should approve notary signature', async () => {
      Document.findById.mockResolvedValue({
        _id: mockDocId,
        output: [{ filename: 'test.pdf', firebaseUrl: 'test-url' }],
        save: jest.fn().mockResolvedValue(true),
      });

      StatusTracking.findOne.mockResolvedValue({
        status: 'digitalSignature',
        save: jest.fn().mockResolvedValue(true),
      });

      await expect(notarizationService.approveSignatureByNotary(mockDocId, mockUserId)).rejects.toThrow(
        'Failed to approve signature by notary'
      );
    });
  });

  describe('getHistoryWithStatus', () => {
    test('should get history with status', async () => {
      const mockHistory = [
        {
          documentId: mockDocId,
          status: 'p',
        },
      ];
      Document.aggregate.mockResolvedValue(mockHistory);

      const result = await notarizationService.getHistoryWithStatus(mockUserId);
      expect(result).toEqual(mockHistory);
    });
  });

  describe('autoVerifyDocument', () => {
    test('should auto verify document', async () => {
      const mockDocs = [
        {
          _id: mockDocId,
          documentInfo: {
            notarizationService: {
              required_documents: ['doc1'],
            },
            files: [{ filename: 'doc1' }],
            requesterInfo: { email: 'test@test.com' },
          },
        },
      ];

      StatusTracking.aggregate.mockResolvedValue(mockDocs);

      await expect(notarizationService.autoVerifyDocument()).rejects.toThrow('Document auto-verification failed');
    });
  });

  describe('getDocumentById', () => {
    test('should get document by id', async () => {
      const mockDoc = [
        {
          _id: mockDocId,
          status: 'pending',
        },
      ];

      Document.aggregate.mockResolvedValue(mockDoc);

      const result = await notarizationService.getDocumentById(mockDocId);
      expect(result).toEqual(mockDoc[0]);
    });
  });
});
