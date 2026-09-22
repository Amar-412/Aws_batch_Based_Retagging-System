// ---------------------------------------------------------------------------
// Retagging preview routes. No AWS calls.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import { createPreview } from '../controllers/preview.controller.js';

const router = Router();

router.post('/', createPreview);

export default router;
