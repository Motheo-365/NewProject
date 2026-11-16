"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const authController_1 = require("./controllers/authController");
const airportController_1 = require("./controllers/airportController");
const auth_1 = require("./middleware/auth");
const response_1 = require("./utils/response");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Routes matching your previous request-type style or standard REST endpoints
app.post('/api/login', authController_1.login);
app.get('/api/me', auth_1.authenticate, authController_1.getMe);
app.get('/api/airports', airportController_1.getAirports);
// Global Error Handler Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    (0, response_1.sendResponse)(res, 'error', err.message || 'Internal Server Error', null, 500);
});
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
