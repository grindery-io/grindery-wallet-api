import { Database } from '../db/conn.js';
import fs from 'fs';
import csv from 'csv-parser';

// Usage: importUsersFromCSV(filePath)
// Description: This function imports user data from a CSV file into the database.
// - filePath: The path to the CSV file containing user data.
// Example: importUsersFromCSV("/path/to/your/file.csv");
async function importUsersFromCSV(filePath) {
  const db = await Database.getInstance();
  const collection = db.collection('users');
  const toInsert = [];

  try {
    // Read the CSV file and parse its contents
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => {
        // Extract data from CSV row and format it
        toInsert.push({
          userTelegramID: data.UserID,
          responsePath: data.ResponsePath,
          userHandle: data.UserHandle,
          userName: data.FirstName + ' ' + data.LastName,
          patchwallet: data.wallet,
          dateAdded: new Date(data.FirstActive).toISOString(),
        });
      })
      .on('end', async () => {
        // Retrieve existing userTelegramIDs from the database
        const existingTelegramIDs = (
          await collection.distinct('userTelegramID')
        ).map(String);

        // Filter out new users not present in the database
        const newUsers = toInsert.filter(
          (entry) => !existingTelegramIDs.includes(entry.userTelegramID)
        );

        if (newUsers.length > 0) {
          // Insert new users into the database
          await collection.insertMany(newUsers);
          console.log('Missing users inserted');
        } else {
          console.log('No new users to insert.');
        }

        process.exit(0);
      });
  } catch (error) {
    console.error('Error reading CSV file:', error);
    process.exit(1);
  }
}

// Example usage of the function
// Description: This function removes users from the database whose userTelegramID contains a "+" character.
// removeUsersScientificNotationInTelegramID();
async function removeUsersScientificNotationInTelegramID() {
  try {
    const db = await Database.getInstance();
    const collectionUsers = db.collection('users');

    // Define a filter to find users with "+" in userTelegramID
    const filter = { userTelegramID: { $regex: /\+/ } };

    // Delete the matching documents
    const deleteResult = await collectionUsers.deleteMany(filter);

    console.log(
      `Deleted ${deleteResult.deletedCount} users with '+' in userTelegramID`
    );
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
  } finally {
    process.exit(0);
  }
}

// Example usage of the functions:
// const users = [
//   { userTelegramID: "12345" },
//   { userTelegramID: "67890" },
//   { userTelegramID: "12345" },
//   { userTelegramID: "12345" },
//   { userTelegramID: "67890" },
// ];
// logUserTelegramIDsFromArrayOfUsers(users);
function logUserTelegramIDsFromArrayOfUsers(users) {
  const userTelegramIDCounts = {}; // To store the count of each unique userTelegramID

  // Iterate through the users array
  users.forEach((result) => {
    const userTelegramID = result.userTelegramID;

    // Check if userTelegramID already exists in the userTelegramIDCounts dictionary
    if (userTelegramIDCounts[userTelegramID]) {
      // If yes, increment the counter
      userTelegramIDCounts[userTelegramID]++;
    } else {
      // If not, initialize the counter to 1
      userTelegramIDCounts[userTelegramID] = 1;
    }
  });

  // Iterate through the dictionary and display the results
  for (const [userTelegramID, count] of Object.entries(userTelegramIDCounts)) {
    console.log(`userTelegramID: ${userTelegramID}, Count: ${count}`);
  }
}
