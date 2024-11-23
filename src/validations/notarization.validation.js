const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createDocument = {
  body: Joi.object().keys({
    files: Joi.array().items(Joi.string()).required(),
    notarizationService: Joi.object()
      .keys({
        id: Joi.string().custom(objectId).required(),
        name: Joi.string().required(),
        fieldId: Joi.string().custom(objectId).required(),
        description: Joi.string().required(),
        price: Joi.number().required(),
      })
      .required(),
    notarizationField: Joi.object()
      .keys({
        id: Joi.string().custom(objectId).required(),
        name: Joi.string().required(),
        description: Joi.string().required(),
      })
      .required(),
    requesterInfo: Joi.object()
      .keys({
        fullName: Joi.string().required(),
        citizenId: Joi.string().required(),
        phoneNumber: Joi.string().required(),
        email: Joi.string().email().required(),
      })
      .required(),
    userId: Joi.string().custom(objectId),
  }),
};

const getHistory = {
  headers: Joi.object().keys({
    userId: Joi.string().required(),
  }),
};

const forwardDocumentStatus = {
  headers: Joi.object().keys({
    userId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    action: Joi.string().valid('accept', 'reject').required(),
    feedback: Joi.string().when('action', {
      is: 'reject',
      then: Joi.required(),
      otherwise: Joi.optional(), // Changed from Joi.forbidden() to Joi.optional()
    }),
  }),
};

const approveSignatureByUser = {
  body: Joi.object().keys({
    documentId: Joi.string().required(),
    amount: Joi.number().required(),
  }),
};

const approveSignatureBySecretary = {
  body: Joi.object().keys({
    documentId: Joi.string().required(),
  }),
};

const getHistoryByUserId = {
  params: Joi.object().keys({
    userId: Joi.string().required(),
  }),
};

const getHistoryWithStatus = {
  headers: Joi.object().keys({
    userId: Joi.string().required(),
  }),
};

module.exports = {
  createDocument,
  getHistory,
  forwardDocumentStatus,
  approveSignatureByUser,
  approveSignatureBySecretary,
  getHistoryByUserId,
  getHistoryWithStatus,
};
