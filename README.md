# Flight Tracking System

A real-time flight operations platform that connects air traffic controllers (ATCs) and passengers through live flight tracking, dispatch management, and passenger boarding workflows.

The application combines a **React and TypeScript frontend**, a **Node.js and Express REST API**, a **PostgreSQL database**, and a dedicated **WebSocket server** to deliver live flight updates and operational events.

## Overview

The Flight Tracking System provides two role-specific experiences:

- **Air Traffic Controllers:** Manage flight operations, dispatch flights, monitor passenger boarding, and track aircraft in real time.
- **Passengers:** View booked flights, receive boarding notifications, confirm boarding, and follow their flights on an interactive map.

The system uses a central API for authentication, authorization, and persistent flight data, while WebSockets handle live communication between connected clients.

## Features

### Flight operations
- Role-based authentication for ATCs and passengers.
- Separate dashboards with account-specific flight access.
- Flight dispatch and passenger boarding workflows.
- A server-enforced 60-second boarding window.
- Passenger boarding confirmations and no-show handling.
- Flight status management from scheduled departure through landing.

### Real-time tracking
- Live aircraft position and flight progress updates.
- WebSocket-based event broadcasting.
- Interactive Leaflet map with airport markers and flight routes.
- Animated aircraft marker with a camera that follows the aircraft.
- Multiple simultaneous WebSocket sessions, including multiple sessions for the same account.

### ATC monitoring
- Flight filtering and operational details.
- Passenger boarding status monitoring.
- Live connected-user count and session information.
- Server-side flight status and position management.

## Technology Stack

| Area | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Mapping | Leaflet, OpenStreetMap |
| Backend API | Node.js, Express |
| Real-time communication | WebSockets |
| Database | PostgreSQL, Supabase |
| Authentication | API-key authentication |
| Development | npm, TypeScript |

## System Architecture

The application is separated into three main services:

```text
                   Browser Client
                  (React + TypeScript)
                         |
              +----------+----------+
              |                     |
           HTTP API              WebSocket
              |                     |
              v                     v
       Express Flight API     Flight Socket Server
              |                     |
              v                     |
          PostgreSQL <--------------+
           / Supabase          API requests
```

### Project structure

| Component | Directory | Responsibility |
|---|---|---|
| Browser client | `client/` | User interface, authentication, dashboards, flight controls, and interactive map |
| Flight API | `flight-tracking-api/` | Authentication, authorization, flight operations, and database persistence |
| WebSocket server | `socket-server/` | Live connections, event broadcasting, flight simulation, and user presence |

The REST API acts as the central source of persistent application data. The WebSocket server communicates with the API to perform authorized operations and distribute real-time updates.

## Application Workflows

### Air Traffic Controller

1. Sign in using an ATC account.
2. View and filter available flights.
3. Select a flight to inspect its route and operational information.
4. Dispatch a scheduled flight.
5. Monitor passenger boarding confirmations.
6. Track the aircraft and observe live position updates.
7. Monitor connected users through the ATC dashboard.

### Passenger

1. Sign in using a Passenger account.
2. View flights associated with the passenger's bookings.
3. Select a flight to view its route and status.
4. Receive a boarding notification when the flight is dispatched.
5. Confirm boarding before the boarding window expires.
6. Follow the aircraft's progress on the interactive map.
7. Receive the final landing notification.

## Flight Lifecycle

Flight transitions are controlled by the backend rather than independently managed by the browser.

```text
Scheduled
    |
    | ATC dispatch
    v
Boarding
    |
    | 60-second boarding window expires
    v
In Flight
    |
    | Aircraft reaches destination
    v
Landed
```

### Lifecycle behaviour

- **Scheduled:** The flight is awaiting dispatch.
- **Boarding:** An ATC dispatches the flight, and the API records its `dispatched_at` timestamp.
- **In Flight:** Once the 60-second boarding window expires, the first valid position update transitions the flight into the active flight state. Passengers who did not board are recorded as no-shows.
- **Landed:** When the aircraft reaches its destination, the API updates the flight status and the WebSocket server broadcasts a landing event.

### Flight simulation

Aircraft movement is calculated on the WebSocket server using the flight's origin and destination coordinates.

The simulation:

1. Calculates flight progress based on elapsed simulation time.
2. Interpolates the aircraft's position along the route using great-circle interpolation.
3. Sends position updates to the REST API for persistence.
4. Broadcasts the saved position and progress to subscribed clients.
5. Stops the simulation when the flight reaches its destination.

The simulation speed is configurable through `SIMULATED_SECONDS_PER_FLIGHT_HOUR` in:

`socket-server/src/sockets/socketServer.ts`

The browser uses the received position and progress updates to animate the aircraft marker. It does not independently simulate flight movement.

The boarding window and simulation duration are separate mechanisms.

## Real-Time Communication

The WebSocket server handles authenticated client connections and distributes flight events to subscribed sessions.

### Client messages

| Message | Purpose |
|---|---|
| `AUTH` | Authenticate a WebSocket connection using an account API key |
| `TRACK` | Subscribe to updates for an accessible flight |
| `DISPATCH` | Request flight dispatch (ATC only) |
| `BOARD` | Confirm passenger boarding |

### Server messages

| Message | Purpose |
|---|---|
| `AUTH_SUCCESS` | Confirm successful authentication |
| `AUTH_FAILED` | Report authentication failure |
| `TRACK_SUCCESS` | Confirm a tracking subscription |
| `DISPATCH_RESULT` | Return the result of a dispatch operation |
| `BOARD_RESULT` | Return the result of a boarding operation |
| `BOARDING_CALL` | Notify booked passengers that boarding has started |
| `BOARDING_CONFIRMED` | Notify ATC that a passenger has boarded |
| `POSITION` | Broadcast aircraft coordinates, progress, and flight status |
| `FLIGHT_LANDED` | Announce that a flight has landed |
| `CONNECTED_USERS` | Provide live connection and presence information to ATC |
| `ERROR` | Report an operation or connection error |
| `KILLED` | Notify a client that its connection has been terminated |
| `SHUTDOWN` | Notify clients that the socket server is shutting down |

Multiple active sessions are supported for the same username. Flight subscriptions and connected-user presence are maintained by the WebSocket server.

## HTTP API

All endpoints are prefixed with `/api`.

Protected endpoints use the account API key through the following authorization header:

```http
Authorization: Bearer <api-key>
```

### Available endpoints

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/auth/login` | Public | Authenticate using email and password |
| `GET` | `/auth/me` | Authenticated | Validate an API key and retrieve account information |
| `GET` | `/airports` | Public | Retrieve airport information and coordinates |
| `GET` | `/flights` | Authenticated | Retrieve flights according to account role |
| `GET` | `/flights/:id` | Authenticated | Retrieve flight details |
| `POST` | `/flights/dispatch` | ATC | Dispatch a scheduled flight |
| `POST` | `/flights/board` | Passenger | Confirm passenger boarding |
| `POST` | `/flights/position` | ATC | Persist aircraft position and flight status |

API responses use a JSON envelope containing a status, message, and response data when available.

## Getting Started

### Requirements

- Node.js 22 LTS or later.
- npm.
- A PostgreSQL database accessible to the API.
- An existing database schema and provisioned user accounts.
- Internet access for OpenStreetMap tiles.

**Note:** Database migrations, seed data, and account provisioning are not included in this repository.

### 1. Clone the repository

```bash
git clone <repository-url>
cd <repository-directory>
```

The application contains three separate projects:

```text
client/
flight-tracking-api/
socket-server/
```

Install dependencies in each directory:

```bash
cd client
npm install

cd ../flight-tracking-api
npm install

cd ../socket-server
npm install
```

### 2. Configure the Flight API

Create a `.env` file inside `flight-tracking-api/`:

```dotenv
PORT=3000
SUPABASE_CONNECTION_STRING=postgresql://<user>:<password>@<host>:<port>/<database>
```

The database must already contain the tables and columns required by the API, including:

- `users`
- `airports`
- `flights`
- `passenger_flights`

### 3. Configure the WebSocket server

Create a `.env` file inside `socket-server/`:

```dotenv
PORT=8080
HOST=0.0.0.0
FLIGHT_API_URL=http://localhost:3000/api
API_KEY=<optional-api-key>
```

| Variable | Description |
|---|---|
| `PORT` | WebSocket server port; defaults to `8080` |
| `HOST` | Server host; defaults to `0.0.0.0` |
| `FLIGHT_API_URL` | Base URL of the Flight API |
| `API_KEY` | Optional key used by the `FLIGHT_STATUS` console command |

Browser WebSocket sessions authenticate using the API key belonging to the logged-in user. The optional server `API_KEY` is not a replacement for user authentication.

### 4. Configure the browser client

The client currently defines its service endpoints in source:

- HTTP API: `client/src/services/apiService.ts`
- WebSocket server: `client/src/connections/socket-server.ts`

For local development, configure the endpoints as:

```text
HTTP:      http://localhost:3000/api
WebSocket: ws://localhost:8080
```

For deployment, replace these with the deployed API and secure WebSocket (`wss://`) endpoints.

Do not use `localhost` for a remotely hosted browser client. It refers to the visitor's own computer.

### 5. Run the application

Start each service in a separate terminal.

**Terminal 1 — Flight API**

```bash
cd flight-tracking-api
npm run dev
```

**Terminal 2 — WebSocket server**

```bash
cd socket-server
npm run dev
```

**Terminal 3 — Browser client**

```bash
cd client
npm run dev
```

Open the local URL printed by Vite, normally:

```text
http://localhost:5173
```

### Production builds

Build the API:

```bash
cd flight-tracking-api
npm run build
npm start
```

Build the WebSocket server:

```bash
cd socket-server
npm run build
npm start
```

Build the frontend:

```bash
cd client
npm run build
npm run preview
```

The frontend production bundle is generated in `client/dist`.

## Server Console Commands

The WebSocket server supports the following commands when running in an interactive terminal:

| Command | Description |
|---|---|
| `FLIGHT_STATUS <flight-id>` | Retrieve flight information from the API |
| `KILL <username>` | Disconnect all active WebSocket sessions for a user |
| `QUIT` | Notify connected clients and shut down the server |

The `FLIGHT_STATUS` command requires the optional `API_KEY` environment variable.

## Validation

Run the following commands from their respective project directories.

**Frontend**

```bash
npm run lint
npm run build
```

**Flight API**

```bash
npm run build
```

**WebSocket server**

```bash
npm run build
```

The WebSocket server's `test` script is currently a placeholder; an automated test suite is not yet configured.

## Security and Technical Considerations

The application implements account-specific API-key authentication and role-based access restrictions. However, several deployment considerations remain:

- API keys are bearer credentials and must never be committed to source control.
- The browser stores its API key in a JavaScript-readable cookie with a 24-hour lifetime. This requires particular care around cross-site scripting (XSS).
- Production deployments must use HTTPS and secure WebSocket connections.
- The current API CORS configuration should be restricted to trusted origins.
- The PostgreSQL SSL configuration should be reviewed and tightened for production certificate validation.
- WebSocket connections, subscriptions, presence, and simulation timers are maintained in process memory. Multiple server instances would require shared coordination and protection against duplicate flight simulations.
- The repository does not include database migrations, automated account provisioning, or a complete deployment infrastructure.

These are known implementation and deployment considerations rather than guarantees of production readiness.

## Future Improvements

Potential areas for further development include:

- Persistent simulation scheduling and automatic recovery after server restarts.
- Shared WebSocket presence and subscription management across multiple instances.
- Automated backend and WebSocket integration tests.
- Environment-based frontend endpoint configuration.
- Improved session security and token management.
- Database migrations and automated development seed data.
- Monitoring and observability for flight operations.

## Project Focus

This project explores the design of a multi-service, real-time application, with particular emphasis on:

- Separating frontend, API, and WebSocket responsibilities.
- Implementing role-based authentication and authorization.
- Managing state transitions through backend validation.
- Handling concurrent WebSocket connections and subscriptions.
- Persisting and broadcasting live location updates.
- Integrating geospatial data with an interactive frontend map.