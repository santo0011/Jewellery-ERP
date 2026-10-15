import { env } from './config/env.js';
import { connectDb, disconnectDb } from './config/db.js';
import { logger } from './config/logger.js';
import { createApp } from './app.js';
import { lanAddresses } from './utils/network.js';
import { ensureDefaultSuperAdmin } from './modules/platform/bootstrapSuperAdmin.js';
import { syncSystemRoles } from './modules/roles/syncSystemRoles.js';
import { ensureBillingSetup } from './modules/billing/billing.service.js';
import { syncHeadOfficeAddresses } from './modules/organisations/headOfficeAddress.js';

async function start() {
  await connectDb();
  await ensureDefaultSuperAdmin();
  await syncSystemRoles();
  await ensureBillingSetup();
  await syncHeadOfficeAddresses();
  const server = createApp().listen(env.PORT, env.HOST, () => {
    logger.info(`API listening on http://localhost:${env.PORT}/api/v1`);
    // Other devices on the same Wi-Fi reach it at this computer's network address.
    if (env.HOST === '0.0.0.0') for (const ip of lanAddresses()) logger.info(`API on the network: http://${ip}:${env.PORT}/api/v1`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});
