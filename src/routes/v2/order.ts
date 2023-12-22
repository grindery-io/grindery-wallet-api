import express from 'express';
import axios from 'axios';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
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

export default router;
