# MAPC Choropleth Mapper

## What this is

A tool that turns any town-level spreadsheet into an interactive, color-coded map (a "choropleth") of the 101 cities and towns that make up MAPC's Greater Boston region. Everything lives in one file — `index.html` — no installation or server required.

## How to Access and What it does

Click `mapc.github.io/geohub/` which will open a geohub landing page and click `Creative Economy Map` to open the choropleth map.

- Shows a preloaded sample dataset (business counts by town) right away, so there's something to look at immediately.
- Lets you upload your own spreadsheet (`.xlsx`, `.xls`, or `.csv`) with a column of town names and any number of numeric columns.
- Automatically matches town names to the correct municipality on the map, even with typos, abbreviations, or inconsistent spellings.
- Colors each town based on whichever data column you choose.

## What you can do

- Upload a new spreadsheet any time — no coding, no rebuilding, just drag and drop.
- Choose which data column to map, and how it's grouped into color classes (Natural Breaks, Quantiles, or Equal Interval).
- Pick a colorblind-safe color ramp (including MAPC's own blue and green) or switch the basemap style (Light, Voyager, Dark, or OpenStreetMap).
- Select or deselect specific municipalities to include on the map.
- Show or hide municipality name labels.
- Switch to an accessible table view of the same data.
- Download the map as a PNG or PDF.
- Embed it directly on a website (e.g. MAPC's WordPress site) — it works the same way there as it does locally.
- Click the MAPC logo in the header to go to mapc.org.
