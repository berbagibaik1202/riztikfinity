# Product Requirement Document (PRD) v2.2
## TikTok Live Game Controller & Interactive OBS Streaming Suite (RizTik)

---

### 1. Executive Summary & Objective

#### 1.1 Ringkasan Produk
Aplikasi **RizTik (TikTok Live Game Controller & Interactive OBS Streaming Suite)** adalah perangkat lunak desktop lokal (*local bridge & overlay suite*) yang menghubungkan siaran langsung TikTok Live dengan tiga modul utama:
1. **DirectInput Game Controller:** Mengubah interaksi penonton (Gift, Like, Chat) menjadi penekanan tombol keyboard hardware nyata (*DirectInput Scancode*) untuk mengendalikan game PC seperti Roblox (Obby, Survival, Racing).
2. **Interactive OBS Streaming Overlay & TTS Suite:** Menyediakan visual interaktif real-time untuk OBS Studio berupa karakter penonton berjalan, balon gift melayang, partikel love tap-tap, pembaca suara otomatis (TTS), dan daftar live komentar vertikal (`/comments`).
3. **Roblox Live Racing Arena (Interactive Game Engine):** Integrasi dua arah dengan Roblox Studio via `HttpService` yang menjalankan arena balapan Mobil dan Motor otomatis. Penonton dapat bergabung menjadi pembalap via chat "ikut" atau Gift Mawar, dan mengendalikan jalannya balapan menggunakan Gift (Mawar = Boost, Donut = Turbo, Topi = Tembak Roket).

#### 1.2 Tujuan Bisnis & Pengalaman Pengguna
* **Interaktivitas Maksimal:** Memberikan sensasi visual langsung kepada penonton bahwa kehadiran, komentar, dan gift mereka berdampak instan di layar siaran dan di dalam game streamer.
* **Monetisasi Tanpa Biaya Berlangganan:** Menggantikan layanan pihak ketiga berbayar (seperti TikFinity PRO) dengan solusi lokal mandiri yang gratis, aman, minim latensi, dan bebas kuota.
* **Kemudahan Penggunaan Streamer:** Menghubungkan OBS dan game dalam hitungan detik melalui antarmuka web lokal (`http://localhost:8000`) dan link Browser Source OBS transparan.

---

### 2. Target Pengguna (User Persona)
* **Streamer Game TikTok (Roblox, Minecraft, GTA, dll.):** Streamer yang mengadakan tantangan interaktif bersama penonton (contoh: *"Karakter jalan sendiri kalau dikirim Mawar!*").
* **Streamer Live Chatting / Reaksi:** Kreator yang memerlukan pembaca komentar otomatis suara robot (TTS) dan kotak live chat yang estetik di layar OBS tanpa gameplay.
* **Kreator Pemula:** Pengguna yang awam teknis dan membutuhkan setup instan sekali klik tanpa harus melakukan coding.

---

### 3. Scope & Batasan Teknis (Technical Scope)

#### 3.1 In-Scope (Sudah Diimplementasikan)
* Koneksi langsung ke WebSocket publik TikTok Live tanpa perlu login akun atau TikTok Studio.
* Antrean aksi FIFO (*Action Queue*) dengan spam throttling, combo multiplier, dan cooldown per aturan.
* Simulator tombol keyboard hardware *DirectInput* berbasis Win32 Scancode (kompatibel penuh dengan DirectX dan Roblox Client).
* Otomatis memfokuskan jendela game (*Auto-Focus Roblox*) sebelum penekanan tombol dilakukan.
* Hotkey darurat tingkat OS (*Global Panic Button*: `Ctrl + Shift + Q`) untuk membatalkan antrean dan melepas semua tombol.
* Web Dashboard lokal (`http://localhost:8000`) untuk konfigurasi rules, kontrol TTS, dan pemantauan log real-time.
* Halaman OBS Overlay Visual Interaktif (`http://localhost:8000/overlay`):
  * Karakter penonton berjalan bolak-balik dengan ukuran tetap (*fixed size*) dan arah teks normal (*anti-mirrored*).
  * Balon hadiah gift melayang dengan tali dan keranjang animasi.
  * Partikel love bertebaran saat tap-tap layar.
  * Balon obrolan (*speech bubble*) di atas kepala karakter saat berkomentar.
* Pembaca suara komentar otomatis (*Text-To-Speech / TTS*) Bahasa Indonesia dengan template kustom via Web Speech API.
* Halaman OBS Dedicated Live Comment List (`http://localhost:8000/comments`):
  * Daftar komentar bertumpuk dengan format standar: `Nama User : Komentarnya`.
  * Background 100% transparan, glassmorphism card, inisial/avatar badge warna-warni, auto-cap 20 item, dan anti-cache header untuk OBS CEF.

#### 3.2 Out-of-Scope (Bukan Target Saat Ini)
* Injeksi memori langsung ke proses game internal (menghindari deteksi anti-cheat Byfron/Hyperion).
* Kontrol game via perangkat mobile (Android/iOS) secara native tanpa perantara PC.
* Sistem pembayaran / payment gateway di luar ekosistem resmi TikTok Live.

---

### 4. Arsitektur Sistem & Alur Data

```
                            ┌─────────────────────────┐
                            │     TikTok Live API     │
                            │   (Room Webcast Stream) │
                            └────────────┬────────────┘
                                         │ WebSocket Payload (Gift, Like, Chat, Join)
                                         ▼
                            ┌─────────────────────────┐
                            │      TikTokManager      │
                            │  (app/tiktok_client.py) │
                            └────────────┬────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
                 ▼ (Game Actions)                                ▼ (Overlay Events)
      ┌─────────────────────────┐                     ┌─────────────────────────┐
      │      QueueManager       │                     │    FastAPI WebSocket    │
      │  (FIFO, Cooldown, Mult) │                     │     (ws://.../ws)       │
      └──────────┬──────────────┘                     └────────────┬────────────┘
                 │                                                 │
                 ▼                                 ┌───────────────┴───────────────┐
      ┌─────────────────────────┐                  ▼                               ▼
      │  DirectInput Simulator  │       ┌─────────────────────┐         ┌─────────────────────┐
      │  Auto-Focus Window &    │       │     OBS Overlay     │         │   OBS Comment Box   │
      │  Hardware Scancodes     │       │   (/overlay.html)   │         │  (/comments.html)   │
      └──────────┬──────────────┘       │  - Karakter Berjalan│         │  - Format:          │
                 │                      │  - Balon Gift       │         │    User : Komentar  │
                 ▼                      │  - Partikel Likes   │         │  - List Vertikal    │
      ┌─────────────────────────┐       │  - TTS Voice Reader │         │  - Transparan       │
      │   Roblox Game Client    │       └─────────────────────┘         └─────────────────────┘
      └─────────────────────────┘
```

---

### 5. Kebutuhan Fungsional (Functional Requirements)

#### 5.1 Modul Koneksi TikTok Live (FR-1)
* **FR-1.1:** Pengguna memasukkan username TikTok tanpa tanda `@` dan sistem langsung menyambungkan ke room live.
* **FR-1.2:** Menampilkan status koneksi real-time (*Connecting*, *Connected*, *Disconnected*, *Room ID*).
* **FR-1.3:** Terdapat tombol *Disconnect* untuk memutuskan koneksi secara manual.
* **FR-1.4:** Mekanisme penanganan error dan auto-reconnect saat stream terputus.

#### 5.2 Modul Pemetaan Aturan Game (FR-2)
* **FR-2.1: Trigger Types:**
  * **Gift Trigger:** Mencocokkan nama hadiah (contoh: `Rose`, `Doughnut`, `Whale`).
  * **Chat Trigger:** Mencocokkan kata kunci komentar (contoh: `!maju`, `!lompat`).
  * **Like Milestone:** Menjalankan aksi setiap akumulasi kelipatan $X$ like (contoh: tiap 10 like).
* **FR-2.2: Aksi Keyboard:**
  * Mendukung tombol `W`, `A`, `S`, `D`, `Space`, `Shift`, `E`, `R`, dll.
  * Mode: *Hold* (tahan durasi detik) atau *Tap* (ketukan instan).
  * Opsi *Multiplier/Combo*: Melipatgandakan durasi hold atau perulangan tap sesuai combo gift.
  * Opsi *Cooldown*: Mencegah tombol dipicu berulang kali dalam jeda waktu tertentu.

#### 5.3 Modul Eksekusi DirectInput & Window Focus (FR-3)
* **FR-3.1:** Menggunakan hardware scancode asli via `SendInput` / `pydirectinput` agar dikenali mesin DirectX Roblox.
* **FR-3.2: Window Focus Guard:** Kemampuan mendeteksi dan secara otomatis memfokuskan jendela Roblox sebelum tombol dieksekusi (`auto_focus_roblox`), sehingga input tidak nyasar saat streamer membuka OBS/browser.
* **FR-3.3: Emergency Stop:** Hotkey OS global **`Ctrl + Shift + Q`** serta tombol merah di dashboard untuk mengosongkan antrean seketika dan melepas semua tombol yang tertahan.

#### 5.4 Modul Local Web Dashboard (FR-4)
* **FR-4.1:** Dashboard responsif di `http://localhost:8000` dengan tema modern dark mode.
* **FR-4.2:** CRUD rules interaktif dengan penyimpanan otomatis ke `rules.json`.
* **FR-4.3:** Live terminal log aktivitas interaksi via WebSocket.
* **FR-4.4:** Grid tombol uji coba input DirectInput (*Test Key*) langsung ke game.
* **FR-4.5:** Tombol salin URL OBS sekali klik (*One-Click Copy URL*).

#### 5.5 Modul OBS Interactive Overlay Karakter & Balon (`/overlay`) (FR-5)
* **FR-5.1: Karakter Berjalan & Melayang Penonton (Join Event):**
  * Setiap penonton yang bergabung memunculkan avatar SVG unik yang bergerak di layar siaran.
  * **Gerakan 2D Dinamis (Dasar & Atas Layar Acak):** Karakter tidak hanya berjalan bolak-balik di dasar layar, tetapi juga dapat melayang/terbang ke atas layar secara acak (*floating/flying motion*) dengan easing akselerasi halus dan gelombang bobbing di udara, lalu meluncur kembali ke bawah secara dinamis.
  * **Ukuran Tetap (*Fixed Size*):** Karakter mempertahankan skala ukuran tetap (68px) dan tidak mengecil/hilang saat jendela OBS di-resize.
  * **Anti-Mirrored Text:** Saat karakter berputar arah (kiri $\leftrightarrow$ kanan), **hanya badan sprite karakter yang dibalik**, sedangkan teks nama (*nametag*) dan balon obrolan (*speech bubble*) **tetap normal (LTR) dan tidak terbalik**.
  * Viewport clamping dinamis menjaga karakter dan balon obrolan tidak keluar dari batas layar OBS.
* **FR-5.2: Balon Hadiah Gift (Gift Event):**
  * Memunculkan balon udara melayang warna-warni bertuliskan nama gift dan multiplier combo (contoh: `Rose x5`).
* **FR-5.3: Partikel Hati Tap-Tap (Like Event):**
  * Memunculkan partikel hati melayang acak saat penonton tap layar.
* **FR-5.4: Balon Chat Karakter (Comment Event):**
  * Jika penonton yang karakternya sedang ada di layar mengirim komentar, muncul balon obrolan di atas kepalanya.

#### 5.6 Modul Pembaca Komentar Suara Robot / TTS (FR-6)
* **FR-6.1:** Membacakan komentar penonton secara otomatis menggunakan Web Speech API Bahasa Indonesia (`id-ID`).
* **FR-6.2:** Pengaturan kustomisasi di dashboard:
  * Saklar On/Off TTS.
  * Format template kalimat (default: `{nickname} berkata: {comment}`).
  * Pengaturan volume suara (0% - 100%).
  * Pengaturan kecepatan bicara (0.8x - 1.4x).
* **FR-6.3:** Tombol uji coba simulasi suara TTS di Web Dashboard.

#### 5.7 Modul OBS Dedicated Live Comment List (`/comments` & `/chat`) (FR-7)
* **FR-7.1: Format Tampilan Wajib:**
  * Komentar ditampilkan dalam format baris vertikal: **`[Nama User] : [Komentarnya]`**.
* **FR-7.2: Desain OBS Transparan:**
  * Background 100% transparan, kartu pesan bergaya glassmorphism semi-transparan dengan drop shadow tebal agar terbaca di atas gameplay apapun.
* **FR-7.3: Avatar & Palet Warna Unik:**
  * Setiap user memiliki lingkaran inisial / foto profil dengan warna cerah unik berdasarkan hash nama.
* **FR-7.4: Arah Teks:**
  * Menggunakan CSS `direction: ltr !important` dan `unicode-bidi: normal !important` untuk menjamin teks tidak akan terbalik.
* **FR-7.5: Animasi & Manajemen Antrean:**
  * Efek animasi masuk *slide-in up* halus.
  * Membatasi maksimal 20 komentar terbaru di layar untuk menjaga performa rendering OBS.
* **FR-7.6: Kompatibilitas OBS Browser Source:**
  * Mengirimkan header HTTP `Cache-Control: no-cache, no-store, must-revalidate` agar browser CEF OBS selalu memuat versi terkini.
  * Menyertakan pesan tes status awal sehingga tampilan OBS tidak blank saat baru ditambahkan.

#### 5.8 Modul Multi-Profile Preset Game (FR-8)
* **FR-8.1: Preset Bawaan Siap Pakai (*Built-in Presets*):**
  * **Roblox Obby (Parkour):** Mawar maju, Donat lompat, Paus mundur/jatuh, chat `!lompat` & `!maju`.
  * **Roblox Driving (Balapan Mobil):** Mawar gas, Donat rem tangan (space), Ice Cream rem mundur, Finger Heart klakson, chat `!kiri` & `!kanan`.
  * **Minecraft Survival & Adventure:** Mawar maju, Donat lompat, Ice Cream jongkok (shift), Paus drop item (Q), chat `!tas` (E).
  * **Roblox Tower of Hell (Hardcore):** Mawar lompat terus, Donat lari maju, Paus mundur jatuh.
* **FR-8.2: Pengalihan Profil Instan (*Instant Switch*):**
  * Streamer dapat beralih profil game lewat dropdown di Web Dashboard tanpa perlu me-restart server.
  * Aturan langsung tersinkronisasi ke Action Queue dan tersimpan di `rules.json`.
* **FR-8.3: Manajemen Profil Kustom (CRUD):**
  * Membuat profil baru (*+ Profil Baru*) dengan opsi salin aturan aktif atau daftar kosong.
  * Menduplikasi profil (*Duplicate*) untuk modifikasi variasi game.
  * Menghapus profil kustom (dengan proteksi profil aktif & preset bawaan).
* **FR-8.4: Portabilitas Profil (Ekspor & Impor JSON):**
  * Mengunduh profil aktif menjadi file `.json`.
  * Mengunggah file `.json` untuk mengimpor profil buatan streamer lain.

---

### 6. Kebutuhan Non-Fungsional (NFR)
* **NFR-1 (Latensi Eksekusi):** Waktu respon dari WebSocket TikTok hingga tombol game ditekan dan animasi overlay muncul $\le 200\text{ ms}$.
* **NFR-2 (Konsumsi Resource):** Penggunaan RAM $\le 180\text{ MB}$ dan CPU $\le 4\%$ pada PC spesifikasi standar streamer (Core i3 / Ryzen 3, 8GB RAM).
* **NFR-3 (Keandalan Jaringan Lokal):** Bind server ke `0.0.0.0:8000` sehingga dapat diakses via `localhost`, `127.0.0.1`, maupun IP lokal LAN.
* **NFR-4 (Anti-Cheat & Keamanan):** Menggunakan emulasi input keyboard OS murni (`SendInput`), bukan injeksi DLL atau modifikasi file game Roblox.

---

### 7. Matriks Ketercapaian Fitur (Feature Completion Matrix)

Berikut adalah status implementasi seluruh kebutuhan PRD per **2 November 2026**:

| Kode | Modul / Kebutuhan | Target Awal | Status Saat Ini | Keterangan |
| :--- | :--- | :--- | :---: | :--- |
| **FR-1.1** | Input Username TikTok | MVP | ✅ **SELESAI** | Terhubung via `TikTokLiveClient`. |
| **FR-1.2** | Status Koneksi Real-time | MVP | ✅ **SELESAI** | Indikator live badge & Room ID di UI. |
| **FR-1.3** | Tombol Disconnect | MVP | ✅ **SELESAI** | Disconnect endpoint berfungsi bersih. |
| **FR-1.4** | Deteksi Stream LIVE vs OFFLINE Eksplisit | MVP | ⏳ **BELUM LENGKAP** | Error ditangani via exception, belum ada banner status "Streamer Sedang Offline" dengan timer retry. |
| **FR-2.1** | Pemetaan Gift, Chat, Like Triggers | MVP | ✅ **SELESAI** | Rule engine mendukung ketiganya. |
| **FR-2.2** | Konfigurasi Tombol, Hold, Tap, Multiplier | MVP | ✅ **SELESAI** | Tersimpan di `rules.json`. |
| **FR-2.3** | Cooldown per Rule | MVP | ✅ **SELESAI** | Throttle timer per `rule.id` aktif. |
| **FR-3.1** | Hardware DirectInput Scancode | MVP | ✅ **SELESAI** | Scancode DirectX/Win32 kompatibel Roblox. |
| **FR-3.2** | FIFO Queue Buffer & Throttling | MVP | ✅ **SELESAI** | Max queue size 50 aksi dengan auto-drop. |
| **FR-3.3** | Auto-Focus Window Roblox | v1.5 | ✅ **SELESAI** | Menghidupkan fokus otomatis jendela Roblox sebelum tombol ditekan. |
| **FR-3.4** | Emergency Stop Hotkey (`Ctrl+Shift+Q`) | MVP | ✅ **SELESAI** | Background thread Win32 `GetAsyncKeyState`. |
| **FR-4.1** | Web Dashboard Lokal | MVP | ✅ **SELESAI** | Tailwind CSS dark mode di `:8000`. |
| **FR-4.2** | Live Log Terminal WebSocket | MVP | ✅ **SELESAI** | Terminal log real-time dengan filter level. |
| **FR-4.3** | DirectInput Key Tester Grid | MVP | ✅ **SELESAI** | Uji tombol W, A, S, D, Space, dll. |
| **FR-5.1** | Karakter Berjalan Penonton (`/overlay`) | v2.0 | ✅ **SELESAI** | Bouncing SVG, arah bolak-balik. |
| **FR-5.2** | Anti-Mirrored Text pada Karakter | v2.0 | ✅ **SELESAI** | Balik arah hanya membalik sprite, teks nama/chat tetap normal LTR. |
| **FR-5.3** | Fixed Size Avatar saat Resize Browser | v2.0 | ✅ **SELESAI** | Viewport clamping dinamis dan fixed body. |
| **FR-5.4** | Balon Gift Melayang (`/overlay`) | v2.0 | ✅ **SELESAI** | Balon animasi dengan info combo. |
| **FR-5.5** | Partikel Love Tap-Tap (`/overlay`) | v2.0 | ✅ **SELESAI** | Hati melayang saat penonton like. |
| **FR-6.1** | Text-To-Speech (TTS) Suara Robot | v2.0 | ✅ **SELESAI** | Web Speech API suara Bahasa Indonesia. |
| **FR-6.2** | Kontrol Volume, Speed, Template TTS | v2.0 | ✅ **SELESAI** | Terkonfigurasi via Web Dashboard. |
| **FR-7.1** | Dedicated OBS Comment List (`/comments`) | v2.0 | ✅ **SELESAI** | Halaman khusus list komentar vertikal. |
| **FR-7.2** | Format `Nama User : Komentarnya` | v2.0 | ✅ **SELESAI** | Teks terformat rapi dengan avatar badge. |
| **FR-7.3** | Anti-Mirrored LTR Text di OBS Comments | v2.0 | ✅ **SELESAI** | CSS `direction: ltr !important`. |
| **FR-7.4** | Anti-Cache Headers OBS Chromium CEF | v2.0 | ✅ **SELESAI** | `Cache-Control: no-cache, no-store`. |
| **FR-8.1** | Multi-Profile Preset Manager (Obby, Driving, Minecraft) | v2.1 | ✅ **SELESAI** | Pengalihan profil instan, 4 built-in preset, ekspor/impor JSON, sinkronisasi otomatis. |
| **FR-9.1** | Roblox Live Racing Mode (Mobil & Motor) | v2.2 | ✅ **SELESAI** | Integrasi HttpService dua arah, join otomatis via Gift Mawar & Chat "ikut", power-up Turbo Donut, Roket Topi, lap counter & sirkuit stadion otomatis. |
| **Fase 4** | Standalone Executable (.exe Packaging) | Roadmap | ⏳ **BELUM SELESAI** | Masih berjalan via `run.bat` dan virtual environment `.venv`. |
| **Audio** | Sound Effects (SFX) Kustom untuk Gift | Roadmap | ⏳ **BELUM SELESAI** | Belum ada pemutar file audio MP3/WAV lokal saat gift tertentu masuk. |
| **Mod** | Filter Kata Kasar (Bad Words Filter) TTS | Roadmap | ⏳ **BELUM SELESAI** | Belum ada sensor kata kotor sebelum dibacakan robot TTS atau ditampilkan di chat. |
| **UI** | Deteksi Status Siaran LIVE vs OFFLINE Eksplisit | Roadmap | ⏳ **BELUM SELESAI** | Belum ada banner status "Streamer Sedang Offline" dengan timer retry di Web UI. |
| **Skin** | Custom Avatar Skin Upload | Roadmap | ⏳ **BELUM SELESAI** | Masih menggunakan generator karakter procedural SVG. |

---

### 8. Analisis Item yang Belum Selesai (Pending Backlog & Roadmap)

Berdasarkan audit kebutuhan produk dan pengembangan lanjutan, berikut adalah rincian **5 item yang masih belum selesai** beserta rekomendasi rencana eksekusinya:

#### 1. Standalone Executable Packaging (`.exe` Tanpa Python Manual)
* **Masalah Saat Ini:** Pengguna masih harus menjalankan aplikasi melalui file `run.bat` yang membutuhkan folder `.venv` Python di komputer lokal.
* **Kebutuhan:** Mengompilasi aplikasi menjadi satu file `.exe` portabel menggunakan **PyInstaller** atau installer setup (Inno Setup) agar pengguna awam cukup klik dua kali file aplikasi tanpa instalasi Python.
* **Tingkat Kesulitan:** Sedang.

#### 2. Deteksi Status Siaran LIVE vs OFFLINE yang Lebih Informatif di Web UI
* **Masalah Saat Ini:** Jika streamer TikTok belum mulai live atau salah ketik username, sistem menampilkan status disconnect di log, namun kartu status utama belum menampilkan peringatan jelas seperti *"Streamer Sedang Offline / Room Tidak Ditemukan"*.
* **Kebutuhan:** Menambahkan parser error spesifik dari `TikTokLiveClient` dan menampilkan modal/banner ramah pengguna dengan tombol *"Coba Sambungkan Lagi"* atau countdown auto-retry.
* **Tingkat Kesulitan:** Rendah.

#### 3. Sound Effects (SFX) Audio Kustom untuk Event Gift
* **Masalah Saat Ini:** Saat ada penonton mengirim gift, animasi balon muncul di layar overlay, tetapi belum ada efek suara audio khas (seperti bunyi "Ching!", terompet, atau sound meme).
* **Kebutuhan:** Menambahkan modul pemutar suara HTML5 Audio pada `overlay.html` dan direktori folder `app/static/sounds/` tempat streamer bisa memilih atau mengunggah suara SFX kustom untuk setiap jenis gift.
* **Tingkat Kesulitan:** Rendah.

#### 4. Filter Kata Kasar (Profanity / Toxic Words Filter) untuk TTS & Chat List
* **Masalah Saat Ini:** Semua komentar dibacakan apa adanya oleh robot TTS dan ditampilkan di kotak komentar. Jika ada penonton yang mengirim kata-kata tidak pantas atau spam SARA, robot TTS akan tetap membacakannya di live stream.
* **Kebutuhan:** Menambahkan modul blacklist kata-kata kotor lokal di backend (`app/moderation.py`) yang mengganti kata kasar menjadi sensor `***` atau menolak membacakannya via TTS.
* **Tingkat Kesulitan:** Rendah - Sedang.

#### 5. Custom Avatar Skin / Sprite Selector untuk Karakter Penonton
* **Masalah Saat Ini:** Karakter penonton yang join saat ini di-generate secara acak dari template procedural SVG bawaan kode.
* **Kebutuhan:** Memberi opsi bagi streamer untuk memilih gaya karakter penonton (misal: Style Karakter Blok Roblox, Style Pixel Art 8-bit, atau Style Chibi) atau mengunggah avatar PNG kustom.
* **Tingkat Kesulitan:** Sedang.

---

### 9. Rencana Prioritas Tindakan Selanjutnya (Action Plan)

1. **Sprint Berikutnya (Quick Wins & Polish):**
   * Tambahkan **Profanity / Bad Words Filter** sederhana untuk melindungi siaran dari kata-kata kasar di TTS.
   * Tambahkan **Sound Effects (SFX) kustom** untuk gift di overlay.
   * Perjelas notifikasi status **LIVE vs OFFLINE** di Web Dashboard.
2. **Sprint Lanjutan (Packaging & Distribution):**
   * Buat script build PyInstaller untuk menghasilkan `RizTik.exe`.
   * Perjelas notifikasi status **LIVE vs OFFLINE** di Web Dashboard.
2. **Sprint Lanjutan (Packaging & Distribution):**
   * Buat script build PyInstaller untuk menghasilkan `RizTik.exe`.
   * Implementasikan fitur **Multi-Profile Preset** (Save/Load Profile JSON) di Web Dashboard.
