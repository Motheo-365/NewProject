"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
if (!process.env.SUPABASE_CONNECTION_STRING) {
    throw new Error('SUPABASE_CONNECTION_STRING is not defined in environment variables');
}
const pool = new pg_1.Pool({
    connectionString: process.env.SUPABASE_CONNECTION_STRING,
    ssl: {
        rejectUnauthorized: false,
    },
});
pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
});
exports.default = pool;
