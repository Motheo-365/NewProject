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

// Flight tracking position update (typically called by an external tracking script/server using a secret key in body)
router.post('/position', updateFlightPosition);

// Authenticated routes
router.get('/', authenticate, getAllFlights);
router.get('/:id', authenticate, getFlight);
router.post('/dispatch', authenticate, dispatchFlight);
router.post('/board', authenticate, boardFlight);

export default router;