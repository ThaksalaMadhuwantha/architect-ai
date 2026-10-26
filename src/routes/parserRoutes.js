import express from 'express';
import multer from 'multer';
import { handleZipUpload } from '../controllers/parserController.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.single('projectZip'), handleZipUpload);

export default router;