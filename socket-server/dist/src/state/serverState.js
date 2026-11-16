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
    state.users.set(username, { socket, role });
    state.sockets.set(username, socket);
}
function removeUser(username) {
    state.users.delete(username);
    state.sockets.delete(username);
}
function getUser(username) {
    return state.users.get(username);
}
function getSocket(username) {
    return state.sockets.get(username);
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
