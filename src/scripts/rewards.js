import { Database } from '../db/conn.js';
import { getPatchWalletAccessToken, sendTokens } from '../utils/patchwallet.js';
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer';
import fs from 'fs';
import csv from 'csv-parser';
import web3 from 'web3';
import { REWARDS_COLLECTION, USERS_COLLECTION } from '../utils/constants.js';

/**
 * Distributes a sign-up reward of 100 Grindery One Tokens to users without previous rewards.
 * Renewal of Patch Wallet access token is handled.
 */
async function distributeSignupRewards() {
  try {
    // Connect to the database
    const db = await Database.getInstance();
    const rewardsCollection = db.collection('rewards');

    // Obtain the initial PatchWallet access token
    let patchWalletAccessToken = await getPatchWalletAccessToken();

    // Track the time of the last token renewal
    let lastTokenRenewalTime = Date.now();

    const allUsers = await db.collection('users').find({}).toArray();
    let userCount = 0;

    // Load all rewards into memory for filtering
    const allRewards = await rewardsCollection
      .find({ amount: '100' })
      .toArray();

    for (const user of allUsers) {
      userCount++;

      // Check if there are no rewards for the current user
      if (
        !allRewards.some(
          (reward) => reward.userTelegramID === user.userTelegramID
        )
      ) {
        console.log(
          `[${userCount}/${allUsers.length}] User ${user.userTelegramID} has no reward with amount "100"`
        );

        // Check if it's time to renew the PatchWallet access token
        if (Date.now() - lastTokenRenewalTime >= 50 * 60 * 1000) {
          patchWalletAccessToken = await getPatchWalletAccessToken();
          lastTokenRenewalTime = Date.now();

          console.log('PatchWallet access token has been updated.');
        }

        try {
          // Send the sign-up reward to the user's wallet
          const txReward = await sendTokens(
            process.env.SOURCE_TG_ID, // Sender's Telegram ID
            user.patchwallet, // User's wallet address
            '100', // Amount of the reward
            patchWalletAccessToken // Access token for PatchWallet API
          );

          if (txReward.data.txHash) {
            // Log the issuance of the reward and insert the record into the rewards collection
            await rewardsCollection.insertOne({
              userTelegramID: user.userTelegramID,
              responsePath: user.responsePath,
              walletAddress: user.patchwallet,
              reason: 'user_sign_up',
              userHandle: user.userHandle,
              userName: user.userName,
              amount: '100',
              message: 'Sign up reward',
              transactionHash: txReward.data.txHash,
              dateAdded: new Date(Date.now()),
            });

            console.log(
              `[${userCount}/${allUsers.length}] User ${user.userTelegramID} has been rewarded for signing up.`
            );
          }
        } catch (error) {
          // Handle errors and log them
          console.error('An error occurred during reward distribution:', error);
        }
      }
    }

    // Log completion message
    console.log('All sign-up rewards have been distributed.');
  } catch (error) {
    // Handle errors and log them
    console.error('An error occurred:', error);
  } finally {
    // Exit the script
    process.exit(0);
  }
}

export async function distributeReferralRewards() {
  try {
    // Connect to the database
    const db = await Database.getInstance();
    const rewardsCollection = db.collection('rewards');

    // Obtain the initial PatchWallet access token
    let patchWalletAccessToken = await getPatchWalletAccessToken();

    // Track the time of the last token renewal
    let lastTokenRenewalTime = Date.now();

    // Create an array to store rewarded users
    const rewardedUsers = [];

    // Export the users and rewards collections as arrays
    const allUsers = await db.collection('users').find({}).toArray();
    const allRewardsReferral = await rewardsCollection
      .find({ reason: '2x_reward' })
      .toArray();
    const allTransfers = await db.collection('transfers').find({}).toArray();

    let transferCount = 0;

    for (const transfer of allTransfers) {
      transferCount++;

      // Find the recipient user based on their Telegram ID
      const recipientUser = allUsers.find(
        (user) => user.userTelegramID === transfer.recipientTgId
      );

      // Check if the recipient user became a user before or after the transfer
      if (
        !recipientUser ||
        (recipientUser &&
          new Date(recipientUser.dateAdded) < new Date(transfer.dateAdded))
      ) {
        // The user was already a user before the transfer, so no action needed
        continue;
      }

      // Check if a reward for this transfer has already been issued
      if (
        allRewardsReferral.some(
          (reward) => reward.parentTransactionHash === transfer.TxId
        )
      ) {
        // A reward has already been issued for this transfer, so skip to the next one
        continue;
      }

      // Check if it's time to renew the PatchWallet access token
      if (Date.now() - lastTokenRenewalTime >= 50 * 60 * 1000) {
        patchWalletAccessToken = await getPatchWalletAccessToken();
        lastTokenRenewalTime = Date.now();
        console.log('PatchWallet access token has been updated.');
      }

      // Find information about the sender of the transaction
      const senderUser = allUsers.find(
        (user) =>
          user.userTelegramID === transfer.senderTgId &&
          transfer.senderTgId !== process.env.SOURCE_TG_ID
      );

      if (senderUser) {
        try {
          console.log(
            `[${transferCount}/${allTransfers.length}] User ${senderUser.userTelegramID} has no referral reward for sending ${transfer.tokenAmount} tokens to ${transfer.recipientTgId}`
          );
          // Get the sender's wallet address based on their Telegram ID if not already existing
          const rewardWallet =
            senderUser.patchwallet ??
            (await getPatchWalletAddressFromTgId(transfer.senderTgId));

          // Determine the reward amount based on the date and transfer amount
          let rewardAmount =
            new Date(transfer.dateAdded) < new Date('2023-09-07T12:00:00Z') &&
            Number(transfer.tokenAmount) < 1000
              ? (Number(transfer.tokenAmount) * 2).toString()
              : '50';

          let rewardMessage =
            new Date(transfer.dateAdded) < new Date('2023-09-07T12:00:00Z') &&
            Number(transfer.tokenAmount) < 1000
              ? '2x Referral reward'
              : 'Referral reward';

          // Send a reward of 50 tokens using the Patch Wallet API
          const txReward = await sendTokens(
            process.env.SOURCE_TG_ID,
            rewardWallet,
            Number(rewardAmount).toFixed(18),
            patchWalletAccessToken
          );

          // Log the issuance of the reward and insert the record into the rewards collection
          await rewardsCollection.insertOne({
            userTelegramID: senderUser.userTelegramID,
            responsePath: senderUser.responsePath,
            walletAddress: rewardWallet,
            reason: '2x_reward',
            userHandle: senderUser.userHandle,
            userName: senderUser.userName,
            amount: rewardAmount,
            message: rewardMessage,
            transactionHash: txReward.data.txHash,
            parentTransactionHash: transfer.transactionHash.substring(1, 8),
            dateAdded: new Date(Date.now()),
          });

          // Add the rewarded user to the array with reward amount
          rewardedUsers.push({
            userTelegramIDToReward: senderUser.userTelegramID,
            TxId: transfer.TxId,
            chainId: transfer.chainId,
            tokenSymbol: transfer.tokenSymbol,
            tokenAddress: transfer.tokenAddress,
            senderTgId: transfer.senderTgId,
            senderWallet: transfer.senderWallet,
            senderName: transfer.senderName,
            recipientTgId: transfer.recipientTgId,
            recipientWallet: transfer.recipientWallet,
            tokenAmount: transfer.tokenAmount,
            transactionHash: transfer.transactionHash,
            dateAdded: transfer.dateAdded,
            rewardAmount,
          });

          console.log(
            `[${transferCount}/${allTransfers.length}] User ${senderUser.userTelegramID} has been rewarded for sending tokens.`
          );
        } catch (error) {
          // Handle errors and log them
          console.error('An error occurred during reward distribution:', error);
        }
      }
    }

    console.log(`${rewardedUsers.length} users have been rewarded.`);
  } catch (error) {
    // Handle errors and log them
    console.error('An error occurred:', error);
  } finally {
    // Exit the script
    process.exit(0);
  }
}

// Usage: startImport(filePath)
// Description: This function imports rewards data from a CSV file into the database.
// - filePath: The path to the CSV file containing rewards data.
// Example: startImport("/path/to/your/file.csv");
const startImport = (fileName) => {
  const rewards = [];
  fs.createReadStream(fileName)
    .pipe(csv())
    .on('data', (row) => {
      rewards.push(row);
    })
    .on('end', async () => {
      await saveRewards(rewards);
      console.log('\n All data has been read \n');
      process.exit(0);
    })
    .on('error', (error) => {
      console.log('\n Errors during CSV parsing \n');
      process.exit(1);
    });
};

async function saveRewards(rewards) {
  const db = await Database.getInstance();
  const collection = db.collection('rewards-test');

  // Step 1: Create a set of existing rewards hashes
  const existingHashes = await collection.distinct('transactionHash');

  // Step 2: Filter the rewards to find the missing ones and format them
  const formattedMissingRewards = rewards
    .filter((reward) => {
      // Exclude rewards with amounts other than 100 or 50
      const amount = Number(reward.value) / 1e18;
      return (
        (amount === 100 || amount === 50) &&
        !existingHashes.includes(reward.evt_tx_hash)
      );
    })
    .map((rewards) => {
      const amount = String(Number(rewards.value) / 1e18);
      const message = generateRewardMessage(amount, rewards.evt_block_time);
      return {
        userTelegramID: '',
        responsePath: '',
        walletAddress: web3.utils.toChecksumAddress(rewards.to),
        reason: message.reason,
        userHandle: '',
        userName: '',
        amount: amount,
        message: message.description,
        transactionHash: rewards.evt_tx_hash,
        dateAdded: new Date(rewards.evt_block_time),
      };
    });

  // Step 3: Extract all walletAddress values from formattedMissingRewards
  const walletAddresses = formattedMissingRewards.map(
    (reward) => reward.walletAddress
  );

  // Step 4: Filter the users collection to match walletAddress values
  const userData = await db
    .collection(USERS_COLLECTION)
    .find({ patchwallet: { $in: walletAddresses } })
    .toArray();

  // Step 5: Loop through each formatted missing reward and fill user data
  formattedMissingRewards.forEach((reward) => {
    const matchingUser = userData.find(
      (user) => user.patchwallet === reward.walletAddress
    );

    if (matchingUser) {
      reward.userTelegramID = matchingUser.userTelegramID;
      reward.responsePath = matchingUser.responsePath;
      reward.userHandle = matchingUser.userHandle;
      reward.userName = matchingUser.userName;
    }
  });

  // Step 6: Batch insert the missing rewards into the collection if needed
  const batchSize = 10000;
  for (let i = 0; i < formattedMissingRewards.length; i += batchSize) {
    const batch = formattedMissingRewards.slice(i, i + batchSize);
    await collection.insertMany(batch);
    console.log('Batch: ', i);
  }
}

const generateRewardMessage = (amount, blockTime) => {
  const transitionDate = new Date('2023-09-05T12:00:00Z');
  const dateObj = new Date(blockTime);
  const isBeforeTuesdayNoon = dateObj < transitionDate;

  if (amount === '100') {
    return {
      reason: 'user_sign_up',
      description: 'Sign up reward',
    };
  } else if (amount === '50' && isBeforeTuesdayNoon) {
    return {
      reason: 'hunt',
      description: 'Product Hunt reward',
    };
  } else if (amount === '50' && !isBeforeTuesdayNoon) {
    return {
      reason: '2x_reward',
      description: '2x Referral reward',
    };
  } else {
    return {
      reason: undefined,
      description: undefined,
    };
  }
};

async function updateRewardMessages() {
  const db = await Database.getInstance();
  const collection = db.collection(REWARDS_COLLECTION);

  const rewards = await collection.find({}).toArray();
  const totalRewards = rewards.length;

  const bulkUpdateOperations = [];

  let processedCount = 0;

  for (const reward of rewards) {
    let updatedMessage = '';

    if (reward.amount === '100') {
      updatedMessage = 'Sign up reward';
    } else if (
      reward.amount === '50' &&
      reward.message.includes('Product Hunt')
    ) {
      updatedMessage = 'Product Hunt reward';
    } else if (
      reward.amount === '50' &&
      !reward.message.includes('Product Hunt')
    ) {
      updatedMessage = 'Referral reward';
    } else {
      updatedMessage = '2x Referral reward';
    }

    if (updatedMessage) {
      bulkUpdateOperations.push({
        updateOne: {
          filter: { _id: reward._id },
          update: { $set: { message: updatedMessage } },
        },
      });

      processedCount++;
      console.log(
        `[${processedCount}/${totalRewards}]: Message updated for ${reward.userTelegramID}`
      );
    }
  }

  if (bulkUpdateOperations.length > 0) {
    await collection.bulkWrite(bulkUpdateOperations);
  }

  console.log('\n All rewards have been updated \n');
  process.exit(0);
}

// Usage: rewardsCleanup(filePath)
// Description: This function processes rewards data from a CSV file and deletes incomplete rewards from the database.
// - filePath: The path to the CSV file containing rewards data.
// Example: rewardsCleanup("dune.csv");
async function rewardsCleanup(fileName) {
  const db = await Database.getInstance();
  const collection = db.collection('rewards-test');
  const hashesInCsv = [];
  let latestTimestamp = null;

  fs.createReadStream(fileName)
    .pipe(csv())
    .on('data', (row) => {
      hashesInCsv.push(row.evt_tx_hash);
      const rowTimestamp = new Date(row.evt_block_time);
      if (latestTimestamp === null || rowTimestamp > latestTimestamp) {
        latestTimestamp = rowTimestamp;
      }
    })
    .on('end', async () => {
      if (latestTimestamp === null) {
        console.log('No timestamp found in CSV.');
        process.exit(1);
      }

      const rewardsInDb = await collection
        .find({
          dateAdded: { $lte: latestTimestamp },
        })
        .toArray();

      const hashesToDelete = rewardsInDb
        .filter((reward) => !hashesInCsv.includes(reward.transactionHash))
        .map((reward) => reward.transactionHash);

      if (hashesToDelete.length === 0) {
        console.log('All rewards in database match the rewards in CSV.');
      } else {
        const deleteResult = await collection.deleteMany({
          transactionHash: { $in: hashesToDelete },
        });
        console.log(`${deleteResult.deletedCount} incomplete rewards deleted.`);
      }

      console.log('\n All tasks completed \n');
      process.exit(0);
    })
    .on('error', (error) => {
      console.log('\n Errors during CSV parsing \n');
      process.exit(1);
    });
}
