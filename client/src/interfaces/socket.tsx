import type { ApiResponse } from './api';

export interface AuthRequest {
    type: 'AUTH';
    api_key: string;
}

export interface TrackRequest {
    type: 'TRACK';
    flightId: number;
}

export interface BoardRequest {
    type: 'BOARD';
    flightId: number;
}

export interface DispatchRequest {
    type: 'DISPATCH';
    flightId: number;
}

export type SocketClientMessage =
    | AuthRequest
    | TrackRequest
    | BoardRequest
    | DispatchRequest;

export interface AuthSuccessMessage {
    type: 'AUTH_SUCCESS';
    role: string;
}

export interface AuthFailedMessage {
    type: 'AUTH_FAILED';
    message: string;
}

export interface FlightUpdateMessage {
    type: 'FLIGHT_UPDATE';
    flightId: number;
    latitude: number;
    longitude: number;
    status: string;
    progress: number;
}

export interface TrackSuccessMessage {
    type: 'TRACK_SUCCESS';
    flightId: number;
}

export interface DispatchResultMessage {
    type: 'DISPATCH_RESULT';
    data: ApiResponse<unknown>;
}

export interface BoardResultMessage {
    type: 'BOARD_RESULT';
    flightId: number;
    data: ApiResponse<unknown>;
}

export interface BoardingCallMessage {
    type: 'BOARDING_CALL';
    flightId: number;
    dispatchedAt?: string;
}

export interface FlightLandedMessage {
    type: 'FLIGHT_LANDED';
    flightId: number;
    flightNumber: string;
}

export interface BoardingConfirmedMessage {
    type: 'BOARDING_CONFIRMED';
    flightId: number;
    passenger: string;
}

export interface ErrorMessage {
    type: 'ERROR';
    message: string;
}

export interface KilledMessage {
    type: 'KILLED';
    message: string;
}

export interface SocketClosedMessage {
    type: 'SOCKET_CLOSED';
}

export type SocketServerMessage =
    | AuthSuccessMessage
    | AuthFailedMessage
    | FlightUpdateMessage
    | TrackSuccessMessage
    | DispatchResultMessage
    | BoardResultMessage
    | BoardingCallMessage
    | FlightLandedMessage
    | BoardingConfirmedMessage
    | ErrorMessage
    | KilledMessage;

export interface SocketEventMap {
    AUTH_SUCCESS: AuthSuccessMessage;
    AUTH_FAILED: AuthFailedMessage;
    TRACK_SUCCESS: TrackSuccessMessage;
    FLIGHT_UPDATE: FlightUpdateMessage;
    DISPATCH_RESULT: DispatchResultMessage;
    BOARD_RESULT: BoardResultMessage;
    BOARDING_CALL: BoardingCallMessage;
    FLIGHT_LANDED: FlightLandedMessage;
    BOARDING_CONFIRMED: BoardingConfirmedMessage;
    ERROR: ErrorMessage;
    KILLED: KilledMessage;
    SOCKET_CLOSED: SocketClosedMessage;
}
