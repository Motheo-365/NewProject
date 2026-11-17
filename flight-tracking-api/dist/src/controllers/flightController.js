"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.boardFlight = exports.updateFlightPosition = exports.dispatchFlight = exports.getFlight = exports.getAllFlights = void 0;
const db_1 = __importDefault(require("../config/db"));
const response_1 = require("../utils/response");
const flightUtils_1 = require("../utils/flightUtils");
/**
 * Get all flights based on user role (ATC sees all, Passenger sees booked flights)
 */
const getAllFlights = async (req, res) => {
    const user = req.user;
    if (!user || !user.type) {
        return (0, response_1.sendResponse)(res, 'error', 'authentication failed. unauthorised.', null, 401);
    }
    const role = user.type;
    const userId = user.id;
    try {
        let query = '';
        let queryParams = [];
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
        }
        else if (role === 'PASSENGER') {
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
        }
        else {
            return (0, response_1.sendResponse)(res, 'error', 'unauthorized role', null, 403);
        }
        const result = await db_1.default.query(query, queryParams);
        const flights = result.rows.map((row) => {
            const duration = (0, flightUtils_1.calculateFlightDuration)(parseFloat(row.origin_latitude), parseFloat(row.origin_longitude), parseFloat(row.dest_latitude), parseFloat(row.dest_longitude));
            const flight = {
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
        return (0, response_1.sendResponse)(res, 'success', 'flights retrieved successfully', {
            role,
            count: flights.length,
            flights,
        });
    }
    catch (err) {
        return (0, response_1.sendResponse)(res, 'error', err.message, null, 500);
    }
};
exports.getAllFlights = getAllFlights;
/**
 * Get a single flight by ID (includes passengers list if requested by ATC)
 */
const getFlight = async (req, res) => {
    const flightId = req.params.id;
    const user = req.user;
    if (!flightId) {
        return (0, response_1.sendResponse)(res, 'error', 'missing flight_id parameter', null, 400);
    }
    if (!user) {
        return (0, response_1.sendResponse)(res, 'error', 'authentication failed', null, 401);
    }
    const role = user.type;
    const userId = user.id;
    try {
        let query = '';
        let queryParams = [];
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
        }
        else if (role === 'PASSENGER') {
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
        }
        else {
            return (0, response_1.sendResponse)(res, 'error', 'unauthorized role', null, 403);
        }
        const result = await db_1.default.query(query, queryParams);
        if (result.rows.length === 0) {
            return (0, response_1.sendResponse)(res, 'error', 'flight not found', null, 404);
        }
        const row = result.rows[0];
        const duration = (0, flightUtils_1.calculateFlightDuration)(parseFloat(row.origin_latitude), parseFloat(row.origin_longitude), parseFloat(row.dest_latitude), parseFloat(row.dest_longitude));
        const flight = {
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
            const passengerResult = await db_1.default.query(passengerQuery, [flightId]);
            flight.passengers = passengerResult.rows;
            flight.passenger_count = passengerResult.rows.length;
        }
        return (0, response_1.sendResponse)(res, 'success', 'flight retrieved successfully', flight);
    }
    catch (err) {
        return (0, response_1.sendResponse)(res, 'error', err.message, null, 500);
    }
};
exports.getFlight = getFlight;
/**
 * Dispatch a flight (ATC only)
 */
const dispatchFlight = async (req, res) => {
    const { flight_id } = req.body;
    const user = req.user;
    if (!flight_id) {
        return (0, response_1.sendResponse)(res, 'error', 'missing required field: flight_id', null, 400);
    }
    if (user?.type !== 'ATC') {
        return (0, response_1.sendResponse)(res, 'error', 'user is not authorized to dispatch flights', null, 400);
    }
    let client = null;
    let transactionOpen = false;
    try {
        client = await db_1.default.connect();
        await client.query('BEGIN');
        transactionOpen = true;
        const timestamp = new Date().toISOString();
        const newStatus = 'Boarding';
        const updateQuery = `
      UPDATE flights
      SET status = $1, dispatched_at = $2
      WHERE id = $3 AND status = 'Scheduled'
      RETURNING id, dispatched_at
    `;
        const updateResult = await client.query(updateQuery, [newStatus, timestamp, flight_id]);
        if (updateResult.rowCount === 0) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return (0, response_1.sendResponse)(res, 'error', 'no scheduled flight found with that id', null, 400);
        }
        const passengerResult = await client.query(`SELECT u.username
       FROM passenger_flights pf
       INNER JOIN users u ON u.id = pf.user_id
       WHERE pf.flight_id = $1
         AND COALESCE(UPPER(pf.status::text), '') NOT IN ('CANCELLED', 'NO_SHOW')
       ORDER BY u.username ASC`, [flight_id]);
        await client.query('COMMIT');
        transactionOpen = false;
        return (0, response_1.sendResponse)(res, 'success', 'flight has been successfully dispatched and is now boarding', {
            flight_id: updateResult.rows[0].id,
            dispatched_at: updateResult.rows[0].dispatched_at,
            passengers: passengerResult.rows,
        });
    }
    catch (err) {
        if (client && transactionOpen) {
            try {
                await client.query('ROLLBACK');
            }
            catch (rollbackError) {
                console.error('Unable to roll back flight dispatch transaction:', rollbackError);
            }
        }
        return (0, response_1.sendResponse)(res, 'error', err.message, null, 500);
    }
    finally {
        client?.release();
    }
};
exports.dispatchFlight = dispatchFlight;
/**
 * Update Flight Position & Status (ATC API key authorized)
 */
const updateFlightPosition = async (req, res) => {
    const { flight_id, latitude, longitude, status } = req.body;
    if (req.user?.type !== 'ATC') {
        return (0, response_1.sendResponse)(res, 'error', 'only ATC users can update flight positions', null, 403);
    }
    if ((typeof flight_id !== 'number' && typeof flight_id !== 'string')
        || !String(flight_id).trim()
        || typeof latitude !== 'number'
        || !Number.isFinite(latitude)
        || latitude < -90
        || latitude > 90
        || typeof longitude !== 'number'
        || !Number.isFinite(longitude)
        || longitude < -180
        || longitude > 180) {
        return (0, response_1.sendResponse)(res, 'error', 'missing required fields', null, 400);
    }
    if (status !== undefined && status !== 'In Flight' && status !== 'Landed') {
        return (0, response_1.sendResponse)(res, 'error', 'invalid status', null, 400);
    }
    let client = null;
    let transactionOpen = false;
    try {
        client = await db_1.default.connect();
        await client.query('BEGIN');
        transactionOpen = true;
        const flightResult = await client.query(`SELECT f.status, f.dispatched_at, destination.latitude AS destination_latitude,
        destination.longitude AS destination_longitude
       FROM flights f
       INNER JOIN airports destination ON f.destination_airport_id = destination.id
       WHERE f.id = $1
       FOR UPDATE OF f`, [flight_id]);
        if (flightResult.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return (0, response_1.sendResponse)(res, 'error', 'flight not found', null, 404);
        }
        const flight = flightResult.rows[0];
        let transitionToInFlight = false;
        if (status === 'In Flight') {
            if (flight.status === 'Boarding') {
                const dispatchedAt = flight.dispatched_at
                    ? new Date(flight.dispatched_at).getTime()
                    : Number.NaN;
                if (!Number.isFinite(dispatchedAt) || Date.now() - dispatchedAt < 60_000) {
                    await client.query('ROLLBACK');
                    transactionOpen = false;
                    return (0, response_1.sendResponse)(res, 'error', 'boarding window has not expired', null, 400);
                }
                transitionToInFlight = true;
            }
            else if (flight.status !== 'In Flight') {
                await client.query('ROLLBACK');
                transactionOpen = false;
                return (0, response_1.sendResponse)(res, 'error', 'flight cannot transition to In Flight from its current status', null, 400);
            }
        }
        else if (status === 'Landed') {
            if (flight.status !== 'In Flight') {
                await client.query('ROLLBACK');
                transactionOpen = false;
                return (0, response_1.sendResponse)(res, 'error', 'flight must be In Flight before it can land', null, 400);
            }
            const destinationLatitude = Number(flight.destination_latitude);
            const destinationLongitude = Number(flight.destination_longitude);
            if (Math.abs(latitude - destinationLatitude) > 0.000001
                || Math.abs(longitude - destinationLongitude) > 0.000001) {
                await client.query('ROLLBACK');
                transactionOpen = false;
                return (0, response_1.sendResponse)(res, 'error', 'landed position must match the destination airport', null, 400);
            }
        }
        else if (flight.status !== 'In Flight') {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return (0, response_1.sendResponse)(res, 'error', 'positions can only be updated while the flight is In Flight', null, 400);
        }
        const updateResult = status
            ? await client.query(`UPDATE flights
           SET current_latitude = $1, current_longitude = $2, status = $3
           WHERE id = $4
           RETURNING id, current_latitude, current_longitude, status`, [latitude, longitude, status, flight_id])
            : await client.query(`UPDATE flights
           SET current_latitude = $1, current_longitude = $2
           WHERE id = $3
           RETURNING id, current_latitude, current_longitude, status`, [latitude, longitude, flight_id]);
        let noShowCount = 0;
        if (transitionToInFlight) {
            const noShowResult = await client.query(`UPDATE passenger_flights
         SET status = 'NO_SHOW'
         WHERE flight_id = $1
           AND COALESCE(UPPER(status::text), '') NOT IN ('BOARDED', 'CANCELLED', 'NO_SHOW')`, [flight_id]);
            noShowCount = noShowResult.rowCount ?? 0;
        }
        await client.query('COMMIT');
        transactionOpen = false;
        const updatedFlight = updateResult.rows[0];
        return (0, response_1.sendResponse)(res, 'success', 'flight position updated', {
            flight_id: updatedFlight.id,
            latitude: Number(updatedFlight.current_latitude),
            longitude: Number(updatedFlight.current_longitude),
            status: updatedFlight.status,
            no_show_count: noShowCount,
        });
    }
    catch (err) {
        if (client && transactionOpen) {
            try {
                await client.query('ROLLBACK');
            }
            catch (rollbackError) {
                console.error('Unable to roll back flight position transaction:', rollbackError);
            }
        }
        return (0, response_1.sendResponse)(res, 'error', err.message, null, 500);
    }
    finally {
        client?.release();
    }
};
exports.updateFlightPosition = updateFlightPosition;
/**
 * Passenger Boarding within 60 seconds of dispatch
 */
const boardFlight = async (req, res) => {
    const { flight_id } = req.body;
    const user = req.user;
    if (!flight_id || !user) {
        return (0, response_1.sendResponse)(res, 'error', 'missing required fields or authentication', null, 400);
    }
    if (user.type !== 'PASSENGER') {
        return (0, response_1.sendResponse)(res, 'error', 'user is not a passenger', null, 400);
    }
    let client = null;
    let transactionOpen = false;
    try {
        client = await db_1.default.connect();
        await client.query('BEGIN');
        transactionOpen = true;
        const flightResult = await client.query('SELECT status, dispatched_at FROM flights WHERE id = $1 FOR UPDATE', [flight_id]);
        const bookingResult = await client.query(`SELECT status AS booking_status
       FROM passenger_flights
       WHERE flight_id = $1 AND user_id = $2
       FOR UPDATE`, [flight_id, user.id]);
        if (flightResult.rows.length === 0 || bookingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return (0, response_1.sendResponse)(res, 'error', 'passenger is not booked on this flight', null, 400);
        }
        const booking = bookingResult.rows[0];
        const flight = flightResult.rows[0];
        if (String(booking.booking_status).toUpperCase() === 'BOARDED') {
            await client.query('COMMIT');
            transactionOpen = false;
            return (0, response_1.sendResponse)(res, 'success', 'boarding was already confirmed');
        }
        const dispatchedAt = flight.dispatched_at
            ? new Date(flight.dispatched_at).getTime()
            : Number.NaN;
        if (flight.status !== 'Boarding'
            || !Number.isFinite(dispatchedAt)
            || Date.now() - dispatchedAt >= 60_000) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return (0, response_1.sendResponse)(res, 'error', 'boarding window has expired or is not open', null, 400);
        }
        if (['CANCELLED', 'NO_SHOW'].includes(String(booking.booking_status).toUpperCase())) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return (0, response_1.sendResponse)(res, 'error', 'this booking is no longer eligible for boarding', null, 400);
        }
        await client.query(`UPDATE passenger_flights
       SET status = 'BOARDED'
       WHERE user_id = $1 AND flight_id = $2`, [user.id, flight_id]);
        await client.query('COMMIT');
        transactionOpen = false;
        return (0, response_1.sendResponse)(res, 'success', 'boarding confirmed successfully');
    }
    catch (err) {
        if (client && transactionOpen) {
            try {
                await client.query('ROLLBACK');
            }
            catch (rollbackError) {
                console.error('Unable to roll back passenger boarding transaction:', rollbackError);
            }
        }
        return (0, response_1.sendResponse)(res, 'error', err.message, null, 500);
    }
    finally {
        client?.release();
    }
};
exports.boardFlight = boardFlight;
