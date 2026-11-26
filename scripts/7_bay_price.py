import re, sys, pandas as pd
b=pd.read_csv(sys.argv[1],keep_default_na=False)
DAYS=['MON','TUE','WED','THU','FRI','SAT','SUN']
def tmin(h,m,ap):
    h=int(h); m=int(m or 0)
    if ap:
        ap=ap.upper()
        if ap=='PM' and h<12: h+=12
        if ap=='AM' and h==12: h=0
    return h*60+m
def parse(sign):
    s=sign.upper()
    s=re.sub(r'\(?\b(621|722)\b\)?','',s).replace('OFFENCE','')
    s=s.replace('12MD','12:00PM')
    s=re.sub(r'\b(\d{1,2})(\d{2})\s*(AM|PM)',r'\1:\2\3',s)          # 730am -> 7:30am
    s=re.sub(r'\b(\d{2})(\d{2})\s*-\s*(\d{2})(\d{2})\b',r'\1:\2-\3:\4',s)  # 1000-1500
    s=s.replace('.',':')
    s=re.sub(r'\bM-SA\b','M-SAT',s); s=re.sub(r'\bM-SU\b','M-SUN',s)
    days=None
    if re.search(r'WED-MON',s): days='1011111'
    m=None if days else re.search(r'\b(MON|M)\s*-\s*(FRI|SAT|SUN|F)\b',s) or re.search(r'\b(MON|M)(?:\s*TO\s*)(FRI|SAT|SUN)\b',s)
    if m:
        end={'F':'FRI','FRI':'FRI','SAT':'SAT','SUN':'SUN'}[m.group(2)]
        days=''.join('1' if i<=DAYS.index(end) else '0' for i in range(7))
    elif days: pass
    elif re.search(r'\bSAT\b',s) and not re.search(r'SUN',s): days='0000010'
    elif re.search(r'\bSUN\b',s): days='0000001'
    tm=re.search(r'(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*(?:-|TO)\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?',s.replace('M-SUN','').replace('M-SAT','').replace('M-F',''))
    st=en=None
    if tm:
        h1,m1,a1,h2,m2,a2=tm.groups()
        st=tmin(h1,m1,a1 or None); en=tmin(h2,m2,a2 or None)
        if not a2 and en<=st: en+=12*60   # e.g. 7:30-6:30 without am/pm
        if a2=='PM' and not a1 and st>=12*60: pass
        if a2=='PM' and not a1 and int(h1)<12 and tmin(h1,m1,'PM')<en and st<6*60: st=tmin(h1,m1,'PM')
    if 'MTR' in s or 'METER' in s: rule='Meter'
    elif 'TKT' in s or 'TICKET' in s: rule='Ticket'
    elif s.startswith('LZ') or 'LOADING' in s or 'L/ZONE' in s: rule='Loading zone'
    elif 'RPA' in s or 'PERMIT' in s: rule='Permit area'
    elif 'DIS' in s: rule='Disabled'
    elif s.strip()=='' : rule='No sign recorded'
    else: rule='Time limit only (free)'
    return days,st,en,rule
rows=[]
for r in b.itertuples():
    d,st,en,rule=parse(r.sign)
    assumed=0
    if r.paid and r.rate>0 and rule not in ('Meter','Ticket'): rule='Meter'
    if r.paid and r.rate>0 and 'NO PARK' in r.sign.upper(): st=None   # 2019 sign is a No Parking panel: real meter hours unknown
    if r.paid and r.rate>0 and st is None: d,st,en,assumed='1111110',450,1110,1
    rows.append(dict(bay=r.bay,sign=r.sign,rule=rule,rate=r.rate if r.paid else 0.0,paid=r.paid,
       days=d if d else '1111111',has_days=1 if d else 0,start_min=st if st is not None else '',end_min=en if en is not None else '',assumed=assumed))
o=pd.DataFrame(rows)
o.to_csv(sys.argv[2],index=False)
pd.set_option('display.width',200)
print(o.rule.value_counts())
print('paid without times:',((o.rate>0)&(o.start_min=='')).sum(), ' rate>0 total', (o.rate>0).sum())
chk=o.drop_duplicates('sign')[['sign','days','start_min','end_min','rule','rate']]
chk['t']=chk.apply(lambda r: f"{int(r.start_min)//60:02d}:{int(r.start_min)%60:02d}-{int(r.end_min)//60:02d}:{int(r.end_min)%60:02d}" if r.start_min!='' else '',axis=1)
print(chk[['sign','days','t','rule','rate']].to_string())
