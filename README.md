# VEERAPPAN: Space Explorer

A 3D Moon and Mars exploration and mission-design game for Windows, built for the **NASA Space Apps Challenge** on real NASA data.

Fly a Saturn V to the Moon, land at **Hadley–Apennine** (the Apollo 15 site) on real LRO elevation data, scan the real Apollo 15 hardware still parked there, recover debris, drive a rover to the real Apollo 15 geology stations, then fly to **Gale Crater** on Mars (Curiosity's landing site), survive entry, descent and landing, and build a research station from recycled equipment.

---

## 1. Play it

### Option A: the Windows executable (no install needed)
After `npm run dist` (see below), the `release/` folder contains:

| File | What it is |
|---|---|
| `VEERAPPAN-Space-Explorer-1.0.0-portable.exe` | Double-click to play. No installation. |
| `VEERAPPAN-Space-Explorer-1.0.0-setup.exe` | Installer with Start-menu and desktop shortcuts. |

Saves and settings are stored in `%APPDATA%\VEERAPPAN Space Explorer\` (`savegame.json`, `config.json`).

### Option B: run from source
Requirements: **Node.js 20+** (tested with Node 24) on Windows 10/11.

```bash
npm install
npm start
```

`npm start` builds the game and opens it in its own window. Other commands:

```bash
npm run dev
```
Starts a dev server at http://localhost:5173 so you can play in a browser (saves go to browser storage).

```bash
npm test
```
Runs 20 unit tests covering missions, economy, saves, physics and the real-data integrity checks.

```bash
npm run dist
```
Builds the portable `.exe` and the installer into `release/`.

> npm 11 blocks dependency install scripts by default. If Electron does not start after `npm install`, run `npm approve-scripts electron esbuild electron-winstaller` and then `npm rebuild electron`.

---

## 2. Controls

| Key | Action |
|---|---|
| **W A S D** | Move |
| **Mouse** | Look (in free third-person, hold **right mouse** to orbit) |
| **Shift** | Sprint |
| **Space** | Jump (try it on the Moon: about 2 m with real 1.62 m/s² gravity) |
| **Left Ctrl** | **Shift lock** (Roblox-style): locks the mouse, puts the camera over your shoulder, and the astronaut always faces where you aim |
| **V** | First-person / third-person |
| **Mouse wheel** | Zoom (lander: throttle) |
| **E** | Interact: talk, collect, enter/exit rover, airlock, recycler |
| **Q** (hold) | Scanner: aim at equipment, or at the ground for a site survey |
| **F** | Flashlight |
| **R** | Radio Mission Control |
| **B** | Build menu (at the orange build pad) |
| **Tab** | Inventory · **M** map · **J** mission log · **Esc** pause · **F11** fullscreen |

**Rover:** W/S throttle, A/D steer, Space brake, E exit.
**Lander:** hold Space to fire the engine, mouse wheel or Shift/Ctrl for throttle, WASD for RCS translation. Touch down under 3 m/s vertical and 1.5 m/s horizontal.
**Rocket:** A/D pitch to follow the cyan guidance box, Shift/Ctrl throttle, Space to stage, **G** autopilot, `,` and `.` time warp, hold Space in orbit for the departure burn.
**Cruise:** W/A/S/D to point the ship at the cyan marker, Space to burn, `,` and `.` time warp.

---

## 3. Missions

| # | Mission | What you do |
|---|---|---|
| 1 | **First Landing** | Briefing at the launch pad → cockpit checklist → fly the Saturn V to orbit → trans-lunar burn → mid-course correction → land at Hadley → report to CAPCOM → walk to Hadley Base → reach the rille rim at Apollo 15 Station 9A → scan the regolith |
| 2 | **Lost Equipment** | Take the LRV-2 rover to the real Apollo 15 LM descent stage, LRV and ALSEP, and scan debris from the fictional Pathfinder-H scout |
| 3 | **Recovery Operation** | 15-minute timer before a (fictional) solar particle event: recover 4 debris, recycle them, shelter in the airlock |
| 4 | **Rover Exploration** | Drive to Elbow Crater and Apollo 15 Stations 1 and 2 (up the flank of Hadley Delta), collect 3 samples and bring them to the lab |
| 5 | **Mars Expedition** | Launch on the VX-Heavy → trans-Mars injection → parachute window → powered landing in Gale Crater → build the Habitat and Solar Array → weather scan (real InSight data) |
| 6 | **Build the Future** | Recover and recycle Mars debris, collect samples, build the Comms Tower, Science Lab and Oxygen Plant |

Completing a mission unlocks the next, plus new locations (free exploration) and the VX-Heavy spacecraft. Research points, materials, discoveries and station modules are saved. Repeat missions from **Mission Select**; once you have flown there, you can skip the launch and cruise.

---

## 4. Real NASA data vs. gameplay approximations

The game labels every value it shows:
- **NASA DATA** (cyan): real data, with the source in the tooltip.
- **GAME APPROX** (amber): simplified for gameplay.
- **FICTION** (purple): invented for the story.

| Real NASA data (integrated in the game files) | Source |
|---|---|
| Moon terrain: LROC NAC stereo DEM of Apollo 15 (1.5 m/px), 6 × 6 km playable area; LOLA DEM 60 km backdrop | NASA Moon Trek ArcGIS ImageServer (data archived in PDS) |
| Moon imagery: LROC NAC 50 cm/px mosaic; LRO WAC global mosaic | Moon Trek WMTS |
| Mars terrain: HiRISE/CTX Gale DEM (1 m/px); MOLA+HRSC DEM 90 km backdrop (Mount Sharp, crater rim) | Mars Trek ImageServer |
| Mars imagery: HiRISE mosaic of Curiosity's landing area, coloured with the Viking MDIM 2.1 colour mosaic | Mars Trek |
| Positions of the Apollo 15 LM descent stage, LRV, ALSEP and Stations 1–10; Apollo 11 hardware; Curiosity waypoints | Trek MapServer feature queries |
| Apollo 15 EVA traverses and the Curiosity traverse (on the map and as ground tracks) | Trek MapServer |
| Descriptions of real hardware and sites (quoted in scanner cards with the source URL) | Trek bookmark pages |
| FeO, plagioclase, pyroxene, olivine and thorium at the Apollo 15 site (ground scan) | Kaguya MI and Lunar Prospector GRS layers via Moon Trek |
| Mars weather: air temperature, pressure, wind (InSight, Sol 675–681) | api.nasa.gov InSight Weather (cached, refreshed live if online) |
| Apollo 15 sample facts: 15415 "Genesis Rock", 15555 "Great Scott", 15016 | Lunar Sample Compendium (curator.jsc.nasa.gov), listed on data.nasa.gov |
| 3D models: Apollo Lunar Module, Saturn V, Ingenuity, and Perseverance, Viking and Z2 suit as base exhibits | science.nasa.gov/3d-resources |
| Mission context records (LRO, LOLA, LROC, MSL, HiRISE) | PDS Search API (pds.nasa.gov) |
| Main menu: Astronomy Picture of the Day; offline fallback is the Apollo 17 "Blue Marble" | api.nasa.gov APOD, images-api.nasa.gov |
| Surface gravity, radii, Mars atmosphere | NASA Planetary Fact Sheet |

**Gameplay approximations** (labelled in-game): suit O2 lasts 15 minutes instead of ~7 hours; lander and rocket masses and thrust are simplified (the LM-class descent engine is 45 kN, as on Apollo); ascent and cruise time are compressed; recycling yields and module costs; MSL entry hardware is at *approximate* positions; the Sun angle is a plausible Apollo 15 EVA value; InSight weather (measured ~600 km away) stands in for Gale Crater.

**Fiction:** the characters, Hadley Base and Aeolis Outpost, the Pathfinder-H scout debris, the VX-1 lander, the VX-Heavy rocket, and the station modules.

Apollo hardware is treated as a **protected heritage site**: you can scan it but never remove it. NASA published recommendations in 2011 on protecting U.S. lunar artefacts.

Full source list: [ATTRIBUTION.md](ATTRIBUTION.md), and **Credits & NASA Data** in the game (generated from `public/assets/provenance.json`).

---

## 5. NASA API key (optional)

The game runs fully offline from cached NASA data. Two live extras use **api.nasa.gov**: the Astronomy Picture of the Day on the main menu, and a live refresh of InSight weather. Without a key they use NASA's shared `DEMO_KEY` (rate-limited to about 30 requests/hour per IP).

To get your own free key:
1. Go to **https://api.nasa.gov**.
2. Under **Generate API Key**, enter your first name, last name and email, then submit.
3. The key appears on the page immediately and is emailed to you.
4. In the game, open **Settings → NASA API key**, paste it and click **Save key**.

**Security:** the key is never written into the game files or the `.exe`. It is saved only in your own `%APPDATA%\VEERAPPAN Space Explorer\config.json`. Requests are made by the Electron main process, which only allows the two NASA endpoints the game uses. When regenerating data with the tool below, pass the key as an environment variable (`NASA_API_KEY`); it is never stored.

---

## 6. Rebuilding the NASA data

All data is already in `public/assets/`. To fetch it again from NASA:

```bash
node tools/fetch-nasa-data.mjs
```
Downloads the DEMs, imagery, waypoints, models, API snapshots and PDS/data.nasa.gov records, and writes `provenance.json`. Pass `moon`, `mars`, `globes`, `models` or `api` to fetch one part.

```bash
node tools/optimize-models.mjs
```
Removes Draco compression, simplifies the NASA GLBs and converts their textures to WebP (keeps them under 3 MB each).

```bash
node tools/analyze-site.mjs
```
Prints the real waypoint positions and the flat ground used to place the bases.

---

## 7. Performance (weak laptops)

- Graphics presets **Low / Medium / High** (Settings). Low uses a 0.75× render scale, no shadows, half-resolution terrain and fewer rocks.
- **Auto-adjust** (on by default) drops the preset if the frame rate stays under ~26 FPS.
- Terrain uses chunked LOD (3 levels), instanced rocks, a single sun shadow that follows the player, and no post-processing.
- Models are simplified, and all audio is synthesized at runtime, so the game ships no audio files.

---

## 8. Project structure

```
electron/          main process (window, saves, key storage, NASA API bridge), preload
src/core/          Game loop, input, audio synth, save system, settings, asset loader
src/world/         real-DEM heightfield + terrain LOD mesh, sky, rocks, procedural props
src/player/        astronaut controller (real gravity), camera rig with shift lock
src/vehicles/      rover
src/sim/           pure physics: suit consumables, lander, rocket ascent (unit tested)
src/gameplay/      missions engine + 6 missions, dialogues, inventory/recycling/building
src/levels/        SurfaceLevel (Moon/Mars/Earth pad + landing/EDL), Cockpit, Ascent, Cruise
src/ui/            menus, HUD, dialogue, scanner cards, map, build menu, results
src/data/          catalog: sites, equipment, samples, modules, NPCs, sources
tools/             NASA data fetcher, model optimizer, site analysis, ascent tuning sim
public/assets/     terrain (.bin + .json), textures, models, data, provenance.json
tests/             vitest suite
```
