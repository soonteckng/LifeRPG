/* global __dirname */
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs'), path = require('node:path');
(async () => {
 const db=new PGlite();
 try {
  for(const file of ['tests/sql/progression-bootstrap.sql','docs/progression-live-contract.sql','tests/sql/progression-fixtures.sql','docs/exact-seconds-credit.sql','tests/exact-seconds-credit.sql','docs/goal-completion-base.sql','docs/daily-goal-exact-credit.sql','tests/daily-goal-exact-credit.sql','tests/exact-seconds-credit.sql']){
   await db.exec(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'));console.log('PASS '+file);
  }
 }finally{await db.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
