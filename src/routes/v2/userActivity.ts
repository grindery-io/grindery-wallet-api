import express from 'express';
import { Database } from '../../db/conn';
import { getUser } from '../../utils/telegram';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import { TRANSFERS_COLLECTION } from '../../utils/constants';

const router = express.Router();

/**
 * GET /v2/userActivity/{id}
 *
 * @summary Get bot user activity
 * @deprecated
 * @description Gets bot user activity (transactions) from DB collection.
 * @tags UserActivity
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
router.get('/:id', telegramHashIsValid, async (req, res) => {
  if (!req.params.id) {
    return res.status(400).send({ msg: 'Invalid id' });
  }
  const user = getUser(req);
  if (!user?.id) {
    return res.status(401).send({ msg: 'Invalid user' });
  }
  console.log(`User [${user?.id}] requested activity of user ${req.params.id}`);
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 25;
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

export default router;
