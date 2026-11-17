import type {
  ConnectedUser,
  SocketClientMessage,
  SocketEventMap,
  SocketServerMessage,
} from '../interfaces/socket';
import type { ApiResponse } from '../interfaces/api';
import { connectToSocketServer } from '../connections/socket-server';
import { getApiKey } from './apiKeyCookie';

type EventListener<K extends keyof SocketEventMap> = (message: SocketEventMap[K]) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  return isRecord(value)
    && (value.status === 'success' || value.status === 'error')
    && typeof value.timestamp === 'number'
    && (value.message === undefined || typeof value.message === 'string');
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readFlightUpdate(value: Record<string, unknown>): SocketServerMessage | null {
  const responseData = isRecord(value.data) ? value.data : {};
  const data = isRecord(responseData.data) ? responseData.data : responseData;
  const currentPosition = [
    value.current_position,
    value.currentPosition,
    responseData.current_position,
    responseData.currentPosition,
    data.current_position,
    data.currentPosition,
  ].find(isRecord) ?? {};
  const rawFlightId = value.flightId ?? value.flight_id ?? value.id
    ?? data.flightId ?? data.flight_id ?? data.id;
  const rawLatitude = value.latitude ?? value.lat ?? value.current_latitude
    ?? data.latitude ?? data.lat ?? data.current_latitude
    ?? currentPosition.latitude ?? currentPosition.lat ?? currentPosition.current_latitude;
  const rawLongitude = value.longitude ?? value.lng ?? value.current_longitude
    ?? data.longitude ?? data.lng ?? data.current_longitude
    ?? currentPosition.longitude ?? currentPosition.lng ?? currentPosition.current_longitude;
  const flightId = readFiniteNumber(rawFlightId);
  const latitude = readFiniteNumber(rawLatitude);
  const longitude = readFiniteNumber(rawLongitude);
  const progress = readFiniteNumber(value.progress ?? data.progress);
  const status = value.status ?? data.status;

  if (
    flightId === null
    || !Number.isInteger(flightId)
    || latitude === null
    || latitude < -90
    || latitude > 90
    || longitude === null
    || longitude < -180
    || longitude > 180
    || progress === null
    || progress < 0
    || progress > 1
    || typeof status !== 'string'
    || !status.trim()
  ) {
    return null;
  }

  return {
    type: 'FLIGHT_UPDATE',
    flightId,
    latitude,
    longitude,
    status,
    progress,
  };
}

function parseServerMessage(value: unknown): SocketServerMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'AUTH_SUCCESS':
      return typeof value.role === 'string'
        ? { type: value.type, role: value.role }
        : null;
    case 'CONNECTED_USERS': {
      if (
        typeof value.count !== 'number'
        || !Number.isInteger(value.count)
        || typeof value.connections !== 'number'
        || !Number.isInteger(value.connections)
        || !Array.isArray(value.users)
      ) {
        return null;
      }

      const users: ConnectedUser[] = [];
      for (const user of value.users) {
        if (
          !isRecord(user)
          || typeof user.username !== 'string'
          || (user.role !== 'ATC' && user.role !== 'PASSENGER' && user.role !== null)
          || typeof user.connections !== 'number'
          || !Number.isInteger(user.connections)
          || user.connections <= 0
        ) {
          return null;
        }

        users.push({
          username: user.username,
          role: user.role,
          connections: user.connections,
        });
      }

      if (users.length !== value.count || users.reduce((total, user) => total + user.connections, 0) !== value.connections) {
        return null;
      }

      return {
        type: value.type,
        count: value.count,
        connections: value.connections,
        users,
      };
    }
    case 'AUTH_FAILED':
    case 'ERROR':
    case 'KILLED':
    case 'SHUTDOWN':
      return typeof value.message === 'string'
        ? { type: value.type === 'SHUTDOWN' ? 'KILLED' : value.type, message: value.message }
        : null;
    case 'TRACK_SUCCESS':
      return typeof value.flightId === 'number'
        ? { type: value.type, flightId: value.flightId }
        : null;
    case 'BOARDING_CALL':
      return typeof value.flightId === 'number'
        ? {
            type: value.type,
            flightId: value.flightId,
            ...(typeof value.dispatchedAt === 'string'
              ? { dispatchedAt: value.dispatchedAt }
              : {}),
          }
        : null;
    case 'FLIGHT_LANDED':
      return typeof value.flightId === 'number' && typeof value.flightNumber === 'string'
        ? { type: value.type, flightId: value.flightId, flightNumber: value.flightNumber }
        : null;
    case 'FLIGHT_UPDATE':
    case 'flight_update':
    case 'POSITION':
      return readFlightUpdate(value);
    case 'DISPATCH_RESULT':
      return isApiResponse(value.data)
        ? { type: value.type, data: value.data }
        : null;
    case 'BOARD_RESULT':
      return typeof value.flightId === 'number' && isApiResponse(value.data)
        ? { type: value.type, flightId: value.flightId, data: value.data }
        : null;
    case 'BOARDING_CONFIRMED':
      return typeof value.flightId === 'number' && typeof value.passenger === 'string'
        ? {
            type: value.type,
            flightId: value.flightId,
            passenger: value.passenger,
          }
        : null;
    default:
      return null;
  }
}

class SocketService {
  private socket: WebSocket | null = null;
  private reconnectEnabled = false;
  private reconnectTimer: number | null = null;
  private listeners = new Map<keyof SocketEventMap, Set<(message: unknown) => void>>();

  on<K extends keyof SocketEventMap>(event: K, callback: EventListener<K>): () => void {
    const listener = (message: unknown) => callback(message as SocketEventMap[K]);
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  private emit<K extends keyof SocketEventMap>(event: K, message: SocketEventMap[K]): void {
    this.listeners.get(event)?.forEach((callback) => callback(message));
  }

  private handleMessage(message: SocketServerMessage): void {
    switch (message.type) {
      case 'AUTH_SUCCESS':
        this.emit('AUTH_SUCCESS', message);
        break;
      case 'CONNECTED_USERS':
        this.emit('CONNECTED_USERS', message);
        break;
      case 'AUTH_FAILED':
        console.error('WebSocket auth failed:', message.message);
        this.emit('AUTH_FAILED', message);
        break;
      case 'TRACK_SUCCESS':
        this.emit('TRACK_SUCCESS', message);
        break;
      case 'FLIGHT_UPDATE':
        this.emit('FLIGHT_UPDATE', message);
        break;
      case 'DISPATCH_RESULT':
        this.emit('DISPATCH_RESULT', message);
        break;
      case 'BOARD_RESULT':
        this.emit('BOARD_RESULT', message);
        break;
      case 'BOARDING_CALL':
        this.emit('BOARDING_CALL', message);
        break;
      case 'FLIGHT_LANDED':
        this.emit('FLIGHT_LANDED', message);
        break;
      case 'BOARDING_CONFIRMED':
        this.emit('BOARDING_CONFIRMED', message);
        break;
      case 'ERROR':
        console.error('Server error:', message.message);
        this.emit('ERROR', message);
        break;
      case 'KILLED':
        this.emit('KILLED', message);
        this.reconnectEnabled = false;
        this.emit('SOCKET_CLOSED', { type: 'SOCKET_CLOSED' });
        window.alert(message.message);
        this.disconnect();
        break;
    }
  }

  async connect(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    this.reconnectEnabled = true;
    await this.openSocket();
  }

  private async openSocket(): Promise<void> {
    const storedApiKey = getApiKey();
    if (!storedApiKey) {
      throw new Error('No API key is saved for the signed-in user. Log in again.');
    }

    const socket = await connectToSocketServer((message) => {
      this.emit('ERROR', { type: 'ERROR', message });
    });
    if (!this.reconnectEnabled) {
      socket.close();
      return;
    }
    this.socket = socket;

    socket.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'string') {
        console.error('Ignoring non-text WebSocket message.');
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch (error: unknown) {
        console.error('WebSocket parse error:', error, 'raw message:', event.data);
        return;
      }

      const message = parseServerMessage(payload);
      if (!message) {
        console.warn('Ignoring unknown or malformed WebSocket message:', payload);
        return;
      }

      this.handleMessage(message);
    });

    socket.addEventListener('error', (event) => {
      console.error('WebSocket error:', event);
    });

    socket.addEventListener('close', () => {
      if (this.socket === socket) {
        this.socket = null;
        this.emit('SOCKET_CLOSED', { type: 'SOCKET_CLOSED' });
        if (this.reconnectEnabled) {
          this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = null;
            void this.openSocket().catch((connectError: unknown) => {
              this.emit('ERROR', {
                type: 'ERROR',
                message: connectError instanceof Error
                  ? connectError.message
                  : 'Unable to reconnect to the flight service.',
              });
            });
          }, 2_000);
        }
      }
      console.log('WebSocket connection closed');
    });

    const currentApiKey = getApiKey();
    if (!currentApiKey) {
      this.disconnect();
      throw new Error('The saved API key was removed before the socket connected. Log in again.');
    }

    this.send({ type: 'AUTH', api_key: currentApiKey });
  }

  send(message: SocketClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.warn('Socket not open, message dropped:', message);
    }
  }

  trackFlight(flightId: number): void {
    this.send({ type: 'TRACK', flightId });
  }

  boardFlight(flightId: number): void {
    this.send({ type: 'BOARD', flightId });
  }

  dispatchFlight(flightId: number): void {
    this.send({ type: 'DISPATCH', flightId });
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    this.reconnectEnabled = false;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}

export const socketService = new SocketService();
