"use strict";
/*
    Central in-memory state store for the Node server
    In memory tracking
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.addUser = addUser;
exports.removeUser = removeUser;
exports.getUser = getUser;
exports.getSocket = getSocket;
exports.getSockets = getSockets;
exports.getAllSockets = getAllSockets;
exports.getConnectedUsers = getConnectedUsers;
exports.subscribeToFlight = subscribeToFlight;
exports.unsubscribeFromFlight = unsubscribeFromFlight;
exports.getFlightSubscribers = getFlightSubscribers;
exports.shutdown = shutdown;
exports.getState = getState;
const state = {
    users: new Map(),
    flights: new Map(),
    sockets: new Map(),
    system: {
        isRunning: true,
        startTime: Date.now()
    }
};
/* ================= USER ================= */
function addUser(username, socket, role = null) {
    let sessions = state.users.get(username);
    if (!sessions) {
        sessions = new Map();
        state.users.set(username, sessions);
    }
    sessions.set(socket, { socket, role });
    state.sockets.set(username, socket);
}
function removeUser(username, socket) {
    const sessions = state.users.get(username);
    if (!sessions)
        return false;
    if (socket) {
        sessions.delete(socket);
    }
    else {
        sessions.clear();
    }
    if (sessions.size === 0) {
        state.users.delete(username);
        state.sockets.delete(username);
        for (const [flightId, flight] of state.flights) {
            flight.subscribers.delete(username);
            if (flight.subscribers.size === 0)
                state.flights.delete(flightId);
        }
        return true;
    }
    const mostRecentSession = Array.from(sessions.values()).at(-1);
    if (mostRecentSession)
        state.sockets.set(username, mostRecentSession.socket);
    return false;
}
function getUser(username) {
    const sessions = state.users.get(username);
    return sessions ? Array.from(sessions.values()).at(-1) : undefined;
}
function getSocket(username) {
    return state.sockets.get(username);
}
function getSockets(username) {
    return Array.from(state.users.get(username)?.keys() ?? []);
}
function getAllSockets() {
    return Array.from(state.users.values()).flatMap((sessions) => Array.from(sessions.keys()));
}
function getConnectedUsers() {
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
function subscribeToFlight(username, flightId) {
    let flight = state.flights.get(flightId);
    if (!flight) {
        flight = {
            subscribers: new Set()
        };
        state.flights.set(flightId, flight);
    }
    flight.subscribers.add(username);
}
function unsubscribeFromFlight(username, flightId) {
    state.flights.get(flightId)?.subscribers?.delete(username);
}
function getFlightSubscribers(flightId) {
    return state.flights.get(flightId)?.subscribers || new Set();
}
function shutdown() {
    state.system.isRunning = false;
}
function getState() {
    return state;
}
