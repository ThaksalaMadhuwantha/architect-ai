import express from 'express';
import { analyzeCodeWithAI } from '../controllers/aiController.js';

const router = express.Router();

router.post('/analyze', analyzeCodeWithAI);

export default router;