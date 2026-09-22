// ---------------------------------------------------------------------------
// Health controller. Reports basic service liveness plus whether the AWS
// configuration is complete (without ever exposing credential values).
// ---------------------------------------------------------------------------
import { sendSuccess } from '../utils/apiResponse.js';
import { getMissingAwsConfig } from '../config/env.js';
import env from '../config/env.js';

export function getHealth(req, res) {
  const missingAws = getMissingAwsConfig();

  return sendSuccess(res, {
    status: 'ok',
    service: 's3-batch-retagging-backend',
    environment: env.nodeEnv,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    aws: {
      configured: missingAws.length === 0,
      region: env.awsRegion || null,
      // Booleans only — never the actual secret values.
      missing: missingAws,
    },
  });
}
