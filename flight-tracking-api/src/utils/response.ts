// A reusable response helper to handle responses

import { Response } from 'express';

export const sendResponse = (
  res: Response,
  status: 'success' | 'error',
  message?: string,
  data: any = null,
  code: number = 200
) => {
  const responsePayload: any = {
    status,
    timestamp: Date.now(),
  };

  if (message) responsePayload.message = message;
  if (data !== null) responsePayload.data = data;

  return res.status(code).json(responsePayload);
};