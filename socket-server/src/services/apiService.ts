import axios, { AxiosError, type AxiosRequestConfig } from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_BASE_URL = (
    process.env.FLIGHT_API_URL ?? "https://newproject-2wyo.onrender.com/api"
).replace(/\/+$/, "");

export interface ApiPayload {
    type: string;
    api_key?: string;
    flight_id?: string | number;
    latitude?: number;
    longitude?: number;
    status?: string;
    [key: string]: unknown;
}

export interface ApiResponse {
    status: "success" | "error";
    message?: string;
    data?: unknown;
    timestamp?: number;
}

function getRequestConfig(
    payload: ApiPayload,
): AxiosRequestConfig {
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

export async function request(payload: ApiPayload): Promise<ApiResponse> {
    try {
        const response = await axios.request<ApiResponse>({
            ...getRequestConfig(payload),
            validateStatus: () => true,
        });

        if (
            typeof response.data === "object"
            && response.data !== null
            && (response.data.status === "success" || response.data.status === "error")
        ) {
            return response.data;
        }

        return {
            status: "error",
            message: `Flight API returned an unexpected response (${response.status}).`,
        };
    } catch (requestError: unknown) {
        const axiosError = requestError as AxiosError<ApiResponse>;
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
