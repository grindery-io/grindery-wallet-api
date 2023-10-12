import { Database } from '../db/conn.js';
import {
  REWARDS_COLLECTION,
  TRANSFERS_COLLECTION,
  USERS_COLLECTION,
} from './constants.js';
import {
  getPatchWalletAccessToken,
  getPatchWalletAddressFromTgId,
  sendTokens,
} from './patchwallet.js';
import { addIdentitySegment, addTrackSegment } from './segment.js';
import axios from 'axios';
import 'dotenv/config';
import { sendTelegramMessage } from './telegram.js';

/**
 * Handles a new user registration event.
 * @param {object} params - User registration parameters.
 * @returns {Promise<boolean>} Returns a Promise that resolves to true if the user is successfully registered, false otherwise.
 */

export async function handleNewUser(params) {
  try {
    const db = await Database.getInstance();

    // Check if the user already exists in the "users" collection
    const user = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: params.userTelegramID });
    if (user) {
      // The user already exists, stop processing
      console.log(`[${user.userTelegramID}] user already exist.`);
      return true;
    }

    const dateAdded = new Date();
    const patchwallet = await getPatchWalletAddressFromTgId(
      params.userTelegramID
    );

    // The user doesn't exist, add him to the "users" collection
    await db.collection(USERS_COLLECTION).insertOne({
      userTelegramID: params.userTelegramID,
      responsePath: params.responsePath,
      userHandle: params.userHandle,
      userName: params.userName,
      patchwallet: patchwallet,
      dateAdded: dateAdded,
    });

    await addIdentitySegment({
      ...params,
      patchwallet: patchwallet,
      dateAdded: dateAdded,
    });

    await axios.post(process.env.FLOWXO_NEW_USER_WEBHOOK, {
      userTelegramID: params.userTelegramID,
      responsePath: params.responsePath,
      userHandle: params.userHandle,
      userName: params.userName,
      patchwallet: patchwallet,
      dateAdded: dateAdded,
    });

    console.log(`[${params.userTelegramID}] user added to the database.`);
    return true;
  } catch (error) {
    console.error('Error processing new user event:', error);
  }
  return false;
}

export async function handleSignUpReward(
  db,
  userTelegramID,
  responsePath,
  userHandle,
  userName,
  rewardWallet
) {
  try {
    // Check if the user has already received a signup reward
    if (
      await db.collection(REWARDS_COLLECTION).findOne({
        userTelegramID: userTelegramID,
        reason: 'user_sign_up',
      })
    ) {
      // The user has already received a signup reward, stop processing
      console.log(`[${userTelegramID}] user already received signup reward.`);
      return true;
    }

    let txReward = undefined;

    try {
      txReward = await sendTokens(
        process.env.SOURCE_TG_ID,
        rewardWallet,
        '100',
        await getPatchWalletAccessToken()
      );
    } catch (error) {
      console.error('Error processing PatchWallet token sending:', error);
      return false;
    }

    if (txReward.data.txHash) {
      const dateAdded = new Date();

      // Add the reward to the "rewards" collection
      await db.collection(REWARDS_COLLECTION).insertOne({
        userTelegramID: userTelegramID,
        responsePath: responsePath,
        walletAddress: rewardWallet,
        reason: 'user_sign_up',
        userHandle: userHandle,
        userName: userName,
        amount: '100',
        message: 'Sign up reward',
        transactionHash: txReward.data.txHash,
        dateAdded: dateAdded,
      });

      console.log(`[${userTelegramID}] signup reward added.`);

      await axios.post(process.env.FLOWXO_NEW_SIGNUP_REWARD_WEBHOOK, {
        userTelegramID: userTelegramID,
        responsePath: responsePath,
        walletAddress: rewardWallet,
        reason: 'user_sign_up',
        userHandle: userHandle,
        userName: userName,
        amount: '100',
        message: 'Sign up reward',
        transactionHash: txReward.data.txHash,
        dateAdded: dateAdded,
      });

      console.log(`[${userTelegramID}] user added to the database.`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error processing signup reward event:', error);
  }
  return true;
}

export async function handleReferralReward(
  db,
  userTelegramID,
  responsePath,
  userHandle,
  userName,
  patchwallet
) {
  try {
    // Initialize a flag to track the success of all transactions
    let processed = true;

    // Retrieve all transfers where this user is the recipient
    // For each transfer, award a reward to the sender
    for (const transfer of await db
      .collection(TRANSFERS_COLLECTION)
      .find({
        senderTgId: { $ne: userTelegramID },
        recipientTgId: userTelegramID,
      })
      .toArray()) {
      if (
        await db.collection(REWARDS_COLLECTION).findOne({
          reason: '2x_reward',
          parentTransactionHash: transfer.transactionHash,
        })
      ) {
        continue;
      }

      // Retrieve sender information from the "users" collection
      const senderInformation = await db
        .collection(USERS_COLLECTION)
        .findOne({ userTelegramID: transfer.senderTgId });

      const senderWallet =
        senderInformation.patchwallet ??
        (await getPatchWalletAddressFromTgId(senderInformation.userTelegramID));

      let txReward = undefined;

      try {
        txReward = await sendTokens(
          process.env.SOURCE_TG_ID,
          senderWallet,
          '50',
          await getPatchWalletAccessToken()
        );
      } catch (error) {
        console.error('Error processing PatchWallet token sending:', error);
        processed = false;
        continue;
      }

      if (txReward.data.txHash) {
        const dateAdded = new Date();

        // Add the reward to the "rewards" collection
        await db.collection(REWARDS_COLLECTION).insertOne({
          userTelegramID: senderInformation.userTelegramID,
          responsePath: senderInformation.responsePath,
          walletAddress: senderWallet,
          reason: '2x_reward',
          userHandle: senderInformation.userHandle,
          userName: senderInformation.userName,
          amount: '50',
          message: 'Referral reward',
          transactionHash: txReward.data.txHash,
          dateAdded: dateAdded,
          parentTransactionHash: transfer.transactionHash,
        });

        await axios.post(process.env.FLOWXO_NEW_REFERRAL_REWARD_WEBHOOK, {
          newUserTgId: userTelegramID,
          newUserResponsePath: responsePath,
          newUserUserHandle: userHandle,
          newUserUserName: userName,
          newUserPatchwallet: patchwallet,
          userTelegramID: senderInformation.userTelegramID,
          responsePath: senderInformation.responsePath,
          walletAddress: senderWallet,
          reason: '2x_reward',
          userHandle: senderInformation.userHandle,
          userName: senderInformation.userName,
          amount: '50',
          message: 'Referral reward',
          transactionHash: txReward.data.txHash,
          dateAdded: dateAdded,
          parentTransactionHash: transfer.transactionHash,
        });

        console.log(
          `[${senderInformation.userTelegramID}] referral reward added.`
        );
      } else {
        // If a transaction fails, set the flag to false
        processed = false;
      }
    }

    return processed;
  } catch (error) {
    console.error('Error processing referral reward event:', error);
  }

  return true;
}

export async function handleLinkReward(
  db,
  userTelegramID,
  referentUserTelegramID
) {
  try {
    const referent = await db
      .collection(USERS_COLLECTION)
      .findOne({ userTelegramID: referentUserTelegramID });

    if (!referent) {
      // The referent user is not in the database
      console.log(`[${referentUserTelegramID}] referent user is not a user.`);
      return true;
    }

    if (
      await db.collection(REWARDS_COLLECTION).findOne({
        sponsoredUserTelegramID: userTelegramID,
        reason: 'referral_link',
      })
    ) {
      // The user has already received a referral link reward, stop processing
      console.log(
        `[${userTelegramID}] already sponsored another user for a referral link reward.`
      );

      return true;
    }

    const rewardWallet =
      referent.patchwallet ??
      (await getPatchWalletAddressFromTgId(referentUserTelegramID));

    let txReward = undefined;

    try {
      txReward = await sendTokens(
        process.env.SOURCE_TG_ID,
        rewardWallet,
        '10',
        await getPatchWalletAccessToken()
      );
    } catch (error) {
      console.error('Error processing PatchWallet token sending:', error);
      return false;
    }

    if (txReward.data.txHash) {
      const dateAdded = new Date();

      // Add the reward to the "rewards" collection
      await db.collection(REWARDS_COLLECTION).insertOne({
        userTelegramID: referentUserTelegramID,
        responsePath: referent.responsePath,
        walletAddress: rewardWallet,
        reason: 'referral_link',
        userHandle: referent.userHandle,
        userName: referent.userName,
        amount: '10',
        message: 'Referral link',
        transactionHash: txReward.data.txHash,
        dateAdded: dateAdded,
        sponsoredUserTelegramID: userTelegramID,
      });

      console.log(`[${referentUserTelegramID}] referral link reward added.`);

      await axios.post(process.env.FLOWXO_NEW_LINK_REWARD_WEBHOOK, {
        userTelegramID: referentUserTelegramID,
        responsePath: referent.responsePath,
        walletAddress: rewardWallet,
        reason: 'referral_link',
        userHandle: referent.userHandle,
        userName: referent.userName,
        amount: '10',
        message: 'Referral link',
        transactionHash: txReward.data.txHash,
        dateAdded: dateAdded,
        sponsoredUserTelegramID: userTelegramID,
      });

      return true;
    }

    return false;
  } catch (error) {
    console.error('Error processing referral link reward event:', error);
  }
  return true;
}

/**
 * Handles a new sign-up reward event.
 * @param {object} params - Sign-up reward parameters.
 * @returns {Promise<boolean>} Returns a Promise that resolves to true if the reward is successfully processed, false otherwise.
 */

export async function handleNewReward(params) {
  const db = await Database.getInstance();

  // Check if the user already exists in the "users" collection
  const user = await db
    .collection(USERS_COLLECTION)
    .findOne({ userTelegramID: params.userTelegramID });

  if (user) {
    // The user already exists, stop processing
    console.log(`[${user.userTelegramID}] user already exist.`);
    return true;
  }

  let patchwallet = undefined;

  try {
    patchwallet = await getPatchWalletAddressFromTgId(params.userTelegramID);
  } catch (error) {
    return false;
  }

  const signupReward = await webhook_utils.handleSignUpReward(
    db,
    params.userTelegramID,
    params.responsePath,
    params.userHandle,
    params.userName,
    patchwallet
  );

  if (!signupReward) {
    return false;
  }

  const referralReward = await webhook_utils.handleReferralReward(
    db,
    params.userTelegramID,
    params.responsePath,
    params.userHandle,
    params.userName,
    patchwallet
  );

  if (!referralReward) {
    return false;
  }

  if (params.referentUserTelegramID) {
    const referralLinkReward = await webhook_utils.handleLinkReward(
      db,
      params.userTelegramID,
      params.referentUserTelegramID
    );

    if (!referralLinkReward) {
      return false;
    }
  }

  const dateAdded = new Date();
  // The user doesn't exist, add him to the "users" collection
  await db.collection(USERS_COLLECTION).insertOne({
    userTelegramID: params.userTelegramID,
    userHandle: params.userHandle,
    userName: params.userName,
    responsePath: params.responsePath,
    patchwallet: patchwallet,
    dateAdded: dateAdded,
  });

  try {
    await addIdentitySegment({
      ...params,
      patchwallet: patchwallet,
      dateAdded: dateAdded,
    });
  } catch (error) {
    console.error('Error processing new user in Segment:', error);
  }

  return true;
}

/**
 * Handles a new transaction event.
 * @param {object} params - Transaction parameters.
 * @returns {Promise<boolean>} Returns a Promise that resolves to true if the transaction is successfully processed, false otherwise.
 */

export async function handleNewTransaction(params) {
  const db = await Database.getInstance();

  // Retrieve sender information from the "users" collection
  const senderInformation = await db
    .collection(USERS_COLLECTION)
    .findOne({ userTelegramID: params.senderTgId });

  if (!senderInformation) {
    console.error('Sender is not a user');
    return true;
  }

  let recipientWallet = undefined;

  try {
    recipientWallet = await getPatchWalletAddressFromTgId(params.recipientTgId);
  } catch (error) {
    return false;
  }

  let tx = undefined;

  try {
    tx = await sendTokens(
      params.senderTgId,
      recipientWallet,
      params.amount.toString(),
      await getPatchWalletAccessToken()
    );
  } catch (error) {
    console.error('Error processing PatchWallet token sending:', error);
    if (error?.response?.status === 470) {
      return true;
    }
    return false;
  }

  if (tx.data.txHash) {
    const dateAdded = new Date();

    // Add the reward to the "rewards" collection
    await db.collection(TRANSFERS_COLLECTION).insertOne({
      TxId: tx.data.txHash.substring(1, 8),
      chainId: 'eip155:137',
      tokenSymbol: 'g1',
      tokenAddress: process.env.G1_POLYGON_ADDRESS,
      senderTgId: params.senderTgId,
      senderWallet: senderInformation.patchwallet,
      senderName: senderInformation.userName,
      senderHandle: senderInformation.userHandle,
      recipientTgId: params.recipientTgId,
      recipientWallet: recipientWallet,
      tokenAmount: params.amount.toString(),
      transactionHash: tx.data.txHash,
      dateAdded: dateAdded,
    });

    try {
      await addTrackSegment({
        userTelegramID: params.senderTgId,
        TxId: tx.data.txHash.substring(1, 8),
        senderTgId: params.senderTgId,
        senderWallet: senderInformation.patchwallet,
        senderName: senderInformation.userName,
        senderHandle: senderInformation.userHandle,
        recipientTgId: params.recipientTgId,
        recipientWallet: recipientWallet,
        tokenAmount: params.amount.toString(),
        transactionHash: tx.data.txHash,
        dateAdded: dateAdded,
      });

      await axios.post(process.env.FLOWXO_NEW_TRANSACTION_WEBHOOK, {
        senderResponsePath: senderInformation.responsePath,
        TxId: tx.data.txHash.substring(1, 8),
        chainId: 'eip155:137',
        tokenSymbol: 'g1',
        tokenAddress: process.env.G1_POLYGON_ADDRESS,
        senderTgId: params.senderTgId,
        senderWallet: senderInformation.patchwallet,
        senderName: senderInformation.userName,
        senderHandle: senderInformation.userHandle,
        recipientTgId: params.recipientTgId,
        recipientWallet: recipientWallet,
        tokenAmount: params.amount.toString(),
        transactionHash: tx.data.txHash,
        dateAdded: dateAdded,
      });

      // send telegram message if params.message exists and sender has a telegram session
      if (params.message && senderInformation.telegramSession) {
        const messageSendingResult = await sendTelegramMessage(
          params.message,
          params.recipientTgId,
          senderInformation
        );
        // log error if message sending failed
        if (!messageSendingResult.success) {
          console.error(
            'Error sending telegram message:',
            messageSendingResult.message
          );
        }
      }
    } catch (error) {
      console.error(
        'Error processing Segment or FlowXO webhook, or sending telegram message:',
        error
      );
    }

    console.log(
      `[${tx.data.txHash}] transaction from ${params.senderTgId} to ${
        params.recipientTgId
      } for ${params.amount.toString()} added.`
    );
    return true;
  }

  return false;
}

export const webhook_utils = {
  handleSignUpReward,
  handleLinkReward,
  handleReferralReward,
};
