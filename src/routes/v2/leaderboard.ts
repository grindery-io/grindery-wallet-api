import express from 'express';
import { Database } from '../../db/conn';
import {
  REWARDS_COLLECTION,
  TRANSFERS_COLLECTION,
  USERS_COLLECTION,
} from '../../utils/constants';

const router = express.Router();

/**
 * GET /v2/leaderboard
 *
 * @summary Get leaderboard list
 * @description Fetches leaderboard data by aggregating user statistics based on transaction and reward records. Allows sorting, pagination, and filter features. Additionally, retrieves users' balances using Web3 integration.
 * @tags Leaderboard
 * @param {number} page.query - Specifies the page number for pagination. Defaults to 1.
 * @param {number} limit.query - Defines the number of results to return per page. Defaults to 10.
 * @param {string} sortBy.query - Indicates the field by which to sort the results. Defaults to "txCount".
 * @param {string} order.query - Dictates the sorting order. Can be either "asc" or "desc". Defaults to "desc".
 * @return {object[]} 200 - Success response, returning an array of aggregated user statistics tailored for the leaderboard.
 * @return {object} 500 - Error response containing an error message and details.
 * @example request - Sample Request
 * GET /v1/leaderboard?page=1&limit=10&sortBy=txCount&order=desc
 * @example response - 200 - Sample Success Response
 * {
 *  "items": [
 *    {
 *      "user": {
 *        "_id": "64f631feff2936fefd07ce3a",
 *        "userTelegramID": "5221262822",
 *        "userHandle": "divadonate",
 *        "userName": "Resa kikuk",
 *        "patchwallet": "0x3EcD632C733feBfEcc8c199fB69149e1696Bb9a2",
 *        "dateAdded": "2023-09-04T19:37:34.241Z"
 *      },
 *      "firstTx": "",
 *      "lastTx": "",
 *      "txCount": 5,
 *      "rewardsCount": 3,
 *      "referralsCount": 2
 *    }
 *  ],
 *  "total": 1
 * }
 * @example response - 500 - Sample Error Response
 * {
 *   "msg": "An error occurred",
 *   "error": "Detailed error message here"
 * }
 */
router.get('/', async (req, res) => {
  try {
    // pagination params
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const skip = (page - 1) * limit;

    // sort params
    const sortBy = req.query.sortBy || 'txCount';
    let order = req.query.order === 'asc' ? 1 : -1;

    const db = await Database.getInstance(req);

    const leaderboardData = await db
      .collection(USERS_COLLECTION)
      .aggregate([
        {
          $lookup: {
            from: TRANSFERS_COLLECTION,
            localField: 'userTelegramID',
            foreignField: 'senderTgId',
            as: 'transactions',
          },
        },
        {
          $lookup: {
            from: REWARDS_COLLECTION,
            localField: 'userTelegramID',
            foreignField: 'userTelegramID',
            as: REWARDS_COLLECTION,
          },
        },
        {
          $addFields: {
            firstTx: '',
            lastTx: '',
            txCount: { $size: '$transactions' },
            rewardsCount: { $size: '$rewards' },
            referralsCount: {
              $size: {
                $filter: {
                  input: '$rewards',
                  as: 'reward',
                  cond: { $eq: ['$$reward.reason', '2x_reward'] },
                },
              },
            },
          },
        },
        {
          $project: {
            user: {
              _id: '$_id',
              userTelegramID: '$userTelegramID',
              userHandle: '$userHandle',
              userName: '$userName',
              patchwallet: '$patchwallet',
              dateAdded: '$dateAdded',
              telegramSession: '$telegramSession',
              telegramSessionSavedDate: '$telegramSessionSavedDate',
              webAppOpenedFirstDate: '$webAppOpenedFirstDate',
            },
            firstTx: 1,
            lastTx: 1,
            txCount: 1,
            rewardsCount: 1,
            referralsCount: 1,
          },
        },
        {
          $sort: { [sortBy as string]: order },
        },
        {
          $skip: skip,
        },
        {
          $limit: limit,
        },
      ])
      .toArray();

    const leaderboardDataLength = await db
      .collection(USERS_COLLECTION)
      .estimatedDocumentCount();

    for (let user of leaderboardData) {
      const userDoc = user.user;
      if (userDoc.telegramSession) {
        userDoc.telegramSession = 'hidden';
      }
    }

    return res.status(200).send({
      items: leaderboardData,
      total: leaderboardDataLength,
    });
  } catch (error) {
    console.error('Error getting leaderboard data', JSON.stringify(error));
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

export default router;
