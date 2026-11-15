/* ==========================================================================
   WARFRONT BATTLE PASS + COASTAL ID
   Coastal ID owns authentication and the cross-game gamer identity. The pass
   itself is saved through Coastal ID's generic, revisioned game-data route.
   The existing ACCT shape remains as a compatibility seam for multiplayer,
   outfits and the rest of the original game.
   ========================================================================== */
const BP = {
  api: 'https://www.obxledger.com/api/v1/index.php',
  game: 'warfront-1944-battle-pass',
  season: 1,
  maxTier: 20,
  xpPerTier: 1000,
  tokens: null,
  gamer: null,
  revision: 0,
  busy: false,
  error: '',
  match: null,
  data: { season: 1, xp: 0, claimed: [], matches: 0, wins: 0, modified_at: '' },
};
const BP_TOKEN_KEY = 'warfront_coastal_id';
const BP_SAVE_KEY = 'warfront_battle_pass';
const BP_DEVICE_KEY = 'warfront_device_id';
const BP_REWARDS = [
  ['I', 'Enlistment Patch', 'Emblem'], ['II', 'Field Rations', '100 XP boost'], ['III', 'Olive Drab', 'Weapon wrap'],
  ['IV', 'Airborne', 'Player banner'], ['V', 'War Bonds', 'Currency pack'], ['VI', 'Pathfinder', 'Emblem'],
  ['VII', 'Supply Drop', 'Reward crate'], ['VIII', 'Frontline', 'Weapon wrap'], ['IX', 'Dog Tags', 'Calling card'],
  ['X', 'Paratrooper', 'Outfit'], ['XI', 'Recon Kit', 'Reward crate'], ['XII', 'Night Raid', 'Weapon wrap'],
  ['XIII', 'Liberator', 'Player banner'], ['XIV', 'Officer Issue', 'Sidearm wrap'], ['XV', 'Battle Star', 'Emblem'],
  ['XVI', 'Steel Division', 'Calling card'], ['XVII', 'Aviator', 'Outfit detail'], ['XVIII', 'Victory Roll', 'Weapon wrap'],
  ['XIX', 'Veteran', 'Player title'], ['XX', 'European Ace', 'Season outfit'],
];

function bpRead(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v || fallback; } catch (e) { return fallback; }
}
function bpWrite(key, value) {
  try { if (value) localStorage.setItem(key, JSON.stringify(value)); else localStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
}
function bpDevice() {
  let id = '';
  try { id = localStorage.getItem(BP_DEVICE_KEY) || ''; } catch (e) { /* ignored */ }
  if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2)); try { localStorage.setItem(BP_DEVICE_KEY, id); } catch (e) { /* ignored */ } }
  return id;
}
function bpTier() { return Math.min(BP.maxTier, 1 + Math.floor(Math.max(0, BP.data.xp) / BP.xpPerTier)); }
function bpInto() { return bpTier() >= BP.maxTier ? BP.xpPerTier : Math.max(0, BP.data.xp) % BP.xpPerTier; }
function bpTokenSave(tokens) { BP.tokens = tokens || null; bpWrite(BP_TOKEN_KEY, BP.tokens); }

async function coastalRaw(route, method, body, token) {
  const query = method === 'GET' && body ? '&' + new URLSearchParams(body).toString() : '';
  const headers = { Accept: 'application/json', 'X-Device-Id': bpDevice(), 'X-App-Version': 'warfront-1944-web-1' };
  if (method !== 'GET') headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = 'Bearer ' + token;
  try {
    const r = await fetch(BP.api + '?r=' + encodeURIComponent(route) + query, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
    let data = null; try { data = await r.json(); } catch (e) { /* non-JSON error */ }
    return { ok: r.ok, status: r.status, data };
  } catch (e) { return { ok: false, status: 0, data: null }; }
}
async function coastalRefresh() {
  if (!BP.tokens || !BP.tokens.refresh_token) return false;
  const r = await coastalRaw('auth/refresh', 'POST', { refresh_token: BP.tokens.refresh_token }, '');
  if (!r.ok || !r.data || !r.data.tokens) { bpTokenSave(null); return false; }
  bpTokenSave(r.data.tokens); return true;
}
async function coastal(route, method = 'GET', body, retry = true) {
  const token = BP.tokens && BP.tokens.access_token;
  let r = await coastalRaw(route, method, body, token);
  if (r.status === 401 && retry && await coastalRefresh()) r = await coastal(route, method, body, false);
  return r;
}
function bpApplyIdentity(gamer) {
  BP.gamer = gamer;
  if (!gamer) { acctForget(); return; }
  ACCT.state = 'ready';
  ACCT.user = { username: 'coastal-' + gamer.user_id, displayName: gamer.gamer_tag, avatar: 0, avatarUrl: gamer.avatar_url || '', hasRecovery: true, coastal: true };
  ACCT.level = { level: bpTier(), xp: BP.data.xp, into: bpInto(), need: BP.xpPerTier };
  ACCT.stats = ACCT.stats || { kills: 0, deaths: 0, wins: BP.data.wins, matches: BP.data.matches, assists: 0, hits: 0, shots: 0, headshots: 0, bestStreak: 0, seconds: 0 };
  acctHintSet({ u: ACCT.user.username, n: ACCT.user.displayName, l: bpTier(), a: 0, on: true });
}
async function bpCloudLoad() {
  const [me, save] = await Promise.all([
    coastal('gamer/me'),
    coastal('gamer/game-data', 'GET', { game_id: BP.game }),
  ]);
  if (!me.ok || !me.data) return false;
  if (save.ok && save.data) {
    BP.revision = Number(save.data.revision || 0);
    const cloud = save.data.data;
    if (cloud && Number(cloud.season) === BP.season && Number(cloud.xp || 0) >= Number(BP.data.xp || 0)) BP.data = Object.assign({}, BP.data, cloud);
  }
  bpWrite(BP_SAVE_KEY, BP.data);
  bpApplyIdentity(me.data);
  return true;
}
async function bpCloudSave() {
  if (!BP.tokens || !BP.gamer) return;
  BP.data.modified_at = new Date().toISOString();
  const payload = { game_id: BP.game, version: 1, sync_protocol: 2, expected_revision: BP.revision, save_id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '-warfront-save'), data: BP.data };
  let r = await coastal('gamer/game-data', 'POST', payload);
  if (r.ok && r.data) {
    if (r.data.conflict && r.data.data && Number(r.data.data.xp || 0) > BP.data.xp) BP.data = Object.assign({}, BP.data, r.data.data);
    BP.revision = Number(r.data.revision || BP.revision);
    bpWrite(BP_SAVE_KEY, BP.data);
    bpApplyIdentity(BP.gamer);
  }
}
async function bpInit() {
  BP.data = Object.assign({}, BP.data, bpRead(BP_SAVE_KEY, null) || {});
  BP.tokens = bpRead(BP_TOKEN_KEY, null);
  ACCT.state = BP.tokens ? 'init' : 'ready';
  if (BP.tokens) {
    const ok = await bpCloudLoad();
    if (!ok) { BP.error = 'Your Coastal ID session expired. Sign in again.'; bpTokenSave(null); bpApplyIdentity(null); ACCT.state = 'ready'; }
  } else bpApplyIdentity(null);
  acctChanged();
}
async function bpLogin(email, password) {
  BP.busy = true; BP.error = ''; bpRender();
  const r = await coastalRaw('auth/login', 'POST', { email, password, device_id: bpDevice(), device_name: 'WARFRONT 1944 Web', platform: 'web', app_version: '1.0' }, '');
  if (!r.ok || !r.data || !r.data.tokens) {
    BP.busy = false;
    BP.error = (r.data && (r.data.message || r.data.error)) || (r.status === 0 ? 'Coastal ID could not be reached.' : 'Sign-in failed.');
    bpRender(); sfxUi('error'); return;
  }
  bpTokenSave(r.data.tokens);
  const ok = await bpCloudLoad();
  BP.busy = false;
  if (!ok) { BP.error = 'Coastal ID connected, but the gamer identity could not be loaded.'; bpTokenSave(null); bpApplyIdentity(null); }
  acctChanged(); bpRender(); sfxUi(ok ? 'confirm' : 'error');
}
async function bpLogout() {
  if (BP.tokens) await coastal('auth/logout', 'POST', { device_id: bpDevice() });
  bpTokenSave(null); BP.gamer = null; BP.revision = 0; acctForget(); ACCT.state = 'ready'; acctChanged(); bpRender(); sfxUi('back');
}

function bpRewardsHtml() {
  const tier = bpTier();
  return BP_REWARDS.map((r, i) => {
    const n = i + 1, on = n <= tier;
    return '<article class="bp-tier ' + (on ? 'on ' : '') + (n === tier ? 'now' : '') + '"><span class="n">Tier ' + n + '</span>' + (on ? '' : '<span class="lock">◆</span>') + '<span class="ico">' + r[0] + '</span><b>' + esc(r[1]) + '</b><small>' + esc(r[2]) + '</small></article>';
  }).join('');
}
function bpRender() {
  const body = $('acBody'), sub = $('acSub'); if (!body) return;
  sub.textContent = 'Season 01 · European Theater';
  if (!BP.gamer) {
    body.innerHTML = '<div class="bp-auth"><section class="bp-coastal"><p class="bp-kicker">Shared OBX identity</p><h3>Coastal ID</h3><p>One identity for WARFRONT and the Coastal arcade. Your gamer tag and Battle Pass follow you across devices.</p><p class="hint">No separate WARFRONT profile is created.</p></section><section class="card ac-form"><h3 class="lbl">Connect Coastal ID</h3><form id="bpLogin"><label class="ac-in"><span>Email</span><input name="email" type="email" autocomplete="email" required></label><label class="ac-in"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label><p class="ac-err" id="bpErr" role="alert">' + esc(BP.error) + '</p><button class="btn primary" type="submit"' + (BP.busy ? ' disabled' : '') + '>' + (BP.busy ? 'Connecting...' : 'Sign in') + '</button></form><p class="hint">Need a Coastal ID? <a class="link" href="https://www.obxledger.com" target="_blank" rel="noopener">Create one on OBX Ledger</a>.</p></section></div>';
    const form = $('bpLogin');
    form.addEventListener('submit', (e) => { e.preventDefault(); const fd = new FormData(form); bpLogin(String(fd.get('email') || '').trim(), String(fd.get('password') || '')); });
    return;
  }
  const tier = bpTier(), into = bpInto(), pct = tier >= BP.maxTier ? 1 : into / BP.xpPerTier;
  body.innerHTML = '<section class="bp-hero"><div><p class="bp-kicker">Season 01 · European Theater</p><h3>Battle Pass</h3><p>Deploy, survive and fight through twenty campaign tiers. Progress is attached to ' + esc(BP.gamer.gamer_tag) + ' through Coastal ID.</p><div class="bp-progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + BP.xpPerTier + '" aria-valuenow="' + into + '"><i style="transform:scaleX(' + pct + ')"></i></div><div class="bp-progress-copy"><span>' + into + ' / ' + BP.xpPerTier + ' XP</span><span>' + (tier >= BP.maxTier ? 'Season complete' : 'Tier ' + (tier + 1) + ' next') + '</span></div></div><div class="bp-rank"><span>Current tier</span><b>' + tier + '</b><span>' + BP.data.xp + ' total XP</span></div></section><section><p class="lbl">Campaign rewards</p><div class="bp-track">' + bpRewardsHtml() + '</div></section><section class="bp-id"><div><p class="bp-kicker">Coastal ID connected</p><h3>' + esc(BP.gamer.gamer_tag) + '</h3><p>' + Number(BP.gamer.friend_count || 0) + ' friends · Progress synced across devices</p></div><button class="btn" id="bpOut" type="button">Sign out</button></section>';
  $('bpOut').addEventListener('click', bpLogout);
}
function bpRefreshScreen() { bpRender(); }

function bpMatchStart() {
  BP.match = { t0: MATCH.time, kills: 0 };
  ACCT.match = BP.match;
}
async function bpMatchEnd(result, show) {
  const m = BP.match; BP.match = null; ACCT.match = null;
  if (!m) return;
  const me = PL.ent || {}, base = 150, combat = Math.min(600, Math.max(0, Number(me.kills || 0)) * 35 + Math.floor(Math.max(0, Number(me.score || 0)) / 20)), win = result === 'win' ? 250 : 0;
  const gained = base + combat + win;
  BP.data.xp = Math.max(0, Number(BP.data.xp || 0)) + gained;
  BP.data.matches = Math.max(0, Number(BP.data.matches || 0)) + 1;
  if (result === 'win') BP.data.wins = Math.max(0, Number(BP.data.wins || 0)) + 1;
  bpWrite(BP_SAVE_KEY, BP.data); bpApplyIdentity(BP.gamer); acctChip();
  if (BP.gamer) bpCloudSave();
  const box = $('endXp');
  if (show && box && MATCH.state === 'ended') {
    box.innerHTML = endXpHtml({ xp: gained, level: bpTier(), into: bpInto(), need: BP.xpPerTier, up: 0, notes: ['Battle Pass · Season 01', BP.gamer ? 'Synced with Coastal ID' : 'Saved on this device'] });
    box.classList.remove('hidden');
  }
}
function bpMatchAbandon() { if (BP.match) bpMatchEnd('quit', false); }
