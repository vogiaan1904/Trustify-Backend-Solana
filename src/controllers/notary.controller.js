const httpStatus = require('http-status');
const notaryService = require('../services/notary.service');
const catchAsync = require('../utils/catchAsync');

const getProcessingSessionsDocuments = catchAsync(async (req, res) => {
  const notary = await notaryService.getProcessingSessionsDocuments();
  res.status(httpStatus.OK).send(notary);
});

const getSignatureSessionsDocuments = catchAsync(async (req, res) => {
  const notary = await notaryService.getSignatureSessionsDocuments();
  res.status(httpStatus.OK).send(notary);
});

const getNotaryApproved = catchAsync(async (req, res) => {
  const notary = await notaryService.getNotaryApproved(req.user.id);
  res.status(httpStatus.OK).send(notary);
});

const getAcceptanceRate = catchAsync(async (req, res) => {
  const notary = await notaryService.getAcceptanceRate();
  res.status(httpStatus.OK).send(notary);
});

module.exports = {
  getProcessingSessionsDocuments,
  getSignatureSessionsDocuments,
  getNotaryApproved,
  getAcceptanceRate,
};
