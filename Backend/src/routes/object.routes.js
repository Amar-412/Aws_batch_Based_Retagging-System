// ---------------------------------------------------------------------------
// S3 object validation routes.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { validateObjectList } from '../controllers/object.controller.js';

const router = Router();

// POST /api/objects/validate
router.post('/validate', validateObjectList);

export default router;
