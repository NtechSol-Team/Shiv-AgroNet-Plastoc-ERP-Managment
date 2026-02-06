import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';
import ws from 'ws';

// Configure WebSocket for Node environment
neonConfig.webSocketConstructor = ws;

// Create Neon serverless Pool connection (better for long-running Node processes than HTTP)
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Create Drizzle ORM instance with the Pool
export const db = drizzle(pool, { schema });

// Export the raw SQL function if needed (simulated via pool)
export const rawSql = pool;

export type Database = typeof db;
