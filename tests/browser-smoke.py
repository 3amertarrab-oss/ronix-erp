"""Disposable, real-browser workflow; never reads or modifies production data."""
import os,json,tempfile,subprocess,socket,time,hashlib,shutil
from urllib.parse import urlparse,parse_qs
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
tmp=Path(tempfile.mkdtemp(prefix='ronix-browser-'))
proc=None
try:
    subprocess.run(['node','-e',"const D=require('./erp/domain'),fs=require('fs');const d=D.normalizeBackup(JSON.parse(fs.readFileSync('./erp/data/initial-backup.json')));d.masters.customers.push({id:'C1',name:'Test Customer'});d.teamUsers.push({id:'pm-test',name:'PM Test',role:'Project Manager',active:true});d.data.push({id:'PRJ-101',name:'Test Project',customerId:'C1',client:'Test Customer',pm:'pm-test',tasks:[],value:0,invoice:0,paid:0,projectDraft:true});if(d.dailyTime?.policy)d.dailyTime.policy.enabled=false;fs.writeFileSync(process.argv[1],JSON.stringify(d));",str(tmp/'initial-backup.json')],cwd=ROOT,check=True)
    salt=os.urandom(16).hex()
    credentials={'salt':salt,'hash':hashlib.scrypt(b'T123',salt=salt.encode(),n=16384,r=8,p=1,dklen=64,maxmem=64*1024*1024).hex(),'active':True}
    (tmp/'accounts.json').write_text(json.dumps({'users':{'owner':credentials,'pm-test':credentials}}))
    with socket.socket() as sock:
        sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    log=open(tmp/'server.log','w')
    proc=subprocess.Popen(['node','erp/server.js'],cwd=ROOT,env={**os.environ,'RONIX_PORT':str(port),'RONIX_DATA_DIR':str(tmp)},stdout=log,stderr=log)
    base=f'http://127.0.0.1:{port}'
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1440,'height':1000})
        context.add_init_script("""window.__ronixFinanceStates=[];addEventListener('message',event=>{if(event.data?.type==='ronix-finance-state')window.__ronixFinanceStates.push(event.data)})""")
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
        artifacts=ROOT/'artifacts';artifacts.mkdir(exist_ok=True)
        def nav_to(route):
            button=page.locator(f'#navigation [data-route="{route}"]')
            group=button.locator('xpath=ancestor::details[1]')
            if group.count() and not group.evaluate('e=>e.open'):
                group.locator(':scope > summary').click()
            button.scroll_into_view_if_needed();button.click()
        page.locator('[data-owner-dashboard33] .o34-modules').wait_for()
        assert page.locator('.o34-module').count()==5
        assert page.locator('.source-pending3921').count()==0
        nav_to('integrationReview')
        page.locator('.integration-review-grid article').first.wait_for()
        assert page.locator('.integration-review-grid article').count()==4
        assert page.locator('.integration-state.pending').count()==0
        assert page.locator('[data-action-audit42]').count()==1
        page.screenshot(path=str(artifacts/'integration-checkpoint.png'),full_page=True)
        nav_to('dash')
        page.screenshot(path=str(artifacts/'desktop-command-center.png'),full_page=True)
        page.locator('[data-o34-search]').fill('Test Project')
        page.locator('.o34-search-results [data-o33-open]:visible').click()
        page.locator('[data-owner-detail33]').wait_for()
        nav_to('dash')
        page.locator('[data-owner-dashboard33] .o34-modules').wait_for()
        nav_to('commercial')
        frame=page.frame_locator('#unifiedFrame')
        frame.locator('#sharedStatus').get_by_text('مسودة',exact=True).wait_for()
        frame.locator('#sharedProject').select_option('PRJ-101')
        # Fill the approved editor model; validation and totals run in the real browser.
        cf=next(f for f in page.frames if '/modules/commercial.html' in f.url)
        assert cf.locator('body').evaluate("e=>e.classList.contains('ronix-embedded')")
        assert not cf.locator('#ronix-1004 > .app-header').is_visible()
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
        # Customer actions keep the stable customer ID and show its actual
        # projects instead of searching the project name for the customer name.
        nav_to('customers')
        customer_card=page.locator('[data-customer-card42="C1"]');customer_card.wait_for()
        customer_card.locator('[data-action42="customer.projects"]').click()
        page.wait_for_timeout(500)
        assert page.locator('.customer-project-filter42').count()==1,(page.url,page.locator('#view').inner_text()[:500])
        assert parse_qs(urlparse(page.url).query).get('customer')==['C1']
        assert 'PRJ-101' in page.locator('#projectCards').inner_text()
        nav_to('fin')
        page.wait_for_function("() => document.querySelector('#unifiedFrame')?.getAttribute('src').includes('/modules/finance.html')")
        page.frame_locator('#unifiedFrame').locator('#sharedStatus').wait_for()
        ff=next(f for f in page.frames if '/modules/finance.html' in f.url)
        ff.wait_for_function("() => document.querySelector('#sharedStatus')?.textContent.includes('متصل')")
        assert ff.locator('body').evaluate("e=>e.classList.contains('ronix-embedded')")
        finance_pages=set(page.locator('.module-tabs [data-finance-page]').evaluate_all("els=>els.map(e=>e.dataset.financePage)"))
        assert {'dashboard','projects','clients','claims'}.issubset(finance_pages),finance_pages
        assert not ff.locator('.side').is_visible()
        assert ff.evaluate('data.projects[0].contract')==200
        # Finance tabs are real parent navigation: a visible click updates the
        # iframe, the durable URL and the active state reported by postMessage.
        projects_tab=page.locator('.module-tabs [data-finance-page="projects"]')
        page.evaluate('window.__ronixFinanceStates=[]')
        projects_tab.scroll_into_view_if_needed();projects_tab.click()
        page.wait_for_function("() => window.__ronixFinanceStates.some(s=>s.page==='projects')")
        assert projects_tab.evaluate("e=>e.classList.contains('active')")
        assert page.locator('.module-tabs [data-finance-page].active').count()==1
        assert page.locator('.module-tabs [data-finance-page].primary').count()==1
        assert parse_qs(urlparse(page.url).query).get('financePage')==['projects']
        # A bookmarked project/customer context survives a full reload and is
        # forwarded to the embedded accounts engine without identity drift.
        page.goto(base+'/?view=fin&financePage=projects&project=PRJ-101&customer=C1')
        page.locator('.module-tabs [data-finance-page="projects"].active').wait_for()
        page.frame_locator('#unifiedFrame').locator('#sharedStatus').wait_for()
        page.wait_for_function("() => {const q=new URL(document.querySelector('#unifiedFrame').src).searchParams;return q.get('page')==='projects'&&q.get('project')==='PRJ-101'&&q.get('customer')==='C1'}")
        page.wait_for_function("() => window.__ronixFinanceStates.some(s=>{const d=s.detail||s;return d.page==='projects'&&d.project==='PRJ-101'&&d.customerId==='C1'})")
        page.reload();page.locator('.module-tabs [data-finance-page="projects"].active').wait_for()
        params=parse_qs(urlparse(page.url).query)
        assert params.get('view')==['fin'] and params.get('financePage')==['projects'] and params.get('project')==['PRJ-101'] and params.get('customer')==['C1']
        page.wait_for_function("() => {const q=new URL(document.querySelector('#unifiedFrame').src).searchParams;return q.get('project')==='PRJ-101'&&q.get('customer')==='C1'}")
        clients_tab=page.locator('.module-tabs [data-finance-page="clients"]')
        page.evaluate('window.__ronixFinanceStates=[]')
        clients_tab.scroll_into_view_if_needed();clients_tab.click()
        page.wait_for_function("() => window.__ronixFinanceStates.some(s=>s.page==='clients')")
        params=parse_qs(urlparse(page.url).query)
        assert params.get('view')==['fin'] and params.get('financePage')==['clients'] and params.get('project')==['PRJ-101'] and params.get('customer')==['C1']
        # Project claims render a project-filtered claims/receipts panel and
        # switch the outer route/title together with the internal page.
        claims_tab=page.locator('.module-tabs [data-finance-page="claims"]')
        page.evaluate('window.__ronixFinanceStates=[]');claims_tab.click()
        page.wait_for_function("() => window.__ronixFinanceStates.some(s=>s.page==='claims'&&s.project==='PRJ-101')")
        ff=next(f for f in page.frames if '/modules/finance.html' in f.url)
        ff.get_by_text('مطالبات المشروع',exact=False).first.wait_for()
        params=parse_qs(urlparse(page.url).query)
        assert params.get('view')==['collections'] and params.get('financePage')==['claims']
        assert page.locator('#navigation [data-route="collections"]').evaluate("e=>e.classList.contains('active')")
        # Cost-center detail keeps the selected project in bridge state.
        page.locator('.module-more > summary').click()
        cost_tab=page.locator('.module-more [data-finance-page="costcenters"]')
        page.evaluate('window.__ronixFinanceStates=[]');cost_tab.click()
        page.wait_for_function("() => window.__ronixFinanceStates.some(s=>s.page==='costcenters'&&s.project==='PRJ-101')")
        params=parse_qs(urlparse(page.url).query)
        assert params.get('view')==['fin'] and params.get('financePage')==['costcenters']
        # A rejected navigation restores the last acknowledged page and URL.
        ff.evaluate("RonixFinanceBridge.navigate({page:'missing-page'})")
        page.wait_for_timeout(100)
        assert parse_qs(urlparse(page.url).query).get('financePage')==['costcenters']
        assert page.locator('.module-tabs [data-finance-page="costcenters"].active').count()==1
        ff.evaluate("RonixFinanceBridge.navigate({page:'costcenters',project:'UNKNOWN',customer:'C1'})")
        page.wait_for_timeout(100);params=parse_qs(urlparse(page.url).query)
        assert params.get('project')==['PRJ-101'] and params.get('customer')==['C1']
        ff.evaluate("RonixFinanceBridge.navigate({page:'costcenters',project:'PRJ-101',customer:'UNKNOWN'})")
        page.wait_for_timeout(100);params=parse_qs(urlparse(page.url).query)
        assert params.get('project')==['PRJ-101'] and params.get('customer')==['C1'] and params.get('financePage')==['costcenters']
        # Return to the project-scoped finance page for persistence checks.
        projects_tab=page.locator('.module-tabs [data-finance-page="projects"]');page.evaluate('window.__ronixFinanceStates=[]');projects_tab.click()
        page.wait_for_function("() => window.__ronixFinanceStates.some(s=>s.page==='projects'&&s.project==='PRJ-101')")
        ff=next(f for f in page.frames if '/modules/finance.html' in f.url)
        ff.wait_for_function("() => document.querySelector('#sharedStatus')?.textContent.includes('متصل')")
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
        mobile.add_init_script("""window.__ronixFinanceStates=[];addEventListener('message',event=>{if(event.data?.type==='ronix-finance-state')window.__ronixFinanceStates.push(event.data)})""")
        mobile.request.post(base+'/api/login',data={'id':'owner','password':'T123'})
        mp=mobile.new_page();mp.on('pageerror',lambda e:errors.append(str(e)))
        mp.goto(base+'/')
        mp.locator('[data-owner-dashboard33] .o34-modules').wait_for()
        assert mp.locator('.o34-module').count()==5
        assert mp.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')
        mp.locator('#mobileNavToggle').click()
        assert mp.locator('#sidebar').is_visible()
        mp.wait_for_timeout(300)
        sidebar_box=mp.locator('#sidebar').bounding_box()
        assert sidebar_box and sidebar_box['x']>=0 and sidebar_box['x']+sidebar_box['width']<=391,sidebar_box
        mobile_fin=mp.locator('#navigation [data-route="fin"]')
        mobile_group=mobile_fin.locator('xpath=ancestor::details[1]')
        if not mobile_group.evaluate('e=>e.open'):
            mobile_group.locator(':scope > summary').click()
        mobile_fin.scroll_into_view_if_needed();mobile_fin.click()
        mp.locator('.module-tabs').wait_for()
        assert not mp.locator('body').evaluate("e=>e.classList.contains('mobile-nav-open')")
        assert mp.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')
        mobile_more=mp.locator('.module-tabs .module-more > summary')
        more_box=mobile_more.bounding_box()
        assert more_box and more_box['x']>=0 and more_box['x']+more_box['width']<=391,more_box
        mobile_projects=mp.locator('.module-tabs [data-finance-page="projects"]')
        mp.evaluate('window.__ronixFinanceStates=[]')
        mobile_projects.scroll_into_view_if_needed();mobile_projects.click()
        mp.wait_for_function("() => window.__ronixFinanceStates.some(s=>s.page==='projects')")
        assert mobile_projects.evaluate("e=>e.classList.contains('active')")
        assert mp.locator('.module-tabs [data-finance-page].active').count()==1
        assert mp.locator('.module-tabs [data-finance-page].primary').count()==1
        box=mobile_projects.bounding_box()
        assert box and box['x']>=0 and box['x']+box['width']<=391,box
        assert parse_qs(urlparse(mp.url).query).get('financePage')==['projects']
        mp.screenshot(path=str(artifacts/'mobile-command-center.png'),full_page=True)
        mp.goto(base+'/modules/commercial.html?project=PRJ-101')
        mp.wait_for_function('() => window.RonixSharedCommercial')
        assert mp.locator('#sharedProject').input_value()=='PRJ-101'
        mp.goto(base+'/modules/finance.html')
        mp.wait_for_function("() => window.RonixSharedFinance && document.querySelector('#sharedStatus').textContent.includes('متصل')")
        mp.locator('#sharedMenu').click()
        assert mp.locator('.side').is_visible()
        mp.locator('.nav[data-page="projects"]').click()
        assert not mp.locator('.side').is_visible()
        page.screenshot(path=str(artifacts/'desktop-accounts.png'),full_page=True)
        mp.screenshot(path=str(artifacts/'mobile-accounts.png'),full_page=True)
        # A project manager keeps the permitted commercial workflow while
        # finance controls that the server would reject are omitted.
        pm_context=browser.new_context(viewport={'width':1200,'height':800})
        pm_login=pm_context.request.post(base+'/api/login',data={'id':'pm-test','password':'T123'});assert pm_login.ok,pm_login.text()
        pp=pm_context.new_page();pp.on('pageerror',lambda e:errors.append(str(e)))
        pp.goto(base+'/?view=projects&project=PRJ-101');pp.locator('#shell').wait_for(state='visible')
        assert pp.locator('#navigation [data-route="fin"],#navigation [data-route="collections"]').count()==0
        assert pp.locator('#navigation [data-route="commercial"]').count()==1
        forbidden_actions=pp.locator('[data-action42="project.finance"],[data-action42="project.cost"]')
        assert forbidden_actions.count()==0,(pp.locator('#sessionName').inner_text(),forbidden_actions.evaluate_all("els=>els.map(e=>({id:e.dataset.action42,disabled:e.disabled,html:e.outerHTML}))"))
        assert pp.locator('[data-action42="project.commercial"]').count()==1
        pm_context.close()
        assert not errors,errors
        print(json.dumps({'status':'PASS','checks':['dynamic owner command center','button registry checkpoint','customer-to-project stable identity','single-shell embedded modules','1007 pricing and validation','quotation save and approval','quote-to-contract','contract-to-accounts','finance context and route bridge','navigation error rollback','project-filtered claims and cost center','V20 audit and persistence','second-session visibility','stale-write conflict','parent polling preserves editor','mobile primary actions and More','role-based dynamic actions'],'pageErrors':errors},ensure_ascii=False))
        browser.close()
finally:
    if proc:
        proc.terminate();proc.wait(timeout=10)
    shutil.rmtree(tmp,ignore_errors=True)
