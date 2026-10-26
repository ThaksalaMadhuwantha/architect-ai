import express from 'express';
import multer from 'multer';
import { parseZipFile } from '../controllers/parserController.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.single('file'), parseZipFile);

export default router;