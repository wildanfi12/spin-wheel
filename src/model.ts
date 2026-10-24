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
};
export type State = {
  version: 1;
  prizes: Prize[];
  segments: string[];
  spins: Spin[];
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
      name: "TWS HOWELL",
      sku: "HW01",
      description: "Grand Prize Utama: TWS Howell (Rp 419.000)",
      icon: "trophy",
      stock: 30,
      enabled: true,
      weight: 3,
      image: `${import.meta.env.BASE_URL}assets/tws-howell.png`,
      wheelLines: ["TWS", "HOWELL"],
    },
    {
      id: "discount",
      name: "VOUCHER DISKON 20%",
      description: "Direct Sales Driver: Voucher diskon belanja 20% produk Howell",
      icon: "ticket",
      stock: 300,
      enabled: true,
      weight: 30,
      image: `${import.meta.env.BASE_URL}assets/voucher-diskon-20.png`,
      wheelLines: ["VOUCHER", "DISKON 20%"],
    },
    {
      id: "earphone",
      name: "EARPHONE KABEL",
      sku: "HW03",
      description: "Volume Winner: Earphone Kabel Howell (Rp 31.000)",
      icon: "headphones",
      stock: 250,
      enabled: true,
      weight: 25,
      image: `${import.meta.env.BASE_URL}assets/earphone.png`,
      wheelLines: ["EARPHONE", "KABEL"],
    },
    {
      id: "hdmi",
      name: "KABEL HDMI 4K",
      sku: "H0103",
      description: "Standard Tier: Kabel HDMI 4K Howell (Rp 37.000)",
      icon: "hdmi",
      stock: 150,
      enabled: true,
      weight: 15,
      image: `${import.meta.env.BASE_URL}assets/hdmi-4k.png`,
      wheelLines: ["KABEL", "HDMI 4K"],
    },
    {
      id: "shirt",
      name: "BAJU HOWELL",
      description: "Merchandise eksklusif: Kaos / Baju Howell",
      icon: "shirt",
      stock: 100,
      enabled: true,
      weight: 10,
      image: `${import.meta.env.BASE_URL}assets/baju-howell.png`,
      wheelLines: ["BAJU", "HOWELL"],
    },
    {
      id: "cable",
      name: "KABEL DATA 4 IN 1",
      sku: "AC01",
      description: "Mid Tier: Kabel multi-connector 4 in 1 Howell (Rp 126.000)",
      icon: "cable",
      stock: 100,
      enabled: true,
      weight: 10,
      image: `${import.meta.env.BASE_URL}assets/kabel-data-4in1.png`,
      wheelLines: ["KABEL DATA", "4 IN 1"],
    },
    {
      id: "umbrella",
      name: "PAYUNG HOWELL",
      description: "Exclusive Souvenir: Payung eksklusif Howell",
      icon: "umbrella",
      stock: 70,
      enabled: true,
      weight: 7,
      image: `${import.meta.env.BASE_URL}assets/payung-howell.png`,
      wheelLines: ["PAYUNG", "HOWELL"],
    },
  ],
  segments: [
    "tws",
    "discount",
    "earphone",
    "hdmi",
    "shirt",
    "cable",
    "umbrella",
  ],
  spins: [],
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
      throw Error("Nama, stok, bobot, atau gambar hadiah tidak valid.");
  if (s.segments.some((id) => !s.prizes.some((p) => p.id === id)))
    throw Error("Segmen harus mengacu pada hadiah yang tersedia.");
  if (
    !Number.isFinite(s.settings.volume) ||
    s.settings.volume < 0 ||
    s.settings.volume > 1 ||
    !safeImage(s.settings.logo) ||
    ["headline", "subtitle", "terms", "expiry"].some(
      (k) => typeof s.settings[k as keyof State["settings"]] !== "string",
    )
  )
    throw Error("Pengaturan tidak valid.");
  const ids = new Set<string>(),
    codes = new Set<string>(),
    sessions = new Set<string>();
  for (const r of s.spins) {
    if (
      !r.id ||
      ids.has(r.id) ||
      codes.has(r.code) ||
      sessions.has(r.sessionId) ||
      !/^HW-(?:[A-F0-9]{12}|\d{6,9})$/.test(r.code) ||
      !Number.isFinite(Date.parse(r.at)) ||
      !["Won", "Pending Claim", "Claimed", "Voided"].includes(r.status) ||
      !s.prizes.some((p) => p.id === r.prizeId) ||
      !Array.isArray(r.events) ||
      !Array.isArray(r.segments) ||
      !r.segments.length ||
      r.segments.some((id) => !s.prizes.some((p) => p.id === id)) ||
      r.segments[r.segment] !== r.prizeId ||
      !Number.isFinite(r.rotation) ||
      !safeImage(r.image)
    )
      throw Error("Histori backup tidak valid.");
    ids.add(r.id);
    codes.add(r.code);
    sessions.add(r.sessionId);
  }
  if (
    s.session.spinId &&
    !s.spins.some(
      (r) => r.id === s.session.spinId && r.sessionId === s.session.id,
    )
  )
    throw Error("Sesi backup tidak konsisten.");
}
export const safeImage = (s: string) =>
  typeof s === "string" &&
  (!s ||
    /^\/spin-wheel\/assets\/[a-zA-Z0-9._-]+\.png$/.test(s) ||
    /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(s));
