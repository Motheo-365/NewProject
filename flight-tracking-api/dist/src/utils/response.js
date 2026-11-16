"use strict";
// A reusable response helper to handle responses
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendResponse = void 0;
const sendResponse = (res, status, message, data = null, code = 200) => {
    const responsePayload = {
        status,
        timestamp: Date.now(),
    };
    if (message)
        responsePayload.message = message;
    if (data !== null)
        responsePayload.data = data;
    return res.status(code).json(responsePayload);
};
exports.sendResponse = sendResponse;
