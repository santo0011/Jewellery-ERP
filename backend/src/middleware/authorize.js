import { hasAnyPermission, hasPermission } from '@jerp/shared';
import { ApiError } from '../utils/ApiError.js';

export const authorize = (permission) => (req, res, next) => {
  if (!req.auth || !hasPermission(req.auth.permissions, permission)) throw ApiError.forbidden();
  next();
};

export const requireAllBranches = (req, res, next) => {
  if (!req.auth?.branchAccess.all) throw ApiError.forbidden('This action requires access to all branches');
  next();
};

export const authorizeAny = (permissions) => (req, res, next) => {
  if (!req.auth || !hasAnyPermission(req.auth.permissions, permissions)) throw ApiError.forbidden();
  next();
};
