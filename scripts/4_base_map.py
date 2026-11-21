import os
BASE = os.environ.get('PK_BASE', r'E:\PROJECT\data - Copy (2)') + os.sep  # data folder
WORK = os.environ.get('PK_WORK', os.path.join(BASE, 'dashboard_export', 'work')) + os.sep
os.makedirs(WORK + 'out', exist_ok=True)
import json, numpy as np, pandas as pd
from shapely.geometry import shape
b=BASE
g=json.load(open(b+'parking/road-corridors.geojson'))
rows=[]
for f in g['features']:
    s=shape(f['geometry']); c=s.centroid
    if not (144.915<c.x<145.0 and -37.842<c.y<-37.782): continue
    s=s.simplify(0.000015)
    for p in ([s] if s.geom_type=='Polygon' else list(s.geoms)):
        q=np.round((np.array(p.exterior.coords)-[144.9,-37.85])*1e5).astype(int)
        d=np.diff(q,axis=0,prepend=[[0,0]]).ravel()
        rows.append({'seg_id':f['properties']['seg_id'],'name':f['properties']['seg_descr'],'kind':f['properties']['str_type'],'path':' '.join(map(str,d))})
pd.DataFrame(rows).to_csv(WORK+'out/streets.csv',index=False)
