import { ADDRESS_FIELDS } from '@jerp/shared';
import { logger } from '../../config/logger.js';
import { Branch } from '../branches/branch.model.js';
import { Organisation } from './organisation.model.js';

/*
 * The organisation's registered address and its head office branch's address are one address: saving it in any
 * place — Super Admin (create / edit), the organisation's Settings → Organisation, or the head office in Branches —
 * writes it to both, so every screen shows the same thing.
 */

const SKIP = { skipTenant: true };

/** The whole address in one shape (ADDRESS_FIELDS + state), with blanks as null. */
export const addressOf = (a) => ({ ...Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, a?.[f] || null])), stateCode: a?.stateCode || null });

const same = (a, b) => JSON.stringify(addressOf(a)) === JSON.stringify(addressOf(b));
const filled = (a) => ADDRESS_FIELDS.some((f) => a?.[f]);
const touchesAddress = (changes) => changes.some((c) => c.field === 'address' || c.field.startsWith('address.'));

/** After the organisation's address changed: the head office branch gets the same address. */
export async function copyToHeadOffice(organisationId, address, { session, changes } = {}) {
  if (changes && !touchesAddress(changes)) return false;
  const res = await Branch.updateOne({ organisationId, isHeadOffice: true }, { $set: { address: addressOf(address) } }, { session }).setOptions(SKIP);
  return res.modifiedCount > 0;
}

/** After the head office branch's address changed: the organisation's registered address gets the same. */
export async function copyToOrganisation(organisationId, address, { session, changes } = {}) {
  if (changes && !touchesAddress(changes)) return false;
  const res = await Organisation.updateOne({ _id: organisationId }, { $set: { address: addressOf(address) } }, { session });
  return res.modifiedCount > 0;
}

/**
 * Start-up repair for organisations created before the two were connected: an empty side is filled from the other.
 * When both are filled and differ, nothing is overwritten (someone may have edited either) — it is logged so the
 * organisation can save the right one once, which then keeps both in step.
 */
export async function syncHeadOfficeAddresses() {
  const orgs = await Organisation.find({}).select('_id name address').lean();
  let filledIn = 0;
  const differing = [];
  for (const org of orgs) {
    const ho = await Branch.findOne({ organisationId: org._id, isHeadOffice: true }).setOptions(SKIP).select('address').lean();
    if (!ho || same(org.address, ho.address)) continue;
    if (filled(org.address) && !filled(ho.address)) await copyToHeadOffice(org._id, org.address);
    else if (filled(ho.address) && !filled(org.address)) await copyToOrganisation(org._id, ho.address);
    else if (!filled(org.address) && !filled(ho.address)) await copyToHeadOffice(org._id, org.address); // only the state differs
    else {
      differing.push(org.name);
      continue;
    }
    filledIn += 1;
  }
  if (filledIn) logger.info({ filledIn }, 'Head office addresses brought in line with their organisations');
  if (differing.length) logger.warn({ organisations: differing }, 'Organisation and head office addresses differ; saving either once will sync them');
}
