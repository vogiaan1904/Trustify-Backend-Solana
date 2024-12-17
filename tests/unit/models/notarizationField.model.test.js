const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const NotarizationField = require('../../../src/models/notarizationField.model');

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
    await collection.deleteMany({ name: 'Test Field' });
  }
});

describe('NotarizationField Model Test Suite', () => {
  let validNotarizationFieldData;

  beforeEach(() => {
    validNotarizationFieldData = {
      name: 'Test Field',
      description: 'Test Field Description',
      name_en: 'Test Field English',
      code: 'TEST_FIELD',
    };
  });

  test('should create & save notarization field successfully', async () => {
    const validNotarizationField = new NotarizationField(validNotarizationFieldData);
    const savedNotarizationField = await validNotarizationField.save();

    expect(savedNotarizationField._id).toBeDefined();
    expect(savedNotarizationField.name).toBe(validNotarizationFieldData.name);
    expect(savedNotarizationField.description).toBe(validNotarizationFieldData.description);
    expect(savedNotarizationField.name_en).toBe(validNotarizationFieldData.name_en);
    expect(savedNotarizationField.code).toBe(validNotarizationFieldData.code);
  });

  test('should fail to save without required fields', async () => {
    const notarizationFieldWithoutRequired = new NotarizationField({});
    let err;

    try {
      await notarizationFieldWithoutRequired.save();
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(err.errors.name).toBeDefined();
    expect(err.errors.description).toBeDefined();
    expect(err.errors.name_en).toBeDefined();
    expect(err.errors.code).toBeDefined();
  });

  test('should fail to save with duplicate name', async () => {
    const validNotarizationField = new NotarizationField(validNotarizationFieldData);
    await validNotarizationField.save();

    const duplicateNotarizationField = new NotarizationField(validNotarizationFieldData);
    let err;

    try {
      await duplicateNotarizationField.save();
    } catch (error) {
      err = error;
    }

    //expect(err).toBeInstanceOf(mongoose.mongo.MongoError);
    expect(err.code).toBe(11000);
  });

  test('should convert to JSON correctly', async () => {
    const notarizationField = new NotarizationField(validNotarizationFieldData);
    const savedNotarizationField = await notarizationField.save();
    const jsonNotarizationField = savedNotarizationField.toJSON();

    expect(jsonNotarizationField).not.toHaveProperty('__v');
    expect(jsonNotarizationField).toHaveProperty('id');
  });

  test('should handle pagination plugin', async () => {
    // Create multiple notarization fields
    let validNotarizationFieldData2 = {
      name: 'Test Field2',
      description: 'Test Field Description',
      name_en: 'Test Field English',
      code: 'TEST_FIELD',
    };
    await NotarizationField.create([validNotarizationFieldData, validNotarizationFieldData2]);

    const result = await NotarizationField.paginate({}, { limit: 1, page: 1 });

    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('page');
    expect(result).toHaveProperty('limit');
    expect(result).toHaveProperty('totalPages');
    expect(result).toHaveProperty('totalResults');
  });
});
