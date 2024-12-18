const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Payment = require('../../../src/models/payment.model');

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

describe('Payment Model Test Suite', () => {
  let validPaymentData;

  beforeEach(() => {
    validPaymentData = {
      orderCode: 123456,
      amount: 1000,
      description: 'Payment for notarization service',
      returnUrl: 'https://example.com/return',
      cancelUrl: 'https://example.com/cancel',
      status: 'pending',
      userId: 'user123',
      documentId: new mongoose.Types.ObjectId(),
      serviceId: new mongoose.Types.ObjectId(),
      fieldId: new mongoose.Types.ObjectId(),
    };
  });

  test('should create & save payment successfully', async () => {
    const validPayment = new Payment(validPaymentData);
    const savedPayment = await validPayment.save();

    expect(savedPayment._id).toBeDefined();
    expect(savedPayment.orderCode).toBe(validPaymentData.orderCode);
    expect(savedPayment.amount).toBe(validPaymentData.amount);
    expect(savedPayment.description).toBe(validPaymentData.description);
    expect(savedPayment.returnUrl).toBe(validPaymentData.returnUrl);
    expect(savedPayment.cancelUrl).toBe(validPaymentData.cancelUrl);
    expect(savedPayment.status).toBe(validPaymentData.status);
    expect(savedPayment.userId).toBe(validPaymentData.userId);
    expect(savedPayment.documentId).toBe(validPaymentData.documentId);
    expect(savedPayment.serviceId).toBe(validPaymentData.serviceId);
    expect(savedPayment.fieldId).toBe(validPaymentData.fieldId);
  });

  test('should fail to save without required fields', async () => {
    const paymentWithoutRequired = new Payment({});
    let err;

    try {
      await paymentWithoutRequired.save();
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(err.errors.orderCode).toBeDefined();
    expect(err.errors.amount).toBeDefined();
    expect(err.errors.description).toBeDefined();
    expect(err.errors.returnUrl).toBeDefined();
    expect(err.errors.cancelUrl).toBeDefined();
  });

  test('should fail to save with duplicate orderCode', async () => {
    const validPayment = new Payment(validPaymentData);
    await validPayment.save();

    const duplicatePayment = new Payment(validPaymentData);
    let err;

    try {
      await duplicatePayment.save();
    } catch (error) {
      err = error;
    }

    expect(err).toBeInstanceOf(mongoose.mongo.MongoError);
    expect(err.code).toBe(11000); 
  });

  test('should set default status to pending', async () => {
    delete validPaymentData.status;
    const validPayment = new Payment(validPaymentData);
    const savedPayment = await validPayment.save();

    expect(savedPayment.status).toBe('pending');
  });

  test('should set createdAt and updatedAt to current date by default', async () => {
    const validPayment = new Payment(validPaymentData);
    const savedPayment = await validPayment.save();

    expect(savedPayment.createdAt).toBeDefined();
    expect(savedPayment.updatedAt).toBeDefined();
    const now = new Date();
    expect(savedPayment.createdAt.getDate()).toBe(now.getDate());
    expect(savedPayment.createdAt.getMonth()).toBe(now.getMonth());
    expect(savedPayment.createdAt.getFullYear()).toBe(now.getFullYear());
    expect(savedPayment.updatedAt.getDate()).toBe(now.getDate());
    expect(savedPayment.updatedAt.getMonth()).toBe(now.getMonth());
    expect(savedPayment.updatedAt.getFullYear()).toBe(now.getFullYear());
  });
});
