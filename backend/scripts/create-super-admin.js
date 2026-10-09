import { passwordSchema } from '@jerp/shared/schemas';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { PlatformAdmin } from '../src/modules/platform/platformAdmin.model.js';
import { createPlatformAdmin } from '../src/modules/platform/platformAuth.service.js';
import { User } from '../src/modules/users/user.model.js';

const [email, password, ...nameParts] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run create-super-admin -- <email> <password> [name]');
  process.exit(1);
}
const check = passwordSchema.safeParse(password);
if (!check.success) {
  console.error(`Password rejected: ${check.error.issues[0].message}`);
  process.exit(1);
}

await connectDb();
if (await PlatformAdmin.exists({ email: email.toLowerCase() })) {
  console.log(`Super admin ${email} already exists.`);
} else if (await User.exists({ email: email.toLowerCase() }).setOptions({ skipTenant: true })) {
  console.error(`${email} already belongs to an organisation user. Use a different email.`);
  process.exitCode = 1;
} else {
  await createPlatformAdmin({ name: nameParts.join(' ') || 'Super Admin', email: email.toLowerCase(), password });
  console.log(`Super admin created: ${email}\nSign in at /login`);
}
await disconnectDb();
