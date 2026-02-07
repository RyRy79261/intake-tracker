/**
 * Neon database client for server-side operations.
 * Only import this file in server components or API routes.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./db-schema";

// Create the Neon SQL client
const sql = neon(process.env.DATABASE_URL!);

// Create the Drizzle database instance
export const neonDb = drizzle(sql, { schema });

// Re-export schema for convenience
export * from "./db-schema";
