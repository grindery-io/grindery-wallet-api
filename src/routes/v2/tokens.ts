import express from 'express';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import axios from 'axios';

const router = express.Router();

/**
 * GET /v2/tokens/price
 *
 * @summary Get token price
 * @description Gets token price from coinmarketcap api
 * @tags Tokens
 * @security BearerAuth
 * @param {string} symbol.query - One or more comma-separated cryptocurrency symbols. Example: "BTC,ETH".
 * @return {object} 200 - Success response with token price
 * @example response - 200 - Success response example
 * []
 */
router.get('/price', telegramHashIsValid, async (req, res) => {
  if (!req.query.symbol) {
    res.status(400).json({ error: 'Missing required params' });
  }
  try {
    const quotes = await axios.get(
      `${process.env.COINMARKETCAP_API_URL}/v2/cryptocurrency/quotes/latest`,
      {
        headers: {
          'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY,
        },
        params: {
          symbol: req.query.symbol,
        },
      }
    );
    return res.status(200).json(quotes.data);
  } catch (error) {
    console.error(
      `Error getting token price for user ${res.locals.userId}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
});

export default router;
