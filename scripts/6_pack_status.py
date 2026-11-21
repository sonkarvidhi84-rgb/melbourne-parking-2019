import os, numpy as np, pandas as pd
BASE = os.environ.get('PK_BASE', r'E:\PROJECT\data - Copy (2)') + os.sep
WORK = os.environ.get('PK_WORK', os.path.join(BASE, 'dashboard_export', 'work')) + os.sep
bg=np.load(WORK+'bg.npy'); A=pd.read_pickle(WORK+'bays_pos.pkl')
B64='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; lut=np.array(list(B64))
dates=pd.date_range('2019-01-01',periods=365)
for m in range(1,13):
    sub=bg[:,np.where(dates.month==m)[0],:].reshape(len(bg),-1)
    keep=(sub>0).any(1) & A.lon.notna().values
    s=np.pad(sub[keep],((0,0),(0,(-sub.shape[1])%3))).reshape(keep.sum(),-1,3)
    v=s[:,:,0]*16+s[:,:,1]*4+s[:,:,2]
    pd.DataFrame({'bay':A.bay.values[keep],'s':[''.join(lut[r]) for r in v]}).to_csv(WORK+f'out/status_2019_{m:02d}.csv',index=False)
