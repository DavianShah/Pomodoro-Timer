# Ritme

Timer fokus multi-metode. Jalan penuh di browser, tanpa akun, data tetap di perangkat.

Spesifikasi produk: `docs/PRD.md`. Arah desain: `DESIGN.md`.

## Menjalankan

```bash
npm install
npm run dev
```

## Perintah

| Perintah                        | Isi                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `npm run dev`                   | Server pengembangan Vite                                                       |
| `npm run build`                 | `tsc -b` lalu build produksi ke `dist/`                                        |
| `npm run preview`               | Sajikan hasil build                                                            |
| `npm run lint`                  | ESLint                                                                         |
| `npm run typecheck`             | TypeScript, kedua project                                                      |
| `npm run test`                  | Vitest (unit)                                                                  |
| `npm run test:e2e`              | Playwright (alur utama)                                                        |
| `npm run check`                 | lint + typecheck + unit test                                                   |
| `node scripts/check-tokens.mjs` | Sinkronkan `tokens.generated.ts` dan tabel warna `DESIGN.md` dari `tokens.css` |

## Tumpukan

Vite + React + TypeScript, Tailwind v4 (token lewat CSS variables), Zustand, Dexie
(IndexedDB), Vitest, Playwright, vite-plugin-pwa. Deploy ke Vercel.

## Struktur

```
docs/PRD.md          spesifikasi produk
DESIGN.md            arah desain dan token
src/app/             shell aplikasi, provider, konstanta
src/db/              skema Dexie
src/data/            repository Dexie (task, sesi)
src/lib/             utilitas murni (penyimpanan, waktu)
src/pwa/             pendaftaran service worker
src/screens/         layar
src/state/           store Zustand
src/styles/          token dan lapisan dasar
src/timer/           mesin timer murni, konfigurasi metode, Worker tick, jendela mini
public/              font, ikon, manifest
e2e/                 tes Playwright
```

## Aturan yang tidak boleh dilanggar

1. Timer berbasis `endTime` (timestamp), bukan pengurangan per detik. Tick di Web Worker.
2. Logika timer murni dan bisa diuji dengan fake timers. Metode kerja = konfigurasi pada
   satu mesin, bukan percabangan per metode.
3. UI mengikuti bagian 7 PRD dan `DESIGN.md`.
4. Maksimal dua keluarga font. Angka waktu memakai `tabular-nums`.
5. Teks antarmuka berbahasa Indonesia, singkat dan datar.
6. Satu milestone per sesi (`docs/PRD.md` bagian 12), tanpa fitur di luar permintaan.
7. Jangan tambah dependensi tanpa alasan tertulis.
8. Warna hanya dari `src/styles/tokens.css`. Setelah mengubahnya, jalankan
   `node scripts/check-tokens.mjs`. `src/lib/contrast.test.ts` mengunci setiap pasangan
   token pada WCAG AA, jadi token tidak bisa diturunkan kontrasnya tanpa tes gagal.

## Status milestone

| Tahap | Isi                                                      | Status  |
| ----- | -------------------------------------------------------- | ------- |
| M0    | Repo, Vite, token desain, manifest, deploy               | selesai |
| M1    | Mesin timer, Worker, semua metode, tes                   | selesai |
| M2    | Notifikasi sesi, counter sesi, shortcut, pemulihan state | selesai |
| M3    | Jendela mini (Document PiP) dan fallback popup           | selesai |
| M4a   | Task list (F9), lapisan data Dexie, pencatatan sesi      | selesai |
| M4b   | Statistik, streak, tema                                 | belum   |
| M5    | Time Boxing, PWA, polishing, Lighthouse                  | belum   |

## Uji manual: jendela mini PiP (Chrome/Edge)

Document Picture-in-Picture tidak bisa diuji headless. Jalur fallback
`window.open` (popup muncul, waktu sinkron, tombol popup mengendalikan
halaman utama, tutup popup mereset state) sudah dites Playwright. Jalur PiP
dicek manual:

1. `npm run build && npm run preview`, buka di Chrome/Edge desktop.
2. Klik "Jendela mini" atau tekan `M` → jendela 300×180 terbuka
   always-on-top. Halaman utama tidak reload; tidak ada timer kedua.
3. Klik Mulai → angka di jendela mini berjalan bersamaan; tombol utama di
   mini (Mulai/Jeda/Selesai/Mulai istirahat) mengendalikan halaman utama.
4. Lewati ke istirahat → aksen mini ikut berubah; ganti tema
   terang/gelap di halaman utama → mini ikut.
5. Fokus ke mini, tekan Spasi lalu `R` → toggle dan reset bekerja dari
   window mini.
6. Tutup mini lewat X → tombol "Jendela mini" kembali `aria-pressed="false"`.
7. Dengan timer jalan dan mini terbuka, reload tab utama → browser
   menampilkan peringatan. Timer jeda atau mini tertutup → tanpa peringatan.
8. Setelah reload: timer pulih seperti biasa, jendela mini tertutup (tidak
   dibuka otomatis).
9. Kalau PiP ditolak izinnya (mis. diblokir kebijakan browser), aksi yang
   sama otomatis jatuh ke popup kecil; kalau popup juga diblokir, layar
   utama menampilkan pesan "Popup diblokir — jendela mini tidak terbuka".
