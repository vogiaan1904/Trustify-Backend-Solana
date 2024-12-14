// src/routes/v1/userWallet.route.js
const express = require('express');
const userWalletController = require('../../controllers/userWallet.controller');
const auth = require('../../middlewares/auth');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: UserWallet
 *   description: UserWallet management and retrieval
 */

/**
 * @swagger
 * /userWallet/wallet:
 *   get:
 *     summary: Get user wallet
 *     tags: [UserWallet]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User wallet retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                   description: User ID
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 *       500:
 *         description: Internal server error
 */

/**
 * @swagger
 * /userWallet/wallet/transfer:
 *   post:
 *     summary: Transfer a specific amount of an NFT from the user's wallet to another user
 *     tags: [UserWallet]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionHash
 *               - toUserId
 *               - amount
 *             properties:
 *               transactionHash:
 *                 type: string
 *                 description: The transaction hash of the NFT to transfer
 *               toUserId:
 *                 type: string
 *                 description: The User ID of the recipient
 *               amount:
 *                 type: number
 *                 description: The amount of NFTs to transfer
 *             example:
 *               transactionHash: '0x1234567890abcdef'
 *               toUserId: '5ebac534954b54139806c112'
 *               amount: 2
 *     responses:
 *       "200":
 *         description: NFT transferred successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: NFT transferred successfully
 *       "400":
 *         description: Bad Request - Invalid input data
 *       "401":
 *         description: Unauthorized access
 *       "404":
 *         description: User wallet or NFT not found
 *       "500":
 *         description: Internal Server Error
 */

/**
 * @route GET /userWallet/wallet
 * @desc Get user wallet
 */
router.route('/wallet').get(auth('getWallet'), userWalletController.getWallet);

/**
 * @route POST /userWallet/wallet/transfer
 * @desc Transfer a specific amount of an NFT to another user
 */
router.route('/wallet/transfer').post(auth('transferNFT'), userWalletController.transferNFT);

module.exports = router;
