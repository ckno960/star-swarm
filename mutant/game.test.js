import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from './logic.js';

test('absorb heals, gives EP, soldier gives a disguise', () => {
  const s = L.defaultSave(); s.hp = 100;
  L.absorb(s, 'civ', false);
  assert.equal(s.hp, 125); assert.equal(s.ep, 8); assert.equal(s.disguise, false);
  L.absorb(s, 'soldier', true);
  assert.equal(s.disguise, true); assert.equal(s.alert, 0, 'disguised: nobody notices');
  s.hp = 199; L.absorb(s, 'infected', false);
  assert.equal(s.hp, L.maxHp(s));
});

test('suspicious acts blow the disguise and raise the alert', () => {
  const s = L.defaultSave(); s.disguise = true;
  assert.equal(L.suspicious(s, false), false); assert.equal(s.disguise, true);
  assert.equal(L.suspicious(s, true), true); assert.equal(s.disguise, false); assert.equal(s.alert, 2);
  const t = L.defaultSave(); L.absorb(t, 'civ', true); assert.equal(t.alert, 1);
});

test('alert cools down out of sight, helicopters from level 3', () => {
  const s = L.defaultSave(); L.raiseAlert(s, 4);
  for (let i = 0; i < 70; i++) L.stepAlert(s, 0.1, true);
  assert.equal(s.alert, 4, 'stays while seen');
  for (let i = 0; i < 145; i++) L.stepAlert(s, 0.1, false);   // 14.5초
  assert.equal(s.alert, 3);
  for (let i = 0; i < 600; i++) L.stepAlert(s, 0.1, false);
  assert.equal(s.alert, 0);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(L.helisWanted), [0, 0, 0, 1, 2, 2]);
  L.raiseAlert(s, 9); assert.equal(s.alert, 5);
});

test('damage, regen after 3s, respawn costs EP', () => {
  const s = L.defaultSave();
  assert.equal(L.damage(s, 50), false); assert.equal(s.hp, 150);
  L.stepRegen(s, 2); assert.equal(s.hp, 150);
  L.stepRegen(s, 2); assert.ok(s.hp > 150);
  s.ep = 100; L.raiseAlert(s, 3);
  assert.equal(L.damage(s, 999), true);
  L.respawn(s);
  assert.equal(s.ep, 80); assert.equal(s.hp, L.maxHp(s)); assert.equal(s.alert, 0); assert.equal(s.deaths, 1);
});

test('upgrades cost EP and scale stats', () => {
  const s = L.defaultSave(); s.ep = 1000;
  assert.ok(L.buyUpgrade(s, 'hp')); assert.equal(L.maxHp(s), 240);
  assert.ok(L.buyUpgrade(s, 'dmg')); assert.equal(L.weaponDmg(s, 1), 66);
  for (let i = 0; i < 3; i++) L.buyUpgrade(s, 'move');
  assert.equal(L.buyUpgrade(s, 'move'), false, 'max level');
  assert.ok(Math.abs(L.moveMul(s) - 1.45) < 1e-9);
  const poor = L.defaultSave(); assert.equal(L.buyUpgrade(poor, 'hp'), false);
});

test('hives and save round-trip', () => {
  const s = L.defaultSave();
  L.hiveDestroyed(s); assert.equal(s.hives, 1); assert.equal(s.ep, 120); assert.equal(s.alert, 1);
  const store = new Map(), io = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  s.up.regen = 2; s.disguise = true; L.storeSave(io, s);
  const t = L.loadSave(io);
  assert.equal(t.up.regen, 2); assert.equal(t.ep, 120); assert.equal(t.alert, 0); assert.equal(t.disguise, false);
});
