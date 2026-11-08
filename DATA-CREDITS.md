# Data credits

| Data | Source | Use | Terms |
|---|---|---|---|
| Satellite orbits (GP / OMM) | [CelesTrak](https://celestrak.org) | Live positions of every Amazon Leo (`KUIPER`) and Starlink satellite. The browser caches them for 2 h. | [Usage policy](https://celestrak.org/usage-policy.php): download once per update (every 2 h) and stop on errors. The policy does not cover republishing; the saved snapshot in `web/data/gp-snapshot.json` is an open question with CelesTrak. |
| Satellite catalog (SATCAT) | [CelesTrak SATCAT](https://celestrak.org/satcat/) | Launch dates, launch sites and decay dates for The Line. | As above. |
| Elevation (horizon from UW Bothell) | [Open-Meteo Elevation API](https://open-meteo.com/en/docs/elevation-api), Copernicus DEM GLO-90 | The horizon silhouette and peak angles in Look Up. | Open-Meteo is CC BY 4.0. Copernicus DEM © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European Union and ESA. |
| Earth imagery | [NASA GIBS](https://earthdata.nasa.gov/gibs): VIIRS true color (yesterday) and the VIIRS Black Marble 2016 composite | Day and night globe. | NASA data, no restrictions. |
| Campus aerial imagery | [USGS National Map, USGSImageryOnly](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer) | The opening shot over UW Bothell. | U.S. public domain. |
| Factory locations | Amazon Leo (Kirkland): [GeekWire](https://www.geekwire.com/2022/amazon-readies-kirkland-factory-to-build-kuiper-satellites/), [CNBC](https://www.cnbc.com/2022/10/27/amazon-to-open-kuiper-internet-satellite-factory.html). Starlink (Redmond): [Choose Washington](https://choosewashingtonstate.com/?p=30337). | The city each constellation is built in. | Shown per constellation, not per satellite. |
| Place coordinates | [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org) | UW Bothell, Kirkland and Redmond markers. | © OpenStreetMap contributors, ODbL. |
