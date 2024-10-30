const moment = require('moment');
const { Document, User, Session, Payment } = require('../models');

const getDocumentCount = async (period) => {
  let start;
  let end;
  let subtractValue;
  let subtractUnit;

  switch (period) {
    case 'today':
      start = moment().startOf('day').toDate();
      end = moment().endOf('day').toDate();
      subtractValue = 1;
      subtractUnit = 'day';
      break;
    case 'yesterday':
      start = moment().subtract(1, 'day').startOf('day').toDate();
      end = moment().subtract(1, 'day').endOf('day').toDate();
      subtractValue = 1;
      subtractUnit = 'day';
      break;
    case 'this_week':
      start = moment().startOf('week').toDate();
      end = moment().endOf('week').toDate();
      subtractValue = 1;
      subtractUnit = 'week';
      break;
    case 'this_month':
      start = moment().startOf('month').toDate();
      end = moment().endOf('month').toDate();
      subtractValue = 1;
      subtractUnit = 'month';
      break;
    case 'this_year':
      start = moment().startOf('year').toDate();
      end = moment().endOf('year').toDate();
      subtractValue = 1;
      subtractUnit = 'year';
      break;
    default:
      throw new Error(`Invalid period: ${period}`);
  }

  const previousStart = moment(start).subtract(subtractValue, subtractUnit).toDate();
  const previousEnd = moment(end).subtract(subtractValue, subtractUnit).toDate();

  const [currentCount, previousCount] = await Promise.all([
    Document.count({
      createdAt: { $gte: start, $lte: end },
    }),
    Document.count({
      createdAt: { $gte: previousStart, $lte: previousEnd },
    }),
  ]);

  const growthPercent = previousCount ? ((currentCount - previousCount) / previousCount) * 100 : 100;

  return {
    currentPeriod: {
      period,
      documentCount: currentCount,
    },
    previousPeriod: {
      period: `previous_${period}`,
      documentCount: previousCount,
    },
    growthPercent,
  };
};

const getUserCount = async (period) => {
  let start;
  let end;
  let subtractValue;
  let subtractUnit;

  switch (period) {
    case 'today':
      start = moment().startOf('day').toDate();
      end = moment().endOf('day').toDate();
      subtractValue = 1;
      subtractUnit = 'day';
      break;
    case 'this_week':
      start = moment().startOf('week').toDate();
      end = moment().endOf('week').toDate();
      subtractValue = 1;
      subtractUnit = 'week';
      break;
    case 'this_month':
      start = moment().startOf('month').toDate();
      end = moment().endOf('month').toDate();
      subtractValue = 1;
      subtractUnit = 'month';
      break;
    case 'this_year':
      start = moment().startOf('year').toDate();
      end = moment().endOf('year').toDate();
      subtractValue = 1;
      subtractUnit = 'year';
      break;
    case 'yesterday':
      start = moment().subtract(1, 'day').startOf('day').toDate();
      end = moment().subtract(1, 'day').endOf('day').toDate();
      subtractValue = 1;
      subtractUnit = 'day';
      break;
    default:
      throw new Error(`Invalid period: ${period}`);
  }

  const previousStart = moment(start).subtract(subtractValue, subtractUnit).toDate();
  const previousEnd = moment(end).subtract(subtractValue, subtractUnit).toDate();

  const [currentCount, previousCount] = await Promise.all([
    User.countDocuments({
      createdAt: { $gte: start, $lte: end },
    }),
    User.countDocuments({
      createdAt: { $gte: previousStart, $lte: previousEnd },
    }),
  ]);

  const growthPercent = previousCount ? ((currentCount - previousCount) / previousCount) * 100 : 100;

  return {
    currentPeriod: {
      period,
      userCount: currentCount,
    },
    previousPeriod: {
      period: `previous_${period}`,
      userCount: previousCount,
    },
    growthPercent,
  };
};

const getDocumentsByNotaryField = async (period) => {
  let start;
  let end;
  let subtractValue;
  let subtractUnit;

  switch (period) {
    case 'daily':
      start = moment().startOf('day').toDate();
      end = moment().endOf('day').toDate();
      subtractValue = 1;
      subtractUnit = 'day';
      break;
    case 'weekly':
      start = moment().startOf('week').toDate();
      end = moment().endOf('week').toDate();
      subtractValue = 1;
      subtractUnit = 'week';
      break;
    case 'monthly':
      start = moment().startOf('month').toDate();
      end = moment().endOf('month').toDate();
      subtractValue = 1;
      subtractUnit = 'month';
      break;
    case 'yearly':
      start = moment().startOf('year').toDate();
      end = moment().endOf('year').toDate();
      subtractValue = 1;
      subtractUnit = 'year';
      break;
    default:
      throw new Error(`Invalid period: ${period}`);
  }

  const previousStart = moment(start).subtract(subtractValue, subtractUnit).toDate();
  const previousEnd = moment(end).subtract(subtractValue, subtractUnit).toDate();
  console.log('start', start);
  console.log('end', end);
  console.log('previousStart', previousStart);
  console.log('previousEnd', previousEnd);

  const [currentDocuments, previousDocuments] = await Promise.all([
    Document.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      {
        $lookup: {
          from: 'notarizationFields',
          localField: 'notarizationField.id',
          foreignField: '_id',
          as: 'fieldInfo',
        },
      },
      { $unwind: '$fieldInfo' },
      {
        $group: {
          _id: '$fieldInfo.name',
          amount: { $sum: 1 },
        },
      },
      {
        $project: {
          notarizationFieldName: '$_id',
          amount: 1,
          _id: 0,
        },
      },
    ]),
    Document.aggregate([
      { $match: { createdAt: { $gte: previousStart, $lte: previousEnd } } },
      {
        $lookup: {
          from: 'notarizationFields',
          localField: 'notarizationField.id',
          foreignField: '_id',
          as: 'fieldInfo',
        },
      },
      { $unwind: '$fieldInfo' },
      {
        $group: {
          _id: '$fieldInfo.name',
          amount: { $sum: 1 },
        },
      },
      {
        $project: {
          notarizationFieldName: '$_id',
          amount: 1,
          _id: 0,
        },
      },
    ]),
  ]);

  return {
    currentPeriod: {
      period,
      totals: currentDocuments,
    },
    previousPeriod: {
      period: `previous_${period}`,
      totals: previousDocuments,
    },
  };
};

const getEmployeeCount = async () => {
  const notaryCount = await User.countDocuments({ role: 'notary' });
  const secretaryCount = await User.countDocuments({ role: 'secretary' });
  return {
    notaryCount,
    secretaryCount,
  };
};

const getEmployeeList = async () => {
  const employeeList = await User.find({ role: { $in: ['notary', 'secretary'] } });
  return employeeList;
};

const getSessionCount = async (period) => {
  let start;
  let end;
  let subtractValue;
  let subtractUnit;

  switch (period) {
    case 'daily':
      start = moment().startOf('day').toDate();
      end = moment().endOf('day').toDate();
      subtractValue = 1;
      subtractUnit = 'day';
      break;
    case 'weekly':
      start = moment().startOf('week').toDate();
      end = moment().endOf('week').toDate();
      subtractValue = 1;
      subtractUnit = 'week';
      break;
    case 'monthly':
      start = moment().startOf('month').toDate();
      end = moment().endOf('month').toDate();
      subtractValue = 1;
      subtractUnit = 'month';
      break;
    case 'yearly':
      start = moment().startOf('year').toDate();
      end = moment().endOf('year').toDate();
      subtractValue = 1;
      subtractUnit = 'year';
      break;
    default:
      throw new Error(`Invalid period: ${period}`);
  }

  const previousStart = moment(start).subtract(subtractValue, subtractUnit).toDate();
  const previousEnd = moment(end).subtract(subtractValue, subtractUnit).toDate();

  const [currentCount, previousCount] = await Promise.all([
    Session.countDocuments({
      $or: [{ startDate: { $gte: start, $lte: end } }, { endDate: { $gte: start, $lte: end } }],
    }),
    Session.countDocuments({
      $or: [
        { startDate: { $gte: previousStart, $lte: previousEnd } },
        { endDate: { $gte: previousStart, $lte: previousEnd } },
      ],
    }),
  ]);

  const growthPercent = previousCount ? ((currentCount - previousCount) / previousCount) * 100 : 100;

  return {
    currentPeriod: {
      period,
      sessionCount: currentCount,
    },
    previousPeriod: {
      period: `previous_${period}`,
      sessionCount: previousCount,
    },
    growthPercent,
  };
};

const getPaymentTotalByService = async (period) => {
  let currentStart;
  let currentEnd;
  let previousStart;
  let previousEnd;

  switch (period) {
    case 'daily':
      currentStart = moment().startOf('day').toDate();
      currentEnd = moment().endOf('day').toDate();
      previousStart = moment().subtract(1, 'day').startOf('day').toDate();
      previousEnd = moment().subtract(1, 'day').endOf('day').toDate();
      break;
    case 'weekly':
      currentStart = moment().startOf('week').toDate();
      currentEnd = moment().endOf('week').toDate();
      previousStart = moment().subtract(1, 'week').startOf('week').toDate();
      previousEnd = moment().subtract(1, 'week').endOf('week').toDate();
      break;
    case 'monthly':
      currentStart = moment().startOf('month').toDate();
      currentEnd = moment().endOf('month').toDate();
      previousStart = moment().subtract(1, 'month').startOf('month').toDate();
      previousEnd = moment().subtract(1, 'month').endOf('month').toDate();
      break;
    default:
      throw new Error(`Invalid period: ${period}`);
  }

  const [currentPayments, previousPayments] = await Promise.all([
    Payment.aggregate([
      { $match: { createdAt: { $gte: currentStart, $lte: currentEnd } } },
      {
        $lookup: {
          from: 'notarizationServices',
          localField: 'serviceId',
          foreignField: '_id',
          as: 'serviceInfo',
        },
      },
      { $unwind: '$serviceInfo' },
      {
        $group: {
          _id: '$serviceInfo.name',
          totalAmount: { $sum: '$amount' },
        },
      },
      {
        $project: {
          _id: 0,
          serviceName: '$_id',
          totalAmount: 1,
        },
      },
    ]),
    Payment.aggregate([
      { $match: { createdAt: { $gte: previousStart, $lte: previousEnd } } },
      {
        $lookup: {
          from: 'notarizationServices',
          localField: 'serviceId',
          foreignField: '_id',
          as: 'serviceInfo',
        },
      },
      { $unwind: '$serviceInfo' },
      {
        $group: {
          _id: '$serviceInfo.name',
          totalAmount: { $sum: '$amount' },
        },
      },
      {
        $project: {
          _id: 0,
          serviceName: '$_id',
          totalAmount: 1,
        },
      },
    ]),
  ]);

  return {
    currentPeriod: {
      period,
      totals: currentPayments,
    },
    previousPeriod: {
      period: `previous_${period}`,
      totals: previousPayments,
    },
  };
};

const getPaymentTotalByNotarizationField = async (period) => {
  let currentStart;
  let currentEnd;
  let previousStart;
  let previousEnd;

  switch (period) {
    case 'daily':
      currentStart = moment().startOf('day').toDate();
      currentEnd = moment().endOf('day').toDate();
      previousStart = moment().subtract(1, 'day').startOf('day').toDate();
      previousEnd = moment().subtract(1, 'day').endOf('day').toDate();
      break;
    case 'weekly':
      currentStart = moment().startOf('week').toDate();
      currentEnd = moment().endOf('week').toDate();
      previousStart = moment().subtract(1, 'week').startOf('week').toDate();
      previousEnd = moment().subtract(1, 'week').endOf('week').toDate();
      break;
    case 'monthly':
      currentStart = moment().startOf('month').toDate();
      currentEnd = moment().endOf('month').toDate();
      previousStart = moment().subtract(1, 'month').startOf('month').toDate();
      previousEnd = moment().subtract(1, 'month').endOf('month').toDate();
      break;
    default:
      throw new Error(`Invalid period: ${period}`);
  }

  const [currentFields, previousFields] = await Promise.all([
    Payment.aggregate([
      { $match: { createdAt: { $gte: currentStart, $lte: currentEnd } } },
      {
        $lookup: {
          from: 'notarizationFields',
          localField: 'fieldId',
          foreignField: '_id',
          as: 'fieldInfo',
        },
      },
      { $unwind: '$fieldInfo' },
      {
        $group: {
          _id: '$fieldInfo.name',
          totalAmount: { $sum: '$amount' },
        },
      },
      {
        $project: {
          _id: 0,
          fieldName: '$_id',
          totalAmount: 1,
        },
      },
    ]),
    Payment.aggregate([
      { $match: { createdAt: { $gte: previousStart, $lte: previousEnd } } },
      {
        $lookup: {
          from: 'notarizationFields',
          localField: 'fieldId',
          foreignField: '_id',
          as: 'fieldInfo',
        },
      },
      { $unwind: '$fieldInfo' },
      {
        $group: {
          _id: '$fieldInfo.name',
          totalAmount: { $sum: '$amount' },
        },
      },
      {
        $project: {
          _id: 0,
          fieldName: '$_id',
          totalAmount: 1,
        },
      },
    ]),
  ]);

  return {
    currentPeriod: {
      period,
      totals: currentFields,
    },
    previousPeriod: {
      period: `previous_${period}`,
      totals: previousFields,
    },
  };
};

const getPaymentTotal = async (period) => {
  let start;
  let end;

  switch (period) {
    case 'daily':
      start = moment().startOf('day').toDate();
      end = moment().endOf('day').toDate();
      break;
    case 'weekly':
      start = moment().startOf('week').toDate();
      end = moment().endOf('week').toDate();
      break;
    case 'monthly':
      start = moment().startOf('month').toDate();
      end = moment().endOf('month').toDate();
      break;
    case 'yearly':
      start = moment().startOf('year').toDate();
      end = moment().endOf('year').toDate();
      break;
    default:
      throw new Error(`Invalid period: ${period}`);
  }

  const [currentTotal] = await Payment.aggregate([
    { $match: { createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
    { $project: { _id: 0, totalAmount: 1 } },
  ]);

  return {
    period,
    totalAmount: currentTotal ? currentTotal.totalAmount : 0,
  };
};

module.exports = {
  getDocumentCount,
  getUserCount,
  getDocumentsByNotaryField,
  getEmployeeCount,
  getEmployeeList,
  getSessionCount,
  getPaymentTotalByService,
  getPaymentTotalByNotarizationField,
  getPaymentTotal,
};
