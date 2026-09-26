// ---------------------------------------------------------------------------
// Centralized AWS SDK v3 client factory.
// Clients are created lazily and cached (singletons) so we don't reconstruct
// them per request. Credentials come ONLY from environment variables.
// ---------------------------------------------------------------------------
import { S3Client } from '@aws-sdk/client-s3';
import { S3ControlClient } from '@aws-sdk/client-s3-control';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import env from './env.js';

/**
 * Build the shared client configuration.
 * If explicit credentials are provided via env vars we pass them; otherwise we
 * let the AWS SDK default provider chain resolve them (e.g. IAM role / profile).
 */
function buildClientConfig() {
  const config = {};
  if (env.awsRegion) config.region = env.awsRegion;

  if (env.awsAccessKeyId && env.awsSecretAccessKey) {
    config.credentials = {
      accessKeyId: env.awsAccessKeyId,
      secretAccessKey: env.awsSecretAccessKey,
    };
  }
  return config;
}

// --- Cached singletons -----------------------------------------------------
let _s3Client;
let _s3ControlClient;
let _dynamoClient;
let _dynamoDocClient;

/**
 * Amazon S3 client.
 * Object validation sends HeadObjectCommand.
 * Manifest upload sends PutObjectCommand.
 */
export function getS3Client() {
  if (!_s3Client) _s3Client = new S3Client(buildClientConfig());
  return _s3Client;
}

/** Amazon S3 Control client. Batch jobs send CreateJobCommand and DescribeJobCommand. */
export function getS3ControlClient() {
  if (!_s3ControlClient) _s3ControlClient = new S3ControlClient(buildClientConfig());
  return _s3ControlClient;
}

/** Low-level DynamoDB client. */
export function getDynamoClient() {
  if (!_dynamoClient) _dynamoClient = new DynamoDBClient(buildClientConfig());
  return _dynamoClient;
}

/** DynamoDB Document client. Job metadata sends PutCommand and GetCommand. */
export function getDynamoDocClient() {
  if (!_dynamoDocClient) {
    _dynamoDocClient = DynamoDBDocumentClient.from(getDynamoClient(), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return _dynamoDocClient;
}
