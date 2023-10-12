import { Database } from '../db/conn.js';
import fs from 'fs';
import csv from 'csv-parser';
import web3 from 'web3';
import {
  REWARDS_COLLECTION,
  TRANSFERS_COLLECTION,
} from '../utils/constants.js';

// Example usage of the functions:
// removeDuplicateTransfers();
async function removeDuplicateTransfers() {
  try {
    const db = await Database.getInstance();
    const collectionTransfers = db.collection('transfers');

    // Aggregation pipeline to identify duplicates and keep the first instance
    const aggregationPipeline = [
      {
        $group: {
          _id: '$transactionHash',
          firstInstance: { $first: '$_id' },
        },
      },
    ];

    // Find the first instance of each duplicate transactionHash
    const firstInstances = await collectionTransfers
      .aggregate(aggregationPipeline)
      .toArray();

    // Create an array of _id values to keep (first instances)
    const idsToKeep = firstInstances.map((instance) => instance.firstInstance);

    // Delete all documents that are not in the idsToKeep array
    const deleteResult = await collectionTransfers.deleteMany({
      _id: { $nin: idsToKeep },
    });

    console.log(`Deleted ${deleteResult.deletedCount} duplicate transfers.`);
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
  } finally {
    process.exit(0);
  }
}

// Usage: transfersCleanup(filePath)
// Description: This function processes transfers data from a CSV file and deletes incomplete transfers from the database.
// - filePath: The path to the CSV file containing transfers data.
// Example: transfersCleanup("dune.csv");
async function transfersCleanup(fileName) {
  const db = await Database.getInstance();
  const collection = db.collection('transfers');
  const hashesInCsv = [];
  let latestTimestamp = null;

  fs.createReadStream(fileName)
    .pipe(csv())
    .on('data', (row) => {
      hashesInCsv.push(row.hash);
      const rowTimestamp = new Date(row.block_time);
      if (latestTimestamp === null || rowTimestamp > latestTimestamp) {
        latestTimestamp = rowTimestamp;
      }
    })
    .on('end', async () => {
      if (latestTimestamp === null) {
        console.log('No timestamp found in CSV.');
        process.exit(1);
      }

      const transfersInDb = await collection
        .find({
          dateAdded: { $lte: latestTimestamp },
        })
        .toArray();

      const hashesToDelete = transfersInDb
        .filter((transfer) => !hashesInCsv.includes(transfer.transactionHash))
        .map((transfer) => transfer.transactionHash);

      if (hashesToDelete.length === 0) {
        console.log('All transfers in database match the transfers in CSV.');
      } else {
        const deleteResult = await collection.deleteMany({
          transactionHash: { $in: hashesToDelete },
        });
        console.log(
          `${deleteResult.deletedCount} incomplete transfers deleted.`
        );
      }

      console.log('\n All tasks completed \n');
      process.exit(0);
    })
    .on('error', (error) => {
      console.log('\n Errors during CSV parsing \n');
      process.exit(1);
    });
}

async function updateTransfersInformations() {
  try {
    // Connect to the database
    const db = await Database.getInstance();

    // Get the transfers collection
    const transfersCollection = db.collection('transfers');

    // Get the users collection
    const usersCollection = db.collection('users');

    // Find all transfers in the collection
    const allTransfers = await transfersCollection.find({}).toArray();
    const totalTransfers = allTransfers.length;

    const allUsers = await usersCollection.find({}).toArray();

    // Create an array to store bulk write operations
    const bulkWriteOperations = [];

    let index = 0;

    for (const transfer of allTransfers) {
      index++;

      // Update senderWallet and recipientWallet to checksum addresses
      transfer.senderWallet = web3.utils.toChecksumAddress(
        transfer.senderWallet
      );
      transfer.recipientWallet = web3.utils.toChecksumAddress(
        transfer.recipientWallet
      );

      // Find sender user based on senderWallet
      const senderUser = allUsers.find(
        (user) => user.patchwallet === transfer.senderWallet
      );

      // Find recipient user based on recipientWallet
      const recipientUser = allUsers.find(
        (user) => user.patchwallet === transfer.recipientWallet
      );

      if (senderUser) {
        // Fill senderTgId and senderName
        transfer.senderTgId = senderUser.userTelegramID;
        transfer.senderName = senderUser.userName;
      }

      if (recipientUser) {
        // Fill recipientTgId
        transfer.recipientTgId = recipientUser.userTelegramID;
      }

      // Create an update operation and add it to the bulk write array
      const updateOperation = {
        updateOne: {
          filter: { _id: transfer._id },
          update: { $set: transfer },
        },
      };

      bulkWriteOperations.push(updateOperation);

      console.log(
        `Updated transfer ${index}/${totalTransfers}: ${transfer._id}`
      );
    }

    // Perform bulk write operations
    await transfersCollection.bulkWrite(bulkWriteOperations);

    console.log('All transfers have been updated.');
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    process.exit(0);
  }
}

async function removeRewardFromTransfers() {
  try {
    const db = await Database.getInstance();
    const collectionTransfers = db.collection(TRANSFERS_COLLECTION);
    const collectionRewards = db.collection(REWARDS_COLLECTION);

    // Get all transaction hashes from the rewards collection
    const rewardHashes = await collectionRewards.distinct('transactionHash');

    const allTransfers = await collectionTransfers.find({}).toArray();
    const totalTransfers = allTransfers.length;
    let deletedTransfers = [];

    let index = 0;

    for (const transfer of allTransfers) {
      index++;

      // Check if the transactionHash exists in the rewardHashes array
      // and sender is SOURCE_TG_ID
      if (
        rewardHashes.includes(transfer.transactionHash) &&
        transfer.senderTgId == process.env.SOURCE_TG_ID
      ) {
        // Delete the transfer
        await collectionTransfers.deleteOne({
          _id: transfer._id,
        });
        deletedTransfers.push(transfer);

        console.log(
          `Deleted transfer ${index}/${totalTransfers}: ${transfer._id}`
        );
      }
    }

    console.log(`Total deleted transfers: ${deletedTransfers.length}`);
  } catch (error) {
    console.error(`An error occurred: ${error.message}`);
  } finally {
    process.exit(0);
  }
}
