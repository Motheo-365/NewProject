"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const flightController_1 = require("../controllers/flightController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Authenticated routes
router.get('/', auth_1.authenticate, flightController_1.getAllFlights);
router.get('/:id', auth_1.authenticate, flightController_1.getFlight);
router.post('/dispatch', auth_1.authenticate, flightController_1.dispatchFlight);
router.post('/board', auth_1.authenticate, flightController_1.boardFlight);
router.post('/position', auth_1.authenticate, flightController_1.updateFlightPosition);
exports.default = router;
