# shared harness: load app with routes, yield page
import asyncio, http.server, threading, functools, os, hashlib
from playwright.async_api import async_playwright
ROOT=os.environ.get('AB_ROOT','/home/claude/alexbet-web'); C='/tmp/claude-0/espncache'
srv=http.server.ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('AB_PORT','8787'))),functools.partial(type('Q',(http.server.SimpleHTTPRequestHandler,),{'log_message':lambda *a:None}),directory=ROOT))
threading.Thread(target=srv.serve_forever,daemon=True).start()
AUTH=open(os.path.join(os.path.dirname(__file__),'rev.py')).read().split('AUTH="""')[1].split('"""')[0]
FS=open(os.path.join(os.path.dirname(__file__),'rev.py')).read().split('FS="""')[1].split('"""')[0]
miss=set(); key=lambda u: hashlib.md5(u.encode()).hexdigest()
async def setup(p, w=390, h=844, scale=1, tz=None):
    b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':w,'height':h}, device_scale_factor=scale, **({'timezone_id':tz} if tz else {}))
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    async def gs(r):
        u=r.request.url
        body="export function initializeApp(){return {}}" if 'firebase-app' in u else AUTH if 'auth' in u else FS if 'firestore' in u else "export const getMessaging=()=>({}),getToken=async()=>'',onMessage=()=>{},isSupported=async()=>false;"
        await r.fulfill(status=200,content_type='text/javascript',body=body)
    async def gh(r):
        f=r.request.url.split('/alexbet-web/')[1].split('?')[0]; path=os.path.join(ROOT,f)
        if os.path.exists(path): await r.fulfill(path=path,headers={'access-control-allow-origin':'*'})
        else: await r.abort()
    async def es(r):
        await r.continue_(); return
        u=r.request.url; f=os.path.join(C,key(u)+'.json')
        if os.path.exists(f): await r.fulfill(path=f,content_type='application/json',headers={'access-control-allow-origin':'*'})
        else: miss.add(u); await r.abort()
    async def img(r):
        await r.continue_(); return
        u=r.request.url; f=os.path.join(C,key(u)+'.img')
        if os.path.exists(f): await r.fulfill(path=f,content_type='image/png')
        else: miss.add(u); await r.abort()
    await pg.route('https://www.gstatic.com/**',gs)
    await pg.route(lambda u: 'github.io/alexbet-web' in u or 'raw.githubusercontent.com/tomashbasurto/alexbet-web' in u, gh)
    await pg.route(lambda u: 'espn.com/apis' in u or 'core.api.espn' in u, es)
    await pg.route(lambda u: 'espncdn.com' in u, img)
    await pg.route(lambda u: not u.startswith('http://127.0.0.1') and 'gstatic' not in u and 'github' not in u and 'espn' not in u, lambda r: r.abort())
    await pg.goto('http://127.0.0.1:'+os.environ.get('AB_PORT','8787')+'/index.html'); await pg.wait_for_timeout(3500)
    return b, pg, errs
