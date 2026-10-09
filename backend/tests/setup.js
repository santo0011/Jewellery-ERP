import mongoose from 'mongoose';
import { afterAll, beforeAll, inject } from 'vitest';

beforeAll(async () => {
  const uri = new URL(inject('mongoUri'));
  uri.pathname = `/test_${process.env.VITEST_POOL_ID ?? '0'}_${Date.now()}`;
  await mongoose.connect(uri.toString());
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
