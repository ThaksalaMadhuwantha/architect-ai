import express from 'express';
import { analyzeCodeWithAI } from '../controllers/aiController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/analyze', protect, analyzeCodeWithAI);

export default router;
