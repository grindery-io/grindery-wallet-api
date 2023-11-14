import express from 'express';
import axios from 'axios';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import { Database } from '../../db/conn';
import { USERS_COLLECTION } from '../../utils/constants';
import Web3 from 'web3';

const router = express.Router();
const swapFloodControl: any = {};

/**
 * POST /v2/swap
 *
 * @summary Swap tokens
 * @description Swap tokens from a telegram webapp
 * @tags Swap
 * @security BearerAuth
 * @param {object} request.body - The request body containing the swap tx data
 * @return {object} 200 - Success response with session and status
 * @return {object} 404 - Error response if operation not found
 * @example request - Example request body
 * {
 *  "to": "0x",
 *  "data": "0x",
 *  "value": "100",
 *  "tokenIn": "0x",
 *  "amountIn": "100",
 *  "tokenOut": "0x",
 *  "amountOut": "100",
 *  "gas": "100",
 *  "priceImpact": "100"
 * }
 * @example response - 200 - Success response example
 * {
 *   "success": true,
 *   "messageId": "some-uuid"
 * }
 * @example response - 500 - Error response example
 * {
 *   "success": false,
 *   "error": "error message"
 * }
 */
router.post('/', telegramHashIsValid, async (req, res) => {
  if (
    !req.body.to ||
    !req.body.data ||
    !req.body.value ||
    !req.body.tokenIn ||
    !req.body.tokenOut ||
    !req.body.amountIn ||
    !req.body.amountOut
  ) {
    return res.status(400).json({ error: 'Missing required params' });
  }
  console.log(`User [${res.locals.userId}] requested tokens swap`);

  // Check flood control
  if (
    swapFloodControl[res.locals.userId] &&
    swapFloodControl[res.locals.userId] > new Date().getTime()
  ) {
    const newTimeout = new Date().getTime() + 30000;
    swapFloodControl[res.locals.userId] = newTimeout;
    console.info(
      `User [${
        res.locals.userId
      }] too many requests, tokens swap blocked until ${new Date(
        swapFloodControl[res.locals.userId]
      )}`
    );
    return res.status(429).send({ msg: 'Too many requests' });
  }

  try {
    const db = await Database.getInstance(req);

    const user = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: res.locals.userId });

    if (!user || (user.isBanned && user.isBanned !== 'false')) {
      return res.status(400).json({ error: 'User is banned' });
    }

    const tokenIn = await axios.get(
      `https://api.enso.finance/api/v1/baseTokens?chainId=137&address=${req.body.tokenIn}`
    );

    const amountIn = String(
      Web3.utils.toBN(
        parseFloat(req.body.amountIn as string) *
          10 ** (tokenIn?.data?.[0]?.decimals || 18)
      )
    );

    const data = {
      event: 'swap',
      params: {
        userTelegramID: res.locals.userId,
        to: req.body.to,
        data: req.body.data,
        value: req.body.value,
        tokenIn: req.body.tokenIn,
        amountIn: amountIn,
        tokenOut: req.body.tokenOut,
        amountOut: req.body.amountOut,
        gas: req.body.gas,
        priceImpact: req.body.priceImpact,
      },
    };

    const eventRes = await axios.post(
      `https://bot-auth-api.grindery.org/v1/webhook`,
      data,
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`User [${res.locals.userId}] swap request completed`);

    // Set flood control
    swapFloodControl[res.locals.userId] = new Date().getTime() + 30000;
    return res.status(200).json({ success: eventRes.data?.success || false });
  } catch (error) {
    console.error(
      `Error swapping tokens for user ${res.locals.userId}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
});

/**
 * GET /v2/swap
 *
 * @summary Get swap routes
 * @description Gets swap routes from ENSO API
 * @tags Swap
 * @security BearerAuth
 * @param {string} tokenIn.query - Token In contract address
 * @param {string} tokenOut.query - Token Out contract address
 * @param {string} amountIn.query - Amount In (in wei)
 * @return {object} 200 - Success response with stats object
 * @example response - 200 - Success response example
 * []
 */
router.get('/', telegramHashIsValid, async (req, res) => {
  if (!req.query.tokenIn || !req.query.tokenOut || !req.query.amountIn) {
    res.status(400).json({ error: 'Missing required params' });
  }
  console.log(`User [${res.locals.userId}] requested swap routes`);
  try {
    const db = await Database.getInstance(req);

    const user = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: res.locals.userId });

    if (!user || (user.isBanned && user.isBanned !== 'false')) {
      return res.status(400).json({ error: 'User is banned' });
    }

    const tokenIn = await axios.get(
      `https://api.enso.finance/api/v1/baseTokens?chainId=137&address=${req.query.tokenIn}`
    );

    const amountIn = String(
      Web3.utils.toBN(
        parseFloat(req.query.amountIn as string) *
          10 ** (tokenIn?.data?.[0]?.decimals || 18)
      )
    );

    const routes = await axios.get(
      `https://api.enso.finance/api/v1/shortcuts/route?fromAddress=${user.patchwallet}&tokenIn=${req.query.tokenIn}&amountIn=${amountIn}&tokenOut=${req.query.tokenOut}&toEOA=true&priceImpact=true&chainId=137&tokenInAmountToTransfer=${amountIn}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.ENSO_API_KEY}`,
        },
      }
    );
    console.log(`User [${res.locals.userId}] swap routes request completed`);
    return res.status(200).json(routes.data);
  } catch (error) {
    console.error(
      `Error getting swap routes for user ${res.locals.userId}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
});

export default router;
