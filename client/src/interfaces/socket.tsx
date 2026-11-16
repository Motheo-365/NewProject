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
    type: 'FLIGHT_UPDATE' | 'flight_update';
    flightId: number;
    latitude: number;
    longitude: number;
    status: string;
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
    data: ApiResponse<unknown>;
}

export interface BoardingCallMessage {
    type: 'BOARDING_CALL';
    flightId: number;
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

export type SocketServerMessage =
    | AuthSuccessMessage
    | AuthFailedMessage
    | FlightUpdateMessage
    | TrackSuccessMessage
    | DispatchResultMessage
    | BoardResultMessage
    | BoardingCallMessage
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
    BOARDING_CONFIRMED: BoardingConfirmedMessage;
    ERROR: ErrorMessage;
    KILLED: KilledMessage;
}
