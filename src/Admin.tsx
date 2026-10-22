import { useState } from "react";
import { ArrowLeft, Plus, Download, Check, Trash2, Users } from "lucide-react";
import { type State, validate } from "./model";
import { available, transition } from "./engine";
import { restore } from "./storage";
import { Wheel } from "./Wheel";
type Props = {
  state: State;
  setState: (s: State) => void;
  action: (fn: (s: State) => void) => Promise<boolean>;
  locked: boolean;
  setLocked: (v: boolean) => void;
};
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function upload(file: File | undefined) {
  if (!file) return "";
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 1500000
  )
    throw Error("Gunakan PNG, JPG, atau WebP maksimal 1,5 MB.");
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(Error("Gambar gagal dibaca"));
    r.readAsDataURL(file);
  });
}
export function Admin({ state, setState, action, locked, setLocked }: Props) {
  const [tab, setTab] = useState("overview"),
    [draft, setDraft] = useState(() => structuredClone(state)),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [notice, setNotice] = useState("");
  const current = state.spins.find((r) => r.id === state.session.spinId);
  const editing = ["prizes", "settings"].includes(tab);
  const update = () => setDraft(structuredClone(draft));
  const choose = (t: string) => {
    setTab(t);
    setNotice("");
    setDraft(structuredClone(state));
  };
  const safe = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  };
  const rows = state.spins
    .filter(
      (r) =>
        (filter === "All" || r.status === filter) &&
        `${r.id} ${r.code} ${r.prizeName}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .slice()
    .reverse();
  if (!locked)
    return (
      <main className="admin gate">
        <span className="eyebrow">BOOTH CONTROL</span>
        <h1>Area petugas.</h1>
        <p>Dashboard lokal untuk stok, sesi, dan klaim pada perangkat ini.</p>
        <p>
          Kontrol ini bukan autentikasi keamanan. Gunakan perangkat booth yang
          diawasi. Data tidak tersinkron ke perangkat lain.
        </p>
        <button className="primary" onClick={() => setLocked(true)}>
          Masuk sebagai petugas <ArrowLeft size={18} />
        </button>
        <a href="#/">Kembali ke permainan</a>
      </main>
    );
  return (
    <main className="admin">
      <div className="admin-heading">
        <div>
          <span className="eyebrow">HOWELL / BOOTH CONTROL</span>
          <h1>
            Dashboard petugas<span>.</span>
          </h1>
          <p>Inventaris, peserta, dan momen kemenangan dalam satu tempat.</p>
        </div>
        <button onClick={() => setLocked(false)}>Tutup akses petugas</button>
      </div>
      <div className="local-notice">
        Data hanya tersimpan di browser ini. Ekspor backup setiap akhir hari.
        Kontrol petugas lokal bukan autentikasi aman.
      </div>
      <div className="tabs">
        {[
          ["overview", "Ringkasan"],
          ["prizes", "Hadiah & roda"],
          ["history", "Histori & klaim"],
          ["settings", "Pengaturan"],
        ].map(([id, label]) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => choose(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {tab === "overview" && (
        <>
          <div className="stats">
            {[
              ["Total spins", state.spins.length],
              [
                "Hadiah dimenangkan",
                state.spins.filter((r) => r.status !== "Voided").length,
              ],
              [
                "Sudah diklaim",
                state.spins.filter((r) => r.status === "Claimed").length,
              ],
              [
                "Menunggu klaim",
                state.spins.filter((r) =>
                  ["Won", "Pending Claim"].includes(r.status),
                ).length,
              ],
              ["Sisa stok", state.prizes.reduce((n, p) => n + p.stock, 0)],
            ].map(([label, value]) => (
              <article key={label}>
                <small>{label}</small>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <section className="panel">
            <div className="eyebrow">PARTICIPANT SESSION</div>
            <h2>{current ? "Sesi peserta selesai" : "Siap untuk peserta"}</h2>
            <p className="mono">{state.session.id}</p>
            {current && (
              <p>
                {current.prizeName} · {current.code} · {current.status}
              </p>
            )}
            <button
              className="primary"
              disabled={
                !current || ["Won", "Pending Claim"].includes(current.status)
              }
              onClick={() =>
                void action((s) => {
                  const r = s.spins.find((x) => x.id === s.session.spinId);
                  if (!r || !["Claimed", "Voided"].includes(r.status))
                    throw Error("Klaim atau void sesi terlebih dahulu.");
                  s.session = { id: crypto.randomUUID() };
                  location.hash = "#/";
                })
              }
            >
              <Users size={18} /> Peserta berikutnya
            </button>
            <p>
              Selesaikan klaim atau void sebelum memulai peserta berikutnya.
            </p>
            {current && (
              <button onClick={() => choose("history")}>
                Verifikasi & kelola klaim
              </button>
            )}
          </section>
          <section className="panel">
            <h2>Persiapan booth</h2>
            <p>
              Stok awal adalah contoh 100 unit per kategori. Isi stok aktual
              sebelum bermain. Muat aplikasi sekali dengan internet untuk
              menyiapkan akses offline. Sediakan backup terpisah dan hindari
              mode privat browser.
            </p>
          </section>
        </>
      )}
      {tab === "prizes" && (
        <>
          <p>
            Bobot berlaku per segmen. Peluang kategori = jumlah bobot segmen
            aktif kategori ÷ total bobot aktif. Hadiah habis atau nonaktif
            dikeluarkan dari roda pada sesi berikutnya.
          </p>
          <div className="prize-edit-list">
            {draft.prizes.map((p) => (
              <section className="panel" key={p.id}>
                <div className="form-grid">
                  <label>
                    Nama hadiah
                    <input
                      value={p.name}
                      maxLength={40}
                      onChange={(e) => {
                        p.name = e.target.value;
                        update();
                      }}
                    />
                  </label>
                  <label>
                    Stok tersedia
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={p.stock}
                      onChange={(e) => {
                        p.stock = Number(e.target.value);
                        update();
                      }}
                    />
                  </label>
                  <label>
                    Bobot / segmen
                    <input
                      type="number"
                      min="0.01"
                      step="0.1"
                      value={p.weight}
                      onChange={(e) => {
                        p.weight = Number(e.target.value);
                        update();
                      }}
                    />
                  </label>
                  <label>
                    Deskripsi
                    <input
                      value={p.description}
                      onChange={(e) => {
                        p.description = e.target.value;
                        update();
                      }}
                    />
                  </label>
                  <label>
                    Gambar PNG/JPG/WebP
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) =>
                        void safe(async () => {
                          p.image = await upload(e.target.files?.[0]);
                          update();
                        })
                      }
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) => {
                        p.enabled = e.target.checked;
                        update();
                      }}
                    />{" "}
                    Aktif
                  </label>
                </div>
                <div className="row">
                  <span>
                    Peluang aktual:{" "}
                    {(() => {
                      const a = available(draft),
                        total = a.reduce(
                          (n, id) =>
                            n + draft.prizes.find((x) => x.id === id)!.weight,
                          0,
                        );
                      return total
                        ? (
                            (100 *
                              a.filter((id) => id === p.id).length *
                              p.weight) /
                            total
                          ).toFixed(2)
                        : "0";
                    })()}
                    %
                  </span>
                  <button
                    disabled={state.spins.some((r) =>
                      r.segments.includes(p.id),
                    )}
                    onClick={() => {
                      draft.prizes = draft.prizes.filter((x) => x.id !== p.id);
                      draft.segments = draft.segments.filter(
                        (id) => id !== p.id,
                      );
                      update();
                    }}
                  >
                    <Trash2 size={16} /> Hapus
                  </button>
                </div>
              </section>
            ))}
          </div>
          <button
            onClick={() => {
              draft.prizes.push({
                id: crypto.randomUUID(),
                name: "HADIAH BARU",
                description: "",
                stock: 0,
                weight: 1,
                enabled: true,
                image: "",
                icon: "gift",
              });
              update();
            }}
          >
            <Plus size={17} /> Tambah hadiah
          </button>
          <section className="panel">
            <h2>Konfigurasi segmen</h2>
            <div className="segment-inputs">
              {draft.segments.map((id, i) => (
                <label key={i}>
                  Segmen {i + 1}
                  <select
                    value={id}
                    onChange={(e) => {
                      draft.segments[i] = e.target.value;
                      update();
                    }}
                  >
                    {draft.prizes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={draft.segments.length <= 2}
                    onClick={() => {
                      draft.segments.splice(i, 1);
                      update();
                    }}
                  >
                    Hapus segmen
                  </button>
                </label>
              ))}
            </div>
            <button
              disabled={draft.segments.length >= 20 || !draft.prizes.length}
              onClick={() => {
                draft.segments.push(draft.prizes[0].id);
                update();
              }}
            >
              Tambah segmen
            </button>
            <h3>Preview konfigurasi aktif</h3>
            <div className="preview-wheel">
              {!!available(draft).length && (
                <Wheel
                  segments={available(draft)}
                  prizes={draft.prizes}
                  logo={draft.settings.logo}
                />
              )}
            </div>
          </section>
        </>
      )}
      {tab === "history" && (
        <>
          <div className="toolbar">
            <input
              placeholder="Cari hadiah, spin ID, atau kode klaim"
              aria-label="Cari histori"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              aria-label="Filter status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {["All", "Won", "Pending Claim", "Claimed", "Voided"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={() => {
                const escape = (v: string) =>
                  '"' +
                  (/^[=+@\-\t\r]/.test(v) ? "'" : "") +
                  v.replaceAll('"', '""') +
                  '"';
                download(
                  "howell-history.csv",
                  "\uFEFF" +
                    [
                      [
                        "Spin ID",
                        "Session ID",
                        "Waktu Asia/Jakarta",
                        "Hadiah",
                        "Kode",
                        "Status",
                      ],
                      ...rows.map((r) => [
                        r.id,
                        r.sessionId,
                        new Date(r.at).toLocaleString("id-ID", {
                          timeZone: "Asia/Jakarta",
                        }),
                        r.prizeName,
                        r.code,
                        r.status,
                      ]),
                    ]
                      .map((row) => row.map(escape).join(","))
                      .join("\r\n"),
                  "text/csv;charset=utf-8",
                );
              }}
            >
              <Download size={16} /> CSV
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Spin / waktu WIB",
                    "Hadiah",
                    "Kode klaim",
                    "Status",
                    "Tindakan",
                  ].map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span title={r.id}>{r.id.slice(0, 8)}</span>
                      <small>
                        {new Date(r.at).toLocaleString("id-ID", {
                          timeZone: "Asia/Jakarta",
                        })}
                      </small>
                    </td>
                    <td>{r.prizeName}</td>
                    <td className="mono">{r.code}</td>
                    <td>
                      <span className="badge">{r.status}</span>
                    </td>
                    <td>
                      {r.status === "Pending Claim" && (
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                `Konfirmasi hadiah ${r.prizeName} untuk kode ${r.code} sudah diserahkan?`,
                              )
                            )
                              void action((s) =>
                                transition(s, r.id, "Claimed"),
                              );
                          }}
                        >
                          <Check size={16} /> Klaim
                        </button>
                      )}
                      {["Won", "Pending Claim"].includes(r.status) && (
                        <button
                          onClick={() => {
                            const reason = prompt(
                              "Alasan void (stok akan dikembalikan):",
                            );
                            if (reason?.trim())
                              void action((s) =>
                                transition(s, r.id, "Voided", reason),
                              );
                          }}
                        >
                          Void
                        </button>
                      )}
                      <details>
                        <summary>Audit</summary>
                        {r.events.map((e, i) => (
                          <small key={i}>
                            {new Date(e.at).toLocaleString("id-ID", {
                              timeZone: "Asia/Jakarta",
                            })}
                            : {e.action}
                          </small>
                        ))}
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && (
              <p className="empty">Belum ada hasil yang cocok.</p>
            )}
          </div>
        </>
      )}
      {tab === "settings" && (
        <>
          <section className="panel form-grid">
            {(["headline", "subtitle", "terms", "expiry"] as const).map((k) => (
              <label key={k}>
                {
                  {
                    headline: "Headline",
                    subtitle: "Subtitle",
                    terms: "Ketentuan diskon",
                    expiry: "Masa berlaku",
                  }[k]
                }
                <input
                  value={draft.settings[k]}
                  onChange={(e) => {
                    draft.settings[k] = e.target.value;
                    update();
                  }}
                />
              </label>
            ))}
            <label>
              Logo asli PNG/JPG/WebP
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) =>
                  void safe(async () => {
                    draft.settings.logo = await upload(e.target.files?.[0]);
                    update();
                  })
                }
              />
            </label>
            <label>
              Volume suara
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={draft.settings.volume}
                onChange={(e) => {
                  draft.settings.volume = Number(e.target.value);
                  update();
                }}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.settings.kiosk}
                onChange={(e) => {
                  draft.settings.kiosk = e.target.checked;
                  update();
                }}
              />{" "}
              Mode kiosk (sembunyikan informasi sekunder)
            </label>
          </section>
          <section className="panel">
            <h2>Backup & pemulihan</h2>
            <p>
              Backup menyimpan stok, konfigurasi, histori, serta sesi. Import
              mengganti seluruh data lokal.
            </p>
            <button
              onClick={() =>
                download(
                  "howell-backup-" +
                    new Date().toISOString().slice(0, 10) +
                    ".json",
                  JSON.stringify(state, null, 2),
                  "application/json",
                )
              }
            >
              <Download size={16} /> Export backup JSON
            </button>
            <label>
              Import backup JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    void safe(async () => {
                      if (f.size > 15000000)
                        throw Error("Backup maksimal 15 MB.");
                      const imported = JSON.parse(await f.text()) as State;
                      validate(imported);
                      if (
                        confirm(
                          `Ganti data perangkat dengan ${imported.spins.length} histori dari backup? Ekspor data saat ini terlebih dahulu.`,
                        )
                      ) {
                        const s = await restore(imported);
                        setState(s);
                        setDraft(structuredClone(s));
                        setNotice("Backup berhasil dipulihkan.");
                      }
                    });
                  e.target.value = "";
                }}
              />
            </label>
            <button
              onClick={() => {
                if (
                  prompt(
                    "Reset akan menghapus histori dan sesi, tetapi mempertahankan stok saat ini. Ekspor backup dahulu. Ketik RESET untuk lanjut:",
                  ) === "RESET"
                )
                  void action((s) => {
                    s.spins = [];
                    s.session = { id: crypto.randomUUID() };
                  });
              }}
            >
              Reset histori & sesi
            </button>
          </section>
        </>
      )}
      {editing && (
        <div className="save-bar">
          <span>Perubahan diterapkan setelah disimpan.</span>
          <button
            className="primary"
            onClick={() =>
              void safe(async () => {
                validate(draft);
                const saved = await action((s) => {
                  if (
                    s.session.spinId &&
                    s.spins.some(
                      (r) =>
                        r.id === s.session.spinId &&
                        ["Won", "Pending Claim"].includes(r.status),
                    )
                  )
                    throw Error(
                      "Selesaikan klaim sesi sebelum mengubah konfigurasi.",
                    );
                  if (
                    JSON.stringify(s.prizes) !== JSON.stringify(state.prizes) ||
                    s.spins.length !== state.spins.length
                  )
                    throw Error("Data berubah. Muat ulang sebelum menyimpan.");
                  if (tab === "prizes") {
                    s.prizes = draft.prizes;
                    s.segments = draft.segments;
                  } else s.settings = draft.settings;
                });
                if (saved) setNotice("Konfigurasi berhasil disimpan.");
              })
            }
          >
            Simpan konfigurasi
          </button>
        </div>
      )}
    </main>
  );
}
