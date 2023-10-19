import express from 'express';
import { Database } from '../../db/conn';
import { getUser } from '../../utils/telegram';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import { TRANSFERS_COLLECTION } from '../../utils/constants';
import { ObjectId } from 'mongodb';

const router = express.Router();

/**
 * GET /v2/activity
 *
 * @summary Get current user activity
 * @description Gets current user activity (transactions) from DB collection.
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
router.get('/', telegramHashIsValid, async (req, res) => {
  const user = getUser(req);
  if (!user?.id) {
    return res.status(401).send({ msg: 'Invalid user' });
  }
  console.log(`User [${user?.id}] requested their activity`);
  const limit = req.query.limit ? parseInt(req.query.limit as string) : 15;
  const skip = req.query.skip ? parseInt(req.query.skip as string) : 0;
  const sort = (req.query.sort as string) || 'dateAdded';
  const order = req.query.order && req.query.order === 'asc' ? 1 : -1;
  try {
    const find = JSON.parse((req.query.find as string) || '[]');
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
    console.log(`User [${user?.id}] activity request completed`);
    return res.status(200).send({
      docs,
      total,
    });
  } catch (error) {
    console.error(
      `Error getting activity for user ${user?.id}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * GET /v2/activity/user/{id}
 *
 * @summary Get bot user activity
 * @description Gets bot user activity (transactions) from DB collection.
 * @tags Activity
 * @security BearerAuth
 * @param {string} id.path - User id
 * @param {number} limit.query - Limit number of results
 * @param {number} skip.query - Skip number of results
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
router.get('/user/:id', telegramHashIsValid, async (req, res) => {
  if (!req.params.id) {
    return res.status(400).send({ msg: 'Invalid id' });
  }
  const user = getUser(req);
  if (!user?.id) {
    return res.status(401).send({ msg: 'Invalid user' });
  }
  console.log(`User [${user?.id}] requested activity of user ${req.params.id}`);
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 15;
    const skip = req.query.skip ? parseInt(req.query.skip as string) : 0;
    const find = {
      $or: [
        {
          $and: [
            { senderTgId: user.id.toString() },
            { recipientTgId: req.params.id },
          ],
        },
        {
          $and: [
            { senderTgId: req.params.id },
            { recipientTgId: user.id.toString() },
          ],
        },
      ],
    };
    const db = await Database.getInstance(req);
    const docs = await db
      .collection(TRANSFERS_COLLECTION)
      .find(find)
      .sort({ dateAdded: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await db
      .collection(TRANSFERS_COLLECTION)
      .countDocuments(find);
    console.log(
      `User [${user?.id}] activity of user ${req.params.id} request completed`
    );
    return res.status(200).send({
      docs,
      total,
    });
  } catch (error) {
    console.error(
      `Error getting activity of user ${req.params.id} for user [${user?.id}] `,
      JSON.stringify(error)
    );
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * GET /v2/activity/{id}
 *
 * @summary Get single activity
 * @description Gets single activity (transactions) from DB collection by id.
 * @tags Activity
 * @security BearerAuth
 * @param {string} id.path - Transaction hash, or doc id or internal transaction id
 * @return {object} 200 - Success response with single transaction
 * @example response - 200 - Success response example
 * {
 *   "_id": "6asdfghjff2936fefd07cf93",
 *   "TxId": "xdc3ooo",
 *   "chainId": "eip155:137",
 *   "tokenSymbol": "g1",
 *   "tokenAddress": "0xe36BD65609c08Cgavehr3520293523CF4560533d0",
 *   "senderTgId": "1899300004",
 *   "senderWallet": "0x1234556751f3D2e4dE9D8B860311936090bcaC95",
 *   "senderName": "undefined",
 *   "recipientTgId": "5900000139",
 *   "recipientWallet": "0x43371FD1Df1a3ee6550ca42f61956feasdfghj33",
 *   "tokenAmount": "10",
 *   "transactionHash": "0xdtgbrfve594b7950ef2e5fe6efa89eb4daf6e1424b641eee0dd4db2f8e5fdf8f",
 *   "dateAdded": "2021-01-01T00:00:00.000Z"
 * }
 */
router.get('/:id', telegramHashIsValid, async (req, res) => {
  if (!req.params.id) {
    return res.status(400).send({ msg: 'Invalid id' });
  }
  const user = getUser(req);
  if (!user?.id) {
    return res.status(401).send({ msg: 'Invalid user' });
  }
  console.log(`User [${user?.id}] requested activity by id ${req.params.id}`);
  try {
    const db = await Database.getInstance(req);

    const find: any = {
      $or: [],
    };

    if (req.params.id.startsWith('0x')) {
      find.$or.push({ transactionHash: req.params.id });
      find.$or.push({ TxId: req.params.id });
    } else {
      find.$or.push({ _id: new ObjectId(req.params.id) });
    }
    console.log(`User [${user?.id}] activity by id request completed`);
    return res
      .status(200)
      .send(await db.collection(TRANSFERS_COLLECTION).findOne(find));
  } catch (error) {
    console.error(
      `Error getting activity by id for user [${user?.id}] `,
      JSON.stringify(error)
    );
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

export default router;
