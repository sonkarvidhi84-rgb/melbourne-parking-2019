import os
BASE = os.environ.get('PK_BASE', r'E:\PROJECT\data - Copy (2)') + os.sep  # data folder
WORK = os.environ.get('PK_WORK', os.path.join(BASE, 'dashboard_export', 'work')) + os.sep
os.makedirs(WORK + 'out', exist_ok=True)
import pandas as pd, numpy as np, json, re, base64
from shapely.geometry import Polygon, MultiPolygon, LineString, Point
b=BASE
grid=np.load(WORK+'grid.npy'); ids=np.load(WORK+'ids.npy')
dev=pd.read_parquet(b+'processed/devices.parquet').set_index('DeviceId').loc[ids].reset_index()
# --- merge devices by BayId
bays=sorted(dev.BayId.unique()); bidx={x:i for i,x in enumerate(bays)}
NB=len(bays); bg=np.zeros((NB,365,64),np.int8)
for i,bid in enumerate(dev.BayId.values):
    np.maximum(bg[bidx[bid]],grid[i],out=bg[bidx[bid]])
del grid
# --- day types
hol=pd.read_parquet(b+'dashboard_cache/holidays.parquet'); print(hol.head())
hcol=[c for c in hol.columns if 'date' in c.lower()][0]
hset=set(pd.to_datetime(hol[hcol]).dt.date)
dates=pd.date_range('2019-01-01',periods=365)
dt=np.array([2 if (d.date() in hset or d.weekday()==6) else (1 if d.weekday()==5 else 0) for d in dates])
# --- bay attributes: take the device with most events per bay
dd=dev.sort_values('n_events',ascending=False).drop_duplicates('BayId').set_index('BayId').loc[bays].reset_index()
ndev=dev.groupby('BayId').size().loc[bays].values
sign=dd.dominant_sign.fillna('').astype(str)
td=dd.t_typedescs.fillna('').astype(str)
paid=(sign.str.contains(r'MTR|TKT|METER|TICKET',case=False,regex=True)|td.str.contains('Meter|Ticket',regex=True)).values
lz=dd.is_loading_zone.fillna(False).values.astype(bool)
dis=sign.str.contains('DIS',case=True).values
lim=dd.time_limit_min.astype('float').values
ss=pd.read_parquet(b+'dashboard_cache/street_segments.parquet').set_index('aseg_id')
grid_st={'Flinders Street','Flinders Lane','Collins Street','Little Collins Street','Bourke Street','Little Bourke Street','Lonsdale Street','Little Lonsdale Street','La Trobe Street','Spencer Street','King Street','William Street','Queen Street','Elizabeth Street','Swanston Street','Russell Street','Exhibition Street','Spring Street','Market Street'}
def is_cbd(a):
    if a not in ss.index: return False
    r=ss.loc[a]; return r.street_name in grid_st and r.cross_street_1 in grid_st and r.cross_street_2 in grid_st
cbd=np.array([is_cbd(a) for a in dd.aseg_id.fillna('')])
def rate(p,l,c,z,ds):
    if not p or z or ds: return 0.0
    if c and (np.isnan(l) or l<=180): return 7.0
    if np.isnan(l) or l<=120: return 4.0
    if l<=180: return 2.5
    if l<=240: return 2.2
    return 1.0
rates=np.array([rate(p,l,c,z,d) for p,l,c,z,d in zip(paid,lim,cbd,lz,dis)])
print(pd.Series(rates).value_counts(), cbd.sum())
# --- typical profiles: occ share per daytype x hour (16 hours 06..21)
occ=(bg==2); kn=(bg>0)
prof_occ=np.zeros((NB,3,16)); prof_kn=np.zeros((NB,3,16))
for t in range(3):
    o=occ[:,dt==t,:].reshape(NB,-1,16,4).sum(axis=(1,3)); k=kn[:,dt==t,:].reshape(NB,-1,16,4).sum(axis=(1,3))
    prof_occ[:,t]=o; prof_kn[:,t]=k
share=np.where(prof_kn>=8, prof_occ/np.maximum(prof_kn,1), np.nan)
def enc(row):
    return ''.join('.' if np.isnan(v) else chr(65+int(round(v*20))) for v in row)
profs=[enc(share[i].ravel()) for i in range(NB)]
np.save(WORK+'bg.npy',bg); np.save(WORK+'dt.npy',dt)
out=pd.DataFrame({'bay':bays,'devices':ndev,'marker':dd.StreetMarker.values,'street':dd.StreetName.str.title().values,
  'between1':dd.BetweenStreet1.str.title().values,'between2':dd.BetweenStreet2.str.title().values,'side':dd.SideOfStreet.values,
  'area':dd.AreaName.values,'seg':dd.aseg_id.fillna('').values,'sign':sign.values,'limit_min':lim,'loading_zone':lz.astype(int),
  'paid':paid.astype(int),'cbd':cbd.astype(int),'rate':rates,'first':dd.first_date.dt.date.astype(str).values,'last':dd.last_date.dt.date.astype(str).values,'prof':profs})
out.to_pickle(WORK+'bays_attr.pkl'); print(out.head().to_string()); print(len(out), (out.seg=='').sum())
