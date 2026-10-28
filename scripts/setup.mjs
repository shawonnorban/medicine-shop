#!/usr/bin/env node
// One-time local setup: env files, database, schema, sample data and an admin login. Safe to run again.
//   node scripts/setup.mjs            normal
//   node scripts/setup.mjs --reseed   wipe and reload the sample catalogue (keeps staff accounts)
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const reseed = process.argv.includes('--reseed');
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
const quiet = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32', ...opts });
const step = (t) => console.log(`\n▸ ${t}`);
const die = (m) => { console.error(`\n✖ ${m}\n`); process.exit(1); };

const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 20 || (maj === 20 && min < 6)) die(`Node 20.6 or newer is required (you have ${process.versions.node}).`);
if (quiet('pnpm', ['--version']).status !== 0) die('pnpm is missing. Install it with:  npm i -g pnpm');

step('Environment files');
if (!existsSync('.env')) {
  const env = readFileSync('.env.example', 'utf8').replace('change-me-long-random-string', randomBytes(32).toString('hex'));
  writeFileSync('.env', env); console.log('  created .env');
} else console.log('  .env already exists');
const web = 'apps/storefront/.env.local';
if (!existsSync(web)) {
  writeFileSync(web, 'API_URL=http://localhost:4000\nNEXT_PUBLIC_API_URL=http://localhost:4000\n'); console.log(`  created ${web}`);
}

step('Database');
const api = (script, ...rest) => sh('pnpm', ['--filter', '@medshop/api', script, ...rest]);
let up = quiet('pnpm', ['--filter', '@medshop/api', 'db:wait', '3']).status === 0;
if (!up) {
  if (quiet('docker', ['--version']).status === 0) {
    console.log('  PostgreSQL is not running; starting it with Docker…');
    sh('docker', ['compose', 'up', '-d', 'postgres']);
    up = api('db:wait', '60').status === 0;
  }
}
if (!up) {
  die(`Cannot reach PostgreSQL.
  Option A (easiest): install Docker Desktop, then run this command again.
  Option B: use your own PostgreSQL 14+ and create the database:
        CREATE USER medshop WITH PASSWORD 'medshop' SUPERUSER;
        CREATE DATABASE medshop OWNER medshop;
     or change DATABASE_URL in .env to match your server.`);
}

step('Schema');
if (api('db:migrate').status !== 0) die('Migration failed.');

step('Sample data');
const status = quiet('pnpm', ['--filter', '@medshop/api', 'db:status']);
if (status.status !== 0) die('Could not read the database state:\n' + (status.stderr || status.stdout));
const existing = Number((/PRODUCTS=(\d+)/.exec(status.stdout) ?? [])[1] ?? 0);
const admins = Number((/ADMINS=(\d+)/.exec(status.stdout) ?? [])[1] ?? 0);
if (existing > 0 && !reseed) console.log(`  ${existing} products already loaded (use --reseed to reload the sample catalogue)`);
else if (api('db:seed').status !== 0) die('Seeding failed.');

step('Admin login');
if (admins === 0) {
  const password = randomBytes(9).toString('base64url');
  const r = sh('pnpm', ['--filter', '@medshop/api', 'staff:create', 'admin@example.com', 'Admin', 'admin'], { env: { ...process.env, STAFF_PASSWORD: password } });
  if (r.status !== 0) die('Could not create the admin user.');
  console.log(`\n  ┌─────────────────────────────────────────────┐
  │  Admin login (shown once, write it down)    │
  │  email:    admin@example.com                │
  │  password: ${password.padEnd(33)}│
  └─────────────────────────────────────────────┘`);
} else console.log('  an admin user already exists');

console.log(`
✔ Done. Start everything with:   pnpm dev

  Website        http://localhost:3000
  Admin + POS    http://localhost:3100
  API            http://localhost:4000/health
`);
