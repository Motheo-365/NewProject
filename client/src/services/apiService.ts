import type { ApiResponse, Flight, FlightsData, User, LoginResponse } from '../interfaces/api';

/* 
  Provides HTTP communication between the application and the backend API.

  This service:
  - Authenticates users
  - Retrieves user information
  - Retrieves flight information
  - Parses API responses and handles invalid JSON.
*/
export class ApiService {
  private readonly API_URL: string = "http://localhost:3000/api";

  /*
    Generic Helper.
    Parses an HTTP response and converts it into JSON.
    Throws an error if the server returns invalid JSON.
  */
  private async parseJsonResponse<T>(res: Response): Promise<T> {
    const text = await res.text();

    if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
      throw new Error('The API returned a non-JSON response. Check that the deployed API URL points directly to the correct endpoint and is not behind an anti-bot page.');
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Server returned invalid JSON: ${text}`);
    }
  }

  /*
    Authenticates a user using their username and password.
    Throws an error if authentication fails.
  */
  async login(username: string, password: string): Promise<ApiResponse<LoginResponse>> {
    let res: Response;

    try {
      res = await fetch(`${this.API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          password
        })
      });
    } catch {
      throw new Error(`Unable to reach the login API at ${this.API_URL}/auth/login. Check the API deployment and CORS configuration.`);
    }

    if (!res.ok) {
      const text = await res.text();
      let payload: unknown;

      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }

      const payloadRecord =
        typeof payload === 'object' && payload !== null
          ? payload as Record<string, unknown>
          : null;
      const errorText =
        typeof payloadRecord?.message === 'string'
          ? payloadRecord.message
          : typeof payloadRecord?.data === 'string'
            ? payloadRecord.data
            : text;

      throw new Error(errorText || `Login failed (${res.status})`);
    }

    return await this.parseJsonResponse<ApiResponse<LoginResponse>>(res);
  }

  // Retrieves information about the currently authenticated user
  async me(apiKey: string): Promise<ApiResponse<User>> {
    const res = await fetch(`${this.API_URL}/auth/me`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      }
    });

    return await this.parseJsonResponse<ApiResponse<User>>(res);
  }

  // Retrieves all flights that the current user is authorised to view.
  async getFlights(apiKey: string): Promise<ApiResponse<FlightsData>> {
    const res = await fetch(`${this.API_URL}/flights`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      }
    });

    return await this.parseJsonResponse<ApiResponse<FlightsData>>(res);
  }

  // Retrieves detailed information for a specific flight.
  async getFlight(apiKey: string, flightId: number): Promise<ApiResponse<Flight>> {
    const res = await fetch(`${this.API_URL}/flights/${flightId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      }
    });

    return await this.parseJsonResponse<ApiResponse<Flight>>(res);
  }
}

export const apiService = new ApiService();