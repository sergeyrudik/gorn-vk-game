"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import bridge from "@vkontakte/vk-bridge";
import { createVkBridge, readStoredValue, writeStoredValue } from "./vk-runtime";
import Link from "next/link";
import { createAdPolicy } from "./ad-policy";
import { attemptEconomyInterstitial, requestEconomyReward } from "./economy-ads";
import { createSaveCoordinator } from "./save-coordinator";
import {
  rewardIngotsAmount,
  RECIPE_CATALOG,
  UPGRADE_DATA,
  MAX_UPGRADE_LEVEL,
  applyElapsedAutoTick,
  grantIngots,
  applyOfflineIncome,
  applyTap,
  createDefaultSave,
  craftRecipe,
  getActiveMultiplier,
  getAutoIncome,
  getCritChance,
  getTapPower,
  getUpgradeCost,
  getUpgradeIngotCost,
  grantBoost,
  migrateSave,
  recipeProgress,
  refreshDaily,
  refreshRewards,
  selectNewestSave,
  serializeSave,
  type BoostState,
  type DailyProgress,
  type GameSave,
  type GameStats,
  type RecipeId,
  type UpgradeKey,
  type Upgrades,
} from "./game-engine";

type VKUser = { id?: number; first_name: string };
type VKEvent = { detail?: { type?: string } };
type VKBridge = {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  subscribe?: (handler: (event: VKEvent) => void) => void;
  unsubscribe?: (handler: (event: VKEvent) => void) => void;
};
type GameTab = "forge" | "shop" | "recipes" | "quests" | "stats";

const SAVE_KEY = "gorn-save-v1";
const VK_SAVE_KEY = "gorn_save";
const REWARD_COOLDOWN_MS = 3 * 60 * 1000;
const REWARD_DAILY_LIMIT = 8;
const VK_APP_URL = "https://vk.com/app54694462";

const DAILY_QUESTS = [
  { id: "tap", field: "tap" as const, target: 50, title: "Удары молота", description: "Сделай 50 ударов", reward: { ingots: 80 } },
  { id: "craft", field: "craft" as const, target: 2, title: "Заказы цеха", description: "Выкуй 2 изделия", reward: { coal: 2 } },
  { id: "upgrade", field: "upgrade" as const, target: 2, title: "Усиление горна", description: "Купи 2 улучшения", reward: { ingots: 120 } },
];

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error("VK Bridge timeout")), timeoutMs);
    }),
  ]);
}

export default function HomePage() {
  const [hydrated, setHydrated] = useState(false);
  const [started, setStarted] = useState(false);
  const [tab, setTab] = useState<GameTab>("forge");
  const [vkReady, setVkReady] = useState(false);
  const [vkUser, setVkUser] = useState<VKUser | null>(null);
  const [paused, setPaused] = useState(false);
  const [adAvailable, setAdAvailable] = useState(false);
  const [interstitialBusy, setInterstitialBusy] = useState(false);
  const [rewardBusy, setRewardBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hit, setHit] = useState(false);
  const [critHit, setCritHit] = useState(false);
  const [floatText, setFloatText] = useState<string | null>(null);
  const [floatCrit, setFloatCrit] = useState(false);
  const [offlineBanner, setOfflineBanner] = useState<string | null>(null);
  const [craftPopup, setCraftPopup] = useState<RecipeId | null>(null);
  const [heat, setHeat] = useState(0);
  const [sparking, setSparking] = useState(false);

  const [ingots, setIngots] = useState(0);
  const [coal, setCoal] = useState(2);
  const [upgrades, setUpgrades] = useState<Upgrades>({ hammer: 0, bellows: 0, apprentice: 0, warehouse: 0 });
  const [crafted, setCrafted] = useState<Partial<Record<RecipeId, number>>>({});
  const [sound, setSound] = useState(true);
  const [tutorialDone, setTutorialDone] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [stats, setStats] = useState<GameStats>(createDefaultSave().stats);
  const [daily, setDaily] = useState<DailyProgress>(createDefaultSave().daily);
  const [, setRewards] = useState(createDefaultSave().rewards);
  const [boost, setBoost] = useState<BoostState>({ multiplier: 1, expiresAt: 0 });
  const [tapStreak, setTapStreak] = useState(0);
  const [nowTick, setNowTick] = useState(0);

  const bridgeRef = useRef<VKBridge | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const adPolicyRef = useRef<ReturnType<typeof createAdPolicy> | null>(null);
  const saveRef = useRef<GameSave>(createDefaultSave());
  const saveCoordinatorRef = useRef<ReturnType<typeof createSaveCoordinator> | null>(null);
  const resetPendingRef = useRef(false);
  const incomePauseRef = useRef(false);

  const getAdPolicy = useCallback(() => {
    if (!adPolicyRef.current) adPolicyRef.current = createAdPolicy({
      storageKey: "gorn:ad-policy:v1",
      onInterstitialBusyChange: setInterstitialBusy,
    });
    return adPolicyRef.current;
  }, []);

  useEffect(() => {
    if (hydrated && started) getAdPolicy().startGameplay();
  }, [hydrated, started, getAdPolicy]);

  const rewardIngots = rewardIngotsAmount(ingots);
  const clock = nowTick || 1;
  const mult = getActiveMultiplier(boost, clock);
  const boostLeftSec = Math.max(0, Math.ceil((boost.expiresAt - clock) / 1000));
  const recipes = recipeProgress(crafted);
  const streakPct = Math.min(100, Math.round((tapStreak % 25) * 4));
  const tutorialText = useMemo(() => {
    if (tutorialDone) return null;
    if (tutorialStep === 0) return "Бей по наковальне — каждый удар даёт слитки. Серия усиливает доход.";
    if (tutorialStep === 1) return "Купи улучшение в «Цехе» или выкуй нож в «Рецептах».";
    return "Подмастерья копят слитки даже когда ты уходишь — возвращайся за офлайн-доходом.";
  }, [tutorialDone, tutorialStep]);

  const playSound = useCallback(
    (kind: "tap" | "crit" | "buy" | "error") => {
      if (!sound || typeof window === "undefined") return;
      try {
        const context = audioContextRef.current ?? new AudioContext();
        audioContextRef.current = context;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const frequencies = { tap: 220, crit: 520, buy: 680, error: 140 };
        oscillator.frequency.value = frequencies[kind];
        oscillator.type = kind === "tap" ? "triangle" : "sine";
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.14);
      } catch {
        // optional
      }
    },
    [sound],
  );

  const trackEvent = useCallback((eventName: string, params: Record<string, string | number | boolean> = {}) => {
    if (!bridgeRef.current) return;
    const eventParams: Record<string, string> = {};
    Object.entries(params).forEach(([key, value]) => {
      eventParams[key] = String(value);
    });
    void bridgeRef.current
      .send("VKWebAppTrackEvent", { event_name: eventName, event_params: eventParams })
      .catch(() => undefined);
  }, []);

  const applySave = useCallback((save: GameSave) => {
    getAdPolicy().seedLastAdAt(save.rewards.lastRewardAt);
    saveRef.current = save;
    setIngots(save.ingots);
    setCoal(save.coal);
    setUpgrades(save.upgrades);
    setCrafted(save.crafted);
    setSound(save.sound);
    setTutorialDone(save.tutorialDone);
    setTutorialStep(save.tutorialDone ? 2 : save.tutorialStep);
    setStats(save.stats);
    setDaily(refreshDaily(save.daily));
    setRewards(refreshRewards(save.rewards));
    setBoost(save.boost);
    setTapStreak(save.tapStreak);


  }, [getAdPolicy]);

  const getSaveCoordinator = useCallback(() => {
    if (!saveCoordinatorRef.current) saveCoordinatorRef.current = createSaveCoordinator({
      read: () => readStoredValue(SAVE_KEY), write: (value) => writeStoredValue(SAVE_KEY, value),
      parse: (value) => migrateSave(value) ?? createDefaultSave(), serialize: serializeSave,
      withLock: async (run) => navigator.locks ? await navigator.locks.request(`${SAVE_KEY}:write`, run) : await run(),
    });
    return saveCoordinatorRef.current;
  }, []);

  const synchronizeSave = useCallback(() => {
    const external = getSaveCoordinator().refresh();
    if (external) applySave(external);
    return external ?? saveRef.current;
  }, [applySave, getSaveCoordinator]);

  const commitSave = useCallback(async (transform: (current: GameSave) => GameSave | null) => {
    const result = await getSaveCoordinator().transact(transform);
    if (result.external) applySave(result.external);
    if (result.value && (result.localWritten === false || readStoredValue(SAVE_KEY) === result.value)) {
      void bridgeRef.current?.send("VKWebAppStorageSet", { key: VK_SAVE_KEY, value: result.value }).catch(() => undefined);
    }
    return result;
  }, [applySave, getSaveCoordinator]);

  // Paused/native-ad time used to earn nothing: exclude it when resuming.
  useEffect(() => {
    if (paused || interstitialBusy || rewardBusy) { incomePauseRef.current = true; return; }
    if (!incomePauseRef.current) return;
    incomePauseRef.current = false;
    const now = Date.now();
    void commitSave((current) => ({ ...current, lastActiveAt: now, lastAutoTickAt: now })).catch(() => undefined);
  }, [paused, interstitialBusy, rewardBusy, commitSave]);

  useEffect(() => {
    if (!hydrated) return;
    const listener = (event: StorageEvent) => { if (event.key === SAVE_KEY || event.key === null) synchronizeSave(); };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, [hydrated, synchronizeSave]);

  const checkRewardAvailability = useCallback(async () => {
    if (!bridgeRef.current) return;
    try {
      const response = (await bridgeRef.current.send("VKWebAppCheckNativeAds", {
        ad_format: "reward",
      })) as { result?: boolean };
      setAdAvailable(response.result === true);
    } catch {
      setAdAvailable(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      let cloudSave: GameSave | null = null;
      try {
        await promiseWithTimeout(bridge.send("VKWebAppInit"), 1800);
        if (cancelled) return;
        bridgeRef.current = createVkBridge(bridge as unknown as VKBridge);
        setVkReady(true);
        try {
          void bridgeRef.current.send("VKWebAppSetViewSettings", {
            status_bar_style: "light",
            action_bar_color: "#2b211c",
            navigation_bar_color: "#2b211c",
          }).catch(() => undefined);
        } catch {
          // optional
        }
        try {
          void bridgeRef.current.send("VKWebAppGetUserInfo").then((user) => {
            if (!cancelled) setVkUser(user as VKUser);
          }).catch(() => undefined);
        } catch {
          // optional
        }
        try {
          const storage = (await bridgeRef.current.send("VKWebAppStorageGet", {
            keys: [VK_SAVE_KEY],
          })) as { keys?: Array<{ value: string }> };
          cloudSave = migrateSave(storage.keys?.[0]?.value);
        } catch {
          trackEvent("save_load_error", { source: "vk" });
        }
      } catch {
        bridgeRef.current = null;
        setVkReady(false);
      }
      if (cancelled) return;
      const raw = readStoredValue(SAVE_KEY);
      const loaded = selectNewestSave(migrateSave(raw), cloudSave) ?? createDefaultSave();
      getSaveCoordinator().initialize(raw, loaded);
      let offline = 0;
      await commitSave((current) => {
        const now = Date.now();
        offline = rewardIngotsAmount(current.ingots, applyOfflineIncome(current.upgrades, current.lastActiveAt, now).ingots);
        return grantIngots({ ...current, lastActiveAt: now, lastAutoTickAt: now }, offline);
      });
      if (offline > 0) setOfflineBanner(`Пока тебя не было, подмастерья наковали слитки: +${offline}`);
      setHydrated(true);
      trackEvent("app_open");
      void checkRewardAvailability();
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [commitSave, getSaveCoordinator, checkRewardAvailability, trackEvent]);

  useEffect(() => {
    const handler = (event: VKEvent) => {
      if (event.detail?.type === "VKWebAppViewHide") setPaused(true);
      if (event.detail?.type === "VKWebAppViewRestore") setPaused(false);
    };
    bridge.subscribe?.(handler);
    return () => bridge.unsubscribe?.(handler);
  }, []);

  useEffect(() => {
    if (!hydrated || paused) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      setHeat((value) => Math.max(0, value - 8));
      if (getAdPolicy().isBusy() || resetPendingRef.current) return;
      void commitSave((current) => {
        if (now - current.lastAutoTickAt < 1000) return null;
        const gained = applyElapsedAutoTick(current.upgrades, current.boost, current.lastAutoTickAt, now);
        return grantIngots({ ...current, lastActiveAt: now, lastAutoTickAt: now }, gained);
      }).catch(() => undefined);
    }, 1000);
    return () => window.clearInterval(id);
  }, [hydrated, paused, getAdPolicy, commitSave]);

  const maybeShowInterstitial = useCallback(async () => {
    const client = bridgeRef.current;
    if (!client || !started) return false;
    return attemptEconomyInterstitial(getAdPolicy(), "gorn", "craft-finished", {
      send: (method, params) => client.send(method, params),
      ready: vkReady,
      paused,
      phase: "idle",
    });
  }, [getAdPolicy, paused, started, vkReady]);

  const closeCraftPopup = () => {
    if (!craftPopup || paused || getAdPolicy().isBusy()) return;
    setCraftPopup(null);
    void maybeShowInterstitial();
  };

  const onTap = async () => {
    if (paused || getAdPolicy().isBusy() || resetPendingRef.current) return;
    getAdPolicy().startGameplay();
    let result = { gained: 0, crit: false, streak: 0 };
    await commitSave((current) => {
      result = applyTap(current.upgrades, current.boost, current.tapStreak);
      result.gained = rewardIngotsAmount(current.ingots, result.gained);
      const daily = refreshDaily(current.daily);
      return grantIngots({ ...current, lastActiveAt: Date.now(), tapStreak: result.streak,
        tutorialStep: current.tutorialDone ? current.tutorialStep : Math.max(1, current.tutorialStep),
        stats: { ...current.stats, taps: current.stats.taps + 1, crits: current.stats.crits + (result.crit ? 1 : 0), bestStreak: Math.max(current.stats.bestStreak, result.streak) },
        daily: { ...daily, tap: daily.tap + 1 },
      }, result.gained);
    });
    setHeat((value) => Math.min(100, value + (result.crit ? 18 : 10)));
    setFloatText(`+${result.gained}${result.crit ? " КРИТ!" : ""}`); setFloatCrit(result.crit);
    setHit(true); setCritHit(result.crit); setSparking(true);
    window.setTimeout(() => { setHit(false); setCritHit(false); setFloatText(null); setFloatCrit(false); setSparking(false); }, 220);
    playSound(result.crit ? "crit" : "tap");
    void bridgeRef.current?.send("VKWebAppTapticNotificationOccurred", { type: result.crit ? "success" : "warning" }).catch(() => undefined);
  };

  const buyUpgrade = async (key: UpgradeKey) => {
    if (paused || getAdPolicy().isBusy() || resetPendingRef.current) return;
    getAdPolicy().startGameplay();
    let reason = "Не хватает слитков или угля";
    const result = await commitSave((current) => {
      const level = current.upgrades[key];
      if (level >= MAX_UPGRADE_LEVEL) { reason = "Максимальный уровень улучшения"; return null; }
      const coalCost = getUpgradeCost(level), ingotCost = getUpgradeIngotCost(key, level);
      if (current.coal < coalCost || current.ingots < ingotCost) return null;
      const daily = refreshDaily(current.daily);
      return { ...current, coal: current.coal - coalCost, ingots: current.ingots - ingotCost,
        upgrades: { ...current.upgrades, [key]: level + 1 }, daily: { ...daily, upgrade: daily.upgrade + 1 }, tutorialDone: true, tutorialStep: 2, lastActiveAt: Date.now() };
    });
    if (!result.value) { setMessage(reason); playSound("error"); return; }
    playSound("buy"); trackEvent("upgrade_buy", { key });
  };

  const craft = async (id: RecipeId) => {
    if (paused || getAdPolicy().isBusy() || resetPendingRef.current) return;
    getAdPolicy().startGameplay();
    const result = await commitSave((current) => {
      const made = craftRecipe(id, current.ingots, current.stats.taps, current.crafted);
      if (!made.ok) return null;
      const daily = refreshDaily(current.daily);
      return { ...current, ingots: made.ingots, crafted: made.crafted, stats: { ...current.stats, crafted: current.stats.crafted + 1 },
        daily: { ...daily, craft: daily.craft + 1 }, tutorialDone: true, tutorialStep: 2, lastActiveAt: Date.now() };
    });
    if (!result.value) { setMessage("Рецепт недоступен или мало слитков"); playSound("error"); return; }
    setCraftPopup(id); playSound("buy");
  };

  const claimQuest = async (id: string) => {
    if (paused || getAdPolicy().isBusy() || resetPendingRef.current) return;
    const quest = DAILY_QUESTS.find((item) => item.id === id);
    if (!quest) return;
    await commitSave((current) => {
      const daily = refreshDaily(current.daily);
      if (daily.claimed.includes(id) || daily[quest.field] < quest.target) return null;
      return grantIngots({ ...current, coal: Math.min(9999, current.coal + (quest.reward.coal ?? 0)), daily: { ...daily, claimed: [...daily.claimed, id] }, lastActiveAt: Date.now() }, quest.reward.ingots ?? 0);
    });
  };

  const resetProgress = async () => {
    if (getAdPolicy().isBusy() || resetPendingRef.current) return;
    resetPendingRef.current = true;
    try {
      await commitSave((current) => { const fresh = createDefaultSave(); fresh.rewards = refreshRewards(current.rewards); return fresh; });
      setStarted(false); setCraftPopup(null); setOfflineBanner(null); setMessage("Прогресс сброшен");
    } finally { resetPendingRef.current = false; }
  };

  const watchRewardAd = async (kind: "boost" | "ingots") => {
    if (paused || getAdPolicy().isBusy() || resetPendingRef.current) return;
    const client = bridgeRef.current;
    const current = synchronizeSave();
    const fresh = refreshRewards(current.rewards);
    const result = await requestEconomyReward({
      policy: getAdPolicy(),
      send: (method, params) => client!.send(method, params),
      available: Boolean(client) && adAvailable,
      count: fresh.count,
      lastRewardAt: fresh.lastRewardAt,
      dailyLimit: REWARD_DAILY_LIMIT,
      cooldownMs: REWARD_COOLDOWN_MS,
      rewardValue: kind === "boost" ? 1 : rewardIngotsAmount(current.ingots),
      onBusyChange: setRewardBusy,
      onGranted: async (watchedAt, amount) => {
        let actualAmount = amount;
        await commitSave((saved) => {
          const quota = refreshRewards(saved.rewards);
          const next = { ...saved, rewards: { ...quota, count: quota.count + 1, lastRewardAt: watchedAt }, stats: { ...saved.stats, adsWatched: saved.stats.adsWatched + 1 }, lastActiveAt: watchedAt, lastAutoTickAt: watchedAt };
          if (kind === "boost") return { ...next, boost: grantBoost(watchedAt, 60_000, 2) };
          actualAmount = rewardIngotsAmount(saved.ingots, amount);
          return grantIngots(next, actualAmount);
        });
        if (kind === "boost") { setNowTick(watchedAt); setMessage("x2 к доходу на 60 секунд"); }
        else setMessage(actualAmount > 0 ? `Слитки за рекламу: +${actualAmount}` : "Запас слитков полон");
      },
    });
    if (result === "wait") setMessage("Подождите немного");
    if (result === "daily-limit") setMessage("Дневной лимит наград исчерпан");
    if (result === "no-value") setMessage("Запас слитков полон");
    if (result === "unavailable") setMessage("Реклама пока недоступна");
    void checkRewardAvailability();
  };

  if (!hydrated) {
    return (
      <div className="app-shell">
        <div className="loading-screen">ЗАГРУЗКА…</div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="app-shell">
        <div className="start-screen">
          <div className="start-hero">
            <div className="start-scene" aria-hidden>
              <div className="smoke" />
              <div className="glow" />
              <div className="ember a" />
              <div className="ember b" />
              <div className="ember c" />
              <div className="hammer-sil" />
              <div className="anvil-sil" />
            </div>
            <h1 className="start-brand">Горн</h1>
            <p className="start-tagline">Кузница — выкуй удачу!</p>
            <button type="button" className="start-play" onClick={() => setStarted(true)}>
              К горну
            </button>
            <div className="start-links">
              <Link href="/privacy/">Конфиденциальность</Link>
              <Link href="/terms/">Соглашение</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <fieldset disabled={interstitialBusy || rewardBusy} style={{ display: "contents" }}>
      <div className="game-frame">
        <header className="topbar">
          <div>
            <h1 className="brand-mini">Горн</h1>
            <p className="muted">{vkUser ? vkUser.first_name : vkReady ? "ВКонтакте" : "Локальная кузница"}</p>
          </div>
          <div className="economy">
            <span className="chip">🪙 {ingots}</span>
            <span className="chip">🪨 {coal}</span>
          </div>
        </header>

        {tab === "forge" && (
          <section className="panel">
            <div className="topbar" style={{ marginBottom: 8 }}>
              <h2 style={{ margin: 0 }}>Горн</h2>
              <button type="button" className="btn secondary" onClick={() => void commitSave((current) => ({ ...current, sound: !current.sound }))}>
                {sound ? "🔊" : "🔇"}
              </button>
            </div>
            {tutorialText && <div className="tutorial-banner">{tutorialText}</div>}

            <div className="hud-grid">
              <div className="hud-cell">
                <span>Удар</span>
                <strong>{getTapPower(upgrades)}</strong>
              </div>
              <div className="hud-cell">
                <span>Крит</span>
                <strong>{Math.round(getCritChance(upgrades) * 100)}%</strong>
              </div>
              <div className="hud-cell">
                <span>Авто</span>
                <strong>{getAutoIncome(upgrades)}/с</strong>
              </div>
            </div>

            {mult > 1 && boostLeftSec > 0 && (
              <div className="boost-pill">🔥 x{mult} ещё {boostLeftSec}с</div>
            )}

            <div className={`anvil-stage${heat > 40 ? " hot" : ""}${sparking ? " sparking" : ""}`}>
              <div className="stage-smoke" />
              <div className="heat-ring" />
              <div className="spark-burst s1" />
              <div className="spark-burst s2" />
              <div className="spark-burst s3" />
              <div className="spark-burst s4" />
              {floatText && <div className={`float-gain${floatCrit ? " crit-text" : ""}`}>{floatText}</div>}
              <button
                type="button"
                className={`anvil-btn${hit ? " hit" : ""}${critHit ? " crit" : ""}`}
                onPointerDown={onTap}
                aria-label="Ударить по наковальне"
              >
                🔨
              </button>
            </div>

            <div className="meter-label">
              <span>Серия · {tapStreak}</span>
              <span className="auto-pulse">
                {getAutoIncome(upgrades) > 0 ? (
                  <>
                    <i /> куёт
                  </>
                ) : (
                  "найми подмастерьев"
                )}
              </span>
            </div>
            <div className="streak-bar">
              <div className="streak-fill" style={{ width: `${streakPct}%` }} />
            </div>

            <div className="btn-row">
              <button type="button" className="btn" onClick={() => void watchRewardAd("boost")}>
                x2 на минуту за рекламу
              </button>
              <button type="button" className="btn secondary" disabled={rewardIngots === 0} onClick={() => void watchRewardAd("ingots")}>
                {rewardIngots > 0 ? `Слитки за рекламу: +${rewardIngots}` : "Запас слитков полон"}
              </button>
            </div>
          </section>
        )}

        {tab === "shop" && (
          <section className="panel">
            <h2>Цех</h2>
            <div className="list">
              {(Object.keys(UPGRADE_DATA) as UpgradeKey[]).map((key) => {
                const data = UPGRADE_DATA[key];
                const coalCost = getUpgradeCost(upgrades[key]);
                const ingotCost = getUpgradeIngotCost(key, upgrades[key]);
                return (
                  <div key={key} className="card">
                    <div>
                      <h3>
                        {data.icon} {data.title}
                        <span className="upgrade-level">ур. {upgrades[key]}</span>
                      </h3>
                      <p>
                        {data.description}. {data.bonus(upgrades[key])}
                      </p>
                    </div>
                    <button type="button" className="btn" disabled={upgrades[key] >= MAX_UPGRADE_LEVEL} onClick={() => buyUpgrade(key)}>
                      {upgrades[key] >= MAX_UPGRADE_LEVEL ? "Максимум" : `${ingotCost}🪙 / ${coalCost}🪨`}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "recipes" && (
          <section className="panel">
            <h2>Рецепты</h2>
            <p className="muted">Выковано видов: {recipes.done}/{recipes.total}</p>
            <div className="recipe-grid">
              {RECIPE_CATALOG.map((recipe) => {
                const count = crafted[recipe.id] ?? 0;
                const locked = stats.taps < recipe.unlockTaps;
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    className={`recipe-cell${locked && !count ? " locked" : ""}${count ? " owned" : ""}`}
                    disabled={locked}
                    onClick={() => craft(recipe.id)}
                  >
                    <span className="icon">{locked && !count ? "❔" : recipe.icon}</span>
                    {locked && !count ? "???" : recipe.name}
                    <div className="muted">{count > 0 ? `×${count}` : `${recipe.cost}🪙`}</div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {tab === "quests" && (
          <section className="panel">
            <h2>Задания</h2>
            <p className="muted">Обновляются каждый день · {daily.date}</p>
            <div className="list">
              {DAILY_QUESTS.map((quest) => {
                const progress = daily[quest.field];
                const claimed = daily.claimed.includes(quest.id);
                const ready = progress >= quest.target && !claimed;
                const pct = Math.min(100, Math.round((progress / quest.target) * 100));
                return (
                  <div key={quest.id} className="card">
                    <div style={{ flex: 1 }}>
                      <h3>{quest.title}</h3>
                      <p>
                        {quest.description} · {Math.min(progress, quest.target)}/{quest.target}
                      </p>
                      <div className="quest-bar">
                        <div className="quest-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <button type="button" className="btn" disabled={!ready} onClick={() => claimQuest(quest.id)}>
                      {claimed ? "Готово" : ready ? "Забрать" : "Ещё"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === "stats" && (
          <section className="panel">
            <h2>Итоги</h2>
            <div className="list">
              <div className="card"><span>Ударов</span><strong>{stats.taps}</strong></div>
              <div className="card"><span>Критов</span><strong>{stats.crits}</strong></div>
              <div className="card"><span>Выковано</span><strong>{stats.crafted}</strong></div>
              <div className="card"><span>Слитков всего</span><strong>{stats.ingotsEarned}</strong></div>
              <div className="card"><span>Серия ударов</span><strong>{stats.bestStreak}</strong></div>
              <div className="card"><span>Рекламы</span><strong>{stats.adsWatched}</strong></div>
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn secondary"
                onClick={() => void bridgeRef.current?.send("VKWebAppShare", { link: VK_APP_URL })}
              >
                Поделиться
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={resetProgress}
              >
                Сбросить прогресс
              </button>
            </div>
            <div className="footer-legal">
              <Link href="/privacy/">Конфиденциальность</Link>
              <Link href="/terms/">Соглашение</Link>
            </div>
          </section>
        )}
      </div>

      <nav className="tabs" aria-label="Разделы">
        {(
          [
            ["forge", "Горн"],
            ["shop", "Цех"],
            ["recipes", "Рецепты"],
            ["quests", "Задания"],
            ["stats", "Итоги"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={`tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {craftPopup && (
        <div className="overlay craft-overlay" onClick={closeCraftPopup}>
          <div className="overlay-card" onClick={(event) => event.stopPropagation()}>
            <div className="craft-icon">
              {RECIPE_CATALOG.find((item) => item.id === craftPopup)?.icon ?? "⚒️"}
            </div>
            <h3>Выковано!</h3>
            <p>
              <strong>{RECIPE_CATALOG.find((item) => item.id === craftPopup)?.name}</strong>
              <br />
              Изделие добавлено в коллекцию кузницы.
            </p>
            <button type="button" className="btn" onClick={closeCraftPopup}>
              В цех
            </button>
          </div>
        </div>
      )}

      {(message || offlineBanner) && (
        <div
          className="overlay"
          onClick={() => {
            setMessage(null);
            setOfflineBanner(null);
          }}
        >
          <div
            className="overlay-card"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>Горн</h3>
            <p>{message ?? offlineBanner}</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setMessage(null);
                setOfflineBanner(null);
              }}
            >
              Понятно
            </button>
          </div>
        </div>
      )}
      </fieldset>
    </div>
  );
}
