import { Router } from 'express';
import { createBatchJobs, getBatchJob } from '../controllers/batch.controller.js';

const router = Router();

router.post('/create', createBatchJobs);
router.get('/:jobId', getBatchJob);

export default router;
