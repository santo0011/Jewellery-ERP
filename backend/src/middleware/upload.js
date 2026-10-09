import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

export function singleImageUpload(field, { maxBytes = 1024 * 1024 } = {}) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1, fields: 0 } }).single(field);
  return (req, res, next) =>
    upload(req, res, (err) => {
      if (err?.code === 'LIMIT_FILE_SIZE') return next(ApiError.badRequest(`Image must be ${Math.round(maxBytes / 1024)} KB or smaller`, undefined, 'FILE_TOO_LARGE'));
      if (err) return next(ApiError.badRequest('Upload failed. Send one image file.', undefined, 'UPLOAD_INVALID'));
      if (!req.file) return next(ApiError.badRequest('Choose an image to upload', undefined, 'UPLOAD_MISSING'));
      return next();
    });
}
