import { describe, it, expect, beforeEach } from "vitest";
import { BackendEngine, BASE_PRIZES, WHEEL_12_SEGMENTS } from "../server/backendEngine";
import { getWibDate } from "../src/timezone";

describe("TWS HW01 Daily Limit & 00.00 WIB Reset Specification (12 Test Cases)", () => {
  let engine: BackendEngine;

  beforeEach(async () => {
    // Fresh engine instance with in-memory state
    engine = new BackendEngine(undefined, {
      version: 1,
      prizes: JSON.parse(JSON.stringify(BASE_PRIZES)),
      segments: [...WHEEL_12_SEGMENTS],
      spins: [],
      dailyTwsClaims: {},
    });
  });

  // 1. Sebelum ada pemenang, TWS tersedia dengan kuota 0/1.
  it("Test 1: Sebelum ada pemenang, TWS tersedia dengan kuota 0/1", () => {
    // Tanggal 26 Oktober 2026 pukul 09.00 WIB
    const morningDate = new Date("2026-10-26T02:00:00.000Z"); // 09:00 WIB
    const status = engine.getAdminStatus(morningDate);

    expect(status.operationalDate).toBe("2026-10-26");
    expect(status.quotaTwsDaily).toBe(1);
    expect(status.twsWinnersToday).toBe(0);
    expect(status.twsStatus).toBe("Tersedia");
    expect(status.actualProbabilities["tws"]).toBe(0.03);
  });

  // 2. Setelah satu pemenang pada tanggal tertentu, kuota berubah menjadi 1/1.
  it("Test 2: Setelah satu pemenang pada tanggal tertentu, kuota berubah menjadi 1/1", async () => {
    // Tanggal 26 Oktober 2026 pukul 14.00 WIB
    const winTime = new Date("2026-10-26T07:00:00.000Z"); // 14:00 WIB
    // Force roll to win TWS: random value 0.01 falls in [0, 0.03) -> TWS
    const outcome = await engine.spin(
      { sessionId: "session-1", overrideRandom: 0.01 },
      winTime,
    );

    expect(outcome.spin.prizeId).toBe("tws");
    expect(outcome.spin.sku).toBe("HW01");
    expect(outcome.spin.segment).toBe(0); // Sektor 0 pada roda 12 sektor

    const status = engine.getAdminStatus(winTime);
    expect(status.twsWinnersToday).toBe(1);
    expect(status.twsStatus).toBe("Kuota Hari Ini Habis");
  });

  // 3. Spin berikutnya pada tanggal yang sama tidak bisa memenangkan TWS.
  it("Test 3: Spin berikutnya pada tanggal yang sama tidak bisa memenangkan TWS", async () => {
    const today = new Date("2026-10-26T08:00:00.000Z"); // 15:00 WIB
    // Menangkan TWS pertama
    await engine.spin({ sessionId: "session-1", overrideRandom: 0.01 }, today);

    // Coba 100 putaran berikutnya dengan berbagai nilai acak
    for (let i = 0; i < 100; i++) {
      const randomVal = i / 100;
      const res = await engine.spin(
        { sessionId: `session-subsequent-${i}`, overrideRandom: randomVal },
        today,
      );
      // Dipastikan tidak ada yang memenangkan TWS
      expect(res.spin.prizeId).not.toBe("tws");
      expect(res.spin.segment).not.toBe(0); // Roda tidak pernah berhenti di sektor 0
    }

    const status = engine.getAdminStatus(today);
    expect(status.twsWinnersToday).toBe(1); // Tetap tepat 1
  });

  // 4. Pada pukul 23.59 WIB, TWS tetap tidak tersedia jika kuota telah digunakan.
  it("Test 4: Pada pukul 23.59 WIB, TWS tetap tidak tersedia jika kuota telah digunakan", async () => {
    // Pemenang di siang hari: 14:00 WIB
    const afternoon = new Date("2026-10-26T07:00:00.000Z");
    await engine.spin({ sessionId: "session-1", overrideRandom: 0.01 }, afternoon);

    // Waktu 23:59:59 WIB pada hari yang sama (16:59:59 UTC)
    const lateNight = new Date("2026-10-26T16:59:59.000Z");
    expect(getWibDate(lateNight)).toBe("2026-10-26");

    const status = engine.getAdminStatus(lateNight);
    expect(status.twsWinnersToday).toBe(1);
    expect(status.twsStatus).toBe("Kuota Hari Ini Habis");
    expect(status.actualProbabilities["tws"]).toBe(0);

    // Spin di 23:59 WIB tetap tidak dapat TWS
    const lateSpin = await engine.spin({ sessionId: "session-late", overrideRandom: 0.001 }, lateNight);
    expect(lateSpin.spin.prizeId).not.toBe("tws");
  });

  // 5. Pada pukul 00.00 WIB, tanggal operasional berubah dan kuota kembali tersedia.
  it("Test 5: Pada pukul 00.00 WIB, tanggal operasional berubah dan kuota kembali tersedia", async () => {
    // 26 Oktober siang: satu pemenang TWS
    const oct26 = new Date("2026-10-26T07:00:00.000Z");
    await engine.spin({ sessionId: "session-oct26", overrideRandom: 0.01 }, oct26);
    expect(engine.getAdminStatus(oct26).twsWinnersToday).toBe(1);

    // Tepat pukul 00:00:00 WIB tanggal 27 Oktober (17:00:00 UTC tanggal 26)
    const midnightWib = new Date("2026-10-26T17:00:00.000Z");
    expect(getWibDate(midnightWib)).toBe("2026-10-27");

    const statusAtMidnight = engine.getAdminStatus(midnightWib);
    expect(statusAtMidnight.operationalDate).toBe("2026-10-27");
    expect(statusAtMidnight.twsWinnersToday).toBe(0); // Kuota reset kembali 0/1!
    expect(statusAtMidnight.twsStatus).toBe("Tersedia");
    expect(statusAtMidnight.actualProbabilities["tws"]).toBe(0.03); // Peluang 3% aktif kembali!

    // Pengguna tanggal 27 Oktober memenangkan TWS
    const oct27Spin = await engine.spin(
      { sessionId: "session-oct27", overrideRandom: 0.01 },
      midnightWib,
    );
    expect(oct27Spin.spin.prizeId).toBe("tws");
    expect(oct27Spin.spin.dateWib).toBe("2026-10-27");

    // Sekarang kuota 27 Oktober menjadi 1/1
    expect(engine.getAdminStatus(midnightWib).twsWinnersToday).toBe(1);
  });

  // 6. Reset tidak bergantung pada aktivitas pengguna atau timer browser.
  it("Test 6: Reset tidak bergantung pada aktivitas pengguna atau timer browser", () => {
    // Simulasi aplikasi tidak disentuh/dibuka selama berjam-jam melewati tengah malam
    const idleBefore = new Date("2026-10-26T14:00:00.000Z"); // 21:00 WIB
    expect(getWibDate(idleBefore)).toBe("2026-10-26");
    const idleAfter = new Date("2026-10-27T03:00:00.000Z"); // 10:00 WIB keesokan harinya (gap 13 jam)

    // Langsung periksa status pada saat aplikasi dibuka kembali
    const statusAfter = engine.getAdminStatus(idleAfter);
    expect(statusAfter.operationalDate).toBe("2026-10-27");
    expect(statusAfter.twsWinnersToday).toBe(0);
    expect(statusAfter.twsStatus).toBe("Tersedia");
  });

  // 7. Pergantian hari tetap benar ketika timestamp database menggunakan UTC.
  it("Test 7: Pergantian hari tetap benar ketika timestamp database menggunakan UTC", () => {
    // 26 Okt 23:59:59 WIB disimpan sebagai UTC 2026-10-26T16:59:59.000Z
    const t1Utc = new Date("2026-10-26T16:59:59.000Z");
    // 27 Okt 00:00:00 WIB disimpan sebagai UTC 2026-10-26T17:00:00.000Z
    const t2Utc = new Date("2026-10-26T17:00:00.000Z");

    expect(getWibDate(t1Utc)).toBe("2026-10-26");
    expect(getWibDate(t2Utc)).toBe("2026-10-27");
  });

  // 8. Dua spin bersamaan tidak dapat menghasilkan dua pemenang TWS pada tanggal WIB yang sama.
  it("Test 8: Dua spin bersamaan tidak dapat menghasilkan dua pemenang TWS pada tanggal WIB yang sama (Concurrency)", async () => {
    const sameTime = new Date("2026-10-26T04:30:00.000Z");

    // 20 request spin serentak dikirim secara bersamaan dengan Promise.all
    // Semuanya mencoba roll nilai random 0.01 yang seharusnya memicu TWS
    const concurrentRequests = Array.from({ length: 20 }, (_, i) =>
      engine.spin(
        { sessionId: `session-concurrent-${i}`, overrideRandom: 0.01 },
        sameTime,
      ),
    );

    const results = await Promise.all(concurrentRequests);

    // Hitung berapa yang berhasil mendapatkan TWS
    const twsWinners = results.filter((r) => r.spin.prizeId === "tws");

    // MUTEX & CONSTRAINT MENJAMIN HANYA TEPAT 1 PEMENANG TWS!
    expect(twsWinners).toHaveLength(1);
    expect(twsWinners[0].spin.prizeId).toBe("tws");

    // 19 peserta lainnya mendapatkan hadiah alternatif dan BUKAN TWS
    const otherWinners = results.filter((r) => r.spin.prizeId !== "tws");
    expect(otherWinners).toHaveLength(19);

    // Sektor roda peserta lain bukan sektor 0
    for (const other of otherWinners) {
      expect(other.spin.segment).not.toBe(0);
    }
  });

  // 9. Riwayat hari sebelumnya tetap tersimpan.
  it("Test 9: Riwayat hari sebelumnya tetap tersimpan saat berganti hari", async () => {
    const day1 = new Date("2026-10-26T03:00:00.000Z");
    const day2 = new Date("2026-10-27T03:00:00.000Z");

    // Menang di hari 1
    const spin1 = await engine.spin({ sessionId: "sess-d1", overrideRandom: 0.01 }, day1);
    expect(spin1.spin.prizeId).toBe("tws");

    // Menang di hari 2
    const spin2 = await engine.spin({ sessionId: "sess-d2", overrideRandom: 0.01 }, day2);
    expect(spin2.spin.prizeId).toBe("tws");

    const statusDay2 = engine.getAdminStatus(day2);
    // Riwayat hari 1 dan hari 2 keduanya tersimpan utuh
    expect(statusDay2.twsWinnersHistory).toHaveLength(2);
    expect(statusDay2.twsWinnersHistory[0].dateWib).toBe("2026-10-27");
    expect(statusDay2.twsWinnersHistory[1].dateWib).toBe("2026-10-26");
  });

  // 10. Distribusi probabilitas hadiah lain berjumlah 100% setelah TWS dinonaktifkan.
  it("Test 10: Distribusi probabilitas hadiah lain berjumlah 100% setelah TWS dinonaktifkan", async () => {
    const date = new Date("2026-10-26T05:00:00.000Z");
    // Menangkan TWS
    await engine.spin({ sessionId: "sess-1", overrideRandom: 0.01 }, date);

    const status = engine.getAdminStatus(date);
    const actual = status.actualProbabilities;

    // TWS = 0%
    expect(actual["tws"]).toBe(0);

    // Jumlah total probabilitas hadiah yang tersedia harus tepat 1 (100%)
    const sumActual = Object.values(actual).reduce((sum, p) => sum + p, 0);
    expect(sumActual).toBeCloseTo(1.0, 5);

    // Proporsi masing-masing hadiah: weight / 97
    expect(actual["discount"]).toBeCloseTo(30 / 97, 4); // ~30.93%
    expect(actual["earphone"]).toBeCloseTo(25 / 97, 4); // ~25.77%
    expect(actual["hdmi"]).toBeCloseTo(15 / 97, 4);     // ~15.46%
    expect(actual["shirt"]).toBeCloseTo(10 / 97, 4);    // ~10.31%
    expect(actual["cable"]).toBeCloseTo(10 / 97, 4);    // ~10.31%
    expect(actual["umbrella"]).toBeCloseTo(7 / 97, 4);  // ~7.22%
  });

  // 11. Animasi roda selalu sesuai dengan hasil yang ditetapkan backend.
  it("Test 11: Animasi roda selalu sesuai dengan hasil yang ditetapkan backend", async () => {
    const date = new Date("2026-10-26T06:00:00.000Z");

    for (let i = 0; i < 30; i++) {
      const outcome = await engine.spin({ sessionId: `session-visual-${i}` }, date);
      const segmentIndex = outcome.spin.segment;
      const prizeAtSegment = outcome.spin.segments[segmentIndex];

      // Sektor yang dipilih harus identik dengan prizeId yang dimenangkan
      expect(prizeAtSegment).toBe(outcome.spin.prizeId);
    }
  });

  // 12. Request duplikat tidak menyebabkan hadiah atau alokasi kuota ganda.
  it("Test 12: Request duplikat (idempotensi) tidak menyebabkan hadiah atau kuota ganda", async () => {
    const date = new Date("2026-10-26T07:00:00.000Z");
    const requestId = "client-req-unique-uuid-12345";

    // Request pertama
    const firstCall = await engine.spin(
      { sessionId: "sess-idemp", clientRequestId: requestId, overrideRandom: 0.01 },
      date,
    );
    expect(firstCall.spin.prizeId).toBe("tws");
    const stockAfterFirst = engine.getState().prizes.find((p) => p.id === "tws")!.stock;

    // Request duplikat (misalnya akibat double-click atau retry network)
    const secondCall = await engine.spin(
      { sessionId: "sess-idemp", clientRequestId: requestId, overrideRandom: 0.01 },
      date,
    );

    // Hasil harus identik dengan spin pertama, dan stok tidak terpotong ganda
    expect(secondCall.spin.id).toBe(firstCall.spin.id);
    expect(secondCall.spin.code).toBe(firstCall.spin.code);
    expect(engine.getState().prizes.find((p) => p.id === "tws")!.stock).toBe(stockAfterFirst);
    expect(engine.getState().spins).toHaveLength(1);
  });
});
