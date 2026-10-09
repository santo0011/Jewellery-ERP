import { useAuthImage } from './useAuthImage.js';

export const useOrganisationLogo = (hasLogo, version) => useAuthImage(hasLogo ? `/organisation/logo?v=${version}` : null);
