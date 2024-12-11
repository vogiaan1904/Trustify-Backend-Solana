const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const RequestSessionSignature = require('../../../src/models/requestSessionSignature.model');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany();
  }
});

describe('RequestSessionSignature Model Test Suite', () => {
  let validRequestSessionSignatureData;

  beforeEach(() => {
    validRequestSessionSignatureData = {
      sessionId: new mongoose.Types.ObjectId(),
      signatureImage: 'https://example.com/signature.png',
      approvalStatus: {
        notary: {
          approved: false,
          approvedAt: null,
        },
        user: {
          approved: false,
          approvedAt: null,
        },
      },
    };
  });

  test('should create & save request session signature successfully', async () => {
    const validRequestSessionSignature = new RequestSessionSignature(validRequestSessionSignatureData);
    const savedRequestSessionSignature = await validRequestSessionSignature.save();

    expect(savedRequestSessionSignature._id).toBeDefined();
    expect(savedRequestSessionSignature.sessionId).toBe(validRequestSessionSignatureData.sessionId);
    expect(savedRequestSessionSignature.signatureImage).toBe(validRequestSessionSignatureData.signatureImage);
    expect(savedRequestSessionSignature.approvalStatus.notary.approved).toBe(
      validRequestSessionSignatureData.approvalStatus.notary.approved
    );
    expect(savedRequestSessionSignature.approvalStatus.user.approved).toBe(
      validRequestSessionSignatureData.approvalStatus.user.approved
    );
  });

  test('should fail to save without required fields', async () => {
    const requestSessionSignatureWithoutRequired = new RequestSessionSignature({});
    let err;

    try {
      await requestSessionSignatureWithoutRequired.save();
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(err.errors.sessionId).toBeDefined();
    expect(err.errors.signatureImage).toBeDefined();
  });

  test('should set default approval status correctly', async () => {
    const validRequestSessionSignature = new RequestSessionSignature(validRequestSessionSignatureData);
    const savedRequestSessionSignature = await validRequestSessionSignature.save();

    expect(savedRequestSessionSignature.approvalStatus.notary.approved).toBe(false);
    expect(savedRequestSessionSignature.approvalStatus.notary.approvedAt).toBeNull();
    expect(savedRequestSessionSignature.approvalStatus.user.approved).toBe(false);
    expect(savedRequestSessionSignature.approvalStatus.user.approvedAt).toBeNull();
  });

  test('should convert to JSON correctly', async () => {
    const requestSessionSignature = new RequestSessionSignature(validRequestSessionSignatureData);
    const savedRequestSessionSignature = await requestSessionSignature.save();
    const jsonRequestSessionSignature = savedRequestSessionSignature.toJSON();

    expect(jsonRequestSessionSignature).not.toHaveProperty('__v');
    expect(jsonRequestSessionSignature).toHaveProperty('id');
  });

  test('should handle pagination plugin', async () => {
    // Create multiple request session signatures
    let validRequestSessionSignatureData2 = {
      sessionId: new mongoose.Types.ObjectId(),
      signatureImage: 'https://example.com/signature2.png',
      approvalStatus: {
        notary: {
          approved: false,
          approvedAt: null,
        },
        user: {
          approved: false,
          approvedAt: null,
        },
      },
    };
    await RequestSessionSignature.create([validRequestSessionSignatureData, validRequestSessionSignatureData2]);

    const result = await RequestSessionSignature.paginate({}, { limit: 1, page: 1 });

    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('page');
    expect(result).toHaveProperty('limit');
    expect(result).toHaveProperty('totalPages');
    expect(result).toHaveProperty('totalResults');
  });
});
