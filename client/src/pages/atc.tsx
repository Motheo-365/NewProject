import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Flight } from '../interfaces/api';
import FlightMap from '../components/map';
import Loader from '../components/Loader';
import { apiService } from '../services/apiService';
import { socketService } from '../services/socketService';

import "../styles/atc.css"

interface NotificationItem {
  id: number;
  message: string;
}

function isBoarded(status: string): boolean {
  return status.toLowerCase() === 'boarded';
}

function getRemainingSeconds(deadline: number): number {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export default function AtcPage() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [selectedFlight, setSelectedFlight] = useState<Flight | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTracking, setIsTracking] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(() => socketService.isConnected());
  const [boardingCountdown, setBoardingCountdown] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [error, setError] = useState('');
  const flightsRef = useRef(flights);
  const selectedFlightRef = useRef(selectedFlight);
  const selectedFlightIdRef = useRef<number | null>(null);
  const boardingTimersRef = useRef(new Map<number, number>());
  const boardingDeadlinesRef = useRef(new Map<number, number>());
  const boardingStatusesRef = useRef(new Map<number, Map<string, boolean>>());
  const apiKey = localStorage.getItem('api_key');

  useEffect(() => {
    flightsRef.current = flights;
    selectedFlightRef.current = selectedFlight;
  }, [flights, selectedFlight]);

  const addNotification = useCallback((message: string) => {
    setNotifications((current) => [
      { id: Date.now() + Math.random(), message },
      ...current,
    ]);
  }, []);

  const startBoardingWindow = useCallback((flightId: number) => {
    const previousTimer = boardingTimersRef.current.get(flightId);
    if (previousTimer !== undefined) {
      window.clearTimeout(previousTimer);
    }

    const deadline = Date.now() + 60_000;
    boardingDeadlinesRef.current.set(flightId, deadline);
    if (selectedFlightIdRef.current === flightId) {
      setBoardingCountdown(60);
    }

    const timer = window.setTimeout(() => {
      const passengers = boardingStatusesRef.current.get(flightId);
      const notBoarded = passengers
        ? [...passengers.entries()].filter(([, boarded]) => !boarded).map(([username]) => username)
        : [];

      if (notBoarded.length > 0) {
        addNotification(
          `Flight ${flightId}: passenger(s) did not board within 60 seconds: ${notBoarded.join(', ')}.`,
        );
      }

      boardingTimersRef.current.delete(flightId);
      boardingDeadlinesRef.current.delete(flightId);
      if (selectedFlightIdRef.current === flightId) {
        setBoardingCountdown(0);
      }
    }, 60_000);

    boardingTimersRef.current.set(flightId, timer);
  }, [addNotification]);

  const fetchFlights = useCallback(async () => {
    if (!apiKey) {
      return;
    }

    try {
      const response = await apiService.getFlights(apiKey);
      if (response.status !== 'success' || !response.data) {
        throw new Error(response.message || 'The API did not return flight data.');
      }

      const fetchedFlights = response.data.flights;
      setFlights(fetchedFlights);
      setSelectedFlight((current) => {
        if (!current) return null;
        const updatedFlight = fetchedFlights.find((flight) => flight.id === current.id);
        return updatedFlight
          ? { ...current, ...updatedFlight, passengers: updatedFlight.passengers ?? current.passengers }
          : null;
      });
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load flights.');
    } finally {
      setIsLoading(false);
    }
  }, [apiKey]);

  const filteredFlights = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();

    return flights.filter((flight) => {
      const matchesSearch =
        flight.flight_number.toLowerCase().includes(query) ||
        flight.origin.name.toLowerCase().includes(query) ||
        flight.origin.code.toLowerCase().includes(query) ||
        flight.destination.name.toLowerCase().includes(query) ||
        flight.destination.code.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === 'All' ||
        flight.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [flights, searchQuery, statusFilter]);

  useEffect(() => {
    const boardingTimers = boardingTimersRef.current;
    const boardingDeadlines = boardingDeadlinesRef.current;
    const fetchTimer = window.setTimeout(() => {
      void fetchFlights();
    }, 0);

    if (apiKey && !socketService.isConnected()) {
      void socketService.connect().catch((connectError: unknown) => {
        console.error('Unable to connect to the flight socket:', connectError);
        setIsSocketConnected(false);
        addNotification('Live flight updates are unavailable.');
      });
    }

    const unsubscribeAuthSuccess = socketService.on('AUTH_SUCCESS', () => {
      setIsSocketConnected(true);
    });

    const unsubscribeFlightUpdate = socketService.on('FLIGHT_UPDATE', (message) => {
      const updateFlight = (flight: Flight): Flight => (
        flight.id === message.flightId
          ? {
              ...flight,
              status: message.status,
              current_position: {
                latitude: message.latitude,
                longitude: message.longitude,
              },
            }
          : flight
      );
      setFlights((current) => current.map(updateFlight));
      setSelectedFlight((current) => current ? updateFlight(current) : null);
    });

    const unsubscribeTracking = socketService.on('TRACK_SUCCESS', (message) => {
      if (selectedFlightIdRef.current === message.flightId) {
        setIsTracking(true);
      }
      addNotification(`Live tracking started for flight ${message.flightId}.`);
    });

    const unsubscribeDispatch = socketService.on('DISPATCH_RESULT', (message) => {
      if (message.data.status !== 'success') {
        addNotification(message.data.message || 'Flight dispatch was rejected.');
        return;
      }

      addNotification(message.data.message || 'Flight dispatched successfully.');
      setFlights((current) => current.map((flight) => (
        flight.id === selectedFlightIdRef.current
          ? { ...flight, status: 'Boarding' }
          : flight
      )));
      setSelectedFlight((current) => current ? { ...current, status: 'Boarding' } : null);
      void fetchFlights();
    });

    const unsubscribeBoardingCall = socketService.on('BOARDING_CALL', (message) => {
      addNotification(`Boarding call issued for flight ${message.flightId}.`);
      if (!boardingStatusesRef.current.has(message.flightId)) {
        const flight = flightsRef.current.find((item) => item.id === message.flightId)
          ?? (selectedFlightRef.current?.id === message.flightId ? selectedFlightRef.current : null);
        if (flight?.passengers) {
          boardingStatusesRef.current.set(
            message.flightId,
            new Map(flight.passengers.map((passenger) => [
              passenger.username,
              isBoarded(passenger.status),
            ])),
          );
        }
      }
      startBoardingWindow(message.flightId);
    });

    const unsubscribeBoardingConfirmed = socketService.on('BOARDING_CONFIRMED', (message) => {
      addNotification(`${message.passenger} boarded flight ${message.flightId}.`);
      const passengerStatuses = boardingStatusesRef.current.get(message.flightId);
      passengerStatuses?.set(message.passenger, true);

      if (passengerStatuses && [...passengerStatuses.values()].every(Boolean)) {
        const timer = boardingTimersRef.current.get(message.flightId);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          boardingTimersRef.current.delete(message.flightId);
          boardingDeadlinesRef.current.delete(message.flightId);
          if (selectedFlightIdRef.current === message.flightId) {
            setBoardingCountdown(0);
          }
        }
      }

      setFlights((current) => current.map((flight) => (
        flight.id === message.flightId && flight.passengers
          ? {
              ...flight,
              passengers: flight.passengers.map((passenger) => (
                passenger.username === message.passenger
                  ? { ...passenger, status: 'Boarded' }
                  : passenger
              )),
            }
          : flight
      )));
      setSelectedFlight((current) => {
        if (!current || current.id !== message.flightId || !current.passengers) return current;

        return {
          ...current,
          passengers: current.passengers.map((passenger) => (
            passenger.username === message.passenger
              ? { ...passenger, status: 'Boarded' }
              : passenger
          )),
        };
      });
    });

    const unsubscribeAuthFailed = socketService.on('AUTH_FAILED', (message) => {
      setIsSocketConnected(false);
      addNotification(`Live connection authentication failed: ${message.message}`);
    });

    const unsubscribeSocketError = socketService.on('ERROR', (message) => {
      addNotification(message.message);
    });

    return () => {
      window.clearTimeout(fetchTimer);
      unsubscribeFlightUpdate();
      unsubscribeTracking();
      unsubscribeDispatch();
      unsubscribeBoardingCall();
      unsubscribeBoardingConfirmed();
      unsubscribeAuthFailed();
      unsubscribeSocketError();
      unsubscribeAuthSuccess();
      boardingTimers.forEach((timer) => window.clearTimeout(timer));
      boardingTimers.clear();
      boardingDeadlines.clear();
    };
  }, [addNotification, apiKey, fetchFlights, startBoardingWindow]);

  useEffect(() => {
    if (boardingCountdown <= 0) return undefined;

    const timer = window.setTimeout(() => {
      setBoardingCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [boardingCountdown]);

  const selectFlight = async (flight: Flight) => {
    selectedFlightIdRef.current = flight.id;
    setSelectedFlight(flight);
    setIsTracking(false);
    const deadline = boardingDeadlinesRef.current.get(flight.id);
    setBoardingCountdown(deadline ? getRemainingSeconds(deadline) : 0);

    if (!apiKey) {
      setError('Your session has expired. Sign in again to view flight details.');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const response = await apiService.getFlight(apiKey, flight.id);
      if (response.status !== 'success' || !response.data) {
        throw new Error(response.message || 'Unable to retrieve flight details.');
      }

      setSelectedFlight(response.data);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to retrieve flight details.');
    } finally {
      setIsLoading(false);
    }
  };

  const dispatchFlight = (flight: Flight) => {
    if (flight.status !== 'Scheduled') return;
    selectedFlightIdRef.current = flight.id;
    boardingStatusesRef.current.set(
      flight.id,
      new Map((flight.passengers ?? []).map((passenger) => [
        passenger.username,
        isBoarded(passenger.status),
      ])),
    );
    socketService.dispatchFlight(flight.id);
  };

  const trackSelectedFlight = () => {
    if (!selectedFlight || !['Boarding', 'In Flight'].includes(selectedFlight.status)) return;
    socketService.trackFlight(selectedFlight.id);
  };

  if (!apiKey) {
    return <p role="alert">Your session has expired. Sign in again to view the ATC dashboard.</p>;
  }

  return (
    <main className="atc-page">
      <header className="atc-header">
        <div>
          <h1>Air Traffic Control</h1>
          <p>Flight Operations Dashboard</p>
        </div>
        <div className="stats">
          <div className="stat-card"><h2>{flights.length}</h2><p>Total Flights</p></div>
          <div className="stat-card">
            <h2>{flights.filter((flight) => flight.status === 'Boarding').length}</h2>
            <p>Boarding</p>
          </div>
          <div className="stat-card">
            <h2>{flights.filter((flight) => flight.status === 'In Flight').length}</h2>
            <p>In Flight</p>
          </div>
          <div className="stat-card">
            <h2>{flights.filter((flight) => flight.status === 'Landed').length}</h2>
            <p>Landed</p>
          </div>
        </div>
      </header>

      {error && <p className="atc-error" role="alert">{error}</p>}
      <p className={`atc-connection-status ${isSocketConnected ? 'is-connected' : 'is-disconnected'}`} role="status">
        {isSocketConnected ? 'Live operations connected' : 'Connecting to live operations…'}
      </p>
      <FlightMap apiKey={apiKey} activeFlight={selectedFlight} />

      <section className="dashboard">
        <div className="flight-panel">
            <div className="flight-panel-header">
                <div>
                    <h2>Flights</h2>
                    <p>Manage and monitor flight operations</p>
                </div>

                <span className="flight-count">
                    {filteredFlights.length} flights
                </span>
            </div>

            <div className="flight-controls">
                <div className="flight-search">
                    <input
                        type="search"
                        placeholder="Search flight number, origin or destination..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    aria-label="Filter flights by status"
                >
                    <option value="All">All Flights</option>
                    <option value="Boarding">Boarding</option>
                    <option value="Scheduled">Scheduled</option>
                    <option value="In Flight">In Flight</option>
                    <option value="Landed">Landed</option>
                </select>
            </div>

            {isLoading && flights.length === 0 ? (
                <Loader message="Loading flights…" />
            ) : filteredFlights.length === 0 ? (
                <p className="empty-flights">
                    No flights match your search.
                </p>
            ) : (
                <div className="flight-table-container">
                    <table className="flight-table">
                        <thead>
                            <tr>
                                <th>Flight</th>
                                <th>Origin</th>
                                <th>Destination</th>
                                <th>Departure</th>
                                <th>Status</th>
                            </tr>
                        </thead>

                        <tbody>
                            {filteredFlights.map((flight) => (
                                <tr
                                    key={flight.id}
                                    onClick={() => void selectFlight(flight)}
                                    className={
                                        selectedFlight?.id === flight.id
                                            ? 'selected-flight'
                                            : ''
                                    }
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            void selectFlight(flight);
                                        }
                                    }}
                                >
                                    <td>
                                        <strong>{flight.flight_number}</strong>
                                    </td>

                                    <td>
                                        <strong>{flight.origin.code}</strong>
                                        <small>{flight.origin.name}</small>
                                    </td>

                                    <td>
                                        <strong>{flight.destination.code}</strong>
                                        <small>{flight.destination.name}</small>
                                    </td>

                                    <td>
                                        <time dateTime={flight.departure_time}>
                                          {new Date(flight.departure_time).toLocaleString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </time>
                                    </td>

                                    <td>
                                        <span
                                            className={`status status-${flight.status
                                                .toLowerCase()
                                                .replaceAll(' ', '-')}`}
                                        >
                                            {flight.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>

        {selectedFlight && (
          <section className="details-panel" aria-label={`${selectedFlight.flight_number} details`}>
            <header className="details-header">
              <h2>{selectedFlight.flight_number}</h2>
              <div className="details-actions">
                <button
                  type="button"
                  className="track-btn"
                  onClick={trackSelectedFlight}
                  disabled={!isSocketConnected || isTracking || !['Boarding', 'In Flight'].includes(selectedFlight.status)}
                >
                  {isTracking ? 'Tracking' : isSocketConnected ? 'Track flight' : 'Connecting…'}
                </button>
                <button
                  type="button"
                  className="dispatch-btn"
                  onClick={() => dispatchFlight(selectedFlight)}
                  disabled={!isSocketConnected || selectedFlight.status !== 'Scheduled'}
                >
                  {isSocketConnected ? 'Dispatch flight' : 'Connecting…'}
                </button>
              </div>
            </header>

            <div className="route-card">
              <h3>Route</h3>
              <p>{selectedFlight.origin.city} → {selectedFlight.destination.city}</p>
              <p>{selectedFlight.origin.code} → {selectedFlight.destination.code}</p>
            </div>

            <div className="info-card">
              <h3>Status</h3>
              <span className={`status status-${selectedFlight.status.toLowerCase().replaceAll(' ', '-')}`}>
                {selectedFlight.status}
              </span>
              {boardingCountdown > 0 && (
                <p>Boarding window: {boardingCountdown} seconds</p>
              )}
            </div>

            <div className="position-card">
              <h3>Live aircraft position</h3>
              {selectedFlight.current_position.latitude !== null
                && selectedFlight.current_position.longitude !== null ? (
                  <p>
                    Latitude: {selectedFlight.current_position.latitude}
                    {' · '}
                    Longitude: {selectedFlight.current_position.longitude}
                  </p>
                ) : (
                  <p>Position not available yet.</p>
                )}
            </div>

            <div className="passenger-card">
              <h3>Passenger manifest ({selectedFlight.passenger_count ?? selectedFlight.passengers?.length ?? 0})</h3>
              {selectedFlight.passengers?.length ? (
                <table>
                  <thead>
                    <tr><th>Passenger</th><th>Seat</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {selectedFlight.passengers.map((passenger) => (
                      <tr key={passenger.id}>
                        <td>{passenger.username}</td>
                        <td>{passenger.seat_number}</td>
                        <td>{isBoarded(passenger.status) ? 'Boarded' : passenger.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No passengers on this flight.</p>
              )}
            </div>

            <div className="notifications">
              <h3>Live notifications</h3>
              {notifications.length ? notifications.map((notification) => (
                <p key={notification.id}>{notification.message}</p>
              )) : <p>No recent notifications.</p>}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
