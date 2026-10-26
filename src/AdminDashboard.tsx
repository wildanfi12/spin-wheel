import { useEffect, useRef, useState } from "react";
import { X, RefreshCw, Shield, Clock, AlertTriangle, CheckCircle2, FastForward } from "lucide-react";
import { fetchAdminStatus, simulateTimeApi, type AdminStatusResponse } from "./api";

interface AdminDashboardProps {
  open: boolean;
  onClose: () => void;
}

export function AdminDashboard({ open, onClose }: AdminDashboardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<AdminStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [actionMessage, setActionMessage] = useState<string>("");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchAdminStatus();
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal memuat status dari server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const d = dialogRef.current;
    if (open) {
      if (d && !d.open) {
        d.showModal();
      }
      loadData();
      const interval = setInterval(loadData, 2000);
      return () => clearInterval(interval);
    } else {
      if (d && d.open) {
        d.close();
      }
    }
  }, [open]);

  const handleSimulate = async (isoString: string | null, label: string) => {
    setLoading(true);
    setActionMessage("");
    try {
      const res = await simulateTimeApi(isoString);
      setData(res);
      setActionMessage(`Berhasil diset ke: ${label}`);
      setTimeout(() => setActionMessage(""), 4000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal mengatur simulasi waktu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="admin-dialog"
      aria-labelledby="admin-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="admin-modal">
        <header className="admin-header">
          <div className="admin-title-wrap">
            <div className="admin-eyebrow">
              <Shield size={14} /> SISTEM KONTROL BACKEND · ASIA/JAKARTA (WIB)
            </div>
            <h2 id="admin-title">Dashboard Admin & Kuota TWS HW01</h2>
          </div>
          <div className="admin-header-actions">
            <button
              className="refresh-btn"
              onClick={loadData}
              disabled={loading}
              title="Perbarui data"
            >
              <RefreshCw size={14} className={loading ? "spin-icon" : ""} />
            </button>
            <button
              className="close-btn"
              onClick={onClose}
              aria-label="Tutup Dashboard"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        {error && <div className="admin-error"><AlertTriangle size={16} /> {error}</div>}
        {actionMessage && <div className="admin-success"><CheckCircle2 size={16} /> {actionMessage}</div>}

        {data && (
          <div className="admin-content">
            {/* Top Cards Grid */}
            <div className="admin-cards-grid">
              {/* Card 1: Waktu Operasional */}
              <div className="admin-card">
                <small>TANGGAL OPERASIONAL (WIB)</small>
                <h3>{data.operationalDateDisplay}</h3>
                <div className="server-clock">
                  <Clock size={13} /> {data.serverTimeWib}
                </div>
                {data.isSimulatedTime && (
                  <span className="badge badge-warning">Simulasi Waktu Aktif</span>
                )}
              </div>

              {/* Card 2: Kuota Harian */}
              <div className="admin-card">
                <small>KUOTA TWS HARIAN</small>
                <div className="metric-row">
                  <span className="metric-large">
                    {data.twsWinnersToday} / {data.quotaTwsDaily}
                  </span>
                  <span className="metric-unit">Unit Terpakai</span>
                </div>
                <div className="status-badge-wrap">
                  {data.twsWinnersToday === 0 ? (
                    <span className="badge badge-success">
                      <CheckCircle2 size={12} /> {data.twsStatus}
                    </span>
                  ) : (
                    <span className="badge badge-danger">
                      <AlertTriangle size={12} /> {data.twsStatus}
                    </span>
                  )}
                </div>
              </div>

              {/* Card 3: Reset Berikutnya */}
              <div className="admin-card">
                <small>WAKTU RESET BERIKUTNYA</small>
                <h3>Pukul 00.00 WIB</h3>
                <div className="reset-sub">{data.nextResetTimeWib}</div>
                <div className="countdown-pill">
                  Reset dalam: <b>{data.resetCountdown.formatted}</b>
                </div>
              </div>
            </div>

            {/* Probability Comparison Table */}
            <div className="admin-section">
              <div className="section-header">
                <h3>Probabilitas Hadiah (Dasar vs Aktual Saat Ini)</h3>
                <span className="section-note">
                  {data.twsWinnersToday > 0
                    ? "TWS habis hari ini → Probabilitas TWS menjadi 0%, sisa 97% dinormalisasi ke 100% secara proporsional."
                    : "Kuota TWS tersedia → Menggunakan probabilitas dasar 100%."}
                </span>
              </div>
              <div className="table-responsive">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Hadiah</th>
                      <th>SKU</th>
                      <th>Probabilitas Dasar</th>
                      <th>Probabilitas Aktual</th>
                      <th>Status Alokasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.probabilitiesFormatted.map((item) => {
                      const isTws = item.id === "tws";
                      const isExhaustedTws = isTws && data.twsWinnersToday > 0;
                      return (
                        <tr
                          key={item.id}
                          className={isTws ? "highlight-row" : ""}
                        >
                          <td>
                            <strong>{item.name}</strong>
                          </td>
                          <td>
                            <code>
                              {item.id === "tws"
                                ? "HW01"
                                : item.id === "cable"
                                  ? "AC01"
                                  : item.id === "hdmi"
                                    ? "H0103"
                                    : item.id === "earphone"
                                      ? "HW03"
                                      : "—"}
                            </code>
                          </td>
                          <td>
                            <span className="base-percent">{item.basePercent}</span>
                          </td>
                          <td>
                            <span
                              className={`actual-percent ${isExhaustedTws ? "zero-percent" : "active-percent"}`}
                            >
                              {item.actualPercent}
                            </span>
                          </td>
                          <td>
                            {isTws ? (
                              isExhaustedTws ? (
                                <span className="status-pill status-off">
                                  0/1 (Habis Hari Ini)
                                </span>
                              ) : (
                                <span className="status-pill status-on">
                                  1/1 (Siap Dimenangkan)
                                </span>
                              )
                            ) : (
                              <span className="status-pill status-normal">
                                {data.twsWinnersToday > 0
                                  ? "Disesuaikan Proporsional"
                                  : "Standar"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>
                        <b>TOTAL PROBABILITAS</b>
                      </td>
                      <td>
                        <b>100.00%</b>
                      </td>
                      <td>
                        <b style={{ color: "#ffd600" }}>100.00%</b>
                      </td>
                      <td>
                        <span className="status-pill status-ok">Tepat 100%</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Riwayat Pemenang TWS Berdasarkan Tanggal WIB */}
            <div className="admin-section">
              <div className="section-header">
                <h3>Riwayat Pemenang TWS Berdasarkan Tanggal WIB</h3>
                <span className="section-note">
                  Maksimal 1 pemenang TWS per tanggal kalender Asia/Jakarta.
                </span>
              </div>
              <div className="table-responsive">
                {data.twsWinnersHistory.length === 0 ? (
                  <div className="empty-history">
                    Belum ada pemenang TWS HW01 yang tercatat dalam sistem.
                  </div>
                ) : (
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Tanggal (WIB)</th>
                        <th>Kode SPIN ID</th>
                        <th>Hadiah</th>
                        <th>SKU</th>
                        <th>Waktu Menang (WIB)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.twsWinnersHistory.map((winner) => (
                        <tr key={winner.id}>
                          <td>
                            <span className="date-tag">{winner.dateWib}</span>
                          </td>
                          <td>
                            <strong className="code-text">{winner.code}</strong>
                          </td>
                          <td>{winner.prizeName}</td>
                          <td>
                            <code>{winner.sku || "HW01"}</code>
                          </td>
                          <td>{winner.wonAtWib}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Simulation Testing Panel (Dev / QA Verification) */}
            <div className="admin-section simulation-box">
              <div className="section-header">
                <h3 style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <FastForward size={16} /> Panel Simulasi Waktu Pengujian (Reset 00.00 WIB)
                </h3>
                <span className="section-note">
                  Gunakan untuk menguji pergantian hari dan reset otomatis tanpa menunggu tengah malam nyata.
                </span>
              </div>
              <div className="simulation-buttons">
                <button
                  className="sim-btn"
                  onClick={() => {
                    const [y, m, d] = data.operationalDate.split("-").map(Number);
                    const sim = new Date(Date.UTC(y, m - 1, d, 16, 59, 50));
                    handleSimulate(sim.toISOString(), "23:59:50 WIB (10 detik sebelum reset)");
                  }}
                  disabled={loading}
                >
                  ⏱ Simulasi 23:59:50 WIB (Sebelum Reset)
                </button>
                <button
                  className="sim-btn"
                  onClick={() => {
                    const [y, m, d] = data.operationalDate.split("-").map(Number);
                    const sim = new Date(Date.UTC(y, m - 1, d, 17, 0, 1));
                    handleSimulate(sim.toISOString(), "00:00:01 WIB (Hari Baru / Kuota Kembali)");
                  }}
                  disabled={loading}
                >
                  🌙 Simulasi 00:00:01 WIB (Setelah Reset)
                </button>
                <button
                  className="sim-btn sim-btn-reset"
                  onClick={() => handleSimulate(null, "Waktu Nyata Server")}
                  disabled={loading || !data.isSimulatedTime}
                >
                  🔄 Kembalikan ke Waktu Nyata
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
