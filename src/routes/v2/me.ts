import express from 'express';
import { Database } from '../../db/conn';
import { decrypt } from '../../utils/crypt';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import {
  USERS_COLLECTION,
  WALLET_USERS_COLLECTION,
} from '../../utils/constants';

const router = express.Router();

/**
 * GET /v2/me
 *
 * @summary Get webapp user own profile
 * @description Gets telegram webapp user record from DB collection.
 * @tags Me
 * @security BearerAuth
 * @return {object} 200 - Success response with connection status
 * @example response - 200 - Success response example
 * {
 *   "_id": "123",
 *   "userTelegramID": "456",
 *   "userName": "User Name",
 *   "userHandle": "username",
 *   "responsePath": "123/456",
 *   "patchwallet": "0x123",
 *   "dateAdded": "2021-01-01T00:00:00.000Z",
 *   "telegramSession": "encrypted-session-string"
 * }
 */
router.get('/', telegramHashIsValid, async (req, res) => {
  console.log(`User [${res.locals.userId}] requested their profile`);
  try {
    const db = await Database.getInstance(req);
    const userDoc = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: res.locals.userId });

    const updateData: any = {
      $inc: { webAppOpened: 1 },
      $set: {
        webAppOpenedLastDate: new Date(),
      },
    };
    if (!userDoc?.webAppOpenedFirstDate) {
      updateData.$set.webAppOpenedFirstDate = new Date();
    }
    if (!userDoc?.telegramSessionSavedDate && userDoc?.telegramSession) {
      updateData.$set.telegramSessionSavedDate = new Date();
    }

    await db.collection(WALLET_USERS_COLLECTION).updateOne(
      { userTelegramID: res.locals.userId },
      {
        ...updateData,
        $set: { ...updateData.$set, userTelegramID: res.locals.userId },
      },
      { upsert: true }
    );

    if (userDoc?.telegramSession) {
      userDoc.telegramSession = decrypt(userDoc.telegramSession);
    }
    console.log(`User [${res.locals.userId}] profile request completed`);
    return res.status(200).send(userDoc);
  } catch (error) {
    console.error(
      `Error getting user ${res.locals.userId} own profile`,
      JSON.stringify(error)
    );
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * POST /v2/me
 *
 * @summary Update self
 * @description Update self user
 * @tags Me
 * @security BearerAuth
 * @param {object} request.body - The request body containing the user properties to update
 * @return {object} 200 - Success response
 * @return {object} 404 - Error response if user not found
 * @example request - Example request body
 * {
 *   "debug": { "enabled": true }
 * }
 */
router.post('/', telegramHashIsValid, async (req, res) => {
  try {
    const db = await Database.getInstance(req);
    const result = await db
      .collection(WALLET_USERS_COLLECTION)
      .updateOne({ userTelegramID: res.locals.userId }, { $set: req.body });
    console.log(`User ${res.locals.userId} updated`);
    return res.status(200).send(result);
  } catch (error) {
    console.error(
      `Error updating user ${res.locals.userId}`,
      JSON.stringify(error)
    );
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

export default router;
