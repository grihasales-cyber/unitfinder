/**
 * Unit Finder team backend (Google Apps Script, bound to the "Unit Finder Admin" Google Sheet).
 *
 * - Checks every request's Google sign-in token and the email against the Users sheet.
 * - Reads the project files from the Drive of the account that deploys this script,
 *   but only files inside the project folders listed in ROOTS, and only read-only Drive calls.
 * - Stores the team's preset pricelist revisions and a usage log in this Sheet.
 *
 * Deploy: Deploy > New deployment > Web app, Execute as: Me, Who has access: Anyone.
 */

const CLIENT_ID = '312567417829-q5522gmvlqn15li1chttraipths7mjom.apps.googleusercontent.com';
/* Always admins; they cannot be removed from the Admin tab. The deploying account is added automatically. */
const SUPER_ADMINS = ['vrn1994vishnu@gmail.com'];
/* Project root folders. Only files inside these folders can be read through this script. */
const ROOTS = [
  '18frM9pjqJZJ9Y7G3IaaVMnlfHS_IWhdZ', // Neopolis
  '1GeY7LEQpEuky-nuVoEh29AoL1m0E550h', // One World
  '16sjHJZDKHQRAfaw8GdV9NN8JtnIzztKe', // Magnus
  '1raOogyF78HsCoCHh1T2ocl0X7Hev5isd', // Altair
  '1qxmAz-sk6V6cKo-MfRh-6cv8o2amUbcj', // Ayana
  '1qypdeWMsb787yGWzGzFZSXJ4yAOcb4tb', // Townpark
  '1p5-N8lIVTmfvtMf9NckFTzp5sXo5tj3e', // Infinia
  '198MbmQaOZ-f7zCU1dvD0AecXRjIAk7yJ', // Insignia
  '12yxieRtGRVjKF91CyDW-K43rohEVSoey', // Galera
  '1YeNML6njaJkha1-W3ijjeS4MtDFsziHN', // Valley View
  '1HHD0Kzth8aSEGwhZRthLPaAuxyGsTAFf', // Sacred Grove
  '15YGrB-hScN5BXgSEMkrEpQfSQHh53kCW', // Boulevard
  '1_k27MGWp9EcBJAcLJJnaC44gRqJJOb8E', // Birdsong
  '15OMiNogda8hLCI6WdGjJJJaf_rPueD_i'  // Crystal Meadows
];

const SHEETS = {
  Users: ['Email', 'Role', 'Active', 'Added', 'Added by', 'Last seen'],
  Presets: ['Project', 'File ID', 'File name', 'Set by', 'Set at'],
  Log: ['Time', 'Email', 'Event', 'Project', 'Unit', 'Revision', 'Detail']
};

/* ---------- entry points ---------- */
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return out({ ok: false, err: 'Bad request' }); }
  try { return out(handle(req)); }
  catch (x) { return out({ ok: false, err: String(x && x.message || x) }); }
}
function doGet() { return out({ ok: true, app: 'Unit Finder backend' }); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* Run once from the editor (select setup, press Run) to create the sheets and grant access. */
function setup() {
  Object.keys(SHEETS).forEach(sheet);
  UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + ROOTS[0] + '?fields=id', { headers: auth() });
}

function handle(req) {
  const who = verify(req.tok);
  const user = findUser(who.email);
  if (!user) return { ok: false, err: 'noaccess', email: who.email };
  const admin = user.role === 'admin';
  switch (req.act) {
    case 'me':
      touch(who.email);
      return { ok: true, email: who.email, name: who.name, role: user.role, presets: readPresets() };
    case 'drive':
      return driveCall(String(req.path || ''));
    case 'log':
      writeLog(who.email, req.ev);
      return { ok: true };
  }
  if (!admin) return { ok: false, err: 'Admins only' };
  switch (req.act) {
    case 'users': return { ok: true, users: listUsers() };
    case 'userSet': return setUser(who.email, req.email, req.role, req.active);
    case 'userDel': return delUser(req.email);
    case 'presetAdd': return presetAdd(who.email, req.project, req.id, req.name);
    case 'presetDel': return presetDel(req.project, req.id);
    case 'stats': return { ok: true, stats: stats(Number(req.days) || 30) };
  }
  return { ok: false, err: 'Unknown action' };
}

/* ---------- sign-in check ---------- */
function verify(tok) {
  if (!tok || typeof tok !== 'string' || tok.length > 4096) throw new Error('signin');
  const cache = CacheService.getScriptCache();
  const key = 'tok:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, tok));
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  /* "Sign in with Google" gives an ID token (three dot-separated parts); older sign-in gave an access token. */
  const idt = /^[\w-]+\.[\w-]+\.[\w-]+$/.test(tok);
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?' + (idt ? 'id_token=' : 'access_token=') + encodeURIComponent(tok), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('signin');
  const t = JSON.parse(r.getContentText());
  if (t.aud !== CLIENT_ID && t.azp !== CLIENT_ID) throw new Error('signin');
  if (idt && !/^(https:\/\/)?accounts\.google\.com$/.test(String(t.iss))) throw new Error('signin');
  if (!t.email || String(t.email_verified) !== 'true') throw new Error('signin');
  const who = { email: String(t.email).toLowerCase(), name: '' };
  const left = idt ? Number(t.exp) - Date.now() / 1000 : Number(t.expires_in);
  if (!(left > 0)) throw new Error('signin');
  const ttl = Math.min(3000, Math.max(30, Math.floor(left) - 30));
  cache.put(key, JSON.stringify(who), ttl);
  return who;
}

/* ---------- Drive, read only, inside ROOTS ---------- */
function auth() { return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }; }
const ID = '[A-Za-z0-9_-]{10,}';
function driveCall(path) {
  const list = path.match(/^files\?(.*)$/);
  const one = path.match(new RegExp('^files/(' + ID + ')(\\?.*|/export\\?.*)$'));
  let folder = null, fileId = null;
  if (list) {
    const q = param(list[1], 'q');
    const m = q && q.match(new RegExp("^'(" + ID + ")' in parents and trashed=false( and mimeType\\s*(=|!=)\\s*'[\\w./+-]+')*$"));
    if (!m) throw new Error('Not allowed');
    folder = m[1];
    if (!inRoots(folder)) throw new Error('Not allowed');
  } else if (one) {
    fileId = one[1];
    if (one[2].indexOf('/export?') === 0 && !/^\/export\?mimeType=application%2Fvnd\.openxmlformats-officedocument\.spreadsheetml\.sheet$/.test(one[2])) throw new Error('Not allowed');
    if (!inRoots(fileId)) throw new Error('Not allowed');
  } else throw new Error('Not allowed');

  const bin = !!fileId && (/[?&]alt=media/.test(path) || path.indexOf('/export?') >= 0);
  const cache = CacheService.getScriptCache();
  const ckey = bin ? null : 'd:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, path));
  if (ckey) { const hit = cache.get(ckey); if (hit) return { ok: true, json: JSON.parse(hit) }; }

  const r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/' + path, { headers: auth(), muteHttpExceptions: true });
  const code = r.getResponseCode();
  if (code !== 200) return { ok: false, err: 'Drive error ' + code, status: code };
  if (bin) return { ok: true, b64: Utilities.base64Encode(r.getContent()) };
  const text = r.getContentText();
  const json = JSON.parse(text);
  if (text.length < 90000) cache.put(ckey, text, 300);
  /* everything listed inside an allowed folder is allowed too */
  if (folder && json.files) {
    const marks = {};
    json.files.forEach(f => { if (f.id) marks['anc:' + f.id] = '1'; });
    if (Object.keys(marks).length) cache.putAll(marks, 21600);
  }
  return { ok: true, json };
}
function param(qs, name) {
  const parts = qs.split('&');
  for (let i = 0; i < parts.length; i++) {
    const kv = parts[i].split('=');
    if (kv[0] === name) return decodeURIComponent((kv.slice(1).join('=') || '').replace(/\+/g, ' '));
  }
  return null;
}
function inRoots(id) {
  const cache = CacheService.getScriptCache();
  let cur = id;
  const seen = [];
  for (let depth = 0; depth < 12 && cur; depth++) {
    if (ROOTS.indexOf(cur) >= 0) { mark(seen, '1'); return true; }
    const hit = cache.get('anc:' + cur);
    if (hit === '1') { mark(seen, '1'); return true; }
    if (hit === '0') { mark(seen, '0'); return false; }
    seen.push(cur);
    const r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + cur + '?fields=parents&supportsAllDrives=true', { headers: auth(), muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) break;
    const p = JSON.parse(r.getContentText()).parents;
    cur = p && p.length ? p[0] : null;
  }
  mark(seen, '0');
  return false;
}
function mark(ids, v) {
  if (!ids.length) return;
  const o = {};
  ids.forEach(i => { o['anc:' + i] = v; });
  CacheService.getScriptCache().putAll(o, v === '1' ? 21600 : 600);
}

/* ---------- sheets ---------- */
function sheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function rows(name) {
  const sh = sheet(name);
  const n = sh.getLastRow();
  return n < 2 ? [] : sh.getRange(2, 1, n - 1, SHEETS[name].length).getValues();
}
function supers() {
  const s = SUPER_ADMINS.map(x => x.toLowerCase());
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (me && s.indexOf(me) < 0) s.push(me);
  return s;
}
function findUser(email) {
  if (supers().indexOf(email) >= 0) return { email, role: 'admin', active: true, super: true };
  const cache = CacheService.getScriptCache();
  const hit = cache.get('u:' + email);
  if (hit) return hit === '-' ? null : JSON.parse(hit);
  const r = rows('Users').find(x => String(x[0]).toLowerCase() === email && x[2] !== false && String(x[2]).toUpperCase() !== 'FALSE');
  const u = r ? { email, role: String(r[1]) === 'admin' ? 'admin' : 'user', active: true } : null;
  cache.put('u:' + email, u ? JSON.stringify(u) : '-', 300);
  return u;
}
function listUsers() {
  const s = supers();
  const list = rows('Users').map(r => ({ email: String(r[0]).toLowerCase(), role: String(r[1]) === 'admin' ? 'admin' : 'user', active: !(r[2] === false || String(r[2]).toUpperCase() === 'FALSE'), added: iso(r[3]), lastSeen: iso(r[5]) }))
    .filter(u => u.email && s.indexOf(u.email) < 0);
  return s.map(e => ({ email: e, role: 'admin', active: true, super: true, lastSeen: iso(lastSeen(e)) })).concat(list);
}
function lastSeen(email) {
  const v = PropertiesService.getScriptProperties().getProperty('seen:' + email);
  return v ? new Date(Number(v)) : '';
}
function iso(d) { return d instanceof Date ? d.toISOString() : (d ? String(d) : ''); }
function touch(email) {
  const now = Date.now();
  if (supers().indexOf(email) >= 0) { PropertiesService.getScriptProperties().setProperty('seen:' + email, String(now)); return; }
  const sh = sheet('Users');
  const all = rows('Users');
  const i = all.findIndex(r => String(r[0]).toLowerCase() === email);
  if (i >= 0) sh.getRange(i + 2, 6).setValue(new Date(now));
}
function setUser(by, email, role, active) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, err: 'Enter a valid email' };
  if (supers().indexOf(email) >= 0) return { ok: false, err: 'This email is always an admin' };
  role = role === 'admin' ? 'admin' : 'user';
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = sheet('Users');
    const all = rows('Users');
    const i = all.findIndex(r => String(r[0]).toLowerCase() === email);
    if (i >= 0) sh.getRange(i + 2, 2, 1, 2).setValues([[role, active !== false]]);
    else sh.appendRow([email, role, active !== false, new Date(), by, '']);
  } finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove('u:' + email);
  return { ok: true, users: listUsers() };
}
function delUser(email) {
  email = String(email || '').trim().toLowerCase();
  if (supers().indexOf(email) >= 0) return { ok: false, err: 'This email is always an admin' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const all = rows('Users');
    for (let i = all.length - 1; i >= 0; i--) if (String(all[i][0]).toLowerCase() === email) sheet('Users').deleteRow(i + 2);
  } finally { lock.releaseLock(); }
  CacheService.getScriptCache().remove('u:' + email);
  return { ok: true, users: listUsers() };
}
function readPresets() {
  const o = {};
  rows('Presets').forEach(r => {
    const p = String(r[0]); if (!p || !r[1]) return;
    (o[p] = o[p] || []).push({ id: String(r[1]), name: String(r[2]), by: String(r[3]), at: iso(r[4]) });
  });
  return o;
}
function presetAdd(by, project, id, name) {
  if (!/^[a-z0-9]+$/.test(String(project)) || !new RegExp('^' + ID + '$').test(String(id))) return { ok: false, err: 'Bad revision' };
  if (!inRoots(id)) return { ok: false, err: 'That file is not in a project folder' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    if (!rows('Presets').some(r => String(r[0]) === project && String(r[1]) === id)) sheet('Presets').appendRow([project, id, String(name || '').slice(0, 200), by, new Date()]);
  } finally { lock.releaseLock(); }
  return { ok: true, presets: readPresets() };
}
function presetDel(project, id) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const all = rows('Presets');
    for (let i = all.length - 1; i >= 0; i--) if (String(all[i][0]) === String(project) && String(all[i][1]) === String(id)) sheet('Presets').deleteRow(i + 2);
  } finally { lock.releaseLock(); }
  return { ok: true, presets: readPresets() };
}

/* ---------- usage log ---------- */
const EVENTS = ['signin', 'search', 'download', 'share', 'copy'];
function writeLog(email, ev) {
  if (!Array.isArray(ev) || !ev.length) return;
  const now = Date.now();
  const vals = ev.slice(0, 50).filter(x => x && EVENTS.indexOf(x.type) >= 0).map(x => {
    let t = Number(x.t); if (!(t > now - 7 * 864e5 && t <= now + 6e4)) t = now;
    const s = v => String(v == null ? '' : v).replace(/^[=+\-@]/, "'$&").slice(0, 120);
    return [new Date(t), email, x.type, s(x.project), s(x.unit), s(x.rev), s(x.detail)];
  });
  if (vals.length) { const sh = sheet('Log'); sh.getRange(sh.getLastRow() + 1, 1, vals.length, 7).setValues(vals); }
}
function stats(days) {
  const since = Date.now() - days * 864e5;
  const tz = Session.getScriptTimeZone();
  const log = rows('Log').filter(r => r[0] instanceof Date && r[0].getTime() >= since);
  const count = (arr, keyFn) => {
    const m = {};
    arr.forEach(r => { const k = keyFn(r); if (k) m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(k => ({ k, n: m[k] })).sort((a, b) => b.n - a.n);
  };
  const s = log.filter(r => r[2] === 'search');
  const dl = log.filter(r => r[2] === 'download' || r[2] === 'share');
  const users = count(log, r => r[1]);
  const byUser = users.map(u => ({
    email: u.k,
    searches: s.filter(r => r[1] === u.k).length,
    downloads: dl.filter(r => r[1] === u.k).length,
    last: iso(log.filter(r => r[1] === u.k).reduce((a, r) => (r[0] > a ? r[0] : a), new Date(0)))
  })).sort((a, b) => b.searches - a.searches || b.downloads - a.downloads);
  return {
    days,
    searches: s.length,
    downloads: dl.length,
    activeUsers: users.length,
    projects: count(s, r => r[3]).slice(0, 15),
    units: count(s, r => r[3] + ' - ' + r[4]).slice(0, 15),
    revisions: count(s, r => r[3] + ' | ' + r[5]).slice(0, 10),
    users: byUser.slice(0, 50),
    perDay: count(s, r => Utilities.formatDate(r[0], tz, 'yyyy-MM-dd')).sort((a, b) => a.k < b.k ? -1 : 1),
    recent: log.slice(-30).reverse().map(r => ({ t: iso(r[0]), email: r[1], type: r[2], project: r[3], unit: r[4], detail: r[6] }))
  };
}
