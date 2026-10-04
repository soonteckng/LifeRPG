// Optional isolated SQL verification. PGlite is a test tool, NOT an app dependency.
// Install @electric-sql/pglite@0.5.8 in a temporary directory, then set NODE_PATH
// to that directory's node_modules and run this script. Creates in-memory DB only.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const db = new PGlite();
  try {
    for (const file of ['tests/sql/progression-bootstrap.sql', 'docs/progression-live-contract.sql', 'tests/sql/progression-fixtures.sql', 'docs/exact-seconds-credit.sql', 'tests/exact-seconds-credit.sql']) {
      await db.exec(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'));
      console.log(`PASS ${file}`);
    }
  } finally { await db.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
