const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const ApproveHistory = require('../../../src/models/approveHistory.model');

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

describe('ApproveHistory Model Test Suite', () => {
  let validApproveHistoryData;

  beforeEach(() => {
    validApproveHistoryData = {
      userId: new mongoose.Types.ObjectId(),
      documentId: new mongoose.Types.ObjectId(),
      beforeStatus: 'pending',
      afterStatus: 'approved',
    };
  });

  test('should create & save approve history successfully', async () => {
    const validApproveHistory = new ApproveHistory(validApproveHistoryData);
    const savedApproveHistory = await validApproveHistory.save();

    expect(savedApproveHistory._id).toBeDefined();
    expect(savedApproveHistory.userId).toBe(validApproveHistoryData.userId);
    expect(savedApproveHistory.documentId).toBe(validApproveHistoryData.documentId);
    expect(savedApproveHistory.beforeStatus).toBe(validApproveHistoryData.beforeStatus);
    expect(savedApproveHistory.afterStatus).toBe(validApproveHistoryData.afterStatus);
  });

  test('should fail to save without required fields', async () => {
    const approveHistoryWithoutRequired = new ApproveHistory({});
    let err;

    try {
      await approveHistoryWithoutRequired.save();
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(err.errors.documentId).toBeDefined();
    expect(err.errors.beforeStatus).toBeDefined();
    expect(err.errors.afterStatus).toBeDefined();
  });

  test('should set createdDate to current date by default', async () => {
    const validApproveHistory = new ApproveHistory(validApproveHistoryData);
    const savedApproveHistory = await validApproveHistory.save();

    expect(savedApproveHistory.createdDate).toBeDefined();
    const now = new Date();
    expect(savedApproveHistory.createdDate.getDate()).toBe(now.getDate());
    expect(savedApproveHistory.createdDate.getMonth()).toBe(now.getMonth());
    expect(savedApproveHistory.createdDate.getFullYear()).toBe(now.getFullYear());
  });
});
