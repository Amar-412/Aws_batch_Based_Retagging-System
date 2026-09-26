# S3 Batch Retagging Backend

Express API for the S3 Batch Retagging & Policy Management System. AWS credentials stay on the server. CSV upload parses object references only. Object validation calls S3 `HeadObject` and does not change the bucket.

## Setup

```powershell
cd Backend
Copy-Item .env.example .env
npm install
npm run dev
```

The API listens on `PORT` (default `5000`).

## CSV format

Required columns: `bucket`, `key`.

```csv
bucket,key
my-bucket,file1.pdf
my-bucket,file2.jpg
```

Values are trimmed. Duplicate `bucket` + `key` pairs are reported once in `duplicates` and kept once in `objects`.

## Endpoints

### `GET /api/health`

Liveness check. Does not return credentials.

### `POST /api/upload/csv`

`multipart/form-data` with a single field named `file`.

Limits:

- `MAX_UPLOAD_SIZE_MB` (default `5`)
- `MAX_CSV_OBJECTS` (default `10000`) — an application safety cap for this MVP, not a limit of S3 Batch Operations

Success (`200`):

```json
{
  "success": true,
  "data": {
    "uploadId": "uuid",
    "filename": "objects.csv",
    "objectCount": 2,
    "objects": [{ "bucket": "my-bucket", "key": "file1.pdf" }],
    "duplicates": [],
    "warnings": []
  }
}
```

Validation failure (`400`):

```json
{
  "success": false,
  "message": "CSV validation failed",
  "error": {
    "code": "INVALID_CSV",
    "details": ["Missing required column: key"]
  }
}
```

A header-only file returns `400` with `error.code` `EMPTY_CSV`.

## S3 Object Validation

`POST /api/objects/validate`

Confirms each `bucket` + `key` with Amazon S3 `HeadObject`. The call reads metadata only.

It does not:

- download the object
- upload, copy, delete, or retag objects
- create a manifest
- create an S3 Batch Operations job

`MAX_CSV_OBJECTS` (default `10000`) also caps this request. HeadObject calls run a few at a time so a larger list is not sent all at once.

Request:

```json
{
  "objects": [
    {
      "bucket": "my-bucket",
      "key": "file1.txt"
    }
  ]
}
```

Each result uses one of these statuses:

| Status | Meaning |
|---|---|
| `VALID` | The object exists. `size`, `contentType`, `lastModified`, and `etag` are returned when S3 provides them. |
| `NOT_FOUND` | S3 reported that the object does not exist. Other objects are still checked. |
| `ACCESS_DENIED` | The server identity cannot inspect the object. This is not reported as not found. |
| `ERROR` | Any other AWS or network failure. The response does not include credentials or SDK internals. |

### IAM

The backend identity needs permission to read object metadata for the buckets in the CSV. `HeadObject` is authorized by `s3:GetObject` on the object ARN. AWS does not use a separate `s3:HeadObject` IAM action.

```json
{
  "Effect": "Allow",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::example-bucket/*"
}
```

Do not grant `s3:*` or `AdministratorAccess` for this check. Local development can use `AWS_REGION`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY`. A production host should use an IAM role instead of long-lived keys.

## Rules

Rules are JSON data. The engine does not call AWS, does not run user code, and does not change object tags.

```json
{
  "name": "Finance Documents",
  "logic": "AND",
  "conditions": [
    { "field": "key", "operator": "contains", "value": "finance/" },
    { "field": "extension", "operator": "equals", "value": ".pdf" }
  ],
  "actions": [
    { "type": "SET_TAG", "key": "Department", "value": "Finance" }
  ]
}
```

Fields: `key`, `extension`, `bucket`, `size`, `lastModified`. `extension` is taken from the file name, including the dot. `README` has an empty extension.

String operators: `equals`, `not_equals`, `contains`, `starts_with`, `ends_with`.

Size operators: `equals`, `not_equals`, `greater_than`, `less_than`.

Date operators: `before`, `after`.

A rule has one top-level `AND` or `OR`. `AND` requires every condition. `OR` requires one. The only action is `SET_TAG`. Tag keys and values must be non-empty, at most 128 and 256 characters, and limited to letters, numbers, spaces, and `+ - = . _ : / @`. Keys cannot start with `aws:`. A rule can set at most 10 tags.

When two matching rules set the same tag to different values, that tag is listed under `conflicts` and is not given a winning value. Tags that do not conflict are still returned.

### `POST /api/rules/validate`

Validates one rule. Success returns `{ "valid": true, "errors": [] }`. An invalid rule returns `400` with `error.code` `INVALID_RULE`.

### `POST /api/rules/evaluate`

Evaluates one object against an array of rules. Returns `matchedRules`, `tags`, `conflicts`, and `status` (`MATCH`, `NO_MATCH`, or `CONFLICT`).

### `POST /api/rules/evaluate-batch`

Evaluates many objects already returned by object validation. It does not call S3. The object list uses `MAX_CSV_OBJECTS`. The response includes `total`, `matched`, `unmatched`, `conflicts`, and `results`.

## Preview

`POST /api/preview`

Builds a read-only tag plan from validated objects and saved rules. It reuses the rule engine and does not call AWS, download objects, or apply tags.

`currentTags` is always an empty list in this step because tags are not retrieved. `currentTagsRetrieved` is `false`. That empty list does not mean the object has no tags.

Object status is `MATCHED`, `UNCHANGED`, or `CONFLICT`. A conflict lists the tag key and the competing values and does not pick a winner. The summary includes `totalObjects`, `matchedObjects`, `unchangedObjects`, `conflictedObjects`, and `totalTagsToApply`.

An empty object list returns `400` `INVALID_OBJECTS`. An empty rule list returns `400` `INVALID_RULES`.

## Batch Operations

`POST /api/batch/create` accepts a confirmed plan (`confirmed: true`) and creates one S3 Batch Operations job per distinct proposed tag set. The manifest is a headerless `S3BatchOperations_CSV_20180820` file with `Bucket` and `Key` columns. The bucket column is an S3 ARN. Object keys are URL-encoded (`test/atlas-credentials (3).env` becomes `test/atlas-credentials%20(3).env`). Tag values are not written into the manifest.

The job operation is `S3PutObjectTagging`. The backend does not call `PutObjectTagging` on each object. `ConfirmationRequired` is false because the application already required an explicit preview confirmation before this call. The job is not created until the user clicks **Create Batch Operations Job**.

`GET /api/batch/:jobId` calls `DescribeJob` and updates the stored status. Job creation is not task completion.

Conflicts return `400 RETAGGING_CONFLICT` and create no jobs. A missing `BATCH_OPERATIONS_ROLE_ARN` returns `400 BATCH_ROLE_NOT_CONFIGURED`.

### DynamoDB

Table name: `DYNAMODB_TABLE` (default `RetaggingJobs`).

Partition key: `jobId` (String). No sort key.

Each job item stores `jobId`, `workflowId`, `status`, `bucket`, `manifestKey`, `reportPrefix`, `objectCount`, `tagCount`, `tags`, `createdAt`, and `updatedAt`. A second item keyed by `workflow#<workflowId>` records the job IDs so a repeated create request returns the original jobs. AWS credentials are not stored.

### IAM to configure manually

Do not grant `AdministratorAccess` or `s3:*`.

Backend caller:

- `s3:PutObject` on `arn:aws:s3:::<bucket>/manifests/*`
- `s3:CreateJob` and `s3:DescribeJob` on `arn:aws:s3:<region>:<account>:job/*`
- `iam:PassRole` on the Batch Operations role ARN
- `dynamodb:GetItem` and `dynamodb:PutItem` on the `RetaggingJobs` table

Batch Operations role (`BATCH_OPERATIONS_ROLE_ARN`), trusted by `batchoperations.s3.amazonaws.com`:

- `s3:GetObject` and `s3:GetObjectVersion` on the manifest object
- `s3:PutObjectTagging` and `s3:PutObjectVersionTagging` on the target objects
- `s3:PutObject` on `arn:aws:s3:::<bucket>/reports/*`

`S3PutObjectTagging` replaces an object's tag set with the tags in that job. Tags that were not part of the proposed set are not preserved, because this step does not read current tags.
