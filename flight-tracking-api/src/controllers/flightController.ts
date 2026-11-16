import { Response } from 'express';
import pool from '../config/db';
import { sendResponse } from '../utils/response';
import { AuthenticatedRequest } from '../middleware/auth';
import { calculateFlightDuration } from '../utils/flightUtils';

/**
 * Get all flights based on user role (ATC sees all, Passenger sees booked flights)
 */
export const getAllFlights = async (req: AuthenticatedRequest, res: Response) => {
  const user = req.user;
  if (!user || !user.type) {
    return sendResponse(res, 'error', 'authentication failed. unauthorised.', null, 401);
  }

  const role = user.type;
  const userId = user.id;

  try {
    let query = '';
    let queryParams: any[] = [];

    if (role === 'ATC') {
      query = `
        SELECT 
          f.id, f.flight_number, f.departure_time, f.status, f.current_latitude, f.current_longitude, f.dispatched_at,
          origin.id as origin_id, origin.name as origin_name, origin.code as origin_iata, origin.city as origin_city, origin.country as origin_country, origin.latitude as origin_latitude, origin.longitude as origin_longitude,
          dest.id as dest_id, dest.name as dest_name, dest.code as dest_iata, dest.city as dest_city, dest.country as dest_country, dest.latitude as dest_latitude, dest.longitude as dest_longitude
        FROM flights f
        INNER JOIN airports origin ON f.origin_airport_id = origin.id
        INNER JOIN airports dest ON f.destination_airport_id = dest.id
        ORDER BY f.departure_time ASC
      `;
    } else if (role === 'PASSENGER') {
      query = `
        SELECT 
          f.id, f.flight_number, f.departure_time, f.status, f.current_latitude, f.current_longitude, f.dispatched_at,
          pf.seat_number, pf.status as booking_status, pf.booked_at,
          origin.id as origin_id, origin.name as origin_name, origin.code as origin_iata, origin.city as origin_city, origin.country as origin_country, origin.latitude as origin_latitude, origin.longitude as origin_longitude,
          dest.id as dest_id, dest.name as dest_name, dest.code as dest_iata, dest.city as dest_city, dest.country as dest_country, dest.latitude as dest_latitude, dest.longitude as dest_longitude
        FROM flights f
        INNER JOIN airports origin ON f.origin_airport_id = origin.id
        INNER JOIN airports dest ON f.destination_airport_id = dest.id
        INNER JOIN passenger_flights pf ON f.id = pf.flight_id
        WHERE pf.user_id = $1
        ORDER BY f.departure_time ASC
      `;
      queryParams = [userId];
    } else {
      return sendResponse(res, 'error', 'unauthorized role', null, 403);
    }

    const result = await pool.query(query, queryParams);
    const flights = result.rows.map((row) => {
      const duration = calculateFlightDuration(
        parseFloat(row.origin_latitude),
        parseFloat(row.origin_longitude),
        parseFloat(row.dest_latitude),
        parseFloat(row.dest_longitude)
      );

      const flight: any = {
        id: row.id,
        flight_number: row.flight_number,
        departure_time: row.departure_time,
        flight_duration_hours: duration,
        status: row.status,
        current_position: {
          latitude: row.current_latitude !== null ? parseFloat(row.current_latitude) : null,
          longitude: row.current_longitude !== null ? parseFloat(row.current_longitude) : null,
        },
        origin: {
          id: row.origin_id,
          name: row.origin_name,
          code: row.origin_iata,
          city: row.origin_city,
          country: row.origin_country,
          coordinates: { latitude: parseFloat(row.origin_latitude), longitude: parseFloat(row.origin_longitude) },
        },
        destination: {
          id: row.dest_id,
          name: row.dest_name,
          code: row.dest_iata,
          city: row.dest_city,
          country: row.dest_country,
          coordinates: { latitude: parseFloat(row.dest_latitude), longitude: parseFloat(row.dest_longitude) },
        },
      };

      if (row.dispatched_at !== null) {
        flight.dispatched_at = row.dispatched_at;
      }

      if (role === 'PASSENGER') {
        flight.booking_details = {
          seat_number: row.seat_number,
          status: row.booking_status,
          booked_at: row.booked_at,
        };
      }

      return flight;
    });

    return sendResponse(res, 'success', 'flights retrieved successfully', {
      role,
      count: flights.length,
      flights,
    });
  } catch (err: any) {
    return sendResponse(res, 'error', err.message, null, 500);
  }
};

/**
 * Get a single flight by ID (includes passengers list if requested by ATC)
 */
export const getFlight = async (req: AuthenticatedRequest, res: Response) => {
  const flightId = req.params.id;
  const user = req.user;

  if (!flightId) {
    return sendResponse(res, 'error', 'missing flight_id parameter', null, 400);
  }

  if (!user) {
    return sendResponse(res, 'error', 'authentication failed', null, 401);
  }

  const role = user.type;
  const userId = user.id;

  try {
    let query = '';
    let queryParams: any[] = [];

    if (role === 'ATC') {
      query = `
        SELECT 
          f.id, f.flight_number, f.departure_time, f.status, f.current_latitude, f.current_longitude, f.dispatched_at,
          origin.id as origin_id, origin.name as origin_name, origin.code as origin_iata, origin.city as origin_city, origin.country as origin_country, origin.latitude as origin_latitude, origin.longitude as origin_longitude,
          dest.id as dest_id, dest.name as dest_name, dest.code as dest_iata, dest.city as dest_city, dest.country as dest_country, dest.latitude as dest_latitude, dest.longitude as dest_longitude
        FROM flights f
        INNER JOIN airports origin ON f.origin_airport_id = origin.id
        INNER JOIN airports dest ON f.destination_airport_id = dest.id
        WHERE f.id = $1
      `;
      queryParams = [flightId];
    } else if (role === 'PASSENGER') {
      query = `
        SELECT 
          f.id, f.flight_number, f.departure_time, f.status, f.current_latitude, f.current_longitude, f.dispatched_at,
          pf.seat_number, pf.status as booking_status, pf.booked_at,
          origin.id as origin_id, origin.name as origin_name, origin.code as origin_iata, origin.city as origin_city, origin.country as origin_country, origin.latitude as origin_latitude, origin.longitude as origin_longitude,
          dest.id as dest_id, dest.name as dest_name, dest.code as dest_iata, dest.city as dest_city, dest.country as dest_country, dest.latitude as dest_latitude, dest.longitude as dest_longitude
        FROM flights f
        INNER JOIN airports origin ON f.origin_airport_id = origin.id
        INNER JOIN airports dest ON f.destination_airport_id = dest.id
        INNER JOIN passenger_flights pf ON f.id = pf.flight_id
        WHERE f.id = $1 AND pf.user_id = $2
      `;
      queryParams = [flightId, userId];
    } else {
      return sendResponse(res, 'error', 'unauthorized role', null, 403);
    }

    const result = await pool.query(query, queryParams);

    if (result.rows.length === 0) {
      return sendResponse(res, 'error', 'flight not found', null, 404);
    }

    const row = result.rows[0];
    const duration = calculateFlightDuration(
      parseFloat(row.origin_latitude),
      parseFloat(row.origin_longitude),
      parseFloat(row.dest_latitude),
      parseFloat(row.dest_longitude)
    );

    const flight: any = {
      id: row.id,
      flight_number: row.flight_number,
      departure_time: row.departure_time,
      flight_duration_hours: duration,
      status: row.status,
      current_position: {
        latitude: row.current_latitude !== null ? parseFloat(row.current_latitude) : null,
        longitude: row.current_longitude !== null ? parseFloat(row.current_longitude) : null,
      },
      origin: {
        id: row.origin_id,
        name: row.origin_name,
        code: row.origin_iata,
        city: row.origin_city,
        country: row.origin_country,
        coordinates: { latitude: parseFloat(row.origin_latitude), longitude: parseFloat(row.origin_longitude) },
      },
      destination: {
        id: row.dest_id,
        name: row.dest_name,
        code: row.dest_iata,
        city: row.dest_city,
        country: row.dest_country,
        coordinates: { latitude: parseFloat(row.dest_latitude), longitude: parseFloat(row.dest_longitude) },
      },
    };

    if (row.dispatched_at !== null) {
      flight.dispatched_at = row.dispatched_at;
    }

    if (role === 'PASSENGER') {
      flight.booking_details = {
        seat_number: row.seat_number,
        status: row.booking_status,
        booked_at: row.booked_at,
      };
    }

    if (role === 'ATC') {
      const passengerQuery = `
        SELECT u.id, u.username, u.email, pf.seat_number, pf.status, pf.booked_at
        FROM passenger_flights pf
        INNER JOIN users u ON pf.user_id = u.id
        WHERE pf.flight_id = $1
        ORDER BY u.username ASC
      `;
      const passengerResult = await pool.query(passengerQuery, [flightId]);
      flight.passengers = passengerResult.rows;
      flight.passenger_count = passengerResult.rows.length;
    }

    return sendResponse(res, 'success', 'flight retrieved successfully', flight);
  } catch (err: any) {
    return sendResponse(res, 'error', err.message, null, 500);
  }
};

/**
 * Dispatch a flight (ATC only)
 */
export const dispatchFlight = async (req: AuthenticatedRequest, res: Response) => {
  const { flight_id } = req.body;
  const user = req.user;

  if (!flight_id) {
    return sendResponse(res, 'error', 'missing required field: flight_id', null, 400);
  }

  if (user?.type !== 'ATC') {
    return sendResponse(res, 'error', 'user is not authorized to dispatch flights', null, 400);
  }

  try {
    const timestamp = new Date().toISOString();
    const newStatus = 'Boarding';
    const updateQuery = `
      UPDATE flights
      SET status = $1, dispatched_at = $2
      WHERE id = $3 AND status = 'Scheduled'
      RETURNING id
    `;
    const updateResult = await pool.query(updateQuery, [newStatus, timestamp, flight_id]);

    if (updateResult.rowCount === 0) {
      return sendResponse(res, 'error', 'no scheduled flight found with that id', null, 400);
    }

    return sendResponse(res, 'success', 'flight has been successfully dispatched and is now boarding');
  } catch (err: any) {
    return sendResponse(res, 'error', err.message, null, 500);
  }
};

/**
 * Update Flight Position & Status (Server/Tracker Key Authorized)
 */
export const updateFlightPosition = async (req: AuthenticatedRequest, res: Response) => {
  const { server_key, flight_id, latitude, longitude, status } = req.body;
  const expectedServerKey = process.env.SERVER_KEY;

  if (!expectedServerKey) {
    console.error('SERVER_KEY is not configured for flight position updates.');
    return sendResponse(res, 'error', 'flight position updates are not configured', null, 500);
  }

  if (typeof server_key !== 'string' || server_key !== expectedServerKey) {
    return sendResponse(res, 'error', 'unauthorized', null, 403);
  }

  if (
    (typeof flight_id !== 'number' && typeof flight_id !== 'string')
    || !String(flight_id).trim()
    || typeof latitude !== 'number'
    || !Number.isFinite(latitude)
    || latitude < -90
    || latitude > 90
    || typeof longitude !== 'number'
    || !Number.isFinite(longitude)
    || longitude < -180
    || longitude > 180
  ) {
    return sendResponse(res, 'error', 'missing required fields', null, 400);
  }

  const validStatuses = ['Scheduled', 'Boarding', 'In Flight', 'Landed'];
  if (status && !validStatuses.includes(status)) {
    return sendResponse(res, 'error', 'invalid status', null, 400);
  }

  try {
    let updateResult;
    if (status) {
      const query = `
        UPDATE flights 
        SET current_latitude = $1, current_longitude = $2, status = $3
        WHERE id = $4
        RETURNING id, current_latitude, current_longitude, status
      `;
      updateResult = await pool.query(query, [latitude, longitude, status, flight_id]);
    } else {
      const queryWithoutStatus = `
        UPDATE flights 
        SET current_latitude = $1, current_longitude = $2
        WHERE id = $3
        RETURNING id, current_latitude, current_longitude, status
      `;
      updateResult = await pool.query(queryWithoutStatus, [latitude, longitude, flight_id]);
    }

    const updatedFlight = updateResult.rows[0];
    if (!updatedFlight) {
      return sendResponse(res, 'error', 'flight not found', null, 404);
    }

    return sendResponse(res, 'success', 'flight position updated', {
      flight_id: updatedFlight.id,
      latitude: Number(updatedFlight.current_latitude),
      longitude: Number(updatedFlight.current_longitude),
      status: updatedFlight.status,
    });
  } catch (err: any) {
    return sendResponse(res, 'error', err.message, null, 500);
  }
};

/**
 * Passenger Boarding within 60 seconds of dispatch
 */
export const boardFlight = async (req: AuthenticatedRequest, res: Response) => {
  const { flight_id } = req.body;
  const user = req.user;

  if (!flight_id || !user) {
    return sendResponse(res, 'error', 'missing required fields or authentication', null, 400);
  }

  if (user.type !== 'PASSENGER') {
    return sendResponse(res, 'error', 'user is not a passenger', null, 400);
  }

  const userId = user.id;

  try {
    // Check if booked
    const bookingQuery = 'SELECT 1 FROM passenger_flights WHERE user_id = $1 AND flight_id = $2';
    const bookingResult = await pool.query(bookingQuery, [userId, flight_id]);

    if (bookingResult.rows.length === 0) {
      return sendResponse(res, 'error', 'passenger is not booked on this flight', null, 400);
    }

    // Check dispatch time
    const flightQuery = 'SELECT dispatched_at FROM flights WHERE id = $1 AND dispatched_at IS NOT NULL';
    const flightResult = await pool.query(flightQuery, [flight_id]);

    if (flightResult.rows.length === 0) {
      return sendResponse(res, 'error', 'flight has not been dispatched yet', null, 400);
    }

    const dispatchedAt = new Date(flightResult.rows[0].dispatched_at).getTime();
    const now = new Date().getTime();
    const secondsPassed = (now - dispatchedAt) / 1000;

    if (secondsPassed > 60) {
      return sendResponse(res, 'error', 'boarding window has expired (60 seconds passed)', null, 400);
    }

    const newStatus = 'BOARDED';
    const updateQuery = `
      UPDATE passenger_flights
      SET status = $1
      WHERE user_id = $2 AND flight_id = $3
    `;
    await pool.query(updateQuery, [newStatus, userId, flight_id]);

    return sendResponse(res, 'success', 'boarding confirmed successfully');
  } catch (err: any) {
    return sendResponse(res, 'error', err.message, null, 500);
  }
};