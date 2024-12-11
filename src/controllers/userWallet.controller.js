const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { userWalletService } = require('../services');

/**
 * Add NFT to user wallet
 */
const addNFT = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const nftData = req.body;

  const userWallet = await userWalletService.addNFTToWallet(userId, nftData);

  res.status(httpStatus.CREATED).send(userWallet);
});

module.exports = {
  addNFT,
};
