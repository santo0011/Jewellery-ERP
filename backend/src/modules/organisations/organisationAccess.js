import { ApiError } from '../../utils/ApiError.js';

/** Shown at sign-in, on session refresh and on every request while the Super Admin has deactivated the organisation. */
export const organisationDeactivated = () =>
  ApiError.forbidden('Your organisation is currently deactivated, so no one can sign in. Please contact the platform administrator.', 'ORG_SUSPENDED');
