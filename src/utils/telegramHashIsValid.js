import { webcrypto } from 'crypto';

const telegramHashIsValid = async (req, res, next) => {
  if (!process.env.BOT_TOKEN) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  const authorization = req.headers['authorization'];
  const hash = authorization?.split(' ')[1];
  const data = Object.fromEntries(new URLSearchParams(hash));
  const encoder = new TextEncoder();
  const checkString = Object.keys(data)
    .filter((key) => key !== 'hash')
    .map((key) => `${key}=${data[key]}`)
    .sort()
    .join('\n');
  const secretKey = await webcrypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign']
  );
  const secret = await webcrypto.subtle.sign(
    'HMAC',
    secretKey,
    encoder.encode(process.env.BOT_TOKEN)
  );
  const signatureKey = await webcrypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign']
  );
  const signature = await webcrypto.subtle.sign(
    'HMAC',
    signatureKey,
    encoder.encode(checkString)
  );
  const hex = Buffer.from(signature).toString('hex');
  const isValid = data.hash === hex;
  if (!isValid) {
    return res.status(403).json({ error: 'User is not authenticated' });
  }
  next();
};

export default telegramHashIsValid;
