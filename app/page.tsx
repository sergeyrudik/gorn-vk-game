"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import bridge from "@vkontakte/vk-bridge";
import Link from "next/link";
import {
  RECIPE_CATALOG,
  UPGRADE_DATA,
  applyAutoTick,
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
const INTERSTITIAL_INTERVAL_MS = 3 * 60 * 1000;
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
  const [rewards, setRewards] = useState(createDefaultSave().rewards);
  const [boost, setBoost] = useState<BoostState>({ multiplier: 1, expiresAt: 0 });
  const [tapStreak, setTapStreak] = useState(0);
  const [nowTick, setNowTick] = useState(0);

  const bridgeRef = useRef<VKBridge | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastInterstitialRef = useRef(0);
  const upgradesRef = useRef(upgrades);
  const boostRef = useRef(boost);

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

  useEffect(() => {
    upgradesRef.current = upgrades;
  }, [upgrades]);
  useEffect(() => {
    boostRef.current = boost;
  }, [boost]);

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

    const offline = applyOfflineIncome(save.upgrades, save.lastActiveAt);
    if (offline.ingots > 0) {
      setIngots((value) => value + offline.ingots);
      setStats((prev) => ({ ...prev, ingotsEarned: prev.ingotsEarned + offline.ingots }));
      setOfflineBanner(`Пока тебя не было, подмастерья наковали +${offline.ingots} слитков`);
    }
  }, []);

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
      const localSave = migrateSave(localStorage.getItem(SAVE_KEY));
      let cloudSave: GameSave | null = null;
      try {
        await promiseWithTimeout(bridge.send("VKWebAppInit"), 1800);
        if (cancelled) return;
        bridgeRef.current = bridge as unknown as VKBridge;
        setVkReady(true);
        try {
          await bridgeRef.current.send("VKWebAppSetViewSettings", {
            status_bar_style: "light",
            action_bar_color: "#2b211c",
            navigation_bar_color: "#2b211c",
          });
        } catch {
          // optional
        }
        try {
          const user = (await bridgeRef.current.send("VKWebAppGetUserInfo")) as VKUser;
          setVkUser(user);
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
      applySave(selectNewestSave(localSave, cloudSave) ?? createDefaultSave());
      setHydrated(true);
      trackEvent("app_open");
      void checkRewardAvailability();
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [applySave, checkRewardAvailability, trackEvent]);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      const save: GameSave = {
        version: 1,
        updatedAt: Date.now(),
        ingots,
        coal,
        upgrades,
        crafted,
        sound,
        tutorialDone,
        tutorialStep,
        stats,
        daily,
        rewards,
        lastActiveAt: Date.now(),
        boost,
        tapStreak,
      };
      const value = serializeSave(save);
      try {
        localStorage.setItem(SAVE_KEY, value);
      } catch {
        trackEvent("save_write_error", { source: "local" });
      }
      if (bridgeRef.current) {
        void bridgeRef.current
          .send("VKWebAppStorageSet", { key: VK_SAVE_KEY, value })
          .catch(() => trackEvent("save_write_error", { source: "vk" }));
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [
    hydrated,
    ingots,
    coal,
    upgrades,
    crafted,
    sound,
    tutorialDone,
    tutorialStep,
    stats,
    daily,
    rewards,
    boost,
    tapStreak,
    trackEvent,
  ]);

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
      const gained = applyAutoTick(upgradesRef.current, boostRef.current, 1, now);
      if (gained > 0) {
        setIngots((value) => value + gained);
        setStats((prev) => ({ ...prev, ingotsEarned: prev.ingotsEarned + gained }));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [hydrated, paused]);

  const maybeShowInterstitial = useCallback(async () => {
    if (!bridgeRef.current) return;
    const now = Date.now();
    if (now - lastInterstitialRef.current < INTERSTITIAL_INTERVAL_MS) return;
    try {
      const check = (await bridgeRef.current.send("VKWebAppCheckNativeAds", {
        ad_format: "interstitial",
      })) as { result?: boolean };
      if (!check.result) return;
      await bridgeRef.current.send("VKWebAppShowNativeAds", { ad_format: "interstitial" });
      lastInterstitialRef.current = now;
    } catch {
      // optional
    }
  }, []);

  const onTap = () => {
    if (paused) return;
    const result = applyTap(upgrades, boost, tapStreak);
    setIngots((value) => value + result.gained);
    setTapStreak(result.streak);
    setHeat((value) => Math.min(100, value + (result.crit ? 18 : 10)));
    setStats((prev) => ({
      ...prev,
      taps: prev.taps + 1,
      crits: prev.crits + (result.crit ? 1 : 0),
      ingotsEarned: prev.ingotsEarned + result.gained,
      bestStreak: Math.max(prev.bestStreak, result.streak),
    }));
    setDaily((prev) => {
      const fresh = refreshDaily(prev);
      return { ...fresh, tap: fresh.tap + 1 };
    });
    setFloatText(`+${result.gained}${result.crit ? " КРИТ!" : ""}`);
    setFloatCrit(result.crit);
    setHit(true);
    setCritHit(result.crit);
    setSparking(true);
    window.setTimeout(() => {
      setHit(false);
      setCritHit(false);
      setFloatText(null);
      setFloatCrit(false);
      setSparking(false);
    }, 220);
    playSound(result.crit ? "crit" : "tap");
    if (!tutorialDone && tutorialStep === 0) setTutorialStep(1);
    void bridgeRef.current
      ?.send("VKWebAppTapticNotificationOccurred", { type: result.crit ? "success" : "warning" })
      .catch(() => undefined);
  };

  const buyUpgrade = (key: UpgradeKey) => {
    const coalCost = getUpgradeCost(upgrades[key]);
    const ingotCost = getUpgradeIngotCost(key, upgrades[key]);
    if (coal < coalCost || ingots < ingotCost) {
      setMessage("Не хватает слитков или угля");
      playSound("error");
      return;
    }
    setCoal((value) => value - coalCost);
    setIngots((value) => value - ingotCost);
    setUpgrades((prev) => ({ ...prev, [key]: prev[key] + 1 }));
    setDaily((prev) => {
      const fresh = refreshDaily(prev);
      return { ...fresh, upgrade: fresh.upgrade + 1 };
    });
    playSound("buy");
    if (!tutorialDone) {
      setTutorialStep(2);
      setTutorialDone(true);
    }
    trackEvent("upgrade_buy", { key });
  };

  const craft = (id: RecipeId) => {
    const result = craftRecipe(id, ingots, stats.taps, crafted);
    if (!result.ok) {
      setMessage("Рецепт недоступен или мало слитков");
      playSound("error");
      return;
    }
    setIngots(result.ingots);
    setCrafted(result.crafted);
    setStats((prev) => ({ ...prev, crafted: prev.crafted + 1 }));
    setDaily((prev) => {
      const fresh = refreshDaily(prev);
      return { ...fresh, craft: fresh.craft + 1 };
    });
    setCraftPopup(id);
    playSound("buy");
    if (!tutorialDone) {
      setTutorialStep(2);
      setTutorialDone(true);
    }
    void maybeShowInterstitial();
  };

  const claimQuest = (id: string) => {
    const quest = DAILY_QUESTS.find((item) => item.id === id);
    if (!quest) return;
    const fresh = refreshDaily(daily);
    if (fresh.claimed.includes(id) || fresh[quest.field] < quest.target) return;
    setDaily({ ...fresh, claimed: [...fresh.claimed, id] });
    if (quest.reward.ingots) setIngots((value) => value + quest.reward.ingots!);
    if (quest.reward.coal) setCoal((value) => value + quest.reward.coal!);
  };

  const watchRewardAd = async (kind: "boost" | "ingots") => {
    const fresh = refreshRewards(rewards);
    const now = Date.now();
    if (fresh.count >= REWARD_DAILY_LIMIT) {
      setMessage("Дневной лимит наград исчерпан");
      return;
    }
    if (now - fresh.lastRewardAt < REWARD_COOLDOWN_MS) {
      setMessage("Подождите немного");
      return;
    }
    if (bridgeRef.current && adAvailable) {
      try {
        const response = (await bridgeRef.current.send("VKWebAppShowNativeAds", {
          ad_format: "reward",
        })) as { result?: boolean };
        if (!response.result) {
          setMessage("Реклама недоступна");
          return;
        }
      } catch {
        setMessage("Не удалось показать рекламу");
        return;
      }
    }
    setRewards({ date: fresh.date, count: fresh.count + 1, lastRewardAt: now });
    setStats((prev) => ({ ...prev, adsWatched: prev.adsWatched + 1 }));
    if (kind === "boost") {
      setBoost(grantBoost(now, 60_000, 2));
      setMessage("x2 к доходу на 60 секунд");
    } else {
      setIngots((value) => value + 100);
      setMessage("+100 слитков");
    }
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
            <p className="start-tagline">Кузница — вкуй удачу!</p>
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
              <button type="button" className="btn secondary" onClick={() => setSound((value) => !value)}>
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
              <button type="button" className="btn secondary" onClick={() => void watchRewardAd("ingots")}>
                +100 слитков за рекламу
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
                    <button type="button" className="btn" onClick={() => buyUpgrade(key)}>
                      {ingotCost}🪙 / {coalCost}🪨
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
                onClick={() => {
                  applySave(createDefaultSave());
                  setStarted(false);
                  setOfflineBanner(null);
                  setMessage("Прогресс сброшен");
                }}
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
        <div className="overlay craft-overlay" onClick={() => setCraftPopup(null)}>
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
            <button type="button" className="btn" onClick={() => setCraftPopup(null)}>
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
    </div>
  );
}
