import crypto from 'crypto';

export const encrypt = (text, algo = 'aes-256-cbc', format = 'base64') => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    algo,
    Buffer.from(process.env.TELEGRAM_API_HASH),
    iv
  );
  let encrypted = cipher.update(text, 'utf-8', format);
  encrypted += cipher.final(format);
  const ivString = iv.toString(format);
  return `${ivString}.${encrypted}`;
};

export const decrypt = (text, algo = 'aes-256-cbc', format = 'base64') => {
  const textParts = text.split('.');
  if (textParts.length !== 2) {
    throw new Error('Invalid encrypted text format');
  }
  const iv = Buffer.from(textParts[0], format);
  const encryptedText = textParts[1];
  const decipher = crypto.createDecipheriv(
    algo,
    Buffer.from(process.env.TELEGRAM_API_HASH),
    iv
  );
  let decrypted = decipher.update(encryptedText, format, 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
};
