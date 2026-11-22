import asyncio, sys, os; sys.path.insert(0, os.path.dirname(__file__))
from base import *
OUT=os.environ.get('OUT','out')
async def shot(pg,name,y=330):
    await pg.evaluate(f"window.scrollTo(0,{y})"); await pg.wait_for_timeout(400); await pg.screenshot(path=f'{OUT}/{name}.png')
async def main():
    async with async_playwright() as p:
        b,pg,errs=await setup(p, 390, 844, 2)
        await pg.wait_for_timeout(3000)
        info=await pg.evaluate('''()=>{ const L=LEAGUES.filter(l=>l.live&&l.fixtures.length); const pick=L.find(l=>/Premier/i.test(l.name))||L.find(l=>/LaLiga|Brasil|Serie A/i.test(l.name))||L[0]; LS.set('ab_dtsec','e'); openMatch(pick.id,0); return pick.name; }''')
        print(info); await pg.wait_for_timeout(9000); await shot(pg,'e-fut')
        await pg.evaluate("dtSec('j')"); await pg.wait_for_timeout(9000); await shot(pg,'j-fut')
        for sp in ['nba','nhl']:
          await pg.evaluate('''async(sp)=>{ setSport(sp); for(let i=0;i<60 && !usData[sp].games.length;i++) await new Promise(r=>setTimeout(r,300)); const g=usData[sp].games.find(x=>x.state==='pre')||usData[sp].games[0]; LS.set('ab_dtsec','e'); usOpen(sp,g.id); }''', sp)
          await pg.wait_for_timeout(10000); await shot(pg,f'e-{sp}')
          await pg.evaluate("dtSec('j')"); await pg.wait_for_timeout(9000); await shot(pg,f'j-{sp}')
          await pg.evaluate("dtSec('r')"); await pg.wait_for_timeout(3000); await shot(pg,f'r-{sp}')
        await pg.evaluate('''async()=>{ setSport('tenis'); for(let i=0;i<60 && !Object.keys(TN.m).length;i++) await new Promise(r=>setTimeout(r,300)); const ms=Object.values(TN.m); const m=ms.find(x=>x.state==='pre'&&tnStats(x.p[0]).n>=2&&tnStats(x.p[1]).n>=2)||ms.find(x=>x.state==='pre')||ms[0]; if(m) tnOpen(m.id); }''')
        await pg.wait_for_timeout(3000); await shot(pg,'tenis',0)
        print('ERR',errs[:5]); await b.close()
asyncio.run(main())
