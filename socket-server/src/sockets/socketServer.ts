import WebSocket from "ws";
import {format, info, warn, error, debug} from "../utils/logger";
import { request } from "../services/apiService";

import {
    addUser,
    removeUser,
    getSocket,
    subscribeToFlight,
    getFlightSubscribers
} from "../state/serverState";

// Extend WebSocket interface to support attached custom properties like `.user`
export interface ExtendedWebSocket extends WebSocket {
    user?: {
        id: number;
        username: string;
        role: string;
        api_key: string;
    };
}

interface MessageContext {
    socket: ExtendedWebSocket;
    username: string | null;
    setUsername: (name: string) => void;
}

function handleMessage(type: string, data: any, context: MessageContext) {
    switch (type) {
        case "AUTH":
            return handleAuth(data, context);
        case "TRACK":
            return handleTrack(data, context);
        case "DISPATCH":
            return handleDispatch(data, context);
        case "BOARD":
            return handleBoard(data, context);
        default:
            warn(`Unknown message type: ${type}`);
    }
}

/* ================= HANDLERS ================= */

async function handleAuth(data: any, { socket, setUsername }: MessageContext) {
    const apiKey = data.api_key;

    if (!apiKey) {
        socket.send(JSON.stringify({
            type: "AUTH_FAILED",
            message: "api_key required"
        }));
        return;
    }

    try {
        const res: any = await request({
            type: "Me",
            api_key: apiKey
        });

        if (res.status !== "success") {
            socket.send(JSON.stringify({
                type: "AUTH_FAILED",
                message: "Invalid API key"
            }));
            return;
        }

        const user = res.data;

        setUsername(user.username);
        socket.user = {
            id: user.id,
            username: user.username,
            role: user.type,
            api_key: apiKey
        };

        addUser(user.username, socket);

        socket.send(JSON.stringify({
            type: "AUTH_SUCCESS",
            role: user.type
        }));

        info(`User authenticated: ${user.username} (${user.type})`);
    } catch (err: any) {
        error(err.message);

        socket.send(JSON.stringify({
            type: "AUTH_FAILED",
            message: "Server error"
        }));
    }
}

async function handleTrack(data: any, { socket }: MessageContext) {
    const { flightId } = data;

    if (!socket.user) {
        socket.send(JSON.stringify({
            type: "ERROR",
            message: "Not authenticated"
        }));
        return;
    }

    if (!flightId) {
        socket.send(JSON.stringify({
            type: "ERROR",
            message: "Missing flightId"
        }));
        return;
    }

    const res: any = await request({
        type: "GetFlight",
        api_key: socket.user.api_key,
        flight_id: flightId
    });

    if (res.status !== "success") {
        socket.send(JSON.stringify({
            type: "ERROR",
            message: "Not allowed to track this flight"
        }));
        return;
    }

    subscribeToFlight(socket.user.username, flightId);
    info(`${socket.user.username} tracking ${flightId}`);

    socket.send(JSON.stringify({
        type: "TRACK_SUCCESS",
        flightId
    }));
}

async function handleDispatch(data: any, { socket }: MessageContext) {
    if (!socket.user) {
        socket.send(JSON.stringify({
            type: "ERROR",
            message: "Not authenticated"
        }));
        return;
    }

    if (socket.user.role !== "ATC") {
        socket.send(JSON.stringify({
            type: "ERROR",
            message: "Unauthorized"
        }));
        return;
    }

    const res: any = await request({
        type: "DispatchFlight",
        api_key: socket.user.api_key,
        flight_id: data.flightId
    });

    console.log("Dispatch API response:", res);

    if (res.status === "success") {
        startFlightSimulation(data.flightId, socket.user.api_key);

        const flightRes: any = await request({
            type: "GetFlight",
            api_key: socket.user.api_key,
            flight_id: data.flightId
        });

        if (flightRes.status === "success") {
            const passengers = flightRes.data.passengers || [];

            passengers.forEach((p: any) => {
                const s = getSocket(p.username) as ExtendedWebSocket | undefined;
                if (s) {
                    s.send(JSON.stringify({
                        type: "BOARDING_CALL",
                        flightId: data.flightId
                    }));
                }
            });
        }
    }

    socket.send(JSON.stringify({
        type: "DISPATCH_RESULT",
        data: res
    }));
}

function startFlightSimulation(flightId: string | number, apiKey: string) {
    const interval = 2000;
    let lat: number | null = null;
    let lng: number | null = null;

    const timer = setInterval(async () => {
        try {
            const res: any = await request({
                type: "GetFlight",
                api_key: apiKey,
                flight_id: flightId
            });

            if (res.status !== "success") {
                console.log("Stopping simulation: API failed");
                clearInterval(timer);
                return;
            }

            const flight = res.data;

            if (lat === null || lng === null) {
                lat = flight.current_position.latitude;
                lng = flight.current_position.longitude;
            }

            lat! += (Math.random() - 0.5) * 0.05;
            lng! += (Math.random() - 0.5) * 0.05;

            const subscribers = getFlightSubscribers(flightId);

            subscribers.forEach((clientId: string) => {
                const clientSocket = getSocket(clientId) as ExtendedWebSocket | undefined;
                if (clientSocket) {
                    clientSocket.send(JSON.stringify({
                        type: "flight_update",
                        flightId: flightId,
                        latitude: lat,
                        longitude: lng,
                        status: flight.status
                    }));
                }
            });

            await request({
                type: "UpdateFlightPosition",
                server_key: process.env.SERVER_KEY,
                flight_id: flightId,
                latitude: lat,
                longitude: lng
            });

            if (flight.status === "Landed") {
                console.log(`Flight ${flightId} landed. Stopping simulation.`);
                clearInterval(timer);
            }
        } catch (err) {
            console.error("Simulation error:", err);
            clearInterval(timer);
        }
    }, interval);
}

async function handleBoard(data: any, { socket }: MessageContext) {
    if (!socket.user) {
        socket.send(JSON.stringify({
            type: "ERROR",
            message: "Not authenticated"
        }));
        return;
    }

    if (socket.user.role !== "Passenger") {
        socket.send(JSON.stringify({
            type: "ERROR",
            message: "Unauthorized"
        }));
        return;
    }

    const res: any = await request({
        type: "BoardFlight",
        api_key: socket.user.api_key,
        flight_id: data.flightId
    });

    if (res.status === "success") {
        const atcSockets = getFlightSubscribers(data.flightId);

        atcSockets.forEach((id: string) => {
            const s = getSocket(id) as ExtendedWebSocket | undefined;
            if (s && s.user?.role === "ATC") {
                s.send(JSON.stringify({
                    type: "BOARDING_CONFIRMED",
                    flightId: data.flightId,
                    passenger: socket.user?.username
                }));
            }
        });
    }

    socket.send(JSON.stringify({
        type: "BOARD_RESULT",
        data: res
    }));
}

/* ================= SERVER INIT ================= */

export function initSocketServer(port: number, host: string = "0.0.0.0") {
    const wss = new WebSocket.Server({ port, host });

    info(`WebSocket server started on ${host}:${port}`);

    wss.on("connection", (socket: ExtendedWebSocket) => {
        info("New connection");

        let username: string | null = null;

        const context: MessageContext = {
            socket,
            get username() {
                return username;
            },
            setUsername: (name: string) => {
                username = name;
            }
        };

        socket.on("message", (message: WebSocket.RawData) => {
            try {
                const data = JSON.parse(message.toString());
                if (!data.type) return;

                handleMessage(data.type, data, context);
            } catch {
                error("Invalid JSON received");
            }
        });

        socket.on("close", () => {
            if (username) removeUser(username);
        });

        socket.on("error", (err: Error) => {
            error(err.message);
        });
    });

    return wss;
}