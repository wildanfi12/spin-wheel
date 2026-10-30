import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Clock,
  LockKeyhole,
  LogOut,
  PackageCheck,
  RefreshCw,
  Shield,
  X,
} from "lucide-react";
import { fetchAdminStatus, type AdminStatusResponse } from "./api";
import {
  formatSpinDateTimeWib,
  formatWibDateLong,
  spinDateWib,
} from "./history";
import {
  clearRememberedAdminAccess,
  hasRememberedAdminAccess,
  rememberAdminAccess,
  verifyLocalAdminPassword,
} from "./adminAccess";

interface AdminDashboardProps {
  open: boolean;
  onClose: () => void;
}

export function AdminDashboard({
  open,
  onClose,
}: AdminDashboardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<AdminStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [historyDate, setHistoryDate] = useState("all");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchAdminStatus());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat stok hadiah.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open) {
      if (dialog?.open) dialog.close();
      if (!hasRememberedAdminAccess()) setAuthenticated(false);
      setPassword("");
      setLoginError("");
      return;
    }

    if (dialog && !dialog.open) dialog.showModal();
    if (!authenticated && hasRememberedAdminAccess()) {
      setAuthenticated(true);
      return;
    }
    if (!authenticated) return;
    void loadData();
    const interval = window.setInterval(() => void loadData(), 5000);
    return () => window.clearInterval(interval);
  }, [open, authenticated]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Date.now() < lockedUntil) {
      setLoginError("Terlalu banyak percobaan. Coba lagi sebentar.");
      return;
    }
    try {
      if (await verifyLocalAdminPassword(password)) {
        rememberAdminAccess(rememberMe);
        setAuthenticated(true);
        setFailedAttempts(0);
        setPassword("");
        setLoginError("");
      } else {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        if (nextAttempts >= 5) {
          setLockedUntil(Date.now() + 30_000);
          setFailedAttempts(0);
        }
        setLoginError("Password tidak cocok.");
      }
    } catch {
      setLoginError("Browser ini tidak mendukung verifikasi password.");
    }
  }

  const totalLimit = data?.inventory.reduce((sum, row) => sum + row.limit, 0) ?? 0;
  const totalRemaining =
    data?.inventory.reduce((sum, row) => sum + row.remaining, 0) ?? 0;
  const historyDates = [...new Set((data?.history ?? []).map(spinDateWib))].sort(
    (a, b) => b.localeCompare(a),
  );
  const filteredHistory = (data?.history ?? []).filter(
    (spin) => historyDate === "all" || spinDateWib(spin) === historyDate,
  );

  return (
    <dialog
      ref={dialogRef}
      className="admin-dialog"
      aria-labelledby="admin-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="admin-modal">
        <header className="admin-header">
          <div className="admin-title-wrap">
            <div className="admin-eyebrow">
              <Shield size={14} /> STOK HARIAN · ASIA/JAKARTA (WIB)
            </div>
            <h2 id="admin-title">Stok Hadiah Harian</h2>
          </div>
          <div className="admin-header-actions">
            {authenticated && (
              <>
                <button
                  className="refresh-btn"
                  onClick={() => void loadData()}
                  disabled={loading}
                  title="Perbarui data"
                  aria-label="Perbarui stok"
                >
                  <RefreshCw size={14} className={loading ? "spin-icon" : ""} />
                </button>
                <button
                  className="refresh-btn"
                  title="Keluar dari admin"
                  aria-label="Keluar dari admin"
                  onClick={() => {
                    clearRememberedAdminAccess();
                    setAuthenticated(false);
                    setData(null);
                    setRememberMe(false);
                  }}
                >
                  <LogOut size={14} />
                </button>
              </>
            )}
            <button
              className="close-btn"
              onClick={onClose}
              aria-label="Tutup dashboard"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {!authenticated ? (
          <form className="admin-login" onSubmit={(event) => void login(event)}>
            <div className="admin-login-icon"><LockKeyhole size={22} /></div>
            <h3>Masuk ke Admin</h3>
            <p>Masukkan password untuk melihat stok hadiah harian.</p>
            <label htmlFor="admin-password">Password admin</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              required
            />
            <label className="admin-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              <span>Ingat saya selama 30 hari di perangkat ini</span>
            </label>
            {loginError && <div className="admin-error" role="alert">{loginError}</div>}
            <button className="admin-login-submit" type="submit">MASUK</button>
            <small className="local-lock-note">
              Kunci lokal perangkat. GitHub Pages tidak menyediakan autentikasi server-side.
            </small>
          </form>
        ) : (
          <>
        {error && (
          <div className="admin-error">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {data && (
          <div className="admin-content">
            <div className="admin-cards-grid">
              <div className="admin-card">
                <small>TANGGAL OPERASIONAL (WIB)</small>
                <h3>{data.operationalDateDisplay}</h3>
                <div className="server-clock">
                  <Clock size={13} /> {data.localTimeWib}
                </div>
              </div>

              <div className="admin-card">
                <small>STOK TERSISA HARI INI</small>
                <div className="metric-row">
                  <span className="metric-large">
                    {totalRemaining} / {totalLimit}
                  </span>
                  <span className="metric-unit">pcs</span>
                </div>
                <span className="badge badge-success">
                  <PackageCheck size={12} />
                  {data.totalIssuedToday} hadiah keluar
                </span>
              </div>

              <div className="admin-card">
                <small>RESET STOK BERIKUTNYA</small>
                <h3>Pukul 00.00 WIB</h3>
                <div className="server-clock">{data.nextResetTimeWib}</div>
                <div className="countdown-pill">
                  Reset dalam: <b>{data.resetCountdown.formatted}</b>
                </div>
              </div>
            </div>

            <section className="admin-section">
              <div className="section-header">
                <h3>Rincian hadiah hari ini</h3>
                <span className="section-note">
                  Sisa dihitung dari history putaran hari ini. History lama tetap disimpan.
                </span>
              </div>
              <div className="table-responsive">
                <table className="admin-table inventory-table">
                  <thead>
                    <tr>
                      <th>Hadiah</th>
                      <th>Stok harian</th>
                      <th>Keluar</th>
                      <th>Sisa</th>
                      <th>Peluang dasar</th>
                      <th>Peluang spin berikutnya</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.inventory.map((item) => {
                      const exhausted = item.remaining === 0;
                      return (
                        <tr key={item.id}>
                          <td><strong>{item.name}</strong></td>
                          <td>{item.limit} pcs</td>
                          <td>{item.issued} pcs</td>
                          <td><strong>{item.remaining} pcs</strong></td>
                          <td>{item.baseProbability.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%</td>
                          <td>{item.probability.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%</td>
                          <td>
                            <span className={exhausted ? "status-pill status-off" : "status-pill status-on"}>
                              {exhausted ? "Habis hari ini" : "Tersedia"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="inventory-footnote">
              Stok kembali ke jumlah harian pada pukul 00.00 WIB. Catatan hadiah yang
              sudah keluar tetap tersedia di menu History. Peluang dasar adalah kuota
              hadiah dibagi total kuota harian (92). Peluang berikutnya memakai bobot
              kuota tetap untuk hadiah yang masih tersedia; hadiah yang habis memiliki
              peluang 0% dan peluang hadiah lain dihitung ulang. Hasil tetap acak dan
              angka ini bukan jaminan distribusi atau seluruh stok habis.
            </p>

            <section className="admin-section">
              <div className="section-header">
                <h3>Riwayat hadiah sejak 29 Oktober 2026</h3>
                <span className="section-note">
                  {filteredHistory.length} catatan · WIB · arsip permanen
                </span>
              </div>
              <label className="history-date-filter">
                <span>Filter riwayat berdasarkan tanggal</span>
                <select
                  value={historyDate}
                  onChange={(event) => setHistoryDate(event.target.value)}
                  aria-label="Filter riwayat admin berdasarkan tanggal WIB"
                >
                  <option value="all">Semua hari ({data.history.length})</option>
                  {historyDates.map((day) => (
                    <option key={day} value={day}>
                      {formatWibDateLong(day)} ({
                        data.history.filter((spin) => spinDateWib(spin) === day).length
                      })
                    </option>
                  ))}
                </select>
              </label>
              <p className="inventory-footnote">
                Riwayat bersifat hanya-baca. Tidak ada aksi untuk menghapus catatan.
                Catatan rekonstruksi ditandai secara jelas dan memakai kode arsip,
                bukan kode klaim.
              </p>
              {historyDate !== "all" && (
                <div className="history-day-stock" aria-label="Rekap stok hari terpilih">
                  <strong>Rekap kuota · {formatWibDateLong(historyDate)}</strong>
                  <div className="history-day-stock-grid">
                    {data.inventory.map((item) => {
                      const issued = filteredHistory.filter(
                        (spin) => spin.prizeId === item.id && spin.status !== "Voided",
                      ).length;
                      return (
                        <div key={item.id}>
                          <span>{item.name}</span>
                          <b>{issued} keluar · {Math.max(0, item.limit - issued)}/{item.limit} sisa</b>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="table-responsive admin-history-table-wrap">
                <table className="admin-history-table">
                  <thead>
                    <tr>
                      <th>Waktu (WIB)</th>
                      <th>Hadiah</th>
                      <th>Kode</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.length ? filteredHistory.map((spin) => (
                      <tr key={spin.id}>
                        <td>{formatSpinDateTimeWib(spin)} WIB</td>
                        <td><strong>{spin.prizeName}</strong></td>
                        <td>
                          {spin.code}
                          {spin.reconstructed && <small className="history-reconstructed-note">Arsip · bukan kode klaim</small>}
                        </td>
                        <td>{spin.reconstructed ? "Rekonstruksi" : spin.status}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4}>
                          {data.history.length
                            ? "Tidak ada catatan pada tanggal ini."
                            : "Belum ada riwayat sejak 29 Oktober 2026."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
          </>
        )}
      </div>
    </dialog>
  );
}
