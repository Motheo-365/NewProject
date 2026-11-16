import type { Airport, Coordinates, Flight } from '../interfaces/api';

export interface FlightLocation {
  id: number;
  name: string;
  code: string;
  city: string;
  latitude: number;
  longitude: number;
}

function isValidCoordinates(
  coordinates: Coordinates,
): coordinates is { latitude: number; longitude: number } {
  return typeof coordinates.latitude === 'number'
    && Number.isFinite(coordinates.latitude)
    && coordinates.latitude >= -90
    && coordinates.latitude <= 90
    && typeof coordinates.longitude === 'number'
    && Number.isFinite(coordinates.longitude)
    && coordinates.longitude >= -180
    && coordinates.longitude <= 180;
}

export function getAirportLocation(airport: Airport): FlightLocation {
  if (!isValidCoordinates(airport.coordinates)) {
    throw new Error(`Airport ${airport.code} is missing valid coordinates.`);
  }

  return {
    id: airport.id,
    name: airport.name,
    code: airport.code,
    city: airport.city,
    latitude: airport.coordinates.latitude,
    longitude: airport.coordinates.longitude,
  };
}

export interface FlightLocations {
  origin: FlightLocation;
  destination: FlightLocation;
  current: { latitude: number; longitude: number } | null;
}

export function getFlightLocations(flight: Flight): FlightLocations {
  const { origin, destination, current_position: current } = flight;

  if (!origin || !destination) {
    throw new Error(`Flight ${flight.flight_number} is missing airport route data.`);
  }

  return {
    origin: getAirportLocation(origin),
    destination: getAirportLocation(destination),
    current: current && isValidCoordinates(current) ? current : null,
  };
}
