import { Router } from 'express';
import { 
  getAllFlights, 
  getFlight, 
  dispatchFlight, 
  updateFlightPosition, 
  boardFlight 
} from '../controllers/flightController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Authenticated routes
router.get('/', authenticate, getAllFlights);
router.get('/:id', authenticate, getFlight);
router.post('/dispatch', authenticate, dispatchFlight);
router.post('/board', authenticate, boardFlight);
router.post('/position', authenticate, updateFlightPosition);

export default router;