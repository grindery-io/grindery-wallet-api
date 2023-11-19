import express from 'express';
import { Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import TGClient from '../../utils/telegramClient';
import { Database } from '../../db/conn';
import { deleteUserTelegramSession } from '../../utils/telegram';
import { decrypt } from '../../utils/crypt';
import telegramHashIsValid from '../../utils/telegramHashIsValid';
import { TRANSFERS_COLLECTION, USERS_COLLECTION } from '../../utils/constants';
import { getSocialContacts } from '../../utils/getSocialContacts';
import _ from 'lodash';

const router = express.Router();

/**
 * GET /v2/contacts
 *
 * @summary Get Telegram Contacts
 * @description Retrieve telegram user's contact list.
 * @tags Contacts
 * @security BearerAuth
 * @return {object} 200 - Success response with the list of contacts
 * @example response - 200 - Success response example
 * {
 *   "contacts": []
 * }
 */
router.get('/', telegramHashIsValid, async (req, res) => {
  console.log(`User [${res.locals.userId}] requested their contacts`);
  try {
    const db = await Database.getInstance(req);
    const userDoc = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: res.locals.userId });
    const session = userDoc.telegramSession;
    if (!session) {
      return res.status(200).json([]);
    }

    const client = TGClient(new StringSession(decrypt(session)));
    await client.connect();
    if (!client.connected) {
      return res.status(200).json([]);
    }
    const contacts = await client.invoke(
      new Api.contacts.GetContacts({
        // @ts-ignore
        hash: BigInt('-4156887774564'),
      })
    );

    await client.destroy();

    const usersArray = await db
      .collection(USERS_COLLECTION)
      .find({
        userTelegramID: {
          // @ts-ignore
          $in: contacts.users.map((user) => user.id.toString()),
        },
      })
      .toArray();

    const transfers = await db
      .collection(TRANSFERS_COLLECTION)
      .find({ senderTgId: res.locals.userId })
      .toArray();

    // @ts-ignore
    console.log(`User [${res.locals.userId}] contacts request completed`);

    res.status(200).json(
      // @ts-ignore
      contacts.users.map((user) => ({
        ...user,
        isGrinderyUser: usersArray.find(
          (u: any) => u.userTelegramID === user.id.toString()
        )
          ? true
          : false,
        isInvited: transfers.find(
          (transfer: any) => transfer.recipientTgId === user.id.toString()
        )
          ? true
          : false,
      }))
    );
  } catch (error: any) {
    console.error(
      `Error getting user ${res.locals.userId} contacts`,
      JSON.stringify(error)
    );
    if (
      error?.code === 401 &&
      error?.errorMessage === 'AUTH_KEY_UNREGISTERED'
    ) {
      try {
        console.log(`Deleting user ${res.locals.userId} session`);
        await deleteUserTelegramSession(res.locals.userId || '', req);
        console.log(`User [${res.locals.userId}] session deleted`);
      } catch (deleteSessionError) {
        console.error(`Error deleting user ${res.locals.userId} session`);
      }
    }
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * GET /v2/contacts/photo
 *
 * @summary Get telegram contact profile photo
 * @deprecated
 * @description Gets telegram contact public profile photo from Telegram API
 * @tags Contacts
 * @security BearerAuth
 * @param {object} request.query.username - Contact username
 * @return {object} 200 - Success response with photo as base64 url string
 * @return {object} 404 - Error response if operation not found
 * @example response - 200 - Success response example
 * {
 *   "photo": "data:image/png;base64,asdfghjklqwertyuiopzxcvbnm"
 * }
 */
router.get('/photo', telegramHashIsValid, async (req, res) => {
  const username = req.query.username;

  if (!username) {
    return res.status(401).send({ msg: 'Username is required' });
  }
  console.log(`User [${res.locals.userId}] requested user ${username} photo`);
  try {
    const db = await Database.getInstance(req);
    const userDoc = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: res.locals.userId });
    const session = userDoc.telegramSession;
    if (!session) {
      return res.status(200).json({ photo: '' });
    }

    const client = TGClient(new StringSession(decrypt(session)));
    await client.connect();

    if (!client.connected) {
      return res.status(200).json({ photo: '' });
    }

    const photo = await client.downloadProfilePhoto(username as string);

    const base64Photo = btoa(
      String.fromCharCode(...new Uint8Array(photo as ArrayBufferLike))
    );

    await client.destroy();
    console.log(
      `User [${res.locals.userId}] user ${username} photo request completed`
    );
    return res.status(200).json({
      photo: base64Photo ? `data:image/png;base64,${base64Photo}` : '',
    });
  } catch (error) {
    console.error(
      `Error getting user ${username} photo`,
      JSON.stringify(error)
    );
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * GET /v2/contacts/social
 *
 * @summary Get user social contacts
 * @description Gets user social contacts
 * @tags Contacts
 * @security BearerAuth
 * @return {object} 200 - Success response
 * @return {object} 404 - Error response
 */
router.get('/social', telegramHashIsValid, async (req, res) => {
  console.log(`User [${res.locals.userId}] requested their social contacts`);
  try {
    const contacts = await getSocialContacts(res.locals.userId, req);

    for (const contact of contacts) {
      contact.score = 1;
      contact.socialContacts = await getSocialContacts(
        contact.userTelegramID,
        req,
        [...contacts.map((c: any) => c.userTelegramID), res.locals.userId]
      );
    }

    const flatSocialContacts: any[] = _.flatten(
      contacts.map((c: any) => c.socialContacts)
    );

    for (const contact of contacts) {
      for (const socialContact of contact.socialContacts) {
        socialContact.score = 0;

        for (var i = 0; i < flatSocialContacts.length; i++) {
          if (
            flatSocialContacts[i].userTelegramID ===
            socialContact.userTelegramID
          ) {
            socialContact.score = socialContact.score + 0.1;
          }
        }

        if (socialContact.score >= 1) {
          socialContact.score = 0.9;
        }
      }
    }

    const flatContacts: any[] = _.uniqBy(
      _.flatten([
        ...contacts.map((c: any) =>
          c.socialContacts.map((sc: any) => ({
            ...sc,
            socialContacts: undefined,
          }))
        ),
        ...contacts.map((c: any) => ({ ...c, socialContacts: undefined })),
      ])
        .filter((c: any) => c.score > 0)
        .sort((a, b) => b.score - a.score),
      'userTelegramID'
    );
    console.log(`User [${res.locals.userId}] social request completed`);
    return res.status(200).json(flatContacts);
  } catch (error) {
    console.error(
      `Error getting user ${res.locals.userId} social`,
      JSON.stringify(error)
    );
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

export default router;
