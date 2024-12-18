const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const NotarizationService = require('../../../src/models/notarizationService.model');

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
    await collection.deleteMany({ name: 'Test Service' });
  }
});

describe('NotarizationService Model Test Suite', () => {
  let validNotarizationServiceData;

  beforeEach(() => {
    validNotarizationServiceData = {
      name: 'Test Service',
      fieldId: new mongoose.Types.ObjectId(),
      description: 'Test Service Description',
      price: 100,
      code: 'TEST_SERVICE',
      required_documents: ['passport', 'id_card'],
    };
  });

  test('should create & save notarization service successfully', async () => {
    const validNotarizationService = new NotarizationService(validNotarizationServiceData);
    const savedNotarizationService = await validNotarizationService.save();

    expect(savedNotarizationService._id).toBeDefined();
    expect(savedNotarizationService.name).toBe(validNotarizationServiceData.name);
    expect(savedNotarizationService.fieldId).toBe(validNotarizationServiceData.fieldId);
    expect(savedNotarizationService.description).toBe(validNotarizationServiceData.description);
    expect(savedNotarizationService.price).toBe(validNotarizationServiceData.price);
    expect(savedNotarizationService.code).toBe(validNotarizationServiceData.code);
    expect(Array.from(savedNotarizationService.required_documents)).toEqual(validNotarizationServiceData.required_documents);
  });

  test('should fail to save without required fields', async () => {
    const notarizationServiceWithoutRequired = new NotarizationService({});
    let err;

    try {
      await notarizationServiceWithoutRequired.save();
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(err.errors.name).toBeDefined();
    expect(err.errors.fieldId).toBeDefined();
    expect(err.errors.description).toBeDefined();
    expect(err.errors.price).toBeDefined();
    expect(err.errors.code).toBeDefined();
  });

  test('should fail to save with duplicate name', async () => {
    const validNotarizationService = new NotarizationService(validNotarizationServiceData);
    await validNotarizationService.save();

    const duplicateNotarizationService = new NotarizationService(validNotarizationServiceData);
    let err;

    try {
      await duplicateNotarizationService.save();
    } catch (error) {
      err = error;
    }

    //expect(err).toBeInstanceOf(mongoose.mongo.MongoError);
    expect(err.code).toBe(11000); // Duplicate key error code
  });

  test('should convert to JSON correctly', async () => {
    const notarizationService = new NotarizationService(validNotarizationServiceData);
    const savedNotarizationService = await notarizationService.save();
    const jsonNotarizationService = savedNotarizationService.toJSON();

    expect(jsonNotarizationService).not.toHaveProperty('__v');
    expect(jsonNotarizationService).toHaveProperty('id');
  });

  test('should handle pagination plugin', async () => {
    // Create multiple notarization services
    let validNotarizationServiceData2 = {
      name: 'Test Service2',
      fieldId: new mongoose.Types.ObjectId(),
      description: 'Test Service Description',
      price: 100,
      code: 'TEST_SERVICE',
      required_documents: ['passport', 'id_card'],
    };
    await NotarizationService.create([validNotarizationServiceData, validNotarizationServiceData2]);

    const result = await NotarizationService.paginate({}, { limit: 1, page: 1 });

    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('page');
    expect(result).toHaveProperty('limit');
    expect(result).toHaveProperty('totalPages');
    expect(result).toHaveProperty('totalResults');
  });
});
