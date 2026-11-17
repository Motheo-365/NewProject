"use strict";
// Authenticates the user against the database
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const db_1 = __importDefault(require("../config/db"));
const response_1 = require("../utils/response");
const authenticate = async (req, res, next) => {
    const apiKey = req.body.api_key || req.query.api_key || req.headers['authorization']?.replace('Bearer ', '');
    if (!apiKey) {
        return (0, response_1.sendResponse)(res, 'error', 'missing api key', null, 401);
    }
    try {
        const query = 'SELECT id, username, type FROM users WHERE api_key = $1';
        const result = await db_1.default.query(query, [apiKey]);
        if (result.rows.length === 0) {
            return (0, response_1.sendResponse)(res, 'error', 'invalid api key', null, 401);
        }
        const user = result.rows[0];
        req.user = {
            ...user,
            type: typeof user.type === 'string' ? user.type.trim().toUpperCase() : user.type,
        };
        next();
    }
    catch (err) {
        return (0, response_1.sendResponse)(res, 'error', 'Authentication error: ' + err.message, null, 500);
    }
};
exports.authenticate = authenticate;
