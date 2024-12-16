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
      signatureImage: 'signature.png',
      approvalStatus: {
        notary: {
          approved: false,
          approvedAt: null,
        },
        user: {
          approved: false,
          approvedAt: null,
        },
      },
    });
  });

  it('should correctly set the sessionId', () => {
    expect(requestSessionSignature.sessionId).toBeInstanceOf(mongoose.Types.ObjectId);
  });

  it('should correctly set the signatureImage', () => {
    expect(requestSessionSignature.signatureImage).toBe('signature.png');
  });

  it('should correctly set the approvalStatus for notary', () => {
    expect(requestSessionSignature.approvalStatus.notary.approved).toBe(false);
    expect(requestSessionSignature.approvalStatus.notary.approvedAt).toBeNull();
  });

  it('should correctly set the approvalStatus for user', () => {
    expect(requestSessionSignature.approvalStatus.user.approved).toBe(false);
    expect(requestSessionSignature.approvalStatus.user.approvedAt).toBeNull();
  });

  it('should apply the toJSON plugin', () => {
    expect(toJSON).toHaveBeenCalled();
  });

  it('should apply the paginate plugin', () => {
    expect(paginate).toHaveBeenCalled();
  });
});
