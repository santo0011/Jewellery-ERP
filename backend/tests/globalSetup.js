import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet;

export async function setup(project) {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  project.provide('mongoUri', replSet.getUri());
}

export async function teardown() {
  await replSet?.stop();
}
