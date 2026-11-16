import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.SUPABASE_CONNECTION_STRING) {
  throw new Error('SUPABASE_CONNECTION_STRING is not defined in environment variables');
}

const pool = new Pool({
  connectionString: process.env.SUPABASE_CONNECTION_STRING,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

export default pool;