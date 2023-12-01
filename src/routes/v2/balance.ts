import express from 'express';
import Web3 from 'web3';
import { CHAIN_MAPPING } from '../../utils/chains';
import BigNumber from 'bignumber.js';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import { Database } from '../../db/conn';
import {
  USERS_COLLECTION,
  WALLET_USERS_COLLECTION,
} from '../../utils/constants';
import axios from 'axios';

const ERC20 = require('../../abi/ERC20.json');
const router = express.Router();

/**
 * POST /v2/balance
 *
 * @summary Request user token balance
 * @description Gets bot user tokens balance from chain
 * @tags Balance
 * @security BearerAuth
 * @param {object} request.body - Request body
 * @return {object} 200 - Success response with balance
 * @example request - Example request body
 * {
 *   "chainId": "eip155:137",
 *   "contractAddress": "0x1234",
 *   "userAddress": "0x1234567"
 * }
 * @example response - 200 - Success response example
 * {
 *   "balanceWei": 1000000000000000000,
 *   "balanceEther": 1
 * }
 */
router.post('/', async (req, res) => {
  try {
    const web3 = new Web3(CHAIN_MAPPING[req.body.chainId][1]);
    let balance: any = 0;
    let decimals = 18;
    if (
      !req.body.contractAddress ||
      req.body.contractAddress === '0x0' ||
      req.body.contractAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    ) {
      balance = await web3.eth.getBalance(req.body.userAddress);
    } else {
      const contract = new web3.eth.Contract(ERC20, req.body.contractAddress);

      balance = await contract.methods.balanceOf(req.body.userAddress).call();
      decimals = await contract.methods.decimals().call();
    }

    res.status(200).json({
      balanceWei: balance,
      balanceEther: BigNumber(balance)
        .div(BigNumber(10).pow(BigNumber(decimals)))
        .toString(),
    });
  } catch (error: any) {
    console.error('Error:', JSON.stringify(error));
    res.status(500).json({ error: error?.message || '' });
  }
});

/**
 * GET /v2/balance
 *
 * @summary Get user balance
 * @description Gets balance for all user tokens
 * @tags Balance
 * @security BearerAuth
 * @param {string} chain.query - blockchain name, or a comma separated list of names. See https://www.ankr.com/docs/advanced-api/token-methods/#ankr_getaccountbalance.
 * @return {object} 200 - Success response
 */
router.get('/', telegramHashIsValid, async (req, res) => {
  console.log(`User [${res.locals.userId}] requested balance`);
  try {
    const db = await Database.getInstance(req);

    const user = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: res.locals.userId });

    if (!user || (user.isBanned && user.isBanned !== 'false')) {
      return res.status(400).json({ error: 'User is banned' });
    }

    const balance = await axios.post(
      `https://rpc.ankr.com/multichain/${process.env.ANKR_KEY || ''}`,
      {
        jsonrpc: '2.0',
        method: 'ankr_getAccountBalance',
        params: {
          blockchain: req.query.chain
            ? (req.query.chain as string).split(',')
            : 'polygon',
          walletAddress: user?.patchwallet || '',
          onlyWhitelisted: false,
        },
        id: new Date().toString(),
      },
      {
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (balance.data?.result) {
      await db.collection(WALLET_USERS_COLLECTION).updateOne(
        { userTelegramID: res.locals.userId },
        {
          $set: {
            balance: balance.data?.result,
            userTelegramID: res.locals.userId,
          },
        },
        { upsert: true }
      );
    }

    console.log(`User [${res.locals.userId}] balance request completed`);
    return res.status(200).json(balance.data?.result || {});
  } catch (error) {
    console.error(
      `Error getting balance for user ${res.locals.userId}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
});

export default router;
