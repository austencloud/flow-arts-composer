import json, glob, collections, itertools
P=json.load(open('out-p1.json'))['params']
rows=[]
for f in sorted(glob.glob('out-p*.json')): rows+=json.load(open(f))['rows']
CAP=3.0
def rate(m,t,bpm): return (abs(0.25+t/2) if m=='pro' else abs(t/2-0.25))*bpm/60
def back(side,m): return ('pro' if m=='anti' else 'anti') if side=='left' else m
def ok(x): return x is not None and x[1]>0 and x[0]<=25
def spinnable(side,m,on,th,bpm): return max(rate(m,on,bpm),rate(back(side,m),th,bpm))<=CAP
# per path, per pattern: set of setting indices that work
work={}
for r in rows:
    k=(r['side'],r['motion'],r['on'],r['third'])
    work[(r['path'],)+k]=frozenset(i for i,x in enumerate(r['res']) if ok(x) and spinnable(*k,P[i]['bpm']))
pats=sorted({k[1:] for k in work})
def name(side,m,on,th):
    if side=='left': return f"{m.title()} {on:g} → {back(side,m).title()} {th:g}"
    return f"{m.title()} {on:g}" if on==th else f"{m.title()} {on:g} → {m.title()} {th:g}"
res=[]
for k in pats:
    allp=frozenset.intersection(*[work[(p,)+k] for p in range(1,9)])
    if not allp: continue
    bp=sorted({P[i]['bpm'] for i in allp}); rr=sorted({P[i]['handRadius'] for i in allp})
    res.append(dict(side=k[0],name=name(*k),key=k,n=len(allp),bpm=(bp[0],bp[-1]),r=(rr[0],rr[-1])))
for side in ['left','right']:
    L=sorted([o for o in res if o['side']==side],key=lambda o:-o['n'])
    print(f"\n=== {side}: {len(L)} patterns work on every path")
    for o in L: print(f"  {o['name']:<22} {o['n']:>2}/35 settings  {o['bpm'][0]}–{o['bpm'][1]} bpm  hand circle {o['r'][0]}–{o['r'][1]} m")
json.dump(res,open('window.json','w'))
# joint CAPs: path x left x right sharing a setting
L=[o['key'] for o in res if o['side']=='left']; R=[o['key'] for o in res if o['side']=='right']
count=0; percap=[]
for p in range(1,9):
    for l in L:
        for r in R:
            s=work[(p,)+l]&work[(p,)+r]
            if s: count+=1
print("\njoint CAPs (path x left x right) with a shared setting:", count, "of", 8*len(L)*len(R))

print("\n=== Gage's chart (left x right, per path)")
LC={'Anti 1 → Pro 0':('left','anti',1,0),'Pro 0 → Anti 1':('left','pro',0,1),'Pro 1 → Anti 1':('left','pro',1,1)}
RC={'Anti 1':('right','anti',1,1),'Pro 0':('right','pro',0,0),'Pro 1 → Pro 0':('right','pro',1,0)}
for ln,l in LC.items():
    for rn,r in RC.items():
        paths=[]; sets=None
        for p in range(1,9):
            s=work[(p,)+l]&work[(p,)+r]
            if s: paths.append(p); sets = s if sets is None else sets|s
        desc = f"{sorted({P[i]['bpm'] for i in sets})} bpm, circles {sorted({P[i]['handRadius'] for i in sets})}" if sets else "never"
        print(f"  L {ln:<16} R {rn:<14} paths {paths}  {desc}")
