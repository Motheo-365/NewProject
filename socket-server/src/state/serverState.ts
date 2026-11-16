/* 
    Central in-memory state store for the Node server
    In memory tracking
 */

import type WebSocket from "ws";

type FlightId = string | number;

interface UserState {
    socket: WebSocket;
    role: string | null;
}

interface FlightState {
    subscribers: Set<string>;
}

const state = {
    users: new Map<string, UserState>(),
    flights: new Map<FlightId, FlightState>(),
    sockets: new Map<string, WebSocket>(),

    system: {
        isRunning: true,
        startTime: Date.now()
    }
};


/* ================= USER ================= */

export function addUser(username: string, socket: WebSocket, role: string | null = null) {
    state.users.set(username, { socket, role });
    state.sockets.set(username, socket);
}

export function removeUser(username: string) {
    state.users.delete(username);
    state.sockets.delete(username);
}

export function getUser(username: string) {
    return state.users.get(username);
}

export function getSocket(username: string) {
    return state.sockets.get(username);
}

/* ================= FLIGHTS ================= */

export function subscribeToFlight(username: string, flightId: FlightId) {
    let flight = state.flights.get(flightId);
    if (!flight) {
        flight = {
            subscribers: new Set()
        };
        state.flights.set(flightId, flight);
    }

    flight.subscribers.add(username);
}

export function unsubscribeFromFlight(username: string, flightId: FlightId) {
    state.flights.get(flightId)?.subscribers?.delete(username);
}

export function getFlightSubscribers(flightId: FlightId) {
    return state.flights.get(flightId)?.subscribers || new Set();
}

export function shutdown() {
    state.system.isRunning = false;
}

export function getState() {
    return state;
}