# TikTok Live Game Controller (TikFinity-Style Local Bridge)

Aplikasi desktop lokal (*local agent*) untuk menghubungkan event siaran langsung **TikTok Live** (Gift, Chat, Likes) dengan kontrol game **Roblox** / game DirectX lainnya secara *real-time* via hardware **DirectInput Scancode**.

---

## 🌟 Fitur Utama

1. **Direct Cloud Webcast Listener:**
   * Terhubung langsung ke server TikTok via WebSocket tanpa memerlukan instalasi TikTok Studio, OBS plugin, atau virtual audio router.
   * Cukup masukkan username streamer TikTok (contoh: `streamer_kamu`).
2. **DirectInput Hardware Scancode Engine:**
   * Mengirim scancode OS asli lewat Win32 `SendInput` (kompatibel penuh dengan Roblox Client dan engine DirectX).
   * Bukan virtual keycode biasa yang sering diabaikan atau diblokir engine game.
3. **Action Queue & Spam Throttler:**
   * Antrean aksi FIFO (*First-In, First-Out*) dengan pembatasan kapasitas buffer (default 50 aksi).
   * Mencegah karakter stuck/lag ketika menerima spam ribuan gift mawar sekaligus.
   * Mendukung combo multiplier (skala durasi hold atau repetisi tap).
4. **Game Window Focus Guard:**
   * Opsi otomatis untuk hanya menekan tombol jika jendela `Roblox` sedang aktif/fokus di layar (mencegah salah ketik di OBS/browser).
5. **Emergency Stop (Panic Button):**
   * Tekan pintasan global **`Ctrl + Shift + Q`** kapan saja (atau klik tombol merah di Web Dashboard) untuk langsung membatalkan seluruh antrean aksi dan melepas semua tombol yang tertahan.
6. **Local Web Dashboard (`http://localhost:8000`):**
   * UI modern & responsif (Dark Mode) untuk manajemen rules, uji tombol manual (*Test Key*), monitoring status koneksi, dan log terminal *real-time* via WebSocket.
7. **Interactive OBS Visual Overlay (`http://localhost:8000/overlay`):**
   * Karakter penonton berjalan bolak-balik (bouncing SVG) saat penonton join live dengan ukuran tetap dan nama tidak terbalik.
   * Balon hadiah gift melayang dengan animasi tali & keranjang info combo.
   * Partikel hati tap-tap melayang saat penonton like stream.
8. **Pembaca Komentar Otomatis (TTS Voice Reader):**
   * Membacakan pesan chat penonton dengan suara robot Bahasa Indonesia, lengkap dengan pengaturan volume, kecepatan, dan template kalimat.
9. **Dedicated OBS Live Comment List (`http://localhost:8000/comments`):**
   * Kotak daftar komentar vertikal transparan untuk OBS dengan format `Nama User : Komentarnya` dan badge inisial/avatar warna-warni.

---

## 📁 Struktur Proyek

```
tikinfinity/
├── app/
│   ├── direct_input.py      # Win32 SendInput Scancode implementation (Roblox)
│   ├── config.py            # Pydantic models & penyimpanan rules.json
│   ├── queue_manager.py     # FIFO queue, throttling, cooldown, & emergency stop
│   ├── tiktok_client.py     # TikTokLive client & event router
│   ├── server.py            # FastAPI backend & WebSocket live bridge
│   └── static/
│       ├── index.html       # Web Dashboard lokal (Tailwind CSS)
│       ├── overlay.html     # Interactive OBS Overlay (Karakter, Balon, TTS)
│       └── comments.html    # Dedicated OBS Live Comment List Box
├── prd.md                   # Product Requirement Document (v2.0)
├── rules.json               # Konfigurasi aksi lokal (auto-generated)
├── requirements.txt         # Daftar pustaka Python
├── run.bat                  # Script peluncur sekali klik (Windows)
├── main.py                  # Entry point aplikasi & global panic hotkey
└── README.md
```

---

## 🚀 Panduan Menjalankan Aplikasi

### 1. Prasyarat
* Sistem Operasi: **Windows 10 / 11**
* **Python 3.10+** (telah terpasang di `.venv`)

### 2. Jalankan Sebagai Administrator (Sangat Penting)
Agar Windows mengizinkan penekanan tombol hardware scancode masuk ke proses game Roblox:
1. Buka **Command Prompt (cmd)** atau **PowerShell** dengan cara klik kanan $\to$ **"Run as Administrator"**.
2. Masuk ke direktori proyek:
   ```cmd
   cd /d D:\APLIKASI\tikinfinity
   ```
3. Jalankan aplikasi:
   ```cmd
   .venv\Scripts\python.exe main.py
   ```
   *(Atau klik kanan file `run.bat` dan pilih **Run as Administrator**)*.

### 3. Buka Web Dashboard
Buka browser Anda dan akses:
👉 **`http://localhost:8000`**

---

## 🎮 Cara Penggunaan & Pengujian

1. **Uji Tombol ke Roblox:**
   * Buka game Roblox (misal: game Obby).
   * Pada dashboard di bagian **"Test DirectInput Keys"**, klik tombol **W** atau **SPACE**.
   * Karakter Roblox Anda akan bergerak maju atau melompat.
2. **Sambungkan ke TikTok Live:**
   * Masukkan username TikTok streamer di form **"Streamer TikTok Username"** (tanpa tanda `@`).
   * Klik **Connect Live**.
   * Jika streamer sedang online, status akan berubah menjadi hijau **Connected** beserta Room ID.
3. **Atur Pemetaan Aturan (Rules):**
   * **Gift:** Kirim *Rose* $\to$ Karakter maju (`W`) selama `0.4s`.
   * **Chat:** Penonton ketik `!lompat` $\to$ Karakter melompat (`SPACE`).
   * **Like:** Setiap `50` like $\to$ Karakter melompat.
4. **Keadaan Darurat:**
   * Jika terjadi spam berlebihan, tekan tombol **`Ctrl + Shift + Q`** di keyboard Anda untuk *Emergency Stop*.

