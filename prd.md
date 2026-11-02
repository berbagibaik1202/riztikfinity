# Product Requirement Document (PRD)
## TikTok Live Game Controller (TikFinity-Style Local Bridge)

---

### 1. Executive Summary & Objective

#### 1.1 Ringkasan Produk
Aplikasi **TikTok Live Game Controller** adalah perangkat lunak desktop (*local agent*) yang menghubungkan siaran langsung TikTok Live dengan simulasi kontrol input keyboard (*DirectInput*) secara *real-time*. Aplikasi ini memungkinkan penonton memengaruhi pergerakan karakter di game Roblox (seperti game Obby, Survival, atau Driving) melalui interaksi pemberian gift, chat command, maupun like.

#### 1.2 Tujuan Bisnis & Pengguna
* **Tingkat Keterlibatan (Engagement):** Meningkatkan interaksi dan retensi penonton pada sesi TikTok Live gaming.
* **Monetisasi Streamer:** Mendorong pemberian hadiah (*gift*) dengan memberikan dampak mekanik langsung ke dalam game.
* **Kemudahan Konfigurasi:** Menyediakan antarmuka lokal mandiri yang tidak bergantung pada langganan berbayar pihak ketiga, minim latensi, dan mudah disesuaikan.

---

### 2. Target Pengguna (User Persona)
* **Streamer Game TikTok (Pemula hingga Menengah):** Menjalankan sesi live di PC/laptop dengan dual-window (Roblox + Live Studio/OBS), membutuhkan otomatisasi input yang responsif tanpa konfigurasi coding manual.
* **Kreator Konten Interaktif:** Menciptakan format konten tantangan unik (contoh: *"Menang Obby Roblox hanya jika penonton tidak mengirim mawar"*).

---

### 3. Scope & Batasan Teknis (Constraints)

#### 3.1 In-Scope (MVP)
* Integrasi pendengar event TikTok Live via WebSocket stream publik (Gift, Likes, Chat) langsung dari TikTok Server.
* Sistem antrean aksi (*Action Queue*) untuk menangani lonjakan spam gift.
* Simulator input keyboard berbasis *DirectInput* (kompatibel dengan DirectX/Roblox Client).
* Web UI Dashboard lokal (`http://localhost:8000`) untuk pengaturan koneksi, pemetaan aksi, dan monitoring status.
* Penyimpanan konfigurasi profil aksi ke format lokal (`JSON`).

#### 3.2 Out-of-Scope (Fase Selanjutnya)
* Kontrol via Android/iOS secara langsung tanpa PC perantara.
* Penulisan/pembacaan memori game internal (menghindari deteksi anti-cheat Byfron/Hyperion).
* Integrasi monetisasi atau payment gateway pihak ketiga di luar ekosistem TikTok resmi.

---

### 4. Arsitektur Sistem & Alur Data

```
┌─────────────────────────┐
│     TikTok Server       │
└────────────┬────────────┘
             │ WebSocket Event (Gift/Like/Chat)
             ▼
┌─────────────────────────┐
│  TikTok Listener Agent  │  <-- Menangkap payload live room publik via internet
└────────────┬────────────┘
             │ Raw JSON Event
             ▼
┌─────────────────────────┐
│     Rule Matcher &      │  <-- Memeriksa filter (Gift Name, Min. Count, User)
│      Action Queue       │  <-- Menjaga throttling & urutan penekanan FIFO
└────────────┬────────────┘
             │ Key Press Event Payload
             ▼
┌─────────────────────────┐
│  DirectInput Simulator  │  <-- Mengirim scancode OS ke jendela aktif (Roblox)
└─────────────────────────┘
```

---

### 5. Fitur Utama & Kebutuhan Fungsional (Functional Requirements)

#### 5.1 Modul Koneksi TikTok (Connection Engine)
* **FR-1.1:** Pengguna dapat memasukkan nama pengguna TikTok (`unique_id`) tanpa tanda `@`.
* **FR-1.2:** Sistem harus dapat memverifikasi status siaran (apakah akun sedang LIVE atau OFFLINE).
* **FR-1.3:** Terdapat indikator status koneksi real-time (*Connected*, *Disconnected*, *Reconnecting*, *Room ID*).
* **FR-1.4:** Sistem memiliki mekanisme *auto-reconnect* jika koneksi WebSocket terputus sewaktu-waktu.

#### 5.2 Modul Pemetaan Aturan (Rule Engine & Triggers)
* **FR-2.1: Pemetaan Berbasis Pemicu:**
  * **Gift Trigger:** Memilih jenis gift (contoh: Rose, Doughnut, Whale) beserta multiplier/combo.
  * **Chat Trigger:** Memfilter pesan chat tertentu (contoh: teks `!kiri`, `!lompat`).
  * **Like Milestone:** Menjalankan aksi setiap kelipatan $X$ like (opsional).
* **FR-2.2: Konfigurasi Aksi Keyboard:**
  * **Tombol Target:** Mendukung tombol standar (`W`, `A`, `S`, `D`, `Space`, `Shift`, `E`, dll.).
  * **Mode Eksekusi:** *Hold* (tahan selama $N$ detik) atau *Single Tap/Spam*.
  * **Durasi Tahan:** Input nilai numerik dalam satuan detik (default: `0.3s`).
  * **Prioritas/Cooldown:** Menetapkan durasi cooldown untuk mencegah tombol tertahan terus-menerus.

#### 5.3 Modul Eksekusi Input (Action Executor & Queue System)
* **FR-3.1:** Sistem wajib menggunakan *DirectInput Scancode* agar kompatibel dengan engine game DirectX (Roblox Client).
* **FR-3.2: Queue Buffer:** Semua event yang masuk dimasukkan ke dalam antrean FIFO (*First-In, First-Out*).
* **FR-3.3: Spam Throttling:** Membatasi jumlah antrean maksimal (misal: maksimal 50 aksi tersimpan) untuk menghindari *gameplay lag* saat menerima spam gift berturut-turut.
* **FR-3.4: Emergency Stop:** Menyediakan hotkey darurat (misal: `Ctrl + Shift + Q`) untuk membatalkan semua antrean dan melepas semua tombol yang sedang ditekan.

#### 5.4 Antarmuka Pengguna Lokal (Local Web Dashboard)
* **FR-4.1:** Panel kontrol responsif berbasis browser lokal (`http://localhost:8000`).
* **FR-4.2:** Form CRUD (*Create, Read, Update, Delete*) untuk daftar aturan pemetaan.
* **FR-4.3: Live Log Terminal:** Menampilkan log aktivitas masuk secara *real-time* (Pengirim, Gift, Aksi Tombol yang dipicu).
* **FR-4.4: Fitur Test Key:** Tombol untuk menguji apakah simulasi penekanan tombol berfungsi ke game tanpa perlu menunggu live gift sungguhan.

---

### 6. Kebutuhan Non-Fungsional (Non-Functional Requirements)
* **NFR-1 (Latensi):** Keterlambatan antara penangkapan event WebSocket hingga simulasi tombol ditekan harus $\le 250\text{ ms}$.
* **NFR-2 (Stabilitas & Resource):** Penggunaan CPU di bawah $5\%$ dan RAM di bawah $200\text{ MB}$ saat idle maupun aktif memproses event.
* **NFR-3 (Privilege / Keamanan):** Aplikasi harus memberikan peringatan jika tidak dijalankan dengan izin administratif (*Run as Administrator*), karena OS membatasi emulasi DirectInput jika level privilege tidak memadai.
* **NFR-4 (Ketahanan Anti-Cheat):** Input dikirim sebagai simulasi sinyal keyboard OS standar, bukan injeksi memori proses Roblox, untuk mencegah deteksi pemblokiran akun.

---

### 7. Skema Data (Data Model Specification)

#### 7.1 Action Rule (`rules.json`)
```json
{
  "rules": [
    {
      "id": "rule_001",
      "trigger_type": "gift",
      "gift_name": "Rose",
      "target_key": "w",
      "press_mode": "hold",
      "duration_seconds": 0.4,
      "multiplier_enabled": true,
      "cooldown_seconds": 0.1
    },
    {
      "id": "rule_002",
      "trigger_type": "gift",
      "gift_name": "Doughnut",
      "target_key": "space",
      "press_mode": "tap",
      "duration_seconds": 0.1,
      "multiplier_enabled": false,
      "cooldown_seconds": 0.5
    }
  ]
}
```

---

### 8. Rencana Rilis & Tahapan Pengembangan (Milestones)

| Fase | Target Deliverables | Durasi Estimasi |
| :--- | :--- | :--- |
| **Fase 1: Core Engine** | Modul DirectInput Scancode, Queue FIFO dengan Throttling, integrasi WebSocket TikTokLive | 1 Minggu |
| **Fase 2: REST API & Rule Engine** | Engine pencocokan trigger, CRUD rules, penyimpanan format JSON | 1 Minggu |
| **Fase 3: Local Web Dashboard** | UI responsif (HTML/Tailwind), live event log via WebSocket, tombol Test Key | 1 Minggu |
| **Fase 4: Packaging & Testing** | Emergency Stop hotkey, deteksi window Roblox, testing stabilitas & packaging .exe | 1 Minggu |

---

### 9. Risiko & Mitigasi

| Risiko | Dampak | Strategi Mitigasi |
| :--- | :--- | :--- |
| **Perubahan Protokol TikTok** | Event stream gagal membaca gift (breaking change library). | Buat arsitektur modular agar modul listener dapat diperbarui atau dialihkan konektornya tanpa merombak executor. |
| **Roblox Kehilangan Fokus Jendela** | Tombol tertekan di aplikasi lain (misal: mengetik di browser/OBS). | Tambahkan validasi jendela aktif atau fokus otomatis ke jendela `Roblox` sebelum input dikirim. |
| **Banjir Gift (Massive Spam)** | Karakter bergerak tanpa henti selama bermenit-menit. | Implementasikan cap limit antrean (max 50 aksi) dan pembatasan durasi per combo. |
