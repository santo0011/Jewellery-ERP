export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Jewellery ERP';

/**
 * Where the API lives. Empty for the website (it calls /api/v1 on its own address, proxied to the backend).
 * The mobile app is built with VITE_API_URL=https://api.your-domain.com, as it does not run on the server.
 */
export const API_ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
