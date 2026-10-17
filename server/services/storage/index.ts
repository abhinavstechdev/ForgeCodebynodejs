import { StorageDriver } from './StorageDriver.js';
import { PostgresStorageDriver } from './PostgresStorageDriver.js';
import { LocalStorageDriver } from './LocalStorageDriver.js';

const postgresDriver = new PostgresStorageDriver();
const localDriver = new LocalStorageDriver();

export function getStorageDriver(driverType?: string): StorageDriver {
  const selected = driverType || process.env.STORAGE_DRIVER || 'postgres';
  if (selected === 'local') {
    return localDriver;
  }
  return postgresDriver;
}

export * from './StorageDriver.js';
export * from './PostgresStorageDriver.js';
export * from './LocalStorageDriver.js';
