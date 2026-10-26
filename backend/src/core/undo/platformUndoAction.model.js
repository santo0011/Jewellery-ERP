import mongoose from 'mongoose';
import { UNDO_STATUS } from './undoAction.model.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

/**
 * The Super Admin panel's Undo stack: one stack for the whole platform (organisations, plans, subscriptions, email
 * settings), apart from every organisation's own. Same rules as UndoAction: only the newest active action can be
 * undone, and nothing is deleted — undoing only adds who did it, when, why and what came of it.
 */
const platformUndoActionSchema = new mongoose.Schema(
  {
    type: { type: String, required: true }, // handler key, e.g. 'platform.orgStatus'
    recordType: { type: String, default: null },
    recordId: { type: ObjectId, default: null },
    organisationId: { type: ObjectId, ref: 'Organisation', default: null }, // the organisation it concerns, if any
    label: { type: String, default: null },
    data: { type: Mixed, default: undefined },
    auditId: { type: ObjectId, ref: 'PlatformAudit', default: null },
    createdByAdminId: { type: ObjectId, ref: 'PlatformAdmin', default: null },
    status: { type: String, enum: Object.values(UNDO_STATUS), default: UNDO_STATUS.ACTIVE },
    resolution: {
      type: new mongoose.Schema(
        { at: Date, byAdminId: { type: ObjectId, ref: 'PlatformAdmin', default: null }, reason: String, mode: String, result: { type: Mixed, default: undefined }, auditId: { type: ObjectId, default: null } },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);
platformUndoActionSchema.index({ status: 1, createdAt: -1 });
platformUndoActionSchema.index({ createdAt: -1 });

export const PlatformUndoAction = mongoose.model('PlatformUndoAction', platformUndoActionSchema);
