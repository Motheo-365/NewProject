import { Request, Response } from 'express';
import pool from '../config/db';
import { sendResponse } from '../utils/response';

export const getAirports = async (req: Request, res: Response) => {
  try {
    const query = 'SELECT id, name, code, city, country, latitude, longitude FROM airports';
    const result = await pool.query(query);

    if (result.rows.length === 0) {
      return sendResponse(res, 'error', 'no airports found', null, 400);
    }

    const airports = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      city: row.city,
      country: row.country,
      coordinates: {
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
      },
    }));

    return sendResponse(res, 'success', 'airports retrieved successfully', airports);
  } catch (err: any) {
    return sendResponse(res, 'error', err.message, null, 500);
  }
};