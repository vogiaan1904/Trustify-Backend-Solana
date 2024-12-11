// tests/unit/services/notarization.service.test.js

const mongoose = require('mongoose');
const httpStatus = require('http-status');
const { bucket } = require('../../../src/config/firebase');
const emailService = require('../../../src/services/email.service');
const notarizationService = require('../../../src/services/notarization.service');
const {
  Document,
  StatusTracking,
  ApproveHistory,
  NotarizationService,
  NotarizationField,
  RequestSignature,
  Payment,
} = require('../../../src/models');
const { payOS } = require('../../../src/config/payos');

jest.mock('../../../src/config/config', () => ({
  env: 'test',
  firebase: {
    bucket: 'test-bucket',
  },
  mongodb: {
    url: 'mongodb://localhost:27017/test',
  },
  email: {
    smtp: {
      host: 'smtp.test.com',
      port: 587,
      auth: {
        user: 'test@example.com',
        pass: 'password123',
      },
    },
    from: 'noreply@test.com',
  },
}));

// Add mock for toJSON plugin
jest.mock('../../../src/models/plugins/toJSON.plugin', () => ({
  toJSON: jest.fn(),
}));

// Update models mock
jest.mock('../../../src/models', () => ({
  Document: {
    aggregate: jest.fn(),
    findById: jest.fn(),
    findOne: jest.fn(),
    prototype: {
      save: jest.fn(),
    },
  },
  StatusTracking: {
    findOne: jest.fn(),
    updateOne: jest.fn(),
    aggregate: jest.fn(),
    prototype: {
      save: jest.fn(),
    },
  },
  ApproveHistory: {
    prototype: {
      save: jest.fn(),
    },
  },
  NotarizationService: {
    findById: jest.fn(),
  },
  NotarizationField: {
    findById: jest.fn(),
  },
  RequestSignature: {
    findOne: jest.fn(),
  },
  Payment: {
    prototype: {
      save: jest.fn(),
    },
  },
}));

// Mock ApiError
jest.mock('../../../src/utils/ApiError', () => {
  return jest.fn().mockImplementation(() => {
    return { isOperational: true };
  });
});

// Mock firebase bucket upload success
jest.mock('../../../src/config/firebase', () => ({
  bucket: {
    file: jest.fn().mockReturnValue({
      save: jest.fn().mockResolvedValue(true),
    }),
    name: 'test-bucket',
  },
}));

// Update models mock with successful returns
jest.mock('../../../src/models', () => ({
  Document: {
    aggregate: jest.fn().mockResolvedValue([{ _id: 'doc1' }]),
    findById: jest.fn().mockResolvedValue({
      _id: 'doc1',
      notarizationService: { price: 100 },
      amount: 1,
      save: jest.fn().mockResolvedValue(true),
      requesterInfo: { email: 'test@example.com' },
    }),
    findOne: jest.fn().mockResolvedValue({
      _id: 'doc1',
      requesterInfo: { email: 'test@example.com' },
    }),
    prototype: {
      save: jest.fn().mockResolvedValue({
        _id: 'doc1',
        requesterInfo: { email: 'test@example.com' },
      }),
    },
  },
  StatusTracking: {
    findOne: jest.fn().mockResolvedValue({
      status: 'digitalSignature',
      save: jest.fn().mockResolvedValue(true),
    }),
    updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    aggregate: jest.fn().mockResolvedValue([
      {
        _id: 'doc1',
        documentInfo: {
          notarizationService: {
            required_documents: ['doc1'],
          },
          files: [{ filename: 'doc1' }],
          requesterInfo: { email: 'test@example.com' },
        },
      },
    ]),
    prototype: {
      save: jest.fn().mockResolvedValue(true),
    },
  },
  NotarizationService: {
    findById: jest.fn().mockResolvedValue({
      fieldId: 'field1',
      _id: 'service1',
      price: 100,
    }),
  },
  NotarizationField: {
    findById: jest.fn().mockResolvedValue({ _id: 'field1' }),
  },
  RequestSignature: {
    findOne: jest.fn().mockResolvedValue({
      approvalStatus: {
        user: { approved: true },
        notary: {},
      },
      save: jest.fn().mockResolvedValue(true),
    }),
  },
  Payment: {
    prototype: {
      save: jest.fn().mockResolvedValue(true),
    },
  },
  ApproveHistory: {
    prototype: {
      save: jest.fn().mockResolvedValue(true),
    },
  },
}));

// Mock payOS
jest.mock('../../../src/config/payos', () => ({
  payOS: {
    createPaymentLink: jest.fn().mockResolvedValue({
      checkoutUrl: 'http://test.com',
    }),
  },
}));
// Mock all dependencies
jest.mock('../../../src/config/firebase');
jest.mock('../../../src/services/email.service');
jest.mock('../../../src/models');
jest.mock('../../../src/config/payos');
jest.mock('mongoose');

describe('Notarization Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadFileToFirebase', () => {
    it('should upload file successfully', async () => {
      const mockFile = {
        originalname: 'test.pdf',
        buffer: Buffer.from('test'),
        mimetype: 'application/pdf',
      };

      const mockFileRef = {
        save: jest.fn().mockResolvedValue(true),
      };

      bucket.file.mockReturnValue(mockFileRef);
      bucket.name = 'test-bucket';

      const result = await notarizationService.uploadFileToFirebase(mockFile, 'documents', 'folder1');

      expect(result).toMatch(/^https:\/\/storage.googleapis.com\/test-bucket\/documents\/folder1\/.+/);
      expect(bucket.file).toHaveBeenCalled();
      expect(mockFileRef.save).toHaveBeenCalledWith(mockFile.buffer, { contentType: mockFile.mimetype });
    });
  });

  describe('createDocument', () => {
    it('should create document successfully', async () => {
      const mockFiles = [
        {
          originalname: 'test.pdf',
          buffer: Buffer.from('test'),
          mimetype: 'application/pdf',
        },
      ];

      const mockDocumentBody = {
        notarizationField: { id: 'field1' },
        notarizationService: { id: 'service1' },
        requesterInfo: {
          email: 'test@example.com',
          fullName: 'Test User',
        },
        amount: 1,
      };

      NotarizationField.findById.mockResolvedValue({ _id: 'field1' });
      NotarizationService.findById.mockResolvedValue({ fieldId: 'field1', _id: 'service1' });
      Document.prototype.save.mockResolvedValue(true);

      const result = await notarizationService.createDocument(mockDocumentBody, mockFiles, 'user1');

      expect(result).toBeDefined();
      expect(emailService.sendDocumentUploadEmail).toHaveBeenCalled();
    });
  });

  describe('getHistoryByUserId', () => {
    it('should get history successfully', async () => {
      const mockHistory = [{ _id: 'hist1' }];
      mongoose.Types.ObjectId.isValid.mockReturnValue(true);
      Document.aggregate.mockResolvedValue(mockHistory);

      const result = await notarizationService.getHistoryByUserId('user1');

      expect(result).toEqual(mockHistory);
      expect(Document.aggregate).toHaveBeenCalled();
    });
  });

  describe('forwardDocumentStatus', () => {
    it('should forward status successfully', async () => {
      StatusTracking.findOne.mockResolvedValue({ status: 'pending' });
      Document.findOne.mockResolvedValue({
        requesterInfo: { email: 'test@example.com' },
      });
      ApproveHistory.prototype.save.mockResolvedValue(true);
      StatusTracking.updateOne.mockResolvedValue(true);

      const result = await notarizationService.forwardDocumentStatus('doc1', 'accept', 'notary', 'user1');

      expect(result.message).toContain('Document status updated');
      expect(emailService.sendDocumentStatusUpdateEmail).toHaveBeenCalled();
    });
  });

  describe('approveSignatureByUser', () => {
    it('should approve signature successfully', async () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(true);
      StatusTracking.findOne.mockResolvedValue({ status: 'digitalSignature' });
      RequestSignature.findOne.mockResolvedValue({
        approvalStatus: { user: {} },
        save: jest.fn().mockResolvedValue(true),
      });

      const result = await notarizationService.approveSignatureByUser('doc1', 'signature');

      expect(result.message).toContain('successfully');
    });
  });

  describe('approveSignatureByNotary', () => {
    it('should approve notary signature successfully', async () => {
      mongoose.Types.ObjectId.isValid.mockReturnValue(true);
      StatusTracking.findOne.mockResolvedValue({ status: 'digitalSignature' });
      RequestSignature.findOne.mockResolvedValue({
        approvalStatus: { user: { approved: true } },
        save: jest.fn().mockResolvedValue(true),
      });
      Document.findById.mockResolvedValue({
        notarizationService: { price: 100 },
        amount: 1,
        save: jest.fn().mockResolvedValue(true),
      });
      Payment.prototype.save.mockResolvedValue(true);
      payOS.createPaymentLink.mockResolvedValue({ checkoutUrl: 'http://test.com' });

      const result = await notarizationService.approveSignatureByNotary('doc1', 'user1');

      expect(result.message).toContain('successfully');
      expect(emailService.sendPaymentEmail).toHaveBeenCalled();
    });
  });

  describe('autoVerifyDocument', () => {
    it('should verify documents automatically', async () => {
      const mockDocuments = [
        {
          _id: 'doc1',
          documentInfo: {
            notarizationService: {
              required_documents: ['doc1', 'doc2'],
            },
            files: [{ filename: 'doc1' }, { filename: 'doc2' }],
            requesterInfo: { email: 'test@example.com' },
          },
        },
      ];

      StatusTracking.aggregate.mockResolvedValue(mockDocuments);
      StatusTracking.updateOne.mockResolvedValue(true);
      ApproveHistory.prototype.save.mockResolvedValue(true);

      const result = await notarizationService.autoVerifyDocument();

      expect(result).toBeDefined();
      expect(emailService.sendDocumentStatusUpdateEmail).toHaveBeenCalled();
    });
  });

  describe('getDocumentById', () => {
    it('should get document successfully', async () => {
      const mockDocument = [{ _id: 'doc1' }];
      mongoose.Types.ObjectId.isValid.mockReturnValue(true);
      Document.aggregate.mockResolvedValue(mockDocument);

      const result = await notarizationService.getDocumentById('doc1');

      expect(result).toEqual(mockDocument[0]);
    });
  });
});
