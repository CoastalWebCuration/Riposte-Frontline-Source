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
  maxLevel: 100,
  levelBonus: 250,
  tokens: null,
  gamer: null,
  revision: 0,
  busy: false,
  error: '',
  match: null,
  data: { season: 1, xp: 0, levelXp: 0, claimed: [], matches: 0, wins: 0, premium: false, bonds: 1200, owned: [], wraps: [], pets: [], wrap: '', pet: '', chests: 0, modified_at: '' },
};
const BP_TOKEN_KEY = 'warfront_coastal_id';
const BP_SAVE_KEY = 'warfront_battle_pass';
const BP_DEVICE_KEY = 'warfront_device_id';
const BP_REWARDS = [
  ['I', 'Enlistment Patch', 'Free emblem', false, 0], ['◆', '100 War Bonds', 'Premium currency', true, 100], ['III', 'Olive Drab', 'Weapon wrap', true, 0, 'wrap:foret'],
  ['IV', 'Airborne', 'Free player banner', false, 0], ['◆', '200 War Bonds', 'Premium currency', true, 200], ['VI', 'Pathfinder', 'Premium emblem', true, 0],
  ['VII', 'Supply Drop', 'Free reward crate', false, 0], ['◆', '200 War Bonds', 'Premium currency', true, 200], ['IX', 'Dog Tags', 'Premium calling card', true, 0],
  ['X', 'Paratrooper', 'Premium outfit', true, 0, 'skin:airborne'], ['◆', '200 War Bonds', 'Premium currency', true, 200], ['XII', 'Night Raid', 'Free weapon wrap', false, 0, 'wrap:cobalt'],
  ['XIII', 'Liberator', 'Premium banner', true, 0], ['◆', '200 War Bonds', 'Premium currency', true, 200], ['XV', 'Battle Star', 'Free emblem', false, 0],
  ['XVI', 'Steel Division', 'Premium calling card', true, 0], ['◆', '200 War Bonds', 'Premium currency', true, 200], ['XVIII', 'Victory Roll', 'Free Holo weapon wrap', false, 0, 'wrap:holo'],
  ['XIX', 'Veteran', 'Premium player title', true, 0], ['◆', '200 War Bonds', 'Premium currency + Field Officer outfit', true, 200, 'skin:officer'],
];
const BP_PREMIUM_COST = 950;
const BP_SHOP_OFFERS = { smg: 500, sniper: 650, shotgun: 600, nomad: 800, tempest: 900, verdant: 1000, raptor: 1100, void: 1200, gilet: 700, airborne: 900, corpsman: 750, tanker: 700, resistance: 850, winter: 1050, officer: 1250 };
const BP_WRAP_OFFERS = { desert: 250, foret: 300, urbain: 300, neige: 350, tigre: 450, cobalt: 500, braise: 550, or: 800, diamant: 1000, holo: 1200 };
const BP_PETS = {
  scout: ['Scout', '🐕', 'Trench dog', 500], pigeon: ['Dispatch', '🕊', 'Carrier pigeon', 400], fox: ['Red', '🦊', 'Recon fox', 650], cat: ['Sarge', '🐈', 'Barracks cat', 450], hawk: ['Ace', '🦅', 'Airborne hawk', 700], turtle: ['Tank', '🐢', 'Armored mascot', 550],
};
const BP_CHESTS = {
  field: { name: 'Field Supply Chest', icon: '▣', cost: 300, odds: '45% wrap · 35% pet · 20% outfit', weights: { wrap: 45, pet: 35, skin: 20 } },
  arsenal: { name: 'Arsenal Chest', icon: '⌁', cost: 450, odds: '70% wrap · 20% outfit · 10% pet', weights: { wrap: 70, skin: 20, pet: 10 } },
  officer: { name: 'Officer Chest', icon: '★', cost: 700, odds: '55% outfit · 25% pet · 20% wrap', weights: { skin: 55, pet: 25, wrap: 20 } },
};

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
/* Career level is permanent across seasons. Every level reached also grants a burst of seasonal Battle Pass XP. */
function bpLevelXpFor(level) { return level <= 1 ? 0 : Math.round(250 * Math.pow(level - 1, 1.6)); }
function bpLevelInfo(xp = BP.data.levelXp) {
  xp = Math.max(0, Math.floor(Number(xp || 0)));
  let level = 1;
  while (level < BP.maxLevel && xp >= bpLevelXpFor(level + 1)) level++;
  const floor = bpLevelXpFor(level), ceiling = level < BP.maxLevel ? bpLevelXpFor(level + 1) : floor;
  return { level, xp, into: xp - floor, need: ceiling > floor ? ceiling - floor : 0 };
}
function bpPlayerLevel() { return bpLevelInfo().level; }
function bpTokenSave(tokens) { BP.tokens = tokens || null; bpWrite(BP_TOKEN_KEY, BP.tokens); }
function bpBonds() { return Math.max(0, Math.floor(Number(BP.data.bonds || 0))); }
function bpOwnsSkin(s) { return Array.isArray(BP.data.owned) && BP.data.owned.includes(s); }
function bpOwnsWrap(id) { return Array.isArray(BP.data.wraps) && BP.data.wraps.includes(id); }
function bpOwnsPet(id) { return Array.isArray(BP.data.pets) && BP.data.pets.includes(id); }
function bpSelectedWrap() { return bpOwnsWrap(BP.data.wrap) && CAMOS[BP.data.wrap] ? BP.data.wrap : ''; }
function bpSelectedPet() { return bpOwnsPet(BP.data.pet) && BP_PETS[BP.data.pet] ? BP.data.pet : ''; }
function bpPersist() {
  bpWrite(BP_SAVE_KEY, BP.data);
  if (BP.gamer) bpCloudSave();
  if (typeof acctChip === 'function') acctChip();
  if (typeof shopRefresh === 'function' && typeof UI !== 'undefined' && UI.screen === 'skins') shopRefresh();
  if (typeof bpPetRefresh === 'function') bpPetRefresh();
}
function bpGrantRewards() {
  if (!Array.isArray(BP.data.claimed)) BP.data.claimed = [];
  let gained = 0;
  for (let i = 0; i < bpTier(); i++) {
    const reward = BP_REWARDS[i], eligible = !reward[3] || BP.data.premium, item = reward[5], key = 's' + BP.season + '-t' + (i + 1) + '-reward', oldBondKey = 's' + BP.season + '-t' + (i + 1) + '-bonds';
    if (!eligible || (!reward[4] && !item) || BP.data.claimed.includes(key)) continue;
    BP.data.claimed.push(key); if (!BP.data.claimed.includes(oldBondKey)) gained += reward[4] || 0;
    if (item) {
      const [kind, id] = item.split(':'), list = kind === 'skin' ? BP.data.owned : BP.data.wraps;
      if (list && !list.includes(id)) list.push(id);
    }
  }
  if (gained) BP.data.bonds = bpBonds() + gained;
  return gained;
}
function bpActivatePremium() {
  if (BP.data.premium) return { ok: true, message: 'Premium Battle Pass already active.' };
  if (bpBonds() < BP_PREMIUM_COST) return { ok: false, message: 'Not enough War Bonds.' };
  BP.data.bonds = bpBonds() - BP_PREMIUM_COST; BP.data.premium = true;
  const back = bpGrantRewards(); bpPersist();
  return { ok: true, message: 'Premium Battle Pass activated' + (back ? ' · ' + back + ' War Bonds claimed' : '') + '.' };
}
function bpBuySkin(s) {
  const price = BP_SHOP_OFFERS[s];
  if (!price || !SKINS[s]) return { ok: false, message: 'Offer unavailable.' };
  if (bpOwnsSkin(s) || skinUnlocked(s)) return { ok: true, message: SKINS[s].name + ' is already owned.' };
  if (bpBonds() < price) return { ok: false, message: 'Not enough War Bonds.' };
  BP.data.bonds = bpBonds() - price;
  if (!Array.isArray(BP.data.owned)) BP.data.owned = [];
  BP.data.owned.push(s); bpPersist();
  return { ok: true, message: SKINS[s].name + ' added to your Outfits.' };
}
function bpBuyCollectible(kind, id) {
  const table = kind === 'wrap' ? BP_WRAP_OFFERS : null, pet = kind === 'pet' ? BP_PETS[id] : null;
  const price = table ? table[id] : pet ? pet[3] : 0, owns = kind === 'wrap' ? bpOwnsWrap(id) : bpOwnsPet(id);
  if (!price) return { ok: false, message: 'Offer unavailable.' };
  if (owns) return { ok: true, message: 'Already owned.' };
  if (bpBonds() < price) return { ok: false, message: 'Not enough War Bonds.' };
  BP.data.bonds = bpBonds() - price;
  BP.data[kind === 'wrap' ? 'wraps' : 'pets'].push(id); bpPersist();
  return { ok: true, message: (kind === 'wrap' ? CAMOS[id].name + ' wrap' : BP_PETS[id][0]) + ' added to your collection.' };
}
function bpEquipCollectible(kind, id) {
  if (kind === 'wrap' && bpOwnsWrap(id)) { BP.data.wrap = id; bpPersist(); return { ok: true, message: CAMOS[id].name + ' equipped on every weapon for your next deployment.' }; }
  if (kind === 'pet' && bpOwnsPet(id)) { BP.data.pet = id; bpPersist(); return { ok: true, message: BP_PETS[id][0] + ' is now your companion.' }; }
  return { ok: false, message: 'Item not owned.' };
}
function bpChestCandidates(kind) {
  if (kind === 'skin') return Object.keys(BP_SHOP_OFFERS).filter((id) => SKINS[id] && !skinUnlocked(id));
  if (kind === 'wrap') return Object.keys(BP_WRAP_OFFERS).filter((id) => !bpOwnsWrap(id));
  return Object.keys(BP_PETS).filter((id) => !bpOwnsPet(id));
}
function bpRandom() {
  if (crypto && crypto.getRandomValues) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
  return Math.random();
}
function bpOpenChest(id) {
  const chest = BP_CHESTS[id]; if (!chest) return { ok: false, message: 'Chest unavailable.' };
  if (bpBonds() < chest.cost) return { ok: false, message: 'Not enough War Bonds.' };
  const pools = Object.keys(chest.weights).map((kind) => ({ kind, items: bpChestCandidates(kind), weight: chest.weights[kind] })).filter((p) => p.items.length);
  if (!pools.length) return { ok: false, message: 'You already own every chest item.' };
  BP.data.bonds = bpBonds() - chest.cost;
  const total = pools.reduce((n, p) => n + p.weight, 0); let roll = bpRandom() * total, pool = pools[pools.length - 1];
  for (const p of pools) { roll -= p.weight; if (roll <= 0) { pool = p; break; } }
  const item = pool.items[Math.floor(bpRandom() * pool.items.length)];
  if (pool.kind === 'skin') BP.data.owned.push(item);
  else BP.data[pool.kind === 'wrap' ? 'wraps' : 'pets'].push(item);
  BP.data.chests = Math.max(0, Number(BP.data.chests || 0)) + 1; bpPersist();
  const name = pool.kind === 'skin' ? SKINS[item].name : pool.kind === 'wrap' ? CAMOS[item].name + ' Wrap' : BP_PETS[item][0] + ' · ' + BP_PETS[item][2];
  return { ok: true, message: 'Chest opened: ' + name + '!', kind: pool.kind, item };
}

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
  ACCT.level = bpLevelInfo();
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
  bpGrantRewards();
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
  const saved = bpRead(BP_SAVE_KEY, null);
  BP.data = Object.assign({}, BP.data, saved || {});
  // Saves made before career levels inherit their earned pass XP, so existing players never restart at level one.
  if (!saved || !Object.prototype.hasOwnProperty.call(saved, 'levelXp')) BP.data.levelXp = Math.max(0, Number(BP.data.xp || 0));
  BP.data.levelXp = Math.max(0, Math.floor(Number(BP.data.levelXp || 0)));
  if (!Array.isArray(BP.data.claimed)) BP.data.claimed = [];
  if (!Array.isArray(BP.data.owned)) BP.data.owned = [];
  if (!Array.isArray(BP.data.wraps)) BP.data.wraps = [];
  if (!Array.isArray(BP.data.pets)) BP.data.pets = [];
  BP.data.bonds = bpBonds();
  const claimCount = BP.data.claimed.length, rewardBonds = bpGrantRewards();
  if (rewardBonds || BP.data.claimed.length !== claimCount) bpWrite(BP_SAVE_KEY, BP.data);
  BP.tokens = bpRead(BP_TOKEN_KEY, null);
  ACCT.state = BP.tokens ? 'init' : 'ready';
  if (BP.tokens) {
    const ok = await bpCloudLoad();
    if (!ok) { BP.error = 'Your Coastal ID session expired. Sign in again.'; bpTokenSave(null); bpApplyIdentity(null); ACCT.state = 'ready'; }
  } else bpApplyIdentity(null);
  acctChanged(); if (typeof bpPetRefresh === 'function') bpPetRefresh();
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
    const n = i + 1, reached = n <= tier, premium = !!r[3], owned = reached && (!premium || BP.data.premium);
    return '<article class="bp-tier ' + (owned ? 'on ' : '') + (n === tier ? 'now ' : '') + (premium ? 'premium ' : 'free ') + '"><span class="n">Tier ' + n + '</span>' + (owned ? '' : '<span class="lock">◆</span>') + '<span class="bp-lane">' + (premium ? 'Premium' : 'Free') + '</span><span class="ico">' + r[0] + '</span><b>' + esc(r[1]) + '</b><small>' + esc(r[2]) + '</small></article>';
  }).join('');
}
function bpLevelPanelHtml() {
  const level = bpLevelInfo(), pct = level.need ? level.into / level.need : 1;
  return '<section class="bp-level"><div class="bp-level-badge"><span>Player level</span><b>' + level.level + '</b></div><div><p class="bp-kicker">Permanent career progression</p><h3>Level ' + level.level + '</h3><p>Match XP raises your level. Every level-up injects <b>+' + BP.levelBonus + ' XP</b> into the current Battle Pass.</p><div class="bp-progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + level.need + '" aria-valuenow="' + level.into + '"><i style="transform:scaleX(' + pct + ')"></i></div><div class="bp-progress-copy"><span>' + level.into + ' / ' + (level.need || level.into) + ' career XP</span><span>' + (level.need ? 'Level ' + (level.level + 1) + ' next' : 'Maximum level') + '</span></div></div></section>';
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
  body.innerHTML = bpLevelPanelHtml() + '<section class="bp-hero"><div><p class="bp-kicker">Season 01 · European Theater</p><h3>Battle Pass</h3><p>Deploy, survive and fight through twenty campaign tiers. Progress is attached to ' + esc(BP.gamer.gamer_tag) + ' through Coastal ID.</p><div class="bp-progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + BP.xpPerTier + '" aria-valuenow="' + into + '"><i style="transform:scaleX(' + pct + ')"></i></div><div class="bp-progress-copy"><span>' + into + ' / ' + BP.xpPerTier + ' Battle Pass XP</span><span>' + (tier >= BP.maxTier ? 'Season complete' : 'Tier ' + (tier + 1) + ' next') + '</span></div></div><div class="bp-rank"><span>' + (BP.data.premium ? 'Premium tier' : 'Free tier') + '</span><b>' + tier + '</b><span>' + bpBonds() + ' War Bonds</span></div></section><section><p class="lbl">Campaign rewards</p><div class="bp-track">' + bpRewardsHtml() + '</div></section><section class="bp-id"><div><p class="bp-kicker">Coastal ID connected</p><h3>' + esc(BP.gamer.gamer_tag) + '</h3><p>' + Number(BP.gamer.friend_count || 0) + ' friends · Level and Battle Pass synced across devices</p></div><button class="btn" id="bpOut" type="button">Sign out</button></section>';
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
  const gained = base + combat + win, oldLevel = bpPlayerLevel();
  BP.data.levelXp = Math.max(0, Number(BP.data.levelXp || 0)) + gained;
  const level = bpLevelInfo(), levelsUp = Math.max(0, level.level - oldLevel), passGained = gained + levelsUp * BP.levelBonus;
  BP.data.xp = Math.max(0, Number(BP.data.xp || 0)) + passGained;
  BP.data.matches = Math.max(0, Number(BP.data.matches || 0)) + 1;
  if (result === 'win') BP.data.wins = Math.max(0, Number(BP.data.wins || 0)) + 1;
  bpGrantRewards(); bpWrite(BP_SAVE_KEY, BP.data); bpApplyIdentity(BP.gamer); acctChip();
  if (BP.gamer) bpCloudSave();
  const box = $('endXp');
  if (show && box && MATCH.state === 'ended') {
    box.innerHTML = endXpHtml({ xp: gained, level: level.level, into: level.into, need: level.need, up: levelsUp, notes: ['+' + passGained + ' Battle Pass XP' + (levelsUp ? ' · includes +' + (levelsUp * BP.levelBonus) + ' level bonus' : ''), 'Battle Pass tier ' + bpTier(), BP.gamer ? 'Synced with Coastal ID' : 'Saved on this device'] });
    box.classList.remove('hidden');
  }
}
function bpMatchAbandon() { if (BP.match) bpMatchEnd('quit', false); }
