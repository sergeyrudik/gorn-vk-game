import assert from "node:assert/strict";
import test from "node:test";

import {
  applyAutoTick,
  applyOfflineIncome,
  applyTap,
  craftRecipe,
  createDefaultSave,
  getCritChance,
  getTapPower,
  getUpgradeIngotCost,
  grantBoost,
  migrateSave,
  recipeProgress,
  selectNewestSave,
  serializeSave,
} from "../app/game-engine.ts";

test("tap power scales with hammer and can crit", () => {
  assert.equal(getTapPower({ hammer: 3, bellows: 0, apprentice: 0, warehouse: 0 }), 4);
  const boost = grantBoost(1000, 60_000, 2);
  const normal = applyTap({ hammer: 0, bellows: 0, apprentice: 0, warehouse: 0 }, boost, 0, () => 0.99, 1000);
  assert.equal(normal.crit, false);
  assert.ok(normal.gained >= 2);
  const crit = applyTap({ hammer: 0, bellows: 20, apprentice: 0, warehouse: 0 }, { multiplier: 1, expiresAt: 0 }, 0, () => 0.01);
  assert.equal(crit.crit, true);
  assert.ok(crit.gained >= 3);
});

test("auto and offline income", () => {
  const upgrades = { hammer: 0, bellows: 0, apprentice: 5, warehouse: 1 };
  assert.equal(applyAutoTick(upgrades, { multiplier: 1, expiresAt: 0 }, 2), 10);
  const offline = applyOfflineIncome(upgrades, Date.now() - 10_000, Date.now());
  assert.ok(offline.ingots >= 1);
  assert.ok(offline.seconds >= 9);
});

test("craft recipe gates", () => {
  const fail = craftRecipe("sword", 10, 0, {});
  assert.equal(fail.ok, false);
  const ok = craftRecipe("knife", 40, 0, {});
  assert.equal(ok.ok, true);
  assert.equal(ok.ingots, 0);
  assert.equal(ok.crafted.knife, 1);
  assert.equal(recipeProgress(ok.crafted).done, 1);
});

test("upgrade costs and crit chance", () => {
  assert.ok(getUpgradeIngotCost("hammer", 0) >= 15);
  assert.ok(getCritChance({ hammer: 0, bellows: 2, apprentice: 0, warehouse: 0 }) > 0.05);
});

test("save migrate", () => {
  assert.equal(migrateSave("x"), null);
  const a = createDefaultSave();
  a.updatedAt = 1;
  const b = migrateSave(serializeSave({ ...a, updatedAt: 2, ingots: 77 }));
  assert.equal(selectNewestSave(a, b)?.ingots, 77);
});


test("migration preserves timestamps, reward cooldown and newest cloud progress", () => {
  const now = Date.now();
  const saved = createDefaultSave();
  saved.updatedAt = now - 1000;
  saved.rewards.lastRewardAt = now - 500;
  const local = migrateSave(JSON.stringify(saved));
  const cloud = migrateSave(JSON.stringify({ ...saved, updatedAt: now }));
  assert.equal(local.updatedAt, now - 1000);
  assert.equal(local.rewards.lastRewardAt, now - 500);
  assert.equal(selectNewestSave(local, cloud), cloud);
});

test("migration retains offline activity and active reward boost", () => {
  const now = Date.now();
  const saved = createDefaultSave();
  saved.lastActiveAt = now - 1000;
  saved.upgrades.apprentice = 5;
  saved.boost = { multiplier: 2, expiresAt: now + 60000 };
  const migrated = migrateSave(JSON.stringify(saved));
  assert.equal(migrated.lastActiveAt, saved.lastActiveAt);
  assert.deepEqual(migrated.boost, saved.boost);
  assert.equal(applyOfflineIncome(migrated.upgrades, migrated.lastActiveAt, now).seconds, 1);
});
