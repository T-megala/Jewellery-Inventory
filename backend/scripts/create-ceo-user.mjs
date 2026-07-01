#!/usr/bin/env node
/**
 * Create or promote a CEO user.
 *
 * Usage:
 *   node scripts/create-ceo-user.mjs --username ceo --password secret123
 *   node scripts/create-ceo-user.mjs --promote existinguser
 */
import 'dotenv/config';
import pool from '../src/config/database.js';
import { hashPassword } from '../src/utils/passwordHasher.js';
import { USER_ROLES } from '../src/constants/roles.js';

function readArg(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

const promoteUsername = readArg('--promote');
const username = readArg('--username', 'ceo');
const password = readArg('--password', 'ceo123456');

async function promoteUser(name) {
  const [result] = await pool.execute(
    'UPDATE users SET role = ? WHERE username = ?',
    [USER_ROLES.CEO, name],
  );

  if (result.affectedRows === 0) {
    throw new Error(`User "${name}" not found`);
  }

  console.log(`Promoted "${name}" to CEO role.`);
}

async function createCeoUser(name, plainPassword) {
  const [existing] = await pool.execute(
    'SELECT id, role FROM users WHERE username = ?',
    [name],
  );

  if (existing.length > 0) {
    if (existing[0].role === USER_ROLES.CEO) {
      console.log(`User "${name}" already exists with CEO role.`);
      return;
    }

    await pool.execute('UPDATE users SET role = ? WHERE id = ?', [
      USER_ROLES.CEO,
      existing[0].id,
    ]);
    console.log(`Updated existing user "${name}" to CEO role.`);
    return;
  }

  const hashedPassword = await hashPassword(plainPassword);
  await pool.execute(
    'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
    [name, hashedPassword, USER_ROLES.CEO],
  );

  console.log(`Created CEO user "${name}".`);
}

async function main() {
  try {
    if (promoteUsername) {
      await promoteUser(promoteUsername.trim());
    } else {
      await createCeoUser(username.trim(), password);
      console.log(`Login with username "${username.trim()}" and the password you provided.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
