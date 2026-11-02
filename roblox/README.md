# 🏎️ Roblox Live Racing (TikInfinity Bridge)

Panduan integrasi game balapan interaktif Roblox dengan TikTok Live menggunakan TikInfinity.

## 🌟 Cara Kerja
1. **Penonton TikTok Mengirim Gift Mawar** atau **Mengetik "ikut" di Chat**:
   - Karakter penonton langsung masuk ke arena balap sebagai pembalap dengan model **Mobil Sport** atau **Motor Balap**.
   - Nama TikTok dan avatar muncul melayang di atas kendaraan.
2. **Saat Balapan Berlangsung**:
   - 🌹 **Gift Mawar (x1)**: Menambah kecepatan kendaraan 1x (*Speed Boost*).
   - 🌹 **Gift Mawar (x5)**: Menambah kecepatan kendaraan 5x secara drastis!
   - 🍩 **Gift Donat (Doughnut)**: Mengaktifkan **KECEPATAN TURBO** dengan efek semburan api knalpot!
   - 🧢 **Gift Topi (Cap)**: Menembakkan **ROKET** ke lawan di depan! Lawan yang terkena akan meledak, berputar (*spin out*), dan melambat.
3. **Finish & Pemenang**:
   - Pembalap yang menyelesaikan 3 putaran (Lap) terlebih dahulu menjadi juara.
   - Pemenang dirayakan dengan ledakan kembang api dan namanya tercatat di layar.

---

## 🛠️ Langkah Mudah Menyiapkan di Roblox Studio

### Langkah 1: Buat Sirkuit Otomatis (1 Detik)
1. Buka **Roblox Studio** dan buat proyek baru (*Baseplate* kosong).
2. Di menu atas, klik tab **View** -> centang **Command Bar** (muncul kotak teks di bagian paling bawah layar).
3. Buka file [`roblox/GenerateTrack.lua`](file:///d:/APLIKASI/tikinfinity/roblox/GenerateTrack.lua), salin (Copy) seluruh kodenya.
4. Tempel (Paste) di Command Bar Roblox Studio, lalu tekan **Enter**.
5. *Sirkuit balap stadion lengkap dengan aspal, lampu neon, garis start/finish, dan 18 waypoints akan langsung jadi!*

### Langkah 2: Pasang Script Balapan
1. Di jendela **Explorer** Roblox Studio (di sebelah kanan), cari folder **`ServerScriptService`**.
2. Klik kanan pada `ServerScriptService` -> **Insert Object** -> **Script**.
3. Beri nama script tersebut: `LiveRaceController`.
4. Buka file [`roblox/LiveRaceController.server.lua`](file:///d:/APLIKASI/tikinfinity/roblox/LiveRaceController.server.lua), salin seluruh isinya dan tempel ke dalam script tersebut.

### Langkah 3: Aktifkan HTTP Requests di Roblox Studio
1. Di menu atas Roblox Studio, klik tab **Home** -> **Game Settings**.
   *(Jika belum disimpan, klik Save to Roblox terlebih dahulu)*.
2. Pilih menu **Security** di sebelah kiri.
3. Centang opsi **Allow HTTP Requests** (Izinkan Permintaan HTTP).
4. Klik **Save**.

### Langkah 4: Mulai Main!
1. Jalankan aplikasi TikInfinity kita (`run.bat`).
2. Di Roblox Studio, tekan tombol **Play** (atau **Run** / F5).
3. Buka dashboard TikInfinity di browser (`http://127.0.0.1:8000`), buka tab **Roblox Live Race Arena**.
4. Anda bisa mengklik tombol simulator uji coba:
   - 🌹 *Uji Join via Mawar*
   - 💬 *Uji Join via Chat 'ikut'*
   - ⚡ *Uji Boost 1x / 5x*
   - 🍩 *Uji Turbo Donut*
   - 🚀 *Uji Roket Topi*
   - 🏁 *Mulai Balapan!*

