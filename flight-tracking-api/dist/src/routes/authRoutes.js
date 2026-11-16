"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// POST /api/auth/login
router.post('/login', authController_1.login);
// GET /api/auth/me (Requires API key authentication)
router.get('/me', auth_1.authenticate, authController_1.getMe);
exports.default = router;
