import { Router } from 'express';
import { getAirports } from '../controllers/airportController';

const router = Router();

// GET /api/airports
router.get('/', getAirports);

export default router;