"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMe = exports.login = void 0;
const node_crypto_1 = require("node:crypto");
const db_1 = __importDefault(require("../config/db"));
const response_1 = require("../utils/response");
const bcrypt_1 = __importDefault(require("bcrypt"));
async function getOrCreateAccountApiKey(userId) {
    const client = await db_1.default.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query('SELECT api_key FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const storedKey = result.rows[0]?.api_key;
        let apiKey = typeof storedKey === 'string' ? storedKey.trim() : '';
        if (!/^[a-f\d]{64}$/i.test(apiKey)) {
            apiKey = '';
        }
        else {
            const duplicate = await client.query('SELECT 1 FROM users WHERE api_key = $1 AND id <> $2 LIMIT 1', [apiKey, userId]);
            if (duplicate.rows.length > 0)
                apiKey = '';
        }
        if (!apiKey) {
            apiKey = (0, node_crypto_1.randomBytes)(32).toString('hex');
            const update = await client.query('UPDATE users SET api_key = $1 WHERE id = $2 RETURNING api_key', [apiKey, userId]);
            if (typeof update.rows[0]?.api_key !== 'string') {
                throw new Error('Unable to save the account API key.');
            }
        }
        await client.query('COMMIT');
        return apiKey;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
const login = async (req, res) => {
    const { email, password } = req.body;
    if (typeof email !== 'string' || !email.trim()) {
        return (0, response_1.sendResponse)(res, 'error', 'Email address is required.', null, 400);
    }
    if (typeof password !== 'string' || !password) {
        return (0, response_1.sendResponse)(res, 'error', 'Password is required.', null, 400);
    }
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return (0, response_1.sendResponse)(res, 'error', 'Enter a valid email address.', null, 400);
    }
    try {
        const query = 'SELECT id, username, type, api_key, password FROM users WHERE LOWER(email) = LOWER($1)';
        const result = await db_1.default.query(query, [normalizedEmail]);
        if (result.rows.length === 0) {
            return (0, response_1.sendResponse)(res, 'error', 'No account is registered with this email address.', null, 401);
        }
        const user = result.rows[0];
        const passwordMatch = password === user.password
            || (typeof user.password === 'string' && await bcrypt_1.default.compare(password, user.password));
        if (!passwordMatch) {
            return (0, response_1.sendResponse)(res, 'error', 'The password is incorrect.', null, 401);
        }
        const apiKey = await getOrCreateAccountApiKey(user.id);
        return (0, response_1.sendResponse)(res, 'success', 'Login successful', {
            username: user.username,
            type: user.type,
            api_key: apiKey,
        });
    }
    catch (err) {
        console.error('Login verification failed:', err);
        return (0, response_1.sendResponse)(res, 'error', 'Unable to verify your login right now. Please try again later.', null, 500);
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
