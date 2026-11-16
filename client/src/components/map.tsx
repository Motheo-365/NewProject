import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';

import type { Flight } from '../interfaces/api';
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
  const flightLayersRef = useRef<L.LayerGroup | null>(null);
  const currentPositionMarkerRef = useRef<L.Marker | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [localSelectedFlightId, setLocalSelectedFlightId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const isControlled = activeFlight !== undefined;
  const selectedFlightId = isControlled
    ? activeFlight ? String(activeFlight.id) : ''
    : localSelectedFlightId;
  const displayFlights = useMemo(
    () => {
      if (!activeFlight) return flights;

      const hasActiveFlight = flights.some((flight) => flight.id === activeFlight.id);
      const updatedFlights = flights.map((flight) => (
        activeFlight.id === flight.id ? { ...flight, ...activeFlight } : flight
      ));

      return hasActiveFlight ? updatedFlights : [...updatedFlights, activeFlight];
    },
    [activeFlight, flights],
  );
  const selectedFlight = useMemo(
    () => displayFlights.find((flight) => String(flight.id) === selectedFlightId) ?? null,
    [displayFlights, selectedFlightId],
  );
  const selectedFlightNumber = selectedFlight?.flight_number;
  const selectedFlightOrigin = selectedFlight?.origin;
  const selectedFlightDestination = selectedFlight?.destination;
  const selectedFlightDuration = selectedFlight?.flight_duration_hours;
  const currentLatitude = selectedFlight?.current_position.latitude;
  const currentLongitude = selectedFlight?.current_position.longitude;
  const selectedRoute = useMemo(() => {
    if (
      !selectedFlightId
      || !selectedFlightNumber
      || !selectedFlightOrigin
      || !selectedFlightDestination
      || selectedFlightDuration === undefined
    ) {
      return null;
    }

    try {
      return {
        flightId: selectedFlightId,
        flightNumber: selectedFlightNumber,
        origin: getAirportLocation(selectedFlightOrigin),
        destination: getAirportLocation(selectedFlightDestination),
        geometry: getAirportRoute(
          selectedFlightOrigin,
          selectedFlightDestination,
          selectedFlightDuration,
        ).geometry,
        warning: '',
      };
    } catch (routeError: unknown) {
      return {
        flightId: selectedFlightId,
        flightNumber: selectedFlightNumber,
        origin: null,
        destination: null,
        geometry: null,
        warning: routeError instanceof Error
          ? `${selectedFlightNumber}: ${routeError.message}`
          : `${selectedFlightNumber}: route data is invalid.`,
      };
    }
  }, [
    selectedFlightId,
    selectedFlightNumber,
    selectedFlightOrigin,
    selectedFlightDestination,
    selectedFlightDuration,
  ]);
  const destinationLatitude = selectedRoute?.destination?.latitude;
  const destinationLongitude = selectedRoute?.destination?.longitude;

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [0, 0],
      zoom: 2,
      scrollWheelZoom: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    flightLayersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      flightLayersRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadFlights() {
      setIsLoading(true);
      setError('');

      try {
        const response = await apiService.getFlights(apiKey);
        if (response.status !== 'success' || !response.data) {
          throw new Error(response.message || 'The API did not return flight route data.');
        }

        if (!active) return;

        const availableFlights = response.data.flights;
        setFlights(availableFlights);
        setLocalSelectedFlightId((current) => (
          availableFlights.some((flight) => String(flight.id) === current)
            ? current
            : availableFlights[0] ? String(availableFlights[0].id) : ''
        ));
      } catch (loadError: unknown) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load flight routes.',
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadFlights();

    return () => {
      active = false;
    };
  }, [apiKey]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = flightLayersRef.current;
    if (!map || !layers) return;

    layers.clearLayers();
    currentPositionMarkerRef.current = null;
    if (!selectedRoute?.geometry || !selectedRoute.origin || !selectedRoute.destination) return;

    const routeLine = L.polyline(selectedRoute.geometry, {
      color: '#176b9b',
      weight: 4,
      opacity: 0.85,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(layers);

    L.circleMarker([selectedRoute.origin.latitude, selectedRoute.origin.longitude], {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: '#176b9b',
      fillOpacity: 1,
    })
      .bindPopup(`<strong>Origin: ${selectedRoute.origin.code}</strong><br>${selectedRoute.origin.name}`)
      .addTo(layers);

    L.circleMarker([selectedRoute.destination.latitude, selectedRoute.destination.longitude], {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: '#db8b35',
      fillOpacity: 1,
    })
      .bindPopup(`<strong>Destination: ${selectedRoute.destination.code}</strong><br>${selectedRoute.destination.name}`)
      .addTo(layers);

    map.fitBounds(routeLine.getBounds(), { padding: [36, 36], maxZoom: 6 });
  }, [selectedRoute]);

  useEffect(() => {
    const layers = flightLayersRef.current;
    if (!layers || !selectedRoute?.geometry) return;

    if (
      typeof currentLatitude !== 'number'
      || !Number.isFinite(currentLatitude)
      || currentLatitude < -90
      || currentLatitude > 90
      || typeof currentLongitude !== 'number'
      || !Number.isFinite(currentLongitude)
      || currentLongitude < -180
      || currentLongitude > 180
    ) {
      return;
    }

    if (!currentPositionMarkerRef.current) {
      const aircraftIcon = L.divIcon({
        className: 'aircraft-position-marker',
        html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z"/></svg>',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      currentPositionMarkerRef.current = L.marker(
        [currentLatitude, currentLongitude],
        { icon: aircraftIcon, keyboard: true, title: `${selectedRoute.flightNumber} current position` },
      )
        .bindPopup(`<strong>${selectedRoute.flightNumber}</strong><br>Current aircraft position`)
        .addTo(layers);
    } else {
      currentPositionMarkerRef.current.setLatLng([currentLatitude, currentLongitude]);
    }

    if (
      typeof destinationLatitude !== 'number'
      || typeof destinationLongitude !== 'number'
    ) {
      return;
    }

    const bearing = getBearingDegrees(
      currentLatitude,
      currentLongitude,
      destinationLatitude,
      destinationLongitude,
    );
    const planeIcon = currentPositionMarkerRef.current.getElement()?.querySelector('svg');
    if (planeIcon) {
      planeIcon.style.transform = `rotate(${bearing}deg)`;
    }
  }, [
    currentLatitude,
    currentLongitude,
    destinationLatitude,
    destinationLongitude,
    selectedRoute?.flightId,
    selectedRoute?.flightNumber,
    selectedRoute?.geometry,
  ]);

  return (
    <section className="flight-map-section" aria-label="Flight routes">
      <div className="flight-map-heading">
        <div>
          <h2>{activeFlight ? 'Current flight' : 'Flight routes'}</h2>
          <p>
            {activeFlight
              ? 'Showing the route selected in the ATC flight list.'
              : 'Routes and airport locations from your flight data.'}
          </p>
        </div>
      </div>

      {!isLoading && !error && flights.length > 0 && selectedFlight && (
        <p className="flight-map-summary">
          <strong>{selectedFlight.flight_number}</strong>
          {' · '}
          {selectedFlight.origin.name} ({selectedFlight.origin.code})
          {' → '}
          {selectedFlight.destination.name} ({selectedFlight.destination.code})
          {' · '}
          {selectedFlight.flight_duration_hours.toFixed(1)} hours
        </p>
      )}
      {!isLoading && !error && selectedRoute?.warning && (
        <div className="flight-map-warnings" role="status" aria-label="Flights with invalid route data">
          <p>{selectedRoute.warning}</p>
        </div>
      )}
      <div className="flight-map-stage">
        <div className="flight-map-canvas" ref={mapContainerRef} />
        {isLoading && <div className="flight-map-status"><Loader message="Loading flight routes…" /></div>}
        {error && <p className="flight-map-status flight-map-error" role="alert">{error}</p>}
        {!isLoading && !error && flights.length === 0 && (
          <p className="flight-map-status flight-map-empty">
            No flights with route data are available for this account.
          </p>
        )}
      </div>
      {!isLoading && !error && flights.length > 0 && (
        <div className="flight-map-legend" aria-label="Map legend">
          <span><i className="legend-origin" /> Origin</span>
          <span><i className="legend-destination" /> Destination</span>
          <span><i className="legend-current" /> Current position</span>
        </div>
      )}
    </section>
  );
}

export default Map;
