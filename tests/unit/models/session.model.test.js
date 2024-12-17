const mongoose = require('mongoose');
const Session = require('../../../src/models/session.model');
const { toJSON, paginate } = require('../../../src/models/plugins');
const { any } = require('joi');

// Mock the plugins
jest.mock('../../../src/models/plugins/toJSON.plugin', () => jest.fn());
jest.mock('../../../src/models/plugins/paginate.plugin', () => jest.fn());

describe('Session model', () => {
  let session;

  beforeEach(() => {
    session = new Session({
      sessionId: 'sessionId123',
      notaryField: { field: 'value' },
      notaryService: { service: 'value' },
      sessionName: 'Test Session',
      startTime: '10:00 AM',
      startDate: new Date('2023-01-01'),
      endTime: '11:00 AM',
      endDate: new Date('2023-01-01'),
      users: [
        {
          email: 'user@example.com',
          status: 'pending',
        },
      ],
      createdBy: new mongoose.Types.ObjectId(),
      amount: 100,
      files: [
        {
          userId: new mongoose.Types.ObjectId(),
          filename: 'file1.pdf',
          firebaseUrl: 'https://firebase.url/file1.pdf',
          createAt: new Date('2023-01-01'),
        },
      ],
      output: [
        {
          filename: 'output1.pdf',
          firebaseUrl: 'https://firebase.url/output1.pdf',
          transactionHash: '0x123',
          uploadedAt: new Date('2023-01-01'),
        },
      ],
    });
  });

  it('should correctly set the sessionId', () => {
    expect(session.sessionId).toBe('sessionId123');
  });

  it('should correctly set the notaryField', () => {
    expect(session.notaryField).toEqual({ field: 'value' });
  });

  it('should correctly set the notaryService', () => {
    expect(session.notaryService).toEqual({ service: 'value' });
  });

  it('should correctly set the sessionName', () => {
    expect(session.sessionName).toBe('Test Session');
  });

  it('should correctly set the startTime', () => {
    expect(session.startTime).toBe('10:00 AM');
  });

  it('should correctly set the startDate', () => {
    expect(session.startDate).toEqual(new Date('2023-01-01'));
  });

  it('should correctly set the endTime', () => {
    expect(session.endTime).toBe('11:00 AM');
  });

  it('should correctly set the endDate', () => {
    expect(session.endDate).toEqual(new Date('2023-01-01'));
  });

  it('should correctly set the users', () => {
    expect(session.users.toObject()).toEqual([
      {
        _id: expect.any(mongoose.Types.ObjectId),
        email: 'user@example.com',
        status: 'pending',
      },
    ]);
  });

  it('should correctly set the createdBy', () => {
    expect(session.createdBy).toBeInstanceOf(mongoose.Types.ObjectId);
  });

  it('should correctly set the amount', () => {
    expect(session.amount).toBe(100);
  });

  it('should correctly set the files', () => {
    expect(session.files.toObject()).toEqual([
      {
        _id: expect.any(mongoose.Types.ObjectId),
        userId: expect.any(mongoose.Types.ObjectId),
        filename: 'file1.pdf',
        firebaseUrl: 'https://firebase.url/file1.pdf',
        createAt: new Date('2023-01-01'),
      },
    ]);
  });

  it('should correctly set the output', () => {
    expect(session.output.toObject()).toEqual([
      {
        _id: expect.any(mongoose.Types.ObjectId),
        filename: 'output1.pdf',
        firebaseUrl: 'https://firebase.url/output1.pdf',
        transactionHash: '0x123',
        uploadedAt: new Date('2023-01-01'),
      },
    ]);
  });

  it('should apply the toJSON plugin', () => {
    expect(toJSON).toHaveBeenCalled();
  });

  it('should apply the paginate plugin', () => {
    expect(paginate).toHaveBeenCalled();
  });
});
