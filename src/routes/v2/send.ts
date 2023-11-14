import express from 'express';
import axios from 'axios';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import { Database } from '../../db/conn';
import { USERS_COLLECTION } from '../../utils/constants';

const router = express.Router();
const sendTransactionFloodControl: any = {};

/**
 * POST /v2/send
 *
 * @summary Send transaction
 * @description Send transaction to a contact from telegram webapp
 * @tags Send
 * @security BearerAuth
 * @param {object} request.body - The request body containing the transaction details
 * @return {object} 200 - Success response with session and status
 * @return {object} 404 - Error response if operation not found
 * @example request - Example request body
 * {
 *   "recipientTgId": "some-id",
 *   "amount": "10",
 *   "message": "optional message",
 *   "recipientHandle": "optional handle",
 *   "recipientName": "optional name"
 * }
 * @example response - 200 - Success response example
 * {
 *   "success": true,
 *   "messageId": "some-uuid"
 * }
 * @example response - 500 - Error response example
 * {
 *   "success": false,
 *   "error": "error message"
 * }
 */
router.post('/', telegramHashIsValid, async (req, res) => {
  if (!req.body.recipientTgId) {
    return res.status(400).json({ error: 'Recipient is required' });
  }
  if (!req.body.amount) {
    return res.status(400).json({ error: 'Amount is required' });
  }
  if (!/^\d+$/.test(req.body.amount) || parseInt(req.body.amount) <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  console.log(`User [${res.locals.userId}] requested to send a transaction`);

  // Check flood control
  if (
    sendTransactionFloodControl[res.locals.userId] &&
    sendTransactionFloodControl[res.locals.userId] > new Date().getTime()
  ) {
    const newTimeout = new Date().getTime() + 30000;
    sendTransactionFloodControl[res.locals.userId] = newTimeout;
    console.info(
      `User [${
        res.locals.userId
      }] too many requests, tokens sending blocked until ${new Date(
        sendTransactionFloodControl[res.locals.userId]
      )}`
    );
    return res.status(429).send({ msg: 'Too many requests' });
  }

  try {
    const db = await Database.getInstance(req);

    const user = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: res.locals.userId });

    if (!user || (user.isBanned && user.isBanned !== 'false')) {
      return res.status(400).json({ error: 'User is banned' });
    }

    const isSingle = !Array.isArray(req.body.recipientTgId);
    let data = {};
    if (isSingle) {
      const params: any = {
        recipientTgId: req.body.recipientTgId,
        amount: req.body.amount,
        senderTgId: res.locals.userId,
      };
      if (req.body.message) {
        params.message = req.body.message;
      }
      if (req.body.recipientHandle) {
        params.recipientHandle = req.body.recipientHandle;
      }
      if (req.body.recipientName) {
        params.recipientName = req.body.recipientName;
      }
      data = {
        event: 'new_transaction',
        params,
      };
    } else {
      data = {
        event: 'new_transaction_batch',
        params: req.body.recipientTgId.map((id: any, index: number) => {
          const params: any = {
            recipientTgId: id,
            amount: req.body.amount,
            senderTgId: res.locals.userId,
          };
          if (req.body.message) {
            params.message = req.body.message;
          }
          if (
            req.body.recipientHandle &&
            Array.isArray(req.body.recipientHandle)
          ) {
            params.recipientHandle = req.body.recipientHandle[index];
          }
          if (req.body.recipientName && Array.isArray(req.body.recipientName)) {
            params.recipientName = req.body.recipientName[index];
          }
          return params;
        }),
      };
    }

    const eventRes = await axios.post(
      `https://bot-auth-api.grindery.org/v1/webhook`,
      data,
      {
        headers: {
          Authorization: `Bearer ${process.env.API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`User [${res.locals.userId}] transaction request completed`);

    // Set flood control
    sendTransactionFloodControl[res.locals.userId] =
      new Date().getTime() + 30000;
    return res.status(200).json({ success: eventRes.data?.success || false });
  } catch (error) {
    console.error(
      `Error sending transaction for user ${res.locals.userId}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
});

export default router;
