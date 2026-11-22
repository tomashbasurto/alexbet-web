import asyncio, http.server, threading, functools, os
from playwright.async_api import async_playwright
ROOT='/home/claude/alexbet-web'
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8771),functools.partial(http.server.SimpleHTTPRequestHandler,directory=ROOT))
threading.Thread(target=srv.serve_forever,daemon=True).start()
AUTH="""const U={uid:"a",email:"x@y.com"};
export function getAuth(){return {currentUser:U}} export function onAuthStateChanged(a,f){setTimeout(()=>f(U),50)}
export class GoogleAuthProvider{} export async function signInWithPopup(){} export async function signOut(){}
export async function createUserWithEmailAndPassword(){} export async function signInWithEmailAndPassword(){} export async function sendPasswordResetEmail(){}"""
FS="""const D={email:"x@y.com",creado:{toMillis:()=>Date.now()-3*864e5},premiumHasta:null,plan:"gratis",pendiente:""};
export function getFirestore(){return {}} export function doc(){return {}} export function collection(){return {}} export function query(){return {}} export function where(){return {}} export function orderBy(){return {}} export function limit(){return {}}
export async function getDoc(){return {exists:()=>true,data:()=>D}} export async function getDocs(){return {docs:[],forEach(){}}} export async function setDoc(){} export async function updateDoc(){}
export function serverTimestamp(){return null} export function onSnapshot(r,f){setTimeout(()=>f({exists:()=>true,data:()=>D}),10);return ()=>{}}"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={'width':390,'height':844}, device_scale_factor=2)
        errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
        async def gs(r):
            u=r.request.url
            body="export function initializeApp(){return {}}" if 'firebase-app' in u else AUTH if 'auth' in u else FS if 'firestore' in u else "export const getMessaging=()=>({}),getToken=async()=>'',onMessage=()=>{},isSupported=async()=>false;"
            await r.fulfill(status=200,content_type='text/javascript',body=body)
        async def gh(r):
            f=r.request.url.split('/alexbet-web/')[1].split('?')[0]
            path=os.path.join(ROOT,f)
            if os.path.exists(path): await r.fulfill(path=path,headers={'access-control-allow-origin':'*'})
            else: await r.abort()
        await pg.route('https://www.gstatic.com/**',gs)
        await pg.route('https://tomashbasurto.github.io/alexbet-web/**',gh)
        await pg.route(lambda u: not u.startswith('http://127.0.0.1') and 'gstatic' not in u and 'github.io' not in u, lambda r: r.abort())
        await pg.goto('http://127.0.0.1:8771/index.html'); await pg.wait_for_timeout(5000)
        await pg.screenshot(path='r1_home.png'); await pg.screenshot(path='r1_home_full.png', full_page=True)
        await pg.evaluate("window.scrollTo(0,0)")
        try:
            await pg.evaluate("(()=>{const c=document.querySelector('#matchList .match-card'); c&&c.click();})()"); await pg.wait_for_timeout(1500)
            await pg.screenshot(path='r2_det_full.png', full_page=True)
            await pg.evaluate("goHome()")
        except Exception as e: print('det',e)
        await pg.evaluate("setView('picks')"); await pg.wait_for_timeout(1500); await pg.screenshot(path='r3_picks_full.png', full_page=True)
        await pg.evaluate("setView('matches'); setSport('nba')"); await pg.wait_for_timeout(2500); await pg.screenshot(path='r4_nba.png')
        await pg.evaluate("setSport('futbol'); openSettings()"); await pg.wait_for_timeout(600); await pg.screenshot(path='r5_set.png')
        h=await pg.evaluate("document.body.scrollHeight"); print('home height',h, 'errs',errs[:4])
        await b.close()
asyncio.run(main())
