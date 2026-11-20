import express from 'express';
import multer from 'multer';
import { parseZipFile, parseGithubRepo } from '../controllers/parserController.js';
import { protect } from '../middleware/authMiddleware.js';
import { parseLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

// ZIP එකක් පමණයි, උපරිම 50MB, එක file එකයි
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/\.zip$/i.test(file.originalname)) return cb(null, true);
    const err = new Error('ZIP file එකක් පමණක් upload කරන්න.');
    err.status = 400;
    err.expose = true;
    cb(err);
  },
});

router.post('/upload', protect, parseLimiter, upload.single('file'), parseZipFile);
router.post('/github', protect, parseLimiter, parseGithubRepo);

export default router;
