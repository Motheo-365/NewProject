import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import pool from '../config/db';
import { sendResponse } from '../utils/response';
import bcrypt from 'bcrypt';
import type { AuthenticatedRequest } from '../middleware/auth';

async function getOrCreateAccountApiKey(userId: number): Promise<string> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT api_key FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    const storedKey: unknown = result.rows[0]?.api_key;
    let apiKey = typeof storedKey === 'string' ? storedKey.trim() : '';

    if (!/^[a-f\d]{64}$/i.test(apiKey)) {
      apiKey = '';
    } else {
      const duplicate = await client.query(
        'SELECT 1 FROM users WHERE api_key = $1 AND id <> $2 LIMIT 1',
        [apiKey, userId],
      );
      if (duplicate.rows.length > 0) apiKey = '';
    }

    if (!apiKey) {
      apiKey = randomBytes(32).toString('hex');
      const update = await client.query(
        'UPDATE users SET api_key = $1 WHERE id = $2 RETURNING api_key',
        [apiKey, userId],
      );
      if (typeof update.rows[0]?.api_key !== 'string') {
        throw new Error('Unable to save the account API key.');
      }
    }

    await client.query('COMMIT');
    return apiKey;
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

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

    const apiKey = await getOrCreateAccountApiKey(user.id);

    return sendResponse(res, 'success', 'Login successful', {
      username: user.username,
      type: user.type,
      api_key: apiKey,
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