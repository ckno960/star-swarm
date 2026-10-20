import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultSave, loadSave, starsFor, recordClear, recordDaily, bonusBalls, bonusAvailable, buy, equip, spend,
  titleFor, dayIndex, shareText, canHintFree, STAR_COINS, GOLD_COINS, DAILY_COINS, SHOP, DEFAULT_SETTINGS,
} from './meta.js';

const clear = (save, stage, stars, golden = false) => recordClear(save, { stage, stars, golden, monsters: [] });
const sum = rewards => rewards.reduce((a, r) => a + r.coins, 0);

test('별점: 힌트 쓰면 1개, 되돌리기만 쓰면 2개, 둘 다 안 쓰면 3개', () => {
  assert.equal(starsFor({ hints: 1, undos: 0 }), 1);
  assert.equal(starsFor({ hints: 0, undos: 2 }), 2);
  assert.equal(starsFor({ hints: 0, undos: 0 }), 3);
});

test('별 코인은 처음 더 높은 별을 받을 때 차액만 준다', () => {
  const s = defaultSave();
  assert.equal(sum(clear(s, 1, 1)), STAR_COINS[1]);
  assert.equal(sum(clear(s, 1, 1)), 0);
  assert.equal(sum(clear(s, 1, 3)), STAR_COINS[3] - STAR_COINS[1]);
  assert.equal(sum(clear(s, 1, 2)), 0);
  assert.equal(s.coins, STAR_COINS[3]);
  assert.equal(s.stars[1], 3);
  assert.equal(s.cleared, 1);
});

test('황금 몬스터 보너스는 스테이지마다 한 번', () => {
  const s = defaultSave();
  assert.equal(sum(clear(s, 4, 3, true)), STAR_COINS[3] + GOLD_COINS);
  assert.equal(sum(clear(s, 4, 3, true)), 0);
});

test('도감은 종류별로, 황금 몬스터는 따로 센다', () => {
  const s = defaultSave();
  recordClear(s, { stage: 1, stars: 3, golden: false, monsters: [{ kind: 0 }, { kind: 0 }, { kind: 3 }, { kind: 1, golden: true }] });
  assert.deepEqual(s.kills, { 0: 2, 3: 1, golden: 1 });
});

test('칭호는 총 처치 수, 모든 종류 100마리면 전설의 기사', () => {
  const s = defaultSave();
  assert.equal(titleFor(s), '견습 기사');
  s.kills = { 0: 300, 1: 250 };
  assert.equal(titleFor(s), '몬스터 헌터');
  s.kills = { 0: 100, 1: 100, 2: 100, 3: 100, golden: 100 };
  assert.equal(titleFor(s), '전설의 기사');
});

test('파친코 공 개수는 그 10스테이지의 별 합 (최소 10)', () => {
  const s = defaultSave();
  assert.equal(bonusBalls(s, 10), 10);
  for (let n = 1; n <= 10; n++) s.stars[n] = 3;
  s.stars[11] = 3; // 다른 구간은 세지 않는다
  assert.equal(bonusBalls(s, 10), 30);
  assert.equal(bonusBalls(s, 20), 10);
});

test('보너스는 10스테이지마다, 한 번만', () => {
  const s = defaultSave();
  assert.ok(bonusAvailable(s, 10));
  assert.ok(!bonusAvailable(s, 9));
  s.bonusDone = 10;
  assert.ok(!bonusAvailable(s, 10));
  assert.ok(bonusAvailable(s, 20));
});

test('상점: 코인이 있어야 사고, 사면 바로 장착', () => {
  const s = defaultSave();
  assert.deepEqual(buy(s, 'knight.cat'), { ok: false, reason: '코인이 부족해요' });
  s.coins = 200;
  assert.deepEqual(buy(s, 'knight.cat'), { ok: true });
  assert.equal(s.coins, 50);
  assert.equal(s.equip.knight, 'knight.cat');
  assert.equal(buy(s, 'knight.cat').ok, false);
  assert.ok(equip(s, 'knight.basic'));
  assert.ok(!equip(s, 'knight.gold'));
  assert.equal(s.equip.knight, 'knight.basic');
});

test('기본 아이템은 처음부터 가지고 있고, 모든 상품은 종류가 맞다', () => {
  const s = defaultSave();
  for (const id of Object.values(s.equip)) assert.ok(s.owned.includes(id));
  for (const item of SHOP) assert.ok(['knight', 'effect', 'theme'].includes(item.cat));
});

test('힌트는 앞 스테이지만 무료, 코인이 모자라면 못 씀', () => {
  assert.ok(canHintFree(5, false));
  assert.ok(!canHintFree(6, false));
  assert.ok(!canHintFree(1, true));
  const s = defaultSave();
  s.coins = 10;
  assert.equal(spend(s, 15), false);
  assert.equal(s.coins, 10);
});

test('오늘의 퍼즐: 하루 첫 클리어만 보상, 연속이면 보너스', () => {
  const s = defaultSave();
  assert.equal(sum(recordDaily(s, 5, { stars: 2, undos: 1, hints: 0 })), DAILY_COINS);
  assert.equal(sum(recordDaily(s, 5, { stars: 3, undos: 0, hints: 0 })), 0);
  assert.equal(s.daily.results[5].stars, 3);
  assert.equal(sum(recordDaily(s, 6, { stars: 3, undos: 0, hints: 0 })), DAILY_COINS + 5);
  assert.equal(s.daily.streak, 2);
  assert.equal(sum(recordDaily(s, 9, { stars: 3, undos: 0, hints: 0 })), DAILY_COINS);
  assert.equal(s.daily.streak, 1);
});

test('오늘의 퍼즐 번호는 2026-10-20이 1번', () => {
  assert.equal(dayIndex(new Date(2026, 9, 20, 0, 5)), 1);
  assert.equal(dayIndex(new Date(2026, 9, 20, 23, 55)), 1);
  assert.equal(dayIndex(new Date(2026, 9, 21, 9)), 2);
});

test('공유 문구', () => {
  assert.equal(shareText(3, { stars: 2, undos: 4, hints: 0 }), '나이트 라인 오늘의 퍼즐 #3 ★★☆ 되돌리기 4');
});

test('예전 저장 키를 이어받는다', () => {
  const old = { 'knightLine.cleared': '12', 'knightLine.coins': '80', 'knightLine.bonus': '10', 'knightLine.stage': '13' };
  const s = loadSave(k => old[k] ?? null);
  assert.deepEqual([s.cleared, s.coins, s.bonusDone, s.stage], [12, 80, 10, 13]);
  const again = loadSave(k => (k === 'knightLine.save' ? JSON.stringify(s) : null));
  assert.equal(again.coins, 80);
  assert.equal(loadSave(k => (k === 'knightLine.save' ? '{깨짐' : null)).coins, 0);
});

test('환경설정: 기본값이 있고, 예전 저장에도 빠진 항목을 채운다', () => {
  assert.deepEqual(defaultSave().settings, DEFAULT_SETTINGS);
  const saved = { ...defaultSave(), settings: { speed: 'fast' } };
  const s = loadSave(k => (k === 'knightLine.save' ? JSON.stringify(saved) : null));
  assert.deepEqual(s.settings, { ...DEFAULT_SETTINGS, speed: 'fast' });
  const old = loadSave(k => (k === 'knightLine.save' ? JSON.stringify({ coins: 5 }) : null));
  assert.deepEqual(old.settings, DEFAULT_SETTINGS);
});
