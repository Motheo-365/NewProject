import type {
  ApiResponse,
  Flight,
  FlightsData,
  LoginRequest,
  LoginResponse,
  User,
} from '../interfaces/api';

/* 
  Provides HTTP communication between the application and the backend API.

  This service:
  - Authenticates users
  - Retrieves user information
  - Retrieves flight information
  - Parses API responses and handles invalid JSON.
*/
export class ApiService {
  private readonly API_URL = 'https://newproject-2wyo.onrender.com/api';

  private getErrorMessage(payload: unknown, fallback: string): string {
    const record =
      typeof payload === 'object' && payload !== null
        ? payload as Record<string, unknown>
        : null;
    const message =
      typeof record?.message === 'string'
        ? record.message
        : typeof record?.data === 'string'
          ? record.data
          : '';

    if (/missing username or password/i.test(message)) {
      return 'The hosted login API is outdated and still expects a username. Redeploy the API with email-based login enabled.';
    }

    return message || fallback;
  }

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
  async login(email: string, password: string): Promise<ApiResponse<LoginResponse>> {
    let res: Response;
    const requestBody: LoginRequest = { email, password };

    try {
      res = await fetch(`${this.API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
    } catch {
      throw new Error('Unable to reach the login service. Check your internet connection and try again.');
    }

    const text = await res.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(
        res.ok
          ? 'The login service returned an unreadable response. Please try again later.'
          : `The login service returned an unexpected error (${res.status}). Please try again later.`,
      );
    }

    if (!res.ok) {
      throw new Error(this.getErrorMessage(payload, `Login failed (${res.status}).`));
    }

    if (typeof payload !== 'object' || payload === null) {
      throw new Error('The login service returned an invalid response.');
    }

    const response = payload as Partial<ApiResponse<LoginResponse>> & {
      success?: boolean;
    };

    if (response.status !== 'success') {
      if (response.status === 'error' || response.success === false) {
        throw new Error(this.getErrorMessage(payload, 'The login service rejected the sign-in request.'));
      }

      throw new Error('The login service response was not recognized. Confirm that the deployed API supports email login.');
    }

    const user = response.data;
    if (
      typeof user !== 'object'
      || user === null
      || typeof user.username !== 'string'
      || typeof user.type !== 'string'
      || typeof user.api_key !== 'string'
      || !user.username
      || !user.api_key
    ) {
      throw new Error('The login service did not return a valid user profile. Please contact support.');
    }

    return response as ApiResponse<LoginResponse>;
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