import express from 'express';
import multer from 'multer';
import { parseZipFile, parseGithubRepo } from '../controllers/parserController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/upload', protect, upload.single('file'), parseZipFile);
router.post('/github', protect, parseGithubRepo);

export default router;
