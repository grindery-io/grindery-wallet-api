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
