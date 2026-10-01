# Desain: Ritme

Dokumen ini sumber arah visual. Aturan yang dipatuhi: arah dulu, baru komponen.
Filter anti-slop aktif dalam mode **during**; dial di bawah dipegang dari layar pertama
sampai terakhir.

## Design Read

> Membaca ini sebagai: instrumen waktu harian untuk pelajar dan pekerja yang sering
> pindah tab, dengan bahasa visual instrumen kertas (timer dapur analog, alat ukur),
> dial **ENERGY 1 / RHYTHM 2 / MOTION 1**.

Dial dijaga tetap rendah karena PRD bagian 7 melarangnya naik: gerak hampir nol,
angka tidak dianimasikan, satu hal dominan per layar.

## Identitas

- **Focal point:** angka waktu. Satu-satunya elemen besar di layar.
- **Aksen di momen kunci saja:** tombol utama dan garis progres. Selain itu tinta di kertas.
- **Motif identitas:** deret segmen siklus (satu segmen per sesi) yang juga dipakai
  sebagai wordmark ikon. Sama di layar, judul tab, dan jendela mini.
- **Nada copy:** pendek, datar, konkret. Label menyebut keadaan, bukan menyemangati.

## Warna

<!-- tokens:begin -->
| Token | Terang | Gelap | Catatan |
| --- | --- | --- | --- |
| `--paper` | `#f2eee6` | `#14130f` | Kertas hangat |
| `--paper-raised` | `#faf7f1` | `#1d1b16` | Permukaan naik |
| `--paper-sunken` | `#e6e0d4` | `#0e0d0a` | Bilah status |
| `--ink` | `#1b1a17` | `#f2eee6` | Tinta utama |
| `--ink-muted` | `#67614f` | `#b3a996` | Teks sekunder |
| `--line` | `#d3cbbb` | `#3a352b` | Garis pemisah |
| `--accent` | `#a8441f` | `#d4682f` | Aksen fokus |
| `--accent-focus` | `#a8441f` | `#d4682f` | Aksen grafik tanpa ikut fase |
| `--accent-break` | `#3f5c39` | `#6d8c62` | Aksen istirahat |
| `--accent-longbreak` | `#7c5a12` | `#c08f2c` | Aksen istirahat panjang |
<!-- tokens:end -->

Palet aktif = 2 netral (kertas, tinta) + 1 aksen per fase. Tiga nilai aksen adalah peran
fase, bukan tiga warna merek. Tabel di atas dibuat `scripts/check-tokens.mjs` langsung
dari `src/styles/tokens.css`, jadi nilai di dokumen ini tidak bisa melenceng dari CSS.
Aksen versi terang sengaja digelapkan sampai teks kertas di atasnya tembus 4.5:1
(`src/lib/contrast.test.ts` yang menjaganya).

`data-phase` di `<html>` yang mengganti `--accent`, jadi pergantian mode cukup satu
transisi warna latar 300 ms, bukan animasi angka.

## Tipografi

Maksimal dua keluarga, keduanya di-host sendiri (subset latin, variable, satu berkas per
keluarga → offline dan tanpa permintaan ke pihak ketiga).

- **JetBrains Mono** (`--font-mono`): angka waktu dan angka lain yang berubah.
  Monospace memberi lebar digit tetap tanpa mengandalkan dukungan `tabular-nums` tiap
  sistem, dan kemajuan teknismenya kecil karena hanya dipakai untuk angka.
  `font-variant-numeric: tabular-nums` tetap dipasang.
  Ukuran: `clamp(5.5rem, 21vw, 17rem)`.
- **Archivo** (`--font-sans`): seluruh teks UI. Grotesk kerja abad ke-19, sisi teknis
  tapi hangat; menghindari default agen (Inter, Geist, Space Grotesk) dan tetap netral
  untuk antarmuka.

Label kecil (`.label`) hanya untuk penanda struktural seperti nama aplikasi dan status
sistem, dinaikkan ke `ink-muted`, bukan abu tipis yang gagal kontras.

## Bentuk dan kedalaman

- Radius: 2 px (chip kecil), 4 px (kontrol), 8 px (permukaan). Tidak ada bentuk pil.
- Bayangan: nol sebagai default. Permukaan naik lewat perubahan nilai kertas dan garis
  1 px; kalau nanti butuh elevasi, satu elemen saja yang boleh.
- Ruang kosong yang besar adalah struktur, bukan sisa: angka dikelilingi udara,
  kontrol dikelompokkan kecil di bawahnya.

## Progres

Garis tipis horizontal selebar viewport (2 px) + deret segmen untuk siklus, satu segmen
per sesi. Bukan ring, bukan gradien, tanpa bayangan.

## Motion

Hampir nol. Yang bergerak hanya: pergantian warna latar saat fase berubah (300 ms,
`cubic-bezier(0.2, 0, 0, 1)`), transisi warna hover/fokus pada kontrol, dan pengisi
garis progres. Angka tidak dianimasikan. `prefers-reduced-motion: reduce` mematikan
semua durasi.

## Aksesibilitas

- Kontras teks minimal WCAG AA; target 7:1 untuk teks utama.
- Semua kontrol dijangkau keyboard, fokus ring 2 px warna aksen dengan offset 2 px.
- `aria-live` hanya untuk perubahan status (sesi mulai/selesai/ganti fase), bukan tiap detik.

## Yang sengaja tidak dipakai

Gradien ungu-biru, teks bergradien, glassmorphism, glow, ring progres, emoji atau ikon
sparkle, kartu membulat bertumpuk, bayangan lembut di semua elemen, badge kapsul di atas
judul, font Inter, copy motivasi, confetti, animasi memantul.
