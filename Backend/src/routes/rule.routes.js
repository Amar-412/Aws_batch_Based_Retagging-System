// ---------------------------------------------------------------------------
// Rule engine routes. Evaluation is local and does not call AWS.
// ---------------------------------------------------------------------------
import { Router } from 'express';
import {
  evaluateBatchRequest,
  evaluateRuleRequest,
  validateRuleRequest,
} from '../controllers/rule.controller.js';

const router = Router();

router.post('/validate', validateRuleRequest);
router.post('/evaluate', evaluateRuleRequest);
router.post('/evaluate-batch', evaluateBatchRequest);

export default router;
