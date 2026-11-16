type LogLevel = "info" | "warn" | "error" | "debug";

/*
    Formats a log message with a timestamp and log level
    Format: [timestamp] [LEVEL] message
*/
export function format(level: LogLevel, message: string): string {
    const time: string = new Date().toISOString();
    return `[${time}] [${level.toUpperCase()}] ${message}`;
}

// Logs an informational message to the console.
export function info(message: string): void {
    console.log(format("info", message));
}

// Logs a warning message to the console
export function warn(message: string): void {
    console.log(format("warn", message));
}

// Logs an error message to the console
export function error(message: string): void {
    console.log(format("error", message));
}

// Logs a debug message when debug mode is enabled
export function debug(message: string): void {
    const debugEnabled = (globalThis as typeof globalThis & {
        process?: { env?: { DEBUG?: string } };
    }).process?.env?.DEBUG === "true";
    if (debugEnabled) {
        console.log(format("debug", message));
    }
}