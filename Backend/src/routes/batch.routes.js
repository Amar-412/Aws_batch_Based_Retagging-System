import { Router } from 'express';
import { createBatchJobs, downloadBatchReport, getBatchJob, listBatchJobs } from '../controllers/batch.controller.js';

const router = Router();

router.get('/jobs', listBatchJobs);
router.post('/create', createBatchJobs);
router.get('/:jobId/report', downloadBatchReport);
router.get('/:jobId', getBatchJob);

export default router;
