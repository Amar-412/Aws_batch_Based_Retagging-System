// ---------------------------------------------------------------------------
// Multer configuration for the CSV upload endpoint.
// The stored filename is generated here. The original client filename is never
// used as a filesystem path.
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';
import { uploadsDir } from '../utils/uploads.js';

fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain',
  'application/octet-stream',
  '',
]);

/**
 * Attach a server-generated id before multer names the file.
 */
export function assignUploadId(req, _res, next) {
  req.uploadId = uuidv4();
  next();
}

/**
 * Keep a short, safe stem from the original name for readability only.
 * Path separators and anything that is not a letter, number, "_" or "-" are dropped.
 */
function safeStem(originalName) {
  const base = path.basename(originalName || 'objects.csv');
  const stem = base
    .replace(/\.csv$/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 40);
  return stem || 'objects';
}

function fileFilter(_req, file, cb) {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();

  if (extension !== '.csv' || !ALLOWED_MIME_TYPES.has(mime)) {
    return cb(
      new ApiError(
        400,
        'Only CSV files are accepted.',
        ['The uploaded file is not a CSV file.'],
        'INVALID_FILE_TYPE'
      )
    );
  }

  return cb(null, true);
}

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadsDir);
  },
  filename(req, file, cb) {
    const uploadId = req.uploadId || uuidv4();
    req.uploadId = uploadId;
    cb(null, `${uploadId}-${safeStem(file.originalname)}.csv`);
  },
});

const upload = multer({
  storage,
  fileFilter,
  limits: {
    files: 1,
    fileSize: env.maxUploadSizeMb * 1024 * 1024,
  },
});

export default upload;
