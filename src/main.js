import { Game } from './core/Game.js';

const game = new Game(document.getElementById('game'), document.getElementById('ui'));
game.init().catch(e => {
  console.error(e);
  document.getElementById('ui').innerHTML = `<div class="screen"><div class="panel" style="padding:24px;max-width:560px"><div class="hdr">Startup error</div><p>${String(e.message || e)}</p><p class="muted">Your graphics driver may not support WebGL. Try updating it.</p></div></div>`;
});
