"use strict";
//  Store all active users
Object.defineProperty(exports, "__esModule", { value: true });
exports.addConnection = addConnection;
exports.removeConnection = removeConnection;
exports.getConnection = getConnection;
exports.getAllConnections = getAllConnections;
const connections = new Map();
function addConnection(username, socket) {
    connections.set(username, socket);
    console.log(`[SOCKET] User connected: ${username}`);
}
function removeConnection(username) {
    connections.delete(username);
    console.log(`[SOCKET] User disconnected: ${username}`);
}
function getConnection(username) {
    return connections.get(username);
}
function getAllConnections() {
    return Array.from(connections.values());
}
