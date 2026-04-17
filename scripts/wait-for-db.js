import { execFileSync } from 'node:child_process';

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.log('DATABASE_URL not set, skipping database readiness check');
  process.exit(0);
}

const url = new URL(dbUrl);

const host = url.hostname;
const port = url.port || '5432';
const user = decodeURIComponent(url.username);

console.log(`Waiting for database at ${host}:${port}...`);

let ready = false;
let attempts = 0;
const maxAttempts = 60; // 5 minutes

while (!ready && attempts < maxAttempts) {
  try {
    execFileSync('pg_isready', ['-h', host, '-p', port, '-U', user], {
      stdio: 'pipe',
    });
    ready = true;
    console.log('Database is ready!');
  } catch (e) {
    console.log('Database not ready, waiting...');
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    attempts++;
  }
}

if (!ready) {
  console.log('Database not ready after 5 minutes, continuing anyway...');
}
