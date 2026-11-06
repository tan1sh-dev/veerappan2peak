// `npm run play`: starts the Vite dev server and opens the game in an Electron window.
// Edits to src/ reload the game automatically, so you can tweak and test without building an .exe.
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');            // path to electron.exe
const server = await createServer({ server: { port: 5173, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
console.log(`Dev server: ${url}  (edits in src/ reload the game window)`);
const app = spawn(electronPath, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
app.on('exit', async code => { await server.close(); process.exit(code ?? 0); });
