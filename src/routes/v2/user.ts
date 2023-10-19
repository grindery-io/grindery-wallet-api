import express from 'express';
import { Database } from '../../db/conn';
import { getUser } from '../../utils/telegram';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import { USERS_COLLECTION } from '../../utils/constants';

const router = express.Router();

/**
 * GET /v2/user
 *
 * @summary Get grindery bot user public profile
 * @description Gets grindery bot user public profile from DB collection.
 * @tags User
 * @security BearerAuth
 * @param {string} request.query.id - The telegram id of the user.
 * @return {object} 200 - Success response with connection status
 * @example response - 200 - Success response example
 * {
 *   "_id": "123",
 *   "userTelegramID": "456",
 *   "userName": "User Name",
 *   "userHandle": "username",
 *   "patchwallet": "0x123",
 *   "dateAdded": "2021-01-01T00:00:00.000Z",
 *   "webAppOpened": 1,
 *   "webAppOpenedFirstDate": "2021-01-01T00:00:00.000Z",
 *   "webAppOpenedLastDate": "2021-01-01T00:00:00.000Z",
 *   "telegramSessionSavedDate": "2021-01-01T00:00:00.000Z"
 * }
 */
router.get('/', telegramHashIsValid, async (req, res) => {
  const user = getUser(req);
  if (!user?.id) {
    return res.status(401).send({ msg: 'Invalid user' });
  }
  if (!req.query.id) {
    return res.status(400).send({ msg: 'Invalid user ID' });
  }
  console.log(`User [${user?.id}] requested user ${req.query.id} profile`);
  try {
    const db = await Database.getInstance(req);
    const profile = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: req.query.id });
    console.log(
      `User [${user?.id}] user ${req.query.id} profile request completed`
    );
    return res.status(200).send(profile);
  } catch (error) {
    console.error(
      `Error getting user ${req.query.id} profile`,
      JSON.stringify(error)
    );
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

export default router;
