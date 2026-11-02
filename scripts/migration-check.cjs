#!/usr/bin/env node
'use strict';
// Read-only by construction: no directory creation, file writes or network calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const U=require('../erp/unified');
function option(name){const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];}
try{
 const input=option('--input');if(!input)throw Error('Usage: npm run migration:check -- --input BACKUP.json [--erp ERP_BACKUP.json]');
 const bytes=fs.readFileSync(input),value=JSON.parse(bytes),baseline=JSON.parse(fs.readFileSync(option('--erp')||path.join(__dirname,'../erp/data/initial-backup.json')));
 const report=U.migration(value.doc||value,baseline.doc||baseline);
 report.input={filename:path.basename(input),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 console.log(JSON.stringify(report,null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
