"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAirports = void 0;
const db_1 = __importDefault(require("../config/db"));
const response_1 = require("../utils/response");
const getAirports = async (req, res) => {
    try {
        const query = 'SELECT id, name, code, city, country, latitude, longitude FROM airports';
        const result = await db_1.default.query(query);
        if (result.rows.length === 0) {
            return (0, response_1.sendResponse)(res, 'error', 'no airports found', null, 400);
        }
        const airports = result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            code: row.code,
            city: row.city,
            country: row.country,
            coordinates: {
                latitude: parseFloat(row.latitude),
                longitude: parseFloat(row.longitude),
            },
        }));
        return (0, response_1.sendResponse)(res, 'success', 'airports retrieved successfully', airports);
    }
    catch (err) {
        return (0, response_1.sendResponse)(res, 'error', err.message, null, 500);
    }
};
exports.getAirports = getAirports;
