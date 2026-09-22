// ---------------------------------------------------------------------------
// Upload directory helpers.
// All temporary CSVs live under Backend/uploads. Paths are resolved from this
// module, never from user input, and deletes are refused outside that folder.
// ---------------------------------------------------------------------------
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to Backend/uploads. */
export const uploadsDir = path.resolve(__dirname, '../../uploads');

/**
 * True when `filePath` resolves to a file inside the uploads directory.
 * @param {string} filePath
 */
export function isInsideUploadsDir(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const resolved = path.resolve(filePath);
  const relative = path.relative(uploadsDir, resolved);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Delete a temporary upload. Ignores missing files and refuses paths that
 * fall outside the uploads directory.
 * @param {string} filePath
 */
export function removeUploadedFile(filePath) {
  if (!isInsideUploadsDir(filePath)) return;
  try {
    fs.unlinkSync(path.resolve(filePath));
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      // eslint-disable-next-line no-console
      console.error('[uploads] Failed to remove temporary file');
    }
  }
}
