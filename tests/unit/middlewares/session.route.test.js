const express = require('express');
const auth = require('../../../src/middlewares/auth');
const validate = require('../../../src/middlewares/validate');

// Mock route instance with chaining
const mockRouteInstance = {
  post: jest.fn().mockReturnThis(),
  get: jest.fn().mockReturnThis(),
  patch: jest.fn().mockReturnThis(),
};

const mockRouter = {
  route: jest.fn(() => mockRouteInstance),
  post: jest.fn().mockReturnThis(),
};

// Mock upload middleware
const mockUpload = {
  array: jest.fn().mockReturnValue('upload.array middleware'),
  single: jest.fn().mockReturnValue('upload.single middleware'),
  none: jest.fn().mockReturnValue('upload.none middleware'),
};

// Setup mocks
jest.mock('express', () => ({
  Router: jest.fn(() => mockRouter),
}));

jest.mock('multer', () => {
  const multer = jest.fn(() => mockUpload);
  multer.memoryStorage = jest.fn(() => 'memoryStorage');
  return multer;
});

jest.mock('../../../src/middlewares/auth', () => jest.fn((right) => `auth_${right}`));

jest.mock('../../../src/middlewares/validate', () => jest.fn((schema) => `validate_${schema}`));

jest.mock('../../../src/controllers/session.controller', () => ({
  createSession: jest.fn(),
  addUser: jest.fn(),
  deleteUser: jest.fn(),
  joinSession: jest.fn(),
  getAllSessions: jest.fn(),
  getSessionsByDate: jest.fn(),
  getSessionsByMonth: jest.fn(),
  getActiveSessions: jest.fn(),
  uploadSessionDocument: jest.fn(),
  getSessionStatus: jest.fn(),
  getSessionsByStatus: jest.fn(),
  sendSessionForNotarization: jest.fn(),
}));

describe('Session Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    require('../../../src/routes/v1/session.route');
  });

  describe('Route Registration', () => {
    test('should register all routes', () => {
      expect(mockRouter.route).toHaveBeenCalledWith('/createSession');
      expect(mockRouter.route).toHaveBeenCalledWith('/addUser/:sessionId');
      expect(mockRouter.route).toHaveBeenCalledWith('/deleteUser/:sessionId');
      expect(mockRouter.route).toHaveBeenCalledWith('/joinSession/:sessionId');
      expect(mockRouter.route).toHaveBeenCalledWith('/getAllSessions');
      expect(mockRouter.route).toHaveBeenCalledWith('/getSessionsByDate');
      expect(mockRouter.route).toHaveBeenCalledWith('/getActiveSessions');
      expect(mockRouter.route).toHaveBeenCalledWith('/upload-session-document/:sessionId');
    });
  });
});
