const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

function connectionStringForDatabase(databaseName) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required. Copy .env.example to .env and add your CockroachDB URL.');
  }

  const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  const ssl = process.env.DATABASE_URL.includes('sslmode=')
    ? { rejectUnauthorized: false }
    : undefined;

  const adminClient = new Client({
    connectionString: connectionStringForDatabase('defaultdb'),
    ssl
  });

  await adminClient.connect();
  await adminClient.query('CREATE DATABASE IF NOT EXISTS exam_portal');
  await adminClient.end();

  const appClient = new Client({
    connectionString: connectionStringForDatabase('exam_portal'),
    ssl
  });

  await appClient.connect();
  await appClient.query(schema);
  await appClient.end();
  console.log('CockroachDB schema created.');
}

initDatabase().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
