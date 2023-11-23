import express from 'express';
import axios from 'axios';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import { Database } from '../../db/conn';
import { USERS_COLLECTION } from '../../utils/constants';
import { apiKeyIsValid } from '../../utils/apiKeyIsValid';
import { decrypt, encrypt } from '../../utils/crypt';

const router = express.Router();
const sendTransactionFloodControl: any = {};
const g1TokenAddress = '0xe36BD65609c08Cd17b53520293523CF4560533d0';

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
 *   "recipientName": "optional name",
 *   "chainId": "137"
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

    if (req.body.withConfirmation) {
      const transaction = {
        recipientTgId: req.body.recipientTgId,
        amount: req.body.amount,
        senderTgId: res.locals.userId,
        message: req.body.message,
        recipientHandle: req.body.recipientHandle,
        recipientName: req.body.recipientName,
        chainId: `eip155:${req.body.chainId || '137'}`,
        tokenAddress: req.body.tokenAddress || g1TokenAddress,
      };

      const confirmation = {
        event: 'new_transaction',
        source: 'wallet-api',
        transaction,
        transactionData: encrypt(JSON.stringify(transaction)),
        apiKey: process.env.API_KEY,
        responsePath: user.responsePath,
      };

      await axios.post('https://flowxo.com/hooks/a/89mge2d7', confirmation, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log(`User [${res.locals.userId}] transaction request completed`);

      // Set flood control
      sendTransactionFloodControl[res.locals.userId] =
        new Date().getTime() + 30000;

      return res.status(200).json({ success: true });
    }

    const isSingle = !Array.isArray(req.body.recipientTgId);
    let data = {};
    if (isSingle) {
      const params: any = {
        recipientTgId: req.body.recipientTgId,
        amount: req.body.amount,
        senderTgId: res.locals.userId,
        chainId: `eip155:${req.body.chainId || '137'}`,
        tokenAddress: req.body.tokenAddress || g1TokenAddress,
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
            chainId: `eip155:${req.body.chainId || '137'}`,
            tokenAddress: req.body.tokenAddress || g1TokenAddress,
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

router.post('/confirm', apiKeyIsValid, async (req, res) => {
  if (
    !req.body.transactionData ||
    !req.body.recipientTgId ||
    !req.body.amount ||
    !req.body.senderTgId
  ) {
    return res.status(400).json({ error: 'Bad request' });
  }

  try {
    const transactionData: any = JSON.parse(decrypt(req.body.transactionData));

    if (
      !transactionData.senderTgId ||
      !transactionData.recipientTgId ||
      !transactionData.amount ||
      transactionData.senderTgId !== req.body.senderTgId ||
      transactionData.recipientTgId !== req.body.recipientTgId ||
      transactionData.amount !== req.body.amount
    ) {
      return res.status(400).json({ error: 'Bad request' });
    }

    console.log(`User [${transactionData.senderTgId}] confirmed a transaction`);

    const isSingle = !Array.isArray(transactionData.recipientTgId);
    let data = {};
    if (isSingle) {
      const params: any = {
        recipientTgId: transactionData.recipientTgId,
        amount: transactionData.amount,
        senderTgId: transactionData.senderTgId,
        chainId: transactionData.chainId || 'eip155:137',
        tokenAddress: transactionData.tokenAddress || g1TokenAddress,
      };
      if (transactionData.message) {
        params.message = transactionData.message;
      }
      if (transactionData.recipientHandle) {
        params.recipientHandle = transactionData.recipientHandle;
      }
      if (transactionData.recipientName) {
        params.recipientName = transactionData.recipientName;
      }
      data = {
        event: 'new_transaction',
        params,
      };
    } else {
      data = {
        event: 'new_transaction_batch',
        params: transactionData.recipientTgId.map((id: any, index: number) => {
          const params: any = {
            recipientTgId: id,
            amount: transactionData.amount,
            senderTgId: transactionData.senderTgId,
            chainId: transactionData.chainId || 'eip155:137',
            tokenAddress: transactionData.tokenAddress || g1TokenAddress,
          };
          if (transactionData.message) {
            params.message = transactionData.message;
          }
          if (
            transactionData.recipientHandle &&
            Array.isArray(transactionData.recipientHandle)
          ) {
            params.recipientHandle = transactionData.recipientHandle[index];
          }
          if (
            transactionData.recipientName &&
            Array.isArray(transactionData.recipientName)
          ) {
            params.recipientName = transactionData.recipientName[index];
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
    console.log(
      `User [${transactionData.senderTgId}] transaction transaction completed`
    );

    return res.status(200).json({ success: eventRes.data?.success || false });
  } catch (error) {
    console.error(`Error sending transaction`, JSON.stringify(error));
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
});

export default router;
