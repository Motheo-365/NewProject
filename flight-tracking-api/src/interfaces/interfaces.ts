export interface Airports {
    id: number,
    name: string,
    city: string,
    country: string,
    code: string,
    longitude: number,
    latitude: number,
}

export interface Flights {
    id: number,
    flight_number: string,
    origin_airport_id: number,
    destination_airport_id: number,
    departure_time: Date,
    arrival_time: Date,
    actual_departure: Date|null,
    created_at: Date,
}

export interface PassengerFlights {
    id: number,
    user_id: number,
    flight_id: number,
    booking_reference: string,
    seat_number: string,
    status: FlightStatus,
    booked_at: Date,
}

export interface Users {
    id: number,
    name: string,
    surname: string,
    email: string,
    username: string,
    password: string,
    type: UserType,
    api_key: string,
}

enum FlightStatus {
    BOOKED = 'BOOKED',
    CHECKED_IN = 'CHECKED IN',
    Cancelled = 'CANCELLED',
    BOARDED = 'BOARDED',
    NO_SHOW = 'NO_SHOW'
}

enum UserType {
    PASSENGER = 'PASSENGER',
    ATC = 'ATC'
}