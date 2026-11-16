"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const airportController_1 = require("../controllers/airportController");
const router = (0, express_1.Router)();
// GET /api/airports
router.get('/', airportController_1.getAirports);
exports.default = router;
