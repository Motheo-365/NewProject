// Authenticates the user against the database

import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { sendResponse } from '../utils/response';

// Extend Express Request interface to attach authenticated user info
export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    type: string;
  };
}

export const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const apiKey = req.body.api_key || req.query.api_key || req.headers['authorization']?.replace('Bearer ', '');

  if (!apiKey) {
    return sendResponse(res, 'error', 'missing api key', null, 401);
  }

  try {
    const query = 'SELECT id, username, type FROM users WHERE api_key = $1';
    const result = await pool.query(query, [apiKey]);

    if (result.rows.length === 0) {
      return sendResponse(res, 'error', 'invalid api key', null, 401);
    }

    const user = result.rows[0];
    req.user = {
      ...user,
      type: typeof user.type === 'string' ? user.type.trim().toUpperCase() : user.type,
    };
    next();
  } catch (err: any) {
    return sendResponse(res, 'error', 'Authentication error: ' + err.message, null, 500);
  }
};