import express from 'express';
import { Database } from './db/conn.js';
import { getUser } from './utils/telegram.js';
import telegramHashIsValid from './utils/telegramHashIsValid.js';
import { TRANSFERS_COLLECTION, USERS_COLLECTION } from './utils/constants.js';

const router = express.Router();

/**
 * GET /v2/activity
 *
 * @summary Get telegram user activity
 * @description Gets telegram user activity (transactions) from DB collection.
 * @tags Activity
 * @security BearerAuth
 * @param {number} limit.query - Limit number of results
 * @param {number} skip.query - Skip number of results
 * @param {string} sort.query - Sort by field
 * @param {string} order.query - Sort order (asc/desc)
 * @param {string} find.query - Filter results, stringified JSON array of mongodb find objects
 * @return {object} 200 - Success response with connection status
 * @example response - 200 - Success response example
 * {
 *   "docs": [
 *     {
 *       "_id": "6asdfghjff2936fefd07cf93",
 *       "TxId": "xdc3ooo",
 *       "chainId": "eip155:137",
 *       "tokenSymbol": "g1",
 *       "tokenAddress": "0xe36BD65609c08Cgavehr3520293523CF4560533d0",
 *       "senderTgId": "1899300004",
 *       "senderWallet": "0x1234556751f3D2e4dE9D8B860311936090bcaC95",
 *       "senderName": "undefined",
 *       "recipientTgId": "5900000139",
 *       "recipientWallet": "0x43371FD1Df1a3ee6550ca42f61956feasdfghj33",
 *       "tokenAmount": "10",
 *       "transactionHash": "0xdtgbrfve594b7950ef2e5fe6efa89eb4daf6e1424b641eee0dd4db2f8e5fdf8f",
 *       "dateAdded": "2021-01-01T00:00:00.000Z"
 *     }
 *   ],
 *   "total": 1
 * }
 */
router.get('/activity', telegramHashIsValid, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).send({ msg: 'Invalid user' });
    }
    const limit = req.query.limit ? parseInt(req.query.limit) : 25;
    const skip = req.query.skip ? parseInt(req.query.skip) : 0;
    const sort = req.query.sort || 'dateAdded';
    const order = req.query.order && req.query.order === 'asc' ? 1 : -1;
    const find = JSON.parse(req.query.find || '[]');
    const db = await Database.getInstance(req);
    const docs = await db
      .collection(TRANSFERS_COLLECTION)
      .find({
        $and: [
          {
            $or: [
              { senderTgId: user.id.toString() },
              { recipientTgId: user.id.toString() },
            ],
          },
          ...find,
        ],
      })
      .sort({ [sort]: order })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await db.collection(TRANSFERS_COLLECTION).countDocuments({
      $and: [
        {
          $or: [
            { senderTgId: user.id.toString() },
            { recipientTgId: user.id.toString() },
          ],
        },
        ...find,
      ],
    });

    return res.status(200).send({
      docs,
      total,
    });
  } catch (error) {
    console.error('Error getting activity', error);
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * GET /v2/rewards/received
 *
 * @summary Get user received rewards
 * @description Gets telegram user received rewards (transactions) from DB collection.
 * @tags Rewards
 * @security BearerAuth
 * @param {number} limit.query - Limit number of results
 * @param {number} skip.query - Skip number of results
 * @param {string} find.query - Filter results, stringified JSON array of mongodb find objects
 * @return {object} 200 - Success response with connection status
 * @example response - 200 - Success response example
 * {
 *   "docs": [
 *     {
 *       "_id": "6asdfghjff2936fefd07cf93",
 *       "TxId": "xdc3ooo",
 *       "chainId": "eip155:137",
 *       "tokenSymbol": "g1",
 *       "tokenAddress": "0xe36BD65609c08Cgavehr3520293523CF4560533d0",
 *       "senderTgId": "1899300004",
 *       "senderWallet": "0x1234556751f3D2e4dE9D8B860311936090bcaC95",
 *       "senderName": "undefined",
 *       "recipientTgId": "5900000139",
 *       "recipientWallet": "0x43371FD1Df1a3ee6550ca42f61956feasdfghj33",
 *       "tokenAmount": "10",
 *       "transactionHash": "0xdtgbrfve594b7950ef2e5fe6efa89eb4daf6e1424b641eee0dd4db2f8e5fdf8f",
 *       "dateAdded": "2021-01-01T00:00:00.000Z"
 *     }
 *   ],
 *   "total": 1
 * }
 */
router.get('/rewards/received', telegramHashIsValid, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).send({ msg: 'Invalid user' });
    }
    const limit = req.query.limit ? parseInt(req.query.limit) : 25;
    const skip = req.query.skip ? parseInt(req.query.skip) : 0;
    const find = JSON.parse(req.query.find || '[]');
    const db = await Database.getInstance(req);
    const docs = await db
      .collection(REWARDS_COLLECTION)
      .find({
        $and: [
          {
            userTelegramID: user.id.toString(),
          },
          ...find,
        ],
      })

      .skip(skip)
      .limit(limit)
      .sort({ dateAdded: -1 })
      .toArray();

    const total = await db.collection(REWARDS_COLLECTION).countDocuments({
      $and: [
        {
          userTelegramID: user.id.toString(),
        },
        ...find,
      ],
    });

    return res.status(200).send({
      docs,
      total,
    });
  } catch (error) {
    console.error('Error getting rewards', error);
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * GET /v2/rewards/pending
 *
 * @summary Get user pending rewards
 * @description Gets telegram user pending rewards (transactions) from DB collection.
 * @tags Rewards
 * @security BearerAuth
 * @param {number} limit.query - Limit number of results
 * @param {number} skip.query - Skip number of results
 * @param {string} find.query - Filter results, stringified JSON array of mongodb find objects
 * @return {object} 200 - Success response with connection status
 * @example response - 200 - Success response example
 * {
 *   "docs": [
 *     {
 *      "_id": "64f623c2ff2936zxcv07cbab",
 *      "userTelegramID": "1652aaa020",
 *      "responsePath": "64d170d6dggaaa00578ad6f6/c/1652061020",
 *      "walletAddress": "0x151bF7ccvvb2e6E32acC4362A8A5Bb26c5EAc38E",
 *      "reason": "user_sign_up",
 *      "userHandle": "username",
 *      "userName": "Firstname L`astname",
 *      "amount":"100",
 *      "message":"Sign up reward",
 *      "transactionHash": "0x2d9c28626cc15b8aaassacd1c16a66886769a381b53be247f0518a55c0d5a334",
 *      "parentTransactionHash": "",
 *      "status": ""
 *      "dateAdded": "2021-01-01T00:00:00.000Z"
 *    }
 *   ],
 *   "total": 1
 * }
 */
router.get('/rewards/pending', telegramHashIsValid, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).send({ msg: 'Invalid user' });
    }
    const limit = req.query.limit ? parseInt(req.query.limit) : 25;
    const skip = req.query.skip ? parseInt(req.query.skip) : 0;
    //    const find = JSON.parse(req.query.find || '[]');
    const db = await Database.getInstance(req);

    const aggregate = [
      {
        $lookup: {
          from: USERS_COLLECTION,
          localField: 'recipientTgId',
          foreignField: 'userTelegramID',
          as: 'users',
        },
      },
      {
        $addFields: {
          recipientIsUser: {
            $exists: {
              $arrayElemAt: ['$users', 0],
            },
          },
        },
      },
      {
        $match: {
          $and: [
            {
              senderTgId: user.id.toString(),
            },
            {
              recipientIsUser: true,
            },
          ],
        },
      },
      {
        $sort: { dateAdded: -1 },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
    ];

    const total = await db
      .collection(TRANSFERS_COLLECTION)
      .aggregate(aggregate)
      .count();

    const docs = await db
      .collection(TRANSFERS_COLLECTION)
      .aggregate(aggregate)
      .toArray();

    return res.status(200).send({
      docs,
      total,
    });
  } catch (error) {
    console.error('Error getting rewards', error);
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

export default router;