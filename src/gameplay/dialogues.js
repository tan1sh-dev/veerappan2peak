// Branching dialogue. Each tree: { start: node, nodes: { id: { speaker, text, choices: [{ text, next, effects }] } } }
// effects: { event: 'talk:rao', flag: 'name', reveal: 'objId', info: 'text', research: n }
// ctx: { mission (id|null), done(objId) -> bool, flag(name) -> any, state, site }

const T = (speaker, text, choices) => ({ speaker, text, choices: choices || [{ text: '[End]', next: null }] });

export function getDialogue(npc, ctx) {
  const m = ctx.mission;
  const end = (t = 'Got it.', effects) => ({ text: t, next: null, effects });

  if (npc === 'rao') {
    if (m === 'm1' && !ctx.done('brief')) return {
      start: 'a', nodes: {
        a: T('rao', 'There you are. Weather\'s holding, the stack is fuelled and Houston is green across the board. Ready to make history?', [
          { text: 'Ready. Walk me through the flight.', next: 'b' },
          { text: 'Why Hadley? Apollo 15 already went there.', next: 'why' },
        ]),
        why: T('rao', 'Exactly why. We have 50 years of data on it: Apollo 15 samples, LRO elevation maps down to a metre and a half. Best-mapped ground on the Moon. And the rille is the most dramatic view you\'ll ever see.', [
          { text: 'Fair point. And the flight?', next: 'b' },
        ]),
        b: T('rao', 'Ascent first. Follow the guidance cue, keep the nose in the box and stage when the tanks run dry. Once we\'re in orbit, one big burn for the Moon. Then it\'s your landing.', [
          { text: 'Any tips for the landing?', next: 'c' },
          { text: 'Understood. Let\'s go.', next: null, effects: { event: 'talk:rao' } },
        ]),
        c: T('rao', 'Lunar gravity is a sixth of Earth\'s, so things fall slowly. Don\'t get lazy, though. Kill your sideways drift with the RCS, then hold the descent under three metres per second. And keep an eye on the fuel.', [
          end('Copy. See you at the elevator.', { event: 'talk:rao', flag: 'landingTips' }),
        ]),
      },
    };
    if (m === 'm5' && !ctx.done('brief')) return {
      start: 'a', nodes: {
        a: T('rao', 'Mars. Seven months of cruise, compressed for us, then seven minutes of terror. Entry, parachute, powered descent, all automatic for robots and manual for us.', [
          { text: 'What\'s the hard part?', next: 'b' },
          { text: 'Where are we landing?', next: 'c' },
        ]),
        b: T('rao', 'The parachute window. Deploy too fast and it shreds; too low and there\'s no time left for the engines. Watch the speed readout and pop it when the light turns green.', [
          { text: 'And where are we landing?', next: 'c' },
          end('Understood.', { event: 'talk:rao', flag: 'chuteTips' }),
        ]),
        c: T('rao', 'Gale Crater, near Bradbury Landing, where Curiosity touched down in 2012. The terrain you\'ll fly over is real HiRISE elevation data. Chen went ahead on the cargo lander and is waiting for us.', [
          end('Let\'s go to Mars.', { event: 'talk:rao' }),
        ]),
      },
    };
    if (m === 'm6' && ctx.done('comms') && ctx.done('lab') && ctx.done('isru')) return {
      start: 'a', nodes: {
        a: T('rao', 'Comms up, lab running, the oxygen plant is breathing CO2 and giving us air. You built this from scrap and stubbornness.', [
          { text: 'It was a team effort.', next: 'b' },
          { text: 'What\'s next?', next: 'b' },
        ]),
        b: T('rao', 'Next is everyone who comes after us. Log it, Veerappan: Aeolis Station is operational.', [end('Station operational. Logging it.', { event: 'talk:rao' })]),
      },
    };
    return { start: 'a', nodes: { a: T('rao', ctx.site === 'earth' ? 'Check your suit seals twice. Space doesn\'t give second chances.' : ctx.site === 'mars' ? 'Thirty-eight percent gravity. Your legs will thank you, your lungs won\'t, so watch that O2.' : 'One-sixth gravity, one hundred percent concentration. Keep moving.', [end('Will do.')]) } };
  }

  if (npc === 'mitchell') {
    if (m === 'm1' && ctx.done('land') && !ctx.done('capcom')) return {
      start: 'a', nodes: {
        a: T('mitchell', 'Veerappan, Houston. We copy your touchdown. You\'ve got a room full of people breathing again down here. How\'s the view?', [
          { text: 'Grey, beautiful, and very quiet.', next: 'b' },
          { text: 'I can see the Apennine mountains from here.', next: 'c' },
        ]),
        b: T('mitchell', 'That\'s the vacuum for you. No air means no sound, so radio is your only voice out there. Hadley Base is about four hundred metres to the north-west. Follow your compass.', [end('Copy, heading to base.', { event: 'talk:mitchell' })]),
        c: T('mitchell', 'Mons Hadley is about 4.5 km above the plain. That backdrop is real LRO laser-altimeter data, not an artist\'s guess. Base is about four hundred metres north-west.', [end('Copy, heading to base.', { event: 'talk:mitchell', flag: 'mountainFact' })]),
      },
    };
    return {
      start: 'a', nodes: {
        a: T('mitchell', 'Houston here. Go ahead.', [
          { text: 'Requesting a status check.', next: 'b' },
          { text: 'Any tips?', next: 'c' },
          end('Just checking in. Over.'),
        ]),
        b: T('mitchell', ctx.statusText || 'All systems nominal on our board. Keep an eye on your oxygen.', [end('Copy.')]),
        c: T('mitchell', ctx.site === 'mars'
          ? 'Mars dust gets everywhere and cuts solar power. Clean panels are happy panels. And that sky colour is real: fine dust scatters red light.'
          : 'Ground crew suggests the "bunny hop". Apollo crews found it easier than walking in one-sixth g. Sprint and jump, and let the low gravity carry you.', [end('Thanks, Houston.')]),
      },
    };
  }

  if (npc === 'okafor') {
    if (m === 'm1' && !ctx.done('okafor')) return {
      start: 'a', nodes: {
        a: T('okafor', 'Welcome to Hadley Base! Mind the airlock lip. Did you see the rille on your way down?', [
          { text: 'Hard to miss. How deep is it?', next: 'b' },
          { text: 'What do you need from me?', next: 'c' },
        ]),
        b: T('okafor', 'About 300 metres here, and you can check that yourself: the terrain you\'re standing on is built from LRO stereo elevation data. Most likely it\'s an ancient lava channel, or a collapsed lava tube.', [
          { text: 'A lava tube? Could we live in one?', next: 'tube' },
          { text: 'What do you need from me?', next: 'c' },
        ]),
        tube: T('okafor', 'That\'s the dream: natural radiation shielding. Find me good data and maybe one day. For now, we start with the surface.', [{ text: 'So, the task?', next: 'c' }]),
        c: T('okafor', 'Walk to the rim at Station 9A. Scott and Irwin sampled there in 1971. Scan the regolith with Q and let\'s compare our orbital chemistry with theirs. And if you spot an interesting rock, bag it.', [
          end('On my way to the rim.', { event: 'talk:okafor' }),
          { text: 'Which rocks are interesting?', next: 'rocks' },
        ]),
        rocks: T('okafor', 'Glowing outlines on your visor mean the scanner thinks there\'s something worth keeping. Basalts tell us about volcanism; a white anorthosite would make my year. Apollo 15\'s "Genesis Rock" was one.', [end('Got it. Heading to the rim.', { event: 'talk:okafor', flag: 'rockTips' })]),
      },
    };
    if (m === 'm2' && ctx.done('return') && !ctx.done('report')) return {
      start: 'a', nodes: {
        a: T('okafor', 'You found Falcon! How did it look after half a century?', [
          { text: 'Standing tall. The foil\'s faded.', next: 'b' },
          { text: 'Why can\'t we take any of it home?', next: 'c' },
        ]),
        b: T('okafor', 'UV and micrometeoroids do that. It\'s a time capsule, a 1971 materials experiment nobody planned. And the Pathfinder-H junk?', [{ text: 'Mostly salvageable.', next: 'd' }]),
        c: T('okafor', 'Because it\'s heritage. Those sites belong to everyone, and NASA has asked visitors to keep their distance. Scan, learn, leave it. The scout debris, on the other hand…', [{ text: '…is fair game?', next: 'd' }]),
        d: T('okafor', 'Exactly. Lindqvist has been eyeing those solar cells for weeks. Talk to her. I suspect you\'ll be busy.', [end('On it.', { event: 'talk:okafor' })]),
      },
    };
    if (m === 'm4' && ctx.done('home') && !ctx.done('lab')) return {
      start: 'a', nodes: {
        a: T('okafor', 'Samples! Let me see. Oh, look at this one. Vesicles everywhere. That\'s gas escaping from cooling lava, like Apollo sample 15016.', [
          { text: 'What does it tell us?', next: 'b' },
        ]),
        b: T('okafor', 'That this magma came up from deep inside the Moon, deeper than 250 kilometres according to the Apollo 15 studies. You just drove across a frozen volcanic sea. Lindqvist says the next stop is Mars.', [end('Mars it is.', { event: 'talk:okafor' })]),
      },
    };
    return { start: 'a', nodes: { a: T('okafor', ctx.site === 'mars' ? 'Mudstone means water, water means maybe life. Bring me rocks!' : 'Every rock here is a page from the Moon\'s diary. Keep scanning.', [end('Will do.')]) } };
  }

  if (npc === 'lindqvist') {
    if (m === 'm2' && !ctx.done('eng')) return {
      start: 'a', nodes: {
        a: T('lindqvist', 'You\'re the one going out to the Apollo site? Take the LRV-2. She\'s charged, and handles like a shopping trolley on ice.', [
          { text: 'How do I drive it?', next: 'b' },
          { text: 'How far is the Apollo 15 site?', next: 'c' },
        ]),
        b: T('lindqvist', 'W and S for throttle, A and D to steer, Space to brake, E to hop out. Low gravity means low grip, so take the turns slowly or you\'ll roll it.', [{ text: 'And the distance?', next: 'c' }, end('Got it.', { event: 'talk:lindqvist' })]),
        c: T('lindqvist', 'About 1.4 km east. The Apollo hardware is still exactly where the Trek maps put it. While you\'re out, scan any Pathfinder-H debris. That failed scout scattered junk everywhere.', [end('I\'ll take a look.', { event: 'talk:lindqvist' })]),
      },
    };
    if (m === 'm3' && !ctx.done('brief')) return {
      start: 'a', nodes: {
        a: T('lindqvist', 'Bad news first: space weather says a solar particle event is coming in about fifteen minutes. Good news: that\'s enough time to grab the scout debris if you hurry.', [
          { text: 'What should I grab?', next: 'b' },
          { text: 'How dangerous is the storm?', next: 'c' },
        ]),
        b: T('lindqvist', 'Anything Pathfinder-H. Solar panels, the comms dish, tanks, the arm. Scan first, then E to collect. Bring it to the recycler next to the habitat, then get inside the airlock.', [end('Clock\'s ticking. Going.', { event: 'talk:lindqvist' })]),
        c: T('lindqvist', 'Real crews would shelter, no question. There\'s no magnetic field out here. NASA watches the Sun around the clock for exactly this. Fifteen minutes, then you\'re inside.', [end('Understood. Going now.', { event: 'talk:lindqvist', flag: 'stormRespect' })]),
      },
    };
    if (m === 'm6' && !ctx.done('plan')) return {
      start: 'a', nodes: {
        a: T('lindqvist', 'Right. Station plan: Comms Tower, Science Lab, Oxygen Plant. Each needs materials, and the lab and oxygen plant need research credit too.', [
          { text: 'Where do materials come from?', next: 'b' },
          { text: 'How does the oxygen plant work?', next: 'c' },
        ]),
        b: T('lindqvist', 'Junk! There\'s supply-drop debris all over this plain. Scan it, collect it, feed it to the recycler. Samples go to research credit. Then press B at the build pad.', [end('Let\'s build.', { event: 'talk:lindqvist' })]),
        c: T('lindqvist', 'It splits carbon dioxide from the air into oxygen. NASA\'s MOXIE experiment on Perseverance proved it works on Mars, a little at a time. Ours is just much bigger.', [end('Let\'s build it.', { event: 'talk:lindqvist', flag: 'moxie' })]),
      },
    };
    return { start: 'a', nodes: { a: T('lindqvist', 'If it\'s broken, I can probably fix it. If it\'s scrap, I can definitely recycle it. B at the build pad opens the construction menu.', [end('Good to know.')]) } };
  }

  if (npc === 'chen') {
    if (m === 'm5' && !ctx.done('chen')) return {
      start: 'a', nodes: {
        a: T('chen', 'You made it! Nice landing. Well, mostly nice. Welcome to Aeolis Palus. Mount Sharp is that big shadow to the south.', [
          { text: 'It\'s so… orange.', next: 'b' },
          { text: 'What\'s the plan?', next: 'c' },
        ]),
        b: T('chen', 'Dust in the air scatters the light. Wait for sunset, it goes blue. That\'s real, Curiosity photographed it. Now, plan?', [{ text: 'Plan.', next: 'c' }]),
        c: T('chen', 'Your lander carried the habitat kit. Go to the build pad, press B, and put up the Habitat and Solar Array. Then scan the ground for a weather report. The data feed comes from NASA\'s InSight lander archive.', [end('Building now.', { event: 'talk:chen' })]),
      },
    };
    return { start: 'a', nodes: { a: T('chen', 'Air pressure out there is under one percent of Earth\'s. Don\'t crack that visor.', [end('Noted.')]) } };
  }

  if (npc === 'director') {
    return { start: 'a', nodes: { a: T('director', 'Launch Control. All stations are go for the countdown. Take the crew access arm elevator when you\'re ready.', [end('Copy, Launch Control.')]) } };
  }
  return { start: 'a', nodes: { a: T(npc, '…', [end('…')]) } };
}

// One-way radio chatter triggered by game events.
export const RADIO = {
  liftoff: ['director', 'Liftoff! We have liftoff. Tower cleared.'],
  maxq: ['mitchell', 'Passing max-Q, the point of highest aerodynamic stress. Looking good.'],
  staging: ['mitchell', 'Staging confirmed. Good burn on the next stage.'],
  orbit: ['mitchell', 'Veerappan, Houston. You are in orbit. Configure for departure burn when ready. Press Space to begin.'],
  departure: ['mitchell', 'Burn complete. You\'re on your way. Next stop: mid-course correction.'],
  mccNeeded: ['mitchell', 'We see a small trajectory drift. Point the nose at the cyan marker and burn to null the error.'],
  mcc: ['mitchell', 'Correction looks good. We\'ll wake you up on approach.'],
  approach: ['mitchell', 'Approaching the landing site. Descent is your call. Hold Space to fire the engine, wheel to throttle, WASD to translate.'],
  landed: ['mitchell', 'Contact light! Engine stop. Beautiful work, Veerappan.'],
  crashed: ['mitchell', 'We\'ve lost telemetry… Veerappan, do you copy? …'],
  lowO2: ['mitchell', 'Your O2 is under 25 percent. Head back to a base, rover or lander to refill.'],
  critO2: ['mitchell', 'O2 critical! Get to an air supply now!'],
  entry: ['mitchell', 'Entry interface. Heat shield is taking the load. Stand by for the parachute window.'],
  chuteWindow: ['mitchell', 'Parachute window is open. Deploy NOW (Space).'],
  chute: ['mitchell', 'Parachute out. Heat shield separation. Prepare for powered descent.'],
  heritage: ['mitchell', 'Reminder: Apollo sites are protected. Scan, observe, and don\'t remove anything.'],
};
