import request from 'supertest';
import { createApp } from '../src/app.js';

export const app = createApp();
export const api = () => request(app);

let counter = 0;

export function orgInput(overrides = {}) {
  counter += 1;
  const unique = `${Date.now()}${counter}`;
  return {
    organisationName: `Test Jewellers ${unique}`,
    ownerName: 'Test Owner',
    email: `owner${unique}@example.com`,
    mobile: '9876543210',
    stateCode: '19',
    password: 'Secret123',
    ...overrides,
  };
}

export function refreshCookie(res) {
  const cookie = [].concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('jerp_rt='));
  return cookie?.split(';')[0];
}

export async function registerOrg(overrides) {
  const input = orgInput(overrides);
  const res = await api().post('/api/v1/auth/register').send(input);
  if (res.status !== 201) throw new Error(`Register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { input, token: res.body.data.accessToken, cookie: refreshCookie(res) };
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });
