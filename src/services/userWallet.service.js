const httpStatus = require('http-status');
const { UserWallet } = require('../models');
const ApiError = require('../utils/ApiError'); // Adjust the path as necessary

/**
 * Adds an NFT to the user's wallet.
 *
 * @param {ObjectId} userId - The ID of the user.
 * @param {Object} nftData - The NFT data to be added.
 * @param {string} nftData.transactionHash - The hash of the minting transaction.
 * @param {number} nftData.amount - The amount of NFTs minted.
 * @param {string} nftData.tokenId - The token ID of the minted NFT.
 * @param {string} nftData.tokenURI - The URI containing metadata of the NFT.
 * @param {string} nftData.contractAddress - The smart contract address of the NFT.
 * @returns {Promise<UserWallet>} - The updated user wallet.
 * @throws {ApiError} - If the operation fails.
 */
const addNFTToWallet = async (userId, nftData) => {
  try {
    let userWallet = await UserWallet.findOne({ user: userId });

    if (!userWallet) {
      // If the user doesn't have a wallet, create one
      userWallet = new UserWallet({
        user: userId,
        nftItems: [nftData],
      });
    } else {
      // Check for duplicate transactionHash to prevent duplicates
      const exists = userWallet.nftItems.some((item) => item.transactionHash === nftData.transactionHash);

      if (exists) {
        throw new ApiError(httpStatus.CONFLICT, 'NFT with this transaction hash already exists in the wallet.');
      }

      // Add the new NFT to the wallet
      userWallet.nftItems.push(nftData);
    }

    // Save the updated wallet
    await userWallet.save();
    return userWallet;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Error adding NFT to wallet:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add NFT to wallet');
  }
};

module.exports = {
  addNFTToWallet,
};
