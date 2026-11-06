// Game catalog. Every entry is tagged:
//   data: 'nasa'   -> value or fact comes from a NASA source (see `source`)
//   data: 'approx' -> gameplay approximation (clearly labelled in the UI)
//   data: 'fiction'-> invented for the story

export const SOURCES = {
  trek: 'NASA Solar System Treks (trek.nasa.gov)',
  factsheet: 'NASA Planetary Fact Sheet (nssdc.gsfc.nasa.gov/planetary/factsheet)',
  lsc: 'Lunar Sample Compendium, C. Meyer, NASA JSC (curator.jsc.nasa.gov/lunar/lsc), listed on data.nasa.gov',
  insight: 'NASA InSight Mars Weather Service API (api.nasa.gov)',
  pds: 'NASA Planetary Data System (pds.nasa.gov)',
  kaguya: 'JAXA SELENE/Kaguya Multiband Imager mineral maps, served by Moon Trek',
  lp: 'Lunar Prospector Gamma-Ray Spectrometer thorium map, served by Moon Trek',
  models: 'NASA 3D Resources (science.nasa.gov/3d-resources)',
  msl: 'NASA PDS context record: Mars Science Laboratory (pds.nasa.gov)',
};

// ---------------- Planetary constants (real) ----------------
export const BODIES = {
  earth: { name: 'Earth', g: 9.81, radiusKm: 6371, data: 'nasa', source: SOURCES.factsheet },
  moon: {
    name: 'Moon', g: 1.62, radiusKm: 1737.4, dayLengthEarthDays: 29.5, atmosphere: 'Essentially none (exosphere)',
    surfaceTemp: 'About +121 °C in sunlight to -133 °C in darkness (NASA)', data: 'nasa', source: SOURCES.factsheet,
  },
  mars: {
    name: 'Mars', g: 3.71, radiusKm: 3389.5, solLength: '24 h 39 min 35 s', atmosphere: '~95% carbon dioxide; mean surface pressure ~6 mbar (610 Pa)',
    data: 'nasa', source: SOURCES.factsheet,
  },
};

// ---------------- Sites ----------------
export const SITES = {
  moon: {
    id: 'moon', body: 'moon', name: 'Hadley–Apennine, Moon', subtitle: 'Apollo 15 landing region (26.1°N, 3.6°E)',
    core: 'moon_a15_core', far: 'moon_a15_far', coreTex: 'textures/moon_a15_core.jpg', farTex: 'textures/moon_a15_far.jpg',
    waypoints: 'data/apollo15_waypoints.json', path: 'data/apollo15_path.json',
    sun: { az: 100, el: 30 }, // morning Sun from the east; Apollo 15 EVAs saw ~12–40° elevations over three days (approximation)
    base: { x: -1020, z: -930, name: 'Hadley Base' },           // fictional outpost (flat ground near the rille rim)
    landing: { x: -760, z: -640 },
    spawn: { x: -770, z: -615 },
    roverSpot: { x: -985, z: -905 },
    tint: [1, 1, 1], contrast: 1.15, colorize: false,
    terrainData: 'LRO LROC NAC DEM (1.5 m/px) + LOLA DEM (118 m/px), LROC NAC & WAC image mosaics',
  },
  mars: {
    id: 'mars', body: 'mars', name: 'Gale Crater, Mars', subtitle: 'Curiosity landing region, Aeolis Palus (4.6°S, 137.4°E)',
    core: 'mars_gale_core', far: 'mars_gale_far', coreTex: 'textures/mars_gale_core.jpg', farTex: 'textures/mars_gale_far.jpg',
    waypoints: 'data/curiosity_waypoints.json', path: 'data/curiosity_path.json',
    sun: { az: 130, el: 35 },
    base: { x: 1150, z: -260, name: 'Aeolis Outpost' },
    landing: { x: 1100, z: -420 },
    spawn: { x: 1112, z: -402 },
    roverSpot: { x: 1110, z: -230 },
    tint: [1, 1, 1], contrast: 1.2, colorize: true,
    terrainData: 'MRO HiRISE/CTX Gale DEM (1 m/px) + MOLA/HRSC DEM (200 m/px), HiRISE mosaic coloured with Viking MDIM 2.1',
  },
};

// ---------------- Geology samples ----------------
// The player's samples are new finds; each is compared with a REAL catalogued Apollo/MSL sample of the same rock type.
export const SAMPLE_TYPES = {
  mare_basalt: {
    name: 'Mare basalt', site: 'moon', research: 40,
    reference: { id: '15555 "Great Scott"', facts: 'Olivine-normative basalt, 9,614 g, one of the largest samples returned from the Moon; age about 3.3 billion years; cosmic-ray exposure about 80 million years.', source: SOURCES.lsc, data: 'nasa' },
  },
  vesicular_basalt: {
    name: 'Vesicular basalt', site: 'moon', research: 45,
    reference: { id: '15016', facts: 'Vesicular olivine basalt, 923.7 g. Gas bubbles (vesicles) make up about 50% of its volume; its magma came from deeper than 250 km.', source: SOURCES.lsc, data: 'nasa' },
  },
  anorthosite: {
    name: 'Anorthosite fragment', site: 'moon', research: 120,
    reference: { id: '15415 "Genesis Rock"', facts: 'Ferroan anorthosite, 269.4 g, almost pure plagioclase. Found by Scott and Irwin near Spur Crater, Apollo 15.', source: SOURCES.lsc, data: 'nasa' },
  },
  regolith: {
    name: 'Regolith scoop', site: 'moon', research: 20,
    reference: { id: 'Site chemistry', facts: 'Orbital measurements at this site (see Scanner).', source: SOURCES.kaguya, data: 'nasa' },
  },
  mudstone: {
    name: 'Mudstone', site: 'mars', research: 90,
    reference: { id: 'Yellowknife Bay (Glenelg)', facts: 'Curiosity drilled fine-grained sedimentary rock in the Glenelg/Yellowknife Bay area, evidence for an ancient lake environment (NASA Trek feature text).', source: SOURCES.trek, data: 'nasa' },
  },
  conglomerate: {
    name: 'Conglomerate', site: 'mars', research: 70,
    reference: { id: 'Goulburn outcrop, Bradbury Landing', facts: 'Conglomerated fluvial sediment at Bradbury Landing: rounded pebbles deposited by flowing water (NASA Trek feature text).', source: SOURCES.trek, data: 'nasa' },
  },
  dune_sand: {
    name: 'Basaltic sand', site: 'mars', research: 35,
    reference: { id: 'Rocknest / Bagnold Dunes', facts: 'Curiosity scooped wind-blown sand at Rocknest and later studied the active Bagnold Dunes (NASA Trek feature text).', source: SOURCES.trek, data: 'nasa' },
  },
};

// ---------------- Equipment & discoveries ----------------
// heritage: true  -> REAL historic hardware at its REAL position (from Trek). Protected: scan & inspect only.
// heritage: false -> fictional debris from an invented earlier robotic programme. Can be collected & recycled.
// placement: 'trek' (real coordinates) | 'approx' (real object, approximate position) | 'game' (fictional)
export const EQUIPMENT = [
  // ===== MOON: real Apollo 15 hardware =====
  {
    id: 'a15_lmds', site: 'moon', name: 'Apollo 15 Lunar Module Descent Stage "Falcon"', heritage: true, placement: 'trek', waypoint: 'Lunar Module Descent Stage', model: 'lm_descent',
    purpose: 'Landing stage of the Apollo 15 Lunar Module. It carried the descent engine and propellant, and served as the launch pad for the ascent stage on 2 August 1971.',
    condition: 'Intact, left on the surface since 1971. Thermal blankets are probably degraded by 50+ years of UV and micrometeoroids (NASA 2011 heritage guidance).',
    reuse: 'None. A protected heritage site; scan only, do not disturb.', impact: 'Historic artefact. Rocket exhaust from new landings nearby could sandblast it, so landings are kept well away.',
    research: 60, scanTime: 2.5,
  },
  {
    id: 'a15_lrv', site: 'moon', name: 'Apollo 15 Lunar Roving Vehicle', heritage: true, placement: 'trek', waypoint: 'LRV', model: 'lrv_old',
    purpose: 'The first crewed rover on the Moon, battery-powered, carried Scott and Irwin about 28 km across three EVAs.',
    condition: 'Parked where it was left; the TV camera was used to film the ascent stage lift-off.',
    reuse: 'None. A protected heritage artefact.', impact: 'Left in place; wheel tracks still visible from orbit (LROC).',
    research: 60, scanTime: 2.5,
  },
  {
    id: 'a15_alsep', site: 'moon', name: 'Apollo 15 ALSEP', heritage: true, placement: 'trek', waypoint: 'ALSEP', model: 'alsep',
    purpose: 'Apollo Lunar Surface Experiments Package: seismometer, magnetometer, solar-wind and heat-flow experiments powered by a radioisotope thermoelectric generator (RTG).',
    condition: 'Switched off from Earth in 1977. The RTG output has decayed.',
    reuse: 'None. A protected heritage artefact.', impact: 'The RTG contains plutonium-238; keep clear.',
    research: 80, scanTime: 3,
  },
  {
    id: 'a15_lrrr', site: 'moon', name: 'Laser Ranging Retroreflector (Apollo 15)', heritage: true, placement: 'approx', near: 'ALSEP', offset: [-18, 26], model: 'lrrr',
    purpose: 'Corner-cube mirror array still used by observatories on Earth to measure the Earth–Moon distance by laser.',
    condition: 'Operational: a passive instrument that needs no power.',
    reuse: 'Still in scientific use; must not be touched or dusted.', impact: 'Lunar dust on the optics slowly reduces the returned signal.',
    research: 90, scanTime: 3, note: 'Placed approximately next to the ALSEP for gameplay.',
  },
  // ===== MOON: fictional earlier robotic programme "Pathfinder-H" =====
  {
    id: 'ph_solar', site: 'moon', name: 'Pathfinder-H Solar Array (damaged)', heritage: false, placement: 'game', at: [-1180, -760], model: 'solar_broken',
    purpose: 'Powered an earlier robotic scout lander that surveyed this site before Hadley Base.', condition: 'One wing snapped; about 60% of the cells are still intact.',
    reuse: 'Recover the solar cells and the aluminium frame.', impact: 'Loose panels can shatter into sharp debris; recovering them cleans up the site.',
    collectible: true, yields: { solarCells: 3, aluminium: 2 }, research: 25, scanTime: 2,
  },
  {
    id: 'ph_dish', site: 'moon', name: 'Pathfinder-H Comms Dish', heritage: false, placement: 'game', at: [-620, -1180], model: 'dish',
    purpose: 'High-gain antenna that relayed data to Earth.', condition: 'Reflector bent; feed horn intact.',
    reuse: 'Electronics and aluminium can be reused in a new comms tower.', impact: 'Low; inert materials.',
    collectible: true, yields: { electronics: 2, aluminium: 3 }, research: 25, scanTime: 2,
  },
  {
    id: 'ph_pallet', site: 'moon', name: 'Abandoned Cargo Pallet', heritage: false, placement: 'game', at: [-1340, -1020], model: 'pallet',
    purpose: 'Delivered supply crates to the site.', condition: 'One crate has tipped over; there is still unused stock in the sealed crates.',
    reuse: 'Unused supplies and structural aluminium.', impact: 'Packaging polymers degrade under UV; recover them before they fragment.',
    collectible: true, yields: { aluminium: 2, polymers: 3 }, research: 15, scanTime: 1.5,
  },
  {
    id: 'ph_tank', site: 'moon', name: 'Empty Propellant Tank', heritage: false, placement: 'game', at: [-430, -330], model: 'tank',
    purpose: 'Jettisoned propellant tank from a cargo lander.', condition: 'Empty and vented. The titanium shell is sound.',
    reuse: 'Titanium for pressure vessels.', impact: 'Residual propellant can be hazardous; this one has been vented (safe).',
    collectible: true, yields: { titanium: 3 }, research: 15, scanTime: 1.5,
  },
  {
    id: 'ph_arm', site: 'moon', name: 'Broken Robotic Arm', heritage: false, placement: 'game', at: [-1450, -1300], model: 'arm',
    purpose: 'Sample-handling arm of the Pathfinder-H scout lander.', condition: 'Shoulder actuator seized by lunar dust.',
    reuse: 'Motors and electronics can be salvaged.', impact: 'Low.',
    collectible: true, yields: { electronics: 2, titanium: 1 }, research: 20, scanTime: 2,
  },
  {
    id: 'ph_instr', site: 'moon', name: 'Damaged Instrument Box', heritage: false, placement: 'game', at: [-880, -1420], model: 'instrument',
    purpose: 'Dust and radiation monitor.', condition: 'Its data recorder may still hold readings.',
    reuse: 'Recover the electronics and the data recorder (bonus research).', impact: 'Low.',
    collectible: true, yields: { electronics: 2 }, research: 45, scanTime: 2,
  },
  {
    id: 'ph_leg', site: 'moon', name: 'Lander Leg Assembly', heritage: false, placement: 'game', at: [-300, -900], model: 'leg',
    purpose: 'Landing leg that broke off a cargo lander during a hard touchdown.', condition: 'The strut is buckled.',
    reuse: 'Structural aluminium.', impact: 'Low.',
    collectible: true, yields: { aluminium: 3 }, research: 10, scanTime: 1.5,
  },
  {
    id: 'ph_mast', site: 'moon', name: 'Antenna Mast', heritage: false, placement: 'game', at: [-1600, -840], model: 'mast',
    purpose: 'Relay mast near the rille rim.', condition: 'Leaning but intact.',
    reuse: 'Aluminium and electronics.', impact: 'Low.',
    collectible: true, yields: { aluminium: 1, electronics: 1 }, research: 10, scanTime: 1.5,
  },
  // ===== MARS: real MSL entry hardware (approximate positions) =====
  {
    id: 'msl_descent', site: 'mars', name: 'MSL Descent Stage ("Sky Crane") impact site', heritage: true, placement: 'approx', near: 'Bradbury Landing', offset: [-460, -460], model: 'skycrane',
    purpose: 'Rocket-powered stage that lowered Curiosity on cables, then flew away and crashed (6 Aug 2012).', condition: 'Destroyed on impact; debris scattered around a dark scar.',
    reuse: 'None. Part of the Curiosity landing heritage site.', impact: 'Impact scars are visible in orbital images.',
    research: 70, scanTime: 2.5, note: 'Real object; position approximate for gameplay (reported roughly 650 m from the rover in HiRISE images).',
  },
  {
    id: 'msl_backshell', site: 'mars', name: 'MSL Backshell and Parachute', heritage: true, placement: 'approx', near: 'Bradbury Landing', offset: [-435, 435], model: 'backshell',
    purpose: 'Protected Curiosity during entry; the supersonic parachute slowed the capsule.', condition: 'Backshell on its side; parachute spread on the ground.',
    reuse: 'None. Heritage site.', impact: 'Wind slowly moves the parachute fabric.',
    research: 70, scanTime: 2.5, note: 'Real object; position approximate for gameplay.',
  },
  {
    id: 'msl_heatshield', site: 'mars', name: 'MSL Heat Shield', heritage: true, placement: 'approx', near: 'Bradbury Landing', offset: [-850, 850], model: 'heatshield',
    purpose: '4.5 m PICA heat shield, the largest ever flown to Mars at the time; jettisoned during descent.', condition: 'Impact-damaged.',
    reuse: 'None. Heritage site.', impact: 'Low.',
    research: 60, scanTime: 2.5, note: 'Real object; position approximate for gameplay.',
  },
  {
    id: 'msl_bradbury', site: 'mars', name: 'Bradbury Landing (Curiosity touchdown point)', heritage: true, placement: 'trek', waypoint: 'Bradbury Landing', model: 'marker',
    purpose: 'Where Curiosity touched down on 6 August 2012. The rover has since driven away towards Mount Sharp.', condition: 'Wheel tracks long erased by wind.',
    reuse: '-', impact: '-', research: 50, scanTime: 2,
  },
  // ===== MARS: fictional supply-drop debris =====
  {
    id: 'mx_scout', site: 'mars', name: 'Scout Drone Wreck', heritage: false, placement: 'game', at: [880, -720], model: 'ingenuity',
    purpose: 'Fictional scout helicopter that mapped this outpost site. Shown with NASA\'s Ingenuity 3D model (the real Ingenuity flew at Jezero crater, not here).', condition: 'One rotor blade broken.',
    reuse: 'Batteries, solar cell and flight computer.', impact: 'Low.',
    collectible: true, yields: { electronics: 4, solarCells: 1 }, research: 35, scanTime: 2,
  },
  {
    id: 'mx_pallet', site: 'mars', name: 'Supply Drop Pallet', heritage: false, placement: 'game', at: [1350, -480], model: 'pallet',
    purpose: 'Pre-positioned cargo for the outpost.', condition: 'Partly buried in drifting sand.',
    reuse: 'Structural aluminium and polymers.', impact: 'Packaging could blow away in dust storms.',
    collectible: true, yields: { aluminium: 4, polymers: 2 }, research: 15, scanTime: 1.5,
  },
  {
    id: 'mx_solar', site: 'mars', name: 'Dust-Covered Solar Array', heritage: false, placement: 'game', at: [1450, -60], model: 'solar_broken',
    purpose: 'Powered a pre-deployed beacon.', condition: 'Output down about 70% because of dust (a real problem for Mars solar power).',
    reuse: 'Solar cells and frame.', impact: 'Low.',
    collectible: true, yields: { solarCells: 3, aluminium: 1 }, research: 25, scanTime: 2,
  },
  {
    id: 'mx_tank', site: 'mars', name: 'Discarded Oxidiser Tank', heritage: false, placement: 'game', at: [500, -150], model: 'tank',
    purpose: 'Spent tank from a cargo lander.', condition: 'Vented and safe.', reuse: 'Titanium.', impact: 'Low.',
    collectible: true, yields: { titanium: 3 }, research: 15, scanTime: 1.5,
  },
  {
    id: 'mx_mast', site: 'mars', name: 'Weather Mast (failed)', heritage: false, placement: 'game', at: [980, 120], model: 'mast',
    purpose: 'Fictional weather station; the game shows real InSight data in its place.', condition: 'Wind sensor ripped off.',
    reuse: 'Electronics.', impact: 'Low.',
    collectible: true, yields: { electronics: 2, aluminium: 2 }, research: 20, scanTime: 1.5,
  },
  {
    id: 'mx_arm', site: 'mars', name: 'Excavator Arm', heritage: false, placement: 'game', at: [1600, -380], model: 'arm',
    purpose: 'Regolith excavator for a planned oxygen plant.', condition: 'Hydraulics frozen.',
    reuse: 'Titanium and motors.', impact: 'Low.',
    collectible: true, yields: { titanium: 3, electronics: 2 }, research: 20, scanTime: 2,
  },
];

// ---------------- Exhibits: NASA 3D models on display at the bases (real facts, fictional placement) ----------------
EQUIPMENT.push(
  {
    id: 'ex_z2', site: 'moon', exhibit: true, name: 'Z-2 Spacesuit (exhibit)', heritage: false, placement: 'game', at: [-1008, -944], model: 'glb:z2_suit:1.9',
    purpose: 'Prototype planetary surface suit developed at NASA Johnson Space Center (unveiled in 2014) to test hard-upper-torso suit designs for future Mars missions.',
    condition: 'Display replica in the Hadley Base suit-up area.', reuse: 'Training and reference.', impact: '-', research: 20, scanTime: 1.5,
  },
  {
    id: 'ex_perseverance', site: 'mars', exhibit: true, name: 'Mars 2020 Perseverance rover (exhibit)', heritage: false, placement: 'game', at: [1134, -282], model: 'glb:perseverance:2.2',
    purpose: 'NASA rover that landed in Jezero Crater on 18 February 2021. It collects rock cores for possible return to Earth and carried the MOXIE oxygen experiment and the Ingenuity helicopter.',
    condition: 'Full-scale display model. The real rover is ~3,700 km away in Jezero Crater.', reuse: 'Engineering reference.', impact: '-', research: 30, scanTime: 1.5,
  },
  {
    id: 'ex_viking', site: 'mars', exhibit: true, name: 'Viking Lander (exhibit)', heritage: false, placement: 'game', at: [1124, -270], model: 'glb:viking_lander:2.1',
    purpose: 'Viking 1 landed in Chryse Planitia on 20 July 1976, the first successful U.S. landing on Mars, and searched the soil for signs of life.',
    condition: 'Display replica honouring the first Mars landers.', reuse: '-', impact: '-', research: 30, scanTime: 1.5,
  },
);

// ---------------- Station modules (game) ----------------
export const MODULES = {
  habitat: { name: 'Habitat Module', cost: { aluminium: 4, polymers: 2 }, research: 0, benefit: 'Oxygen and suit recharge point. Unlocks crew quarters.', size: 7 },
  solar: { name: 'Solar Array', cost: { solarCells: 4, aluminium: 2 }, research: 0, benefit: '+Power for the outpost. Recharges the rover faster.', size: 6 },
  comms: { name: 'Comms Tower', cost: { electronics: 3, aluminium: 3 }, research: 50, benefit: 'Direct link to Earth: +25% research from scans.', size: 4 },
  lab: { name: 'Science Lab', cost: { electronics: 3, aluminium: 3, titanium: 2 }, research: 100, benefit: 'Analyse samples: +50% sample research.', size: 6 },
  isru: { name: 'Oxygen Plant (ISRU)', cost: { titanium: 4, electronics: 2 }, research: 150, benefit: 'Makes oxygen from regolith (Moon) or CO2 (Mars), like NASA\'s MOXIE experiment.', size: 5 },
  roverbay: { name: 'Rover Bay', cost: { aluminium: 5, titanium: 2 }, research: 80, benefit: 'Rover repair and faster charging.', size: 8 },
  greenhouse: { name: 'Greenhouse', cost: { polymers: 4, aluminium: 2, electronics: 1 }, research: 200, benefit: 'Food research. Completes the station.', size: 6 },
};

export const MATERIAL_NAMES = { aluminium: 'Aluminium', titanium: 'Titanium', electronics: 'Electronics', solarCells: 'Solar cells', polymers: 'Polymers', regolith: 'Regolith' };

// ---------------- NPCs ----------------
export const NPCS = {
  rao: { name: 'Commander Anika Rao', role: 'Mission Commander', accent: 'red' },
  mitchell: { name: 'CAPCOM Dev Mitchell', role: 'Mission Control (Houston)', radio: true },
  okafor: { name: 'Dr. Chidi Okafor', role: 'Planetary Scientist', accent: 'blue' },
  lindqvist: { name: 'Engineer Sara Lindqvist', role: 'Systems Engineer', accent: 'orange' },
  chen: { name: 'Astronaut Wei Chen', role: 'Flight Engineer', accent: 'gold' },
  director: { name: 'Flight Director Harper', role: 'Launch Control', radio: true },
};
