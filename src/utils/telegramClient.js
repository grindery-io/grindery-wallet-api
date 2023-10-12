import "dotenv/config";
import { TelegramClient } from "telegram";

const TGClient = (session) => {
  return new TelegramClient(
    session,
    Number(process.env.TELEGRAM_API_ID),
    process.env.TELEGRAM_API_HASH,
    {
      connectionRetries: 5,
    }
  );
};

export default TGClient;
