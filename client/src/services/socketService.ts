import type {
  SocketClientMessage,
  SocketEventMap,
  SocketServerMessage,
} from '../interfaces/socket';
import type { ApiResponse } from '../interfaces/api';
import { connectToSocketServer } from '../connections/socket-server';

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

function parseServerMessage(value: unknown): SocketServerMessage | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'AUTH_SUCCESS':
      return typeof value.role === 'string'
        ? { type: value.type, role: value.role }
        : null;
    case 'AUTH_FAILED':
    case 'ERROR':
    case 'KILLED':
      return typeof value.message === 'string'
        ? { type: value.type, message: value.message }
        : null;
    case 'TRACK_SUCCESS':
    case 'BOARDING_CALL':
      return typeof value.flightId === 'number'
        ? { type: value.type, flightId: value.flightId }
        : null;
    case 'FLIGHT_UPDATE':
    case 'flight_update':
      return typeof value.flightId === 'number'
        && typeof value.latitude === 'number'
        && typeof value.longitude === 'number'
        && typeof value.status === 'string'
        ? {
            type: value.type,
            flightId: value.flightId,
            latitude: value.latitude,
            longitude: value.longitude,
            status: value.status,
          }
        : null;
    case 'DISPATCH_RESULT':
    case 'BOARD_RESULT':
      return isApiResponse(value.data)
        ? { type: value.type, data: value.data }
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
      case 'AUTH_FAILED':
        console.error('WebSocket auth failed:', message.message);
        this.emit('AUTH_FAILED', message);
        break;
      case 'TRACK_SUCCESS':
        this.emit('TRACK_SUCCESS', message);
        break;
      case 'FLIGHT_UPDATE':
      case 'flight_update':
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
      case 'BOARDING_CONFIRMED':
        this.emit('BOARDING_CONFIRMED', message);
        break;
      case 'ERROR':
        console.error('Server error:', message.message);
        this.emit('ERROR', message);
        break;
      case 'KILLED':
        this.emit('KILLED', message);
        window.alert(message.message);
        this.disconnect();
        break;
    }
  }

  async connect(): Promise<void> {
    this.disconnect();

    const storedApiKey = localStorage.getItem('api_key')?.trim();
    if (!storedApiKey) {
      throw new Error('No API key is saved for the signed-in user. Log in again.');
    }

    const socket = await connectToSocketServer();
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
      if (this.socket === socket) this.socket = null;
      console.log('WebSocket connection closed');
    });

    const currentApiKey = localStorage.getItem('api_key')?.trim();
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
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}

export const socketService = new SocketService();
