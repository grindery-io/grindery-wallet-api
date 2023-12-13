import { Database } from '../db/conn';
import { USERS_COLLECTION } from './constants';

/**
 * @summary Gets user object from authorization header
 * @param {object} req - request object
 * @returns {object} User object
 */
export const getUser = (req: any): any => {
  const authorization = req.headers?.['authorization'];
  const token = authorization.split(' ')?.[1];
  const data = Object.fromEntries(new URLSearchParams(token));
  const user = JSON.parse(data.user || '{}');
  return user;
};

export const deleteUserTelegramSession = async (
  telegramUserId: string,
  req: any
): Promise<void> => {
  try {
    const db = await Database.getInstance(req);
    await db.collection(USERS_COLLECTION).updateOne(
      {
        userTelegramID: telegramUserId,
        telegramSession: { $exists: true },
      },
      {
        $unset: {
          telegramSession: '',
        },
      }
    );
  } catch (error: any) {
    throw new Error(error);
  }
};
