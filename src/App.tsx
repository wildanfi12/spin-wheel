import { useEffect, useRef, useState } from "react";
import {
  Volume2,
  VolumeX,
  Maximize,
  Settings,
  ArrowUpRight,
  ArrowRight,
  Check,
  Gift,
  RotateCw,
} from "lucide-react";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import { Wheel, PrizeIcon } from "./Wheel";
import { available, reserve, transition } from "./engine";
import { read, mutate } from "./storage";
import { tone, fanfare } from "./audio";
import type { State, Spin } from "./model";
import { Admin } from "./Admin";
export default function App() {
  const [state, setState] = useState<State>(),
    [error, setError] = useState(""),
    [admin, setAdmin] = useState(location.hash === "#/admin"),
    [sound, setSound] = useState(false),
    [spinning, setSpinning] = useState(false),
    [show, setShow] = useState(true),
    [locked, setLocked] = useState(false),
    [animationResult, setAnimationResult] = useState<Spin>();
  const wheel = useRef<SVGSVGElement>(null),
    busy = useRef(false),
    frame = useRef(0),
    modal = useRef<HTMLDialogElement>(null);
  const sync = async () => {
    try {
      const s = await read();
      setState(s);
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    void sync();
    const hash = () => setAdmin(location.hash === "#/admin");
    const focus = () => {
      if (!busy.current) void sync();
    };
    window.addEventListener("hashchange", hash);
    window.addEventListener("focus", focus);
    return () => {
      window.removeEventListener("hashchange", hash);
      window.removeEventListener("focus", focus);
      cancelAnimationFrame(frame.current);
    };
  }, []);
  const current = state?.spins.find((r) => r.id === state.session.spinId);
  const result = animationResult || current;
  const visible =
    !!result && !spinning && show && !admin && result.status !== "Voided";
  useEffect(() => {
    if (visible) {
      modal.current?.showModal();
    } else modal.current?.close();
  }, [visible]);
  async function action(fn: (s: State) => void) {
    try {
      setError("");
      setState(await mutate(fn));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }
  async function spin() {
    if (busy.current || !state) return;
    busy.current = true;
    setSpinning(true);
    setShow(true);
    setError("");
    tone(440, sound ? state.settings.volume : 0, 0.15);
    try {
      let r!: Spin;
      const s = await mutate((data) => {
        r = reserve(
          data,
          crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296,
        );
      });
      setAnimationResult(r);
      setState(s);
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = reduced ? 250 : 6500;
      let start = 0,
        lastTick = -1;
      const animate = (now: number) => {
        start ||= now;
        const t = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - t, 4) * (1 + 4 * t);
        const angle = r.rotation * eased;
        if (wheel.current) {
          wheel.current.style.transform = `rotate(${angle}deg)`;
          wheel.current
            .querySelectorAll<SVGGElement>("[data-label-angle]")
            .forEach((el) =>
              el.setAttribute(
                "transform",
                `rotate(${-Number(el.dataset.labelAngle) - angle} 300 140)`,
              ),
            );
        }
        const tick = Math.floor(angle / (360 / r.segments.length));
        if (tick !== lastTick) {
          tone(900, sound ? s.settings.volume : 0, 0.025);
          lastTick = tick;
        }
        if (t < 1) frame.current = requestAnimationFrame(animate);
        else {
          void (async () => {
            await action((data) => transition(data, r.id, "Pending Claim"));
            setAnimationResult(undefined);
            setSpinning(false);
            busy.current = false;
            fanfare(sound ? s.settings.volume : 0);
            if (!reduced)
              void confetti({
                particleCount: 110,
                spread: 85,
                origin: { y: 0.6 },
                colors: ["#ffd600", "#ffffff"],
                disableForReducedMotion: true,
              });
          })();
        }
      };
      frame.current = requestAnimationFrame(animate);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSpinning(false);
      busy.current = false;
    }
  }
  useEffect(() => {
    if (current?.status === "Won" && !busy.current) {
      void action((s) => transition(s, current.id, "Pending Claim"));
    }
  }, [current?.id, current?.status]);
  if (!state)
    return (
      <main className="loading">
        <RotateCw /> {error || "Menyiapkan pengalaman HOWELL…"}
      </main>
    );
  const segments =
    spinning && result
      ? result.segments
      : current
        ? current.segments
        : available(state);
  const volume = () => setSound(!sound);
  return (
    <div className={state.settings.kiosk ? "app kiosk" : "app"}>
      <header>
        <a href="#/" className="brand" aria-label="Halaman permainan">
          <img
            src={
              state.settings.logo ||
              `${import.meta.env.BASE_URL}assets/howell-white.png`
            }
            alt="HOWELL"
          />
          <span>CONNECT TO THE FUTURE</span>
        </a>
        <div className="event">
          <span className="status-dot" /> INDOCOMTECH <b>2026</b>
        </div>
        <nav>
          <button
            onClick={volume}
            aria-label={sound ? "Matikan suara" : "Aktifkan suara"}
            title="Suara"
          >
            {sound ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
          <button
            aria-label="Layar penuh"
            onClick={() => {
              if (document.fullscreenElement)
                void document
                  .exitFullscreen()
                  .catch((e) => setError(String(e)));
              else if (document.documentElement.requestFullscreen)
                void document.documentElement
                  .requestFullscreen?.()
                  .catch(() =>
                    setError(
                      "Gunakan mode layar penuh browser pada perangkat ini.",
                    ),
                  );
              else setError("Layar penuh tidak didukung. Gunakan Add to Home Screen pada iPhone.");
            }}
          >
            <Maximize size={19} />
          </button>
          <a
            href={admin ? "#/" : "#/admin"}
            aria-label={admin ? "Kembali ke permainan" : "Dashboard petugas"}
            onClick={(e) => {
              if (spinning) e.preventDefault();
            }}
          >
            <Settings size={19} />
          </a>
        </nav>
      </header>
      {error && (
        <div role="alert" className="error">
          {error}
          <button onClick={() => setError("")}>Tutup</button>
        </div>
      )}
      {admin ? (
        <Admin
          state={state}
          setState={setState}
          action={action}
          locked={locked}
          setLocked={setLocked}
        />
      ) : (
        <main className="game">
          <div className="intro">
            <div className="eyebrow">
              <span /> THE HOWELL EXPERIENCE
            </div>
            <h1>
              {state.settings.headline.includes("SPIN & WIN")
                ? state.settings.headline.split("SPIN & WIN")[0]
                : ""}
              <strong>
                {state.settings.headline.includes("SPIN & WIN")
                  ? "SPIN & WIN"
                  : state.settings.headline}<span>✦</span>
              </strong>
            </h1>
            <p>{state.settings.subtitle}</p>
          </div>
          <div className="arena">
            <aside className="side-note">
              <span className="small-label">ONE SPIN. BIG SMILES.</span>
              <h2>
                Giliran kamu
                <br />
                untuk beruntung.
              </h2>
              <p>
                Hadiah spesial dari HOWELL.
                <br />
                Putar, rayakan, bawa pulang.
              </p>
              <div className="mini-rule">
                <Gift size={22} />
                <span>
                  Setiap putaran
                  <br />
                  <b>pasti dapat hadiah.</b>
                </span>
              </div>
            </aside>
            <div className="wheel-area">
              {segments.length ? (
                <Wheel
                  ref={wheel}
                  segments={segments}
                  prizes={state.prizes}
                  rotation={spinning ? 0 : current?.rotation || 0}
                  logo={state.settings.logo}
                />
              ) : (
                <div className="empty-wheel">
                  Hadiah hari ini telah habis.
                  <br />
                  Terima kasih sudah bermain!
                </div>
              )}
              <div className="wheel-shadow" />
            </div>
            <aside className="steps">
              <span className="small-label">CARA BERMAIN</span>
              {[
                "Tekan SPIN NOW",
                "Temukan hadiahmu",
                "Klaim di booth HOWELL",
              ].map((s, i) => (
                <div className="step" key={s}>
                  <span>0{i + 1}</span>
                  <p>{s}</p>
                </div>
              ))}
              <span className="edition">
                EXHIBITION EDITION <ArrowUpRight size={15} />
              </span>
            </aside>
          </div>
          <div className="spin-controls">
            <button
              className="spin-button"
              disabled={spinning || !!current || !segments.length}
              onClick={spin}
            >
              {spinning ? "GOOD LUCK…" : current ? "SESI SELESAI" : "SPIN NOW"}
              <ArrowRight size={23} />
            </button>
            <p>
              {spinning ? "Roda sedang berputar. Semoga beruntung!" : current
                ? "Petugas memulai sesi peserta berikutnya melalui dashboard."
                : "Tekan tombol untuk memutar roda keberuntungan!"}
            </p>
            {current && !spinning && (
              <button className="text-button" onClick={() => setShow(true)}>
                Lihat hasil putaran
              </button>
            )}
          </div>
          <section className="prize-strip">
            <div>
              <span className="small-label">THE PRIZE LINEUP</span>
              <h3>Hadiah untukmu.</h3>
            </div>
            {state.prizes
              .filter((p) => state.segments.includes(p.id))
              .map((p) => (
                <div
                  className={
                    "prize-mini " +
                    (!p.enabled || !p.stock ? "unavailable" : "")
                  }
                  key={p.id}
                >
                  {p.image ? (
                    <img src={p.image} alt="" />
                  ) : (
                    <PrizeIcon icon={p.icon} />
                  )}
                  <span>
                    {p.name}
                    <small>
                      {p.enabled && p.stock
                        ? "Siap dimenangkan"
                        : "Tidak tersedia"}
                    </small>
                  </span>
                </div>
              ))}
          </section>
          <details className="odds">
            <summary>Peluang hadiah & ketentuan</summary>
            <p>
              Segmen berukuran sama. Peluang mengikuti bobot aktif dan stok,
              bukan hanya luas segmen.
            </p>
            {state.prizes.map((p) => {
              const a = available(state),
                sum = a.reduce(
                  (n, id) => n + state.prizes.find((x) => x.id === id)!.weight,
                  0,
                );
              return (
                <span key={p.id}>
                  {p.name}:{" "}
                  {sum
                    ? (
                        (100 *
                          a.filter((id) => id === p.id).length *
                          p.weight) /
                        sum
                      ).toFixed(1)
                    : 0}
                  % ·{" "}
                </span>
              );
            })}
            <p>
              {state.settings.terms} Berlaku: {state.settings.expiry}.
            </p>
          </details>
        </main>
      )}
      <footer>
        <span>© 2026 PT Howell Niaga Indonesia</span>
        <span>MADE FOR CONNECTION. BUILT FOR EXCITEMENT.</span>
        <span>
          <span className="status-dot" /> BOOTH EXPERIENCE
        </span>
      </footer>
      <dialog
        ref={modal}
        className="win-dialog"
        onCancel={() => setShow(false)}
      >
        {result && (
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className="eyebrow">CONGRATULATIONS!</div>
            <h2>
              YOU WON<span>!</span>
            </h2>
            <div className="prize-hero">
              {result.image ? (
                <img src={result.image} alt={result.prizeName} />
              ) : (
                <PrizeIcon icon={result.icon} size={90} />
              )}
            </div>
            <h3>{result.prizeName}</h3>
            <p>Selamat! Kamu memenangkan {result.prizeName}!</p>
            <p>
              Tunjukkan hasil ini kepada petugas booth HOWELL untuk mengambil
              hadiahmu.
            </p>
            {result.prizeId === "discount" && (
              <p className="terms">
                {state.settings.terms}
                <br />
                Berlaku: {state.settings.expiry}
              </p>
            )}
            <div className="claim-code">
              <small>KODE KLAIM · {result.status}</small>
              <strong>{result.code}</strong>
            </div>
            <button className="primary" onClick={() => setShow(false)}>
              <Check size={18} /> SELESAI
            </button>
            <small>HOWELL · INDOCOMTECH 2026</small>
          </motion.div>
        )}
      </dialog>
    </div>
  );
}
