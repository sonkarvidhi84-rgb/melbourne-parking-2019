# Melbourne on-street parking availability, 2019

An interactive dashboard of the City of Melbourne's 2019 in-ground parking sensor data. It replays every sensor bay in 15-minute steps (06:00–22:00) for each day of 2019, and groups the parking areas by land-use type (office, shopping, mixed-use, residential, institutional).

**Live page:** `https://<your-username>.github.io/<this-repo-name>/` (once GitHub Pages is switched on, see below)

## What's in the dashboard

- **Map:** every 2019 sensor bay and street block. You can colour it by the status at a chosen date and time, by the typical availability for that day type and hour, or by the land-use type of the area.
- **Citywide day curve:** the share of bays free through the selected day, compared with a typical day.
- **Area heatmap:** the average share of bays free by sensor area and hour.
- **Land-use section:**
  - availability by type of area, hour by hour (line chart and an hour-by-day-type grid)
  - the fullest and emptiest hour for each type
  - the business mix behind each label
  - a table of which area is which type
- **Price by time:** each bay's hourly price follows its 2019 sign (days and hours charged).
  - colour the map by the price at the chosen date and time
  - click a bay or block to see its price through the day
  - see how many bays charge each rate every 15 minutes, the average price by type of area, and a table of charging schedules
- **Price vs demand:** occupancy by estimated 2019 hourly rate.
- **Street blocks table:** vacant bays per block at the selected moment.

## Repository layout

```
index.html        the page
app.js            main dashboard code (map, charts, tables)
landuse.js        land-use helpers, calculations, line chart and tables
landuse2.js       land-use hour grid, fullest/emptiest chart, business-mix chart
pricing.js        price by time: per-bay schedules, map colouring, price charts and table
dash-lite.js      small runtime that loads the CSV files and runs the drawings
d3.min.js         D3 v7.9.0
style.css         styles (light and dark)
data/             all CSV data (about 35 MB)
scripts/          Python scripts that built the CSV files from the raw sensor archive
.nojekyll         tells GitHub Pages to serve the files as they are
```

## Publish with GitHub Pages

1. Create a new **public** repository on GitHub (Pages on a free account needs a public repository).
2. Upload everything in this folder, keeping the `data/` and `scripts/` folders. Include `.nojekyll`, which some file pickers hide because its name starts with a dot.
3. Open **Settings → Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, set Branch to **main** and the folder to **/ (root)**, then click **Save**.
4. After a minute or two, the site is live at `https://<your-username>.github.io/<repo-name>/`.

## Run it on your own computer

Browsers block a page opened by double-click from reading local files, so serve the folder:

```
cd melbourne-parking-2019
python -m http.server 8000
```

Then open http://localhost:8000/.

## Data files (`data/`)

| File | Contents |
|---|---|
| `bays.csv` | One row per 2019 sensor bay: street block, sign, time limit, estimated rate, approximate position, typical occupancy profile |
| `segments.csv` | Street blocks: outline, bay counts, rates, typical share free |
| `streets.csv` | Road corridor outlines for the base map |
| `city_slots.csv` | Vacant and occupied bays citywide, every 15 minutes, every day of 2019 |
| `area_hour.csv` | Average % free by sensor area, day type and hour |
| `area_landuse.csv` | Land-use type of each sensor area and its business mix |
| `price_hour.csv` | Average % occupied by estimated price band, day type and hour |
| `prices_2019.csv` | Assumed 2019 hourly rates |
| `bay_price.csv` | Each bay's charging schedule from its 2019 sign: rule, rate, days (Mon–Sun mask), start and end minute, whether the sign names days, and whether the hours were assumed |
| `status_2019_MM.csv` | Every bay's state at each 15-minute step for month MM, packed 3 steps per character (see below) |

Encoding notes:

- **Outlines** are delta-encoded in units of 1e-5 degrees from the point (144.9, −37.85).
- **`prof` columns** hold 48 characters: 3 day types (weekday, Saturday, Sunday/holiday) × 16 hours (06–21). `A` to `U` stand for 0–100% in 5% steps, and `.` means no data.
- **Status files:** the `s` column uses base64url characters. Each character holds 3 steps of 2 bits: 0 = no reading, 1 = vacant, 2 = occupied. The step index is `(day_of_month − 1) × 64 + slot`, where slot 0 is 06:00.

## Method notes and caveats

- **Sensor data:** the source is 42.7 million arrival and departure intervals. Each bay was sampled every 15 minutes. Readings from stuck sensors were dropped, and replacement sensors in the same bay were merged.
- **Bay positions:** the 2019 archive has no coordinates. Each bay is placed along its street block (matched by street name and cross streets), so positions are approximate within the block.
- **Prices** are estimates based on the City of Melbourne's 2018–19 rates, as reported by ABC News on 15 May 2018.
- **Price by time:** each bay charges its rate only on the days and hours on its 2019 sign and is free otherwise. Loading zones, disabled, permit-area and time-limit-only bays are free. On public holidays, signs that name days of the week don't apply (City of Melbourne rule), so those bays are free. Nine paid bays whose 2019 sign was blank or a No Parking panel are assumed to charge Mon–Sat 07:30–18:30.
- **Land-use types:** each 2019 business in the City's land-use census (CLUE) was assigned to the nearest sensor bay within 120 m, and each area's type comes from its business mix and how many businesses it has per bay. The census counts businesses, not homes, so "Mainly residential" and "Mixed-use" are inferred from low business density.
- **Naming quirks:** "Domain" means the residential streets of South Yarra west, not the parkland. The area named "All" in the source data is mostly East Melbourne and Jolimont back streets.

## Rebuilding the data

The scripts in `scripts/` run in order (1 to 6). `7_bay_price.py` turns `bays.csv` into `bay_price.csv`: `python scripts/7_bay_price.py data/bays.csv data/bay_price.csv`. They read the processed 2019 sensor archive, which is not included here because it is several GB. Set the `PK_BASE` environment variable to your data folder before running them. They need pandas, pyarrow, numpy and shapely.

## Data sources and licence

- **Parking data:** City of Melbourne Open Data, the 2019 on-street car parking sensor data, parking bays and road corridors. Published under Creative Commons Attribution (CC BY), see https://data.melbourne.vic.gov.au
- **Business data:** City of Melbourne Census of Land Use and Employment (CLUE), the 2019 business establishments file, CC BY.
- **Charting library:** D3 v7.9.0, under the ISC licence.
