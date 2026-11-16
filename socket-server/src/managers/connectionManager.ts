//  Store all active users

import type WebSocket from "ws";

const connections = new Map<string, WebSocket>();

export function addConnection(username: string, socket: WebSocket): void {
    connections.set(username, socket);
    console.log(`[SOCKET] User connected: ${username}`);
}

export function removeConnection(username: string): void {
    connections.delete(username);
    console.log(`[SOCKET] User disconnected: ${username}`);
}

export function getConnection(username: string): WebSocket | undefined {
    return connections.get(username);
}

export function getAllConnections(): WebSocket[] {
    return Array.from(connections.values());
}