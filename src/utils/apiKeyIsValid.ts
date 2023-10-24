export const apiKeyIsValid = (req: any, res: any, next: any) => {
  const apiKey = req.headers['authorization'];
  if (!apiKey) {
    return res.status(401).send({
      msg: 'Missing API key in headers',
    });
  }
  if (apiKey !== `Bearer ${process.env.API_KEY}`) {
    return res.status(401).send({
      msg: 'Invalid API key',
    });
  }
  next();
};
