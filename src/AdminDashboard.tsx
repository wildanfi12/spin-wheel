import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Clock,
  PackageCheck,
  RefreshCw,
  Shield,
  X,
} from "lucide-react";
import { fetchAdminStatus, type AdminStatusResponse } from "./api";

interface AdminDashboardProps {
  open: boolean;
  onClose: () => void;
}

export function AdminDashboard({ open, onClose }: AdminDashboardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<AdminStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      return;
    }

    if (dialog && !dialog.open) dialog.showModal();
    void loadData();
    const interval = window.setInterval(() => void loadData(), 5000);
    return () => window.clearInterval(interval);
  }, [open]);

  const totalLimit = data?.inventory.reduce((sum, row) => sum + row.limit, 0) ?? 0;
  const totalRemaining =
    data?.inventory.reduce((sum, row) => sum + row.remaining, 0) ?? 0;

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
              className="close-btn"
              onClick={onClose}
              aria-label="Tutup dashboard"
            >
              <X size={18} />
            </button>
          </div>
        </header>

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
              sudah keluar tetap tersedia di menu History.
            </p>
          </div>
        )}
      </div>
    </dialog>
  );
}
