import { useEffect, useMemo, useRef, useState } from "react";
import {
  Volume2,
  VolumeX,
  Maximize,
  History,
  X,
  Download,
  Zap,
  Shield,
  FlaskConical,
} from "lucide-react";
import { AdminDashboard } from "./AdminDashboard";
import { requestSpin, requestTestSpin } from "./api";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import { Wheel, PrizeIcon } from "./Wheel";
import { available, transition } from "./engine";
import { read, mutate } from "./storage";
import { tone, fanfare, chargingAudio } from "./audio";
import {
  chargeAt,
  canRelease,
  powerDuration,
  powerRotationFor,
  spinEase,
  type Phase,
} from "./interaction";
import type { State, Spin } from "./model";
import {
  formatSpinDateTimeWib,
  formatWibDateLong,
  launchPeriodSpins,
  spinDateWib,
} from "./history";

export default function App() {
  const [state, setState] = useState<State>();
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [progress, setProgress] = useState(0);
  const [releasedPower, setReleasedPower] = useState(0);
  const [sound, setSound] = useState(true);
  const [history, setHistory] = useState(false);
  const [historyDate, setHistoryDate] = useState("all");
  const [adminOpen, setAdminOpen] = useState(false);
  const [testResult, setTestResult] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Spin>();
  const [easy, setEasy] = useState(false);
  const wheel = useRef<SVGSVGElement>(null),
    hubLogo = useRef<HTMLImageElement>(null),
    pointer = useRef<HTMLDivElement>(null),
    appRoot = useRef<HTMLDivElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    historyDialog = useRef<HTMLDialogElement>(null);
  const phaseRef = useRef<Phase>("IDLE"),
    initialWheelRotation = useRef(0),
    frame = useRef(0),
    angle = useRef(0),
    held = useRef<string | number | null>(null),
    start = useRef(0),
    progressRef = useRef(0),
    lastProgressPaint = useRef(0),
    lastTickSound = useRef(0),
    lastPointerAnimation = useRef(0);
  const audio = useRef<ReturnType<typeof chargingAudio> | null>(null);

  const paintEnergy = (value: number, now = performance.now()) => {
    appRoot.current?.style.setProperty("--energy", String(value));
    if (now - lastProgressPaint.current >= 90 || value === 0 || value === 1) {
      lastProgressPaint.current = now;
      setProgress(value);
    }
  };

  const change = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  const cancel = () => {
    if (!["CHARGING", "READY"].includes(phaseRef.current)) return;
    cancelAnimationFrame(frame.current);
    held.current = null;
    audio.current?.stop();
    audio.current = null;
    progressRef.current = 0;
    paintEnergy(0);
    change("IDLE");
  };

  useEffect(() => {
    let active = true;
    void read()
      .then((s) => {
        if (!active) return;
        setState(s);
        const pending = s.spins.find(
          (r) => r.id === s.session.spinId && r.status !== "Voided",
        );
        if (pending) {
          setResult(pending);
          angle.current = pending.rotation;
          initialWheelRotation.current = pending.rotation;
          change("RESULT");
        }
      })
      .catch((e) => setError(String(e)));
    const blur = () => cancel();
    const hidden = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      active = false;
      cancelAnimationFrame(frame.current);
      audio.current?.stop();
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

  useEffect(() => {
    if (phase === "RESULT" && result) dialog.current?.showModal();
    else dialog.current?.close();
  }, [phase, result]);

  useEffect(() => {
    if (history) historyDialog.current?.showModal();
    else historyDialog.current?.close();
  }, [history]);

  function begin(source: string | number) {
    if (
      phaseRef.current !== "IDLE" ||
      !state ||
      !available(state).length ||
      history
    )
      return;
    held.current = source;
    start.current = performance.now();
    progressRef.current = 0;
    paintEnergy(0);
    setReleasedPower(0);
    change("CHARGING");
    setError("");
    audio.current = chargingAudio(sound ? state.settings.volume : 0);
    const update = (now: number) => {
      const p = chargeAt(now - start.current);
      progressRef.current = p;
      paintEnergy(p, now);
      audio.current?.update(p);
      if (p === 1) {
        change("READY");
        navigator.vibrate?.(25);
      } else frame.current = requestAnimationFrame(update);
    };
    frame.current = requestAnimationFrame(update);
  }

  function release(source: string | number) {
    if (held.current !== source) return;
    held.current = null;
    cancelAnimationFrame(frame.current);
    const power = chargeAt(performance.now() - start.current);
    progressRef.current = power;
    paintEnergy(power);
    setReleasedPower(power);
    if (canRelease(phaseRef.current) && power >= 1) {
      audio.current?.stop();
      audio.current = null;
      void spin(power);
    } else cancel();
  }

  async function spin(power: number, test = false) {
    const instantSpin = !test && easy && phaseRef.current === "IDLE";
    if (
      !state ||
      (test
        ? phaseRef.current !== "IDLE" || history || adminOpen
        : !canRelease(phaseRef.current) && !instantSpin)
    )
      return;
    setTestResult(test);
    change("SPINNING");
    try {
      const previous = angle.current;
      const reservation = test
        ? undefined
        : await requestSpin({
            sessionId: state.session.id,
            clientRequestId: crypto.randomUUID(),
          });
      const selected = test
        ? requestTestSpin(state)
        : reservation!.spin;
      // requestSpin already returns the committed state. Avoid a second IndexedDB
      // round trip before the animation, which added visible startup latency.
      const saved = test ? state : reservation!.savedState;
      let rot = powerRotationFor(
        selected.segment,
        selected.segments.length,
        previous,
        power,
      );
      while (rot < previous + 360) {
        rot += 360;
      }
      selected.rotation = rot;
      setResult(selected);
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = reduced ? 300 : powerDuration(power);
      const count = selected.segments.length;
      const step = 360 / count;
      let started = 0,
        lastTick = Math.floor((previous + step / 2) / step);
      const animate = (now: number) => {
        started ||= now;
        const t = Math.min(1, (now - started) / duration);
        angle.current = previous + (selected.rotation - previous) * spinEase(t);
        if (wheel.current)
          wheel.current.style.transform = `rotate(${angle.current}deg)`;
        if (hubLogo.current)
          hubLogo.current.style.transform = `rotate(${angle.current}deg)`;
        const tick = Math.floor((angle.current + step / 2) / step);
        if (tick !== lastTick) {
          if (now - lastTickSound.current >= 65) {
            tone(900, sound ? saved.settings.volume : 0, 0.025);
            lastTickSound.current = now;
          }
          if (!reduced && now - lastPointerAnimation.current >= 95) {
            pointer.current?.animate(
                [
                  { transform: "rotate(-17deg)" },
                  { transform: "rotate(0deg)" },
                ],
                { duration: 110 },
              );
            lastPointerAnimation.current = now;
          }
          lastTick = tick;
        }
        if (t > 0.45 && phaseRef.current === "SPINNING") change("DECELERATING");
        if (t < 1) frame.current = requestAnimationFrame(animate);
        else {
          change("SETTLING");
          tone(650, sound ? saved.settings.volume : 0, 0.07);
          if (!test) {
            void mutate((s) => {
              if (s.spins.find((r) => r.id === selected.id)?.status === "Won")
                transition(s, selected.id, "Pending Claim");
            })
              .then(setState)
              .catch((e) => setError(String(e)));
          }
          const settledAt = now;
          const celebrate = (time: number) => {
            if (time - settledAt < 450) {
              frame.current = requestAnimationFrame(celebrate);
              return;
            }
            change("WINNING");
            fanfare(sound ? saved.settings.volume : 0);
            if (!reduced)
              void confetti({
                particleCount: selected.prizeId === "tws" ? 140 : 85,
                spread: selected.prizeId === "tws" ? 100 : 85,
                origin: { y: 0.58 },
                colors: ["#FFD600", "#FFFFFF", "#FFA000"],
                disableForReducedMotion: true,
              });
            change("RESULT");
          };
          frame.current = requestAnimationFrame(celebrate);
        }
      };
      frame.current = requestAnimationFrame(animate);
    } catch (e) {
      setTestResult(false);
      setError(String(e));
      progressRef.current = 0;
      paintEnergy(0);
      setReleasedPower(0);
      change("IDLE");
    }
  }

  async function finish() {
    try {
      cancelAnimationFrame(frame.current);
      held.current = null;
      audio.current?.stop();
      audio.current = null;
      if (testResult) {
        setResult(undefined);
        setTestResult(false);
        progressRef.current = 0;
        paintEnergy(0);
        setReleasedPower(0);
        setError("");
        angle.current = 0;
        if (wheel.current) wheel.current.style.transform = "rotate(0deg)";
        if (hubLogo.current) hubLogo.current.style.transform = "rotate(0deg)";
        change("IDLE");
        return;
      }
      setState(
        await mutate((s) => {
          if (s.session.spinId === result?.id)
            s.session = { id: crypto.randomUUID() };
        }),
      );
      setResult(undefined);
      progressRef.current = 0;
      paintEnergy(0);
      setReleasedPower(0);
      setError("");
      angle.current = 0;
      if (wheel.current) wheel.current.style.transform = "rotate(0deg)";
      if (hubLogo.current) hubLogo.current.style.transform = "rotate(0deg)";
      change("IDLE");
    } catch (e) {
      setError(String(e));
    }
  }

  function csv() {
    if (!state) return;
    const cell = (s: string) =>
      '"' + (/^[=+@-]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"';
    const rows = [
      ["Spin ID", "Hadiah", "SKU", "Waktu Asia/Jakarta", "Status"],
      ...[...historySpins]
        .reverse()
        .map((r) => [
          r.code,
          r.prizeName,
          r.sku || state.prizes.find((p) => p.id === r.prizeId)?.sku || "-",
          `${formatSpinDateTimeWib(r)} WIB`,
          r.status,
        ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(cell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `howell-history-${historyDate === "all" ? "semua-hari" : historyDate}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const busy = !["IDLE", "CHARGING", "READY"].includes(phase);
  const displayedPower = busy ? releasedPower : progress;
  const spins = useMemo(
    () => [...launchPeriodSpins(state?.spins || [])].reverse(),
    [state?.spins],
  );
  const spinsByDate = useMemo(() => {
    const grouped = new Map<string, Spin[]>();
    for (const spin of spins) {
      const day = spinDateWib(spin);
      const daySpins = grouped.get(day) || [];
      daySpins.push(spin);
      grouped.set(day, daySpins);
    }
    return grouped;
  }, [spins]);
  const historyDates = [...spinsByDate.keys()].sort((a, b) => b.localeCompare(a));
  const historySpins = historyDate === "all" ? spins : spinsByDate.get(historyDate) || [];

  return (
    <div
      ref={appRoot}
      className={`app phase-${phase.toLowerCase()}`}
      style={{ "--energy": displayedPower } as React.CSSProperties}
    >
      <header>
        <div className="header-layout">
          <img
            className="brand"
            src={`${import.meta.env.BASE_URL}assets/howell-white.png`}
            alt="HOWELL"
          />
        </div>
        <nav>
          <button
            aria-label={sound ? "Matikan suara" : "Aktifkan suara"}
            aria-pressed={sound}
            onClick={() => {
              setSound(!sound);
              if (sound) audio.current?.stop();
            }}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
            <span>{sound ? "ON" : "OFF"}</span>
          </button>
          <button
            className="test-spin-button"
            aria-label="Test spin"
            title="Putar simulasi tanpa menyimpan history atau mengurangi stok"
            disabled={!state || phase !== "IDLE" || history || adminOpen}
            onClick={() => void spin(1, true)}
          >
            <FlaskConical size={18} />
            <span>TEST</span>
          </button>
          <button
            onClick={() => setAdminOpen(true)}
            title="Dashboard Admin & Kontrol Kuota TWS"
          >
            <Shield size={18} />
            <span>ADMIN</span>
          </button>
          <button
            disabled={phase !== "IDLE"}
            onClick={() => {
              void read()
                .then(setState)
                .catch((e) => setError(String(e)));
              setHistory(true);
            }}
          >
            <History size={18} />
            <span>HISTORY</span>
          </button>
          <button
            aria-label="Layar penuh"
            onClick={() => {
              const p = document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen?.();
              if (p)
                void p.catch(() =>
                  setError("Layar penuh tidak tersedia pada browser ini."),
                );
              else setError("Gunakan layar penuh melalui menu browser.");
            }}
          >
            <Maximize size={18} />
          </button>
        </nav>
      </header>
      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => setError("")}>Tutup</button>
        </div>
      )}
      <main>
        <section className="arena">
          <div className="machine">
            {state ? (
              <Wheel
                ref={wheel}
                pointerRef={pointer}
                segments={state.segments}
                prizes={state.prizes}
                rotation={initialWheelRotation.current}
                logo={state.settings.logo}
                logoRef={hubLogo}
              />
            ) : (
              <p>Menyiapkan mesin…</p>
            )}
          </div>
          <aside className="telemetry">
            <div className="eyebrow">ENERGY LEVEL</div>
            <div className="energy-number">
              {Math.round(displayedPower * 100)}
              <small>%</small>
            </div>
            <div className="energy-bars">
              {Array.from({ length: 20 }, (_, i) => (
                <i key={i} className={displayedPower * 20 > i ? "active" : ""} />
              ))}
            </div>
          </aside>
        </section>
        <section className="controls">
          <div className="control-caption">
            <span>
              {busy
                ? "PUTARAN BERLANGSUNG"
                : easy
                  ? "MODE SEKALI KLIK"
                  : "TAHAN UNTUK MENGISI ENERGI"}
            </span>
            <span>{easy ? "TEKAN UNTUK PUTAR" : "1.5 SEC / FULL POWER"}</span>
          </div>
          <button
            className="charge-button"
            disabled={!state || busy || !available(state).length}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (easy || e.button !== 0 || held.current !== null) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              begin(e.pointerId);
            }}
            onPointerUp={(e) => {
              if (!easy) release(e.pointerId);
            }}
            onPointerCancel={cancel}
            onLostPointerCapture={() => {
              if (typeof held.current === "number") cancel();
            }}
            onKeyDown={(e) => {
              if (!easy && [" ", "Enter"].includes(e.key)) {
                e.preventDefault();
                if (!e.repeat) begin("keyboard");
              }
            }}
            onKeyUp={(e) => {
              if (!easy && [" ", "Enter"].includes(e.key)) {
                e.preventDefault();
                release("keyboard");
              }
            }}
            onBlur={() => {
              if (!easy) cancel();
            }}
            onClick={() => {
              if (easy) {
                if (phaseRef.current === "IDLE") void spin(1);
              }
            }}
          >
            <span className="button-fill" />
            <span className="button-icon"><Zap size={23} /></span>
            <span className="button-label">
              {phase === "READY"
                ? easy
                  ? "TAP TO SPIN"
                  : "RELEASE TO SPIN"
                : phase === "CHARGING"
                  ? "CHARGING ENERGY"
                  : busy
                    ? "GOOD LUCK"
                    : easy
                      ? "TAP TO SPIN"
                      : "HOLD TO CHARGE"}
            </span>
            <span className="button-percent">
              {Math.round(progress * 100)}%
            </span>
          </button>
          <div className="control-bottom">
            <label>
              <input
                type="checkbox"
                checked={easy}
                disabled={phase !== "IDLE"}
                onChange={(e) => setEasy(e.target.checked)}
              />{" "}
              Mode tanpa tahan
            </label>
          </div>
          <span className="sr-only" role="status">
            {phase === "READY"
              ? "Energi penuh. Lepaskan untuk berputar."
              : phase}
          </span>
        </section>
        <div className="prize-strip">
          {state?.prizes.filter((p) => state.segments.includes(p.id)).map((p) => (
            <div key={p.id}>
              {p.image ? (
                <img
                  src={p.image}
                  alt=""
                  style={{ width: 22, height: 22, objectFit: "contain" }}
                />
              ) : (
                <PrizeIcon icon={p.icon} size={22} />
              )}
              <span>{p.name}</span>
            </div>
          ))}
        </div>
      </main>
      <footer>
        <span>© 2026 PT Howell Niaga Indonesia</span>
        <span>
          <i /> CONNECT TO THE FUTURE
        </span>
      </footer>
      <dialog
        ref={dialog}
        className="win-dialog"
        aria-labelledby="win-title"
        onCancel={(e) => {
          e.preventDefault();
          void finish();
        }}
      >
        {result && (
          <motion.div
            key={result.id}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 20, stiffness: 220 }}
          >
            <div className="eyebrow">
            {testResult ? "MODE TEST · SIMULASI SAJA" : result.prizeId === "tws"
                ? "🌟 GRAND PRIZE UTAMA 🌟"
                : "CONGRATULATIONS!"}
            </div>
            <h2 id="win-title">{testResult ? "TEST SPIN" : "YOU WON"}</h2>
            <div className="prize-hero">
              {result.image ? (
                <img src={result.image} alt={result.prizeName} />
              ) : (
                <PrizeIcon icon={result.icon} size={100} />
              )}
            </div>
            <h3>{result.prizeName}</h3>
            <p>
              {testResult
                ? "Ini hanya simulasi untuk menguji roda. Hadiah ini tidak dicatat dan tidak dapat diklaim."
                : result.prizeId === "tws"
                ? "Selamat! Kamu berhasil memenangkan Grand Prize TWS HW01! Tunjukkan hasil ini kepada petugas booth HOWELL."
                : "Tunjukkan hasil ini kepada petugas booth HOWELL."}
            </p>
            {(() => {
              const prize = state?.prizes.find((p) => p.id === result.prizeId);
              const sku = result.sku || prize?.sku;
              return (
                <div className="claim-code">
                  <div className="claim-item">
                    <small>SPIN ID</small>
                    <strong>{testResult ? "SIMULASI" : result.code}</strong>
                  </div>
                  {sku && (
                    <>
                      <div className="claim-divider" />
                      <div className="claim-item claim-sku">
                        <small>SKU PRODUK</small>
                        <strong>{sku}</strong>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
            <button className="primary" onClick={() => void finish()}>
              SELESAI
            </button>
            <small>HOWELL · INDOCOMTECH 2026</small>
          </motion.div>
        )}
      </dialog>
      <dialog
        ref={historyDialog}
        className="history-dialog"
        aria-labelledby="history-title"
        onCancel={() => setHistory(false)}
      >
        <div className="history-heading">
          <div>
            <div className="eyebrow">YOUR LUCK, RECORDED</div>
            <h2 id="history-title">
              Spin history<span>.</span>
            </h2>
          </div>
          <button aria-label="Tutup history" onClick={() => setHistory(false)}>
            <X />
          </button>
        </div>
        <div className="stats">
          <div>
            <b>{historySpins.length}</b>
            <small>Total Spins</small>
          </div>
          <div>
            <b>{historySpins.filter((s) => s.status !== "Voided").length}</b>
            <small>Hadiah Dimenangkan</small>
          </div>
          <div>
            <b className="last-time">
              {historySpins[0]
                ? `${formatSpinDateTimeWib(historySpins[0])} WIB`
                : "—"}
            </b>
            <small>Last Spin · WIB</small>
          </div>
        </div>
        <button className="export" onClick={csv} disabled={!spins.length}>
          <Download size={16} /> EXPORT CSV
        </button>
        <label className="history-date-filter">
          <span>Tampilkan riwayat tanggal</span>
          <select
            aria-label="Filter riwayat berdasarkan tanggal WIB"
            value={historyDate}
            onChange={(event) => setHistoryDate(event.target.value)}
          >
            <option value="all">Semua hari ({spins.length})</option>
            {historyDates.map((day) => (
              <option key={day} value={day}>
                {formatWibDateLong(day)} ({spinsByDate.get(day)?.length || 0})
              </option>
            ))}
          </select>
        </label>
        <div className="history-list">
          {!historySpins.length ? (
            <p className="empty">
              {spins.length
                ? "Belum ada riwayat pada tanggal ini."
                : "Belum ada putaran. Hadiah pertamamu menunggu!"}
            </p>
          ) : (
            historySpins.map((r, i) => (
              <article key={r.id}>
                <span className="ordinal">
                  #{String(historySpins.length - i).padStart(3, "0")}
                </span>
                <div className="history-icon">
                  {r.image ? (
                    <img src={r.image} alt="" />
                  ) : (
                    <PrizeIcon icon={r.icon} />
                  )}
                </div>
                <div>
                  <h3>{r.prizeName}</h3>
                  <p>{formatSpinDateTimeWib(r)} WIB</p>
                  <small>
                    {r.code}
                    {(() => {
                      const sku =
                        r.sku ||
                        state?.prizes.find((p) => p.id === r.prizeId)?.sku;
                      return sku ? ` · SKU: ${sku}` : "";
                    })()}
                    {r.status === "Voided" ? " · Dibatalkan" : ""}
                  </small>
                </div>
              </article>
            ))
          )}
        </div>
      </dialog>
      <AdminDashboard
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
      />
    </div>
  );
}
