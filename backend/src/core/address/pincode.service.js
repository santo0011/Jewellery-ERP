import { INDIAN_STATES } from '@jerp/shared';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';

/*
 * PIN code → post offices, city, district and state, from India Post's public PIN code API. Looked up through our
 * server (no browser CORS limits, one place to cache). Results are kept for a day; a slow or failed lookup answers
 * quickly so the person can simply type the address instead.
 */

const API = 'https://api.postalpincode.in/pincode/';
const TIMEOUT_MS = 6000;
const TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map(); // pin -> { at, value }

const norm = (s) => String(s ?? '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');
const STATE_BY_NAME = new Map(INDIAN_STATES.map((s) => [norm(s.name), s]));
// India Post spellings that differ from the GST state list.
const DNH_DD = 'dadraandnagarhavelianddamananddiu';
const STATE_ALIASES = { nctofdelhi: 'delhi', dadraandnagarhaveli: DNH_DD, damananddiu: DNH_DD, pondicherry: 'puducherry', orissa: 'odisha', andamanandnicobar: 'andamanandnicobarislands' };

function stateFor(name) {
  const key = norm(name);
  const direct = STATE_BY_NAME.get(key);
  if (direct) return direct;
  const alias = STATE_ALIASES[key];
  return alias ? (STATE_BY_NAME.get(alias) ?? null) : null;
}

const usable = (v) => (v && v !== 'NA' ? String(v).trim() : null);

/** The most common value in a list (post offices of one PIN can disagree on block names). */
const mostCommon = (values) => {
  const counts = new Map();
  for (const v of values.filter(Boolean)) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
};

/**
 * { pincode, postOffices: [{ name, branchType, delivery }], city, district, state, stateCode }.
 * Throws PIN_NOT_FOUND for an unknown PIN, PIN_LOOKUP_UNAVAILABLE when India Post cannot be reached.
 */
export async function lookupPincode(pincode) {
  const hit = cache.get(pincode);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let body;
  try {
    const res = await fetch(`${API}${pincode}`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = await res.json();
  } catch (err) {
    logger.warn({ err: err.message, pincode }, 'PIN code lookup failed');
    throw new ApiError(503, 'PIN_LOOKUP_UNAVAILABLE', 'Could not look up this PIN code right now. Enter the address yourself.');
  }

  const offices = Array.isArray(body) && body[0]?.Status === 'Success' ? (body[0].PostOffice ?? []) : [];
  if (!offices.length) throw new ApiError(404, 'PIN_NOT_FOUND', 'No post office found for this PIN code. Check it, or enter the address yourself.');

  const district = mostCommon(offices.map((o) => usable(o.District)));
  const stateName = mostCommon(offices.map((o) => usable(o.State)));
  const state = stateFor(stateName);
  const value = {
    pincode,
    postOffices: offices.map((o) => ({ name: o.Name, branchType: o.BranchType ?? null, delivery: o.DeliveryStatus === 'Delivery' })),
    // The town is usually the block (taluk); fall back to the district for cities where India Post lists none.
    city: mostCommon(offices.map((o) => usable(o.Block))) ?? district,
    district,
    state: state?.name ?? stateName,
    stateCode: state?.code ?? null,
  };
  cache.set(pincode, { at: Date.now(), value });
  return value;
}
