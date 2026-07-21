import { Router } from 'express';
import multer from 'multer';
import { uploadPdf } from '../controllers/uploadController';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post('/', upload.single('file'), uploadPdf);

export default router;
