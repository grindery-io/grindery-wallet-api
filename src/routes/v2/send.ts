import express from 'express';
import axios from 'axios';
import telegramHashIsValid from '../../utils/telegramHashIsValid';

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
 *   "message": "optional message"
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
  console.log(`User [${res.locals.userId}] requested to send a transaction`);

  // Check flood control
  if (
    sendTransactionFloodControl[res.locals.userId] &&
    sendTransactionFloodControl[res.locals.userId] > new Date().getTime()
  ) {
    const newTimeout = new Date().getTime() + 10000;
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
      data = {
        event: 'new_transaction',
        params,
      };
    } else {
      data = {
        event: 'new_transaction_batch',
        params: req.body.recipientTgId.map((id: any) => {
          const params: any = {
            recipientTgId: id,
            amount: req.body.amount,
            senderTgId: res.locals.userId,
          };
          if (req.body.message) {
            params.message = req.body.message;
          }
          return params;
        }),
      };
    }

    const eventRes = await axios.post(
      `https://bot-auth-api-staging.grindery.org/v1/webhook`,
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
      new Date().getTime() + 10000;
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
