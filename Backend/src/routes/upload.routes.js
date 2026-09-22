// ---------------------------------------------------------------------------
// CSV upload routes.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import upload, { assignUploadId } from '../middleware/upload.js';
import { uploadCsv } from '../controllers/upload.controller.js';

const router = Router();

// POST /api/upload/csv
router.post('/csv', assignUploadId, upload.single('file'), uploadCsv);

export default router;
