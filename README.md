# Melbourne on-street parking availability, 2019

Interactive dashboard of the City of Melbourne 2019 in-ground parking sensor archive, replayed every 15 minutes (06:00–22:00) for every day of 2019.

Pick a date and time, zoom the map, and click a street block or bay to see its availability.

- `index.html`, `style.css`, `app.js`: the dashboard
- `dash-lite.js`: small data loader
- `d3.min.js`: D3 v7.9.0
- `data/`: the CSV files the dashboard reads

Bay positions are approximate within their street block (the 2019 archive has no coordinates). Hourly prices are estimates from 2019 signs and the City of Melbourne 2018–19 budget rates.
