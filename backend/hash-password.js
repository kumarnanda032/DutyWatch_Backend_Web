/**
 * Prints a bcrypt hash for a password you choose, so you can paste it
 * into a `db.users.insertOne({...})` command in the MongoDB shell (mongosh)
 * yourself - no seed script with baked-in credentials required.
 *
 * Usage:
 *   node hash-password.js YourChosenPassword
 */

const bcrypt = require('bcryptjs');

const plaintext = process.argv[2];

if (!plaintext) {
  console.log('Usage: node hash-password.js <password>');
  process.exit(1);
}

bcrypt.hash(plaintext, 10).then((hash) => {
  console.log('\nPaste this as "password" in your mongosh insertOne command:\n');
  console.log(hash);
  console.log('');
});
