const moment = require('moment');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const { Document, User, Session, Payment } = require('../../../src/models');
const adminService = require('../../../src/services/admin.service');
const ApiError = require('../../../src/utils/ApiError');
const httpStatus = require('http-status');

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
  jest.clearAllMocks();
});

describe('Admin Service Test Suite', () => {
  describe('getDocumentCount', () => {
    it('should return document count for today', async () => {
      const mockDocumentCount = jest.spyOn(Document, 'count').mockResolvedValueOnce(5).mockResolvedValueOnce(3);

      const result = await adminService.getDocumentCount('today');

      expect(mockDocumentCount).toHaveBeenCalledTimes(2);
      expect(result.currentPeriod.documentCount).toBe(5);
      expect(result.previousPeriod.documentCount).toBe(3);
      expect(result.growthPercent).toBe(((5 - 3) / 3) * 100);
    });

    it('should throw an error for invalid period', async () => {
      await expect(adminService.getDocumentCount('invalid_period')).rejects.toThrow('Invalid period: invalid_period');
    });
  });

  describe('getUserCount', () => {
    it('should return user count for today', async () => {
      const mockUserCount = jest.spyOn(User, 'countDocuments').mockResolvedValueOnce(10).mockResolvedValueOnce(8);

      const result = await adminService.getUserCount('today');

      expect(mockUserCount).toHaveBeenCalledTimes(2);
      expect(result.currentPeriod.userCount).toBe(10);
      expect(result.previousPeriod.userCount).toBe(8);
      expect(result.growthPercent).toBe(((10 - 8) / 8) * 100);
    });

    it('should throw an error for invalid period', async () => {
      await expect(adminService.getUserCount('invalid_period')).rejects.toThrow('Invalid period: invalid_period');
    });
  });

  describe('getDocumentsByNotaryField', () => {
    it('should return documents by notary field for today', async () => {
      const mockAggregate = jest
        .spyOn(Document, 'aggregate')
        .mockResolvedValueOnce([{ notarizationFieldName: 'Field1', amount: 5 }])
        .mockResolvedValueOnce([{ notarizationFieldName: 'Field1', amount: 3 }]);

      const result = await adminService.getDocumentsByNotaryField('today');

      expect(mockAggregate).toHaveBeenCalledTimes(2);
      expect(result.currentPeriod.totals).toEqual([{ notarizationFieldName: 'Field1', amount: 5 }]);
      expect(result.previousPeriod.totals).toEqual([{ notarizationFieldName: 'Field1', amount: 3 }]);
    });

    it('should throw an error for invalid period', async () => {
      await expect(adminService.getDocumentsByNotaryField('invalid_period')).rejects.toThrow(
        'Invalid period: invalid_period'
      );
    });
  });

  describe('getEmployeeCount', () => {
    it('should return employee count', async () => {
      const mockNotaryCount = jest.spyOn(User, 'countDocuments').mockResolvedValueOnce(5);
      const mockSecretaryCount = jest.spyOn(User, 'countDocuments').mockResolvedValueOnce(3);

      const result = await adminService.getEmployeeCount();

      expect(mockNotaryCount).toHaveBeenCalledWith({ role: 'notary' });
      expect(mockSecretaryCount).toHaveBeenCalledWith({ role: 'secretary' });
      expect(result.notaryCount).toBe(5);
      expect(result.secretaryCount).toBe(3);
    });
  });

  describe('getEmployeeList', () => {
    // it('should return employee list', async () => {
    //   const mockFind = jest
    //     .spyOn(User, 'find')
    //     .mockImplementation(() => jest.fn().mockResolvedValue([{ name: 'John Doe' }]));
    //   const mockCountDocuments = jest.spyOn(User, 'countDocuments').mockImplementation(() => jest.fn().mockResolvedValueOnce(1));

    //   const result = await adminService.getEmployeeList({name: 'John'}, { sortBy: 'name', order: 'asc', limit: 10, page: 1 });

    //   expect(mockFind).toHaveBeenCalled();
    //   expect(mockCountDocuments).toHaveBeenCalled();
    //   expect(result.results).toEqual([{ name: 'John Doe' }]);
    //   expect(result.page).toBe(1);
    //   expect(result.limit).toBe(10);
    //   expect(result.totalPages).toBe(1);
    //   expect(result.totalResults).toBe(1);
    // });

    it('should throw an error if retrieval fails', async () => {
      jest
        .spyOn(User, 'find')
        .mockImplementation(() => jest.fn().mockRejectedValueOnce(new Error('Failed to retrieve employee list')));

      await expect(adminService.getEmployeeList({}, { sortBy: 'name', order: 'asc', limit: 10, page: 1 })).rejects.toThrow(
        new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to retrieve employee list')
      );
    });
  });

  describe('getSessionCount', () => {
    it('should return session count for today', async () => {
      const mockSessionCount = jest.spyOn(Session, 'countDocuments').mockResolvedValueOnce(5).mockResolvedValueOnce(3);

      const result = await adminService.getSessionCount('today');

      expect(mockSessionCount).toHaveBeenCalledTimes(2);
      expect(result.currentPeriod.sessionCount).toBe(5);
      expect(result.previousPeriod.sessionCount).toBe(3);
      expect(result.growthPercent).toBe(((5 - 3) / 3) * 100);
    });

    it('should throw an error for invalid period', async () => {
      await expect(adminService.getSessionCount('invalid_period')).rejects.toThrow('Invalid period: invalid_period');
    });
  });

  describe('getPaymentTotalByService', () => {
    it('should return payment total by service for today', async () => {
      const mockAggregate = jest
        .spyOn(Payment, 'aggregate')
        .mockResolvedValueOnce([{ serviceName: 'Service1', totalAmount: 100 }])
        .mockResolvedValueOnce([{ serviceName: 'Service1', totalAmount: 80 }]);

      const result = await adminService.getPaymentTotalByService('today');

      expect(mockAggregate).toHaveBeenCalledTimes(2);
      expect(result.currentPeriod.totals).toEqual([{ serviceName: 'Service1', totalAmount: 100 }]);
      expect(result.previousPeriod.totals).toEqual([{ serviceName: 'Service1', totalAmount: 80 }]);
    });

    it('should throw an error for invalid period', async () => {
      await expect(adminService.getPaymentTotalByService('invalid_period')).rejects.toThrow(
        'Invalid period: invalid_period'
      );
    });
  });

  describe('getPaymentTotalByNotarizationField', () => {
    it('should return payment total by notarization field for today', async () => {
      const mockAggregate = jest
        .spyOn(Payment, 'aggregate')
        .mockResolvedValueOnce([{ fieldName: 'Field1', totalAmount: 100 }])
        .mockResolvedValueOnce([{ fieldName: 'Field1', totalAmount: 80 }]);

      const result = await adminService.getPaymentTotalByNotarizationField('today');

      expect(mockAggregate).toHaveBeenCalledTimes(2);
      expect(result.currentPeriod.totals).toEqual([{ fieldName: 'Field1', totalAmount: 100 }]);
      expect(result.previousPeriod.totals).toEqual([{ fieldName: 'Field1', totalAmount: 80 }]);
    });

    it('should throw an error for invalid period', async () => {
      await expect(adminService.getPaymentTotalByNotarizationField('invalid_period')).rejects.toThrow(
        'Invalid period: invalid_period'
      );
    });
  });

  describe('getPaymentTotal', () => {
    it('should return payment total for today', async () => {
      const mockAggregate = jest
        .spyOn(Payment, 'aggregate')
        .mockResolvedValueOnce([{ totalAmount: 100 }])
        .mockResolvedValueOnce([{ totalAmount: 80 }]);

      const result = await adminService.getPaymentTotal('today');

      expect(mockAggregate).toHaveBeenCalledTimes(2);
      expect(result.currentPeriod.totalAmount).toBe(100);
      expect(result.previousPeriod.totalAmount).toBe(80);
      expect(result.growthPercent).toBe(((100 - 80) / 80) * 100);
    });

    it('should throw an error for invalid period', async () => {
      await expect(adminService.getPaymentTotal('invalid_period')).rejects.toThrow('Invalid period: invalid_period');
    });
  });
});
