import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './src/routes/authRoutes';
import airportRoutes from './src/routes/airportRoutes';
import flightRoutes from './src/routes/flightRoutes';
import { sendResponse } from './src/utils/response';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Register API Route Groups
app.use('/api/auth', authRoutes);
app.use('/api/airports', airportRoutes);
app.use('/api/flights', flightRoutes);

// Global Error Handler Middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  sendResponse(res, 'error', err.message || 'Internal Server Error', null, 500);
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});