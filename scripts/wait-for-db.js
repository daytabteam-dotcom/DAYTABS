const { execSync } = require('child_process');

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const url = new URL(dbUrl);

const host = url.hostname;
const port = url.port;
const user = url.username;

console.log(`Waiting for database at ${host}:${port}...`);

let ready = false;
while (!ready) {
  try {
    execSync(`pg_isready -h ${host} -p ${port} -U ${user}`, { stdio: 'pipe' });
    ready = true;
    console.log('Database is ready!');
  } catch (e) {
    console.log('Database not ready, waiting...');
    execSync('sleep 5');
  }
}