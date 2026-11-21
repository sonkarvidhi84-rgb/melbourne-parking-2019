import os
BASE = os.environ.get('PK_BASE', r'E:\PROJECT\data - Copy (2)') + os.sep  # data folder
WORK = os.environ.get('PK_WORK', os.path.join(BASE, 'dashboard_export', 'work')) + os.sep
os.makedirs(WORK + 'out', exist_ok=True)
import pandas as pd, numpy as np, glob
base=BASE
dev=pd.read_parquet(base+'processed/devices.parquet')
ids=np.sort(dev.DeviceId.unique()); idx={d:i for i,d in enumerate(ids)}
ND=len(ids); NDAY=365; S=64  # 06:00..21:45
grid=np.zeros((ND,NDAY,S),dtype=np.int8)  # 0 unknown, 1 vacant, 2 occupied
t0=np.datetime64('2019-01-01T00:00')
for f in sorted(glob.glob(os.path.join(base,'processed','events_2019','*','part-0.parquet'))):
    d=pd.read_parquet(f,columns=['DeviceId','ArrivalTime','DepartureTimeClean','VehiclePresent','flag_stuck'])
    d=d[~d.flag_stuck]
    a=((d.ArrivalTime.values-t0)/np.timedelta64(1,'m')).astype(np.int64)
    b=((d.DepartureTimeClean.values-t0)/np.timedelta64(1,'m')).astype(np.int64)
    # global 15-min grid index g: minute=15*g ; covered if a<=15g<b
    g0=-(-a//15); g1=-(-b//15)  # [g0,g1)
    n=np.clip(g1-g0,0,None)
    keep=n>0
    g0=g0[keep]; n=n[keep]; di=np.array([idx[x] for x in d.DeviceId.values[keep]]) if False else pd.Series(d.DeviceId.values[keep]).map(idx).values
    st=np.where(d.VehiclePresent.values[keep],2,1).astype(np.int8)
    rep=np.repeat(np.arange(len(n)),n)
    off=np.arange(rep.size)-np.repeat(np.cumsum(n)-n,n)
    g=g0[rep]+off
    day=g//96; tod=g%96 - 24
    m=(day>=0)&(day<NDAY)&(tod>=0)&(tod<S)
    grid[di[rep][m],day[m],tod[m]]=st[rep][m]
    print(f, len(d), m.sum(), flush=True)
np.save(WORK+'grid.npy',grid); np.save(WORK+'ids.npy',ids)
