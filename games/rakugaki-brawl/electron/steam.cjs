// Steamworks bridge for the Electron main process. Loads steamworks.js if it
// is installed and Steam is running; otherwise every call is a harmless no-op
// so the same build runs outside Steam (itch, direct download, dev).
const fs = require('node:fs');
const path = require('node:path');

let client = null;
let lib = null;
let appId = 0;
let error = '';

function readAppId() {
  if (process.env.RAKUGAKI_STEAM_APPID) return Number(process.env.RAKUGAKI_STEAM_APPID);
  // Dev convenience: a steam_appid.txt next to the executable or beside this file.
  for (const dir of [path.dirname(process.execPath), __dirname, process.cwd()]) {
    try { return Number(fs.readFileSync(path.join(dir, 'steam_appid.txt'), 'utf8').trim()); } catch { /* next */ }
  }
  return 0;
}

/** Must be called before app.whenReady() so the overlay switches apply. */
function load() {
  try {
    lib = require('steamworks.js');
  } catch (e) {
    error = `steamworks.js not loadable: ${e.message}`;
    return false;
  }
  appId = readAppId();
  try {
    client = lib.init(appId || undefined);
    try { lib.electronEnableSteamOverlay(); } catch { /* overlay is optional */ }
    return true;
  } catch (e) {
    client = null;
    error = `Steam init failed (is Steam running?): ${e.message}`;
    return false;
  }
}

function status() {
  if (!client) return { available: false, error };
  let name = '';
  try { name = client.localplayer.getName(); } catch { /* ignore */ }
  return { available: true, appId, name };
}

/** Unlock an achievement by its Steamworks API name. Returns true when Steam accepted it. */
function achieve(id) {
  if (!client || typeof id !== 'string' || !/^[a-z0-9_]{1,32}$/i.test(id)) return false;
  try { return !!client.achievement.activate(id.toUpperCase()); } catch { return false; }
}

module.exports = { load, status, achieve };
