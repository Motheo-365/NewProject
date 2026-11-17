import WebSocket from "ws";
import {format, info, warn, error, debug} from "../utils/logger";
import { request } from "../services/apiService";

import {
    addUser,
    removeUser,
    getSockets,
    subscribeToFlight,
    getFlightSubscribers,
    getConnectedUsers
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

type FlightLifecycle = {
    phase: "boarding" | "starting" | "flying";
    timer?: NodeJS.Timeout;
};
const flightLifecycles = new Map<string, FlightLifecycle>();

function getFlightKey(flightId: string | number): string {
    return String(flightId);
}

function stopFlightLifecycle(flightId: string | number): void {
    const key = getFlightKey(flightId);
    const lifecycle = flightLifecycles.get(key);

    if (lifecycle?.timer) {
        clearTimeout(lifecycle.timer);
    }

    flightLifecycles.delete(key);
}

function scheduleFlightSimulation( flightId: string | number, apiKey: string, dispatchedAt: string ): void {
    const key = getFlightKey(flightId);

    // Do not schedule a duplicate lifecycle.
    if (flightLifecycles.has(key)) {
        return;
    }

    const dispatchTimestamp = new Date(dispatchedAt).getTime();

    if (!Number.isFinite(dispatchTimestamp)) {
        error(`Invalid dispatched_at timestamp for flight ${flightId}`);
        return;
    }

    const simulationStartTime = dispatchTimestamp + BOARDING_WINDOW_MS;
    const remainingBoardingTime = Math.max(
        0,
        simulationStartTime - Date.now()
    );

    const lifecycle: FlightLifecycle = {
        phase: "boarding"
    };

    flightLifecycles.set(key, lifecycle);

    lifecycle.timer = setTimeout(() => {
        lifecycle.phase = "starting";
        lifecycle.timer = undefined;

        void startFlightSimulation(flightId, apiKey, dispatchedAt);
    }, remainingBoardingTime);

    info(
        `Flight ${flightId}: simulation scheduled in ${
            Math.ceil(remainingBoardingTime / 1000)
        } seconds.`
    );
}

const FLIGHT_SIMULATION_TICK_MS = 250;
const BOARDING_WINDOW_MS = 60_000;
const SIMULATED_SECONDS_PER_FLIGHT_HOUR = 1;

function broadcastConnectedUsers(): void {
    const users = getConnectedUsers();
    const message = JSON.stringify({
        type: "CONNECTED_USERS",
        count: users.length,
        connections: users.reduce((total, user) => total + user.connections, 0),
        users
    });

    users
        .filter((user) => user.role === "ATC")
        .flatMap((user) => getSockets(user.username))
        .forEach((socket) => {
            if (socket.readyState === WebSocket.OPEN) socket.send(message);
        });
}

function broadcastToFlightSubscribers(flightId: string | number, message: string): void {
    getFlightSubscribers(flightId).forEach((username) => {
        getSockets(username).forEach((socket) => {
            if (socket.readyState === WebSocket.OPEN) socket.send(message);
        });
    });
}

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

function interpolateGreatCircle( origin: Coordinates, destination: Coordinates, progress: number ): Coordinates {
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
        broadcastConnectedUsers();
    } catch (err: any) {
        error(err.message);

        socket.send(JSON.stringify({
            type: "AUTH_FAILED",
            message: "Server error"
        }));
    }
}

async function handleTrack(data: any, { socket }: MessageContext) {
    if (!socket.user) {
        socket.send(JSON.stringify({
            type: "ERROR",
            message: "Not authenticated"
        }));
        return;
    }

    const flightId = data?.flightId;
    if (
        (typeof flightId !== "number" && typeof flightId !== "string")
        || !String(flightId).trim()
        || !Number.isSafeInteger(Number(flightId))
        || Number(flightId) <= 0
    ) {
        socket.send(JSON.stringify({
            type: "ERROR",
            message: "A valid flightId is required."
        }));
        return;
    }

    const normalizedFlightId = Number(flightId);
    const res = await request({
        type: "GetFlight",
        api_key: socket.user.api_key,
        flight_id: normalizedFlightId
    });

    if (res.status !== "success" || !isRecord(res.data)) {
        socket.send(JSON.stringify({
            type: "ERROR",
            message: res.message || "Unable to access this flight."
        }));
        return;
    }

    const flight = res.data;

    subscribeToFlight(socket.user.username, normalizedFlightId);

    const status =
        typeof flight.status === "string"
            ? flight.status.toLowerCase()
            : "";

    const dispatchedAt =
        typeof flight.dispatched_at === "string"
            ? flight.dispatched_at
            : undefined;

    if (
        socket.user.role === "ATC" &&
        (status === "boarding" || status === "in flight") &&
        dispatchedAt
    ) {
        scheduleFlightSimulation(
            normalizedFlightId,
            socket.user.api_key,
            dispatchedAt
        );
    }

    info(`${socket.user.username} tracking ${flightId}`);

    socket.send(JSON.stringify({
        type: "TRACK_SUCCESS",
        flightId: normalizedFlightId
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

    const flightId = data?.flightId;
    if (
        (typeof flightId !== "number" && typeof flightId !== "string")
        || !String(flightId).trim()
        || !Number.isSafeInteger(Number(flightId))
        || Number(flightId) <= 0
    ) {
        socket.send(JSON.stringify({
            type: "ERROR",
            message: "A valid flightId is required."
        }));
        return;
    }

    const normalizedFlightId = Number(flightId);
    const res = await request({
        type: "DispatchFlight",
        api_key: socket.user.api_key,
        flight_id: normalizedFlightId
    });

    if (res.status === "success") {
        subscribeToFlight(socket.user.username, normalizedFlightId);
        socket.send(JSON.stringify({
            type: "TRACK_SUCCESS",
            flightId: normalizedFlightId
        }));

        const dispatchData = isRecord(res.data) ? res.data : {};
        const dispatchedAt = typeof dispatchData.dispatched_at === "string"
            ? dispatchData.dispatched_at
            : undefined;
        const dispatchTimestamp = dispatchedAt ? new Date(dispatchedAt).getTime() : Number.NaN;
        const passengers = Array.isArray(dispatchData.passengers) ? dispatchData.passengers : [];

        if (!dispatchedAt || !Number.isFinite(dispatchTimestamp)) {
            socket.send(JSON.stringify({
                type: "ERROR",
                message: "Flight dispatched, but its boarding timestamp was missing or invalid."
            }));
        }

        passengers.forEach((passenger: unknown) => {
            if (!isRecord(passenger) || typeof passenger.username !== "string") return;
            getSockets(passenger.username).forEach((passengerSocket) => {
                if (passengerSocket.readyState === WebSocket.OPEN) {
                    passengerSocket.send(JSON.stringify({
                        type: "BOARDING_CALL",
                        flightId: normalizedFlightId,
                        ...(dispatchedAt ? { dispatchedAt } : {})
                    }));
                }
            });
        });

        if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: "BOARDING_CALL",
                flightId: normalizedFlightId,
                ...(dispatchedAt ? { dispatchedAt } : {})
            }));
        }

        if (dispatchedAt && Number.isFinite(dispatchTimestamp)) {
            scheduleFlightSimulation(
                normalizedFlightId,
                socket.user.api_key,
                dispatchedAt
            );
        }
    }

    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: "DISPATCH_RESULT",
            data: res
        }));
    }
}

async function startFlightSimulation( flightId: string | number, apiKey: string, dispatchedAt: string ): Promise<void> {
    const key = getFlightKey(flightId);
    const lifecycle = flightLifecycles.get(key);

    if (!lifecycle || lifecycle.phase !== "starting") {
        return;
    }

    // Lock this flight before making any asynchronous API calls.
    lifecycle.phase = "flying";

    try {
        const response: any = await request({
            type: "GetFlight",
            api_key: apiKey,
            flight_id: flightId
        });

        if (
            response.status !== "success" ||
            !isRecord(response.data)
        ) {
            throw new Error(
                response.message || "Unable to load flight route."
            );
        }

        let hasEnteredInFlight =
            typeof response.data.status === "string"
            && response.data.status.toLowerCase() === "in flight";
        const origin = readCoordinates(response.data.origin);
        const destination = readCoordinates(response.data.destination);
        const durationHours = response.data.flight_duration_hours;

        if (
            !origin ||
            !destination ||
            typeof durationHours !== "number" ||
            !Number.isFinite(durationHours) ||
            durationHours <= 0
        ) {
            throw new Error("Flight route coordinates or duration are invalid.");
        }

        const dispatchTimestamp = new Date(dispatchedAt).getTime();

        if (!Number.isFinite(dispatchTimestamp)) {
            throw new Error("Invalid flight dispatch timestamp.");
        }

        const simulationStartTime =
            dispatchTimestamp + BOARDING_WINDOW_MS;

        const durationMilliseconds = Math.max(
            durationHours *
                SIMULATED_SECONDS_PER_FLIGHT_HOUR *
                1000,
            1
        );
        let lastReportedError: string | null = null;

        lifecycle.phase = "flying";

        const updatePosition = async (): Promise<void> => {
            // The lifecycle may have been stopped while an API request
            // was in progress.
            if (flightLifecycles.get(key) !== lifecycle) {
                return;
            }

            try {
                // Calculate progress from the original dispatch time.
                const elapsedTime = Math.max(
                    0,
                    Date.now() - simulationStartTime
                );

                const progress = Math.min(
                    elapsedTime / durationMilliseconds,
                    1
                );

                const position = interpolateGreatCircle(
                    origin,
                    destination,
                    progress
                );

                const landed = progress >= 1 && hasEnteredInFlight;

                const updateResponse: any = await request({
                    type: "UpdateFlightPosition",
                    api_key: apiKey,
                    flight_id: flightId,
                    latitude: position.latitude,
                    longitude: position.longitude,
                    status: landed ? "Landed" : "In Flight"
                });

                if (updateResponse.status !== "success") {
                    throw new Error(
                        updateResponse.message ||
                        "Unable to save flight position."
                    );
                }

                if (!isRecord(updateResponse.data)) {
                    throw new Error(
                        "The Flight API returned an invalid position."
                    );
                }

                const savedLatitude = updateResponse.data.latitude;
                const savedLongitude = updateResponse.data.longitude;
                const savedStatus = updateResponse.data.status;

                if (
                    typeof savedLatitude !== "number" ||
                    typeof savedLongitude !== "number" ||
                    typeof savedStatus !== "string"
                ) {
                    throw new Error(
                        "The Flight API returned incomplete position data."
                    );
                }

                if (savedStatus.toLowerCase() === "in flight") {
                    hasEnteredInFlight = true;
                }

                lastReportedError = null;

                // Broadcast the latest position to every subscriber.
                const message = JSON.stringify({
                    type: "POSITION",
                    flightId,
                    progress,
                    latitude: savedLatitude,
                    longitude: savedLongitude,
                    status: savedStatus
                });

                broadcastToFlightSubscribers(flightId, message);

                if (savedStatus.toLowerCase() === "landed") {
                    const landedMessage = JSON.stringify({
                        type: "FLIGHT_LANDED",
                        flightId
                    });

                    broadcastToFlightSubscribers(flightId, landedMessage);

                    stopFlightLifecycle(flightId);

                    info(`Flight ${flightId} landed. Simulation stopped.`);
                    return;
                }
            } catch (simulationError: unknown) {
                const errorMessage = simulationError instanceof Error
                    ? simulationError.message
                    : "Unknown error";
                if (errorMessage !== lastReportedError) {
                    error(`Flight ${flightId} simulation error: ${errorMessage}`);
                    broadcastToFlightSubscribers(flightId, JSON.stringify({
                        type: "ERROR",
                        message: `Flight ${flightId} update failed: ${errorMessage}`
                    }));
                    lastReportedError = errorMessage;
                }
            }

            // Retry on the next tick, including after a temporary API failure.
            if (flightLifecycles.get(key) === lifecycle) {
                lifecycle.timer = setTimeout(() => {
                    void updatePosition();
                }, lastReportedError ? 1000 : FLIGHT_SIMULATION_TICK_MS);
            }
        };

        info(`Flight ${flightId}: simulation started/resumed.`);

        // Immediately calculate and publish the correct current position.
        void updatePosition();

    } catch (simulationError: unknown) {
        const errorMessage = simulationError instanceof Error
            ? simulationError.message
            : "Unknown error";
        error(
            `Unable to start simulation for flight ${flightId}: ${errorMessage}`
        );
        broadcastToFlightSubscribers(flightId, JSON.stringify({
            type: "ERROR",
            message: `Flight ${flightId} simulation failed: ${errorMessage}`
        }));

        stopFlightLifecycle(flightId);
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

    const flightId = data?.flightId;
    if (
        (typeof flightId !== "number" && typeof flightId !== "string")
        || !String(flightId).trim()
        || !Number.isSafeInteger(Number(flightId))
        || Number(flightId) <= 0
    ) {
        socket.send(JSON.stringify({
            type: "ERROR",
            message: "A valid flightId is required."
        }));
        return;
    }

    const normalizedFlightId = Number(flightId);
    const res: any = await request({
        type: "BoardFlight",
        api_key: socket.user.api_key,
        flight_id: normalizedFlightId
    });

    if (res.status === "success") {
        const atcSockets = getFlightSubscribers(normalizedFlightId);

        atcSockets.forEach((id: string) => {
            getSockets(id).forEach((atcSocket) => {
                const currentSocket = atcSocket as ExtendedWebSocket;
                if (currentSocket.user?.role === "ATC" && currentSocket.readyState === WebSocket.OPEN) {
                    currentSocket.send(JSON.stringify({
                        type: "BOARDING_CONFIRMED",
                        flightId: normalizedFlightId,
                        passenger: socket.user?.username
                    }));
                }
            });
        });
    }

    socket.send(JSON.stringify({
        type: "BOARD_RESULT",
        flightId: normalizedFlightId,
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
                const parsedData: unknown = JSON.parse(message.toString());
                if (!isRecord(parsedData) || typeof parsedData.type !== "string") {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({
                            type: "ERROR",
                            message: "Message must be a JSON object with a type."
                        }));
                    }
                    return;
                }

                void Promise.resolve(handleMessage(parsedData.type, parsedData, context)).catch((messageError: unknown) => {
                    const errorMessage = messageError instanceof Error
                        ? messageError.message
                        : "Unable to process the socket message.";
                    error(errorMessage);
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({ type: "ERROR", message: errorMessage }));
                    }
                });
            } catch (parseError: unknown) {
                error(
                    parseError instanceof Error
                        ? `Invalid JSON received: ${parseError.message}`
                        : "Invalid JSON received"
                );
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({
                        type: "ERROR",
                        message: "Invalid JSON message."
                    }));
                }
            }
        });

        socket.on("close", () => {
            if (username) {
                removeUser(username, socket);
                broadcastConnectedUsers();
            }
        });

        socket.on("error", (err: Error) => {
            error(err.message);
        });
    });

    return wss;
}