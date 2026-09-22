// ---------------------------------------------------------------------------
// Object validation controller. Checks the payload, then asks the object
// service to run read-only HeadObject calls.
// ---------------------------------------------------------------------------
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { prepareObjectList, validateObjects } from '../services/object.service.js';

export const validateObjectList = asyncHandler(async (req, res) => {
  const objects = prepareObjectList(req.body?.objects);
  const data = await validateObjects(objects);
  return sendSuccess(res, data);
});
