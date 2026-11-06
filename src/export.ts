import type { Spin, State } from "./model";
import { formatSpinDateTimeWib } from "./history";

export function exportHistoryCsv(spins: readonly Spin[], state: State, filename: string) {
  const cell = (value: string) => {
    const safe = /^[=+@-]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const rows = [
    ["Spin ID", "Hadiah", "SKU", "Waktu Asia/Jakarta", "Status"],
    ...[...spins].reverse().map((spin) => [
      spin.code,
      spin.prizeName,
      spin.sku || state.prizes.find((prize) => prize.id === spin.prizeId)?.sku || "-",
      `${formatSpinDateTimeWib(spin)} WIB`,
      spin.status,
    ]),
  ];
  // Excel in Indonesian locales expects semicolon separators. The sep marker
  // keeps every field in its own column while preserving commas in text.
  const csv = `\uFEFFsep=;\r\n${rows.map((row) => row.map(cell).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}

export function exportHistoryPdf(spins: readonly Spin[], title = "HOWELL SPIN & WIN · Riwayat Hadiah") {
  const rows = [...spins].reverse().map((spin, index) => `<tr>
    <td>${String(index + 1).padStart(3, "0")}</td>
    <td><strong>${escapeHtml(spin.prizeName)}</strong></td>
    <td>${escapeHtml(spin.code)}</td>
    <td>${escapeHtml(`${formatSpinDateTimeWib(spin)} WIB`)}</td>
    <td>${escapeHtml(spin.status)}</td>
  </tr>`).join("");
  const report = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>
    @page{size:A4 landscape;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#151515;margin:0}h1{font-size:22px;margin:0 0 4px}p{color:#666;margin:0 0 18px;font-size:11px}.brand{color:#d2a900;font-weight:700;letter-spacing:.08em}table{width:100%;border-collapse:collapse;font-size:11px}th{background:#202020;color:#fff;text-align:left;padding:9px}td{border-bottom:1px solid #ddd;padding:8px}tr:nth-child(even){background:#fafafa}.foot{margin-top:18px;color:#777;font-size:10px}@media print{button{display:none}}
  </style></head><body><div class="brand">HOWELL SPIN & WIN</div><h1>${escapeHtml(title)}</h1><p>Catatan permanen · Waktu Asia/Jakarta (WIB) · Total ${spins.length} putaran</p>
  <table><thead><tr><th>No.</th><th>Hadiah</th><th>Kode</th><th>Waktu (WIB)</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Belum ada riwayat.</td></tr>'}</tbody></table><div class="foot">Dokumen dibuat dari aplikasi HOWELL SPIN & WIN.</div><script>window.onload=()=>{window.focus();window.print();}</script></body></html>`;
  const popup = window.open("", "howell-history-pdf", "width=1100,height=760");
  if (!popup) throw new Error("Popup export PDF diblokir browser. Izinkan pop-up untuk situs ini.");
  popup.document.open();
  popup.document.write(report);
  popup.document.close();
}
