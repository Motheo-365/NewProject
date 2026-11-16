"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const authRoutes_1 = __importDefault(require("./src/routes/authRoutes"));
const airportRoutes_1 = __importDefault(require("./src/routes/airportRoutes"));
const flightRoutes_1 = __importDefault(require("./src/routes/flightRoutes"));
const response_1 = require("./src/utils/response");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Register API Route Groups
app.use('/api/auth', authRoutes_1.default);
app.use('/api/airports', airportRoutes_1.default);
app.use('/api/flights', flightRoutes_1.default);
// Global Error Handler Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    (0, response_1.sendResponse)(res, 'error', err.message || 'Internal Server Error', null, 500);
});
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
