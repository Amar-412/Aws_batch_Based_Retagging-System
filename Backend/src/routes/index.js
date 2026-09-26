// ---------------------------------------------------------------------------
// Root API router. Aggregates feature routers under /api.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import healthRoutes from './health.routes.js';
import uploadRoutes from './upload.routes.js';
import objectRoutes from './object.routes.js';
import ruleRoutes from './rule.routes.js';
import previewRoutes from './preview.routes.js';
import batchRoutes from './batch.routes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/upload', uploadRoutes);
router.use('/objects', objectRoutes);
router.use('/rules', ruleRoutes);
router.use('/preview', previewRoutes);
router.use('/batch', batchRoutes);

export default router;
