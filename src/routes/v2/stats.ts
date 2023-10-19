import express from 'express';
import { Database } from '../../db/conn';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import {
  REWARDS_COLLECTION,
  TRANSFERS_COLLECTION,
} from '../../utils/constants';

const router = express.Router();

/**
 * GET /v2/stats
 *
 * @summary Get telegram user stats
 * @description Gets telegram user stats, such as amount of transactions, rewards, and referrals.
 * @tags Stats
 * @security BearerAuth
 * @return {object} 200 - Success response with stats object
 * @example response - 200 - Success response example
 * {
 *   "sentTransactions": 1,
 *   "receivedTransactions": 1,
 *   "rewards": 1,
 *   "referrals": 1
 * }
 */
router.get('/', telegramHashIsValid, async (req, res) => {
  console.log(`User [${res.locals.userId}] requested their stats`);
  try {
    const db = await Database.getInstance(req);

    const sentTransactions = await db
      .collection(TRANSFERS_COLLECTION)
      .countDocuments({ senderTgId: res.locals.userId });

    const receivedTransactions = await db
      .collection(TRANSFERS_COLLECTION)
      .countDocuments({ recipientTgId: res.locals.userId });

    const rewards = await db
      .collection(REWARDS_COLLECTION)
      .countDocuments({ userTelegramID: res.locals.userId });

    const referrals = await db.collection(REWARDS_COLLECTION).countDocuments({
      userTelegramID: res.locals.userId,
      reason: '2x_reward',
    });
    console.log(`User [${res.locals.userId}] stats request completed`);
    return res.status(200).send({
      sentTransactions,
      receivedTransactions,
      rewards,
      referrals,
    });
  } catch (error) {
    console.error(
      `Error getting user ${res.locals.userId} stats`,
      JSON.stringify(error)
    );
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

export default router;
