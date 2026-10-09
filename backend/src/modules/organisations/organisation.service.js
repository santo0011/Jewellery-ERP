import mongoose from 'mongoose';
import { ORG_ADMIN_ROLE_KEY, PLAN_KEYS, SUBSCRIPTION_STATUS, SYSTEM_ROLE_TEMPLATES } from '@jerp/shared';
import { env } from '../../config/env.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext, runWithContext } from '../../core/context/requestContext.js';
import { FileAsset } from '../../core/storage/fileAsset.model.js';
import { detectImageType, storage } from '../../core/storage/storage.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { randomToken } from '../../utils/crypto.js';
import { diffChanges } from '../../utils/diff.js';
import { Branch } from '../branches/branch.model.js';
import { addDefaultCategories } from '../categories/category.service.js';
import { ensureSystemAccounts } from '../../core/ledger/posting.service.js';
import { Role } from '../roles/role.model.js';
import { createDefaultSettings } from '../settings/settings.service.js';
import { User } from '../users/user.model.js';
import { Organisation } from './organisation.model.js';
import { Subscription } from './subscription.model.js';

const EDITABLE_FIELDS = ['name', 'legalName', 'gstin', 'pan', 'phone', 'email', 'timezone', 'address.line1', 'address.line2', 'address.city', 'address.stateCode', 'address.pincode'];

const slugify = (name) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'org';

export async function onboardOrganisation({ organisationName, ownerName, email, mobile, stateCode, passwordHash, branchLimit, mustChangePassword = false, platformAdminId = null }, session) {
  const organisationId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  return runWithContext({ organisationId: String(organisationId), userId: String(userId) }, async () => {
    const [organisation] = await Organisation.create(
      [
        {
          _id: organisationId,
          name: organisationName,
          slug: `${slugify(organisationName)}-${randomToken(4).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`,
          phone: mobile,
          email,
          address: { stateCode },
          ownerUserId: userId,
          ...(branchLimit && { branchLimit }),
          createdByPlatformAdmin: platformAdminId,
        },
      ],
      { session },
    );

    await Subscription.create(
      [
        {
          plan: PLAN_KEYS.TRIAL,
          status: SUBSCRIPTION_STATUS.TRIAL,
          trialEndsAt: new Date(Date.now() + env.TRIAL_DAYS * 24 * 60 * 60 * 1000),
        },
      ],
      { session },
    );

    const [branch] = await Branch.create(
      [{ code: 'HO', name: 'Head Office', phone: mobile, email, address: { stateCode }, isHeadOffice: true, createdBy: userId }],
      { session },
    );

    await createDefaultSettings(session);
    await addDefaultCategories({ session });
    await ensureSystemAccounts({ session });

    const roles = await Role.create(
      SYSTEM_ROLE_TEMPLATES.map((t) => ({ key: t.key, name: t.name, description: t.description, permissions: t.permissions, isSystem: true })),
      { session, ordered: true },
    );
    const adminRole = roles.find((r) => r.key === ORG_ADMIN_ROLE_KEY);

    const [user] = await User.create(
      [
        {
          _id: userId,
          name: ownerName,
          email,
          mobile,
          passwordHash,
          roleIds: [adminRole._id],
          branchAccess: { all: true, branchIds: [] },
          defaultBranchId: branch._id,
          isOwner: true,
          mustChangePassword,
          passwordChangedAt: new Date(),
        },
      ],
      { session },
    );

    await recordAudit(
      { action: AUDIT_ACTIONS.CREATE, module: 'organisation', recordType: 'Organisation', recordId: organisationId, meta: { onboarding: true } },
      { session },
    );

    return { organisation, user, branch };
  });
}

export async function getCurrentOrganisation() {
  const { organisationId } = requireContext();
  const organisation = await Organisation.findById(organisationId).lean();
  if (!organisation) throw ApiError.notFound('Organisation');
  return organisation;
}

export async function updateCurrentOrganisation(input) {
  const { organisationId } = requireContext();
  const organisation = await Organisation.findById(organisationId);
  if (!organisation) throw ApiError.notFound('Organisation');

  const before = organisation.toObject();
  organisation.set(input);
  const changes = diffChanges(before, organisation.toObject(), EDITABLE_FIELDS);
  if (changes.length === 0) return organisation.toObject();

  await organisation.save();
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'organisation', recordType: 'Organisation', recordId: organisation._id, changes });
  return organisation.toObject();
}

export async function getSubscription() {
  const subscription = await Subscription.findOne({});
  if (!subscription) throw ApiError.notFound('Subscription');
  return subscription;
}

export async function setLogo(file) {
  const { organisationId, userId } = requireContext();
  const type = detectImageType(file.buffer);
  if (!type) throw ApiError.badRequest('Logo must be a PNG, JPEG or WebP image', undefined, 'UNSUPPORTED_FILE');

  const organisation = await Organisation.findById(organisationId);
  const previousId = organisation.logoFileId;
  const key = `${organisationId}/logo/${randomToken(12)}.${type.ext}`;
  await storage.put(key, file.buffer);

  const asset = await FileAsset.create({ key, purpose: 'logo', mimeType: type.mime, size: file.size, originalName: file.originalname?.slice(0, 200) ?? null, uploadedBy: userId });
  organisation.logoFileId = asset._id;
  await organisation.save();
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'organisation', recordType: 'Organisation', recordId: organisation._id, changes: [{ field: 'logo', from: previousId, to: asset._id }] });

  if (previousId) await deleteAsset(previousId);
  return { logoFileId: asset._id };
}

export async function getLogo() {
  const { organisationId } = requireContext();
  const organisation = await Organisation.findById(organisationId).select('logoFileId').lean();
  const asset = organisation?.logoFileId && (await FileAsset.findById(organisation.logoFileId).lean());
  if (!asset) throw ApiError.notFound('Logo');
  return { buffer: await storage.get(asset.key), mimeType: asset.mimeType };
}

export async function removeLogo() {
  const { organisationId } = requireContext();
  const organisation = await Organisation.findById(organisationId);
  if (!organisation.logoFileId) return;
  const previousId = organisation.logoFileId;
  organisation.logoFileId = null;
  await organisation.save();
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'organisation', recordType: 'Organisation', recordId: organisation._id, changes: [{ field: 'logo', from: previousId, to: null }] });
  await deleteAsset(previousId);
}

async function deleteAsset(id) {
  const asset = await FileAsset.findByIdAndDelete(id).lean();
  if (asset) await storage.remove(asset.key);
}
