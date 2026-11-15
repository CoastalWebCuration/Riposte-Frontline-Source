/* ==========================================================================
   ARMES AU SOL
   À sa mort, un soldat lâche l'arme qu'il tenait, avec ses munitions restantes.
   - arme du même type qu'une des nôtres (fusil d'assaut, pistolet-mitrailleur, fusil de
     précision, fusil à pompe, pistolet : WEAPONS[].cat) : on récupère ses munitions en
     marchant dessus, une cartouche pour une cartouche, dans la limite de la réserve
     maximale de notre arme ; vidée, elle disparaît, sinon elle reste au sol ;
   - arme différente de celles qu'on porte (même du même type) : E l'échange contre
     l'arme en main (celle-ci tombe à son tour, avec ses munitions) ; à la manette, X maintenu.
   Les armes vivent bien plus longtemps que les corps (5,5 s) : DROP.life.
   Les armes lâchées sont locales à chaque joueur (rien n'est envoyé en ligne).
   ========================================================================== */
const DROP = { life: 90, fade: 2, max: 14, swapR: 1.7, ammoR: 1.1, shadowR: 14, farR: 45, list: [], models: {}, cur: null, txt: '', msgT: 0, msg: '', prog: 0 };
const _dpV = new V3(), _dpQ = new THREE.Quaternion(), _dpQ2 = new THREE.Quaternion(), _dpF = new V3();

/* Modèle de l'arme posée : le modèle des soldats, couché sur le flanc (quart de tour autour du canon) et posé à la
   bonne hauteur (lift : distance de l'origine au point le plus bas dans cette pose) */
function dropTemplate(key) {
  if (DROP.models[key]) return DROP.models[key];
  const g = buildWorldGun(key).group;
  const rest = new THREE.Quaternion().setFromAxisAngle(new V3(0, 0, 1), Math.PI / 2);
  g.quaternion.copy(rest); g.updateMatrixWorld(true);
  const lift = -new THREE.Box3().setFromObject(g).min.y;
  g.quaternion.identity(); g.updateMatrixWorld(true);
  return (DROP.models[key] = { group: g, rest, lift });
}
function removeDrop(d) {
  scene.remove(d.obj);
  const i = DROP.list.indexOf(d); if (i >= 0) DROP.list.splice(i, 1);
  if (DROP.cur === d) DROP.cur = null;
}
function clearDrops() { for (const d of DROP.list.slice()) removeDrop(d); DROP.msgT = 0; supplyClear(); }

/* ---------- Supply chests ---------- */
const SUPPLY = { list: [], cur: null, range: 2.15, mats: null, geo: null, opened: 0 };
function supplyAssets() {
  if (SUPPLY.mats) return;
  SUPPLY.mats = {
    box: new THREE.MeshStandardMaterial({ color: 0x4f5b3d, roughness: 0.7, metalness: 0.2 }),
    band: new THREE.MeshStandardMaterial({ color: 0xb99a55, roughness: 0.42, metalness: 0.75 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x191d17, roughness: 0.82 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xf1c86b, emissive: 0xd69122, emissiveIntensity: 2.2, roughness: 0.35 }),
  };
  SUPPLY.geo = {
    base: new THREE.BoxGeometry(1.22, 0.52, 0.76), lid: new THREE.BoxGeometry(1.24, 0.28, 0.78),
    bandX: new THREE.BoxGeometry(0.13, 0.57, 0.8), bandZ: new THREE.BoxGeometry(1.27, 0.58, 0.1), latch: new THREE.BoxGeometry(0.22, 0.2, 0.08),
    beacon: new THREE.TorusGeometry(0.2, 0.028, 6, 18),
  };
}
function supplyModel() {
  supplyAssets(); const A = SUPPLY, g = new THREE.Group(); g.name = 'map-supply-chest';
  const mesh = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  mesh(A.geo.base, A.mats.box, 0, 0.29, 0); mesh(A.geo.bandX, A.mats.band, -0.38, 0.3, 0); mesh(A.geo.bandX, A.mats.band, 0.38, 0.3, 0); mesh(A.geo.bandZ, A.mats.dark, 0, 0.3, 0);
  const lid = new THREE.Group(); lid.position.set(0, 0.54, 0.36); g.add(lid);
  mesh(A.geo.lid, A.mats.box, 0, 0.12, -0.36, lid); mesh(A.geo.bandX, A.mats.band, -0.38, 0.12, -0.36, lid); mesh(A.geo.bandX, A.mats.band, 0.38, 0.12, -0.36, lid);
  mesh(A.geo.latch, A.mats.glow, 0, 0.38, -0.405);
  const beacon = mesh(A.geo.beacon, A.mats.glow, 0, 1.3, 0); beacon.rotation.x = Math.PI / 2; return { root: g, lid, beacon };
}
function supplyClear() { for (const c of SUPPLY.list) scene.remove(c.root); SUPPLY.list.length = 0; SUPPLY.cur = null; SUPPLY.opened = 0; }
function supplySeed() { let h = 2166136261; for (const c of String(CURMAP.id || 'map')) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function supplySpawn() {
  supplyClear(); if (!NAV.count) return;
  const rng = mulberry32(supplySeed() ^ ((MATCH.mode || '').length * 2654435761)), candidates = [];
  for (let i = 0; i < NAV.count; i += 2) {
    if (NAV.comp && NAV.comp[i] !== NAV.mainComp) continue;
    const x = NAV.nx[i], y = NAV.ny[i], z = NAV.nz[i];
    if (Math.abs(groundHeight(x, z, y + 2, 0.25, true) - y) > 0.15) continue;
    if (WATER.on && waterAt(x, z) && y <= WATER.y + 0.15) continue;
    if (SPAWNS.some((team) => team.some((p) => hyp(p[0] - x, p[1] - z) < 8))) continue;
    candidates.push({ x, y, z, r: rng() });
  }
  candidates.sort((a, b) => a.r - b.r);
  const area = Math.max(1, (MAP.x1 - MAP.x0) * (MAP.z1 - MAP.z0)), target = clamp(Math.round(area / 1500), 6, 10), chosen = [];
  // Put one discoverable chest near the player's first insertion point; the rest stay broadly distributed.
  const near = candidates.filter((p) => { const d = hyp(p.x - PL.ent.pos.x, p.z - PL.ent.pos.z); return d >= 9 && d <= 16; }).sort((a, b) => hyp(a.x - PL.ent.pos.x, a.z - PL.ent.pos.z) - hyp(b.x - PL.ent.pos.x, b.z - PL.ent.pos.z))[0];
  if (near) chosen.push(near);
  for (const p of candidates) {
    if (p === near) continue;
    if (chosen.some((q) => hyp(q.x - p.x, q.z - p.z) < 11)) continue;
    chosen.push(p); if (chosen.length >= target) break;
  }
  for (const p of chosen) {
    const M = supplyModel(); M.root.position.set(p.x, p.y + 0.02, p.z); M.root.rotation.y = rng() * TAU; scene.add(M.root);
    SUPPLY.list.push({ root: M.root, lid: M.lid, beacon: M.beacon, opened: false, openT: 0, pulse: rng() * TAU });
  }
}
function supplyUpdate(dt) {
  const P = PL.ent; let best = null, bd = 1e9;
  for (const c of SUPPLY.list) {
    if (c.opened && c.openT < 1) { c.openT = Math.min(1, c.openT + dt * 3.2); c.lid.rotation.x = -1.65 * smoothstep(0, 1, c.openT); }
    if (!c.opened) { c.pulse += dt * 2.4; const s = 1 + Math.sin(c.pulse) * 0.012; c.root.scale.setScalar(s); c.beacon.position.y = 1.3 + Math.sin(c.pulse) * 0.1; c.beacon.rotation.z += dt * 1.8; }
    c.beacon.visible = !c.opened;
    if (!c.opened && P.alive && MATCH.state === 'playing') { const d = hyp(c.root.position.x - P.pos.x, c.root.position.z - P.pos.z); if (d < SUPPLY.range && Math.abs(c.root.position.y - P.pos.y) < 1.4 && d < bd) { best = c; bd = d; } }
  }
  SUPPLY.cur = best;
}
function supplyUse() {
  const c = SUPPLY.cur, P = PL.ent; if (!c || c.opened || !P.alive || MATCH.state !== 'playing') return false;
  c.opened = true; c.openT = 0; SUPPLY.cur = null; SUPPLY.opened++;
  const A = P.arms, hp = Math.max(0, Math.min(35, 100 - P.health)); P.health += hp;
  let ammo = 0; for (const w of A.slots) { const n = Math.min(w.def.reserve - w.reserve, Math.max(1, Math.round(w.def.reserve * 0.35))); w.reserve += n; ammo += n; }
  const nade = PL.nades < NADE_COUNT; if (nade) PL.nades++;
  let weapon = '';
  if (Math.random() < 0.42) {
    const ids = Object.keys(WEAPONS).filter((id) => WEAPONS[id].cat !== 'pistol'), id = ids[Math.floor(Math.random() * ids.length)], def = weaponDef(id, [], typeof bpSelectedWrap === 'function' ? bpSelectedWrap() : null);
    const a = c.root.rotation.y, pos = c.root.position.clone().add(new V3(Math.sin(a) * 1.1, 0.8, Math.cos(a) * 1.1));
    dropWeapon(def, def.mag, Math.round(def.reserve * 0.45), pos, new THREE.Quaternion().setFromAxisAngle(UP, a), new V3(Math.sin(a), 1.5, Math.cos(a)));
    weapon = def.name;
  }
  P.score += 25; xpPopup('+25', _t('Caisse de ravitaillement'), 'small'); sfxMech('pickup'); padRumble(0.45, 0.7, 120, true);
  const parts = []; if (hp) parts.push('+' + hp + ' health'); if (ammo) parts.push('+' + ammo + ' ammo'); if (nade) parts.push('+1 grenade'); if (weapon) parts.push(weapon + ' dropped');
  hudMsg('SUPPLY CHEST · ' + parts.join(' · '), 'ally', 3); return true;
}

/* Pose une arme au sol : pos et q (position et orientation de départ), vel (lancer). Renvoie l'objet ou null. */
function dropWeapon(def, mag, reserve, pos, q, vel) {
  if (mag + reserve <= 0) return null;
  const T = dropTemplate(def.key);
  const obj = T.group.clone(); obj.position.copy(pos); obj.quaternion.copy(q);
  scene.add(obj);
  const d = { def, mag, reserve, obj, tpl: T, vel: vel.clone(), spin: new V3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), landed: false, landT: 0, q0: new THREE.Quaternion(), qR: new THREE.Quaternion(), age: 0 };
  DROP.list.push(d);
  while (DROP.list.length > DROP.max) removeDrop(DROP.list[0]);
  return d;
}

/* Arme lâchée par un soldat qui vient de mourir : elle quitte le corps (dont elle est retirée) et retombe */
function dropKilledWeapon(v, dir) {
  const A = v.arms, w = A && A.slots[A.cur]; if (!w) return;
  let mag = w.mag, reserve = w.reserve;
  // les bots ont une réserve quasi infinie : ils n'en laissent qu'une partie
  if (!v.isPlayer) reserve = Math.min(reserve, Math.round(w.def.reserve * rand(0.3, 1)));
  if (mag + reserve <= 0) mag = Math.ceil(w.def.mag / 3);
  const vel = _dpF.set(v.vel ? v.vel.x : 0, 0, v.vel ? v.vel.z : 0).multiplyScalar(0.6);
  if (dir) { vel.x += dir.x * 1.2; vel.z += dir.z * 1.2; }
  vel.y = rand(1.2, 2.2);
  const S = v.model;
  if (!v.isPlayer && S && S.gun) {
    S.gun.updateWorldMatrix(true, false);
    S.gun.getWorldPosition(_dpV); S.gun.getWorldQuaternion(_dpQ);
    S.gun.visible = false; // le corps n'a plus son arme (elle est rendue visible au retour à la vie, voir animSoldier)
  } else {
    _dpV.set(v.pos.x, v.pos.y + 1.1, v.pos.z); _dpQ.setFromAxisAngle(UP, v.yaw || 0);
  }
  dropWeapon(w.def, mag, reserve, _dpV, _dpQ, vel);
}

/* Yaw de l'orientation q (le canon pointe vers -Z) */
function quatYaw(q) { _dpF.set(0, 0, -1).applyQuaternion(q); return Math.atan2(-_dpF.x, -_dpF.z); }

function stepDrop(d, dt) {
  d.age += dt;
  const o = d.obj, T = d.tpl;
  if (!d.landed) {
    d.vel.y -= 9.8 * dt;
    o.position.addScaledVector(d.vel, dt);
    _dpQ.set(d.spin.x * dt * 0.5, d.spin.y * dt * 0.5, d.spin.z * dt * 0.5, 1).normalize();
    o.quaternion.premultiply(_dpQ);
    // les murs arrêtent l'arme (collision d'un petit cylindre), l'air la freine un peu
    _dpV.set(o.position.x, o.position.y - T.lift, o.position.z); collideCircle(_dpV, 0.12, 0.3);
    o.position.x = _dpV.x; o.position.z = _dpV.z;
    d.vel.x *= 1 - 0.8 * dt; d.vel.z *= 1 - 0.8 * dt;
    const g = groundHeight(o.position.x, o.position.z, o.position.y - T.lift, 0.15);
    if (d.vel.y <= 0 && o.position.y - T.lift <= g) {
      // pose : à plat sur le flanc, dans la direction du canon à l'impact
      o.position.y = g + T.lift; d.landed = true; d.landT = 0; d.q0.copy(o.quaternion);
      d.qR.setFromAxisAngle(UP, quatYaw(o.quaternion)).multiply(T.rest);
    } else if (o.position.y < -8) { d.dead = true; }
  } else if (d.landT < 1) {
    d.landT = Math.min(1, d.landT + dt / 0.3);
    o.quaternion.slerpQuaternions(d.q0, d.qR, smoothstep(0, 1, d.landT));
  }
  // fin de vie : l'arme rétrécit et s'enfonce dans le sol
  const left = DROP.life - d.age;
  if (left < DROP.fade) { const k = Math.max(0, left / DROP.fade); o.scale.setScalar(k); if (left <= 0) d.dead = true; }
}

function updateDrops(dt) {
  supplyUpdate(dt);
  const L = DROP.list;
  for (let i = L.length - 1; i >= 0; i--) { stepDrop(L[i], dt); if (L[i].dead) removeDrop(L[i]); }
  // niveau de détail : même seuil de taille apparente que les soldats (updateSoldierLods). Au loin, une arme couchée ne fait plus que quelques
  // pixels : plus d'ombre au-delà de DROP.shadowR, plus rien au-delà de DROP.farR (14 armes au plus, visibles de toute la carte, ajoutaient
  // jusqu'à 80 appels de rendu par image, ombres comprises, au fil de la partie)
  const lk = 1.8 * VIEW.h / (2 * Math.tan(camera.fov * Math.PI / 360)), th = RQ.q.lodPx, zoom = Settings.fov / camera.fov;
  for (const d of L) {
    const dist = camera.position.distanceTo(d.obj.position) / zoom, hi = lk / (dist * zoom + 0.01) > th, sh = dist < DROP.shadowR, vis = dist < DROP.farR;
    if (d.hi !== hi) { d.hi = hi; setGunLod(d.obj, hi); }
    if (d.vis !== vis) { d.vis = vis; d.obj.visible = vis; }
    if (d.sh !== sh) { d.sh = sh; for (const m of d.obj.children) if (m.userData.gunLod === 'lo') m.castShadow = sh; }
  }
  DROP.msgT -= dt;
  const P = PL.ent, A = P.arms;
  let best = null, bd = 1e9;
  if (P.alive && MATCH.state === 'playing') {
    for (let i = L.length - 1; i >= 0; i--) {
      const d = L[i]; if (!d.landed) continue;
      const dx = d.obj.position.x - P.pos.x, dz = d.obj.position.z - P.pos.z, dy = d.obj.position.y - P.pos.y;
      if (dy < -0.6 || dy > 1.4) continue;
      const dist = hyp(dx, dz);
      // arme du même type qu'une des nôtres (la même d'abord) : ses munitions se ramassent en marchant dessus
      const same = A.slots.find((s) => s.def.id === d.def.id), mine = same || A.slots.find((s) => s.def.cat === d.def.cat);
      if (mine && dist <= DROP.ammoR) {
        const take = Math.min(mine.def.reserve - mine.reserve, d.mag + d.reserve);
        if (take > 0) {
          mine.reserve += take;
          const fromRes = Math.min(take, d.reserve); d.reserve -= fromRes; d.mag -= take - fromRes;
          DROP.msg = _t('+{0} munitions ({1})', take, mine.def.name); DROP.msgT = 1.4; sfxMech('pickup');
          if (d.mag + d.reserve <= 0) { removeDrop(d); continue; }
        }
      }
      // une autre arme, même du même type, peut s'échanger contre celle qu'on tient
      if (!same && dist < DROP.swapR && dist < bd) { best = d; bd = dist; }
    }
  }
  DROP.cur = best && dropSwapAllowed() ? best : null;
  // invite sous le réticule : la touche ou le bouton du mode d'entrée (actGlyph, 09x-invites.js) ; au doigt, le bouton Ramasser est à l'écran
  // à la manette, le ramassage est X maintenu (padReloadUse) : l'invite le dit, et un filet se remplit pendant l'appui
  const use = SUPPLY.cur || DROP.cur, g = use ? actGlyph('use') : '', a = DROP.cur && esc(A.slots[A.cur].def.name), b = DROP.cur && esc(DROP.cur.def.name), hold = inputMode() === 'pad';
  const mp = mechaPrompt(); // à portée de son mecha, ou à bord : monter, descendre (08g-mecha-pilote.js)
  const txt = mp ? mp : SUPPLY.cur ? `${g ? (hold ? `Hold ${g} to open supply chest` : `${g} Open supply chest`) : 'Open supply chest'}<i>Ammo · health · combat loot</i>` : DROP.cur ? `${g ? (hold ? _t('Maintenir {0} pour échanger {1} contre {2}', g, a, b) : _t('{0} Échanger {1} contre {2}', g, a, b)) : _t('Échanger {0} contre {1}', a, b)}<i>${DROP.cur.mag} / ${DROP.cur.reserve}</i>` : DROP.msgT > 0 ? esc(DROP.msg) : '';
  const el = $('pickup');
  if (txt !== DROP.txt) { DROP.txt = txt; el.innerHTML = txt; el.style.opacity = txt ? 1 : 0; }
  const prog = (SUPPLY.cur || DROP.cur || mp) && hold && PAD.useT > 0 && PAD.useT < PAD_HOLD ? PAD.useT / PAD_HOLD : 0;
  if (prog !== DROP.prog) { DROP.prog = prog; el.style.setProperty('--hold', prog.toFixed(3)); el.classList.toggle('hold', prog > 0); }
}
function dropSwapAllowed() { const P = PL.ent; return P.alive && P.arms.switching <= 0 && PL.knifeT <= 0 && !PL.nadeState && !KS.mode && !MECHA_P.me; }

/* E (bouton Ramasser au doigt, X maintenu à la manette : padReloadUse) : échange l'arme en main contre l'arme au sol visée */
function swapWithDrop() {
  const d = DROP.cur, P = PL.ent, A = P.arms;
  if (!d || !dropSwapAllowed() || MATCH.state !== 'playing') return;
  const old = A.slots[A.cur], yaw = P.yaw, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  PL.knifeOut = false; // le couteau se range : la nouvelle arme monte comme après un changement d'arme
  removeDrop(d);
  // l'arme rangée tombe devant nous, avec ce qu'il lui reste de munitions
  _dpV.set(P.pos.x + fx * 0.5, P.pos.y + 0.9, P.pos.z + fz * 0.5); _dpQ.setFromAxisAngle(UP, yaw);
  dropWeapon(old.def, old.mag, old.reserve, _dpV, _dpQ, _dpF.set(fx * 1.6, 1.3, fz * 1.6));
  A.slots[A.cur] = { def: d.def, mag: d.mag, reserve: d.reserve };
  // même animation qu'un changement d'arme : l'arme baisse, puis la nouvelle monte (vmEquip à mi-course, voir ctlWeapon)
  A.reload = null; A.boltT = 0; A.switching = 0.52; A.switchTo = A.cur; P.busy = false;
  VM.action = null; VM.lowerTarget = 1;
  kcEvent('vma', { sid: P.kcI, name: 'switch', dur: 0.52, data: { to: d.def.key, from: old.def.key } });
  sfxMech('pickup');
}
