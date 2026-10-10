/**
 * Test Database Utilities
 *
 * Provides utilities for setting up and tearing down test databases.
 * Ensures each test gets a fresh, isolated database instance.
 */

import { db } from "#lib/shared/persistence/database/TKADatabase";
import Dexie from "dexie";

/**
 * Create a fresh test database with unique name
 * Prevents tests from interfering with each other
 */
export async function createTestDatabase(testName: string): Promise<void> {
  const dbName = `test-tka-${testName}-${Date.now()}`;

  // Close existing connection if any
  if (db.isOpen()) {
    db.close();
  }

  // Delete existing test database
  await Dexie.delete(dbName);

  // Reinitialize with test name
  Object.defineProperty(db, "name", {
    value: dbName,
    writable: true,
  });

  await db.open();
}

/**
 * Clean up test database after test completes
 */
export async function destroyTestDatabase(): Promise<void> {
  if (db.isOpen()) {
    const dbName = db.name;
    db.close();
    await Dexie.delete(dbName);
  }
}

/**
 * Clear all data from test database without destroying it
 */
export async function clearTestDatabase(): Promise<void> {
  await db.sequences.clear();
  await db.pictographs.clear();
  await db.userWork.clear();
  await db.userProjects.clear();
  await db.settings.clear();
}
