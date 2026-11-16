"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.login = void 0;
const db_1 = __importDefault(require("../config/db"));
const response_1 = require("../utils/response");
const bcrypt_1 = __importDefault(require("bcrypt"));
const login = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return (0, response_1.sendResponse)(res, 'error', 'Missing username or password', null, 400);
    }
    try {
        const query = 'SELECT id, username, type, api_key, password FROM users WHERE username = $1';
        const result = await db_1.default.query(query, [username]);
        if (result.rows.length === 0) {
            return (0, response_1.sendResponse)(res, 'error', 'Invalid username or password', null, 401);
        }
        const user = result.rows[0];
        // Check plaintext or hashed password
        const passwordMatch = password === user.password || (await bcrypt_1.default.compare(password, user.password));
        if (!passwordMatch) {
            return (0, response_1.sendResponse)(res, 'error', 'Invalid username or password', null, 401);
        }
        return (0, response_1.sendResponse)(res, 'success', 'Login successful', {
            username: user.username,
            type: user.type,
            api_key: user.api_key,
        });
    }
    catch (err) {
        return (0, response_1.sendResponse)(res, 'error', err.message, null, 500);
    }
};
exports.login = login;
const getMe = async (req, res) => {
    const user = req.user;
    return (0, response_1.sendResponse)(res, 'success', 'user', {
        id: user?.id,
        username: user?.username,
        type: user?.type,
    });
};
exports.getMe = getMe;
