const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { userWalletService } = require('../services');
const ApiError = require('../utils/ApiError');

/**
 * Add NFT to user wallet
 */
const addNFT = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const nftData = req.body;

  const userWallet = await userWalletService.addNFTToWallet(userId, nftData);

  res.status(httpStatus.CREATED).send(userWallet);
});

/**
 * Get user wallet
 */
const getWallet = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const userWallet = await userWalletService.getWallet(userId);

  if (!userWallet) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User wallet not found');
  }

  res.status(httpStatus.OK).send(userWallet);
});

/**
 * Transfer a specific amount of an NFT from user's wallet to another user
 */
const transferNFT = catchAsync(async (req, res) => {
  const fromUserId = req.user.id;
  const { transactionHash, toUserEmail, amount } = req.body;

  await userWalletService.transferNFT(fromUserId, toUserEmail, transactionHash, amount);

  res.status(httpStatus.OK).send({ message: 'NFT transferred successfully' });
});

module.exports = {
  addNFT,
  getWallet,
  transferNFT,
};
