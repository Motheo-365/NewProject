"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.request = request;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const API_BASE_URL = (process.env.FLIGHT_API_URL ?? "https://newproject-2wyo.onrender.com/api").replace(/\/+$/, "");
function getRequestConfig(payload) {
    const apiKey = payload.api_key;
    const authorization = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
    switch (payload.type) {
        case "Me":
            return {
                method: "GET",
                url: `${API_BASE_URL}/auth/me`,
                headers: authorization,
            };
        case "GetFlight":
            if (payload.flight_id === undefined) {
                throw new Error("GetFlight requires flight_id.");
            }
            return {
                method: "GET",
                url: `${API_BASE_URL}/flights/${encodeURIComponent(String(payload.flight_id))}`,
                headers: authorization,
            };
        case "DispatchFlight":
            return {
                method: "POST",
                url: `${API_BASE_URL}/flights/dispatch`,
                headers: authorization,
                data: { flight_id: payload.flight_id },
            };
        case "BoardFlight":
            return {
                method: "POST",
                url: `${API_BASE_URL}/flights/board`,
                headers: authorization,
                data: { flight_id: payload.flight_id },
            };
        case "UpdateFlightPosition":
            return {
                method: "POST",
                url: `${API_BASE_URL}/flights/position`,
                headers: authorization,
                data: {
                    flight_id: payload.flight_id,
                    latitude: payload.latitude,
                    longitude: payload.longitude,
                    status: payload.status,
                },
            };
        default:
            throw new Error(`Unsupported API request type: ${payload.type}`);
    }
}
async function request(payload) {
    try {
        const response = await axios_1.default.request({
            ...getRequestConfig(payload),
            validateStatus: () => true,
        });
        if (typeof response.data === "object"
            && response.data !== null
            && (response.data.status === "success" || response.data.status === "error")) {
            return response.data;
        }
        return {
            status: "error",
            message: `Flight API returned an unexpected response (${response.status}).`,
        };
    }
    catch (requestError) {
        const axiosError = requestError;
        if (axiosError.response?.data) {
            return axiosError.response.data;
        }
        return {
            status: "error",
            message: requestError instanceof Error
                ? requestError.message
                : "Flight API request failed.",
        };
    }
}
