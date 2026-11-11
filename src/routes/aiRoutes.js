import express from 'express';
import { analyzeCodeWithAI, translateAnalysis, mentorFinding } from '../controllers/aiController.js';
import { protect } from '../middleware/authMiddleware.js';
import { aiLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/analyze', protect, aiLimiter, analyzeCodeWithAI);
router.post('/translate', protect, aiLimiter, translateAnalysis);
router.post('/mentor', protect, aiLimiter, mentorFinding);

export default router;
