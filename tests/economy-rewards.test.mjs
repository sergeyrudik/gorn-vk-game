import assert from "node:assert/strict";
import test from "node:test";
import { INGOT_CAP, rewardIngotsAmount, refreshRewards, createDefaultSave, migrateSave, serializeSave, grantBoost, applyTap } from "../app/game-engine.ts";
test("partial ingot reward remains valuable and survives serialization at cap", () => {
  const save = { ...createDefaultSave(), ingots: INGOT_CAP - 5 };
  assert.equal(rewardIngotsAmount(save.ingots), 5);
  const rewarded = { ...save, ingots: save.ingots + rewardIngotsAmount(save.ingots) };
  assert.equal(migrateSave(serializeSave(rewarded)).ingots, INGOT_CAP);
  assert.equal(rewardIngotsAmount(INGOT_CAP), 0);
});
test("day reset preserves the last successful reward cooldown", () => {
  const refreshed = refreshRewards({ date: "2000-01-01", count: 8, lastRewardAt: 1_700_000_000_000 }, "2000-01-02");
  assert.equal(refreshed.count, 0); assert.equal(refreshed.lastRewardAt, 1_700_000_000_000);
});
test("a boost earned after 61 seconds of video still lasts a full minute and benefits tapping", () => {
  const watchedAt = 1_000_000 + 61_000; const boost = grantBoost(watchedAt);
  assert.equal(boost.expiresAt, watchedAt + 60_000);
  const save = createDefaultSave();
  assert.ok(applyTap(save.upgrades, boost, 0, () => 0.9, watchedAt + 59_999).gained > applyTap(save.upgrades, boost, 0, () => 0.9, watchedAt + 60_000).gained);
});
