/* Run with: node --test tools/dev/plane-drop.test.js
   Uses the shipped Three.js build; no browser or npm install is required. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function insertionHarness(options = {}) {
  const elements = new Map();
  const makeElement = () => ({
    hidden: false, children: [], textContent: '',
    appendChild(child) { this.children.push(child); },
    addEventListener() {},
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, makeElement());
      return elements.get(selector);
    },
  });
  const context = vm.createContext({ console, document: { head: makeElement(), body: makeElement(), createElement: makeElement } });
  vm.runInContext(read('assets/vendor/three-r147.js'), context);
  const T = context.THREE;
  const scene = new T.Scene(), camera = new T.PerspectiveCamera(70);
  const pos = new T.Vector3(-8, 0, 0);
  const calls = { countdown: 0, immediateStart: 0, camera: 0 };
  Object.assign(context, {
    scene, camera, V3: T.Vector3, TAU: Math.PI * 2,
    MATCH: { online: false, state: 'playing', time: 0 },
    PL: { ent: { alive: true, pos, vel: new T.Vector3(), vy: 0, input: { jump: false }, model: { root: new T.Group() } }, yaw: 0, pitch: 0 },
    VM: { root: new T.Group(), holder: new T.Group() },
    NAV: options.noNodes ? { count: 0 } : { count: 3, nx: [-20, 0, 20], ny: [0, 0, 0], nz: [0, 0, 0], comp: [1, 1, 1], mainComp: 1 },
    WATER: { on: false, y: -2 }, MAP: { x0: -36, x1: 36, z0: -50, z1: 50 },
    KEYS: {}, TOUCH: { on: false, mx: 0, mz: 0 }, PAD: { mx: 0, mz: 0 }, Settings: { fov: 70 },
    J_ELL: 0, J_ELR: 1, J_HAL: 2, J_HAR: 3,
    clamp: (value, lo, hi) => Math.max(lo, Math.min(hi, value)),
    damp: (from, to, speed, dt) => from + (to - from) * (1 - Math.exp(-speed * dt)),
    hyp: Math.hypot,
    groundHeight: () => options.voidFloor ? -200 : 0,
    waterAt: () => false, rayWorld: () => null, curW: () => ({ def: { key: 'm4' } }), skinOf: () => 0,
    makeSoldier() {
      const body = { root: new T.Group(), gun: new T.Group(), J: Array.from({ length: 4 }, () => new T.Vector3()) };
      scene.add(body.root); return body;
    },
    setSoldierLod() {}, soldierLook() {}, poseSoldier() {}, layoutSoldier() {},
    applyCamera() { calls.camera++; }, cdStart() { calls.countdown++; }, cdStartNow() { calls.immediateStart++; },
  });
  vm.runInContext(read('src/09zc-plane-drop.js') + '\nglobalThis.dropState = PLANE_DROP;', context);
  return { context, state: context.dropState, calls };
}

test('automatic insertion progresses through flight, freefall, parachute and a safe landing', () => {
  const { context: c, state: drop, calls } = insertionHarness();
  assert.equal(c.planeDropStart(), true);
  assert.equal(c.VM.root.visible, false);
  const phases = new Set([drop.phase]);
  for (let frame = 0; frame < 1000 && c.planeDropActive(); frame++) {
    c.planeDropUpdate(0.05); phases.add(drop.phase);
    assert.ok(Number.isFinite(c.PL.ent.pos.y), 'Insertion never produces an invalid position');
  }
  assert.deepEqual([...phases], ['plane', 'fall', 'parachute', 'landed']);
  assert.equal(c.planeDropActive(), false);
  assert.equal(calls.countdown, 0, 'Landing does not start the old countdown');
  assert.equal(calls.immediateStart, 1, 'Combat starts exactly once on landing');
  assert.equal(c.PL.ent.pos.y, 0);
  assert.ok([-20, 0, 20].includes(c.PL.ent.pos.x), 'Landing is on the normal walkable navigation mesh');
  assert.equal(c.PL.ent.onGround, true);
  assert.equal(c.PL.ent.vy, 0);
  assert.equal(c.VM.root.visible, true);
  assert.equal(c.VM.holder.visible, true);
  assert.equal(drop.panel.hidden, true);
  assert.equal(drop.plane.visible, false);
  assert.equal(drop.chute.visible, false);
  assert.equal(drop.body.root.visible, false);
});

test('jump is edge triggered, parachute can open early, and pause freezes insertion', () => {
  const { context: c, state: drop } = insertionHarness();
  c.planeDropStart();
  c.KEYS.Space = true;
  c.planeDropUpdate(0.05);
  assert.equal(drop.phase, 'fall');
  for (let i = 0; i < 5; i++) c.planeDropUpdate(0.05);
  assert.equal(drop.phase, 'fall', 'Holding jump does not immediately deploy the parachute');
  c.KEYS.Space = false; c.planeDropUpdate(0.05);
  c.KEYS.Space = true; c.planeDropUpdate(0.05);
  assert.equal(drop.phase, 'parachute');
  c.MATCH.state = 'paused';
  const before = { pos: c.PL.ent.pos.toArray(), time: drop.time, airTime: drop.airTime, phase: drop.phase };
  for (let i = 0; i < 100; i++) { c.planeDropUpdate(0.05); c.planeDropAction(); }
  assert.deepEqual({ pos: c.PL.ent.pos.toArray(), time: drop.time, airTime: drop.airTime, phase: drop.phase }, before);
  c.MATCH.state = 'playing'; c.planeDropUpdate(0.05);
  assert.ok(drop.time > before.time);
});

test('an empty navigation mesh or void below the drop safely returns to the original spawn', () => {
  const { context: c, calls } = insertionHarness({ noNodes: true, voidFloor: true });
  const spawn = c.PL.ent.pos.clone();
  c.planeDropStart();
  for (let frame = 0; frame < 1000 && c.planeDropActive(); frame++) c.planeDropUpdate(0.05);
  assert.equal(c.planeDropActive(), false);
  assert.deepEqual(c.PL.ent.pos.toArray(), spawn.toArray());
  assert.equal(calls.countdown, 0);
  assert.equal(calls.immediateStart, 1);
});

test('reset hides insertion assets, clears transient state and reuses meshes on replay', () => {
  const { context: c, state: drop, calls } = insertionHarness();
  c.planeDropStart(); c.planeDropAction(); c.planeDropAction();
  const meshCount = c.scene.children.length;
  c.planeDropReset();
  assert.equal(c.planeDropActive(), false);
  assert.equal(drop.phase, 'idle');
  assert.equal(drop.safe, null); assert.equal(drop.route, null); assert.equal(drop.bodyEnt, null);
  assert.equal(drop.sites.length, 0);
  assert.equal(drop.panel.hidden, true);
  assert.equal(drop.plane.visible || drop.chute.visible || drop.body.root.visible, false);
  assert.equal(calls.countdown, 0, 'Cancelling insertion does not start combat');
  assert.equal(calls.immediateStart, 0, 'Cancelling insertion does not start combat');
  c.PL.ent.pos.set(-8, 0, 0);
  c.planeDropStart();
  assert.equal(drop.phase, 'plane');
  assert.equal(c.scene.children.length, meshCount, 'Replays do not allocate another aircraft, parachute or soldier');
  assert.equal(c.document.body.children.length, 1, 'Replays reuse the input panel');
});

test('network matches and dead players cannot start insertion', () => {
  const { context: c } = insertionHarness();
  c.MATCH.online = true;
  assert.equal(c.planeDropStart(), false);
  assert.equal(c.planeDropActive(), false);
  c.MATCH.online = false; c.PL.ent.alive = false;
  assert.equal(c.planeDropStart(), false);
  assert.equal(c.scene.children.length, 0);
});

test('insertion holds the native timer, mode rules and bots, then releases normal combat', () => {
  const game = read('src/09-game.js');
  const tick = game.slice(game.indexOf('function matchTick('), game.indexOf('\n/* Hôte d\'une partie', game.indexOf('function matchTick(')));
  assert.ok(tick.includes('return dt;'), 'Extract the complete native matchTick function');
  const countdown = read('src/09y-decompte.js');
  const hold = countdown.match(/function playHold\(\) \{[^\n]+\}/)[0];
  const calls = { bots: 0, mode: 0, player: 0 };
  let inserting = true;
  const context = {
    MATCH: { state: 'playing', time: 0, timeLeft: 600, events: [] },
    MIG: { on: false }, KC: { active: false }, ESSAI: false, ESSAI_MECHA: false,
    cdOn: () => false,
    planeDropActive: () => inserting,
    botsTick: () => calls.bots++, modeUpdate: () => calls.mode++, updatePlayer: () => calls.player++,
  };
  for (const name of ['cdTick', 'uavTick', 'pfrLap', 'updateNades', 'updateThrowKnives', 'updateSmokes', 'updateDrops', 'updateProps', 'updateKillstreak', 'updateAircraft', 'drawTacMap', 'updateHud', 'kcRecord', 'netUpdate']) context[name] = () => {};
  vm.createContext(context);
  vm.runInContext(hold + '\n' + tick, context);
  context.matchTick(0.05, false);
  assert.equal(context.MATCH.timeLeft, 600);
  assert.deepEqual(calls, { bots: 0, mode: 0, player: 1 });
  inserting = false;
  context.matchTick(0.05, false);
  assert.equal(context.MATCH.timeLeft, 599.95);
  assert.deepEqual(calls, { bots: 1, mode: 1, player: 2 });
});
