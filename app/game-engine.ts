export const MAX_UPGRADE_LEVEL = 50;

export type UpgradeKey = "hammer" | "bellows" | "apprentice" | "warehouse";
export type RecipeId =
  | "knife"
  | "axe"
  | "spear"
  | "sword"
  | "mace"
  | "shield"
  | "helmet"
  | "mail"
  | "saber"
  | "halberd"
  | "crown_blade"
  | "fire_heart";

export type Upgrades = Record<UpgradeKey, number>;

export type GameStats = {
  taps: number;
  crits: number;
  crafted: number;
  ingotsEarned: number;
  adsWatched: number;
  bestStreak: number;
};

export type DailyProgress = {
  date: string;
  tap: number;
  craft: number;
  upgrade: number;
  claimed: string[];
};

export type RewardLimits = {
  date: string;
  count: number;
  lastRewardAt: number;
};

export type RecipeDef = {
  id: RecipeId;
  name: string;
  icon: string;
  cost: number;
  unlockTaps: number;
};

export type BoostState = {
  multiplier: number;
  expiresAt: number;
};

export type GameSave = {
  version: 1;
  updatedAt: number;
  ingots: number;
  coal: number;
  upgrades: Upgrades;
  crafted: Partial<Record<RecipeId, number>>;
  sound: boolean;
  tutorialDone: boolean;
  tutorialStep: number;
  stats: GameStats;
  daily: DailyProgress;
  rewards: RewardLimits;
  lastActiveAt: number;
  boost: BoostState;
  tapStreak: number;
};

export const UPGRADE_DATA: Record<
  UpgradeKey,
  { icon: string; title: string; description: string; bonus: (level: number) => string }
> = {
  hammer: {
    icon: "🔨",
    title: "Молот",
    description: "Больше слитков за удар",
    bonus: (level) => `+${level} к удару`,
  },
  bellows: {
    icon: "🌬️",
    title: "Меха",
    description: "Выше шанс критического удара",
    bonus: (level) => `${Math.min(45, 5 + level * 4)}% крит`,
  },
  apprentice: {
    icon: "🧑‍🔧",
    title: "Подмастерья",
    description: "Автодоход слитков в секунду",
    bonus: (level) => `${level} сл/с`,
  },
  warehouse: {
    icon: "📦",
    title: "Склад",
    description: "Дольше копятся офлайн-слитки",
    bonus: (level) => `${4 + level} ч офлайн`,
  },
};

export const RECIPE_CATALOG: RecipeDef[] = [
  { id: "knife", name: "Нож", icon: "🔪", cost: 40, unlockTaps: 0 },
  { id: "axe", name: "Топор", icon: "🪓", cost: 90, unlockTaps: 25 },
  { id: "spear", name: "Копьё", icon: "🗡️", cost: 160, unlockTaps: 60 },
  { id: "sword", name: "Меч", icon: "⚔️", cost: 280, unlockTaps: 120 },
  { id: "mace", name: "Булава", icon: "🔨", cost: 420, unlockTaps: 200 },
  { id: "shield", name: "Щит", icon: "🛡️", cost: 520, unlockTaps: 280 },
  { id: "helmet", name: "Шлем", icon: "⛑️", cost: 650, unlockTaps: 360 },
  { id: "mail", name: "Кольчуга", icon: "🧥", cost: 820, unlockTaps: 450 },
  { id: "saber", name: "Сабля", icon: "🗡️", cost: 1100, unlockTaps: 560 },
  { id: "halberd", name: "Алебарда", icon: "⚔️", cost: 1500, unlockTaps: 700 },
  { id: "crown_blade", name: "Клинок князя", icon: "👑", cost: 2400, unlockTaps: 900 },
  { id: "fire_heart", name: "Сердце горна", icon: "🔥", cost: 4000, unlockTaps: 1200 },
];

export const INGOT_CAP = 1_000_000_000;

export function rewardIngotsAmount(ingots: number, requested = 100): number {
  return Math.min(requested, Math.max(0, INGOT_CAP - Math.floor(ingots)));
}

function clampInt(value: unknown, fallback: number, min = 0, max = INGOT_CAP): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function getLocalDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function createDefaultUpgrades(): Upgrades {
  return { hammer: 0, bellows: 0, apprentice: 0, warehouse: 0 };
}

export function createDefaultStats(): GameStats {
  return { taps: 0, crits: 0, crafted: 0, ingotsEarned: 0, adsWatched: 0, bestStreak: 0 };
}

export function createDefaultDaily(date = getLocalDateKey()): DailyProgress {
  return { date, tap: 0, craft: 0, upgrade: 0, claimed: [] };
}

export function createDefaultRewards(date = getLocalDateKey()): RewardLimits {
  return { date, count: 0, lastRewardAt: 0 };
}

export function createDefaultSave(): GameSave {
  const now = Date.now();
  return {
    version: 1,
    updatedAt: now,
    ingots: 0,
    coal: 2,
    upgrades: createDefaultUpgrades(),
    crafted: {},
    sound: true,
    tutorialDone: false,
    tutorialStep: 0,
    stats: createDefaultStats(),
    daily: createDefaultDaily(),
    rewards: createDefaultRewards(),
    lastActiveAt: now,
    boost: { multiplier: 1, expiresAt: 0 },
    tapStreak: 0,
  };
}

export function serializeSave(save: GameSave): string {
  return JSON.stringify({ ...save, updatedAt: Date.now() });
}

export function selectNewestSave(a: GameSave | null, b: GameSave | null): GameSave | null {
  if (!a) return b;
  if (!b) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}

export function migrateSave(raw: string | null | undefined): GameSave | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GameSave>;
    if (!parsed || typeof parsed !== "object") return null;
    const base = createDefaultSave();
    const crafted: Partial<Record<RecipeId, number>> = {};
    if (parsed.crafted && typeof parsed.crafted === "object") {
      for (const [id, count] of Object.entries(parsed.crafted)) {
        if (RECIPE_CATALOG.some((recipe) => recipe.id === id)) {
          crafted[id as RecipeId] = clampInt(count, 0, 0, 9999);
        }
      }
    }
    return {
      version: 1,
      updatedAt: clampInt(parsed.updatedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
      ingots: clampInt(parsed.ingots, 0, 0),
      coal: clampInt(parsed.coal, base.coal, 0, 9999),
      upgrades: {
        hammer: clampInt(parsed.upgrades?.hammer, 0, 0, MAX_UPGRADE_LEVEL),
        bellows: clampInt(parsed.upgrades?.bellows, 0, 0, MAX_UPGRADE_LEVEL),
        apprentice: clampInt(parsed.upgrades?.apprentice, 0, 0, MAX_UPGRADE_LEVEL),
        warehouse: clampInt(parsed.upgrades?.warehouse, 0, 0, MAX_UPGRADE_LEVEL),
      },
      crafted,
      sound: parsed.sound !== false,
      tutorialDone: Boolean(parsed.tutorialDone),
      tutorialStep: clampInt(parsed.tutorialStep, 0, 0, 2),
      stats: {
        taps: clampInt(parsed.stats?.taps, 0),
        crits: clampInt(parsed.stats?.crits, 0),
        crafted: clampInt(parsed.stats?.crafted, 0),
        ingotsEarned: clampInt(parsed.stats?.ingotsEarned, 0),
        adsWatched: clampInt(parsed.stats?.adsWatched, 0),
        bestStreak: clampInt(parsed.stats?.bestStreak, 0),
      },
      daily: {
        date: typeof parsed.daily?.date === "string" ? parsed.daily.date : getLocalDateKey(),
        tap: clampInt(parsed.daily?.tap, 0),
        craft: clampInt(parsed.daily?.craft, 0),
        upgrade: clampInt(parsed.daily?.upgrade, 0),
        claimed: Array.isArray(parsed.daily?.claimed)
          ? parsed.daily.claimed.filter((item): item is string => typeof item === "string")
          : [],
      },
      rewards: {
        date: typeof parsed.rewards?.date === "string" ? parsed.rewards.date : getLocalDateKey(),
        count: clampInt(parsed.rewards?.count, 0),
        lastRewardAt: clampInt(parsed.rewards?.lastRewardAt, 0, 0, Number.MAX_SAFE_INTEGER),
      },
      lastActiveAt: clampInt(parsed.lastActiveAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
      boost: {
        multiplier: Math.max(1, Number(parsed.boost?.multiplier) || 1),
        expiresAt: clampInt(parsed.boost?.expiresAt, 0, 0, Number.MAX_SAFE_INTEGER),
      },
      tapStreak: clampInt(parsed.tapStreak, 0, 0, 999),
    };
  } catch {
    return null;
  }
}

export function getUpgradeCost(level: number): number {
  return 3 + clampInt(level, 0, 0, 80) * 2;
}

export function getTapPower(upgrades: Upgrades): number {
  return 1 + upgrades.hammer;
}

export function getCritChance(upgrades: Upgrades): number {
  return Math.min(0.45, 0.05 + upgrades.bellows * 0.04);
}

export function getAutoIncome(upgrades: Upgrades): number {
  return upgrades.apprentice;
}

export function getOfflineCapHours(upgrades: Upgrades): number {
  return 4 + upgrades.warehouse;
}

export function getActiveMultiplier(boost: BoostState, now = Date.now()): number {
  return boost.expiresAt > now ? Math.max(1, boost.multiplier) : 1;
}

export function applyTap(
  upgrades: Upgrades,
  boost: BoostState,
  streak: number,
  rng = Math.random,
  now = Date.now(),
): { gained: number; crit: boolean; streak: number } {
  const mult = getActiveMultiplier(boost, now);
  const crit = rng() < getCritChance(upgrades);
  const streakBonus = 1 + Math.min(0.5, streak * 0.02);
  const base = getTapPower(upgrades) * mult * streakBonus;
  const gained = Math.max(1, Math.round(base * (crit ? 3 : 1)));
  return { gained, crit, streak: streak + 1 };
}

export function applyAutoTick(
  upgrades: Upgrades,
  boost: BoostState,
  seconds = 1,
  now = Date.now(),
): number {
  const income = getAutoIncome(upgrades);
  if (income <= 0) return 0;
  return Math.floor(income * seconds * getActiveMultiplier(boost, now));
}

export function applyOfflineIncome(
  upgrades: Upgrades,
  lastActiveAt: number,
  now = Date.now(),
): { ingots: number; seconds: number } {
  const elapsedSec = Math.max(0, Math.floor((now - lastActiveAt) / 1000));
  const capSec = getOfflineCapHours(upgrades) * 3600;
  const seconds = Math.min(elapsedSec, capSec);
  const income = getAutoIncome(upgrades);
  return { ingots: Math.floor(income * seconds * 0.5), seconds };
}

export function getUpgradeIngotCost(key: UpgradeKey, level: number): number {
  const base = { hammer: 15, bellows: 25, apprentice: 40, warehouse: 60 }[key];
  return Math.round(base * Math.pow(1.35, level));
}

export function craftRecipe(
  recipeId: RecipeId,
  ingots: number,
  taps: number,
  crafted: Partial<Record<RecipeId, number>>,
): { ok: boolean; ingots: number; crafted: Partial<Record<RecipeId, number>> } {
  const recipe = RECIPE_CATALOG.find((item) => item.id === recipeId);
  if (!recipe) return { ok: false, ingots, crafted };
  if (taps < recipe.unlockTaps || ingots < recipe.cost) return { ok: false, ingots, crafted };
  return {
    ok: true,
    ingots: ingots - recipe.cost,
    crafted: { ...crafted, [recipeId]: (crafted[recipeId] ?? 0) + 1 },
  };
}

export function recipeProgress(crafted: Partial<Record<RecipeId, number>>): {
  done: number;
  total: number;
} {
  const done = RECIPE_CATALOG.filter((recipe) => (crafted[recipe.id] ?? 0) > 0).length;
  return { done, total: RECIPE_CATALOG.length };
}

export function refreshDaily(daily: DailyProgress, date = getLocalDateKey()): DailyProgress {
  if (daily.date === date) return daily;
  return createDefaultDaily(date);
}

export function refreshRewards(rewards: RewardLimits, date = getLocalDateKey()): RewardLimits {
  if (rewards.date === date) return rewards;
  return { ...createDefaultRewards(date), lastRewardAt: rewards.lastRewardAt };
}

export function grantBoost(now = Date.now(), durationMs = 60_000, multiplier = 2): BoostState {
  return { multiplier, expiresAt: now + durationMs };
}
