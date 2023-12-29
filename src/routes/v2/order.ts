import express, { Request } from 'express';
import axios from 'axios';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import { Database } from '../../db/conn';
import { GX_ORDER_COLLECTION, USERS_COLLECTION } from '../../utils/constants';
const router = express.Router();

/**
 * GET /v2/order/quote
 *
 * @summary Get GX convert quote
 * @description Gets GX token convertion quote
 * @tags Order
 * @security BearerAuth
 * @param {string} convert.query - amount of g1 tokenbs to convert
 * @param {string} add.query - usd amount to add
 * @return {object} 200 - Success response
 */
router.get('/quote', telegramHashIsValid, async (req, res) => {
  console.log(`User [${res.locals.userId}] requested convert quote`);
  if (!req.query.convert || typeof req.query.convert !== 'string') {
    return res.status(400).json({ error: 'Invalid convert amount' });
  }
  if (!req.query.add || typeof req.query.add !== 'string') {
    return res.status(400).json({ error: 'Invalid add amount' });
  }
  try {
    const result = await axios.get(
      `https://bot-auth-api.grindery.org/v1/tge/conversion-information?g1Quantity=${req.query.convert}&usdQuantity=${req.query.add}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
        },
      }
    );
    console.log(`User [${res.locals.userId}] convert quote request completed`);
    return res.status(200).send(result.data);
  } catch (error) {
    console.error(
      `Error getting g1 convertion quote for user ${res.locals.userId}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
});

/**
 * POST /v2/order
 *
 * @summary Place an order
 * @description Places an order and sends g1 tokens
 * @tags Order
 * @security BearerAuth
 * @param {string} quoteId.body - gx exchange quote ID
 * @return {object} 200 - Success response
 */
router.post('/', telegramHashIsValid, async (req, res) => {
  console.log(`User [${res.locals.userId}] requested order`);
  if (!req.body.quoteId || typeof req.body.quoteId !== 'string') {
    return res.status(400).json({ error: 'Invalid quote ID' });
  }
  try {
    const result = await axios.post(
      `https://bot-auth-api.grindery.org/v1/tge/pre-order`,
      {
        quoteId: req.body.quoteId,
        userTelegramID: res.locals.userId,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
        },
      }
    );
    console.log(`User [${res.locals.userId}] order request completed`);
    return res.status(200).send(result.data);
  } catch (error) {
    console.error(
      `Error placing g1 order for user ${res.locals.userId}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
});

/**
 * GET /v2/order/{orderId}
 *
 * @summary Get order status
 * @description Gets order status
 * @tags Order
 * @security BearerAuth
 * @return {object} 200 - Success response
 */
router.get('/status', telegramHashIsValid, async (req: Request, res) => {
  console.log(`User [${res.locals.userId}] requested order status`);
  if (!req.params.orderId) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }
  try {
    const result = await axios.get(
      `https://bot-auth-api.grindery.org/v1/tge/order-status?orderId=${req.params.orderId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
        },
      }
    );
    console.log(`User [${res.locals.userId}] order status request completed`);
    return res.status(200).send(result.data);
  } catch (error) {
    console.error(
      `Error getting g1 order status for user ${res.locals.userId}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
});

/**
 * GET /v2/order
 *
 * @summary Get user's order status
 * @description Gets user's current order status
 * @tags Order
 * @security BearerAuth
 * @return {object} 200 - Success response
 */
router.get('/', telegramHashIsValid, async (req: Request, res) => {
  console.log(`User [${res.locals.userId}] requested current order status`);

  try {
    const db = await Database.getInstance(req);
    const user = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: res.locals.userId });

    if (!user || (user.isBanned && user.isBanned !== 'false')) {
      return res.status(400).json({ error: 'User is banned' });
    }

    const order = await db.collection(GX_ORDER_COLLECTION).findOne({
      userTelegramID: res.locals.userId,
    });

    if (!order?.orderId) {
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log(
      `User [${res.locals.userId}] current order status request completed`
    );
    return res.status(200).send(order);
  } catch (error) {
    console.error(
      `Error getting current order status for user ${res.locals.userId}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
});

/**
 * PATCH /v2/order/{orderId}
 *
 * @summary Pay order usd amount
 * @description Updates order and sends usd transaction in selected token
 * @tags Order
 * @security BearerAuth
 * @param {string} orderId.path - order ID
 * @param {string} tokenAdddress.body - selected token address
 * @param {string} chainId.body - selected chain id
 * @return {object} 200 - Success response
 */
router.patch('/:orderId', telegramHashIsValid, async (req, res) => {
  console.log(`User [${res.locals.userId}] requested order payment`);
  if (!req.params.orderId) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }
  if (!req.body.tokenAddress || typeof req.body.tokenAddress !== 'string') {
    return res.status(400).json({ error: 'Invalid token address' });
  }
  if (!req.body.chainId || typeof req.body.chainId !== 'string') {
    return res.status(400).json({ error: 'Invalid chain ID' });
  }
  try {
    const result = await axios.patch(
      `https://bot-auth-api.grindery.org/v1/tge/complete-order`,
      {
        orderId: req.params.orderId,
        tokenAddress: req.body.tokenAddress,
        chainId: req.body.chainId,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
        },
      }
    );
    console.log(`User [${res.locals.userId}] order payment request completed`);
    return res.status(200).send(result.data);
  } catch (error) {
    console.error(
      `Error paying g1 order for user ${res.locals.userId}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
});

export default router;
