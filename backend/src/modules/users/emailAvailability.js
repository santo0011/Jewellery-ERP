import { ApiError } from '../../utils/ApiError.js';
import { PlatformAdmin } from '../platform/platformAdmin.model.js';
import { User } from './user.model.js';

/**
 * Sign-in is by email alone, so an email may belong to only one account across every organisation and the platform.
 * `exceptUserId` lets a user keep their own email when it is re-saved.
 */
export async function assertEmailAvailable(email, { exceptUserId } = {}) {
  const userFilter = exceptUserId ? { email, _id: { $ne: exceptUserId } } : { email };
  const [user, admin] = await Promise.all([User.exists(userFilter).setOptions({ skipTenant: true }), PlatformAdmin.exists({ email })]);
  if (user || admin) {
    throw ApiError.conflict('An account with this email already exists', 'DUPLICATE', [{ path: 'email', message: 'An account with this email already exists' }]);
  }
}
