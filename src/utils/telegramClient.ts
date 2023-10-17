import 'dotenv/config';
import { TelegramClient } from 'telegram';
import { Session } from 'telegram/sessions';

const TGClient = (session: string | Session) => {
  return new TelegramClient(
    session,
    Number(process.env.TELEGRAM_API_ID),
    process.env.TELEGRAM_API_HASH || '',
    {
      connectionRetries: 3,
      maxConcurrentDownloads: 1,
    }
  );
};

export default TGClient;
