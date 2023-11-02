import express from 'express';
import { Database } from '../../db/conn';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import {
  REWARDS_COLLECTION,
  TRANSFERS_COLLECTION,
  USERS_COLLECTION,
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

/**
 * GET /v2/stats/app
 *
 * @summary Get App stats
 * @description Gets app stats
 * @tags Stats
 * @security BearerAuth
 * @param {string} history.query - Set to `true` to include a last week history
 * @return {object} 200 - Success response with stats object
 * @example response - 200 - Success response example
 * {
 *    "users": {
 *      "total": 100,
 *      "new": {
 *        "hour": 1,
 *        "day": 10
 *      },
 *      "withContacts": {
 *        "total": 20,
 *        "new": {
 *          "hour": 0,
 *          "day": 1
 *        }
 *      }
 *    }
 * }
 */
router.get('/app', async (req, res) => {
  console.log(`App stats requested`);
  const timestamp = new Date().getTime();
  try {
    const db = await Database.getInstance(req);

    const stats: AppStatsResponse = {
      users: {
        total: await db
          .collection(USERS_COLLECTION)
          .countDocuments({ webAppOpened: { $exists: true } }),
        new: {
          hour: await db.collection(USERS_COLLECTION).countDocuments({
            webAppOpenedFirstDate: {
              $gte: new Date(new Date().getTime() - 60 * 60 * 1000),
            },
          }),
          day: await db.collection(USERS_COLLECTION).countDocuments({
            webAppOpenedFirstDate: {
              $gte: new Date(new Date().getTime() - 24 * 60 * 60 * 1000),
            },
          }),
        },
        withContacts: {
          total: await db
            .collection(USERS_COLLECTION)
            .countDocuments({ telegramSession: { $exists: true } }),
          new: {
            hour: await db.collection(USERS_COLLECTION).countDocuments({
              telegramSessionSavedDate: {
                $gte: new Date(new Date().getTime() - 60 * 60 * 1000),
              },
            }),
            day: await db.collection(USERS_COLLECTION).countDocuments({
              telegramSessionSavedDate: {
                $gte: new Date(new Date().getTime() - 24 * 60 * 60 * 1000),
              },
            }),
          },
        },
      },
    };

    if (req.query.history && req.query.history === 'true') {
      stats.users.new.history = await db
        .collection(USERS_COLLECTION)
        .aggregate([
          {
            $match: {
              webAppOpenedFirstDate: {
                $gte: new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000),
              },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$webAppOpenedFirstDate',
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray();

      stats.users.withContacts.new.history = await db
        .collection(USERS_COLLECTION)
        .aggregate([
          {
            $match: {
              telegramSessionSavedDate: {
                $gte: new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000),
              },
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$telegramSessionSavedDate',
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ])
        .toArray();
    }

    console.log(
      `App stats request completed in ${new Date().getTime() - timestamp}ms`
    );
    return res.status(200).send(stats);
  } catch (error) {
    console.error(`Error getting app stats`, JSON.stringify(error));
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

type AppStatsResponse = {
  users: {
    total: number;
    new: {
      hour: number;
      day: number;
      history?: { _id: string; count: number }[];
    };
    withContacts: {
      total: number;
      new: {
        hour: number;
        day: number;
        history?: { _id: string; count: number }[];
      };
    };
  };
};

export default router;
