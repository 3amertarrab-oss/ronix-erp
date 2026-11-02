'use strict';
// Safety guard, not a reset command. It never deletes an existing workspace.
const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'data');
function load(p){return JSON.parse(fs.readFileSync(p,'utf8'));}
function main(){
 const seed=load(path.join(dir,'initial-backup.json'));
 if(!seed.cleanTrial?.id)throw Error('Clean-trial seed marker missing. No data changed.');
 const file=path.join(dir,'workspace.json');
 if(fs.existsSync(file)){
  const current=load(file);
  if(current.doc?.cleanTrial?.id!==seed.cleanTrial.id)throw Error('This folder contains another database. Extract the clean edition into a NEW folder. Nothing was overwritten.');
  require('./domain').validateStructure(current.doc);
  console.log('Existing trial retained. This launch does not reset your work.');
  return;
 }
 if(Object.keys(load(path.join(dir,'accounts.json')).users||{}).length)throw Error('An initialized trial has no workspace file. Restore its own backup; this launcher will not silently replace it with an empty database.');
 for(const rows of [seed.data,seed.timesheets,seed.customerReceipts,seed.journalEntries,seed.commercial.quotes,seed.commercial.contracts,seed.masters.customers,seed.masters.vendors,seed.awards,seed.vendorPayments,seed.costRates])if(!Array.isArray(rows)||rows.length)throw Error('The initial trial seed is not empty. No data changed.');
 if(seed.teamUsers.length!==1||seed.teamUsers[0].id!=='owner')throw Error('Unexpected startup users. No data changed.');
 console.log('Empty trial chosen, or no existing workspace. Startup never resets saved data.');
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main};
