// Open the actual Electron game and verify the launch surface in the running renderer.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
require('../electron/main.cjs');

app.on('web-contents-created', (_event, contents) => {
  contents.once('did-finish-load', async () => {
    try {
      const result = await contents.executeJavaScript(`(async () => {
        const deadline = Date.now() + 20000;
        while (!window.__game?.camera) {
          if (Date.now() > deadline) throw new Error('Game initialization timed out');
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        const game = window.__game;
        await game.startMission('m1');
        const level = game.level;
        if (!level?.player || level.ground.height(16, 9) !== 11) throw new Error('Incorrect launch build loaded');
        level.player.place(30, 104);
        level.rig.yaw = 0.05; level.rig.pitch = -0.15; level.rig.first = true;
        return { deckHeight: level.ground.height(16, 9), rampHeight: level.ground.height(30, 85), boardHeight: level.boardPoint.y, solidWalls: typeof level.ground.canMove === 'function' };
      })()`);
      const win = BrowserWindow.fromWebContents(contents);
      win.setTitle('VEERAPPAN — Launch Site Update');
      win.show(); win.focus();
      await new Promise(resolve => setTimeout(resolve, 1800));
      fs.writeFileSync(path.join(__dirname, '../launch-update-verified.png'), (await contents.capturePage()).toPNG());
      fs.writeFileSync(path.join(__dirname, '../launch-update-verification.json'), JSON.stringify(result, null, 2));
    } catch (error) {
      fs.writeFileSync(path.join(__dirname, '../launch-update-verification.json'), JSON.stringify({ error: error.message }));
    }
  });
});
