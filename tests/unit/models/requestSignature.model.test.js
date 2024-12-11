const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const RequestSignature = require('../../../src/models/requestSignature.model');

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

describe('RequestSignature Model Test Suite', () => {
  let validRequestSignatureData;

  beforeEach(() => {
    validRequestSignatureData = {
      documentId: new mongoose.Types.ObjectId(),
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

  test('should create & save request signature successfully', async () => {
    const validRequestSignature = new RequestSignature(validRequestSignatureData);
    const savedRequestSignature = await validRequestSignature.save();

    expect(savedRequestSignature._id).toBeDefined();
    expect(savedRequestSignature.documentId).toBe(validRequestSignatureData.documentId);
    expect(savedRequestSignature.signatureImage).toBe(validRequestSignatureData.signatureImage);
    expect(savedRequestSignature.approvalStatus.notary.approved).toBe(
      validRequestSignatureData.approvalStatus.notary.approved
    );
    expect(savedRequestSignature.approvalStatus.user.approved).toBe(validRequestSignatureData.approvalStatus.user.approved);
  });

  test('should fail to save without required fields', async () => {
    const requestSignatureWithoutRequired = new RequestSignature({});
    let err;

    try {
      await requestSignatureWithoutRequired.save();
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(err.errors.documentId).toBeDefined();
  });

  test('should set default approval status correctly', async () => {
    const validRequestSignature = new RequestSignature(validRequestSignatureData);
    const savedRequestSignature = await validRequestSignature.save();

    expect(savedRequestSignature.approvalStatus.notary.approved).toBe(false);
    expect(savedRequestSignature.approvalStatus.notary.approvedAt).toBeNull();
    expect(savedRequestSignature.approvalStatus.user.approved).toBe(false);
    expect(savedRequestSignature.approvalStatus.user.approvedAt).toBeNull();
  });

  test('should convert to JSON correctly', async () => {
    const requestSignature = new RequestSignature(validRequestSignatureData);
    const savedRequestSignature = await requestSignature.save();
    const jsonRequestSignature = savedRequestSignature.toJSON();

    expect(jsonRequestSignature).not.toHaveProperty('__v');
    expect(jsonRequestSignature).toHaveProperty('id');
  });

  test('should handle pagination plugin', async () => {
    // Create multiple request signatures
    await RequestSignature.create([validRequestSignatureData, validRequestSignatureData]);

    const result = await RequestSignature.paginate({}, { limit: 1, page: 1 });

    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('page');
    expect(result).toHaveProperty('limit');
    expect(result).toHaveProperty('totalPages');
    expect(result).toHaveProperty('totalResults');
  });
});
