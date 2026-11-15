/* Solo insertion only. The original weapons, camera, rules and respawns resume on landing. */
const PLANE_DROP = { phase: 'idle', time: 0, airTime: 0, altitude: 0, plane: null, chute: null, body: null, panel: null, sites: [], safe: null, route: null, prompt: '' };
function planeDropActive() { return !MATCH.online && ['plane', 'fall', 'parachute'].includes(PLANE_DROP.phase); }

/* These meshes are independent of map assets, and are reused between matches. */
function planeDropModels() {
  const D = PLANE_DROP;
  if (D.plane) return;
  const paint = new THREE.MeshStandardMaterial({ color: 0x6f7b65, roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x242c32, roughness: 0.6 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xd4ba78, roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x244455, metalness: 0.5, roughness: 0.18 });
  D.plane = new THREE.Group(); D.plane.name = 'solo-insertion-aircraft';
  const part = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); D.plane.add(m); return m;
  };
  part(new THREE.CylinderGeometry(1.0, 1.3, 9, 12), paint, 0, 0, 0, Math.PI / 2);
  part(new THREE.SphereGeometry(1.05, 12, 8), paint, 0, 0, -4.45).scale.set(1, 0.95, 1.25);
  part(new THREE.BoxGeometry(1.4, 0.65, 1.7), glass, 0, 0.7, -3.1, 0.14);
  part(new THREE.BoxGeometry(14, 0.22, 2.8), paint, 0, 0.55, -0.45);
  part(new THREE.BoxGeometry(5.6, 0.18, 1.5), paint, 0, 0.55, 4.2);
  part(new THREE.BoxGeometry(0.2, 2.6, 1.8), paint, 0, 1.5, 3.9, 0.25);
  part(new THREE.BoxGeometry(0.8, 0.06, 8.5), trim, 0, 1.17, 0);
  D.props = [];
  for (const side of [-1, 1]) {
    part(new THREE.CylinderGeometry(0.55, 0.6, 2.3, 10), dark, side * 3.7, 0.28, -0.85, Math.PI / 2);
    const prop = new THREE.Group(); prop.position.set(side * 3.7, 0.28, -2.1); D.plane.add(prop); D.props.push(prop);
    for (let i = 0; i < 2; i++) { const blade = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.5, 0.08), dark); blade.rotation.z = i * Math.PI / 2; prop.add(blade); }
  }
  D.chute = new THREE.Group(); D.chute.name = 'solo-insertion-parachute';
  const fabric = new THREE.MeshStandardMaterial({ color: 0xb5b98a, side: THREE.DoubleSide, roughness: 1 });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 8, 0, TAU, 0, Math.PI * 0.48), fabric);
  canopy.scale.set(2.8, 1.15, 2.0); canopy.position.y = 3.45; D.chute.add(canopy);
  const cords = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU; cords.push(Math.cos(a) * 0.25, 1.5, Math.sin(a) * 0.15, Math.cos(a) * 2.77, 3.5, Math.sin(a) * 1.98);
  }
  const cordGeo = new THREE.BufferGeometry(); cordGeo.setAttribute('position', new THREE.Float32BufferAttribute(cords, 3));
  D.chute.add(new THREE.LineSegments(cordGeo, new THREE.LineBasicMaterial({ color: 0xe4e1c9 })));
  D.plane.visible = D.chute.visible = false; scene.add(D.plane, D.chute);
}

function planeDropPanel() {
  const D = PLANE_DROP;
  if (D.panel) return;
  const style = document.createElement('style');
  style.textContent = '#planeDropPanel{position:fixed;left:50%;bottom:13%;transform:translateX(-50%);z-index:18;text-align:center;color:#fff;font:600 13px system-ui,sans-serif;letter-spacing:.07em;pointer-events:none;text-shadow:0 2px 4px #000;min-width:260px}#planeDropPanel[hidden]{display:none}#planeDropPanel strong{display:block;font-size:22px;letter-spacing:.11em;margin:5px 0 12px}#planeDropPanel button{pointer-events:auto;border:1px solid #d8c896;background:#192126e8;color:#fff;padding:12px 22px;font:700 14px system-ui,sans-serif;cursor:pointer;border-radius:3px}#planeDropPanel small{display:block;letter-spacing:0;font-weight:400;margin-top:12px;color:#edece5}#planeDropPanel button:disabled{opacity:.7;cursor:default}';
  document.head.appendChild(style);
  const panel = document.createElement('div'); panel.id = 'planeDropPanel'; panel.hidden = true;
  panel.innerHTML = '<span data-drop="alt"></span><strong data-drop="title"></strong><button type="button" data-drop="action"></button><small data-drop="help"></small>';
  panel.querySelector('button').addEventListener('click', () => { planeDropAction(); if (MATCH.state === 'playing' && !pointerActive()) requestLock(); });
  document.body.appendChild(panel); D.panel = panel;
}

function planeDropNearest(x, z) {
  const D = PLANE_DROP; let best = D.safe, dist = Infinity;
  for (const p of D.sites) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < dist) { dist = d; best = p; } }
  return best;
}

function planeDropStart() {
  planeDropReset();
  if (MATCH.online || !PL.ent.alive) return false;
  const D = PLANE_DROP, e = PL.ent;
  D.safe = e.pos.clone(); D.sites = [];
  /* Only exposed nodes in the normal navigable component qualify. This excludes water,
     floating-island gaps and isolated roofs that the original bots cannot reach. */
  for (let i = 0; i < NAV.count; i++) {
    if (NAV.comp && NAV.comp[i] !== NAV.mainComp) continue;
    const x = NAV.nx[i], y = NAV.ny[i], z = NAV.nz[i];
    if (Math.abs(groundHeight(x, z, 1000, 0.3, true) - y) > 0.12) continue;
    if (WATER.on && waterAt(x, z) && y <= WATER.y + 0.1) continue;
    D.sites.push(new V3(x, y, z));
  }
  planeDropModels(); planeDropPanel();
  if (!D.body) { D.body = makeSoldier(skinOf(e), 0, curW().def.key); setSoldierLod(D.body, true); }
  soldierLook(D.body, skinOf(e), 0); D.body.root.visible = false;
  D.bodyEnt = Object.create(e); D.bodyEnt.model = D.body;
  let top = Math.max(0, e.pos.y);
  for (const p of D.sites) top = Math.max(top, p.y);
  const midX = (MAP.x0 + MAP.x1) / 2, half = Math.min(35, (MAP.x1 - MAP.x0) * 0.35);
  D.route = { from: midX - half, to: midX + half, z: clamp(e.pos.z, MAP.z0 + 4, MAP.z1 - 4), y: top + 58, duration: 8 };
  D.phase = 'plane'; D.time = D.airTime = 0; D.lastJump = false; e.input.jump = false; KEYS.Space = false;
  e.pos.set(D.route.from, D.route.y, D.route.z); e.vel.set(0, 0, 0); e.vy = 0; e.onGround = false;
  PL.yaw = e.yaw = -Math.PI / 2; PL.pitch = -0.28; e.pitch = PL.pitch;
  PL.held = PL.queued = PL.adsWant = false; VM.root.visible = false;
  D.plane.rotation.y = -Math.PI / 2; D.plane.position.copy(e.pos); D.plane.visible = true;
  D.panel.hidden = false; planeDropCamera(); planeDropHud();
  return true;
}

function planeDropAction() {
  if (!planeDropActive() || MATCH.state !== 'playing') return;
  const D = PLANE_DROP, e = PL.ent;
  D.lastJump = true; // a keyboard press is handled here before the next simulation frame
  if (D.phase === 'plane') {
    D.phase = 'fall'; D.airTime = 0; e.pos.y -= 2; e.vy = -4; e.vel.set(4, 0, 0);
    D.body.root.visible = true; PL.pitch = Math.min(PL.pitch, -0.3);
  } else if (D.phase === 'fall') { D.phase = 'parachute'; e.vy = Math.max(-6, e.vy); D.chute.visible = true; }
  PL.held = PL.queued = false; planeDropHud();
}

function planeDropUpdate(dt) {
  if (!planeDropActive()) return false;
  const D = PLANE_DROP, e = PL.ent;
  if (MATCH.state !== 'playing') return true;
  if (!e.alive) { planeDropReset(); return false; }
  dt = clamp(dt, 0, 0.05); D.time += dt;
  VM.root.visible = false; if (e.model) e.model.root.visible = false;
  e.yaw = PL.yaw; e.pitch = PL.pitch; PL.held = PL.queued = PL.adsWant = false;
  const jump = !!KEYS.Space || !!e.input.jump;
  if (jump && !D.lastJump) planeDropAction();
  D.lastJump = jump;
  D.plane.position.x = D.route.from + (D.route.to - D.route.from) * D.time / D.route.duration;
  for (const p of D.props) p.rotation.z += dt * 45;
  if (D.phase === 'plane') {
    e.pos.copy(D.plane.position);
    if (D.time >= D.route.duration) planeDropAction();
  } else {
    D.airTime += dt;
    const fw = (TOUCH.on ? TOUCH.mz : (KEYS.KeyW || KEYS.ArrowUp ? 1 : 0) - (KEYS.KeyS || KEYS.ArrowDown ? 1 : 0)) + PAD.mz;
    const st = (TOUCH.on ? TOUCH.mx : (KEYS.KeyD || KEYS.ArrowRight ? 1 : 0) - (KEYS.KeyA || KEYS.ArrowLeft ? 1 : 0)) + PAD.mx;
    const len = Math.max(1, hyp(fw, st)), speed = D.phase === 'parachute' ? 8 : 11;
    e.vel.x = damp(e.vel.x, (-Math.sin(PL.yaw) * fw + Math.cos(PL.yaw) * st) / len * speed, 4, dt);
    e.vel.z = damp(e.vel.z, (-Math.cos(PL.yaw) * fw - Math.sin(PL.yaw) * st) / len * speed, 4, dt);
    e.pos.x = clamp(e.pos.x + e.vel.x * dt, MAP.x0 + 1, MAP.x1 - 1);
    e.pos.z = clamp(e.pos.z + e.vel.z * dt, MAP.z0 + 1, MAP.z1 - 1);
    const site = planeDropNearest(e.pos.x, e.pos.z);
    let ground = groundHeight(e.pos.x, e.pos.z, e.pos.y, 0.3, true);
    const landingY = Math.max(ground, site.y);
    if (D.phase === 'fall' && (e.pos.y - landingY < 22 || D.airTime >= 3.5)) planeDropAction();
    e.vy = D.phase === 'parachute' ? damp(e.vy, -5, 5, dt) : Math.max(-24, e.vy - 18 * dt);
    /* Near the ground, guide an unsafe descent to the nearest normal walkable surface. */
    if (e.pos.y - landingY < 12 && (hyp(site.x - e.pos.x, site.z - e.pos.z) > 1.1 || Math.abs(ground - site.y) > 0.5)) {
      e.pos.x = damp(e.pos.x, site.x, 3, dt); e.pos.z = damp(e.pos.z, site.z, 3, dt);
      ground = groundHeight(e.pos.x, e.pos.z, e.pos.y, 0.3, true);
    }
    e.pos.y += e.vy * dt;
    if (e.pos.y <= Math.max(ground, site.y) + 0.12) { planeDropLand(site); return true; }
    if (D.airTime > 25) { planeDropLand(site); return true; }
    planeDropPose(dt);
  }
  D.altitude = Math.max(0, e.pos.y - planeDropNearest(e.pos.x, e.pos.z).y);
  planeDropCamera(); planeDropHud();
  return true;
}

function planeDropPose(dt) {
  const D = PLANE_DROP, e = PL.ent, S = D.body;
  poseSoldier(D.bodyEnt, dt); S.gun.visible = false;
  const sy = Math.sin(e.yaw), cy = Math.cos(e.yaw), glide = D.phase === 'parachute';
  for (const side of [-1, 1]) {
    const elbow = side < 0 ? J_ELL : J_ELR, hand = side < 0 ? J_HAL : J_HAR;
    S.J[elbow].set(e.pos.x + cy * side * 0.45, e.pos.y + (glide ? 1.7 : 1.3), e.pos.z - sy * side * 0.45);
    S.J[hand].set(e.pos.x + cy * side * (glide ? 0.37 : 0.7), e.pos.y + (glide ? 1.98 : 1.4), e.pos.z - sy * side * (glide ? 0.37 : 0.7));
  }
  layoutSoldier(S, true); S.root.visible = true;
  D.chute.position.copy(e.pos); D.chute.rotation.y = e.yaw; D.chute.visible = glide;
}

function planeDropCamera() {
  const D = PLANE_DROP, e = PL.ent, riding = D.phase === 'plane';
  const pitch = clamp(PL.pitch, -1.2, 0.4), cp = Math.cos(pitch), distance = riding ? 17 : 7;
  const anchor = e.pos.clone().add(new V3(0, riding ? 0.5 : 1.25, 0));
  const back = new V3(Math.sin(PL.yaw) * cp, -Math.sin(pitch), Math.cos(PL.yaw) * cp);
  const hit = rayWorld(anchor.x, anchor.y, anchor.z, back.x, back.y, back.z, distance);
  camera.position.copy(anchor).addScaledVector(back, hit ? Math.max(0.35, hit.t - 0.3) : distance);
  camera.lookAt(anchor);
  if (Math.abs(camera.fov - Settings.fov) > 0.01) { camera.fov = Settings.fov; camera.updateProjectionMatrix(); }
}

function planeDropHud() {
  const D = PLANE_DROP; if (!D.panel) return;
  const riding = D.phase === 'plane', falling = D.phase === 'fall';
  D.prompt = riding ? 'SPACE — JUMP' : falling ? 'SPACE — OPEN PARACHUTE' : 'PARACHUTE DEPLOYED';
  D.panel.querySelector('[data-drop="alt"]').textContent = Math.round(D.altitude || 58) + ' M · AIRBORNE INSERTION';
  D.panel.querySelector('[data-drop="title"]').textContent = riding ? 'CHOOSE YOUR DROP' : falling ? 'FREEFALL' : 'GUIDE YOUR LANDING';
  const button = D.panel.querySelector('button'); button.textContent = D.prompt; button.disabled = !riding && !falling;
  D.panel.querySelector('[data-drop="help"]').textContent = riding ? 'Jump now, or deploy automatically at the end of the flight.' : 'WASD / left stick to steer · Parachute opens automatically near the ground';
}

function planeDropLand(site) {
  const D = PLANE_DROP, e = PL.ent;
  e.pos.copy(site || D.safe); e.vel.set(0, 0, 0); e.vy = 0; e.onGround = true; e.airVy = 0; e.eyeH = 1.62;
  e.input.jump = false; KEYS.Space = false; PL.pitch = e.pitch = 0; PL.held = PL.queued = PL.adsWant = false;
  PL.lastY = e.pos.y; PL.lastOn = true; PL.stepOff = PL.stepV = 0; PL.wasAir = false;
  planeDropReset(); D.phase = 'landed'; VM.root.visible = VM.holder.visible = true;
  applyCamera(0, MATCH.time, false); cdStartNow();
}

function planeDropReset() {
  const D = PLANE_DROP;
  D.phase = 'idle'; D.time = D.airTime = D.altitude = 0; D.prompt = ''; D.lastJump = false;
  if (D.plane) D.plane.visible = false;
  if (D.chute) D.chute.visible = false;
  if (D.body) D.body.root.visible = false;
  if (D.panel) D.panel.hidden = true;
  D.bodyEnt = null; D.sites = []; D.route = null; D.safe = null;
}
