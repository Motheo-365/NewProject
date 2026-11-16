/* 
   Entry point for the WebSocket server application

   This file:
   - Determines which port the server should use
   - Validates command-line and environment configuration
   - Starts the WebSocket server
   - Initialises the CLI when running in an interactive terminal
*/

import { initSocketServer } from "./src/sockets/socketServer";
import { handleCommand } from "./src/cli/cliHandler";
import * as readline from "readline";

// ==================== PORTS ===============================

// Is port number argument within the valid user application port range
function isValidPort(port: string | number): boolean {
    const num = Number(port);
    return Number.isInteger(num) && num >= 1 && num <= 65535;
}

// Retrieve port number supplied through the command line.
// The application exits if the provided port is invalid
function getPortFromCli(): number | null {
    const cliPort = process.argv[2];

    if (cliPort && !isValidPort(cliPort)) {
        console.log("[ERROR] Invalid CLI port. Must be between 1 and 65535.");
        process.exit(1);
    }

    if (cliPort && isValidPort(cliPort)) {
        return Number(cliPort);
    }

    return null;
}

/*
   Determines which port the server should use.

   Priority:
   1. Command-line argument
   2. Environment Variable
   3. Manual user input or default port
*/
function getPort(): number | null {
    const cliPort = getPortFromCli();
    if (cliPort) return cliPort;

    const envPort = process.env.PORT;
    if (envPort) {
        const parsedPort = Number(envPort);
        if (!isValidPort(parsedPort)) {
            console.log("[ERROR] Invalid PORT environment variable. Must be between 1 and 65535.");
            process.exit(1);
        }

        return parsedPort;
    }

    return null;
}

/*
   Starts WebSocket server and, when available, initialises the interactive command-line interface.
*/
function startApp(port: number): void {
    const host = process.env.HOST || "0.0.0.0";
    initSocketServer(port, host); // Start WebSocket Server

    // Enable the CLI only when running in an interactive terminal
    if (process.stdin.isTTY) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        console.log("[SERVER] CLI ready. Type a command:\n");

        // Process commands entered on the CLI
        rl.on("line", (input: string) => {
            const trimmedInput = input.trim();
            if (!trimmedInput) return;

            try {
                handleCommand(trimmedInput);
            } catch (err: unknown) {
                if (err instanceof Error) {
                    console.log("[CLI ERROR]", err.message);
                } else {
                    console.log("[CLI ERROR]", String(err));
                }
            }
        });

        // Shutdown the server when the CLI session ends.
        rl.on("close", () => {
            console.log("\n[SERVER] Shutting down...");
            process.exit(0);
        });
    } else {
        // Skip CLI initialisation when running in a non-interactive environment
        console.log("[SERVER] Running in non-interactive mode. WebSocket server active.");
    }
}

// determine which port should be used when application starts
const port = getPort();

if (port) {
    startApp(port);
} else if (process.stdin.isTTY) {
    // Prompt the user for a port if none was provided
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question("Enter port (1024–49151): ", (answer: string) => {
        rl.close();

        if (!isValidPort(answer)) {
            console.log("[ERROR] Invalid port. Server not started.");
            process.exit(1);
        }

        startApp(Number(answer));
    });
} else {
    // use default port when running without user interaction
    startApp(8080);
}