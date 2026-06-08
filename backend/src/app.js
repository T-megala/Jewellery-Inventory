import express from 'express';
import productRoutes from './routes/productRoutes.js';
import stockVerificationRoutes from './routes/stockVerificationRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

app.use(express.json());

app.use('/api/v1', productRoutes);
app.use('/api/v1', stockVerificationRoutes);

app.use(errorHandler);

export default app;
