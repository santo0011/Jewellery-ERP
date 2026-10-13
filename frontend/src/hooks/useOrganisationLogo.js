import { useAuthImage } from './useAuthImage.js';
import { useSession } from './usePermission.js';

/**
 * The organisation's logo as an image URL, or null when it has none. Keyed by the session's logoVersion, so the
 * sidebar, profile and settings all show a new logo as soon as it is uploaded (or drop it when removed).
 */
export function useOrganisationLogo() {
  const { data } = useSession();
  const version = data?.organisation?.logoVersion;
  return useAuthImage(version ? `/organisation/logo?v=${version}` : null);
}
