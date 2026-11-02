'use strict';
// Reuse only this build/database. Bind an OS-selected port if preferred ports are unavailable.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),crypto=require('node:crypto'),cp=require('node:child_process');
const APP_DIR=__dirname,PACKAGE_DIR=path.dirname(APP_DIR),release=require('./release.json');
const DIR=path.resolve(process.env.RONIX_DATA_DIR||path.join(APP_DIR,'data'));
// An existing workspace always wins. The bundled seed is used only for a new database.
const initial=process.env.RONIX_INITIAL_BACKUP||path.join(APP_DIR,'data','initial-backup.json');
const instance=crypto.createHash('sha256').update(DIR).digest('hex').slice(0,16);
const RUN_DIR=process.env.RONIX_LAUNCH_LOG_DIR||PACKAGE_DIR;fs.mkdirSync(RUN_DIR,{recursive:true});
const report=path.join(RUN_DIR,'RONIX_STARTUP_REPORT.txt'),log=path.join(RUN_DIR,'RONIX_LOCAL_SERVER.log'),sessionFile=path.join(RUN_DIR,'RONIX_LOCAL_SESSION.json');
const validPort=p=>Number.isInteger(p)&&p>=1&&p<=65535;
const configured=Number(process.env.RONIX_FIRST_PORT||8800),first=validPort(configured)?configured:8800;
const ports=Array.from({length:Math.min(10,65536-first)},(_,i)=>first+i);
function note(m){fs.appendFileSync(report,new Date().toISOString()+' '+m+'\n')}
function health(port){return new Promise(resolve=>{if(!validPort(port)){resolve(null);return}const q=http.get({host:'127.0.0.1',port,path:'/api/health',timeout:450},r=>{let s='';r.on('data',c=>{s+=c;if(s.length>30000)q.destroy()});r.on('end',()=>{try{resolve(JSON.parse(s))}catch(_){resolve(null)}});r.on('error',()=>resolve(null));});q.on('timeout',()=>q.destroy());q.on('error',()=>resolve(null))})}
function free(port){return new Promise(resolve=>{const s=net.createServer();s.once('error',()=>resolve(false));s.listen(port,'127.0.0.1',()=>s.close(()=>resolve(true)))})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function ours(h){return !!h?.ok&&h.release?.build===release.build&&h.instance===instance&&h.uat===true}
function savedSession(){try{const s=JSON.parse(fs.readFileSync(sessionFile,'utf8')),u=new URL(s.url);const port=Number(u.port);return s.build===release.build&&s.instance===instance&&u.protocol==='http:'&&u.hostname==='127.0.0.1'&&validPort(port)?{...s,port}:null}catch(_){return null}}
function open(port,pid,reused){const url='http://127.0.0.1:'+port;let browserUrl=url;try{const token=fs.readFileSync(path.join(DIR,'setup-token.txt'),'utf8').trim();if(/^[a-f0-9]{64}$/.test(token))browserUrl=url+'/#setup='+token;}catch(_){}note('READY '+release.build+' '+url+' reused='+reused);fs.writeFileSync(sessionFile,JSON.stringify({url,pid,instance,build:release.build},null,2));console.log('RONIX_READY '+JSON.stringify({url,pid,reused}));console.log('Open in your browser: '+url);if(process.platform==='win32'&&!process.argv.includes('--no-open')){const child=cp.spawn('cmd.exe',['/d','/c','start','',browserUrl],{stdio:'ignore',windowsHide:true});child.on('error',e=>note('BROWSER_OPEN_FAILED '+e.message))}}
function start(port){
 return new Promise((resolve,reject)=>{
  note('START_SERVER requestedPort='+port);const fd=fs.openSync(log,'a');let child;
  try{child=cp.spawn(process.execPath,[path.join(APP_DIR,'server.js')],{cwd:APP_DIR,env:{...process.env,RONIX_INITIAL_BACKUP:initial,RONIX_DATA_DIR:DIR,RONIX_PORT:String(port),RONIX_HOST:'127.0.0.1',RONIX_UAT_MODE:'1'},detached:true,stdio:['ignore',fd,fd,'ipc'],windowsHide:true})}catch(e){reject(e);return}finally{fs.closeSync(fd)}
  let settled=false,verifying=false;
  const timer=setTimeout(()=>finish(Object.assign(Error('Server readiness timed out. See RONIX_LOCAL_SERVER.log; data is retained.'),{code:'START_TIMEOUT'})),20000);
  function finish(error,actualPort){
   if(settled)return;settled=true;clearTimeout(timer);
   if(child.connected)try{child.disconnect()}catch(_){}
   // Only the child launched by this call is stopped on failure. Never kill other applications.
   if(error){try{child.kill()}catch(_){}reject(error)}else resolve({port:actualPort,pid:child.pid});
   child.unref();
  }
  child.on('error',e=>finish(e));
  child.on('exit',(code,signal)=>finish(Object.assign(Error('Server stopped before readiness (exit '+code+', signal '+signal+'). See RONIX_LOCAL_SERVER.log; data is retained.'),{code:'SERVER_STOPPED'})));
  child.on('message',m=>{
   if(settled||!m||typeof m!=='object')return;
   if(m.type==='RONIX_LISTEN_ERROR'){finish(Object.assign(Error('Local port could not be bound: '+String(m.code||'UNKNOWN')),{code:m.code}));return}
   if(m.type!=='RONIX_LISTENING'||verifying)return;
   if(m.build!==release.build||m.instance!==instance||!validPort(m.port)||port!==0&&m.port!==port){finish(Object.assign(Error('Local server identity did not match this installation.'),{code:'WRONG_INSTANCE'}));return}
   verifying=true;
   (async()=>{for(let i=0;i<10&&!settled;i++){if(ours(await health(m.port))){finish(null,m.port);return}await sleep(100)}if(!settled)finish(Object.assign(Error('Local server health did not verify. See RONIX_LOCAL_SERVER.log; data is retained.'),{code:'HEALTH_MISMATCH'}))})().catch(e=>finish(e));
  });
 });
}
async function main(){
 fs.mkdirSync(DIR,{recursive:true});fs.writeFileSync(report,'RONIX '+release.version+' startup. Contains no passwords or company data.\n');
 if(!validPort(configured))note('INVALID_PREFERRED_PORT: using default 8800');
 const saved=savedSession();if(saved&&ours(await health(saved.port))){open(saved.port,saved.pid||null,true);return}
 for(const port of ports){if(saved?.port===port)continue;if(ours(await health(port))){open(port,null,true);return}}
 for(const port of ports){
  if(!await free(port)){note('SKIP_BUSY_OR_UNAVAILABLE_PORT '+port);continue}
  try{const r=await start(port);open(r.port,r.pid,false);return}catch(e){if(['EADDRINUSE','EACCES'].includes(e.code)){note('PORT_RETRY '+port+' '+e.code);if(ours(await health(port))){open(port,null,true);return}continue}throw e}
 }
 // Port 0 is allocated and held by the actual HTTP server, with no release/rebind race.
 note('PREFERRED_RANGE_UNAVAILABLE: requesting OS-assigned port');
 const r=await start(0);open(r.port,r.pid,false);
}
if(require.main===module)main().catch(e=>{try{note('FAILED '+(e.code||'')+' '+e.message)}catch(_){}console.error('RONIX_START_FAILED:',e.message);process.exitCode=1});
module.exports={health,free,ours};
