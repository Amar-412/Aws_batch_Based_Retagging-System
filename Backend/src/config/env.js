// ---------------------------------------------------------------------------
// Centralized environment configuration.
// Loads variables from .env once and exposes a typed, validated config object.
// Nothing else in the app should read process.env directly.
// ---------------------------------------------------------------------------
import dotenv from 'dotenv';

dotenv.config();

/**
 * Read an environment variable with an optional default.
 * @param {string} name
 * @param {string} [fallback]
 */
function get(name, fallback = undefined) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

/**
 * Parse an integer env var, falling back to a default when unset/invalid.
 */
function getInt(name, fallback) {
  const raw = get(name);
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

const env = {
  // Server
  port: getInt('PORT', 5000),
  nodeEnv: get('NODE_ENV', 'development'),

  // AWS
  awsRegion: get('AWS_REGION'),
  awsAccessKeyId: get('AWS_ACCESS_KEY_ID'),
  awsSecretAccessKey: get('AWS_SECRET_ACCESS_KEY'),

  // S3
  s3Bucket: get('S3_BUCKET'),
  manifestPrefix: get('MANIFEST_PREFIX', 'manifests/'),
  reportPrefix: get('REPORT_PREFIX', 'reports/'),

  // S3 Batch Operations
  batchOperationsRoleArn: get('BATCH_OPERATIONS_ROLE_ARN'),

  // DynamoDB
  dynamoTable: get('DYNAMODB_TABLE', 'RetaggingJobs'),

  // Uploads
  maxUploadSizeMb: getInt('MAX_UPLOAD_SIZE_MB', 5),
  // Safety cap for the MVP CSV. Batch Operations itself is not limited by this.
  maxCsvObjects: getInt('MAX_CSV_OBJECTS', 10000),

  // CORS
  corsOrigin: get('CORS_ORIGIN'),
};

/**
 * Variables that are required for AWS-backed features to work.
 * We only WARN (not crash) at boot so that /api/health and local development
 * still function before AWS credentials are configured.
 */
const AWS_REQUIRED_KEYS = [
  'awsRegion',
  'awsAccessKeyId',
  'awsSecretAccessKey',
  's3Bucket',
];

/**
 * Returns the list of missing AWS-related config keys (empty if all present).
 */
export function getMissingAwsConfig() {
  return AWS_REQUIRED_KEYS.filter((key) => !env[key]);
}

/**
 * Logs a warning at startup if AWS config is incomplete.
 */
export function warnOnMissingAwsConfig() {
  const missing = getMissingAwsConfig();
  if (missing.length > 0) {
    const envNames = {
      awsRegion: 'AWS_REGION',
      awsAccessKeyId: 'AWS_ACCESS_KEY_ID',
      awsSecretAccessKey: 'AWS_SECRET_ACCESS_KEY',
      s3Bucket: 'S3_BUCKET',
    };
    const readable = missing.map((k) => envNames[k] || k).join(', ');
    // eslint-disable-next-line no-console
    console.warn(
      `[env] Warning: missing AWS configuration -> ${readable}. ` +
        'AWS-backed endpoints will fail until these are set in .env.'
    );
  }
}

export default env;
