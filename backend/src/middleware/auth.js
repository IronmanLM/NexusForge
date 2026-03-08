import { findUserById, verifyAccessToken } from '../data/store.js';
import { sendError } from '../utils/errors.js';

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Missing bearer token');
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const verification = verifyAccessToken(token);
  if (!verification.valid) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Invalid or expired access token');
  }

  const user = findUserById(verification.userId);
  if (!user) {
    return sendError(res, 401, 'UNAUTHENTICATED', 'Unknown user');
  }

  req.auth = { token, user, tokenPayload: verification.payload };
  return next();
}
