import { Pool } from 'pg';

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres',
  database: process.env.DB_NAME || 'ims',
  port: parseInt(process.env.DB_PORT || '5432'),
});

export const initDb = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS work_items (
        id SERIAL PRIMARY KEY,
        component_id VARCHAR(255) NOT NULL,
        state VARCHAR(50) DEFAULT 'OPEN',
        severity VARCHAR(50) NOT NULL,
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP,
        mttr_seconds INTEGER
      );

      CREATE TABLE IF NOT EXISTS rca_records (
        id SERIAL PRIMARY KEY,
        work_item_id INTEGER REFERENCES work_items(id),
        root_cause_category VARCHAR(255) NOT NULL,
        fix_applied TEXT NOT NULL,
        prevention_steps TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('PostgreSQL initialized');
  } finally {
    client.release();
  }
};
