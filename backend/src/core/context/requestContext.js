import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

export const runWithContext = (context, fn) => storage.run(context, fn);

export const getContext = () => storage.getStore();

export const getTenantId = () => storage.getStore()?.organisationId;

export function requireContext() {
  const ctx = storage.getStore();
  if (!ctx?.organisationId) throw new Error('Request context is missing an organisation');
  return ctx;
}
