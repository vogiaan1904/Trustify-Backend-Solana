const cron = require('node-cron');
const { Token } = require('../models');
const { autoForwardPendingToVerification } = require('./notarization.service');

const deleteExpiredTokens = async () => {
  try {
    const expiredTokens = await Token.find({
      expires: { $lt: new Date() },
    });

    if (expiredTokens.length > 0) {
      await Token.deleteMany({
        _id: { $in: expiredTokens.map((token) => token._id) },
      });
      console.log(`Deleted ${expiredTokens.length} expired tokens.`);
    } else {
      console.log('No expired tokens found.');
    }
  } catch (error) {
    console.error('Error deleting expired tokens:', error);
  }
};

const startCronJob = () => {
  cron.schedule('0 0 * * *', deleteExpiredTokens);

  // Schedule the auto-forwarding job to run every minute
  cron.schedule('* * * * *', autoForwardPendingToVerification);
};

module.exports = { startCronJob };
