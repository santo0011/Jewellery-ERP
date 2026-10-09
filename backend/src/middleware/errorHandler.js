import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

function toApiError(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    return ApiError.badRequest(
      'Please correct the highlighted fields',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      'VALIDATION_ERROR',
    );
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return ApiError.badRequest(
      'Please correct the highlighted fields',
      Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
      'VALIDATION_ERROR',
    );
  }

  if (err instanceof mongoose.Error.CastError) return ApiError.badRequest(`Invalid value for ${err.path}`, undefined, 'INVALID_ID');

  if (err?.code === 11000) {
    const field = Object.keys(err.keyValue ?? err.keyPattern ?? {}).find((k) => k !== 'organisationId') ?? 'value';
    return ApiError.conflict(`This ${field} is already in use`, 'DUPLICATE', [{ path: field, message: `This ${field} is already in use` }]);
  }

  if (err?.type === 'entity.parse.failed') return ApiError.badRequest('Malformed JSON body', undefined, 'INVALID_JSON');
  if (err?.type === 'entity.too.large') return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');

  return null;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const apiError = toApiError(err);

  if (!apiError) {
    (req.log ?? logger).error({ err }, 'Unhandled error');
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
      requestId: req.id,
    });
  }

  if (apiError.status >= 500) (req.log ?? logger).error({ err }, apiError.message);

  return res.status(apiError.status).json({
    success: false,
    error: { code: apiError.code, message: apiError.message, ...(apiError.details && { details: apiError.details }) },
    requestId: req.id,
  });
}

export function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: { code: 'ROUTE_NOT_FOUND', message: `Route ${req.method} ${req.originalUrl} not found` },
    requestId: req.id,
  });
}
