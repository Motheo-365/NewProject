import type { Airport, Flight } from '../interfaces/api';
import { getAirportLocation } from './locationServices';

export interface RouteResult {
  distanceKm: number;
  durationHours: number;
  geometry: [number, number][];
}

const EARTH_RADIUS_KM = 6371.0088;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function calculateDistance(
  startLatitude: number,
  startLongitude: number,
  endLatitude: number,
  endLongitude: number,
): number {
  const latitudeDifference = toRadians(endLatitude - startLatitude);
  const longitudeDifference = toRadians(endLongitude - startLongitude);
  const startLatitudeRadians = toRadians(startLatitude);
  const endLatitudeRadians = toRadians(endLatitude);

  const a = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(startLatitudeRadians)
    * Math.cos(endLatitudeRadians)
    * Math.sin(longitudeDifference / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function createGreatCircleGeometry(
  startLatitude: number,
  startLongitude: number,
  endLatitude: number,
  endLongitude: number,
  segments = 48,
): [number, number][] {
  const startLat = toRadians(startLatitude);
  const startLon = toRadians(startLongitude);
  const endLat = toRadians(endLatitude);
  const endLon = toRadians(endLongitude);

  const start = [
    Math.cos(startLat) * Math.cos(startLon),
    Math.cos(startLat) * Math.sin(startLon),
    Math.sin(startLat),
  ];
  const end = [
    Math.cos(endLat) * Math.cos(endLon),
    Math.cos(endLat) * Math.sin(endLon),
    Math.sin(endLat),
  ];

  const dot = Math.max(-1, Math.min(1, start[0] * end[0] + start[1] * end[1] + start[2] * end[2]));
  const angle = Math.acos(dot);
  if (angle < 1e-10) return [[startLatitude, startLongitude]];

  const sinAngle = Math.sin(angle);
  return Array.from({ length: segments + 1 }, (_, index) => {
    const fraction = index / segments;
    const startWeight = Math.sin((1 - fraction) * angle) / sinAngle;
    const endWeight = Math.sin(fraction * angle) / sinAngle;
    const x = startWeight * start[0] + endWeight * end[0];
    const y = startWeight * start[1] + endWeight * end[1];
    const z = startWeight * start[2] + endWeight * end[2];

    return [
      toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))),
      toDegrees(Math.atan2(y, x)),
    ];
  });
}

export function getFlightRoute(flight: Flight): RouteResult {
  return getAirportRoute(flight.origin, flight.destination, flight.flight_duration_hours);
}

export function getAirportRoute(
  originAirport: Airport,
  destinationAirport: Airport,
  durationHours: number,
): RouteResult {
  const origin = getAirportLocation(originAirport);
  const destination = getAirportLocation(destinationAirport);
  const distanceKm = calculateDistance(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude,
  );
  const validDurationHours = Number.isFinite(durationHours) && durationHours > 0
    ? durationHours
    : 0;

  return {
    distanceKm,
    durationHours: validDurationHours,
    geometry: createGreatCircleGeometry(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude,
    ),
  };
}
