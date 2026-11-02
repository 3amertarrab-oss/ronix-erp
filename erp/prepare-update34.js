'use strict';
// Copy-only update: preserve the source database and every password hash.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),D=require('./domain');
const load=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function sourceData(input){const base=path.resolve(input);for(const p of [path.join(base,'app','data'),path.join(base,'data'),base])if(fs.existsSync(path.join(p,'workspace.json'))&&fs.existsSync(path.join(p,'accounts.json')))return p;throw Error('Select the existing RONIX folder containing app/data/workspace.json and accounts.json. Nothing changed.');}
function prepare(input,target=path.join(__dirname,'data'),backup=path.join(__dirname,'recovery','latest-backup.json')){
 if(fs.existsSync(path.join(target,'workspace.json'))){const store=load(path.join(target,'workspace.json'));D.validateStructure(store.doc);if(!Object.keys(load(path.join(target,'accounts.json')).users||{}).length)throw Error('Saved database has no login accounts. Restore its own accounts.json; codes will not be reset.');return {retained:true};}
 const src=sourceData(input);if(path.resolve(src)===path.resolve(target))throw Error('Choose the old installation, not the new package.');
 const wf=path.join(src,'workspace.json'),af=path.join(src,'accounts.json');const wbytes=fs.readFileSync(wf),abytes=fs.readFileSync(af),old=JSON.parse(wbytes),auth=JSON.parse(abytes),latest=load(backup);
 if(old.doc?.cleanTrial?.id!==latest.cleanTrial?.id)throw Error('The selected folder belongs to another database. Choose your current R42.3.9.33 installation. Nothing changed.');
 D.validateStructure(old.doc);const chosen=Number(old.revision)>=Number(latest.revision)?old:{revision:Number(latest.revision)||old.revision,updatedAt:latest.exportedAt||D.now(),doc:D.normalizeBackup(latest)};D.validateStructure(chosen.doc);
 const missing=chosen.doc.teamUsers.filter(u=>u.active!==false&&!auth.users?.[u.id]);if(missing.length)throw Error('The selected folder lacks login accounts for: '+missing.map(u=>u.name).join(', ')+'. Choose the current installation. No codes changed.');
 if(!fs.readFileSync(wf).equals(wbytes)||!fs.readFileSync(af).equals(abytes))throw Error('The old database changed while copying. Stop editing and launch again. Nothing changed.');
 let displaced='';const stage=target+'.staging34-'+Date.now();fs.mkdirSync(stage,{recursive:true});
 try{fs.writeFileSync(path.join(stage,'workspace.json'),JSON.stringify(chosen));fs.writeFileSync(path.join(stage,'accounts.json'),abytes);fs.copyFileSync(backup,path.join(stage,'initial-backup.json'));fs.writeFileSync(path.join(stage,'UPDATE_PROVENANCE.json'),JSON.stringify({version:'R42.3.9.34',at:D.now(),sourceDirectory:src,dataSource:chosen===old?'current_installation':'user_uploaded_latest_backup',revision:chosen.revision,passwordsPreserved:true},null,2));
  if(fs.existsSync(target)){if(fs.existsSync(path.join(target,'workspace.json')))throw Error('Target initialized during copy; stop and reopen.');displaced=target+'.seed-before34-'+Date.now();fs.renameSync(target,displaced);}fs.renameSync(stage,target);
 }catch(e){if(displaced&&!fs.existsSync(target)&&fs.existsSync(displaced))fs.renameSync(displaced,target);fs.rmSync(stage,{recursive:true,force:true});throw e;}
 return {copied:true,revision:chosen.revision,passwordsPreserved:true};
}
function main(){const target=process.env.RONIX_DATA_DIR||path.join(__dirname,'data');if(fs.existsSync(path.join(target,'workspace.json')))return prepare('',target);let source=process.env.RONIX_SOURCE_DIR||'';
 if(!source&&process.platform==='win32'){
  const script="$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='Select your current RONIX R42.3.9.33 folder to preserve data and login codes'; $d.ShowNewFolderButton=$false; if($d.ShowDialog() -eq 'OK'){[Console]::Write($d.SelectedPath)}";
  const r=cp.spawnSync('powershell.exe',['-NoProfile','-STA','-Command',script],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error('Folder selection could not open. Set RONIX_SOURCE_DIR to the existing RONIX folder.');source=r.stdout.trim();
 }
 if(!source)throw Error('No source folder selected. Choose the existing RONIX installation; data and codes were not changed.');return prepare(source,target);
}
if(require.main===module)try{console.log(JSON.stringify(main()))}catch(e){const report=path.join(__dirname,'..','RONIX_STARTUP_REPORT.txt');fs.appendFileSync(report,'\nUPDATE34: '+e.message+'\n');console.error(e.message);process.exitCode=1;}
module.exports={prepare,sourceData,main};
