import type { Request, Response } from 'express';
import pool from '../config/db';
import { sendResponse } from '../utils/response';
import bcrypt from 'bcrypt';
import type { AuthenticatedRequest } from '../middleware/auth';

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: unknown; password?: unknown };

  if (typeof email !== 'string' || !email.trim()) {
    return sendResponse(res, 'error', 'Email address is required.', null, 400);
  }

  if (typeof password !== 'string' || !password) {
    return sendResponse(res, 'error', 'Password is required.', null, 400);
  }

  const normalizedEmail = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return sendResponse(res, 'error', 'Enter a valid email address.', null, 400);
  }

  try {
    const query = 'SELECT id, username, type, api_key, password FROM users WHERE LOWER(email) = LOWER($1)';
    const result = await pool.query(query, [normalizedEmail]);

    if (result.rows.length === 0) {
      return sendResponse(res, 'error', 'No account is registered with this email address.', null, 401);
    }

    const user = result.rows[0];

    const passwordMatch = password === user.password
      || (typeof user.password === 'string' && await bcrypt.compare(password, user.password));

    if (!passwordMatch) {
      return sendResponse(res, 'error', 'The password is incorrect.', null, 401);
    }

    return sendResponse(res, 'success', 'Login successful', {
      username: user.username,
      type: user.type,
      api_key: user.api_key,
    });
  } catch (err: unknown) {
    console.error('Login verification failed:', err);
    return sendResponse(res, 'error', 'Unable to verify your login right now. Please try again later.', null, 500);
  }
};

export const getMe = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  return sendResponse(res, 'success', 'user', {
    id: user?.id,
    username: user?.username,
    type: user?.type,
  });
};