import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import FlightMap from '../components/map';
import Loader from '../components/Loader';
import type { Flight } from '../interfaces/api';
import { getApiKey } from '../services/apiKeyCookie';
import { apiService } from '../services/apiService';
import { socketService } from '../services/socketService';
import { clearCurrentUser } from '../services/userSession';

import '../styles/passenger.css';

interface BoardingNotice {
  flightId: number;
  dispatchedAt?: string;
}

function getRemainingSeconds(dispatchedAt: string | undefined, now: number): number {
  if (!dispatchedAt) return 0;
  const dispatchedTime = new Date(dispatchedAt).getTime();
  if (!Number.isFinite(dispatchedTime)) return 0;

  return Math.max(0, Math.ceil((dispatchedTime + 60_000 - now) / 1000));
}

function formatStatus(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === 'in flight') return 'In Flight';
  if (normalized === 'no_show') return 'No-show';
  return normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function updateFlight(
  flight: Flight,
  flightId: number,
  status: string,
  latitude?: number,
  longitude?: number,
  progress?: number,
): Flight {
  if (flight.id !== flightId) return flight;

  const bookingStatus = flight.booking_details?.status.toUpperCase();
  const updatedBookingStatus = status === 'In Flight'
    && bookingStatus !== 'BOARDED'
    && bookingStatus !== 'CANCELLED'
    && bookingStatus !== 'NO_SHOW'
    ? 'NO_SHOW'
    : flight.booking_details?.status;

  return {
    ...flight,
    status,
    current_position: {
      latitude: latitude ?? flight.current_position.latitude,
      longitude: longitude ?? flight.current_position.longitude,
    },
    ...(progress !== undefined ? { progress } : {}),
    ...(flight.booking_details
      ? { booking_details: { ...flight.booking_details, status: updatedBookingStatus ?? flight.booking_details.status } }
      : {}),
  };
}

export function Passenger() {
  const apiKey = getApiKey() ?? '';
  const [flights, setFlights] = useState<Flight[]>([]);
  const [selectedFlightId, setSelectedFlightId] = useState<number | null>(null);
  const [boardingNotices, setBoardingNotices] = useState<BoardingNotice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [pendingBoardingFlightId, setPendingBoardingFlightId] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const selectedFlightIdRef = useRef<number | null>(null);
  const isAuthenticatedRef = useRef(false);
  const requestedTrackingIdRef = useRef<number | null>(null);
  const boardingEventsRef = useRef(new Map<number, string | undefined>());

  useEffect(() => {
    selectedFlightIdRef.current = selectedFlightId;
  }, [selectedFlightId]);

  const fetchFlights = useCallback(async () => {
    if (!apiKey) {
      setError('Your sign-in session has expired. Please log in again.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiService.getFlights(apiKey);
      if (response.status !== 'success' || !response.data) {
        throw new Error(response.message || 'The API did not return your booked flights.');
      }

      if (response.data.role.toUpperCase() !== 'PASSENGER') {
        throw new Error('This dashboard is only available to passenger accounts.');
      }

      const fetchedFlights = response.data.flights.map((flight) => {
        const eventDispatchedAt = boardingEventsRef.current.get(flight.id);
        if (!eventDispatchedAt || flight.status.toLowerCase() !== 'scheduled') {
          if (flight.status.toLowerCase() !== 'scheduled') {
            boardingEventsRef.current.delete(flight.id);
          }
          return flight;
        }

        const dispatchTime = new Date(eventDispatchedAt).getTime();
        if (Number.isFinite(dispatchTime) && Date.now() - dispatchTime < 60_000) {
          return { ...flight, status: 'Boarding', dispatched_at: eventDispatchedAt };
        }

        boardingEventsRef.current.delete(flight.id);
        return flight;
      });

      setNow(Date.now());
      setFlights(fetchedFlights);
      setBoardingNotices(fetchedFlights
        .filter((flight) => flight.status.toLowerCase() === 'boarding')
        .map((flight) => ({
          flightId: flight.id,
          ...(flight.dispatched_at ? { dispatchedAt: flight.dispatched_at } : {}),
        })));
      setError('');
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load your booked flights.');
    } finally {
      setIsLoading(false);
    }
  }, [apiKey]);

  const requestTracking = useCallback((flightId: number) => {
    if (!isAuthenticatedRef.current || requestedTrackingIdRef.current === flightId) return;

    requestedTrackingIdRef.current = flightId;
    setIsTracking(false);
    socketService.trackFlight(flightId);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const fetchTimer = window.setTimeout(() => {
      void fetchFlights();
    }, 0);

    const unsubscribers = [
      socketService.on('AUTH_SUCCESS', () => {
        if (!active) return;
        isAuthenticatedRef.current = true;
        setIsSocketConnected(true);
        setError('');
        const selectedId = selectedFlightIdRef.current;
        if (selectedId !== null) requestTracking(selectedId);
      }),
      socketService.on('AUTH_FAILED', (message) => {
        if (!active) return;
        isAuthenticatedRef.current = false;
        setIsSocketConnected(false);
        setError(message.message || 'Unable to authenticate with the live flight service.');
      }),
      socketService.on('SOCKET_CLOSED', () => {
        if (!active) return;
        isAuthenticatedRef.current = false;
        requestedTrackingIdRef.current = null;
        setIsSocketConnected(false);
        setIsTracking(false);
        setError('Live flight connection lost. Reconnecting…');
      }),
      socketService.on('TRACK_SUCCESS', (message) => {
        if (!active || message.flightId !== selectedFlightIdRef.current) return;
        setIsTracking(true);
        setError('');
      }),
      socketService.on('BOARDING_CALL', (message) => {
        if (!active) return;
        setNow(Date.now());
        boardingEventsRef.current.set(message.flightId, message.dispatchedAt);
        setBoardingNotices((current) => [
          ...current.filter((notice) => notice.flightId !== message.flightId),
          { flightId: message.flightId, dispatchedAt: message.dispatchedAt },
        ]);
        setFlights((current) => current.map((flight) => ({
          ...flight,
          ...(flight.id === message.flightId
            ? {
                status: 'Boarding',
                ...(message.dispatchedAt ? { dispatched_at: message.dispatchedAt } : {}),
              }
            : {}),
        })));
        setSelectedFlightId(message.flightId);
        selectedFlightIdRef.current = message.flightId;
        requestedTrackingIdRef.current = null;
        requestTracking(message.flightId);
        setAnnouncement(`Boarding call for flight ${message.flightId}. Confirm boarding within 60 seconds.`);
        void fetchFlights();
      }),
      socketService.on('BOARD_RESULT', (message) => {
        if (!active) return;
        setPendingBoardingFlightId(null);
        if (message.data.status !== 'success') {
          setAnnouncement(message.data.message || 'Boarding could not be confirmed.');
          return;
        }

        setFlights((current) => current.map((flight) => (
          flight.id === message.flightId && flight.booking_details
            ? { ...flight, booking_details: { ...flight.booking_details, status: 'BOARDED' } }
            : flight
        )));
        setAnnouncement(`Boarding confirmed for flight ${message.flightId}.`);
      }),
      socketService.on('FLIGHT_UPDATE', (message) => {
        if (!active) return;
        setFlights((current) => current.map((flight) => (
          updateFlight(
            flight,
            message.flightId,
            message.status,
            message.latitude,
            message.longitude,
            message.progress,
          )
        )));
      }),
      socketService.on('FLIGHT_LANDED', (message) => {
        if (!active) return;
        setAnnouncement(`Flight ${message.flightNumber} has landed.`);
      }),
      socketService.on('ERROR', (message) => {
        if (!active) return;
        setError(message.message);
      }),
    ];

    void socketService.connect().catch((connectError: unknown) => {
      if (!active) return;
      setIsSocketConnected(false);
      setError(connectError instanceof Error
        ? connectError.message
        : 'Unable to connect to live flight updates.');
    });

    return () => {
      active = false;
      window.clearTimeout(fetchTimer);
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      socketService.disconnect();
    };
  }, [fetchFlights, requestTracking]);

  const selectedFlight = useMemo(
    () => flights.find((flight) => flight.id === selectedFlightId) ?? null,
    [flights, selectedFlightId],
  );

  const handleTrackFlight = (flightId: number) => {
    setSelectedFlightId(flightId);
    selectedFlightIdRef.current = flightId;
    requestedTrackingIdRef.current = null;
    requestTracking(flightId);
  };

  const handleBoard = (flightId: number) => {
    if (!isSocketConnected || pendingBoardingFlightId !== null) return;
    setAnnouncement('');
    setPendingBoardingFlightId(flightId);
    socketService.boardFlight(flightId);
  };

  const handleLogout = () => {
    socketService.disconnect();
    clearCurrentUser();
    window.location.assign('/');
  };

  if (isLoading) {
    return <main className="passenger-page"><Loader message="Loading your flights…" /></main>;
  }

  return (
    <main className="passenger-page">
      <header className="passenger-header">
        <div>
          <p className="passenger-eyebrow">PASSENGER FLIGHT TRACKING</p>
          <h1>Your flights</h1>
          <p>Track your booked flights and respond to boarding calls in real time.</p>
        </div>
        <button className="passenger-logout" type="button" onClick={handleLogout}>Log out</button>
      </header>

      <p className={`passenger-connection ${isSocketConnected ? 'is-connected' : 'is-disconnected'}`} role="status">
        {isSocketConnected
          ? 'Live flight service connected'
          : error
            ? 'Live flight service unavailable'
            : 'Connecting to live flight service…'}
      </p>

      {error && <p className="passenger-error" role="alert">{error}</p>}
      {announcement && <p className="passenger-announcement" role="status">{announcement}</p>}

      {boardingNotices.length > 0 && (
        <section className="passenger-boarding-alerts" aria-labelledby="boarding-calls-title" aria-live="polite">
          <h2 id="boarding-calls-title">Boarding calls</h2>
          {boardingNotices.map((notice) => {
            const flight = flights.find((item) => item.id === notice.flightId);
            const remainingSeconds = getRemainingSeconds(
              notice.dispatchedAt ?? flight?.dispatched_at,
              now,
            );
            const bookingStatus = flight?.booking_details?.status.toUpperCase();
            const isBoarded = bookingStatus === 'BOARDED';
            const isBoarding = flight?.status.toLowerCase() === 'boarding';

            return (
              <article className="passenger-boarding-call" key={notice.flightId}>
                <div>
                  <strong>Boarding call · {flight?.flight_number ?? `Flight ${notice.flightId}`}</strong>
                  <p>
                    {isBoarded
                      ? 'Boarding confirmed.'
                      : isBoarding && remainingSeconds > 0
                        ? `Confirm boarding within ${remainingSeconds} seconds.`
                        : isBoarding
                          ? 'The boarding window has closed.'
                          : 'This flight has left the boarding window.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="passenger-board-button"
                  disabled={
                    !isSocketConnected
                    || pendingBoardingFlightId !== null
                    || !isBoarding
                    || remainingSeconds <= 0
                    || isBoarded
                    || bookingStatus === 'NO_SHOW'
                    || bookingStatus === 'CANCELLED'
                  }
                  onClick={() => handleBoard(notice.flightId)}
                >
                  {pendingBoardingFlightId === notice.flightId
                    ? 'Confirming…'
                    : isBoarded
                      ? 'Boarding confirmed'
                      : 'Confirm Boarding'}
                </button>
              </article>
            );
          })}
        </section>
      )}

      <section className="passenger-dashboard" aria-label="Your booked flights">
        <div className="passenger-flight-panel">
          <div className="passenger-panel-heading">
            <div>
              <h2>Booked flights</h2>
              <p>{flights.length} flight{flights.length === 1 ? '' : 's'} on your itinerary</p>
            </div>
          </div>
          {flights.length === 0 ? (
            <p className="passenger-empty">You don’t have any booked flights yet.</p>
          ) : (
            <div className="passenger-flight-list">
              {flights.map((flight) => {
                const isSelected = flight.id === selectedFlightId;
                return (
                  <article
                    className={`passenger-flight-card${isSelected ? ' is-selected' : ''}`}
                    key={flight.id}
                  >
                    <div className="passenger-flight-card-top">
                      <strong>{flight.flight_number}</strong>
                      <span className={`passenger-status status-${flight.status.toLowerCase().replace(/\s+/g, '-')}`}>
                        {formatStatus(flight.status)}
                      </span>
                    </div>
                    <p className="passenger-flight-route">
                      {flight.origin.code} <span aria-hidden="true">→</span> {flight.destination.code}
                    </p>
                    <p className="passenger-flight-airports">
                      {flight.origin.city} to {flight.destination.city}
                    </p>
                    <p className="passenger-flight-booking">
                      Seat {flight.booking_details?.seat_number ?? '—'}
                      {' · '}
                      Booking: {formatStatus(flight.booking_details?.status ?? 'Unknown')}
                    </p>
                    <button
                      type="button"
                      className="passenger-track-button"
                      aria-pressed={isSelected && isTracking}
                      disabled={!isSocketConnected}
                      onClick={() => handleTrackFlight(flight.id)}
                    >
                      {isSelected && isTracking ? 'Tracking flight' : 'Track this flight'}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="passenger-selected-panel" aria-live="polite">
          <h2>Selected flight</h2>
          {selectedFlight ? (
            <>
              <p className="passenger-selected-number">{selectedFlight.flight_number}</p>
              <p>{selectedFlight.origin.name} ({selectedFlight.origin.code})</p>
              <p className="passenger-route-arrow" aria-hidden="true">↓</p>
              <p>{selectedFlight.destination.name} ({selectedFlight.destination.code})</p>
              <div className="passenger-selected-status">
                <span>Current status</span>
                <strong>{formatStatus(selectedFlight.status)}</strong>
              </div>
              {typeof selectedFlight.progress === 'number' && (
                <div className="passenger-selected-status">
                  <span>Flight progress</span>
                  <strong>{Math.round(selectedFlight.progress * 100)}%</strong>
                </div>
              )}
              <div className="passenger-coordinates" aria-live="polite">
                <span>Current position</span>
                {typeof selectedFlight.current_position.latitude === 'number'
                && typeof selectedFlight.current_position.longitude === 'number' ? (
                  <p>
                    Lat {selectedFlight.current_position.latitude.toFixed(4)}
                    {' · '}
                    Lon {selectedFlight.current_position.longitude.toFixed(4)}
                  </p>
                ) : (
                  <p>Awaiting live aircraft position.</p>
                )}
              </div>
              <p className="passenger-track-state">
                {isTracking ? 'Live position updates are active.' : 'Select “Track this flight” to start live tracking.'}
              </p>
            </>
          ) : (
            <p className="passenger-empty">Choose a booked flight to view its route and live status.</p>
          )}
        </aside>
      </section>

      <FlightMap apiKey={apiKey} activeFlight={isTracking ? selectedFlight : null} />
    </main>
  );
}

export default Passenger;
