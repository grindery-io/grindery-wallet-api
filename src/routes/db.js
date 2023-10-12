import express from 'express';
import { Database } from '../db/conn.js';
import { authenticateApiKey } from '../utils/auth.js';
import {
  getIncomingTxsUser,
  getOutgoingTxsUser,
  getRewardTxsUser,
} from '../utils/transfers.js';
import {
  REWARDS_COLLECTION,
  REWARDS_TESTS_COLLECTION,
  TRANSACTION_STATUS,
} from '../utils/constants.js';
import Web3 from 'web3';

const router = express.Router();

router.post('/reward', authenticateApiKey, async (req, res) => {
  try {
    const db = await Database.getInstance(req);
    const collection = db.collection(REWARDS_COLLECTION);

    const reward = await collection.findOne({
      walletAddress: Web3.utils.toChecksumAddress(req.body.to),
      amount: Web3.utils.fromWei(req.body.amount, 'ether'),
      status: TRANSACTION_STATUS.PENDING,
    });

    if (!reward) {
      res.status(201).send({ message: 'No reward to complete.' });
    } else {
      await collection.updateOne(
        { _id: reward._id },
        {
          $set: {
            transactionHash: req.body.transactionHash,
            status: TRANSACTION_STATUS.SUCCESS,
          },
        }
      );

      res.status(201).send({
        message: 'Reward updated.',
        transactionHash: req.body.transactionHash,
        mongoDbId: reward._id.toString(),
      });
    }
  } catch (error) {
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

router.post('/:collectionName', authenticateApiKey, async (req, res) => {
  const collectionName = req.params.collectionName;
  const db = await Database.getInstance(req);
  const collection = db.collection(collectionName);

  res.status(201).send(
    await collection.insertOne({
      ...req.body,
      dateAdded: new Date(),
    })
  );
});

router.get('/backlog-signup-rewards', authenticateApiKey, async (req, res) => {
  try {
    const db = await Database.getInstance();

    return res.status(200).send(
      await db
        .collection('users')
        .find({
          userTelegramID: {
            $nin: await db.collection('rewards').distinct('userTelegramID', {
              amount: '100',
            }),
          },
        })
        .toArray()
    );
  } catch (error) {
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

router.get('/format-transfers-user', authenticateApiKey, async (req, res) => {
  try {
    const db = await Database.getInstance(req);
    const start =
      parseInt(req.query.start) >= 0 ? parseInt(req.query.start) : 0;
    const limit =
      req.query.limit && parseInt(req.query.limit) > 0
        ? parseInt(req.query.limit)
        : 0;

    let formattedTxs = '';

    formattedTxs += await getIncomingTxsUser(
      db,
      req.query.userTgId,
      start,
      limit
    ).then((incomingTxs) => {
      return incomingTxs.length > 0
        ? `<b>Incoming transfers:</b>\n${incomingTxs
            .map(
              (transfer) =>
                `- ${transfer.tokenAmount} g1 from @${
                  transfer.senderUserHandle
                } on ${transfer.dateAdded} ${
                  transfer.message ? `[${transfer.message}]` : ''
                }`
            )
            .join('\n')}\n\n`
        : '';
    });

    formattedTxs += await getOutgoingTxsUser(
      db,
      req.query.userTgId,
      start,
      limit
    ).then((outgoingTxs) => {
      return outgoingTxs.length > 0
        ? `<b>Outgoing transfers:</b>\n${outgoingTxs
            .map(
              (transfer) =>
                `- ${transfer.tokenAmount} g1 to ${
                  transfer.recipientUserHandle
                    ? `@${transfer.recipientUserHandle}`
                    : `a new user (Telegram ID: ${transfer.recipientTgId})`
                } on ${transfer.dateAdded} ${
                  transfer.message ? `[${transfer.message}]` : ''
                }`
            )
            .join('\n')}\n\n`
        : '';
    });

    formattedTxs += await getRewardTxsUser(
      db,
      req.query.userTgId,
      start,
      limit
    ).then((rewardTxs) => {
      return rewardTxs.length > 0
        ? `<b>Reward transfers:</b>\n${rewardTxs
            .map(
              (transfer) =>
                `- ${transfer.amount} g1 on ${transfer.dateAdded} ${
                  transfer.message ? `[${transfer.message}]` : ''
                }`
            )
            .join('\n')}\n\n`
        : '';
    });

    res.status(200).send({ formattedTxs: formattedTxs.trimEnd() });
  } catch (error) {
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

router.get('/:collectionName', authenticateApiKey, async (req, res) => {
  const { limit, start, ...query } = req.query;
  try {
    const db = await Database.getInstance(req);
    return res.status(200).send(
      await db
        .collection(req.params.collectionName)
        .find(query)
        .skip(parseInt(start) >= 0 ? parseInt(start) : 0)
        .limit(limit !== undefined && parseInt(limit) > 0 ? parseInt(limit) : 0)
        .toArray()
    );
  } catch (error) {
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

export default router;
