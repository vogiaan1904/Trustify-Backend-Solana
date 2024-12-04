const httpStatus = require('http-status');
const { StatusTracking, SessionStatusTracking, ApproveHistory, ApproveSessionHistory } = require('../models');
const moment = require('moment');
const ApiError = require('../utils/ApiError');

const getDateRanges = (unit, subtractValue) => {
  const start = moment().subtract(subtractValue, unit).startOf(unit).toDate();
  const end = moment().subtract(subtractValue, unit).endOf(unit).toDate();
  const previousStart = moment(start).subtract(1, unit).toDate();
  const previousEnd = moment(end).subtract(1, unit).toDate();
  return { start, end, previousStart, previousEnd };
};

const getSignatureSessionsDocuments = async (req, res) => {
  try {
    const status = 'digitalSignature';
    const { start: crtStart, end: crtEnd, previousStart: prsStart, previousEnd: prsEnd } = getDateRanges('day', 0);

    const [crtSessions, prsSessions, crtDocuments, prsDocuments, totalSessions, totalDocuments] = await Promise.all([
      SessionStatusTracking.countDocuments({ status, createdAt: { $gte: crtStart, $lte: crtEnd } }),
      SessionStatusTracking.countDocuments({ status, createdAt: { $gte: prsStart, $lte: prsEnd } }),
      StatusTracking.countDocuments({ status, createdAt: { $gte: crtStart, $lte: crtEnd } }),
      StatusTracking.countDocuments({ status, createdAt: { $gte: prsStart, $lte: prsEnd } }),
      SessionStatusTracking.countDocuments({ status }),
      StatusTracking.countDocuments({ status }),
    ]);

    const currentTotal = crtSessions + crtDocuments;
    const previousTotal = prsSessions + prsDocuments;
    const change = currentTotal - previousTotal;
    const total = totalSessions + totalDocuments;

    return { total, change };
  } catch (error) {
    console.error('Error in getDigitalSignatureSessionsDocumentsMetrics:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An error occurred while fetching the metrics');
  }
};

// Lấy thông tin "Processing" metrics
const getProcessingSessionsDocuments = async (req, res) => {
  try {
    const status = 'processing';
    const { start: crtStart, end: crtEnd, previousStart: prsStart, previousEnd: prsEnd } = getDateRanges('month', 1);

    const [crtSessions, prsSessions, crtDocuments, prsDocuments, totalSessions, totalDocuments] = await Promise.all([
      SessionStatusTracking.countDocuments({ status, updatedAt: { $gte: crtStart, $lte: crtEnd } }),
      SessionStatusTracking.countDocuments({ status, updatedAt: { $gte: prsStart, $lte: prsEnd } }),
      StatusTracking.countDocuments({ status, updatedAt: { $gte: crtStart, $lte: crtEnd } }),
      StatusTracking.countDocuments({ status, updatedAt: { $gte: prsStart, $lte: prsEnd } }),
      SessionStatusTracking.countDocuments({ status }),
      StatusTracking.countDocuments({ status }),
    ]);

    const currentTotal = crtSessions + crtDocuments;
    const previousTotal = prsSessions + prsDocuments;
    const growthPercent = previousTotal === 0 ? 100 : ((currentTotal - previousTotal) / previousTotal) * 100;
    const total = totalSessions + totalDocuments;

    return { total, growthPercent };
  } catch (error) {
    console.error('Error in getProcessingSessionsDocumentsMetrics:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'An error occurred while fetching the processing metrics');
  }
};

// Hàm lấy thông tin "Notary Approved" metrics
const getNotaryApproved = async (id) => {
  try {
    const userid = id;
    const afterStatus = 'completed';
    const { start: crtStart, end: crtEnd, previousStart: prsStart, previousEnd: prsEnd } = getDateRanges('month', 1);
    const [
      crtApprovedSessions,
      prsApprovedSessions,
      crtApprovedDocuments,
      prsApprovedDocuments,
      totalApprovedSessions,
      totalApprovedDocuments,
    ] = await Promise.all([
      ApproveSessionHistory.countDocuments({ afterStatus, createdDate: { $gte: crtStart, $lte: crtEnd }, userId: userid }),
      ApproveSessionHistory.countDocuments({ afterStatus, createdDate: { $gte: prsStart, $lte: prsEnd }, userId: userid }),
      ApproveHistory.countDocuments({ afterStatus, createdDate: { $gte: crtStart, $lte: crtEnd }, userId: userid }),
      ApproveHistory.countDocuments({ afterStatus, createdDate: { $gte: prsStart, $lte: prsEnd }, userId: userid }),
      ApproveSessionHistory.countDocuments({ afterStatus, userId: userid }),
      ApproveHistory.countDocuments({ afterStatus, userId: userid }),
    ]);
    const currentTotal = crtApprovedSessions + crtApprovedDocuments;
    const previousTotal = prsApprovedSessions + prsApprovedDocuments;
    const growthPercent = previousTotal === 0 ? 100 : ((currentTotal - previousTotal) / previousTotal) * 100;
    const total = totalApprovedSessions + totalApprovedDocuments;

    return { total, growthPercent };
  } catch (error) {
    console.error('Error in getNotaryApproved:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'An error occurred while fetching the approval metrics'
    );
  }
};

const getAcceptanceRate = async (req, res) => {
  try {
    const afterStatus1 = 'digitalSignature';
    const beforeStatus1 = 'processing';
    const afterStatus2 = 'completed';
    const beforeStatus2 = 'digitalSignature';
    const { start: crtStart, end: crtEnd, previousStart: prsStart, previousEnd: prsEnd } = getDateRanges('week', 1);
    const [
      crtProcessingSessions,
      prsProcessingSessions,
      crtCompletedSessions,
      prsCompletedSessions,
      totalProcessingSessions,
      totalCompletedSessions,
    ] = await Promise.all([
      ApproveSessionHistory.countDocuments({
        beforeStatus: beforeStatus1,
        afterStatus: afterStatus1,
        createdDate: { $gte: crtStart, $lte: crtEnd },
      }),
      ApproveSessionHistory.countDocuments({
        beforeStatus: beforeStatus1,
        afterStatus: afterStatus1,
        createdDate: { $gte: prsStart, $lte: prsEnd },
      }),
      ApproveSessionHistory.countDocuments({
        beforeStatus: beforeStatus2,
        afterStatus: afterStatus2,
        createdDate: { $gte: crtStart, $lte: crtEnd },
      }),
      ApproveSessionHistory.countDocuments({
        beforeStatus: beforeStatus2,
        afterStatus: afterStatus2,
        createdDate: { $gte: prsStart, $lte: prsEnd },
      }),
      ApproveSessionHistory.countDocuments({
        afterStatus: afterStatus1,
      }),
      ApproveSessionHistory.countDocuments({
        afterStatus: afterStatus2,
      }),
    ]);

    const currentProcessingTotal = crtProcessingSessions + crtCompletedSessions;
    const previousProcessingTotal = prsProcessingSessions + prsCompletedSessions;
    const growthPercent =
      previousProcessingTotal === 0
        ? 100
        : ((currentProcessingTotal - previousProcessingTotal) / previousProcessingTotal) * 100;
    const total = totalProcessingSessions + totalCompletedSessions;

    // Trả kết quả
    return { total, growthPercent };
  } catch (error) {
    console.error('Error in getNotaryApproved:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'An error occurred while fetching the approval metrics'
    );
  }
};

module.exports = {
  getProcessingSessionsDocuments,
  getSignatureSessionsDocuments,
  getNotaryApproved,
  getAcceptanceRate,
};
