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

interface Coordinates {
    latitude: number;
    longitude: number;
}

const flightSimulationTimers = new Map<string | number, NodeJS.Timeout>();
const FLIGHT_SIMULATION_TICK_MS = 250;
const SIMULATED_MINUTES_PER_FLIGHT_HOUR = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function readCoordinates(value: unknown): Coordinates | null {
    if (!isRecord(value) || !isRecord(value.coordinates)) return null;

    const { latitude, longitude } = value.coordinates;
    return typeof latitude === "number" && Number.isFinite(latitude)
        && typeof longitude === "number" && Number.isFinite(longitude)
        ? { latitude, longitude }
        : null;
}

function interpolateGreatCircle(
    origin: Coordinates,
    destination: Coordinates,
    progress: number
): Coordinates {
    const toRadians = (degrees: number) => degrees * Math.PI / 180;
    const toDegrees = (radians: number) => radians * 180 / Math.PI;
    const originLatitude = toRadians(origin.latitude);
    const originLongitude = toRadians(origin.longitude);
    const destinationLatitude = toRadians(destination.latitude);
    const destinationLongitude = toRadians(destination.longitude);

    const start = [
        Math.cos(originLatitude) * Math.cos(originLongitude),
        Math.cos(originLatitude) * Math.sin(originLongitude),
        Math.sin(originLatitude)
    ];
    const end = [
        Math.cos(destinationLatitude) * Math.cos(destinationLongitude),
        Math.cos(destinationLatitude) * Math.sin(destinationLongitude),
        Math.sin(destinationLatitude)
    ];
    const dot = Math.max(-1, Math.min(1, start[0] * end[0] + start[1] * end[1] + start[2] * end[2]));
    const angle = Math.acos(dot);

    if (angle < 1e-10) return origin;

    const sinAngle = Math.sin(angle);
    const startWeight = Math.sin((1 - progress) * angle) / sinAngle;
    const endWeight = Math.sin(progress * angle) / sinAngle;
    const x = startWeight * start[0] + endWeight * end[0];
    const y = startWeight * start[1] + endWeight * end[1];
    const z = startWeight * start[2] + endWeight * end[2];

    return {
        latitude: toDegrees(Math.atan2(z, Math.sqrt(x * x + y * y))),
        longitude: toDegrees(Math.atan2(y, x))
    };
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
                message: res.message || "The API rejected this API key."
            }));
            return;
        }

        const user = res.data;
        if (
            !isRecord(user)
            || typeof user.id !== "number"
            || typeof user.username !== "string"
            || typeof user.type !== "string"
        ) {
            socket.send(JSON.stringify({
                type: "AUTH_FAILED",
                message: "The API returned an invalid user profile."
            }));
            return;
        }

        const role = user.type.trim().toUpperCase();
        if (role !== "ATC" && role !== "PASSENGER") {
            socket.send(JSON.stringify({
                type: "AUTH_FAILED",
                message: `Unsupported account type: ${user.type}`
            }));
            return;
        }

        setUsername(user.username);
        socket.user = {
            id: user.id,
            username: user.username,
            role,
            api_key: apiKey
        };

        addUser(user.username, socket, role);

        socket.send(JSON.stringify({
            type: "AUTH_SUCCESS",
            role
        }));

        info(`User authenticated: ${user.username} (${role})`);
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
        subscribeToFlight(socket.user.username, data.flightId);
        void startFlightSimulation(data.flightId, socket.user.api_key, socket);

        const flightRes: any = await request({
            type: "GetFlight",
            api_key: socket.user.api_key,
            flight_id: data.flightId
        });

        if (flightRes.status === "success") {
            const passengers = flightRes.data.passengers || [];

            passengers.forEach((p: any) => {
                const s = getSocket(p.username) as ExtendedWebSocket | undefined;
                if (s?.readyState === WebSocket.OPEN) {
                    s.send(JSON.stringify({
                        type: "BOARDING_CALL",
                        flightId: data.flightId
                    }));
                }
            });
        } else {
            socket.send(JSON.stringify({
                type: "ERROR",
                message: flightRes.message || "Flight dispatched, but passenger boarding calls could not be sent."
            }));
        }

        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: "BOARDING_CALL",
                flightId: data.flightId
            }));
        }
    }

    socket.send(JSON.stringify({
        type: "DISPATCH_RESULT",
        data: res
    }));
}

async function startFlightSimulation(
    flightId: string | number,
    apiKey: string,
    controllerSocket: ExtendedWebSocket
) {
    const reportFailure = (message: string) => {
        error(message);
        if (controllerSocket.readyState === WebSocket.OPEN) {
            controllerSocket.send(JSON.stringify({ type: "ERROR", message }));
        }
    };

    const currentTimer = flightSimulationTimers.get(flightId);
    if (currentTimer) clearTimeout(currentTimer);

    try {
        const response = await request({
            type: "GetFlight",
            api_key: apiKey,
            flight_id: flightId
        });

        if (response.status !== "success" || !isRecord(response.data)) {
            throw new Error(response.message || "Unable to load flight route for simulation.");
        }

        const origin = readCoordinates(response.data.origin);
        const destination = readCoordinates(response.data.destination);
        const durationHours = response.data.flight_duration_hours;
        if (
            !origin
            || !destination
            || typeof durationHours !== "number"
            || !Number.isFinite(durationHours)
            || durationHours <= 0
        ) {
            throw new Error("Flight route coordinates or duration are invalid.");
        }

        const durationMilliseconds = Math.max(
            durationHours * SIMULATED_MINUTES_PER_FLIGHT_HOUR * 60_000,
            FLIGHT_SIMULATION_TICK_MS
        );
        const startTime = Date.now();
        let reportedPersistenceFailure = false;
        let timer: NodeJS.Timeout | undefined;

        const updatePosition = async () => {
            try {
                const progress = Math.min((Date.now() - startTime) / durationMilliseconds, 1);
                const position = interpolateGreatCircle(origin, destination, progress);
                const status = progress >= 1 ? "Landed" : "In Flight";

                const updateResponse = await request({
                    type: "UpdateFlightPosition",
                    server_key: process.env.SERVER_KEY,
                    flight_id: flightId,
                    latitude: position.latitude,
                    longitude: position.longitude,
                    status
                });
                if (updateResponse.status !== "success") {
                    if (!reportedPersistenceFailure) {
                        reportFailure(
                            `Flight ${flightId} is moving, but its position could not be saved: ${
                                updateResponse.message || "position update was rejected."
                            }`,
                        );
                        reportedPersistenceFailure = true;
                    }
                } else {
                    reportedPersistenceFailure = false;

                    if (
                        !isRecord(updateResponse.data)
                        || typeof updateResponse.data.latitude !== "number"
                        || typeof updateResponse.data.longitude !== "number"
                        || typeof updateResponse.data.status !== "string"
                    ) {
                        throw new Error("Flight API did not return the saved position.");
                    }

                    const savedPosition = {
                        latitude: updateResponse.data.latitude,
                        longitude: updateResponse.data.longitude,
                        status: updateResponse.data.status
                    };
                    getFlightSubscribers(flightId).forEach((clientId: string) => {
                        const clientSocket = getSocket(clientId) as ExtendedWebSocket | undefined;
                        if (clientSocket?.readyState === WebSocket.OPEN) {
                            clientSocket.send(JSON.stringify({
                                type: "FLIGHT_UPDATE",
                                flightId,
                                ...savedPosition
                            }));
                        }
                    });
                }

                if (progress >= 1) {
                    if (timer) clearTimeout(timer);
                    flightSimulationTimers.delete(flightId);
                    info(`Flight ${flightId} landed. Simulation stopped.`);
                    return;
                }
            } catch (simulationError: unknown) {
                if (!reportedPersistenceFailure) {
                    reportFailure(`Flight ${flightId} is moving, but its position could not be saved: ${
                        simulationError instanceof Error ? simulationError.message : "unknown error"
                    }`);
                    reportedPersistenceFailure = true;
                }
            }

            timer = setTimeout(() => {
                void updatePosition();
            }, FLIGHT_SIMULATION_TICK_MS);
            flightSimulationTimers.set(flightId, timer);
        };

        void updatePosition();
    } catch (simulationError: unknown) {
        reportFailure(`Unable to start simulation for flight ${flightId}: ${
            simulationError instanceof Error ? simulationError.message : "unknown error"
        }`);
    }
}

async function handleBoard(data: any, { socket }: MessageContext) {
    if (!socket.user) {
        socket.send(JSON.stringify({
            type: "ERROR",
            message: "Not authenticated"
        }));
        return;
    }

    if (socket.user.role !== "PASSENGER") {
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