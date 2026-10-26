import type { State, Spin } from "./model";
import { getWibDate } from "./timezone";

export function isTwsAvailableForDate(
  s: State,
  dateWib: string = getWibDate(),
): boolean {
  // Check unique daily constraint
  if (s.dailyTwsClaims && s.dailyTwsClaims[dateWib]) {
    return false;
  }
  // Check spins history for that date
  const claimedToday = s.spins.some(
    (spin) =>
      spin.prizeId === "tws" &&
      spin.status !== "Voided" &&
      (spin.dateWib === dateWib || getWibDate(new Date(spin.at)) === dateWib),
  );
  if (claimedToday) {
    return false;
  }
  const tws = s.prizes.find((p) => p.id === "tws");
  if (!tws || !tws.enabled || tws.stock <= 0) {
    return false;
  }
  return true;
}

export const available = (s: State, now: Date = new Date()) => {
  const dateWib = getWibDate(now);
  const twsAvailable = isTwsAvailableForDate(s, dateWib);
  return s.segments.filter((id) => {
    if (id === "tws" && !twsAvailable) return false;
    return s.prizes.some((p) => p.id === id && p.enabled && p.stock > 0);
  });
};

export function select(s: State, random: number, now: Date = new Date()) {
  const dateWib = getWibDate(now);
  const twsAvailable = isTwsAvailableForDate(s, dateWib);
  const segments = s.segments;

  if (random < 0 || random >= 1 || !Number.isFinite(random))
    throw Error("Nilai acak tidak valid.");

  // Filter eligible prizes based on stock, enabled, and daily TWS quota
  const eligiblePrizes = s.prizes.filter((p) => {
    if (!p.enabled || p.stock <= 0) return false;
    if (p.id === "tws" && !twsAvailable) return false;
    return true;
  });

  if (!eligiblePrizes.length) throw Error("Semua hadiah habis. Hubungi petugas.");

  // Proportional weight distribution: sum of eligible weights
  const totalWeight = eligiblePrizes.reduce((sum, p) => sum + p.weight, 0);
  let cursor = random * totalWeight;
  let selectedPrize = eligiblePrizes[eligiblePrizes.length - 1];

  for (const p of eligiblePrizes) {
    cursor -= p.weight;
    if (cursor < 0) {
      selectedPrize = p;
      break;
    }
  }

  // Find corresponding sectors on the 12-sector wheel
  const matchingIndices: number[] = [];
  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === selectedPrize.id) {
      matchingIndices.push(i);
    }
  }

  if (!matchingIndices.length) {
    throw Error(`Segmen untuk hadiah ${selectedPrize.name} tidak ditemukan pada roda.`);
  }

  // Pick deterministically or evenly across matching sectors
  const subRandom = (random * 1000000) % 1;
  const chosenIndex =
    matchingIndices[Math.floor(subRandom * matchingIndices.length)];

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
  if (!p?.enabled || p.stock <= 0) throw Error("Hadiah pada segmen ini habis.");

  const at = now.toISOString();
  const dateWib = getWibDate(now);

  if (p.id === "tws") {
    if (!isTwsAvailableForDate(s, dateWib)) {
      throw Error(
        `Kuota harian TWS HW01 untuk tanggal ${dateWib} WIB sudah habis.`,
      );
    }
  }

  p.stock--;
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

  if (p.id === "tws") {
    s.dailyTwsClaims = s.dailyTwsClaims || {};
    s.dailyTwsClaims[dateWib] = {
      spinId: r.id,
      wonAt: at,
      code: r.code,
    };
  }

  s.spins.push(r);
  s.session.spinId = r.id;
  return r;
}

export function reserve(s: State, random: number, now: Date = new Date()): Spin {
  return reserveIndex(s, select(s, random, now).index, now);
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
    const p = s.prizes.find((p) => p.id === r.prizeId);
    if (!p) throw Error("Hadiah tidak ditemukan.");
    p.stock++;
    r.status = status;
    if (r.prizeId === "tws" && r.dateWib && s.dailyTwsClaims) {
      delete s.dailyTwsClaims[r.dateWib];
    }
  } else throw Error("Perubahan status tidak diizinkan atau sudah dilakukan.");
  r.events.push({
    at: new Date().toISOString(),
    action: status + (reason ? ": " + reason : ""),
  });
}
