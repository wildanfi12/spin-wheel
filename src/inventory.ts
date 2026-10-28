import type { Prize, Spin } from "./model";
import { getWibDate } from "./timezone";

export const INVENTORY_POLICY = "daily-spin-ledger-v1" as const;

export const DAILY_STOCK_LIMITS: Record<string, number> = {
  tws: 3,
  shirt: 10,
  umbrella: 8,
  cable: 5,
  earphone: 20,
  discount: 50,
};

export interface DailyInventoryRow {
  id: string;
  name: string;
  sku?: string;
  limit: number;
  issued: number;
  remaining: number;
  /** Chance of this prize on the next spin, as a percentage. */
  probability: number;
  enabled: boolean;
}

type SpinLedgerEntry = Pick<Spin, "prizeId" | "status" | "dateWib" | "at">;

export function countIssuedToday(
  spins: readonly SpinLedgerEntry[],
  dateWib = getWibDate(),
  prizeId?: string,
): number {
  return spins.filter((spin) => {
    const spinDate = spin.dateWib || getWibDate(spin.at);
    return (
      spin.status !== "Voided" &&
      spinDate === dateWib &&
      (!prizeId || spin.prizeId === prizeId)
    );
  }).length;
}

export function remainingDailyStock(
  spins: readonly SpinLedgerEntry[],
  prizeId: string,
  dateWib = getWibDate(),
): number {
  const limit = DAILY_STOCK_LIMITS[prizeId] ?? 0;
  return Math.max(0, limit - countIssuedToday(spins, dateWib, prizeId));
}

export function getDailyInventory(
  prizes: readonly Pick<Prize, "id" | "name" | "sku" | "enabled">[],
  spins: readonly SpinLedgerEntry[],
  dateWib = getWibDate(),
): DailyInventoryRow[] {
  const rows = prizes.flatMap((prize) => {
    const limit = DAILY_STOCK_LIMITS[prize.id];
    if (limit === undefined) return [];
    const issued = countIssuedToday(spins, dateWib, prize.id);
    return [{
      id: prize.id,
      name: prize.name,
      sku: prize.sku,
      limit,
      issued,
      remaining: Math.max(0, limit - issued),
      probability: 0,
      enabled: prize.enabled,
    }];
  });
  const totalWeight = rows.reduce(
    (sum, row) => sum + (row.enabled ? row.remaining : 0),
    0,
  );
  return rows.map((row) => ({
    ...row,
    probability:
      row.enabled && totalWeight > 0 ? (row.remaining / totalWeight) * 100 : 0,
  }));
}
