import { Router } from 'express';
import {
  createAuthTokensForUser,
  createUserWithPassword,
  findUserByEmail,
  publicUser,
  revokeAccessToken,
  revokeRefreshToken,
  rotateRefreshToken,
  verifyUserPassword
} from '../data/store.js';
import { requireAuth } from '../middleware/auth.js';
import { sendError } from '../utils/errors.js';

const router = Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return sendError(res, 400, 'INVALID_AUTH_PAYLOAD', 'email and password are required');
  }

  const user = findUserByEmail(email);
  if (!user || !verifyUserPassword(email, password)) {
    return sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid credentials');
  }
  const tokens = createAuthTokensForUser(user.id);
  if (!tokens) {
    return sendError(res, 500, 'AUTH_TOKEN_ISSUE_FAILED', 'Unable to issue tokens');
  }
  const { token, refreshToken } = tokens;

  return res.json({ token, refreshToken, user: publicUser(user) });
});

router.post('/register', (req, res) => {
  const { email, password, displayName } = req.body ?? {};
  if (!email || !password) {
    return sendError(res, 400, 'INVALID_AUTH_PAYLOAD', 'email and password are required');
  }

  if (findUserByEmail(email)) {
    return sendError(res, 409, 'EMAIL_ALREADY_REGISTERED', 'Email already registered');
  }

  const user = createUserWithPassword({ email, password, displayName });
  const tokens = createAuthTokensForUser(user.id);
  if (!tokens) {
    return sendError(res, 500, 'AUTH_TOKEN_ISSUE_FAILED', 'Unable to issue tokens');
  }
  const { token, refreshToken } = tokens;
  return res.status(201).json({ token, refreshToken, user: publicUser(user) });
});

router.post('/refresh', (req, res) => {
  const refreshToken = req.body?.refreshToken?.toString();
  if (!refreshToken) {
    return sendError(res, 400, 'INVALID_AUTH_PAYLOAD', 'refreshToken is required');
  }

  const tokens = rotateRefreshToken(refreshToken);
  if (!tokens) {
    return sendError(res, 401, 'REFRESH_TOKEN_REVOKED', 'Invalid refresh token');
  }
  return res.json(tokens);
});

router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: publicUser(req.auth.user) });
});

router.get('/introspect', requireAuth, (req, res) => {
  return res.json({
    valid: true,
    user: {
      id: req.auth.user.id,
      email: req.auth.user.email,
      displayName: req.auth.user.displayName
    },
    token: {
      exp: req.auth.tokenPayload?.exp,
      iat: req.auth.tokenPayload?.iat
    }
  });
});

router.post('/logout', requireAuth, (req, res) => {
  revokeAccessToken(req.auth.token);
  const refreshToken = req.body?.refreshToken?.toString();
  if (refreshToken) {
    revokeRefreshToken(refreshToken);
  }
  return res.status(204).send();
});

export default router;
