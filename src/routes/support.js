import express from 'express';
import { Database } from '../db/conn.js';
import { authenticateApiKey } from '../utils/auth.js';

const router = express.Router();

/**
 * POST /import
 *
 * @summary Import users into the database
 * @description Import a list of users into the database. Each user should contain necessary fields. This endpoint will reject the insertion if a user already exists in the database or if mandatory fields are missing.
 * @tags Users
 * @param {object[]} request.body - The list of users to import.
 * @return {object} 201 - Success response with inserted data
 * @return {object} 400 - Error response when payload is not iterable, a user already exists, or no valid data to insert
 * @example request - 201 - Example request body
 * [
 *   {
 *     "UserID": "1",
 *     "FirstName": "John",
 *     "UserHandle": "@john_doe",
 *     "ResponsePath": "some/path/to/response",
 *     "wallet": "0xABCDEF0123456789"
 *   },
 *   {
 *     "UserID": "2",
 *     "FirstName": "John 2",
 *     "UserHandle": "@john_doe2",
 *     "ResponsePath": "some/path/to/response",
 *     "wallet": "0xBCCDEF01234567892"
 *   }
 * ]
 * @example response - 201 - Success response example
 * {
 *   "acknowledged": true,
 *   "insertedCount": 1,
 *   "insertedIds": {
 *      "0": "64f660748761f590a01767e7"
 *   }
 * }
 * @example response - 400 - Error response example when user already exists
 * {
 *   "message": "User 123456789 already registed or fields not filled"
 * }
 * @example response - 400 - Error response example when payload is not iterable
 * {
 *   "message": "Payload is not iterable"
 * }
 */
router.post('/import', authenticateApiKey, async (req, res) => {
  const db = await Database.getInstance(req);
  const collection = db.collection('users');
  const inputData = req.body;
  const toInsert = [];

  if (!Array.isArray(inputData)) {
    return res.status(400).send({
      message: 'Payload is not iterable',
    });
  }

  // Extract all Telegram IDs from the inputData
  const inputTelegramIDs = inputData.map((entry) => entry.UserID);

  // Fetch all users from DB that match the input IDs
  const existingUsers = await collection
    .find({
      userTelegramID: { $in: inputTelegramIDs },
    })
    .toArray();

  const existingTelegramIDs = existingUsers.map((user) => user.userTelegramID);

  // Filter out the inputData entries that are not in the existing list
  const nonExistingUsers = inputData.filter(
    (entry) => !existingTelegramIDs.includes(entry.UserID)
  );

  // Format the non-existing users for insertion
  nonExistingUsers.forEach((entry) => {
    const userFormatted = {
      userTelegramID: entry.UserID,
      userName: entry.FirstName,
      userHandle: entry.UserHandle,
      responsePath: entry.ResponsePath,
      patchwallet: entry.wallet,
      dateAdded: new Date().toISOString(),
    };
    toInsert.push(userFormatted);
  });

  // Insert the non-existing users to the DB
  if (toInsert.length > 0) {
    const insertedData = await collection.insertMany(toInsert);
    res.status(201).send(insertedData);
  } else {
    res.status(400).send({ message: 'No valid data to insert' });
  }
});

export default router;
