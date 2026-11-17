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

export interface ConnectedUser {
    username: string;
    role: string | null;
    connections: number;
}

interface FlightState {
    subscribers: Set<string>;
}

const state = {
    users: new Map<string, Map<WebSocket, UserState>>(),
    flights: new Map<FlightId, FlightState>(),
    sockets: new Map<string, WebSocket>(),

    system: {
        isRunning: true,
        startTime: Date.now()
    }
};


/* ================= USER ================= */

export function addUser(username: string, socket: WebSocket, role: string | null = null): void {
    let sessions = state.users.get(username);
    if (!sessions) {
        sessions = new Map();
        state.users.set(username, sessions);
    }

    sessions.set(socket, { socket, role });
    state.sockets.set(username, socket);
}

export function removeUser(username: string, socket?: WebSocket): boolean {
    const sessions = state.users.get(username);
    if (!sessions) return false;

    if (socket) {
        sessions.delete(socket);
    } else {
        sessions.clear();
    }

    if (sessions.size === 0) {
        state.users.delete(username);
        state.sockets.delete(username);
        for (const [flightId, flight] of state.flights) {
            flight.subscribers.delete(username);
            if (flight.subscribers.size === 0) state.flights.delete(flightId);
        }
        return true;
    }

    const mostRecentSession = Array.from(sessions.values()).at(-1);
    if (mostRecentSession) state.sockets.set(username, mostRecentSession.socket);
    return false;
}

export function getUser(username: string) {
    const sessions = state.users.get(username);
    return sessions ? Array.from(sessions.values()).at(-1) : undefined;
}

export function getSocket(username: string) {
    return state.sockets.get(username);
}

export function getSockets(username: string): WebSocket[] {
    return Array.from(state.users.get(username)?.keys() ?? []);
}

export function getAllSockets(): WebSocket[] {
    return Array.from(state.users.values()).flatMap((sessions) => Array.from(sessions.keys()));
}

export function getConnectedUsers(): ConnectedUser[] {
    return Array.from(state.users, ([username, sessions]) => {
        const latestSession = Array.from(sessions.values()).at(-1);
        return {
            username,
            role: latestSession?.role ?? null,
            connections: sessions.size,
        };
    }).sort((left, right) => left.username.localeCompare(right.username));
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