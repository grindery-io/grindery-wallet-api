import { Database } from '../db/conn';
import {
  REWARDS_COLLECTION,
  TRANSFERS_COLLECTION,
  USERS_COLLECTION,
} from './constants';

export const getSocialContacts = async (
  id: string,
  req: any,
  exclude?: string[]
) => {
  try {
    const db = await Database.getInstance(req);
    const transactions = await db
      .collection(TRANSFERS_COLLECTION)
      .find({
        $or: [{ senderTgId: id }, { recipientTgId: id }],
      })
      .toArray();

    const referralRewards = await db
      .collection(REWARDS_COLLECTION)
      .find({
        sponsoredUserTelegramID: id,
      })
      .toArray();

    const users = await db
      .collection(USERS_COLLECTION)
      .find({
        $and: [
          {
            userTelegramID: {
              $nin: exclude || [],
            },
          },
          {
            userTelegramID: { $exists: true },
          },
          {
            userTelegramID: { $ne: id },
          },
          {
            userTelegramID: {
              $ne: '6044567863',
            },
          },
          {
            $or: [
              {
                userTelegramID: {
                  $in: transactions.map((t: any) => t.senderTgId),
                },
              },
              {
                userTelegramID: {
                  $in: transactions.map((t: any) => t.recipientTgId),
                },
              },
              {
                userTelegramID: {
                  $in: referralRewards.map((r: any) => r.userTelegramID),
                },
              },
            ],
          },
        ],
      })
      .project({
        telegramSession: 0,
        telegramSessionSavedDate: 0,
        webAppOpened: 0,
        webAppOpenedFirstDate: 0,
        webAppOpenedLastDate: 0,
        phoneNumber: 0,
        responsePath: 0,
      })
      .toArray();

    return users;
  } catch (error) {
    return [];
  }
};
