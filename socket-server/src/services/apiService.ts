import axios, { AxiosResponse, AxiosError } from "axios";
import dotenv from "dotenv";

dotenv.config();

export const DB_API_URL = "https://newproject-2wyo.onrender.com/";

// Define a general structure for your API payloads and responses
export interface ApiPayload {
    type: string;
    api_key?: string;
    server_key?: string;
    flight_id?: string | number;
    [key: string]: any; // Allows additional dynamic properties
}

export interface ApiResponse {
    status: "success" | "error";
    message?: string;
    data?: any;
    [key: string]: any;
}

// Connect to PHP/Express API
export async function request(payload: ApiPayload): Promise<ApiResponse> {
    try {
        const response: AxiosResponse<ApiResponse> = await axios.post(DB_API_URL, payload, {
            headers: {
                "Content-Type": "application/json",
            },
        });

        return response.data;
    } catch (err: unknown) {
        const error = err as AxiosError<ApiResponse>;
        
        console.log("[API ERROR]", error.message);

        // THIS IS THE IMPORTANT PART - Safely handle Axios error responses
        if (error.response && error.response.data) {
            console.log("[API RESPONSE]", error.response.data);
            return error.response.data;
        }

        return {
            status: "error",
            message: error.message || "API request failed",
        };
    }
}