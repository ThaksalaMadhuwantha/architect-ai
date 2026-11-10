import express from 'express';
import { scanDependencies } from '../controllers/depsController.js';
import { protect } from '../middleware/authMiddleware.js';
import { parseLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/scan', protect, parseLimiter, scanDependencies);

export default router;
