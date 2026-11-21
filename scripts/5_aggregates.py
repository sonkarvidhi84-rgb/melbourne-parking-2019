import os
BASE = os.environ.get('PK_BASE', r'E:\PROJECT\data - Copy (2)') + os.sep  # data folder
WORK = os.environ.get('PK_WORK', os.path.join(BASE, 'dashboard_export', 'work')) + os.sep
os.makedirs(WORK + 'out', exist_ok=True)
import pandas as pd, numpy as np, json
b=BASE
A=pd.read_pickle(WORK+'bays_pos.pkl'); bg=np.load(WORK+'bg.npy'); dt=np.load(WORK+'dt.npy')
DTN=['Weekday','Saturday','Sunday/holiday']
dates=pd.date_range('2019-01-01',periods=365)
# bays.csv
bo=A.copy(); bo['limit_min']=bo.limit_min.astype('Int64')
bo.to_csv(WORK+'out/bays.csv',index=False)
# city slots
vac=(bg==1).sum(0); occ=(bg==2).sum(0)  # 365x64
rows=[]
for d in range(365):
    for s in range(64):
        m=360+15*s; rows.append((dates[d].strftime('%Y-%m-%d'),DTN[dt[d]],f'{m//60:02d}:{m%60:02d}',int(vac[d,s]),int(occ[d,s])))
pd.DataFrame(rows,columns=['date','day_type','time','vacant','occupied']).to_csv(WORK+'out/city_slots.csv',index=False)
# group profile helper
def grp_prof(mask_rows):
    sub=bg[mask_rows]
    out=[]
    for t in range(3):
        x=sub[:,dt==t,:].reshape(sub.shape[0],-1,16,4)
        v=(x==1).sum(axis=(1,3)).sum(0); o=(x==2).sum(axis=(1,3)).sum(0)
        nd=(dt==t).sum()
        for h in range(16): out.append((DTN[t],h+6,v[h],o[h],(v[h]+o[h])/(nd*4)))
    return out
# area_hour
rows=[]
for a,ix in A.groupby('area').groups.items():
    for t,h,v,o,k in grp_prof(np.array(list(ix))):
        if v+o>0: rows.append((a,t,f'{h:02d}:00',round(100*v/(v+o),1),round(k,1)))
pd.DataFrame(rows,columns=['area','day_type','hour','free_pct','avg_reporting_bays']).to_csv(WORK+'out/area_hour.csv',index=False)
# price_hour
def band(r): return {7.0:'$7.00/h CBD meter',4.0:'$4.00/h meter (≤2h)',2.5:'$2.50/h meter (3h)',2.2:'$2.20/h meter (4h)',0.0:'Free (no meter, LZ, disabled)'}.get(r,f'${r:.2f}/h')
A['band']=A.rate.map(band)
rows=[]
for bnd,ix in A.groupby('band').groups.items():
    rate=A.loc[ix[0],'rate']
    for t,h,v,o,k in grp_prof(np.array(list(ix))):
        if v+o>0: rows.append((bnd,rate,t,f'{h:02d}:00',round(100*o/(v+o),1),round(k,1),len(ix)))
pd.DataFrame(rows,columns=['price_band','rate_per_hour','day_type','hour','occupied_pct','avg_reporting_bays','bays']).to_csv(WORK+'out/price_hour.csv',index=False)
# segments
S=pd.read_parquet(b+'dashboard_cache/street_segments.parquet').set_index('aseg_id')
P=pd.read_parquet(b+'dashboard_cache/segments.parquet').set_index('aseg_id')
rows=[]
for seg,ix in A[A.seg!=''].groupby('seg').groups.items():
    ix=np.array(list(ix)); pr=grp_prof(ix)
    prof=''.join('.' if v+o==0 else chr(65+int(round(20*v/(v+o)))) for t,h,v,o,k in pr)
    rings=json.loads(P.loc[seg,'polygon'])
    enc=[]
    for r in rings:
        q=np.round((np.array(r)-[144.9,-37.85])*1e5).astype(int); d=np.diff(q,axis=0,prepend=[[0,0]]).ravel(); enc.append(' '.join(map(str,d)))
    s=S.loc[seg]
    rates=A.loc[ix,'rate']
    rows.append((seg,s.street_name,s.block_label,s['area'],len(ix),int((A.loc[ix,'loading_zone']==1).sum()),float(rates.mode().iloc[0]),round(float(rates.min()),2),round(float(rates.max()),2),round(s.length_m),'|'.join(enc),prof))
pd.DataFrame(rows,columns=['seg','street','block','area','bays','loading_zone_bays','typical_rate','min_rate','max_rate','length_m','poly','prof']).to_csv(WORK+'out/segments.csv',index=False)
import os
for f in sorted(os.listdir(WORK+'out')): print(f, os.path.getsize(WORK+'out/'+f))
print(pd.read_csv(WORK+'out/price_hour.csv').query("day_type=='Weekday' and hour=='12:00'"))
print(pd.read_csv(WORK+'out/area_hour.csv').area.nunique())
