import type { State, Spin } from "./model";
export const available = (s: State) =>
  s.segments.filter((id) =>
    s.prizes.some((p) => p.id === id && p.enabled && p.stock > 0),
  );
export function select(s: State, random: number) {
  const eligible = available(s);
  const segments = s.segments;
  if (!eligible.length) throw Error("Semua hadiah habis. Hubungi petugas.");
  if (random < 0 || random >= 1 || !Number.isFinite(random))
    throw Error("Nilai acak tidak valid.");

  const segmentCounts: Record<string, number> = {};
  for (const id of segments) {
    if (eligible.includes(id)) {
      segmentCounts[id] = (segmentCounts[id] || 0) + 1;
    }
  }

  const weights = segments.map((id) => {
    if (!eligible.includes(id)) return 0;
    const p = s.prizes.find((p) => p.id === id)!;
    const count = segmentCounts[id] || 1;
    return p.weight / count;
  });

  if (
    weights.some(
      (w, i) =>
        !Number.isFinite(w) || (eligible.includes(segments[i]) && w <= 0),
    )
  )
    throw Error("Bobot tidak valid.");
  let cursor = random * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    cursor -= weights[i];
    if (cursor < 0) return { segments, index: i };
  }
  return {
    segments,
    index: weights.reduce((last, w, i) => (w > 0 ? i : last), 0),
  };
}
export const rotationFor = (index: number, count: number, from = 0) =>
  from +
  2160 +
  ((((360 - (index * 360) / count - (from % 360)) % 360) + 360) % 360);
export const pointerIndex = (rotation: number, count: number) =>
  Math.round(((360 - (rotation % 360)) % 360) / (360 / count)) % count;
export function nearestAvailableIndex(s: State, desired: number) {
  const eligible = new Set(available(s));
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
function reserveIndex(s: State, index: number): Spin {
  if (s.session.spinId)
    throw Error(
      "Sesi ini sudah diputar. Selesaikan hasil sebelumnya untuk melanjutkan.",
    );
  const segments = s.segments;
  if (!Number.isSafeInteger(index) || index < 0 || index >= segments.length)
    throw Error("Segmen hadiah tidak valid.");
  const p = s.prizes.find((p) => p.id === segments[index])!;
  if (!p?.enabled || p.stock <= 0) throw Error("Hadiah pada segmen ini habis.");
  p.stock--;
  const at = new Date().toISOString();
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
export function reserve(s: State, random: number): Spin {
  return reserveIndex(s, select(s, random).index);
}
export function reserveAt(s: State, index: number): Spin {
  return reserveIndex(s, index);
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
