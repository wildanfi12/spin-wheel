# HOWELL SPIN & WIN

Game booth INDOCOMTECH 2026 untuk PT Howell Niaga Indonesia. React + TypeScript + Vite, SVG wheel, Motion, Tailwind CSS, Lucide, Canvas Confetti, Web Audio, IndexedDB, dan PWA. Target: https://wildanfi12.github.io/spin-wheel/

## Menjalankan

Node.js 22.12+ dan pnpm 10 diperlukan.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm preview
```

Route game `/spin-wheel/`; dashboard `/spin-wheel/#/admin`. Hash routing aman untuk refresh pada GitHub Pages. Semua aset penting dibundel lokal, tanpa font CDN.

## Operasional booth

1. Buka dashboard melalui ikon pengaturan dan pilih **Masuk sebagai petugas**.
2. Isi stok aktual, gambar hadiah jika tersedia, ketentuan diskon, dan masa berlaku. Stok default **100 unit per kategori adalah data contoh**, bukan stok perusahaan.
3. Preview dan simpan konfigurasi. Kembali ke permainan; satu sesi awal tersedia.
4. Pengunjung menekan **SPIN NOW**. Hasil dan pengurangan stok disimpan atomik sebelum animasi 6,5 detik dimulai.
5. Cocokkan kode klaim di **Histori & klaim**, serahkan hadiah, lalu konfirmasi **Klaim**.
6. Di **Ringkasan**, pilih **Peserta berikutnya**. Sesi hanya dapat dilanjutkan setelah klaim atau void.
7. Void hasil yang belum diklaim dengan alasan; stok dikembalikan tepat sekali dan audit tersimpan. Hadiah yang sudah diklaim tidak bisa di-void.
8. Ekspor backup JSON setiap akhir hari; ekspor CSV untuk laporan berformat waktu Asia/Jakarta.

Suara dimulai setelah interaksi dan dinonaktifkan secara default. Kontrol fullscreen bergantung dukungan browser; iPhone dapat menggunakan Add to Home Screen. Mode kiosk menyembunyikan informasi sekunder, bukan mengunci sistem operasi.

## Peluang dan keandalan

Default 10 segmen: baju 10%, diskon 30%, kabel 30%, payung 20%, earphone 10%. Bobot berlaku per segmen. Dashboard dan informasi peluang publik menunjukkan peluang kategori sesungguhnya setelah stok/nonaktif/bobot diperhitungkan. Segmen tetap sama besar; luasnya tidak mengindikasikan peluang ketika bobot berbeda. Hadiah habis/nonaktif dikeluarkan dari roda sesi baru. Snapshot roda sesi berjalan dipertahankan agar jarum tetap cocok dengan hasil tersimpan.

Pemilihan memakai Web Crypto. Sudut akhir dihitung berdasarkan pusat segmen, dengan enam putaran penuh dan easing akselerasi/deselerasi. Label dikontrarotasi agar tegak. Reduced motion mempersingkat animasi dan menonaktifkan confetti. IndexedDB read-write transaction menserialisasi pembacaan dan perubahan antar tab. Refresh saat animasi menampilkan hasil yang sama, tidak mengambil stok lagi. Kode unik format `HW-` + 12 digit heksadesimal diperiksa terhadap histori.

## Penyimpanan dan batas keamanan

**Mode satu perangkat saja.** Stok, sesi, gambar upload dan histori hanya berada di browser/origin ini; tidak ada sinkronisasi lintas perangkat. Browser lain, mode privat, domain lain, atau penghapusan site data berarti penyimpanan berbeda/hilang. Backup JSON adalah sarana pemulihan. Tidak ada data pribadi peserta yang diminta.

Dashboard petugas memakai konfirmasi masuk lokal, **bukan autentikasi atau keamanan kuat**. Jangan menggunakan ini sebagai sistem anti-kecurangan di perangkat publik tanpa pengawasan. Tidak ada password/token hardcoded. Untuk lintas perangkat atau keamanan sungguhan, ganti service penyimpanan dengan backend yang memvalidasi transaksi stok, otorisasi petugas, dan klaim secara terpusat. Jaga domain deployment tetap sama agar histori lokal tetap dapat diakses.

PWA precache tersedia pada **build produksi** setelah service worker selesai memasang cache. Kunjungan pertama membutuhkan koneksi. Kunjungi ulang aplikasi online, kemudian uji offline sebelum membuka booth. Update service worker menunggu tab lama ditutup agar tidak memotong sesi. Upload gambar tersimpan sebagai data URL dalam IndexedDB; PNG/JPG/WebP maksimal 1,5 MB per gambar. Backup maksimal 15 MB. Browser dapat menghapus storage karena kuota, maka backup tetap wajib.

## Deployment

Workflow `.github/workflows/deploy.yml` menjalankan typecheck, lint, unit test, production build, upload artifact, dan deploy melalui GitHub Pages resmi. Di GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Push ke `main` memicu workflow; tersedia juga workflow_dispatch. Tidak memakai force push. Vite base sudah `/spin-wheel/`.

## Struktur

- `src/engine.ts`: pemilihan berbobot, matematika rotasi, transisi klaim/void.
- `src/storage.ts`: adapter IndexedDB dan transaksi atomik.
- `src/model.ts`: konfigurasi awal dan validasi backup.
- `src/Wheel.tsx`: SVG roda, label tegak, ikon/gambar hadiah.
- `src/App.tsx`: permainan, sesi, audio, modal hasil.
- `src/Admin.tsx`: stok, segmen, peluang, histori, backup dan pengaturan.
- `src/styles.css`: desain responsif hitam/kuning/putih.
- `tests/engine.test.ts`: pengujian probabilitas, sudut, stok, klaim, transaksi serentak dan pemulihan.

## Aset dan referensi

Logo asli diambil dari website yang diberikan pemilik proyek: https://wildanfi12.github.io/Howell/ (`assets/howell-logo.png`, `howell-logo-white.png`, `howell-icon-swirl.png`). Identitas visual pameran dirujuk dari https://indocomtech.net/; tidak menyalin gambar pameran. Logo tetap milik pemilik merek dan penggunaannya dibatasi untuk aplikasi HOWELL ini, bukan lisensi redistribusi umum. Ikon hadiah Lucide (ISC) adalah ilustrasi placeholder, bukan foto produk asli; dapat diganti melalui admin. Audio disintesis lokal, tanpa aset audio pihak ketiga.
