"""Disposable, real-browser workflow; never reads or modifies production data."""
import os,json,tempfile,subprocess,socket,time,hashlib,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
tmp=Path(tempfile.mkdtemp(prefix='ronix-browser-'))
proc=None
try:
    subprocess.run(['node','-e',"const D=require('./erp/domain'),fs=require('fs');const d=D.normalizeBackup(JSON.parse(fs.readFileSync('./erp/data/initial-backup.json')));d.masters.customers.push({id:'C1',name:'Test Customer'});d.data.push({id:'PRJ-101',name:'Test Project',customerId:'C1',client:'Test Customer',tasks:[],value:0,invoice:0,paid:0,projectDraft:true});if(d.dailyTime?.policy)d.dailyTime.policy.enabled=false;fs.writeFileSync(process.argv[1],JSON.stringify(d));",str(tmp/'initial-backup.json')],cwd=ROOT,check=True)
    salt=os.urandom(16).hex()
    credentials={'salt':salt,'hash':hashlib.scrypt(b'T123',salt=salt.encode(),n=16384,r=8,p=1,dklen=64,maxmem=64*1024*1024).hex(),'active':True}
    (tmp/'accounts.json').write_text(json.dumps({'users':{'owner':credentials}}))
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    log=open(tmp/'server.log','w')
    proc=subprocess.Popen(['node','erp/server.js'],cwd=ROOT,env={**os.environ,'RONIX_PORT':str(port),'RONIX_DATA_DIR':str(tmp)},stdout=log,stderr=log)
    base=f'http://127.0.0.1:{port}'
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1440,'height':1000})
        for attempt in range(100):
            try:
                if context.request.get(base+'/api/health').ok:break
            except Exception:time.sleep(.05)
        else:raise RuntimeError((tmp/'server.log').read_text())
        auth=context.request.post(base+'/api/login',data={'id':'owner','password':'T123'}).json()
        assert auth.get('csrf'),auth
        page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:d.accept())
        page.goto(base+'/')
        page.locator('#shell').wait_for(state='visible')
        page.locator('#navigation [data-route="commercial"]').click()
        frame=page.frame_locator('#unifiedFrame')
        frame.locator('#sharedStatus').get_by_text('مسودة',exact=True).wait_for()
        frame.locator('#sharedProject').select_option('PRJ-101')
        # Fill the approved editor model; validation and totals run in the real browser.
        cf=next(f for f in page.frames if '/modules/commercial.html' in f.url)
        cf.evaluate("""()=>{const d=Ronix1007.read(),s=d.state;s.lang='ar';s.reference='TEST-Q-1';s.example=false;s.client='Test Customer';s.project='Test Project';s.items.forEach(r=>r.on=false);Object.assign(s.items.find(r=>r.id==='roof'),{on:true,qty:2,rate:100,scope:'تركيب فقط'});s.discount=0;s.vat=false;s.stamp=false;Ronix1007.load(d);const translated=Ronix1007.read();for(const text of Ronix1007.translationEntries())translated.state.translations[text]={ar:text,en:text};Ronix1007.load(translated)}""")
        assert cf.evaluate('Ronix1007.totals().total')==200
        server_total=context.request.post(base+'/api/unified/migration-preview',data={'backup':cf.evaluate('Ronix1007.read()')},headers={'X-Ronix-CSRF':auth['csrf']})
        assert server_total.ok,server_total.text()
        frame.locator('#sharedSave').click()
        frame.locator('#sharedStatus').get_by_text('تم حفظ المستند على الخادم ✓',exact=True).wait_for()
        validation=cf.evaluate('Ronix1007.validate()')
        assert not validation,validation
        frame.locator('#sharedApprove').click()
        frame.locator('#sharedStatus').get_by_text('تم الاعتماد وربط المستند بالبرنامج الأساسي ✓',exact=True).wait_for()
        frame.locator('#sharedConvert').click()
        frame.locator('#sharedSave').click()
        frame.locator('#sharedStatus').get_by_text('تم حفظ المستند على الخادم ✓',exact=True).wait_for()
        frame.locator('#sharedApprove').click()
        frame.locator('#sharedStatus').get_by_text('تم الاعتماد وربط المستند بالبرنامج الأساسي ✓',exact=True).wait_for()
        frame.locator('#sharedHandoff').click()
        frame.locator('#sharedStatus').get_by_text('تم إنشاء مرجع العقد في الحسابات وربطه بالمشروع ✓',exact=True).wait_for()
        page.locator('#navigation [data-route="fin"]').click()
        page.wait_for_function("() => document.querySelector('#unifiedFrame')?.getAttribute('src').includes('/modules/finance.html')")
        page.frame_locator('#unifiedFrame').locator('#sharedStatus').wait_for()
        ff=next(f for f in page.frames if '/modules/finance.html' in f.url)
        ff.wait_for_function("() => document.querySelector('#sharedStatus')?.textContent.includes('متصل')")
        assert ff.evaluate('data.projects[0].contract')==200
        # Existing save reconciles and audits; our adapter changes persistence only.
        ff.evaluate("data.projects[0].note='browser-persistence';save()")
        ff.wait_for_function("() => document.querySelector('#sharedStatus').textContent.includes('تم الحفظ')")
        page2=context.new_page();page2.on('pageerror',lambda e:errors.append(str(e)))
        page2.goto(base+'/modules/finance.html')
        page2.wait_for_function("() => window.RonixSharedFinance && document.querySelector('#sharedStatus').textContent.includes('متصل')")
        assert page2.evaluate('data.projects[0].note')=='browser-persistence'
        stale=page2.evaluate('RonixSharedFinance.revision()')
        ff.evaluate("data.projects[0].note='newer-session';save()")
        ff.wait_for_function("() => document.querySelector('#sharedStatus').textContent.includes('تم الحفظ')")
        page2.evaluate("data.projects[0].note='stale-session';save()")
        page2.wait_for_function("() => document.querySelector('#sharedStatus').textContent.includes('تعارض')")
        payload=context.request.get(base+'/api/unified/finance').json()
        assert payload['payload']['projects'][0]['note']=='newer-session'
        assert payload['revision']>stale
        # Parent polling must not destroy the open editor after a module commit.
        ff.evaluate("window.__survivesPolling=true")
        page.wait_for_timeout(6500)
        assert ff.evaluate('window.__survivesPolling') is True
        page2.close(run_before_unload=False)
        mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        mobile.request.post(base+'/api/login',data={'id':'owner','password':'T123'})
        mp=mobile.new_page();mp.on('pageerror',lambda e:errors.append(str(e)))
        mp.goto(base+'/modules/commercial.html?project=PRJ-101')
        mp.wait_for_function('() => window.RonixSharedCommercial')
        assert mp.locator('#sharedProject').input_value()=='PRJ-101'
        mp.goto(base+'/modules/finance.html')
        mp.wait_for_function("() => window.RonixSharedFinance && document.querySelector('#sharedStatus').textContent.includes('متصل')")
        mp.locator('#sharedMenu').click()
        assert mp.locator('.side').is_visible()
        mp.locator('.nav[data-page="projects"]').click()
        assert not mp.locator('.side').is_visible()
        artifacts=ROOT/'artifacts';artifacts.mkdir(exist_ok=True)
        page.screenshot(path=str(artifacts/'desktop-accounts.png'),full_page=True)
        mp.screenshot(path=str(artifacts/'mobile-accounts.png'),full_page=True)
        assert not errors,errors
        print(json.dumps({'status':'PASS','checks':['ERP navigation','1007 pricing and validation','quotation save and approval','quote-to-contract','contract-to-accounts','V20 audit and persistence','second-session visibility','stale-write conflict','parent polling preserves editor','mobile editor load'],'pageErrors':errors},ensure_ascii=False))
        browser.close()
finally:
    if proc:
        proc.terminate();proc.wait(timeout=10)
    shutil.rmtree(tmp,ignore_errors=True)
