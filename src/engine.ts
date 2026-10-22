import type { State, Spin } from "./model";
export const available = (s: State) =>
  s.segments.filter((id) =>
    s.prizes.some((p) => p.id === id && p.enabled && p.stock > 0),
  );
export function select(s: State, random: number) {
  const segments = available(s);
  if (!segments.length) throw Error("Semua hadiah habis. Hubungi petugas.");
  if (random < 0 || random >= 1 || !Number.isFinite(random))
    throw Error("Nilai acak tidak valid.");
  const weights = segments.map(
    (id) => s.prizes.find((p) => p.id === id)!.weight,
  );
  if (weights.some((w) => !Number.isFinite(w) || w <= 0))
    throw Error("Bobot tidak valid.");
  let cursor = random * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    cursor -= weights[i];
    if (cursor < 0) return { segments, index: i };
  }
  return { segments, index: segments.length - 1 };
}
export const rotationFor = (index: number, count: number, from = 0) =>
  from +
  2160 +
  ((((360 - (index * 360) / count - (from % 360)) % 360) + 360) % 360);
export const pointerIndex = (rotation: number, count: number) =>
  Math.round(((360 - (rotation % 360)) % 360) / (360 / count)) % count;
export function reserve(s: State, random: number): Spin {
  if (s.session.spinId)
    throw Error("Sesi ini sudah diputar. Petugas harus memulai sesi baru.");
  const { segments, index } = select(s, random);
  const p = s.prizes.find((p) => p.id === segments[index])!;
  if (p.stock <= 0) throw Error("Stok habis.");
  p.stock--;
  const at = new Date().toISOString();
  let code: string;
  do {
    code =
      "HW-" +
      crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  } while (s.spins.some((r) => r.code === code));
  const r: Spin = {
    id: crypto.randomUUID(),
    sessionId: s.session.id,
    prizeId: p.id,
    prizeName: p.name,
    image: p.image,
    icon: p.icon,
    code,
    at,
    status: "Won",
    segment: index,
    segments,
    rotation: rotationFor(index, segments.length),
    events: [{ at, action: "Won: stok dikurangi" }],
  };
  s.spins.push(r);
  s.session.spinId = r.id;
  return r;
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
  } else throw Error("Perubahan status tidak diizinkan atau sudah dilakukan.");
  r.events.push({
    at: new Date().toISOString(),
    action: status + (reason ? ": " + reason : ""),
  });
}
