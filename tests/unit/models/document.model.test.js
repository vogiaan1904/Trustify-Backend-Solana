const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Document = require('../../../src/models/document.model.js');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.dropIndexes();
    await collection.deleteMany();
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Document Model Test Suite', () => {
  let validDocumentData;

  beforeEach(() => {
    validDocumentData = {
      files: [
        {
          filename: 'test.pdf',
          firebaseUrl: 'https://firebase.storage.com/test.pdf',
        },
      ],
      notarizationService: {
        id: new mongoose.Types.ObjectId(),
        name: 'Test Service',
        fieldId: new mongoose.Types.ObjectId(),
        description: 'Test Description',
        price: 100,
        required_documents: ['passport', 'id_card'],
        code: 'TEST_CODE',
      },
      notarizationField: {
        id: new mongoose.Types.ObjectId(),
        name: 'Test Field',
        description: 'Test Field Description',
        name_en: 'Test Field English',
        code: 'TEST_FIELD',
      },
      requesterInfo: {
        fullName: 'John Doe',
        citizenId: '123456789',
        phoneNumber: '+1234567890',
        email: 'john@example.com',
      },
      userId: new mongoose.Types.ObjectId(),
      amount: 150,
    };
  });
  

  test('should create & save document successfully', async () => {
    const validDocument = new Document(validDocumentData);
    const savedDocument = await validDocument.save();

    expect(savedDocument._id).toBeDefined();
    expect(savedDocument.files[0].filename).toBe(validDocumentData.files[0].filename);
    expect(savedDocument.notarizationService.name).toBe(validDocumentData.notarizationService.name);
  });

  test('should fail to save with missing required fields', async () => {
    const documentWithoutRequired = new Document({});
    let err;

    try {
      await documentWithoutRequired.save();
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
  });

  test('should validate email format', async () => {
    validDocumentData.requesterInfo.email = '';
    const invalidDocument = new Document(validDocumentData);
    let err ;

    try {
      await invalidDocument.save();
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
  });

  test('should accept valid required_documents', async () => {
    const validDocument = new Document(validDocumentData);
    const savedDocument = await validDocument.save();
    expect(Array.from(savedDocument.notarizationService.required_documents))
    .toEqual(validDocumentData.notarizationService.required_documents);
  });

  test('should convert to JSON correctly', async () => {
    const document = new Document(validDocumentData);
    const savedDocument = await document.save();
    const jsonDocument = savedDocument.toJSON();

    expect(jsonDocument).not.toHaveProperty('__v');
    expect(jsonDocument).toHaveProperty('id');
  });

  test('should handle pagination plugin', async () => {
    // Create multiple documents
    await Document.create([validDocumentData, validDocumentData]);

    const result = await Document.paginate({}, { limit: 1, page: 1 });

    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('page');
    expect(result).toHaveProperty('limit');
    expect(result).toHaveProperty('totalPages');
    expect(result).toHaveProperty('totalResults');
  });
});
