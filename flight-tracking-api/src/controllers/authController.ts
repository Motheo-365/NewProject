import { Request, Response } from 'express';
import pool from '../config/db';
import { sendResponse } from '../utils/response';
import bcrypt from 'bcrypt';
import { AuthenticatedRequest } from '../middleware/auth';

export const login = async (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return sendResponse(res, 'error', 'Missing username or password', null, 400);
  }

  try {
    const query = 'SELECT id, username, type, api_key, password FROM users WHERE username = $1';
    const result = await pool.query(query, [username]);

    if (result.rows.length === 0) {
      return sendResponse(res, 'error', 'Invalid username or password', null, 401);
    }

    const user = result.rows[0];

    // Check plaintext or hashed password
    const passwordMatch = password === user.password || (await bcrypt.compare(password, user.password));

    if (!passwordMatch) {
      return sendResponse(res, 'error', 'Invalid username or password', null, 401);
    }

    return sendResponse(res, 'success', 'Login successful', {
      username: user.username,
      type: user.type,
      api_key: user.api_key,
    });
  } catch (err: any) {
    return sendResponse(res, 'error', err.message, null, 500);
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