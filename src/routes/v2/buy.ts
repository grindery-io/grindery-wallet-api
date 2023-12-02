import express from 'express';
import crypto from 'crypto';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import { Database } from '../../db/conn';
import { USERS_COLLECTION } from '../../utils/constants';

const router = express.Router();

/**
 * GET /v2/buy/sign-url
 *
 * @summary Sign url for buy widget
 * @description Signs url for moonpay widget
 * @tags Buy
 * @security BearerAuth
 * @param {string} url.query - Url to sign
 * @return {string} 200 - Success response
 */
router.get('/sign-url', telegramHashIsValid, async (req, res) => {
  if (!req.query.url || typeof req.query.url !== 'string') {
    return res.status(400).json({ error: 'Invalid url' });
  }
  console.log(`User [${res.locals.userId}] requested url signature`);
  const originalUrl = req.query.url as string;

  try {
    const db = await Database.getInstance(req);

    const user = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: res.locals.userId });

    if (!user || (user.isBanned && user.isBanned !== 'false')) {
      return res.status(400).json({ error: 'User is banned' });
    }

    const signature = crypto
      .createHmac('sha256', process.env.MOONPAY_SK || '')
      .update(new URL(originalUrl).search)
      .digest('base64');

    console.log(`User [${res.locals.userId}] url signature request completed`);
    return res.status(200).json({ signature });
  } catch (error) {
    console.error(
      `Error signing url for user ${res.locals.userId}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
});

export default router;
