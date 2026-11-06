import express from 'express';
import { analyzeCodeWithAI, translateAnalysis } from '../controllers/aiController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/analyze', protect, analyzeCodeWithAI);
router.post('/translate', protect, translateAnalysis);

export default router;
