'use strict';
// R42.3.8: authenticated shared state with finance separation, one-click operations, 4-character local access codes.
const http=require('node:http'),https=require('node:https'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),os=require('node:os');
const {promisify}=require('node:util');const scrypt=promisify(crypto.scrypt);
const ProjectPhoto=require('./project-image');
const U=require('./unified');
const D=require('./domain');const Reports=require('./reports'),XLSX=require('./xlsx'),WorkingBook=require('./working-book');const {RELEASE,assert,AppError}=D;
const HOME=__dirname,ROOT=path.join(HOME,'site'),DIR=process.env.RONIX_DATA_DIR||path.join(HOME,'data');
const FILE=path.join(DIR,'workspace.json'),AUTH=path.join(DIR,'accounts.json'),AUDIT=path.join(DIR,'audit-log.ndjson'),TOKEN=path.join(DIR,'setup-token.txt');
const PORT=Number(process.env.RONIX_PORT||8788),HOST=process.env.RONIX_HOST||'127.0.0.1';
const PUBLIC=process.env.RONIX_PUBLIC_MODE==='1';
const PASSWORD_MIN=PUBLIC?12:4;
const TLS=!!(process.env.RONIX_TLS_KEY&&process.env.RONIX_TLS_CERT);
const UAT=process.env.RONIX_UAT_MODE==='1';
if(UAT&&HOST!=='127.0.0.1')throw Error('Local UAT must bind to 127.0.0.1 only');
const THUMB_FILE=path.join(HOME,'thumbnail-cache.json');const thumbCache=fs.existsSync(THUMB_FILE)?JSON.parse(fs.readFileSync(THUMB_FILE,'utf8')):{};
fs.mkdirSync(DIR,{recursive:true});fs.mkdirSync(path.join(DIR,'snapshots'),{recursive:true});
function atomic(file,obj){const tmp=file+'.'+crypto.randomBytes(5).toString('hex')+'.tmp';const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(obj,null,2));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(tmp,file)}
function load(file){return JSON.parse(fs.readFileSync(file,'utf8'))} // Never replace unreadable data with demo data.
let store;
if(fs.existsSync(FILE)){store=load(FILE);D.validateStructure(store.doc);if(store.doc.schemaVersion!==RELEASE.schemaVersion){fs.copyFileSync(FILE,path.join(DIR,'pre-'+RELEASE.version+'-migration.json'));store.doc=D.normalizeBackup(store.doc);atomic(FILE,store)}}
else {const input=process.env.RONIX_INITIAL_BACKUP||path.join(DIR,'initial-backup.json');assert(fs.existsSync(input),'INITIAL_DATA_MISSING','ملف بيانات البداية غير موجود');const original=load(input);if(!original.legacyArchive&&fs.existsSync(path.join(DIR,'legacy-archive.json')))original.legacyArchive=load(path.join(DIR,'legacy-archive.json'));store={revision:1,updatedAt:D.now(),doc:D.normalizeBackup(original)};store.doc.sourceImport={filename:path.basename(input),sha256:crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex'),importedAt:D.now()};atomic(FILE,store)}
let auth=fs.existsSync(AUTH)?load(AUTH):{users:{},createdAt:null};
let setupToken='';if(!Object.keys(auth.users).length){setupToken=fs.existsSync(TOKEN)?fs.readFileSync(TOKEN,'utf8').trim():crypto.randomBytes(32).toString('hex');fs.writeFileSync(TOKEN,setupToken,{mode:0o600})}
const sessions=new Map(),failedLogins=new Map();
const INSTANCE=crypto.createHash('sha256').update(path.resolve(DIR)).digest('hex').slice(0,16);
function localUAT(req){return UAT&&loopback(req)&&['127.0.0.1','localhost'].includes(new URL('http://'+req.headers.host).hostname)}
function sessionInfo(req,u,s){const root=s.testOwnerId&&store.doc.teamUsers.find(x=>x.id===s.testOwnerId&&x.role==='Owner'&&x.active!==false);return {user:D.publicUser(u),csrf:s.csrf,release:RELEASE,instance:INSTANCE,contextId:s.contextId,uat:{enabled:localUAT(req),canSwitch:localUAT(req)&&(u.role==='Owner'||!!root),testing:!!root,ownerName:root?.name||''}}}
function sessionCookieName(req){return `ronix_session_${INSTANCE}_${req.socket.localPort}`;}
function sessionCookie(token,req,clear=false){return `${sessionCookieName(req)}=${token}; Path=/; HttpOnly; SameSite=Strict${clear?'; Max-Age=0':''}${TLS||PUBLIC?'; Secure':''}`;}
function testAudit(doc,s){if(!s.testOwnerId)return;const a=doc.ops.audit.at(-1);if(a){a.testOwnerId=s.testOwnerId;a.mode='owner_local_uat';delete a.hash;a.hash=D.hash(a)}}
const serverKeys=new Set(Object.keys(D.LEGACY_KEYS));
function loopback(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)}
async function credential(password){assert(typeof password==='string'&&password.length>=PASSWORD_MIN&&password.length<=128,'PASSWORD_LENGTH','كلمة المرور يجب أن تكون من '+PASSWORD_MIN+' إلى 128 محرفًا');const salt=crypto.randomBytes(16).toString('hex');const derived=await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});return {salt,hash:derived.toString('hex')}}
async function verify(password,c){if(!c||typeof password!=='string'||password.length>128||(PUBLIC&&password.length<PASSWORD_MIN))return false;const h=await scrypt(password,c.salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});return crypto.timingSafeEqual(h,Buffer.from(c.hash,'hex'))}
function cookie(req){const prefix=sessionCookieName(req)+'=';const raw=String(req.headers.cookie||'').split(';').find(x=>x.trim().startsWith(prefix));return raw?raw.trim().slice(prefix.length):''}
function current(req){const id=cookie(req),s=sessions.get(id);if(!s||s.expiry<Date.now()||s.lastSeen+60*60e3<Date.now()){if(id)sessions.delete(id);throw new AppError('LOGIN_REQUIRED','يرجى تسجيل الدخول',401)}const u=store.doc.teamUsers.find(x=>x.id===s.userId&&x.active!==false);assert(u&&auth.users[u.id]&&auth.users[u.id].active!==false,'LOGIN_REQUIRED','الحساب غير فعال',401);s.lastSeen=Date.now();return {user:u,session:s,token:id}}
function send(res,status,body,type='application/json; charset=utf-8',extra={}){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",...extra});res.end(body)}
function json(res,status,obj,headers={}){send(res,status,JSON.stringify(obj),undefined,headers)}
function readBody(req,max=24e6){return new Promise((resolve,reject)=>{const chunks=[];let n=0,settled=false,tooLarge=false;req.on('data',c=>{if(tooLarge)return;n+=c.length;if(n>max){tooLarge=true;chunks.length=0;settled=true;reject(new AppError('BODY_TOO_LARGE','الملف أكبر من الحد المسموح',413))}else chunks.push(c)});req.on('end',()=>{if(settled)return;try{settled=true;resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'))}catch(_){settled=true;reject(new AppError('INVALID_JSON','ملف JSON غير صالح'))}});req.on('error',e=>{if(!settled){settled=true;reject(e)}})})}
function finance(u){assert(D.FINANCE.has(u.role),'FINANCE_FORBIDDEN','البيانات المالية للمالك والحسابات فقط',403)}
function csrf(req,s){assert(req.headers['x-ronix-csrf']===s.csrf,'CSRF_REQUIRED','تعذر التحقق من جلسة العملية',403)}
function origin(req){const o=req.headers.origin;if(o){let host;try{host=new URL(o).host}catch(_){throw new AppError('ORIGIN_FORBIDDEN','مصدر غير مسموح',403)}assert(host===req.headers.host,'ORIGIN_FORBIDDEN','مصدر غير مسموح',403)}assert(!['cross-site'].includes(req.headers['sec-fetch-site']),'ORIGIN_FORBIDDEN','مصدر غير مسموح',403)}
function revision(b){assert(Number.isInteger(b.baseRevision)&&b.baseRevision===store.revision,'REVISION_CONFLICT','تغيرت البيانات على الخادم؛ احتفظ بالتعديل ثم حدث الصفحة قبل إعادة المحاولة',409)}
function commit(doc,{restore=false}={}){
 if(!restore){
 U.syncIdentity(doc,store.doc);
 for(const kind of ['quotes','contracts'])for(const old of store.doc.commercial[kind].filter(x=>x.integrated1007)){
  const current=doc.commercial[kind].find(x=>x.id===old.id);
  for(const key of ['integrated1007','lines','projectId','customerId','currency','number'])assert(current&&D.hash(current[key])===D.hash(old[key]),'APPROVED_SOURCE_LOCKED','المستند المعتمد ثابت؛ أنشئ مراجعة مستقلة',409);
  const terms=rows=>(rows||[]).map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['claimed','paid','claimId','claimedBy','claimedAt','status'].includes(key))));
  for(const key of ['schedule','paymentSchedule'])assert(D.hash(terms(current[key]))===D.hash(terms(old[key])),'APPROVED_SCHEDULE_LOCKED','نسب وشروط الدفعات المعتمدة ثابتة',409);
 }
 }
 D.Flow.reconcile(doc,D);D.validateStructure(doc);const prev=store;const next={revision:prev.revision+1,updatedAt:D.now(),doc};
 const snapshot=path.join(DIR,'snapshots',String(prev.revision).padStart(8,'0')+'.json');if(!fs.existsSync(snapshot))fs.copyFileSync(FILE,snapshot);
 atomic(FILE,next);store=next;
 // The audit is part of workspace.json's atomic transaction. The NDJSON file is a second index.
 try{const oldIds=new Set(prev.doc.ops.audit.map(a=>a.id));for(const row of doc.ops.audit.filter(x=>!oldIds.has(x.id)))fs.appendFileSync(AUDIT,JSON.stringify(row)+'\n',{mode:0o600})}catch(e){console.error('Audit index warning (canonical audit retained):',e.message)}
 const files=fs.readdirSync(path.join(DIR,'snapshots')).filter(n=>/^\d+\.json$/.test(n)).sort();for(const name of files.slice(0,-40)){fs.unlinkSync(path.join(DIR,'snapshots',name))}
 return next;
}
function backup(){const x=D.clone(store.doc);x.version=RELEASE.build;x.schemaVersion=RELEASE.schemaVersion;x.exportedAt=D.now();x.build=RELEASE.build;x.revision=store.revision;
 x.extensions={...(x.extensions||{}),...Object.fromEntries(['awards','vendorPayments','teamUsers','projectImages','customerReceipts','projectCostCenters','journalEntries'].map(k=>[k,x[k]]))};x.integrity={release:RELEASE.build,storageMode:'authenticated_server',collections:Object.fromEntries(Object.values(D.LEGACY_KEYS).map(k=>[k,D.hash(x[k])]))};return x}
function crc32(buffer){let c=0xffffffff;for(const b of buffer){c^=b;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1}return (c^0xffffffff)>>>0}
function zip(items){const local=[],central=[];let offset=0;for(const [name,body] of Object.entries(items)){const nb=Buffer.from(name),content=Buffer.from(typeof body==='string'?body:JSON.stringify(body,null,2)),crc=crc32(content);const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt32LE(crc,14);h.writeUInt32LE(content.length,18);h.writeUInt32LE(content.length,22);h.writeUInt16LE(nb.length,26);local.push(h,nb,content);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt32LE(crc,16);c.writeUInt32LE(content.length,20);c.writeUInt32LE(content.length,24);c.writeUInt16LE(nb.length,28);c.writeUInt32LE(offset,42);central.push(c,nb);offset+=h.length+nb.length+content.length}const cb=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50);e.writeUInt16LE(Object.keys(items).length,8);e.writeUInt16LE(Object.keys(items).length,10);e.writeUInt32LE(cb.length,12);e.writeUInt32LE(offset,16);return Buffer.concat([...local,cb,e])}
function diag(u,ui){const snap=D.snapshot(store.doc,u,store.revision);const findings=D.FINANCE.has(u.role)?D.issues(store.doc):[];const state={build:RELEASE.build,revision:store.revision,user:D.publicUser(u),collectedAt:D.now(),coverage:{dataChecks:D.FINANCE.has(u.role)?'RUN':'REDACTED_FOR_ROLE',browserChecks:'USER_CAPTURE_NOT_CERTIFICATION',financialAccess:D.FINANCE.has(u.role)},findings};
 const note=D.text(ui?.note,6000),safeUI={page:D.text(ui?.page,100),viewport:ui?.viewport||{},visibleMenuIds:Array.isArray(ui?.visibleMenuIds)?ui.visibleMenuIds.map(x=>D.text(x,80)).slice(0,50):[],expectedMenuIds:Array.isArray(ui?.expectedMenuIds)?ui.expectedMenuIds.map(x=>D.text(x,80)).slice(0,50):[],menuCount:ui?.menuCount??null,route:D.text(ui?.route,150)};
 const errors=(ui?.errors||[]).slice(-30).map(e=>({type:D.text(e.type,80),message:D.text(e.message,400),at:D.text(e.at,50)}));
 const timings=(ui.timings||[]).slice(-80).map(x=>({operation:D.text(x.operation,120),ms:Number.isFinite(x.ms)?Math.round(x.ms):null,status:Number(x.status)||0,at:D.text(x.at,50)}));
 const files={'08_PERFORMANCE_TIMINGS.json':timings,'00_AI_DIAGNOSTIC_INDEX.json':state,'01_RELEASE.json':RELEASE,'02_USER_REPORT.json':{note,user:D.publicUser(u),at:D.now()},'03_UI_STATE.json':safeUI,'04_OPERATIONAL_SNAPSHOT.json':snap,'05_RUNTIME_ERRORS.json':errors,'06_DATA_FINDINGS.json':findings,'07_LAST_ACTIONS.json':(ui?.actions||[]).slice(-20).map(x=>({action:D.text(x.action,80),at:D.text(x.at,50)})),'README_FOR_REVIEW.txt':'This is diagnostic evidence, not a certification. UI checks are captured at export time. Match build and revision before comparing issues. No passwords, session cookies or CSRF tokens are included. Non-financial roles receive only their authorized operational projection. No automatic correction was run.'};return zip(files)}
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.json':'application/json; charset=utf-8'};
function staticFile(req,res,url){
 const rel=url.pathname==='/'?'/index.html':url.pathname;assert(!rel.includes('\\')&&!rel.includes('\0'),'INVALID_PATH','مسار غير صالح',400);const file=path.resolve(ROOT,'.'+rel);assert(file.startsWith(ROOT+path.sep),'FORBIDDEN','غير مسموح',403);
 const canonical='/'+path.relative(ROOT,file).split(path.sep).join('/');
 if(canonical==='/modules/finance.html')assert(U.accounting(current(req).user),'FORBIDDEN','الحسابات للمالك والمحاسب فقط',403);
 if(canonical==='/modules/commercial.html')assert(U.commercial(current(req).user),'FORBIDDEN','المستندات غير متاحة لهذا الدور',403);
 if(['/legacy.html','/assets/ronix-r42-clean.js','/assets/legacy-bridge.js','/assets/legacy-bootstrap.js','/assets/legacy-feedback.js'].includes(canonical)){const u=current(req).user;assert(D.FINANCE.has(u.role),'FORBIDDEN','الشاشة غير متاحة لهذا الدور',403);}
 if(/^\/assets\/project-/.test(canonical)){const u=current(req).user;const ids=Object.entries(store.doc.projectImages).filter(([id,im])=>im.src===canonical.slice(1)).map(([id])=>id);assert(D.FINANCE.has(u.role)||ids.some(id=>{const p=store.doc.data.find(x=>x.id===id);return p&&D.visible(u,p)}),'FORBIDDEN','صورة مشروع غير مصرح بها',403);}
 assert(fs.existsSync(file)&&fs.statSync(file).isFile(),'NOT_FOUND','الملف غير موجود',404);send(res,200,fs.readFileSync(file),MIME[path.extname(file)]||'application/octet-stream');
}
async function handler(req,res){try{
 const url=new URL(req.url,'http://localhost');origin(req);if(UAT)assert(localUAT(req),'LOCAL_UAT_ONLY','وضع الاختبار محلي على جهاز الإدارة فقط',403);
 if(url.pathname==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,release:RELEASE,passwordMinLength:PASSWORD_MIN,publicMode:PUBLIC,setupRequired:!Object.keys(auth.users).length,tls:TLS,networkEnabled:HOST!=='127.0.0.1',uat:localUAT(req),instance:INSTANCE});
 if(url.pathname==='/api/login-options'&&req.method==='GET'){assert(localUAT(req),'LOCAL_UAT_ONLY','قائمة الاختبار محلية فقط',403);return json(res,200,{users:store.doc.teamUsers.filter(x=>x.active!==false&&auth.users[x.id]?.active!==false).map(D.publicUser)})}
 if(url.pathname==='/api/setup'&&req.method==='POST'){
   assert(!Object.keys(auth.users).length,'SETUP_COMPLETE','الإعداد تم مسبقًا',409);assert(loopback(req),'LOCAL_SETUP_ONLY','الإعداد الأول على جهاز الإدارة فقط',403);const b=await readBody(req,10000);assert(setupToken&&b.token===setupToken,'SETUP_TOKEN_REQUIRED','افتح البرنامج من START_RONIX.cmd لإعداد حساب المالك',403);const c=await credential(b.password);assert(!Object.keys(auth.users).length&&setupToken===b.token,'SETUP_COMPLETE','الإعداد تم مسبقًا',409);auth.users.owner={...c,active:true,updatedAt:D.now()};auth.createdAt=D.now();atomic(AUTH,auth);setupToken='';try{fs.unlinkSync(TOKEN)}catch(_){}return json(res,200,{ok:true});
 }
 if(url.pathname==='/api/login'&&req.method==='POST'){
   const ip=req.socket.remoteAddress||'',key=ip;const f=failedLogins.get(key);assert(localUAT(req)||!f||f.count<5||Date.now()-f.at>10*60e3,'TOO_MANY_ATTEMPTS','محاولات كثيرة؛ انتظر 10 دقائق',429);const b=await readBody(req,10000),u=store.doc.teamUsers.find(x=>x.id===b.id&&x.active!==false);
   if(!u||!auth.users[u.id]||auth.users[u.id].active===false||!(await verify(b.password,auth.users[u.id]))){if(!localUAT(req))failedLogins.set(key,{count:f&&Date.now()-f.at<10*60e3?f.count+1:1,at:Date.now()});throw new AppError('BAD_LOGIN','اسم الحساب أو كلمة المرور غير صحيح',401)}
   failedLogins.delete(key);const token=crypto.randomBytes(32).toString('hex'),s={contextId:crypto.randomBytes(12).toString('hex'),userId:u.id,csrf:crypto.randomBytes(24).toString('hex'),expiry:Date.now()+8*60*60e3,lastSeen:Date.now()};sessions.set(token,s);return json(res,200,{ok:true,...sessionInfo(req,u,s)},{'Set-Cookie':sessionCookie(token,req)});
 }
 if(!url.pathname.startsWith('/api/'))return staticFile(req,res,url);
 const {user:actualUser,session:s,token}=current(req);const u=D.Access.effective(actualUser);if(req.method!=='GET')csrf(req,s);
 if(url.pathname.startsWith('/api/unified/')){
   const area=url.pathname.slice('/api/unified/'.length);
   if(req.method==='GET'&&['finance','commercial'].includes(area)){const result=U.read(store.doc,u,area);return json(res,200,area==='finance'?{...result,baseRevision:store.revision}:result);}
   if(req.method==='POST'){
     if(area==='finance-import-preview'){
       assert(u.role==='Owner','OWNER_ONLY','استيراد الحسابات للمالك فقط',403);const b=await readBody(req,8*1024*1024);
       const result=U.financeImportPreview(store.doc,u,b.backup);
       return json(res,200,{...result,baseRevision:store.revision});
     }
     if(area==='finance-import-commit'){
       assert(u.role==='Owner','OWNER_ONLY','استيراد الحسابات للمالك فقط',403);const b=await readBody(req,8*1024*1024);
       assert(b.confirm===true,'IMPORT_CONFIRM_REQUIRED','راجع معاينة الدمج ثم أكد العملية',400);
       assert(typeof b.importHash==='string'&&/^[a-f0-9]{64}$/i.test(b.importHash),'IMPORT_HASH_REQUIRED','بصمة ملف الاستيراد مطلوبة',400);
       assert(typeof b.previewHash==='string'&&b.previewHash.length>=16,'PREVIEW_REQUIRED','راجع معاينة الاستيراد أولًا',400);
       const root=U.root(store.doc),prior=(root.imports||[]).find(x=>x?.kind==='finance-v20'&&x.importHash===b.importHash);
       if(prior)return json(res,200,{replayed:true,importHash:prior.importHash,previewHash:prior.previewHash,financeRevision:prior.financeRevisionTo??root.finance.revision,counts:D.clone(prior.counts||{}),add:D.clone(prior.add||{}),identical:D.clone(prior.identical||{}),totals:D.clone(prior.totals||{}),import:D.clone(prior),baseRevision:store.revision});
       assert(Number.isInteger(b.financeRevision)&&b.financeRevision>=0,'FINANCE_REVISION_REQUIRED','إصدار الحسابات من المعاينة مطلوب',400);
       revision(b);
       const doc=D.clone(store.doc),result=U.financeImportCommit(doc,u,b.backup,{importHash:b.importHash,previewHash:b.previewHash,financeRevision:b.financeRevision});
       D.event(doc,u,'unified_finance_import','',{importHash:result.importHash||b.importHash||'',previewHash:b.previewHash||'',financeRevision:result.financeRevision??b.financeRevision});
       testAudit(doc,s);const next=commit(doc,{reason:'finance_import'});return json(res,200,{...result,baseRevision:next.revision});
     }
     const b=await readBody(req);
     if(area==='migration-preview'){assert(u.role==='Owner','OWNER_ONLY','فحص النقل للمالك فقط',403);return json(res,200,U.migration(b.backup,store.doc));}
     const doc=D.clone(store.doc);let result;
     if(area==='finance')result=U.saveFinance(doc,u,b);
     else if(area==='commercial')result=U.saveDocument(doc,u,b);
     else if(area==='approve')result=U.approve(doc,u,b);
     else if(area==='link')result=U.link(doc,u,b);
     else if(area==='handoff')result=U.handoff(doc,u,b);
     else throw new AppError('NOT_FOUND','المسار غير موجود',404);
     D.event(doc,u,'unified_'+area,b.projectId||'',{moduleRevision:result.revision});
     testAudit(doc,s);commit(doc);return json(res,200,result);
   }
 }
 if(url.pathname==='/api/session'&&req.method==='GET')return json(res,200,sessionInfo(req,actualUser,s));
 if(url.pathname==='/api/uat/switch'&&req.method==='POST'){
   assert(localUAT(req),'LOCAL_UAT_ONLY','تبديل الأدوار لوضع الاختبار المحلي فقط',403);
   const rootId=s.testOwnerId||(actualUser.role==='Owner'?actualUser.id:'');const root=store.doc.teamUsers.find(x=>x.id===rootId&&x.role==='Owner'&&x.active!==false);
   assert(root&&auth.users[rootId]?.active!==false,'OWNER_TEST_ONLY','تبديل الأدوار خاص بجلسة اختبار بدأها المالك',403);
   const b=await readBody(req,10000);const target=store.doc.teamUsers.find(x=>x.id===b.userId&&x.active!==false&&auth.users[x.id]&&auth.users[x.id].active!==false);assert(target,'INVALID_USER','اختر موظفًا فعالًا');
   const tok=crypto.randomBytes(32).toString('hex'),next={contextId:crypto.randomBytes(12).toString('hex'),userId:target.id,csrf:crypto.randomBytes(24).toString('hex'),expiry:Date.now()+8*60*60e3,lastSeen:Date.now(),testOwnerId:target.id===rootId?null:rootId};
   sessions.delete(token);sessions.set(tok,next);
   return json(res,200,sessionInfo(req,target,next),{'Set-Cookie':sessionCookie(tok,req)});
 }
 if(url.pathname==='/api/logout'&&req.method==='POST'){sessions.delete(token);return json(res,200,{ok:true},{'Set-Cookie':sessionCookie('',req,true)})}
 if(url.pathname==='/api/reports'&&req.method==='GET')return json(res,200,{reports:[...Reports.available(u),...(D.FINANCE.has(u.role)?[{id:'working_pack',ar:'دفتر العمل المتكامل — مشاريع ووقت وقبض وسيناريو',en:'Integrated working workbook — projects, time, receipts, scenario'}]:[])],release:RELEASE,revision:store.revision});
 if(url.pathname==='/api/export'&&req.method==='POST'){
   D.Daily.enforce(store.doc,u,'export');const b=await readBody(req,40000);revision(b);
   const mode=b.mode||'dynamic';assert(['dynamic','snapshot'].includes(mode),'INVALID_EXPORT_MODE','نوع ملف التصدير غير صحيح');
   assert(b.report!=='working_pack'||mode==='dynamic','WORKBOOK_REQUIRES_DYNAMIC','دفتر العمل المتكامل يتطلب وضع المعادلات والجداول؛ اختر تقريرًا منفصلًا للتصدير المرجعي الثابت.');
   const meta={build:RELEASE.build,revision:store.revision,at:D.now(),user:actualUser.name,role:actualUser.role,mode};
   const report=b.report==='working_pack'?{kind:'working_pack'}:Reports.build(store.doc,u,b.report,b.filters||{},D);
   const file=b.report==='working_pack'?WorkingBook.make(store.doc,u,b.filters||{},meta,zip,D):XLSX.make(report,meta,zip);
   return send(res,200,file,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',{'Content-Disposition':`attachment; filename="RONIX_${RELEASE.version}_${report.kind}.xlsx"`});
 }
 if(url.pathname==='/api/project-images/meta'&&req.method==='GET')return json(res,200,{revision:store.revision,projects:store.doc.data.filter(p=>!D.C.removed(p)&&D.visible(u,p)).map(p=>({id:p.id,name:p.name,imageAvailable:D.W.imageEligible(store.doc,p),imageRevision:store.doc.projectImages[p.id]?.updatedAt||''}))});
 if(url.pathname==='/api/supplier-workspace'&&req.method==='GET')return json(res,200,D.Supplier.view(store.doc,actualUser,D));
 if(url.pathname==='/api/delete-project-preview'&&req.method==='POST'){const b=await readBody(req,10000);return json(res,200,D.Supplier.deletePreview(store.doc,actualUser,b.projectId,D));}
 if(url.pathname==='/api/workspace'&&req.method==='GET')return json(res,200,D.snapshot(store.doc,u,store.revision));
 // Session identity is the stored account, not its permission projection.
 // A Projects Engineer can have owner-equivalent access without becoming Owner.
 if(url.pathname==='/api/state/meta'&&req.method==='GET')return json(res,200,{revision:store.revision,updatedAt:store.updatedAt,build:RELEASE.build,userId:actualUser.id,role:actualUser.role,instance:INSTANCE,contextId:s.contextId,workDate:D.Daily.today(store.doc)});
 if(url.pathname==='/api/commercial-state'&&req.method==='GET')return json(res,200,D.Commercial.state(store.doc,u,store.revision,D));
 if(url.pathname==='/api/commercial-state'&&req.method==='POST'){assert(!U.root(store.doc).commercial.documents.some(x=>x.status==='approved'),'USE_UNIFIED','استخدم محرر العقود والعروض الموحد للحفاظ على المستندات المعتمدة',409);const b=await readBody(req);revision(b);D.Daily.enforce(store.doc,u,'finance_write');const doc=D.clone(store.doc);const result=D.Commercial.save(doc,u,b,D);testAudit(doc,s);const next=commit(doc);return json(res,200,{ok:true,...result,revision:next.revision});}
 if(url.pathname==='/api/state'&&req.method==='GET'){finance(u);return json(res,200,{revision:store.revision,updatedAt:store.updatedAt,release:RELEASE.build,user:D.publicUser(actualUser),state:D.legacyState(store.doc),financialViews:store.doc.data.filter(p=>!D.C.removed(p)).map(p=>({id:p.id,finance:D.V.view(store.doc,p),cost:D.Supplier.cost(store.doc,p.id,D)})),orders:store.doc.ops.orders.map(o=>({id:o.id,projectId:o.projectId,pmAck:o.pmAck,status:o.status}))})}
 if(url.pathname==='/api/customers'&&req.method==='POST'){
   assert(D.FINANCE.has(u.role),'FORBIDDEN','إضافة العميل للمالك ومهندس المشروعات والحسابات',403);
   const b=await readBody(req,20000);assert(typeof b.requestId==='string'&&/^[a-f0-9-]{16,60}$/i.test(b.requestId),'REQUEST_ID_REQUIRED','معرف الحفظ مطلوب');
   const key=u.id+':customer:'+b.requestId,digest=D.hash({name:b.name||'',phone:b.phone||'',email:b.email||'',address:b.address||'',nationalId:b.nationalId||'',taxNo:b.taxNo||'',commercialReg:b.commercialReg||''});
   const prior=store.doc.ops.idempotency[key];if(prior){assert(prior.digest===digest,'REQUEST_ID_REUSED','معرف الحفظ مستخدم لبيانات مختلفة',409);return json(res,200,{ok:true,replayed:true,...prior.result,revision:store.revision})}
   revision(b);const doc=D.clone(store.doc),name=D.text(b.name,120),nid=D.text(b.nationalId,30);
   assert(!nid||/^\d{14}$/.test(nid),'INVALID_NATIONAL_ID','الرقم القومي عند إدخاله يجب أن يكون 14 رقمًا');
   assert(!name||!doc.masters.customers.some(c=>String(c.name||'').trim().toLowerCase()===name.toLowerCase()),'DUPLICATE_CUSTOMER','اسم العميل مستخدم بالفعل',409);
   assert(!nid||!doc.masters.customers.some(c=>c.nationalId===nid),'DUPLICATE_NATIONAL_ID','الرقم القومي مستخدم بالفعل',409);
   const ids=new Set(doc.masters.customers.map(c=>c.id));let n=1;while(ids.has('CUS-'+String(n).padStart(3,'0')))n++;const id='CUS-'+String(n).padStart(3,'0');
   const customer={id,name:name||'عميل '+id,phone:D.text(b.phone,80),email:D.text(b.email,160),address:D.text(b.address,500),nationalId:nid,taxNo:D.text(b.taxNo,100),commercialReg:D.text(b.commercialReg,100),notes:'',active:true};
   doc.masters.customers.push(customer);D.event(doc,u,'customer_create','',{id});const result={customer};doc.ops.idempotency[key]={digest,result,at:D.now()};
   const next=commit(doc);return json(res,200,{ok:true,...result,revision:next.revision});
 }
 if(url.pathname==='/api/state'&&req.method==='POST'){
   finance(u);D.Daily.enforce(store.doc,u,'finance_write');const b=await readBody(req);revision(b);const doc=D.clone(store.doc);const result=D.financeBatch(doc,u,b);const next=commit(doc);return json(res,200,{ok:true,...result,revision:next.revision});
 }
 if(url.pathname==='/api/action'&&req.method==='POST'){
   const b=await readBody(req,5e6);assert(!((U.root(store.doc).links.some(l=>l.projectId===b.projectId)||U.root(store.doc).commercial.documents.some(x=>x.projectId===b.projectId&&x.status==='approved'))&&['receipt_add','claim_issue'].includes(b.type)),'USE_APPROVED_ACCOUNTS','سجل المطالبات والقبض من الحسابات المعتمدة لهذا المشروع',409);assert(typeof b.actionId==='string'&&/^[A-Za-z0-9_-]{12,100}$/.test(b.actionId),'ACTION_ID_REQUIRED','معرف العملية مطلوب');
   const idKey=u.id+':'+b.actionId;const digest=D.hash({type:b.type,projectId:b.projectId||'',payload:b.payload||{}});const prior=store.doc.ops.idempotency[idKey];
   if(prior){assert(prior.digest===digest,'ACTION_ID_REUSED','معرف العملية استعمل لبيانات مختلفة',409);return json(res,200,{ok:true,replayed:true,...prior.result,revision:store.revision})}
   revision(b);const doc=D.clone(store.doc);const result=D.runAction(doc,u,b);testAudit(doc,s);doc.ops.idempotency[idKey]={digest,result,at:D.now()};const keys=Object.keys(doc.ops.idempotency);for(const k of keys.slice(0,-10000))delete doc.ops.idempotency[k];const next=commit(doc);return json(res,200,{ok:true,...result,revision:next.revision});
 }
 if(url.pathname==='/api/users'&&req.method==='GET'){assert(u.role==='Owner','OWNER_ONLY','إدارة الحسابات للمالك',403);return json(res,200,{users:store.doc.teamUsers.map(x=>({...D.publicUser(x),hasPassword:!!auth.users[x.id],accountActive:auth.users[x.id]?.active!==false}))})}
 if(url.pathname==='/api/users'&&req.method==='POST'){
   assert(u.role==='Owner','OWNER_ONLY','إدارة الحسابات للمالك',403);const b=await readBody(req,20000);const userRequest=b.requestId?String(b.requestId):'';if(userRequest)assert(/^[A-Za-z0-9_-]{12,100}$/.test(userRequest),'INVALID_REQUEST','معرف حفظ الموظف غير صالح.');const creationKey=userRequest?u.id+':user:'+userRequest:'';const creationDigest=D.hash({...b,password:b.password?crypto.createHash('sha256').update(b.password).digest('hex'):''});if(creationKey&&store.doc.ops.idempotency[creationKey]){const hit=store.doc.ops.idempotency[creationKey];assert(hit.digest===creationDigest,'REQUEST_ID_REUSED','تغيرت بيانات طلب إضافة الموظف.',409);return json(res,200,{ok:true,replayed:true,...hit.result});}b.id=b.id||(userRequest?'EMP-'+crypto.createHash('sha256').update(u.id+userRequest).digest('hex').slice(0,24):'EMP-'+crypto.randomUUID());b.role=D.Access.canonical(b.role);assert(typeof b.id==='string'&&/^[a-zA-Z0-9_-]{1,60}$/.test(b.id),'INVALID_ID','معرّف الحساب يقبل الحروف الإنجليزية والأرقام والشرطة فقط. اتركه فارغًا لتوليده تلقائيًا.');assert(D.ROLES.includes(b.role),'INVALID_ROLE','دور غير صالح');assert(b.id!=='owner'||b.role==='Owner'&&b.active!==false,'OWNER_REQUIRED','لا يمكن تعطيل المالك');const existing=store.doc.teamUsers.find(x=>x.id===b.id);assert(existing||b.password,'PASSWORD_REQUIRED','كلمة المرور مطلوبة للحساب الجديد');if(existing&&b.active===false){const openProjects=store.doc.data.filter(p=>!p.operationalClosed&&(p.pm===b.id||p.projectEngineer===b.id||p.checker===b.id||p.tasks.some(t=>(t.assignee===b.id||t.checker===b.id)&&t.status!=='confirmed')));assert(!openProjects.length,'ACCOUNT_HAS_OPEN_WORK','لا يمكن تعطيل الموظف وعليه مسؤوليات مفتوحة. أعد توزيع المشاريع والمهام أولًا: '+openProjects.slice(0,4).map(p=>p.id).join(', '),409)}const c=b.password?await credential(b.password):auth.users[b.id];assert(c,'PASSWORD_REQUIRED','ضع كلمة مرور أولًا');if(creationKey&&store.doc.ops.idempotency[creationKey]){const hit=store.doc.ops.idempotency[creationKey];assert(hit.digest===creationDigest,'REQUEST_ID_REUSED','تغيرت بيانات طلب الموظف.',409);return json(res,200,{ok:true,replayed:true,...hit.result});}const doc=D.clone(store.doc);let target=doc.teamUsers.find(x=>x.id===b.id);if(!target){target={id:b.id,rate:0};doc.teamUsers.push(target)}Object.assign(target,{name:D.text(b.name,120)||b.id,role:b.role,active:b.active!==false});auth.users[b.id]={...c,active:target.active,updatedAt:D.now()};atomic(AUTH,auth);D.Daily.init(doc);D.event(doc,u,'user_account_update','',{id:target.id,role:target.role,active:target.active});if(creationKey)doc.ops.idempotency[creationKey]={digest:creationDigest,result:{userId:target.id},at:D.now()};D.validateStructure(doc);commit(doc);for(const [tok,sess] of sessions)if(sess.userId===b.id&&tok!==token)sessions.delete(tok);return json(res,200,{ok:true,userId:b.id});
 }
 if(url.pathname==='/api/password'&&req.method==='POST'){const b=await readBody(req,10000);assert(await verify(b.oldPassword,auth.users[u.id]),'BAD_PASSWORD','كلمة المرور الحالية غير صحيحة',403);auth.users[u.id]={...await credential(b.password),active:true,updatedAt:D.now()};atomic(AUTH,auth);for(const [tok,sess] of sessions)if(sess.userId===u.id&&tok!==token)sessions.delete(tok);return json(res,200,{ok:true})}
 if(url.pathname==='/api/backup'&&req.method==='GET'){finance(u);return json(res,200,backup(),{'Content-Disposition':`attachment; filename="RONIX_${RELEASE.version}_FULL_BACKUP_${new Date().toISOString().slice(0,10)}.json"`})}
 if(url.pathname==='/api/restore-preview'&&req.method==='POST'){assert(u.role==='Owner','OWNER_ONLY','الاستعادة للمالك فقط',403);const b=await readBody(req);const doc=D.normalizeBackup(b.backup,store.doc);return json(res,200,{hash:D.hash(b.backup),before:counts(store.doc),after:counts(doc),findings:D.issues(doc),revision:store.revision})}
 if(url.pathname==='/api/restore'&&req.method==='POST'){assert(u.role==='Owner','OWNER_ONLY','الاستعادة للمالك فقط',403);const b=await readBody(req);revision(b);assert(b.confirm===true&&b.previewHash===D.hash(b.backup),'PREVIEW_REQUIRED','راجع معاينة الاستعادة أولًا');const doc=D.normalizeBackup(b.backup,store.doc);assert(doc.teamUsers.some(x=>x.id===u.id&&x.role==='Owner'&&x.active!==false),'OWNER_REQUIRED','لا يمكن إزالة حساب المالك أثناء الاستعادة');D.event(doc,u,'backup_restore','',{sourceVersion:b.backup.version||''});commit(doc,{restore:true});for(const [tok] of sessions)if(tok!==token)sessions.delete(tok);return json(res,200,{ok:true,revision:store.revision})}
 if(url.pathname==='/api/issues'&&req.method==='GET'){finance(u);return json(res,200,{issues:D.issues(store.doc),counts:counts(store.doc),build:RELEASE.build,revision:store.revision})}
 if(url.pathname==='/api/diagnostic'&&req.method==='POST'){const b=await readBody(req,300000);return send(res,200,diag(u,b),'application/zip',{'Content-Disposition':`attachment; filename="RONIX_DIAGNOSTIC_${RELEASE.version}_${Date.now()}.zip"`})}
 if(url.pathname==='/api/audit'&&req.method==='GET'){finance(u);return json(res,200,{rows:store.doc.ops.audit.slice(-1000)})}
 const imageId=url.pathname.match(/^\/api\/project-image\/(PRJ-[A-Za-z0-9_-]+)$/)?.[1];
 if(imageId){const p=D.project(store.doc,imageId);assert(D.visible(u,p)||(req.method==='GET'&&url.searchParams.get('thumb')==='1'&&!D.O.archived(p)),'FORBIDDEN','غير مسموح',403);if(req.method==='GET'&&url.searchParams.get('info')==='1'){
    const im=store.doc.projectImages[imageId];
    return json(res,200,{projectId:p.id,name:p.name,revision:store.revision,imageToken:ProjectPhoto.imageToken(im),imageAvailable:D.W.imageEligible(store.doc,p),canEdit:D.canEditImage(u,p),updatedBy:im?.updatedBy||'',updatedAt:im?.updatedAt||''});
   }
   if(req.method==='GET'){const im=store.doc.projectImages[imageId];assert(D.W.imageEligible(store.doc,p),'NOT_FOUND','لا توجد صورة مرتبطة مؤكدة لهذا المشروع',404);const cache=thumbCache[imageId];const thumbnail=url.searchParams.get('thumb')==='1';const src=thumbnail?(im.thumbnail||(cache?.sourceHash===crypto.createHash('sha256').update(im.src).digest('hex')?cache.src:im.src)):im.src;if(src.startsWith('data:image/')){const m=src.match(/^data:(image\/(jpeg|png|webp));base64,([\s\S]+)$/);assert(m,'INVALID_IMAGE','صورة غير صالحة');return send(res,200,Buffer.from(m[3],'base64'),m[1])}const f=path.resolve(ROOT,src);assert(f.startsWith(ROOT+path.sep)&&fs.existsSync(f),'NOT_FOUND','الصورة غير موجودة',404);return send(res,200,fs.readFileSync(f),MIME[path.extname(f)]||'image/jpeg')}
   if(req.method==='POST'){D.Daily.enforce(store.doc,u,'project_image_update');
    // Read first, then re-check permissions against current committed data.
    // Assignment/archival may have changed while a large request was arriving.
    const b=await readBody(req,5e6),latest=current(req);
    assert(latest.user.id===u.id,'SESSION_CHANGED','تغير حساب الدخول. أعد فتح صورة المشروع.',409);
    const target=D.project(store.doc,imageId);
    assert(D.canEditImage(D.Access.effective(latest.user),target),'FORBIDDEN','رفع الصورة للموظف المكلف أو مهندس المشروعات أو المالك، على مشروع جارٍ فقط.',403);
    const imageMeta=ProjectPhoto.validateDataURL(b.src);
    const thumbMeta=b.thumbnail?ProjectPhoto.validateDataURL(b.thumbnail,true):null;
    const previous=store.doc.projectImages[imageId];
    // Repeated delivery after a lost response must not duplicate history/audit.
    if(previous?.src===b.src&&(previous.thumbnail||'')===(b.thumbnail||'')&&D.W.imageEligible(store.doc,target))
     return json(res,200,{ok:true,unchanged:true,projectId:imageId,revision:store.revision,imageRevision:previous.updatedAt,imageToken:ProjectPhoto.imageToken(previous),updatedBy:previous.updatedBy});
    if(Object.prototype.hasOwnProperty.call(b,'expectedImageToken')){
     assert(typeof b.expectedImageToken==='string'&&/^[a-f0-9]{64}$/.test(b.expectedImageToken),'IMAGE_PREVIEW_REQUIRED','راجع الصورة الحالية قبل الحفظ.',400);
     assert(b.expectedImageToken===ProjectPhoto.imageToken(previous),'IMAGE_CHANGED','تم تغيير صورة هذا المشروع بواسطة مستخدم آخر. راجع الصورة الحالية ثم أكد الاستبدال.',409);
     assert(Number.isInteger(b.baseRevision)&&b.baseRevision>0&&b.baseRevision<=store.revision,'REVISION_CONFLICT','حالة الحفظ غير صالحة. أعد فتح نافذة الصورة.',409);
    }else revision(b); // Backward-compatible guard for older upload callers.
    const doc=D.clone(store.doc),at=D.now();
    if(previous)(doc.projectImageHistory??={})[imageId]=[...((doc.projectImageHistory||{})[imageId]||[]),{...D.clone(previous),replacedAt:at,replacedBy:u.id}];
    const im={src:b.src,thumbnail:b.thumbnail||'',name:target.name,projectIdentity:D.W.projectIdentity(target),updatedAt:at,updatedBy:u.id,fileName:ProjectPhoto.safeFilename(b.fileName),mime:imageMeta.mime,width:imageMeta.width,height:imageMeta.height,byteSize:imageMeta.bytes,sourceHash:imageMeta.sha256,thumbnailBytes:thumbMeta?.bytes||0};
    doc.projectImages[imageId]=im;
    D.event(doc,u,'project_image_update',imageId,{previousAt:previous?.updatedAt||'',historyCount:(doc.projectImageHistory?.[imageId]||[]).length,imageHash:imageMeta.sha256,width:imageMeta.width,height:imageMeta.height,byteSize:imageMeta.bytes});
    testAudit(doc,latest.session);commit(doc);
    return json(res,200,{ok:true,projectId:imageId,revision:store.revision,imageRevision:at,imageToken:ProjectPhoto.imageToken(im),updatedBy:u.id});
   }
 }
 throw new AppError('NOT_FOUND','المسار غير موجود',404);
 }catch(e){if(!res.headersSent){json(res,e.status||500,{error:e.code||'SERVER_ERROR',message:e.status?e.message:'حدث خطأ على الخادم؛ لم تُعتمد العملية',revision:store?.revision,build:RELEASE.build,instance:INSTANCE})}if(!e.status)console.error(e.stack)} }
function counts(d){return {projects:d.data.length,tasks:d.data.reduce((s,p)=>s+p.tasks.length,0),customers:d.masters.customers.length,vendors:d.masters.vendors.length,quotes:d.commercial.quotes.length,contracts:d.commercial.contracts.length,receipts:d.customerReceipts.length,timesheets:d.timesheets.length,journals:d.journalEntries.length}}
const server=TLS?https.createServer({key:fs.readFileSync(process.env.RONIX_TLS_KEY),cert:fs.readFileSync(process.env.RONIX_TLS_CERT)},handler):http.createServer(handler);
server.requestTimeout=30000;server.headersTimeout=10000;
server.listen(PORT,HOST,()=>{const boundPort=server.address().port;const base=(TLS?'https':'http')+'://127.0.0.1:'+boundPort;if(process.send&&process.connected)process.send({type:'RONIX_LISTENING',port:boundPort,instance:INSTANCE,build:RELEASE.build},()=>{});console.log('\nCRM RONIX '+RELEASE.version+' — '+RELEASE.build);console.log('Open: '+base+(setupToken?'/#setup='+setupToken:''));console.log('Data: '+DIR);console.log('Do NOT share this host package or its data directory with employees. Staff use authenticated web access only.');if(HOST!=='127.0.0.1'){for(const v of Object.values(os.networkInterfaces()))for(const n of v||[])if(n.family==='IPv4'&&!n.internal)console.log('LAN: '+(TLS?'https':'http')+'://'+n.address+':'+boundPort);if(!TLS)console.log('LAN HTTP: trusted office network only. Use TLS before untrusted/public access.')}if(process.argv.includes('--open')&&process.platform==='win32'){require('node:child_process').spawn('cmd',['/c','start','',base+(setupToken?'/#setup='+setupToken:'')],{stdio:'ignore',windowsHide:true})}});
server.on('error',e=>{console.error('Cannot start RONIX:',e.message);process.exitCode=1;if(process.send&&process.connected)process.send({type:'RONIX_LISTEN_ERROR',code:e.code||'LISTEN_ERROR'},()=>{});});
module.exports={counts,zip};
