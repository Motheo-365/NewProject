"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
const ws_1 = __importDefault(require("ws"));
const logger_1 = require("../utils/logger");
const apiService_1 = require("../services/apiService");
const serverState_1 = require("../state/serverState");
const flightSimulationTimers = new Map();
const FLIGHT_SIMULATION_TICK_MS = 250;
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
function readCoordinates(value) {
    if (!isRecord(value) || !isRecord(value.coordinates))
        return null;
    const { latitude, longitude } = value.coordinates;
    return typeof latitude === "number" && Number.isFinite(latitude)
        && typeof longitude === "number" && Number.isFinite(longitude)
        ? { latitude, longitude }
        : null;
}
function interpolateGreatCircle(origin, destination, progress) {
    const toRadians = (degrees) => degrees * Math.PI / 180;
    const toDegrees = (radians) => radians * 180 / Math.PI;
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
    if (angle < 1e-10)
        return origin;
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
function handleMessage(type, data, context) {
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
            (0, logger_1.warn)(`Unknown message type: ${type}`);
    }
}
/* ================= HANDLERS ================= */
async function handleAuth(data, { socket, setUsername }) {
    const apiKey = data.api_key;
    if (!apiKey) {
        socket.send(JSON.stringify({
            type: "AUTH_FAILED",
            message: "api_key required"
        }));
        return;
    }
    try {
        const res = await (0, apiService_1.request)({
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
        if (!isRecord(user)
            || typeof user.id !== "number"
            || typeof user.username !== "string"
            || typeof user.type !== "string") {
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
        (0, serverState_1.addUser)(user.username, socket, role);
        socket.send(JSON.stringify({
            type: "AUTH_SUCCESS",
            role
        }));
        (0, logger_1.info)(`User authenticated: ${user.username} (${role})`);
    }
    catch (err) {
        (0, logger_1.error)(err.message);
        socket.send(JSON.stringify({
            type: "AUTH_FAILED",
            message: "Server error"
        }));
    }
}
async function handleTrack(data, { socket }) {
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
    const res = await (0, apiService_1.request)({
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
    (0, serverState_1.subscribeToFlight)(socket.user.username, flightId);
    (0, logger_1.info)(`${socket.user.username} tracking ${flightId}`);
    socket.send(JSON.stringify({
        type: "TRACK_SUCCESS",
        flightId
    }));
}
async function handleDispatch(data, { socket }) {
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
    const res = await (0, apiService_1.request)({
        type: "DispatchFlight",
        api_key: socket.user.api_key,
        flight_id: data.flightId
    });
    console.log("Dispatch API response:", res);
    if (res.status === "success") {
        (0, serverState_1.subscribeToFlight)(socket.user.username, data.flightId);
        void startFlightSimulation(data.flightId, socket.user.api_key, socket);
        const flightRes = await (0, apiService_1.request)({
            type: "GetFlight",
            api_key: socket.user.api_key,
            flight_id: data.flightId
        });
        if (flightRes.status === "success") {
            const passengers = flightRes.data.passengers || [];
            passengers.forEach((p) => {
                const s = (0, serverState_1.getSocket)(p.username);
                if (s?.readyState === ws_1.default.OPEN) {
                    s.send(JSON.stringify({
                        type: "BOARDING_CALL",
                        flightId: data.flightId
                    }));
                }
            });
        }
        else {
            socket.send(JSON.stringify({
                type: "ERROR",
                message: flightRes.message || "Flight dispatched, but passenger boarding calls could not be sent."
            }));
        }
        if (socket.readyState === ws_1.default.OPEN) {
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
async function startFlightSimulation(flightId, apiKey, controllerSocket) {
    const reportFailure = (message) => {
        (0, logger_1.error)(message);
        if (controllerSocket.readyState === ws_1.default.OPEN) {
            controllerSocket.send(JSON.stringify({ type: "ERROR", message }));
        }
    };
    const currentTimer = flightSimulationTimers.get(flightId);
    if (currentTimer)
        clearInterval(currentTimer);
    try {
        const response = await (0, apiService_1.request)({
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
        if (!origin
            || !destination
            || typeof durationHours !== "number"
            || !Number.isFinite(durationHours)
            || durationHours <= 0) {
            throw new Error("Flight route coordinates or duration are invalid.");
        }
        const durationMilliseconds = Math.max(durationHours * 1000, FLIGHT_SIMULATION_TICK_MS);
        const startTime = Date.now();
        let updateInProgress = false;
        let reportedPersistenceFailure = false;
        let timer;
        const updatePosition = async () => {
            if (updateInProgress)
                return;
            updateInProgress = true;
            try {
                const progress = Math.min((Date.now() - startTime) / durationMilliseconds, 1);
                const position = interpolateGreatCircle(origin, destination, progress);
                const status = progress >= 1 ? "Landed" : "In Flight";
                (0, serverState_1.getFlightSubscribers)(flightId).forEach((clientId) => {
                    const clientSocket = (0, serverState_1.getSocket)(clientId);
                    if (clientSocket?.readyState === ws_1.default.OPEN) {
                        clientSocket.send(JSON.stringify({
                            type: "FLIGHT_UPDATE",
                            flightId,
                            latitude: position.latitude,
                            longitude: position.longitude,
                            status
                        }));
                    }
                });
                const updateResponse = await (0, apiService_1.request)({
                    type: "UpdateFlightPosition",
                    server_key: process.env.SERVER_KEY,
                    flight_id: flightId,
                    latitude: position.latitude,
                    longitude: position.longitude,
                    status
                });
                if (updateResponse.status !== "success") {
                    if (!reportedPersistenceFailure) {
                        reportFailure(`Flight ${flightId} is moving, but its position could not be saved: ${updateResponse.message || "position update was rejected."}`);
                        reportedPersistenceFailure = true;
                    }
                }
                else {
                    reportedPersistenceFailure = false;
                }
                if (progress >= 1) {
                    clearInterval(timer);
                    flightSimulationTimers.delete(flightId);
                    (0, logger_1.info)(`Flight ${flightId} landed. Simulation stopped.`);
                }
            }
            catch (simulationError) {
                if (!reportedPersistenceFailure) {
                    reportFailure(`Flight ${flightId} is moving, but its position could not be saved: ${simulationError instanceof Error ? simulationError.message : "unknown error"}`);
                    reportedPersistenceFailure = true;
                }
            }
            finally {
                updateInProgress = false;
            }
        };
        timer = setInterval(() => {
            void updatePosition();
        }, FLIGHT_SIMULATION_TICK_MS);
        flightSimulationTimers.set(flightId, timer);
        void updatePosition();
    }
    catch (simulationError) {
        reportFailure(`Unable to start simulation for flight ${flightId}: ${simulationError instanceof Error ? simulationError.message : "unknown error"}`);
    }
}
async function handleBoard(data, { socket }) {
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
    const res = await (0, apiService_1.request)({
        type: "BoardFlight",
        api_key: socket.user.api_key,
        flight_id: data.flightId
    });
    if (res.status === "success") {
        const atcSockets = (0, serverState_1.getFlightSubscribers)(data.flightId);
        atcSockets.forEach((id) => {
            const s = (0, serverState_1.getSocket)(id);
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
function initSocketServer(port, host = "0.0.0.0") {
    const wss = new ws_1.default.Server({ port, host });
    (0, logger_1.info)(`WebSocket server started on ${host}:${port}`);
    wss.on("connection", (socket) => {
        (0, logger_1.info)("New connection");
        let username = null;
        const context = {
            socket,
            get username() {
                return username;
            },
            setUsername: (name) => {
                username = name;
            }
        };
        socket.on("message", (message) => {
            try {
                const data = JSON.parse(message.toString());
                if (!data.type)
                    return;
                handleMessage(data.type, data, context);
            }
            catch {
                (0, logger_1.error)("Invalid JSON received");
            }
        });
        socket.on("close", () => {
            if (username)
                (0, serverState_1.removeUser)(username);
        });
        socket.on("error", (err) => {
            (0, logger_1.error)(err.message);
        });
    });
    return wss;
}
