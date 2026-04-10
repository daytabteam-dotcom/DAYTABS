const { execSync } = require('child_process');

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.log('DATABASE_URL not set, skipping database readiness check');
  process.exit(0);
}

const url = new URL(dbUrl);

const host = url.hostname;
const port = url.port;
const user = url.username;

console.log(`Waiting for database at ${host}:${port}...`);

let ready = false;
let attempts = 0;
const maxAttempts = 60; // 5 minutes

while (!ready && attempts < maxAttempts) {
  try {
    execSync(`pg_isready -h ${host} -p ${port} -U ${user}`, { stdio: 'pipe' });
    ready = true;
    console.log('Database is ready!');
  } catch (e) {
    console.log('Database not ready, waiting...');
    execSync('sleep 5');
    attempts++;
  }
}

if (!ready) {
  console.log('Database not ready after 5 minutes, continuing anyway...');
}