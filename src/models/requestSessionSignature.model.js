const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const requestSessionSignatureSchema = new mongoose.Schema(
  {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
    },
    signatureImage: {
      type: String,
    },
    approvalStatus: {
      notary: {
        approved: { type: Boolean, default: false },
        approvedAt: { type: Date, default: null },
      },
      user: {
        approved: { type: Boolean, default: false },
        approvedAt: { type: Date, default: null },
      },
    },
  },
  {
    timestamps: true,
    collection: 'requestSessionSignature',
  }
);

requestSessionSignatureSchema.plugin(toJSON);
requestSessionSignatureSchema.plugin(paginate);

module.exports = mongoose.model('RequestSessionSignature', requestSessionSignatureSchema);
