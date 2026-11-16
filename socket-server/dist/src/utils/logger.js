"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.format = format;
exports.info = info;
exports.warn = warn;
exports.error = error;
exports.debug = debug;
/*
    Formats a log message with a timestamp and log level
    Format: [timestamp] [LEVEL] message
*/
function format(level, message) {
    const time = new Date().toISOString();
    return `[${time}] [${level.toUpperCase()}] ${message}`;
}
// Logs an informational message to the console.
function info(message) {
    console.log(format("info", message));
}
// Logs a warning message to the console
function warn(message) {
    console.log(format("warn", message));
}
// Logs an error message to the console
function error(message) {
    console.log(format("error", message));
}
// Logs a debug message when debug mode is enabled
function debug(message) {
    const debugEnabled = globalThis.process?.env?.DEBUG === "true";
    if (debugEnabled) {
        console.log(format("debug", message));
    }
}
