import express from 'express';
import { StringSession } from 'telegram/sessions/index.js';
import createTelegramPromise from '../../utils/createTelegramPromise';
import { uuid } from 'uuidv4';
import TGClient from '../../utils/telegramClient';
import { Database } from '../../db/conn';
import { encrypt } from '../../utils/crypt';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import { USERS_COLLECTION } from '../../utils/constants';

const router = express.Router();
const operations: any = {};
const floodControl: any = {};

/**
 * POST /v2/auth/init
 *
 * @summary Initialize a Telegram Session
 * @description Start a session with Telegram using phone number and password, awaiting a phone code for full authentication.
 * @tags Authentication
 * @security BearerAuth
 * @param {object} request.body - The request body containing the phone and password.
 * @return {object} 200 - Success response with operation ID and status
 * @example request - 200 - Example request body
 * {
 *   "phone": "5511987876565",
 *   "password": "user_password"
 * }
 * @example response - 200 - Success response example
 * {
 *   "operationId": "some-uuid",
 *   "status": "pending"
 * }
 */
router.post('/init', telegramHashIsValid, async (req, res) => {
  console.log(`User [${res.locals.userId}] requested a new telegram session`);

  // Check flood control
  if (
    floodControl[res.locals.userId] &&
    floodControl[res.locals.userId] > new Date().getTime()
  ) {
    console.info(
      `User [${
        res.locals.userId
      }] too many requests, auth blocked until ${new Date(
        floodControl[res.locals.userId]
      )}`
    );
    return res.status(429).send({ msg: 'Too many requests' });
  }

  const operationId = uuid();

  const client = TGClient(new StringSession(''));
  operations[operationId] = {
    status: 'pending',
    client: client,
    phoneCodePromise: null,
  };
  const globalPhoneCodePromise = createTelegramPromise();
  operations[operationId].phoneCodePromise = globalPhoneCodePromise;

  client
    .start({
      phoneNumber: req.body.phone,
      password: async () => {
        return req.body.password;
      },
      phoneCode: async () => {
        if (operations[operationId].phoneCodePromise) {
          let code = await operations[operationId].phoneCodePromise.promise;
          operations[operationId].phoneCodePromise = createTelegramPromise();
          return code;
        }
        throw new Error('Phone code promise not found.');
      },
      onError: (error: any) => {
        console.error(
          `User [${res.locals.userId}] new telegram session request error`,
          JSON.stringify(error)
        );
        operations[operationId].status = 'error';
        operations[operationId].error = error;

        // Set flood control on error
        if (
          error?.code === 420 &&
          error?.errorMessage === 'FLOOD' &&
          error?.seconds
        ) {
          floodControl[res.locals.userId] =
            new Date().getTime() + error?.seconds * 1000;
        }
        client.destroy();
      },
    })
    .then(() => {
      console.log(`User [${res.locals.userId}] session created`);
      operations[operationId].status = 'completed';

      // Clear flood control on success
      if (floodControl[res.locals.userId]) {
        delete floodControl[res.locals.userId];
      }
    })
    .catch((error) => {
      console.error(
        `User [${res.locals.userId}] telegram session creation error`,
        JSON.stringify(error)
      );
      operations[operationId].status = 'error';
      operations[operationId].error = error;
    })
    .finally(() => {
      setTimeout(() => {
        client.destroy();
      }, 500);
    });

  console.log(
    `User [${res.locals.userId}] telegram session creation request completed`
  );
  res.json({
    operationId: operationId,
    status: 'pending',
  });
});

/**
 * POST /v2/auth/callback
 *
 * @summary Set Phone Code for Authentication
 * @description Provide the phone code received on the user's device to authenticate the session with Telegram.
 * @tags Authentication
 * @security BearerAuth
 * @param {object} request.body - The request body containing the operation ID and phone code.
 * @return {object} 200 - Success response with session and status
 * @return {object} 404 - Error response if operation not found
 * @example request - Example request body
 * {
 *   "operationId": "some-uuid",
 *   "code": "12345"
 * }
 * @example response - 200 - Success response example
 * {
 *   "session": "session-string",
 *   "status": "code_received"
 * }
 * @example response - 404 - Error response example
 * {
 *   "error": "Operation not found"
 * }
 */
router.post('/callback', telegramHashIsValid, async (req, res) => {
  const operationId = req.body.operationId;
  const code = req.body.code;
  console.log(`User [${res.locals.userId}] sent a confirmation code`);
  if (operations[operationId]) {
    operations[operationId].phoneCodePromise.resolve(code);
    const session = operations[operationId].client.session.save();

    try {
      const db = await Database.getInstance(req);
      await db.collection(USERS_COLLECTION).updateOne(
        { userTelegramID: res.locals.userId },
        {
          $set: {
            telegramSession: encrypt(session),
            telegramSessionSavedDate: new Date(),
          },
        }
      );
      console.log(`User [${res.locals.userId}] telegram session saved`);
      res.json({
        session: encodeURIComponent(encrypt(session)),
        status: 'code_received',
      });
    } catch (error) {}
  } else {
    console.log(
      `User [${res.locals.userId}] telegram session operation not found`
    );
    res.status(404).json({ error: 'Operation not found' });
  }
});

export default router;
