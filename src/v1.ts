import express from 'express';
import { Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import createTelegramPromise from './utils/createTelegramPromise';
import { uuid } from 'uuidv4';
import TGClient from './utils/telegramClient';
import { Database } from './db/conn';
import { getUser } from './utils/telegram';
import axios from 'axios';
import { decrypt, encrypt } from './utils/crypt';
import Web3 from 'web3';
import { CHAIN_MAPPING } from './utils/chains';
import { base } from './utils/airtableClient';
import BigNumber from 'bignumber.js';
import telegramHashIsValid from './utils/telegramHashIsValid';
import {
  REWARDS_COLLECTION,
  TRANSFERS_COLLECTION,
  USERS_COLLECTION,
} from './utils/constants';

const ERC20 = require('./abi/ERC20.json');
const router = express.Router();
const operations: any = {};

/**
 * POST /v1/init
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
      onError: (error) => {
        console.error('Init tg auth error:', error);
        operations[operationId].status = 'error';
        operations[operationId].error = error;
      },
    })
    .then(() => {
      operations[operationId].status = 'completed';
    })
    .catch((error) => {
      console.error('Init tg auth error catched:', error);
      operations[operationId].status = 'error';
      operations[operationId].error = error;
    });

  res.json({
    operationId: operationId,
    status: 'pending',
  });
});

/**
 * POST /v1/callback
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

  if (operations[operationId]) {
    operations[operationId].phoneCodePromise.resolve(code);
    const session = operations[operationId].client.session.save();
    try {
      const user = getUser(req);
      if (!user?.id) {
        return res.status(401).send({ msg: 'Invalid user' });
      }

      const db = await Database.getInstance(req);
      await db.collection(USERS_COLLECTION).updateOne(
        { userTelegramID: user.id.toString() },
        {
          $set: {
            telegramSession: encrypt(session),
            telegramSessionSavedDate: new Date(),
          },
        }
      );
      res.json({
        session: encodeURIComponent(encrypt(session)),
        status: 'code_received',
      });
    } catch (error) {}
  } else {
    res.status(404).json({ error: 'Operation not found' });
  }
});

/**
 * GET /v1/contacts
 *
 * @summary Get Telegram Contacts
 * @description Retrieve telegram user's contact list.
 * @tags Contacts
 * @security BearerAuth
 * @return {object} 200 - Success response with the list of contacts
 * @example response - 200 - Success response example (simplified for brevity)
 * {
 *   "contacts": [{...}, {...}] // array of contact objects
 * }
 */
router.get('/contacts', telegramHashIsValid, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).send({ msg: 'Invalid user' });
    }
    const db = await Database.getInstance(req);
    const userDoc = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: user.id.toString() });
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
      .find({ senderTgId: user.id.toString() })
      .toArray();

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
  } catch (error) {
    console.error('Error getting user', error);
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * GET /v1/me
 *
 * @summary Get telegram webapp user
 * @description Gets telegram webapp user record from DB collection.
 * @tags User
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
 *   "dateAdded": "2021-01-01T00:00:00.000Z"
 * }
 */
router.get('/me', telegramHashIsValid, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).send({ msg: 'Invalid user' });
    }
    const db = await Database.getInstance(req);
    const userDoc = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: user.id.toString() });

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
    await db
      .collection(USERS_COLLECTION)
      .updateOne({ userTelegramID: user.id.toString() }, updateData);

    if (userDoc?.telegramSession) {
      userDoc.telegramSession = decrypt(userDoc.telegramSession);
    }

    return res.status(200).send(userDoc);
  } catch (error) {
    console.error('Error getting user', error);
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * GET /v1/activity
 *
 * @summary Get telegram user activity
 * @description Gets telegram user activity (transactions) from DB collection.
 * @tags Activity
 * @security BearerAuth
 * @return {object} 200 - Success response with connection status
 * @example response - 200 - Success response example
 * [
 *  {
 *    "_id": "6asdfghjff2936fefd07cf93",
 *     "TxId": "xdc3ooo",
 *     "chainId": "eip155:137",
 *     "tokenSymbol": "g1",
 *     "tokenAddress": "0xe36BD65609c08Cgavehr3520293523CF4560533d0",
 *     "senderTgId": "1899300004",
 *     "senderWallet": "0x1234556751f3D2e4dE9D8B860311936090bcaC95",
 *     "senderName": "undefined",
 *     "recipientTgId": "5900000139",
 *     "recipientWallet": "0x43371FD1Df1a3ee6550ca42f61956feasdfghj33",
 *     "tokenAmount": "10",
 *     "transactionHash": "0xdtgbrfve594b7950ef2e5fe6efa89eb4daf6e1424b641eee0dd4db2f8e5fdf8f",
 *     "dateAdded": "2021-01-01T00:00:00.000Z"
 *   }
 * ]
 */
router.get('/activity', telegramHashIsValid, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).send({ msg: 'Invalid user' });
    }
    const db = await Database.getInstance(req);
    return res.status(200).send(
      await db
        .collection(TRANSFERS_COLLECTION)
        .find({
          $or: [
            { senderTgId: user.id.toString() },
            { recipientTgId: user.id.toString() },
          ],
        })
        .sort({ dateAdded: -1 })
        .toArray()
    );
  } catch (error) {
    console.error('Error getting activity', error);
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * GET /v1/user
 *
 * @summary Get bot user public profile
 * @description Gets bot user public profile from DB collection.
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
 *   "patchwallet": "0x123"
 * }
 */
router.get('/user', telegramHashIsValid, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).send({ msg: 'Invalid user' });
    }
    if (!req.query.id) {
      return res.status(400).send({ msg: 'Invalid user ID' });
    }
    const db = await Database.getInstance(req);
    return res
      .status(200)
      .send(
        await db
          .collection(USERS_COLLECTION)
          .findOne({ userTelegramID: req.query.id })
      );
  } catch (error) {
    console.error('Error getting user', error);
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * GET /v1/rewards
 *
 * @summary Get telegram user rewards
 * @description Gets telegram user rewards (transactions) from DB collection.
 * @tags Rewards
 * @security BearerAuth
 * @return {object} 200 - Success response with connection status
 * @example response - 200 - Success response example
 * {
 *  "pending": [
 *    {
 *      "_id": "64f623c2ff2936zxcv07cbab",
 *      "userTelegramID": "1652aaa020",
 *      "responsePath": "64d170d6dggaaa00578ad6f6/c/1652061020",
 *      "walletAddress": "0x151bF7ccvvb2e6E32acC4362A8A5Bb26c5EAc38E",
 *      "reason": "user_sign_up",
 *      "userHandle": "username",
 *      "userName": "Firstname L`astname",
 *      "amount":"100",
 *      "message":"Sign up reward",
 *      "transactionHash": "0x2d9c28626cc15b8aaassacd1c16a66886769a381b53be247f0518a55c0d5a334",
 *      "dateAdded": "2021-01-01T00:00:00.000Z"
 *    }
 *  ],
 *  "received": []
 * }
 */
router.get('/rewards', telegramHashIsValid, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).send({ msg: 'Invalid user' });
    }
    const db = await Database.getInstance(req);
    const sent = await db
      .collection(TRANSFERS_COLLECTION)
      .find({ senderTgId: user.id.toString() })
      .toArray();
    let users: any[] = [];
    if (sent.length > 0) {
      users = await db
        .collection(USERS_COLLECTION)
        .find({
          $or: sent.map((col: any) => ({
            userTelegramID: col.recipientTgId,
          })),
        })
        .toArray();
    }

    const key = 'recipientTgId';
    const pending = [
      ...new Map(
        sent
          .filter(
            (col: any) =>
              !users
                .map((user) => user.userTelegramID)
                .includes(col.recipientTgId)
          )
          .map((col: any) => ({ ...col, tokenAmount: '50' }))
          .map((item: any) => [item[key], item])
      ).values(),
    ];

    const received = await db
      .collection(REWARDS_COLLECTION)
      .find({
        userTelegramID: user.id.toString(),
      })
      .sort({ dateAdded: -1 })
      .toArray();

    return res.status(200).send({
      pending,
      received,
    });
  } catch (error) {
    console.error('Error getting rewards', error);
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * GET /v1/user/photo
 *
 * @summary Get telegram user public profile photo
 * @description Gets telegram user public profile photo from Telegram API
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
router.get('/user/photo', telegramHashIsValid, async (req, res) => {
  try {
    const username = req.query.username;

    if (!username) {
      return res.status(401).send({ msg: 'Username is required' });
    }
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).send({ msg: 'Invalid user' });
    }
    const db = await Database.getInstance(req);
    const userDoc = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: user.id.toString() });
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

    return res.status(200).json({
      photo: base64Photo ? `data:image/png;base64,${base64Photo}` : '',
    });
  } catch (error) {
    console.error('Error getting user photo', error);
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * POST /v1/send
 *
 * @summary Send transaction
 * @description Send transaction to a contact from telegram webapp
 * @tags Tokens
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
 *
 * @example response - 500 - Error response example
 * {
 *   "success": false,
 *   "error": "error message"
 * }
 */
router.post('/send', telegramHashIsValid, async (req, res) => {
  const user = getUser(req);
  if (!user || !user.id) {
    return res.status(401).send({ msg: 'Invalid user' });
  }
  if (!req.body.recipientTgId) {
    return res.status(400).json({ error: 'Recipient is required' });
  }
  if (!req.body.amount) {
    return res.status(400).json({ error: 'Amount is required' });
  }
  try {
    const isSingle = !Array.isArray(req.body.recipientTgId);
    let data = {};
    if (isSingle) {
      const params: any = {
        recipientTgId: req.body.recipientTgId,
        amount: req.body.amount,
        senderTgId: user.id.toString(),
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
            senderTgId: user.id.toString(),
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

    return res.status(200).json({ success: eventRes.data?.success || false });
  } catch (error) {
    console.error('Error sending transaction', error);
    return res.status(500).send({ success: false, error: 'An error occurred' });
  }
});

/**
 * GET /v1/leaderboard
 *
 * @summary Get leaderboard list
 * @description Fetches leaderboard data by aggregating user statistics based on transaction and reward records. Allows sorting, pagination, and filter features. Additionally, retrieves users' balances using Web3 integration.
 * @tags Leaderboard
 * @param {string} chainId.query - The chain ID for Web3 operations. Defaults to "eip155:137".
 * @param {number} page.query - Specifies the page number for pagination. Defaults to 1.
 * @param {number} limit.query - Defines the number of results to return per page. Defaults to 10.
 * @param {string} sortBy.query - Indicates the field by which to sort the results. Defaults to "txCount".
 * @param {string} order.query - Dictates the sorting order. Can be either "asc" or "desc". Defaults to "desc".
 * @return {object[]} 200 - Success response, returning an array of aggregated user statistics tailored for the leaderboard.
 * @return {object} 500 - Error response containing an error message and details.
 * @example request - Sample Request
 * GET /v1/leaderboard?page=1&limit=10&sortBy=txCount&order=desc
 * @example response - 200 - Sample Success Response
 * [
 *   {
 *     "user": {
 *       "_id": "64f631feff2936fefd07ce3a",
 *       "userTelegramID": "5221262822",
 *       "userHandle": "divadonate",
 *       "userName": "Resa kikuk",
 *       "patchwallet": "0x3EcD632C733feBfEcc8c199fB69149e1696Bb9a2",
 *       "dateAdded": "2023-09-04T19:37:34.241Z"
 *     },
 *     "firstTx": {},
 *     "lastTx": {},
 *     "txCount": 5,
 *     "rewardsCount": 3,
 *     "referralsCount": 2
 *   }
 * ]
 * @example response - 500 - Sample Error Response
 * {
 *   "msg": "An error occurred",
 *   "error": "Detailed error message here"
 * }
 */
router.get('/leaderboard', async (req, res) => {
  try {
    //const chainId = req.query.chainId || 'eip155:137';

    // pagination params
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseInt(req.query.limit as string, 10) || 10;
    const skip = (page - 1) * limit;

    // sort params
    const sortBy = req.query.sortBy || 'txCount';
    let order = req.query.order === 'asc' ? 1 : -1;

    const db = await Database.getInstance(req);

    const leaderboardData = await db
      .collection(USERS_COLLECTION)
      .aggregate([
        {
          $lookup: {
            from: TRANSFERS_COLLECTION,
            localField: 'userTelegramID',
            foreignField: 'senderTgId',
            as: 'transactions',
          },
        },
        {
          $lookup: {
            from: REWARDS_COLLECTION,
            localField: 'userTelegramID',
            foreignField: 'userTelegramID',
            as: REWARDS_COLLECTION,
          },
        },
        {
          $addFields: {
            firstTx: '',
            lastTx: '',
            txCount: { $size: '$transactions' },
            rewardsCount: { $size: '$rewards' },
            referralsCount: {
              $size: {
                $filter: {
                  input: '$rewards',
                  as: 'reward',
                  cond: { $eq: ['$$reward.reason', '2x_reward'] },
                },
              },
            },
          },
        },
        {
          $project: {
            user: {
              _id: '$_id',
              userTelegramID: '$userTelegramID',
              userHandle: '$userHandle',
              userName: '$userName',
              patchwallet: '$patchwallet',
              dateAdded: '$dateAdded',
              telegramSession: '$telegramSession',
              telegramSessionSavedDate: '$telegramSessionSavedDate',
              webAppOpenedFirstDate: '$webAppOpenedFirstDate',
            },
            firstTx: 1,
            lastTx: 1,
            txCount: 1,
            rewardsCount: 1,
            referralsCount: 1,
          },
        },
        {
          $sort: { [sortBy as string]: order },
        },
        {
          $skip: skip,
        },
        {
          $limit: limit,
        },
      ])
      .toArray();

    const leaderboardDataLength = await db
      .collection(USERS_COLLECTION)
      .estimatedDocumentCount();
    //const web3 = new Web3(CHAIN_MAPPING[chainId][1]);

    /*const contract = new web3.eth.Contract(
      ERC20,
      process.env.G1_POLYGON_ADDRESS
    );*/

    for (let user of leaderboardData) {
      /*const balance = await contract.methods
        .balanceOf(user.user.patchwallet)
        .call();

      user.balance = web3.utils.fromWei(balance);*/

      const userDoc = user.user;
      if (userDoc.telegramSession) {
        userDoc.telegramSession = 'hidden';
      }
    }

    return res.status(200).send({
      items: leaderboardData,
      total: leaderboardDataLength,
    });
  } catch (error) {
    console.error('Error getting leaderboard data', error);
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * GET /v1/config
 *
 * @summary Get wallet config
 * @description Gets wallet config and dynamic data from Airtable
 * @tags Config
 * @security BearerAuth
 * @return {object} 200 - Success response with an array of raw airtable records
 * @return {object} 404 - Error response
 * @example response - 200 - Success response example
 *
 */
router.get('/config', telegramHashIsValid, async (req, res) => {
  const configRecords: any[] = [];
  base('Config')
    .select({
      maxRecords: 100,
      view: 'API',
    })
    .eachPage(
      function page(records, fetchNextPage) {
        records.forEach(function (record) {
          configRecords.push(record._rawJson);
        });
        fetchNextPage();
      },
      function done(err) {
        if (err) {
          console.error(err);
          return res.status(500).send({ msg: 'An error occurred', err });
        }
        return res.status(200).json({ config: configRecords });
      }
    );
});

/**
 * GET /v1/stats
 *
 * @summary Get telegram user stats
 * @description Gets telegram user stats, such as amount of transactions, rewards, and referrals.
 * @tags User
 * @security BearerAuth
 * @return {object} 200 - Success response with stats object
 * @example response - 200 - Success response example
 * {
 *   "sentTransactions": 1,
 *   "receivedTransactions": 1,
 *   "rewards": 1,
 *   "referrals": 1
 * }
 */
router.get('/stats', telegramHashIsValid, async (req, res) => {
  try {
    const user = getUser(req);
    if (!user?.id) {
      return res.status(401).send({ msg: 'Invalid user' });
    }
    const db = await Database.getInstance(req);

    const sentTransactions = await db
      .collection(TRANSFERS_COLLECTION)
      .countDocuments({ senderTgId: user.id.toString() });

    const receivedTransactions = await db
      .collection(TRANSFERS_COLLECTION)
      .countDocuments({ recipientTgId: user.id.toString() });

    const rewards = await db
      .collection(REWARDS_COLLECTION)
      .countDocuments({ userTelegramID: user.id.toString() });

    const referrals = await db.collection(REWARDS_COLLECTION).countDocuments({
      userTelegramID: user.id.toString(),
      reason: '2x_reward',
    });

    return res.status(200).send({
      sentTransactions,
      receivedTransactions,
      rewards,
      referrals,
    });
  } catch (error) {
    console.error('Error getting user', error);
    return res.status(500).send({ msg: 'An error occurred', error });
  }
});

/**
 * POST /v1/balance
 *
 * @summary Request user token balance
 * @description Gets bot user tokens balance from chain
 * @tags User
 * @security BearerAuth
 * @return {object} 200 - Success response with balance
 * @example response - 200 - Success response example
 * {
 *   "balanceWei": 1000000000000000000,
 *   "balanceEther": 1
 * }
 */
router.post('/balance', async (req, res) => {
  try {
    const web3 = new Web3(CHAIN_MAPPING[req.body.chainId][1]);
    const contract = new web3.eth.Contract(ERC20, req.body.contractAddress);

    const balance = await contract.methods
      .balanceOf(req.body.userAddress)
      .call();

    res.status(200).json({
      balanceWei: balance,
      balanceEther: BigNumber(balance)
        .div(
          BigNumber(10).pow(BigNumber(await contract.methods.decimals().call()))
        )
        .toString(),
    });
  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({ error: error?.message || '' });
  }
});

export default router;
