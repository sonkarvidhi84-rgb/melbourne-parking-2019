import os
BASE = os.environ.get('PK_BASE', r'E:\PROJECT\data - Copy (2)') + os.sep  # data folder
WORK = os.environ.get('PK_WORK', os.path.join(BASE, 'dashboard_export', 'work')) + os.sep
os.makedirs(WORK + 'out', exist_ok=True)
import pandas as pd, numpy as np, json, re
from shapely.geometry import Polygon
from shapely import minimum_rotated_rectangle
b=BASE
A=pd.read_pickle(WORK+'bays_attr.pkl')
S=pd.read_parquet(b+'dashboard_cache/segments.parquet').set_index('aseg_id')
lat0=-37.81; kx=111320*np.cos(np.radians(lat0)); ky=110540
def toxy(p): return np.array([[ (x-144.96)*kx, (y-lat0)*ky] for x,y in p])
def toll(xy): return xy[:,0]/kx+144.96, xy[:,1]/ky+lat0
def axis(poly):
    r=np.array(minimum_rotated_rectangle(poly).exterior.coords)[:4]
    e=[np.linalg.norm(r[(i+1)%4]-r[i]) for i in range(4)]
    i=int(np.argmax(e[:2]))  # long edge i (and i+2)
    # centre line: midpoints of the short edges
    p=(r[(i+1)%4]+r[(i+2)%4])/2; q=(r[(i+3)%4]+r[i])/2
    w=min(e)
    return q,p,w
side_vec={3:np.array([0,1]),4:np.array([0,-1]),2:np.array([1,0]),5:np.array([-1,0])}
pos={}
for seg,grp in A[A.seg!=''].groupby('seg'):
    rings=json.loads(S.loc[seg,'polygon'])
    parts=[axis(Polygon(toxy(r))) for r in rings]
    # orient all parts along the first part's direction, order by projection
    d0=parts[0][1]-parts[0][0]; d0=d0/np.linalg.norm(d0)
    parts=[(q,p,w) if np.dot(p-q,d0)>=0 else (p,q,w) for q,p,w in parts]
    parts.sort(key=lambda t: np.dot(t[0],d0))
    L=np.array([np.linalg.norm(p-q) for q,p,w in parts]); cum=np.concatenate([[0],np.cumsum(L)]); tot=cum[-1]
    def at(s):
        k=min(np.searchsorted(cum,s,side='right')-1,len(parts)-1); q,p,w=parts[k]
        u=(p-q)/L[k]; return q+u*(s-cum[k]), u, w
    g=grp.copy(); g['num']=g.marker.astype(str).str.extract(r'(\d+)')[0].astype(float)
    for side,gs in g.groupby('side'):
        gs=gs.sort_values(['num','bay']); n=len(gs)
        for j,(_,r) in enumerate(gs.iterrows()):
            s=tot*(0.06+0.88*(j+0.5)/n)
            pt,u,w=at(s); nrm=np.array([-u[1],u[0]])
            if side in side_vec:
                sg=1 if np.dot(nrm,side_vec[side])>=0 else -1; off=nrm*sg*max(w*0.32,3)
            else: off=0
            pos[r.bay]=pt+off
xy=np.array([pos.get(b_,[np.nan,np.nan]) for b_ in A.bay])
lon,lat=toll(xy); A['lon']=np.round(lon,6); A['lat']=np.round(lat,6)
print(A[['lon','lat']].describe())
A.to_pickle(WORK+'bays_pos.pkl')
