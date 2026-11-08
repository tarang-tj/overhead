# OVERHEAD

**Every active satellite over you, now or any time you pick. And for Amazon Leo and Starlink, the supply chain that put them there.**

Every active satellite CelesTrak tracks: 16,896 in the 2026-11-08 run, colored by type (stations, navigation, weather, earth observation, science, comms, Starlink, Amazon Leo, other).
- **Where:** over UW Bothell by default, or over you with your phone's location.
- **When:** live, or scrubbed 24 hours either way.
- **Search** any satellite by name or number. **Tap** any dot for what it is, who owns it, when and where it launched, how high and fast it is, and its next pass over you.
- **"What's that light?"** In Look Up, point at the sky and it names the satellites within 5 degrees, sunlit or in shadow.

Two satellite factories sit a short drive from the UW Bothell campus:
- **Amazon Leo** (formerly Project Kuiper): satellites are built in Kirkland, with Redmond as the design hub.
- **Starlink:** satellites are built at SpaceX's facility in Redmond.

OVERHEAD treats each constellation as a production line you can watch from orbit:

```
factory  ->  launch site  ->  raising (work in progress)  ->  on station (finished goods)  ->  retired
Kirkland     Cape Canaveral    climbing to the shell          serving customers               descending / burned up
Redmond      Vandenberg
             Kourou
             Starbase
```

## What it shows

| Mode | What you get |
|---|---|
| **Intro** | One continuous zoom from UW Bothell (USGS aerial imagery) up past Kirkland and Redmond, then out to the shells where the fleets fly. |
| **Orbit** | The real Earth (NASA GIBS imagery: yesterday's day side, Black Marble night lights) with every satellite at its current position, propagated with SGP4 once a second in a Web Worker. Tap a pass in Tonight to highlight it with a 10-minute orbit arc. |
| **The Line** | Stage counts, launches and decays by month, launch sites, and a Little's Law read on each line. Color the globe by stage: raising green, descending red. |
| **Explore** (always on) | Search with ISS, Hubble, Tiangong and NOAA 20 chips; a type legend that doubles as a filter; a time bar (24 h either way, 1x / 60x / 600x, Now); "Use my location". |
| **Look Up** | The sky from campus with the real horizon: the Cascades, Rainier, Baker and the Olympics, from the Copernicus elevation model. On a phone, point it at the sky. On desktop, drag to look around. Short tails show which way each satellite is moving. |
| **Tonight** | The passes you can actually see from campus in the next 24 hours, plus a share card. |

## The numbers (CelesTrak, 2026-11-07)

| | Amazon Leo | Starlink |
|---|---|---|
| Launched (payloads) | 398 | 13,024 |
| Raising | 4 | 92 |
| On station | 383 | 10,704 |
| Descending | 4 | 407 |
| Decayed | 6 | 1,820 |
| Operational shells | 620-630 km | 350-360 km, 460-490 km |
| Last launch in the catalog | 2026-07-02 | 2026-10-31 |
| Implied time to raise (Little's Law) | undefined: no launches in 90 days | about 20 days |

**How the stages are measured:**
- **Shells** are the altitude modes that hold at least 3% of a fleet; they are not hard-coded.
- A satellite outside every shell (below the lowest, or in a gap between shells) counts as **raising** if it launched in the last 180 days, and **descending** otherwise. Above the highest shell counts as on station.
- **Little's Law:** W = L / λ, where L is the raising count and λ is launches per day over the last 90 days.

Launched counts include one payload per constellation that has no decay date and no current orbit record in CelesTrak (KUIPER-00158 and STARLINK-30342), so launched = in orbit + decayed + 1. The pipeline is in `tools/` and the shared math in `web/orbit/line-math.js`.

## Honesty rules

- **Data age:** the badge always shows how old the orbit data is. It says when the page is running on the saved snapshot.
- **"Visible"** means above 10 deg, sunlit, and the sun at least 6 deg below the horizon at campus. Brightness is not modeled. Amazon Leo averages about magnitude 6.3 (IAU-led study, 2026), near the naked-eye limit, so in a city sky most are faint or invisible.
- **Factory locations** are per constellation. Public data does not say which building made which satellite.
- **Flat horizon away from UW Bothell.** The terrain horizon is modeled only for UW Bothell, and the app says so.
- **Owners and launch sites come from SATCAT codes.** Unknown codes show raw.
- **No guesses about intent.** The app says "last Amazon Leo launch in the catalog" rather than claiming launches are paused.

## Run it

```
npm install
npm run serve        # http://127.0.0.1:4173
npm run gate         # lint + unit tests + headless boot probe
npm run data         # refresh web/data from CelesTrak and Open-Meteo (policy-compliant cache)
```

There is no bundler: it is plain ES modules plus an importmap for three.js and satellite.js. Data credits and terms are in [DATA-CREDITS.md](DATA-CREDITS.md).

## License

Code: MIT. Data stays under its sources' terms (see DATA-CREDITS.md).
