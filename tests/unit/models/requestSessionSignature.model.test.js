const mongoose = require('mongoose');
const RequestSessionSignature = require('../../../src/models/requestSessionSignature.model');
const { toJSON, paginate } = require('../../../src/models/plugins');

// Mock the plugins
jest.mock('../../../src/models/plugins/toJSON.plugin', () => jest.fn());
jest.mock('../../../src/models/plugins/paginate.plugin', () => jest.fn());

describe('RequestSessionSignature model', () => {
  let requestSessionSignature;

  beforeEach(() => {
    requestSessionSignature = new RequestSessionSignature({
      sessionId: new mongoose.Types.ObjectId(),
      approvalStatus: {
        notary: {
          approved: false,
          approvedAt: null,
        },
        users: [{
          email: 'testmail@gmail.com',
          approved: false,
          approvedAt: null,
          signatureImage: 'signature1.png',
        }],
        creator: {
          approved: false,
          approvedAt: null,
          signatureImage: 'signature2.png',
        }
      },
    });
  });

  it('should correctly set the sessionId', () => {
    expect(requestSessionSignature.sessionId).toBeInstanceOf(mongoose.Types.ObjectId);
  });

  it('should correctly set the approvalStatus for notary', () => {
    expect(requestSessionSignature.approvalStatus.notary.approved).toBe(false);
    expect(requestSessionSignature.approvalStatus.notary.approvedAt).toBeNull();
  });

  it('should correctly set the approvalStatus for users', () => {
    expect(requestSessionSignature.approvalStatus.users[0].email).toBe('testmail@gmail.com');
    expect(requestSessionSignature.approvalStatus.users[0].approved).toBe(false);
    expect(requestSessionSignature.approvalStatus.users[0].approvedAt).toBeNull();
    expect(requestSessionSignature.approvalStatus.users[0].signatureImage).toBe('signature1.png');
  });

  it('should correctly set the approvalStatus for creator', () => {
    expect(requestSessionSignature.approvalStatus.creator.approved).toBe(false);
    expect(requestSessionSignature.approvalStatus.creator.approvedAt).toBeNull();
    expect(requestSessionSignature.approvalStatus.creator.signatureImage).toBe('signature2.png');
  });

  it('should apply the toJSON plugin', () => {
    expect(toJSON).toHaveBeenCalled();
  });

  it('should apply the paginate plugin', () => {
    expect(paginate).toHaveBeenCalled();
  });
});
