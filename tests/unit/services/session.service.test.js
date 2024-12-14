const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const httpStatus = require('http-status');
const { Session, NotarizationField, NotarizationService, User } = require('../../../src/models');
const ApiError = require('../../../src/utils/ApiError');
const userService = require('../../../src/services/user.service');
const sessionService = require('../../../src/services/session.service');

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

describe('Session Service', () => {
  beforeEach(async () => {
    await Session.deleteMany({});
    await NotarizationField.deleteMany({});
    await NotarizationService.deleteMany({});
    await User.deleteMany({});
  });

  describe('validateEmails', () => {
    test('should throw an error if emails is not an array', async () => {
      await expect(sessionService.validateEmails('not-an-array')).rejects.toThrow(ApiError);
    });

    test('should throw an error if any email is invalid', async () => {
      await expect(sessionService.validateEmails(['valid@example.com', 'invalid-email'])).rejects.toThrow(ApiError);
    });

    test('should return true if all emails are valid', async () => {
      await expect(sessionService.validateEmails(['valid@example.com'])).resolves.toBe(true);
    });
  });

  describe('createSession', () => {
    test('should create a session', async () => {
      const notaryField = await NotarizationField.create({
        name: 'Field',
        code: 'F001',
        name_en: 'Field EN',
        description: 'Description',
      });
      const notaryService = await NotarizationService.create({
        name: 'Service',
        fieldId: notaryField._id,
        code: 'S001',
        name_en: 'Service EN',
        description: 'Description',
        price: 100,
      });
      const user = await User.create({ email: 'test@example.com', password: 'password123', name: 'Test User' });

      const sessionBody = {
        sessionName: 'Test Session',
        notaryField: { id: notaryField._id, name: 'Field' },
        notaryService: { id: notaryService._id, name: 'Service' },
        startTime: '14:00',
        startDate: new Date().toISOString().split('T')[0],
        endTime: '15:00',
        endDate: new Date().toISOString().split('T')[0],
        users: [{ email: 'test@example.com' }],
        createdBy: new mongoose.Types.ObjectId(),
      };

      const session = await sessionService.createSession(sessionBody);

      // Đồng nhất định dạng ngày
      const result = session.toObject();
      result.startDate = result.startDate.toISOString();
      result.endDate = result.endDate.toISOString();

      expect(result).toMatchObject({
        sessionName: 'Test Session',
        notaryField: { name: 'Field' },
        notaryService: { name: 'Service' },
        startTime: '14:00',
        startDate: new Date(sessionBody.startDate).toISOString(),
        endTime: '15:00',
        endDate: new Date(sessionBody.endDate).toISOString(),
        users: [{ email: 'test@example.com', status: 'pending' }],
        createdBy: sessionBody.createdBy,
      });
    });
  });

  describe('addUserToSession', () => {
    test('should add users to session', async () => {
      const user1 = await User.create({ email: 'test1@example.com', password: 'password123', name: 'Test User 1' });
      const user2 = await User.create({ email: 'test2@example.com', password: 'password123', name: 'Test User 2' });

      const session = await Session.create({
        sessionName: 'Test Session',
        notaryField: { name: 'Field' },
        notaryService: { name: 'Service' },
        startTime: '14:00',
        startDate: new Date(),
        endTime: '15:00',
        endDate: new Date(),
        users: [],
        createdBy: new mongoose.Types.ObjectId(),
      });

      const emails = ['test1@example.com', 'test2@example.com'];
      const updatedSession = await sessionService.addUserToSession(session._id, emails);
      expect(updatedSession.users).toHaveLength(2);
      expect(updatedSession.users.map((user) => user.email)).toEqual(expect.arrayContaining(emails));
    });

    test('should throw an error if user is already added to session', async () => {
      const user = await User.create({ email: 'test1@example.com', password: 'password123', name: 'Test User 1' });

      const session = await Session.create({
        sessionName: 'Test Session',
        notaryField: { name: 'Field' },
        notaryService: { name: 'Service' },
        startTime: '14:00',
        startDate: new Date(),
        endTime: '15:00',
        endDate: new Date(),
        users: [{ email: 'test1@example.com' }],
        createdBy: new mongoose.Types.ObjectId(),
      });

      const emails = ['test1@example.com'];
      await expect(sessionService.addUserToSession(session._id, emails)).rejects.toThrow(ApiError);
    });
  });

  describe('deleteUserOutOfSession', () => {
    test('should delete user from session', async () => {
      const user = await User.create({ email: 'test1@example.com', password: 'password123', name: 'Test User 1' });

      const session = await Session.create({
        sessionName: 'Test Session',
        notaryField: { name: 'Field' },
        notaryService: { name: 'Service' },
        startTime: '14:00',
        startDate: new Date(),
        endTime: '15:00',
        endDate: new Date(),
        users: [{ email: 'test1@example.com' }],
        createdBy: new mongoose.Types.ObjectId(),
      });

      const updatedSession = await sessionService.deleteUserOutOfSession(
        session._id,
        'test1@example.com',
        session.createdBy
      );
      expect(updatedSession.users).toHaveLength(0);
    });

    test('should throw an error if user is not found in session', async () => {
      const user = await User.create({ email: 'test1@example.com', password: 'password123', name: 'Test User 1' });

      const session = await Session.create({
        sessionName: 'Test Session',
        notaryField: { name: 'Field' },
        notaryService: { name: 'Service' },
        startTime: '14:00',
        startDate: new Date(),
        endTime: '15:00',
        endDate: new Date(),
        users: [{ email: 'test1@example.com' }],
        createdBy: new mongoose.Types.ObjectId(),
      });

      await expect(
        sessionService.deleteUserOutOfSession(session._id, 'test2@example.com', session.createdBy)
      ).rejects.toThrow(ApiError);
    });
  });

  describe('joinSession', () => {
    test('should update user status to accepted', async () => {
      const user = await User.create({ email: 'test@example.com', password: 'password123', name: 'Test User' });
      jest.spyOn(userService, 'getUserById').mockResolvedValue(user);

      const session = await Session.create({
        sessionName: 'Test Session',
        notaryField: { name: 'Field' },
        notaryService: { name: 'Service' },
        startTime: '14:00',
        startDate: new Date(),
        endTime: '15:00',
        endDate: new Date(),
        users: [{ email: 'test@example.com', status: 'pending' }],
        createdBy: new mongoose.Types.ObjectId(),
      });

      const updatedSession = await sessionService.joinSession(session._id, 'accept', user._id);
      expect(updatedSession.users[0].status).toBe('accepted');
    });

    test('should throw an error if user is not found in session', async () => {
      const user = await User.create({ email: 'test@example.com', password: 'password123', name: 'Test User' });
      jest.spyOn(userService, 'getUserById').mockResolvedValue(user);

      const session = await Session.create({
        sessionName: 'Test Session',
        notaryField: { name: 'Field' },
        notaryService: { name: 'Service' },
        startTime: '14:00',
        startDate: new Date(),
        endTime: '15:00',
        endDate: new Date(),
        users: [{ email: 'test1@example.com', status: 'pending' }],
        createdBy: new mongoose.Types.ObjectId(),
      });

      await expect(sessionService.joinSession(session._id, 'accept', user._id)).rejects.toThrow(ApiError);
    });
  });

  describe('getAllSessions', () => {
    test('should return all sessions', async () => {
      const session = await Session.create({
        sessionName: 'Test Session',
        notaryField: { name: 'Field' },
        notaryService: { name: 'Service' },
        startTime: '14:00',
        startDate: new Date(),
        endTime: '15:00',
        endDate: new Date(),
        users: [{ email: 'test@example.com' }],
        createdBy: new mongoose.Types.ObjectId(),
      });

      const sessions = await sessionService.getAllSessions({}, { page: 1, limit: 10 });

      expect(sessions.results).toHaveLength(1);

      const receivedSession = JSON.parse(JSON.stringify(sessions.results[0]));

      const formattedReceivedSession = {
        ...receivedSession,
        startDate: new Date(receivedSession.startDate).toISOString(),
        endDate: new Date(receivedSession.endDate).toISOString(),
        createdBy: session.createdBy,
      };

      expect(formattedReceivedSession).toMatchObject({
        sessionName: 'Test Session',
        notaryField: { name: 'Field' },
        notaryService: { name: 'Service' },
        startTime: '14:00',
        startDate: session.startDate.toISOString(),
        endTime: '15:00',
        endDate: session.endDate.toISOString(),
        users: [{ email: 'test@example.com' }],
        createdBy: session.createdBy,
      });
    });

    test('should throw an error if no sessions are found', async () => {
      await expect(sessionService.getAllSessions({}, { page: 1, limit: 10 })).rejects.toThrow(ApiError);
    });
  });

  describe('getSessionsByDate', () => {
    test('should return sessions for a specific date', async () => {
      const date = new Date();
      const session = await Session.create({
        sessionName: 'Test Session',
        notaryField: { name: 'Field' },
        notaryService: { name: 'Service' },
        startTime: '14:00',
        startDate: date,
        endTime: '15:00',
        endDate: date,
        users: [{ email: 'test@example.com' }],
        createdBy: new mongoose.Types.ObjectId(),
      });

      const sessions = await sessionService.getSessionsByDate(date.toISOString().split('T')[0]);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].toObject()).toMatchObject(session.toObject());
    });

    test('should throw an error if no sessions are found for the specified date', async () => {
      const date = new Date();
      await expect(sessionService.getSessionsByDate(date.toISOString().split('T')[0])).rejects.toThrow(ApiError);
    });
  });

  describe('getSessionsByMonth', () => {
    test('should return sessions for a specific month', async () => {
      const date = new Date();
      const session = await Session.create({
        sessionName: 'Test Session',
        notaryField: { name: 'Field' },
        notaryService: { name: 'Service' },
        startTime: '14:00',
        startDate: date,
        endTime: '15:00',
        endDate: date,
        users: [{ email: 'test@example.com' }],
        createdBy: new mongoose.Types.ObjectId(),
      });

      const sessions = await sessionService.getSessionsByMonth(date.toISOString().split('T')[0].slice(0, 7));
      expect(sessions).toHaveLength(1);
      expect(sessions[0].toObject()).toMatchObject(session.toObject());
    });

    test('should throw an error if no sessions are found for the specified month', async () => {
      const date = new Date();
      await expect(sessionService.getSessionsByMonth(date.toISOString().split('T')[0].slice(0, 7))).rejects.toThrow(
        ApiError
      );
    });
  });

  describe('getActiveSessions', () => {
    test('should return active sessions', async () => {
      const date = new Date();
      const session = await Session.create({
        sessionName: 'Test Session',
        notaryField: { name: 'Field' },
        notaryService: { name: 'Service' },
        startTime: '14:00',
        startDate: date,
        endTime: '15:00',
        endDate: new Date(date.getTime() + 60 * 60 * 1000), // 1 hour later
        users: [{ email: 'test@example.com' }],
        createdBy: new mongoose.Types.ObjectId(),
      });

      const sessions = await sessionService.getActiveSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].toObject()).toMatchObject(session.toObject());
    });

    test('should throw an error if no active sessions are found', async () => {
      await expect(sessionService.getActiveSessions()).rejects.toThrow(ApiError);
    });
  });
});
