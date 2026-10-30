import { DAILY_STOCK_LIMITS } from "./inventory";

export type Prize = {
  id: string;
  name: string;
  description: string;
  stock: number;
  enabled: boolean;
  weight: number;
  image: string;
  icon: string;
  sku?: string;
  wheelLines?: string[];
};

export type Spin = {
  id: string;
  sessionId: string;
  prizeId: string;
  prizeName: string;
  sku?: string;
  image: string;
  icon: string;
  code: string;
  at: string;
  status: "Won" | "Pending Claim" | "Claimed" | "Voided";
  segment: number;
  segments: string[];
  rotation: number;
  events: { at: string; action: string }[];
  dateWib?: string;
  /** True when a lost historical row was reconstructed from operator confirmation. */
  reconstructed?: boolean;
};

export type State = {
  version: 1;
  prizes: Prize[];
  segments: string[];
  spins: Spin[];
  dailyTwsClaims?: Record<string, { spinId: string; wonAt: string; code: string }>;
  session: { id: string; spinId?: string };
  settings: {
    headline: string;
    subtitle: string;
    terms: string;
    expiry: string;
    logo: string;
    volume: number;
    kiosk: boolean;
  };
};

export const initial = (): State => ({
  version: 1,
  prizes: [
    {
      id: "tws",
      name: "TWS HW01",
      sku: "HW01",
      description: "TWS Howell HW01.",
      icon: "trophy",
      stock: DAILY_STOCK_LIMITS.tws,
      enabled: true,
      weight: DAILY_STOCK_LIMITS.tws,
      image: `${import.meta.env.BASE_URL}assets/tws-howell.png`,
      wheelLines: ["TWS", "HW01"],
    },
    {
      id: "shirt",
      name: "KAOS HOWELL",
      description: "Kaos eksklusif resmi HOWELL.",
      icon: "shirt",
      stock: DAILY_STOCK_LIMITS.shirt,
      enabled: true,
      weight: DAILY_STOCK_LIMITS.shirt,
      image: `${import.meta.env.BASE_URL}assets/baju-howell.png`,
      wheelLines: ["KAOS", "HOWELL"],
    },
    {
      id: "umbrella",
      name: "PAYUNG HOWELL",
      description: "Payung eksklusif HOWELL.",
      icon: "umbrella",
      stock: DAILY_STOCK_LIMITS.umbrella,
      enabled: true,
      weight: DAILY_STOCK_LIMITS.umbrella,
      image: `${import.meta.env.BASE_URL}assets/payung-howell.png`,
      wheelLines: ["PAYUNG", "HOWELL"],
    },
    {
      id: "cable",
      name: "KABEL DATA 4 IN 1",
      sku: "AC01",
      description: "Kabel data Howell 4 in 1.",
      icon: "cable",
      stock: DAILY_STOCK_LIMITS.cable,
      enabled: true,
      weight: DAILY_STOCK_LIMITS.cable,
      image: `${import.meta.env.BASE_URL}assets/kabel-data-4in1.png`,
      wheelLines: ["KABEL DATA", "4 IN 1"],
    },
    {
      id: "earphone",
      name: "EARPHONE HW03",
      sku: "HW03",
      description: "Earphone Howell HW03.",
      icon: "headphones",
      stock: DAILY_STOCK_LIMITS.earphone,
      enabled: true,
      weight: DAILY_STOCK_LIMITS.earphone,
      image: `${import.meta.env.BASE_URL}assets/earphone.png`,
      wheelLines: ["EARPHONE", "HW03"],
    },
    {
      id: "discount",
      name: "VOUCHER DISKON 20%",
      description: "Voucher diskon 20% produk HOWELL.",
      icon: "ticket",
      stock: DAILY_STOCK_LIMITS.discount,
      enabled: true,
      weight: DAILY_STOCK_LIMITS.discount,
      image: `${import.meta.env.BASE_URL}assets/voucher-diskon-20.png`,
      wheelLines: ["VOUCHER", "DISKON 20%"],
    },
  ],
  segments: [
    "tws",
    "shirt",
    "umbrella",
    "cable",
    "earphone",
    "discount",
  ],
  spins: [],
  dailyTwsClaims: {},
  session: { id: crypto.randomUUID() },
  settings: {
    headline: "HOWELL SPIN & WIN",
    subtitle: "PUTAR RODANYA, MENANGKAN HADIAHNYA!",
    terms:
      "Diskon 20% untuk pembelian produk HOWELL. Ketentuan promosi dikonfirmasi petugas booth. Tidak dapat diuangkan.",
    expiry: "Selama INDOCOMTECH 2026",
    logo: "",
    volume: 0.25,
    kiosk: false,
  },
});

export function validate(s: State) {
  if (
    s?.version !== 1 ||
    !Array.isArray(s.prizes) ||
    !Array.isArray(s.segments) ||
    !Array.isArray(s.spins) ||
    !s.session?.id ||
    !s.settings
  )
    throw Error("Format backup tidak valid.");
  if (
    s.prizes.length > 50 ||
    s.segments.length < 2 ||
    s.segments.length > 20 ||
    new Set(s.prizes.map((p) => p.id)).size !== s.prizes.length
  )
    throw Error("Gunakan 2–20 segmen dan ID hadiah unik.");
  for (const p of s.prizes)
    if (
      !p.id ||
      !p.name?.trim() ||
      !Number.isSafeInteger(p.stock) ||
      p.stock < 0 ||
      !Number.isFinite(p.weight) ||
      p.weight <= 0 ||
      p.weight > 100000 ||
      typeof p.enabled !== "boolean" ||
      typeof p.image !== "string" ||
      !safeImage(p.image)
    )
      throw Error("Konfigurasi hadiah tidak valid.");
  for (const id of s.segments)
    if (!s.prizes.some((p) => p.id === id))
      throw Error("ID segmen tidak terdaftar pada hadiah.");
  const seenSpins = new Set<string>();
  for (const r of s.spins) {
    if (
      !r.id ||
      !r.sessionId ||
      !r.prizeId ||
      !r.prizeName ||
      !r.code ||
      !r.at ||
      !Number.isSafeInteger(r.segment) ||
      r.segment < 0 ||
      !Array.isArray(r.segments) ||
      !["Won", "Pending Claim", "Claimed", "Voided"].includes(r.status) ||
      seenSpins.has(r.id)
    )
      throw Error("Riwayat putaran korup.");
    seenSpins.add(r.id);
  }
}

export function powerDuration(power: number): number {
  const p = Math.max(0, Math.min(1, power));
  return 5500 + p * 1500;
}

export function powerRotationFor(
  index: number,
  count: number,
  from = 0,
  power = 1,
) {
  const p = Math.max(0, Math.min(1, power));
  const minTurns = 5;
  const maxTurns = 9;
  const turns = Math.round(minTurns + p * (maxTurns - minTurns));
  const segmentAngle = 360 / count;
  const targetOffset = (360 - index * segmentAngle) % 360;
  const currentOffset = ((from % 360) + 360) % 360;
  let delta = targetOffset - currentOffset;
  if (delta < 0) delta += 360;
  return from + turns * 360 + delta;
}

function safeImage(v: string) {
  if (!v) return true;
  if (
    v.startsWith(import.meta.env.BASE_URL) ||
    v.startsWith("http://") ||
    v.startsWith("https://") ||
    v.startsWith("assets/") ||
    v.startsWith("/assets/") ||
    v.startsWith("/spin-wheel/assets/")
  )
    return true;
  return /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v);
}
