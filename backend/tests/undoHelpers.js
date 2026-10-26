import bcrypt from 'bcryptjs';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Account } from '../src/core/ledger/account.model.js';
import { JournalEntry } from '../src/core/ledger/journalEntry.model.js';
import { Role } from '../src/modules/roles/role.model.js';
import { User } from '../src/modules/users/user.model.js';
import { api, bearer, registerOrg } from './helpers.js';

/** An organisation with a second branch, and a user who works in that branch only (with every permission). */
export async function undoSetup() {
  const owner = await registerOrg();
  const t = owner.token;
  const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
  const ho = me.branches[0].id;
  const branch = (await api().post('/api/v1/branches').set(bearer(t)).send({ code: 'SLK', name: 'Salt Lake', address: { stateCode: '19' } })).body.data;
  const branchId = branch._id ?? branch.id;
  const email = `undo${Date.now()}${Math.random().toString(36).slice(2, 6)}@abc.local`;
  await runWithContext({ organisationId: me.organisation.id }, async () => {
    const role = await Role.create({ key: `all_${Date.now()}${Math.random()}`, name: 'Everything', permissions: ['*'] });
    await User.create({ name: 'Branch Staff', email, passwordHash: await bcrypt.hash('Secret123', 4), roleIds: [role._id], branchAccess: { all: false, branchIds: [branchId] }, defaultBranchId: branchId });
  });
  const bt = (await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' })).body.data.accessToken;
  return { t, me, ho, branchId, bt };
}

export const stacks = async (token, headers = {}) => (await api().get('/api/v1/undo/stacks').set({ ...bearer(token), ...headers })).body.data;
export const orgTop = async (token) => (await stacks(token)).find((s) => s.scope === 'organisation')?.latest ?? null;
export const branchTop = async (token, branchId) => (await stacks(token)).find((s) => s.branch?.id === String(branchId))?.latest ?? null;
export const undo = (token, id, reason = 'Entered by mistake') => api().post(`/api/v1/undo/${id}/undo`).set(bearer(token)).send({ reason });
export const dismiss = (token, id, reason = 'Keep it as it is') => api().post(`/api/v1/undo/${id}/dismiss`).set(bearer(token)).send({ reason });

/** Net of every ledger account over a document's entries: all zero once it is fully reversed. */
export const ledgerNet = (ctx, docType, docId) =>
  runWithContext({ organisationId: ctx.me.organisation.id }, async () => {
    const keys = new Map((await Account.find({}).lean()).map((a) => [String(a._id), a.systemKey]));
    const entries = await JournalEntry.find({ 'source.docType': docType, ...(docId && { 'source.docId': docId }) }).lean();
    const net = {};
    for (const e of entries) for (const l of e.lines) net[keys.get(String(l.accountId))] = (net[keys.get(String(l.accountId))] ?? 0) + l.debitPaise - l.creditPaise;
    return { entries: entries.length, net: Object.fromEntries(Object.entries(net).filter(([, v]) => v !== 0)) };
  });
