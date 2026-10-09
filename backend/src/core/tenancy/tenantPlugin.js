import mongoose from 'mongoose';
import { getTenantId } from '../context/requestContext.js';

const QUERY_HOOKS = [
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne',
];

export class TenantScopeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TenantScopeError';
  }
}

function currentTenantId(modelName) {
  const id = getTenantId();
  if (!id) throw new TenantScopeError(`Tenant context missing for ${modelName} operation`);
  return new mongoose.Types.ObjectId(String(id));
}

export function tenantPlugin(schema) {
  if (!schema.path('organisationId')) {
    schema.add({
      organisationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true, immutable: true, index: true },
    });
  }

  schema.pre(QUERY_HOOKS, function scopeQuery() {
    const options = this.getOptions();
    if (options.skipTenant) {
      delete options.skipTenant;
      return;
    }
    const orgId = currentTenantId(this.model.modelName);
    const requested = this.getFilter().organisationId;
    if (requested && String(requested) !== String(orgId)) {
      throw new TenantScopeError(`Cross-tenant query blocked on ${this.model.modelName}`);
    }
    this.where({ organisationId: orgId });
  });

  schema.pre('aggregate', function scopeAggregate() {
    if (this.options?.skipTenant) {
      delete this.options.skipTenant;
      return;
    }
    this.pipeline().unshift({ $match: { organisationId: currentTenantId(this.model().modelName) } });
  });

  schema.pre('validate', function assignTenant() {
    const contextId = getTenantId();
    if (!this.organisationId) {
      if (!contextId) throw new TenantScopeError(`Tenant context missing for ${this.constructor.modelName} create`);
      this.organisationId = contextId;
    } else if (contextId && String(this.organisationId) !== String(contextId)) {
      throw new TenantScopeError(`Cross-tenant write blocked on ${this.constructor.modelName}`);
    }
  });
}
