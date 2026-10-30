import { openDB } from "idb";
import { initial, validate, type State } from "./model";
import { DAILY_STOCK_LIMITS } from "./inventory";
import { HISTORY_START_DATE, launchPeriodSpins } from "./history";

const db = openDB("howell-booth", 1, {
  upgrade(db) {
    db.createObjectStore("app");
  },
});

function migratedState(source: Partial<State> | undefined): State {
  const defaults = initial();
  if (!source) return defaults;

  const oldPrizes = Array.isArray(source.prizes) ? source.prizes : [];
  // This application began operating on 29 October 2026. Remove earlier
  // development/test rows from the local production ledger during migration.
  const spins = launchPeriodSpins(Array.isArray(source.spins) ? source.spins : []);
  const oldSession = source.session;
  const session = oldSession?.id ? oldSession : defaults.session;
  const prizes = defaults.prizes.map((base) => {
    const old = oldPrizes.find((prize) => prize.id === base.id);
    return {
      ...base,
      enabled: typeof old?.enabled === "boolean" ? old.enabled : base.enabled,
      // Normalize legacy weighting metadata while preserving user enablement.
      weight: DAILY_STOCK_LIMITS[base.id] ?? base.weight,
      stock: DAILY_STOCK_LIMITS[base.id] ?? base.stock,
    };
  });

  // Keep removed prize metadata only while a saved, unfinished result still needs
  // its original wheel segments to render. Historical rows remain in `spins`.
  const pending = spins.find(
    (spin) => spin.id === session.spinId && spin.status !== "Voided",
  );
  if (pending) {
    const activeIds = new Set(defaults.segments);
    const oldById = new Map(oldPrizes.map((prize) => [prize.id, prize]));
    for (const id of pending.segments) {
      if (activeIds.has(id)) continue;
      const oldPrize = oldById.get(id);
      if (oldPrize) {
        prizes.push({ ...oldPrize, stock: 0, enabled: false });
      } else if (pending.prizeId === id) {
        prizes.push({
          id,
          name: pending.prizeName,
          description: "Hadiah dari riwayat putaran sebelumnya.",
          stock: 0,
          enabled: false,
          weight: 1,
          image: pending.image,
          icon: pending.icon,
        });
      }
    }
  }

  return {
    ...defaults,
    ...source,
    prizes,
    segments: [...defaults.segments],
    spins,
    session,
    settings: { ...defaults.settings, ...(source.settings || {}) },
    dailyTwsClaims: Object.fromEntries(
      Object.entries(source.dailyTwsClaims || {}).filter(([date]) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? date >= HISTORY_START_DATE
          : true,
      ),
    ),
  };
}

export async function mutate(fn: (s: State) => void) {
  const d = await db;
  const tx = d.transaction("app", "readwrite");
  const stored = (await tx.store.get("state")) as Partial<State> | undefined;
  const s = migratedState(stored);

  try {
    fn(s);
    validate(s);
    await tx.store.put(s, "state");
    await tx.done;
    return s;
  } catch (e) {
    tx.abort();
    await tx.done.catch(() => {});
    throw e;
  }
}

export const read = () => mutate(() => {});
export const restore = (s: State) => {
  validate(s);
  const migrated = migratedState(s);
  return mutate((old) => Object.assign(old, migrated));
};
