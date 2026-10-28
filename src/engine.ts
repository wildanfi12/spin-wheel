import type { State, Spin } from "./model";
import { getWibDate } from "./timezone";
import { DAILY_STOCK_LIMITS, remainingDailyStock } from "./inventory";

export function isTwsAvailableForDate(
  s: State,
  dateWib: string = getWibDate(),
): boolean {
  const tws = s.prizes.find((p) => p.id === "tws");
  if (!tws || !tws.enabled || remainingDailyStock(s.spins, "tws", dateWib) <= 0) {
    return false;
  }
  return true;
}

export const available = (s: State, now: Date = new Date()) => {
  const dateWib = getWibDate(now);
  return s.segments.filter((id) => {
    const prize = s.prizes.find((p) => p.id === id);
    return !!prize?.enabled && remainingDailyStock(s.spins, id, dateWib) > 0;
  });
};

export function select(s: State, random: number, now: Date = new Date()) {
  const dateWib = getWibDate(now);
  const segments = s.segments;

  if (random < 0 || random >= 1 || !Number.isFinite(random))
    throw Error("Nilai acak tidak valid.");

  // Eligibility is based on the dated spin ledger, so every prize resets at 00:00 WIB.
  const eligiblePrizes = s.prizes.filter((p) => {
    if (!segments.includes(p.id) || !p.enabled) return false;
    if (remainingDailyStock(s.spins, p.id, dateWib) <= 0) return false;
    return true;
  });

  if (!eligiblePrizes.length) throw Error("Semua hadiah habis. Hubungi petugas.");

  // Fixed daily quotas are the weights. Issued count does not reduce a prize's
  // weight; once its quota is exhausted it leaves the candidate pool entirely.
  // `random` comes from crypto.getRandomValues in the production spin API.
  const prizeWeights = eligiblePrizes.map((prize) => ({
    prize,
    weight: DAILY_STOCK_LIMITS[prize.id] ?? 0,
  }));
  const totalWeight = prizeWeights.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = random * totalWeight;
  let selectedPrize = prizeWeights[prizeWeights.length - 1].prize;

  for (const entry of prizeWeights) {
    cursor -= entry.weight;
    if (cursor < 0) {
      selectedPrize = entry.prize;
      break;
    }
  }

  // Find the matching active sector on the six-sector wheel
  const matchingIndices: number[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === selectedPrize.id) {
      matchingIndices.push(i);
    }
  }

  if (!matchingIndices.length) {
    throw Error(`Segmen untuk hadiah ${selectedPrize.name} tidak ditemukan pada roda.`);
  }

  // Use independent entropy for the sector when a prize appears more than once.
  const subRandom = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  const chosenIndex = matchingIndices[Math.floor(subRandom * matchingIndices.length)];

  return {
    segments,
    index: chosenIndex,
  };
}

export const rotationFor = (index: number, count: number, from = 0) =>
  from +
  2160 +
  ((((360 - (index * 360) / count - (from % 360)) % 360) + 360) % 360);

export const pointerIndex = (rotation: number, count: number) =>
  Math.round(((360 - (rotation % 360)) % 360) / (360 / count)) % count;

export function nearestAvailableIndex(
  s: State,
  desired: number,
  now: Date = new Date(),
) {
  const eligible = new Set(available(s, now));
  if (!eligible.size) throw Error("Semua hadiah habis. Hubungi petugas.");
  const count = s.segments.length;
  for (let distance = 0; distance < count; distance++) {
    const clockwise = (desired + distance) % count;
    if (eligible.has(s.segments[clockwise])) return clockwise;
    const counterClockwise = (desired - distance + count) % count;
    if (eligible.has(s.segments[counterClockwise])) return counterClockwise;
  }
  throw Error("Segmen hadiah tidak tersedia.");
}

function reserveIndex(s: State, index: number, now: Date = new Date()): Spin {
  if (s.session.spinId)
    throw Error(
      "Sesi ini sudah diputar. Selesaikan hasil sebelumnya untuk melanjutkan.",
    );
  const segments = s.segments;
  if (!Number.isSafeInteger(index) || index < 0 || index >= segments.length)
    throw Error("Segmen hadiah tidak valid.");
  const p = s.prizes.find((p) => p.id === segments[index])!;
  const dateWib = getWibDate(now);
  if (!p?.enabled || remainingDailyStock(s.spins, p.id, dateWib) <= 0)
    throw Error("Hadiah pada segmen ini habis untuk hari ini.");

  const at = now.toISOString();
  const next =
    Math.max(
      s.spins.length,
      ...s.spins.map((r) =>
        /^HW-\d{6,9}$/.test(r.code) ? Number(r.code.slice(3)) : 0,
      ),
    ) + 1;
  const code = "HW-" + String(next).padStart(6, "0");
  const r: Spin = {
    id: crypto.randomUUID(),
    sessionId: s.session.id,
    prizeId: p.id,
    prizeName: p.name,
    sku: p.sku,
    image: p.image,
    icon: p.icon,
    code,
    at,
    status: "Won",
    segment: index,
    segments,
    rotation: rotationFor(index, segments.length),
    events: [{ at, action: "Won: stok dikurangi" }],
    dateWib,
  };

  s.spins.push(r);
  s.session.spinId = r.id;
  return r;
}

export function reserve(s: State, random: number, now: Date = new Date()): Spin {
  return reserveIndex(s, select(s, random, now).index, now);
}

/** Simulate a wheel result without mutating the operational state or ledger. */
export function previewSpin(s: State, random: number, now: Date = new Date()): Spin {
  // Reuse immutable catalog/config references; cloning State also cloned the
  // entire cross-day history before immediately discarding it, causing delay.
  const simulation: State = {
    ...s,
    spins: [],
    session: { id: crypto.randomUUID() },
  };
  return reserve(simulation, random, now);
}

export function reserveAt(s: State, index: number, now: Date = new Date()): Spin {
  return reserveIndex(s, index, now);
}

export function transition(
  s: State,
  id: string,
  status: Spin["status"],
  reason = "",
) {
  const r = s.spins.find((x) => x.id === id);
  if (!r) throw Error("Hasil tidak ditemukan.");
  if (status === "Pending Claim" && r.status === "Won") r.status = status;
  else if (status === "Claimed" && r.status === "Pending Claim")
    r.status = status;
  else if (
    status === "Voided" &&
    ["Won", "Pending Claim"].includes(r.status) &&
    reason.trim()
  ) {
    r.status = status;
  } else throw Error("Perubahan status tidak diizinkan atau sudah dilakukan.");
  r.events.push({
    at: new Date().toISOString(),
    action: status + (reason ? ": " + reason : ""),
  });
}
