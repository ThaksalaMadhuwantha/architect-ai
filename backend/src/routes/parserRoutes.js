import express from 'express';
import multer from 'multer';
import { parseZipFile, parseGithubRepo } from '../controllers/parserController.js';
import { createFixPullRequest } from '../controllers/githubPushController.js';
import { protect } from '../middleware/authMiddleware.js';
import { parseLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/upload', protect, parseLimiter, upload.single('file'), parseZipFile);
router.post('/github', protect, parseLimiter, parseGithubRepo);
router.post('/push-pr', protect, parseLimiter, createFixPullRequest);

export default router;