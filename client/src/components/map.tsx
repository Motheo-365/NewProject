import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';

import type { Airport, Flight } from '../interfaces/api';
import Loader from './Loader';
import { apiService } from '../services/apiService';
import { getAirportLocation } from '../services/locationServices';
import { getAirportRoute } from '../services/routeService';

import 'leaflet/dist/leaflet.css';
import '../styles/map.css';

interface MapProps {
  apiKey: string;
  activeFlight?: Flight | null;
}

function getBearingDegrees(
  latitude: number,
  longitude: number,
  destinationLatitude: number,
  destinationLongitude: number,
): number {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeRadians = toRadians(latitude);
  const destinationLatitudeRadians = toRadians(destinationLatitude);
  const longitudeDifference = toRadians(destinationLongitude - longitude);
  const y = Math.sin(longitudeDifference) * Math.cos(destinationLatitudeRadians);
  const x = Math.cos(latitudeRadians) * Math.sin(destinationLatitudeRadians)
    - Math.sin(latitudeRadians) * Math.cos(destinationLatitudeRadians) * Math.cos(longitudeDifference);

  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function Map({ apiKey, activeFlight }: MapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const airportLayersRef = useRef<L.LayerGroup | null>(null);
  const routeLayersRef = useRef<L.LayerGroup | null>(null);
  const aircraftLayersRef = useRef<L.LayerGroup | null>(null);
  const aircraftMarkerRef = useRef<L.Marker | null>(null);
  const positionAnimationFrameRef = useRef<number | null>(null);
  const markerFlightIdRef = useRef<number | null>(null);
  const markerProgressRef = useRef(0);
  const [airports, setAirports] = useState<Airport[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [localSelectedFlightId, setLocalSelectedFlightId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const isControlled = activeFlight !== undefined;
  const selectedFlightId = isControlled
    ? activeFlight ? String(activeFlight.id) : ''
    : localSelectedFlightId;
  const displayFlights = useMemo(() => {
    if (!activeFlight) return flights;

    const hasActiveFlight = flights.some((flight) => flight.id === activeFlight.id);
    const updatedFlights = flights.map((flight) => (
      activeFlight.id === flight.id ? { ...flight, ...activeFlight } : flight
    ));

    return hasActiveFlight ? updatedFlights : [...updatedFlights, activeFlight];
  }, [activeFlight, flights]);
  const selectedFlight = useMemo(
    () => displayFlights.find((flight) => String(flight.id) === selectedFlightId) ?? null,
    [displayFlights, selectedFlightId],
  );
  const selectedFlightIdValue = selectedFlight?.id;
  const selectedFlightNumber = selectedFlight?.flight_number;
  const selectedFlightOrigin = selectedFlight?.origin;
  const selectedFlightDestination = selectedFlight?.destination;
  const selectedFlightDuration = selectedFlight?.flight_duration_hours;
  const selectedRoute = useMemo(() => {
    if (
      selectedFlightIdValue === undefined
      || !selectedFlightNumber
      || !selectedFlightOrigin
      || !selectedFlightDestination
      || selectedFlightDuration === undefined
    ) return null;

    try {
      return {
        flightId: selectedFlightIdValue,
        flightNumber: selectedFlightNumber,
        origin: getAirportLocation(selectedFlightOrigin),
        destination: getAirportLocation(selectedFlightDestination),
        geometry: getAirportRoute(
          selectedFlightOrigin,
          selectedFlightDestination,
          selectedFlightDuration,
        ).geometry,
        durationHours: selectedFlightDuration,
        warning: '',
      };
    } catch (routeError: unknown) {
      return {
        flightId: selectedFlightIdValue,
        flightNumber: selectedFlightNumber,
        origin: null,
        destination: null,
        geometry: null,
        durationHours: selectedFlightDuration,
        warning: routeError instanceof Error
          ? `${selectedFlightNumber}: ${routeError.message}`
          : `${selectedFlightNumber}: route data is invalid.`,
      };
    }
  }, [
    selectedFlightIdValue,
    selectedFlightNumber,
    selectedFlightOrigin,
    selectedFlightDestination,
    selectedFlightDuration,
  ]);
  const trackedFlight = selectedRoute
    ? displayFlights.find((flight) => flight.id === selectedRoute.flightId)
    : null;
  const trackedPosition = useMemo(() => {
    if (!trackedFlight) return null;

    return {
      flightId: trackedFlight.id,
      latitude: trackedFlight.current_position.latitude,
      longitude: trackedFlight.current_position.longitude,
      progress: trackedFlight.progress,
    };
  }, [trackedFlight]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 2,
      minZoom: 2,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    airportLayersRef.current = L.layerGroup().addTo(map);
    routeLayersRef.current = L.layerGroup().addTo(map);
    aircraftLayersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      if (positionAnimationFrameRef.current !== null) {
        cancelAnimationFrame(positionAnimationFrameRef.current);
      }
      map.remove();
      mapRef.current = null;
      airportLayersRef.current = null;
      routeLayersRef.current = null;
      aircraftLayersRef.current = null;
      aircraftMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadMapData() {
      setIsLoading(true);
      setError('');

      try {
        const [flightResponse, airportResponse] = await Promise.all([
          apiService.getFlights(apiKey),
          apiService.getAirports(),
        ]);
        if (flightResponse.status !== 'success' || !flightResponse.data) {
          throw new Error(flightResponse.message || 'The API did not return flight route data.');
        }
        if (airportResponse.status !== 'success' || !airportResponse.data) {
          throw new Error(airportResponse.message || 'The API did not return airport data.');
        }

        if (!active) return;
        const availableFlights = flightResponse.data.flights;
        setFlights(availableFlights);
        setAirports(airportResponse.data);
        setLocalSelectedFlightId((current) => (
          availableFlights.some((flight) => String(flight.id) === current)
            ? current
            : availableFlights[0] ? String(availableFlights[0].id) : ''
        ));
      } catch (loadError: unknown) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load flight map data.');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadMapData();

    return () => {
      active = false;
    };
  }, [apiKey]);

  useEffect(() => {
    const layers = airportLayersRef.current;
    if (!layers) return;

    layers.clearLayers();
    const airportIcon = L.divIcon({
      className: 'airport-marker',
      html: '<span aria-hidden="true"></span>',
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

    airports.forEach((airport) => {
      const location = getAirportLocation(airport);
      L.marker([location.latitude, location.longitude], {
        icon: airportIcon,
        title: `${location.name} (${location.code})`,
        keyboard: true,
      })
        .bindTooltip(location.code, { direction: 'top', offset: [0, -6] })
        .addTo(layers);
    });
  }, [airports]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = routeLayersRef.current;
    if (!map || !layers) return;

    if (positionAnimationFrameRef.current !== null) {
      cancelAnimationFrame(positionAnimationFrameRef.current);
      positionAnimationFrameRef.current = null;
    }
    layers.clearLayers();
    aircraftLayersRef.current?.clearLayers();
    aircraftMarkerRef.current = null;
    markerFlightIdRef.current = selectedRoute?.flightId ?? null;
    markerProgressRef.current = 0;
    if (!selectedRoute?.geometry || !selectedRoute.origin || !selectedRoute.destination) return;

    const routeLine = L.polyline(selectedRoute.geometry, {
      color: '#176b9b',
      weight: 4,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layers);

    map.fitBounds(routeLine.getBounds(), { padding: [36, 36], maxZoom: 6 });
  }, [selectedRoute]);

  useEffect(() => {
    const layers = aircraftLayersRef.current;
    if (!layers || !selectedRoute || !trackedPosition) return;
    if (typeof trackedPosition.progress !== 'number' || !Number.isFinite(trackedPosition.progress)) return;

    const latitude = trackedPosition.latitude;
    const longitude = trackedPosition.longitude;
    if (
      typeof latitude !== 'number'
      || !Number.isFinite(latitude)
      || latitude < -90
      || latitude > 90
      || typeof longitude !== 'number'
      || !Number.isFinite(longitude)
      || longitude < -180
      || longitude > 180
    ) {
      return;
    }

    const progress = Math.min(Math.max(trackedPosition.progress, 0), 1);

    if (markerFlightIdRef.current !== trackedPosition.flightId) {
      if (positionAnimationFrameRef.current !== null) {
        cancelAnimationFrame(positionAnimationFrameRef.current);
      }
      layers.clearLayers();
      aircraftMarkerRef.current = null;
      markerFlightIdRef.current = trackedPosition.flightId;
      markerProgressRef.current = 0;
    }

    if (!aircraftMarkerRef.current) {
      const aircraftIcon = L.divIcon({
        className: 'aircraft-position-marker',
        html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z"/></svg>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      aircraftMarkerRef.current = L.marker([latitude, longitude], {
        icon: aircraftIcon,
        keyboard: true,
        title: `${selectedRoute.flightNumber} aircraft position`,
      })
        .bindTooltip(selectedRoute.flightNumber, { direction: 'top', offset: [0, -12] })
        .addTo(layers);
      markerProgressRef.current = progress;
      return;
    }

    if (positionAnimationFrameRef.current !== null) {
      cancelAnimationFrame(positionAnimationFrameRef.current);
      positionAnimationFrameRef.current = null;
    }

    const marker = aircraftMarkerRef.current;
    const start = marker.getLatLng();
    const startingProgress = markerProgressRef.current;
    const targetProgress = Math.max(startingProgress, progress);
    const duration = Math.max(
      (targetProgress - startingProgress) * selectedRoute.durationHours * 1000,
      80,
    );
    const startedAt = performance.now();

    const animatePosition = (now: number) => {
      const animationProgress = Math.min((now - startedAt) / duration, 1);
      const nextLatitude = start.lat + (latitude - start.lat) * animationProgress;
      const nextLongitude = start.lng + (longitude - start.lng) * animationProgress;
      marker.setLatLng([nextLatitude, nextLongitude]);
      markerProgressRef.current = startingProgress
        + (targetProgress - startingProgress) * animationProgress;

      if (
        selectedRoute.destination
        && marker.getElement()
      ) {
        const bearing = getBearingDegrees(
          nextLatitude,
          nextLongitude,
          selectedRoute.destination.latitude,
          selectedRoute.destination.longitude,
        );
        const planeIcon = marker.getElement()?.querySelector('svg');
        if (planeIcon) planeIcon.style.transform = `rotate(${bearing}deg)`;
      }

      if (animationProgress < 1) {
        positionAnimationFrameRef.current = requestAnimationFrame(animatePosition);
      } else {
        positionAnimationFrameRef.current = null;
      }
    };

    positionAnimationFrameRef.current = requestAnimationFrame(animatePosition);
  }, [
    trackedPosition,
    selectedRoute,
  ]);

  const progressPercent = typeof selectedFlight?.progress === 'number'
    ? Math.round(Math.min(Math.max(selectedFlight.progress, 0), 1) * 100)
    : null;

  return (
    <section className="flight-map-section" aria-label="Flight routes">
      <div className="flight-map-heading">
        <div>
          <h2>{activeFlight ? 'Current flight' : 'Flight routes'}</h2>
          <p>
            {activeFlight
              ? 'Showing the route selected in your flight list.'
              : 'Airport locations and routes from live flight data.'}
          </p>
        </div>
      </div>

      {selectedFlight && (
        <p className="flight-map-summary">
          <strong>{selectedFlight.flight_number}</strong>
          {' · '}
          {selectedFlight.origin.name} ({selectedFlight.origin.code})
          {' → '}
          {selectedFlight.destination.name} ({selectedFlight.destination.code})
          {' · '}
          {selectedFlight.status}
          {progressPercent !== null && <> · {progressPercent}% complete</>}
        </p>
      )}
      {!isLoading && !error && selectedRoute?.warning && (
        <div className="flight-map-warnings" role="status" aria-label="Flights with invalid route data">
          <p>{selectedRoute.warning}</p>
        </div>
      )}
      <div className="flight-map-stage">
        <div className="flight-map-canvas" ref={mapContainerRef} />
        {isLoading && <div className="flight-map-status"><Loader message="Loading airports and flights…" /></div>}
        {error && <p className="flight-map-status flight-map-error" role="alert">{error}</p>}
        {!isLoading && !error && airports.length === 0 && (
          <p className="flight-map-status flight-map-empty">No airport locations are available.</p>
        )}
      </div>
      {!isLoading && !error && (
        <div className="flight-map-legend" aria-label="Map legend">
          <span><i className="legend-airport" /> Airports</span>
          <span><i className="legend-current" /> Aircraft</span>
          {progressPercent !== null && <span className="flight-map-progress">{progressPercent}% complete</span>}
        </div>
      )}
    </section>
  );
}

export default Map;
