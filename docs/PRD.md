# PRD: Ritme — Timer Fokus Multi-Metode

*Nama kerja, ganti sesuka lu. Versi 1.0, 1 Oktober 2026.*

## 1. Ringkasan

Ritme adalah web app timer fokus yang jalan penuh di browser dan di-deploy ke Vercel. Bedanya dari timer pomodoro biasa: (a) ada lima metode kerja, bukan cuma 25/5; (b) timer bisa dipindah ke **jendela mini always-on-top** supaya tetap kelihatan dan tetap akurat saat pindah tab/app; (c) tampilannya sengaja dibuat seperti instrumen, bukan template SaaS.

**Target user:** mahasiswa dan pekerja yang kerja di laptop dan sering pindah tab (koding, nulis, belajar). **Tujuan:** timer yang akurat, enak dipakai tiap hari, tanpa akun, data tetap di perangkat.

## 2. Tujuan dan Non-Tujuan

| Tujuan v1 | Non-tujuan v1 |
| --- | --- |
| Timer akurat walau tab di background | Akun, login, sync lintas device (masuk v2) |
| 5 metode kerja + custom | Fitur sosial, leaderboard, ranking |
| Jendela mini (PiP) + fallback | Gamifikasi (hewan peliharaan, confetti, XP) |
| Task list, statistik, PWA offline | Fitur "AI coach" atau rekomendasi otomatis |

## 3. Metode Kerja

| Metode | Fokus | Istirahat | Perilaku timer |
| --- | --- | --- | --- |
| **Pomodoro** | 25 mnt | 5 mnt (15 mnt tiap 4 sesi) | Hitung mundur, siklus 4 sesi |
| **52/17** | 52 mnt | 17 mnt | Hitung mundur, tanpa istirahat panjang |
| **Ultradian** | 90 mnt | 20 mnt | Hitung mundur; saran maksimal 3–4 sesi/hari |
| **Flowtime** | Fleksibel | Proporsional | Fokus **hitung maju**. User tekan "Selesai" kapan pun, istirahat dihitung otomatis dari lama fokus. Tidak ada alarm saat fokus |
| **Time Boxing** | Berbasis jam | Fleksibel | User menyusun blok waktu di timeline harian (mis. 09.00–10.30). Timer menghitung mundur ke akhir blok yang sedang berjalan |
| **Custom** | Bebas | Bebas | User tentukan sendiri, bisa disimpan sebagai preset |

**Aturan istirahat Flowtime (default, bisa diubah):** fokus \< 25 mnt → istirahat 5 mnt; 25–50 → 8; 50–90 → 10; > 90 → 15.

**Time Boxing:** blok dibuat lewat drag di timeline, tiap blok bisa dikaitkan ke task. Kalau blok berakhir, tampil prompt "lanjut / geser blok berikutnya / selesai". Blok yang overrun ditandai, bukan dihapus.

Semua metode dibuat sebagai konfigurasi pada satu mesin timer (pola strategy), supaya menambah metode baru tidak mengubah inti kode.

## 4. Fitur dan Prioritas

**P0, wajib untuk rilis pertama**

| ID | Fitur | Kriteria selesai |
| --- | --- | --- |
| F1 | Mesin timer berbasis timestamp | Pakai `endTime = Date.now() + sisa`, bukan decrement per detik. Drift \< 1 detik per jam, termasuk saat tab di background, laptop sleep, dan resume |
| F2 | Timer jalan di Web Worker | Tick tidak ikut di-throttle browser |
| F3 | Pemilih metode + pengaturan durasi | Ganti metode saat idle tanpa reload; durasi tersimpan |
| F4 | Jendela mini | Lihat bagian 6 |
| F5 | Notifikasi sesi selesai | Suara + Web Notification + judul tab berubah (`12:34 · Fokus`). Audio di-unlock saat interaksi pertama user |
| F6 | Counter sesi dan siklus | Kelihatan posisi sesi di siklus (mis. 3 dari 4) |
| F7 | Keyboard shortcut | Spasi = mulai/jeda, R = reset, S = lewati, M = jendela mini, 1–5 = ganti metode |
| F8 | Pulih setelah reload/tutup tab | State timer dipulihkan dari penyimpanan lokal |

**P1, target v1.1**

| ID | Fitur |
| --- | --- |
| F9 | Task list sederhana; tiap sesi fokus dikaitkan ke satu task; hitung jumlah sesi per task |
| F10 | Statistik harian/mingguan: total jam fokus, jumlah sesi, per metode, per task. Disimpan lokal |
| F11 | Streak harian (hari berturut-turut dengan minimal 1 sesi selesai) |
| F12 | Tema terang/gelap mengikuti sistem + pilihan manual |
| F13 | Pilihan suara alarm dan suara ambient (hujan, kipas, brown noise), semua file lokal |
| F14 | Wake Lock saat timer jalan |
| F15 | PWA: bisa di-install, jalan offline |
| F16 | Time Boxing penuh (timeline, drag blok) |

**P2, v2**

| ID | Fitur |
| --- | --- |
| F17 | Login + sync lintas device (Supabase) |
| F18 | Mode strict: peringatan kalau terlalu sering jeda/skip |
| F19 | Export CSV, import backup |
| F20 | Bahasa Indonesia / Inggris |

## 5. Alur Pengguna Utama

1. Buka web → langsung di layar timer, metode terakhir terpilih, tombol Mulai jelas.
2. Pilih task (opsional) → Mulai.
3. Pindah tab → klik "Jendela mini" sekali (atau tekan M). Timer muncul kecil di atas semua window.
4. Sesi selesai → bunyi + notifikasi → tombol utama berubah jadi "Mulai istirahat".
5. Akhir hari → buka Statistik, lihat total fokus.

## 6. Jendela Mini

- **Cara utama:** Document Picture-in-Picture API (`documentPictureInPicture.requestWindow()`). Window kecil always-on-top, isinya HTML/CSS kita sendiri. Chrome/Edge desktop.
- **Fallback:** `window.open()` popup kecil (tidak always-on-top) untuk browser lain, ditambah hitung mundur di judul tab.
- Window hanya bisa dibuka lewat aksi user (klik/shortcut), tidak bisa otomatis.
- Salin stylesheet halaman utama ke window mini; logika timer tetap satu sumber di halaman utama dan window mini hanya menampilkan state. Kalau tab utama ditutup, window mini ikut tertutup, jadi tampilkan peringatan sebelum tab ditutup saat timer jalan.
- Isi window mini: angka waktu, label mode, satu tombol utama (mulai/jeda), garis progres tipis. Tanpa menu, tanpa dekorasi. Ukuran awal sekitar 300×180.

## 7. Arah UI (anti "AI slop")

**Konsep:** instrumen, bukan dashboard. Bayangkan timer dapur analog atau alat ukur: satu hal dominan di layar, yaitu waktu.

**Yang dihindari secara eksplisit**

- Gradien ungu-biru, teks bergradien, glassmorphism, glow
- Lingkaran progres dengan gradien dan bayangan tebal
- Kartu bersudut membulat besar berlapis-lapis di semua tempat
- Emoji tomat / ikon sparkle / ilustrasi 3D generik
- Tampilan bawaan shadcn tanpa diubah, font Inter di semua tempat
- Copy bernada motivasi ("Ayo hancurkan targetmu!"), confetti, animasi memantul

**Yang dipakai**

- **Warna:** latar kertas hangat `#F2EEE6`, tinta `#1B1A17`. Mode gelap pakai hitam hangat `#14130F`, bukan hitam murni atau abu kebiruan. Satu aksen per mode kerja, dari palet terbatas: merah-oranye bata (fokus), hijau lumut (istirahat), kuning oker (istirahat panjang). Aksen hanya dipakai di tombol utama dan progres.
- **Tipografi:** maksimal dua keluarga. Angka waktu: font mono atau grotesk tebal dengan `font-variant-numeric: tabular-nums`, ukuran sangat besar (mis. `clamp(6rem, 22vw, 20rem)`) supaya angka tidak bergeser tiap detik. Teks UI: satu sans netral. Serif italic boleh dipakai sangat hemat untuk label seperti nama sesi.
- **Progres:** garis tipis horizontal selebar viewport, ditambah deret segmen untuk siklus (satu segmen per sesi), bukan ring.
- **Layout:** angka di tengah dan dominan; kontrol kecil dan jarang; task list dan statistik di panel samping yang bisa ditutup. Spasi lega, garis tipis 1 px sebagai pemisah, bayangan nyaris tidak ada.
- **Motion:** hampir nol. Pergantian mode = transisi warna latar 300 ms. Angka tidak dianimasikan. Hormati `prefers-reduced-motion`.
- **Copy:** pendek, datar, konkret. "Fokus", "Istirahat 5 menit", "Sesi 3 dari 4".
- **Aksesibilitas:** kontras minimal WCAG AA, semua kontrol bisa diakses keyboard, `aria-live` untuk perubahan status (bukan tiap detik), fokus ring terlihat jelas.

**Layar:** Timer (utama), Task (panel), Time Boxing (timeline harian), Statistik, Pengaturan, Jendela mini.

Saran proses: bikin satu layar timer di Figma/langsung di kode dulu, putuskan font dan palet, baru bangun sisanya. Jangan mulai dari komponen library.

## 8. Stack Teknis

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Framework | **Vite + React + TypeScript** | App ini murni client-side, tidak perlu SSR. Worker dan PiP lebih sederhana. Deploy ke Vercel tetap mulus (Next.js juga bisa kalau lu lebih nyaman) |
| Styling | Tailwind CSS + CSS variables untuk token tema | Cepat, tapi token warna/tipografi didefinisikan sendiri, bukan default |
| State | Zustand | Ringan, cocok untuk state timer |
| Penyimpanan | IndexedDB lewat Dexie (task, sesi, statistik); localStorage untuk setting kecil | Data terstruktur dan bisa di-query |
| Timer | Web Worker + state machine (XState atau reducer manual) | Akurat dan mudah diuji |
| Chart | SVG buatan sendiri atau uPlot | Statistik sederhana, hindari library besar |
| PWA | vite-plugin-pwa | Service worker, manifest, offline |
| Tes | Vitest (mesin timer), Playwright (alur utama) | Mesin timer wajib diuji dengan fake timers |
| Deploy | Vercel (preview per PR, produksi dari `main`) | Sesuai rencana |
| v2 | Supabase (auth + Postgres) untuk sync | Gratis untuk skala kecil |

## 9. Model Data (ringkas)

```
Session  { id, method, kind: focus|break|longBreak, startedAt, endedAt, plannedMs, actualMs, taskId?, completed }
Task     { id, title, createdAt, doneAt?, sessionCount }
Block    { id, date, startMin, endMin, taskId?, status }          // Time Boxing
Preset   { id, name, focusMs, breakMs, longBreakMs?, cycle? }
Settings { theme, sound, autoStartNext, notifications, wakeLock, lastMethod }
TimerState { method, phase, endTime?, elapsedMs?, cycleIndex, running }  // dipulihkan saat reload
```

## 10. Persyaratan Non-Fungsional

- **Akurasi:** drift \< 1 detik/jam, termasuk tab di background dan resume dari sleep
- **Performa:** Lighthouse Performance dan Accessibility ≥ 95; JS awal \< 150 KB gzip
- **Privasi:** semua data lokal di v1; tanpa tracker pihak ketiga
- **Browser:** Chrome/Edge penuh (termasuk PiP); Firefox/Safari dengan fallback popup
- **Offline:** setelah kunjungan pertama, seluruh fitur P0 jalan tanpa internet

## 11. Risiko dan Catatan Teknis

| Risiko | Mitigasi |
| --- | --- |
| Autoplay audio diblokir browser | Unlock AudioContext pada interaksi pertama; tampilkan indikator bila suara belum aktif |
| Izin notifikasi ditolak | Tetap bunyi + judul tab; jelaskan cara mengaktifkan di pengaturan |
| PiP tidak ada di Firefox/Safari | Deteksi fitur (`'documentPictureInPicture' in window`), pakai fallback |
| Laptop sleep saat timer jalan | Hitung dari timestamp saat bangun; kalau sudah lewat, langsung tampilkan sesi selesai |
| Time Boxing makan waktu build terlalu banyak | Rilis dulu sebagai P1 (F16); v1 awal cukup 4 metode lain |

## 12. Milestone (estimasi untuk satu orang, kerja sela kuliah)

| Tahap | Isi | Estimasi |
| --- | --- | --- |
| M0 | Setup repo, Vite, deploy kosong ke Vercel, token desain (warna/font) | 1 hari |
| M1 | Mesin timer + Worker + metode hitung mundur + Flowtime + tes | 3–4 hari |
| M2 | Layar timer final, shortcut, notifikasi, pemulihan state | 3 hari |
| M3 | Jendela mini + fallback | 2 hari |
| M4 | Task list, statistik, streak, tema | 4–5 hari |
| M5 | Time Boxing, PWA, polishing, aksesibilitas, Lighthouse | 4–5 hari |
| v2 | Sync akun, mode strict, export | menyusul |

## 13. Metrik Keberhasilan

- Dipakai sendiri tiap hari selama 2 minggu tanpa balik ke timer lain
- Tes drift lolos (jalan 60 menit di tab background, selisih \< 1 detik)
- Lighthouse ≥ 95 di Performance dan Accessibility
- Orang lain yang lihat bilang "ini bukan template", bukan "ini keren banget AI"

## 14. Pertanyaan Terbuka

1. Stack final: Vite+React atau Next.js?
2. Bahasa antarmuka v1: Indonesia saja atau langsung dua bahasa?
3. Nama final dan identitas visual (logo/wordmark)?
4. Time Boxing masuk rilis pertama atau menyusul di v1.1?