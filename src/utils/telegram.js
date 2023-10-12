import { Api } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import TGClient from './telegramClient.js';
import { decrypt } from './crypt.js';

/**
 * @summary Gets user object from authorization header
 * @param {object} req - request object
 * @returns {object} User object
 */
export const getUser = (req) => {
  const authorization = req.headers['authorization'];
  const token = authorization.split(' ')[1];
  const data = Object.fromEntries(new URLSearchParams(token));
  const user = JSON.parse(data.user || {});
  return user;
};

/**
 * @summary Sends Telegram message on behalf of the user
 * @param {string} message - message to be sent
 * @param {string} recipientId  - recipient telegram user id
 * @param {object} senderUser - sender user object
 * @returns {object} Promise object with a boolean `success` property, and a result `message` string
 */
export const sendTelegramMessage = async (message, recipientId, senderUser) => {
  try {
    if (!message) throw new Error('Message is required');
    if (!recipientId) throw new Error('Recipient ID is required');
    if (!senderUser.userHandle) throw new Error('Sender username not found');
    if (!senderUser.telegramSession)
      throw new Error('Telegram session not found');

    const client = TGClient(
      new StringSession(decrypt(senderUser.telegramSession))
    );

    await client.connect();

    if (!client.connected) {
      throw new Error('Telegram client not connected');
    }

    // get recipient handle
    const recipient = await client.invoke(
      new Api.users.GetFullUser({
        id: recipientId,
      })
    );

    const recipientHandle =
      (recipient &&
        recipient.users &&
        recipient.users[0] &&
        recipient.users[0].username) ||
      '';

    const data = {
      peer: recipientHandle,
      message: message,
    };

    const result = await client.invoke(new Api.messages.SendMessage(data));

    if (result) {
      return { success: true, message: 'Message sent successfully' };
    } else {
      return { success: false, message: 'Message sending failed' };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
};
