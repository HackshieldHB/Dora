# Panduan Instalasi DORA di Server Client

Dokumen ini untuk orang yang memasang DORA di server client (tim lo atau tim IT client).
Asumsi: server Linux (Ubuntu 22.04/24.04 atau Debian 12) dengan Docker. Catatan untuk Windows Server ada di bagian akhir.

DORA menyimpan data paling sensitif di perusahaan (gaji, NIK, NPWP, rekening, BPJS), jadi data ini masuk cakupan **UU 27/2022 tentang Pelindungan Data Pribadi (UU PDP)**. Ikuti semua langkah wajib di bawah, jangan dilewati.

---

## 1. Yang diterima dari vendor

| File | Isi |
|---|---|
| `dora-<client>-<build>.tar.gz` + `.sha256` | Image Docker (kode sudah dikompilasi, diobfuscate, dan ditandatangani) |
| `dora.lic` | File lisensi untuk instalasi ini |
| Folder `deploy/` | `docker-compose.yml`, `Caddyfile`, `.env.example` |

Cek integritas arsip sebelum dipakai:

```bash
sha256sum -c dora-<client>-<build>.tar.gz.sha256
```

## 2. Persiapan server (wajib)

1. **OS ter-update** dan update keamanan otomatis aktif (`unattended-upgrades` di Ubuntu/Debian).
2. **Firewall**: inbound cuma 443 (HTTPS), 80 (hanya untuk sertifikat Let's Encrypt/redirect), dan SSH dari IP admin saja.
   ```bash
   sudo ufw default deny incoming
   sudo ufw allow from <IP-admin> to any port 22 proto tcp
   sudo ufw allow 80,443/tcp
   sudo ufw enable
   ```
   Catatan: Docker bisa melewati aturan UFW untuk port yang di-publish. Di compose ini cuma Caddy (80/443) yang di-publish; container DORA tidak membuka port ke luar.
3. **SSH**: login pakai key, matikan password login dan root login (`PasswordAuthentication no`, `PermitRootLogin no`).
4. **Enkripsi disk** (LUKS / BitLocker / enkripsi volume dari penyedia cloud). Field sensitif dan file upload sudah dienkripsi oleh DORA, tapi angka gaji dan nilai payroll tetap berupa angka biasa di database (karena dipakai untuk perhitungan), jadi enkripsi disk tetap diperlukan.
5. **Jam server** disinkronkan via NTP (`timedatectl set-ntp true`). Lisensi menolak jalan kalau jam server dimundurkan.
6. Install Docker Engine + plugin Compose dari repositori resmi Docker.

## 3. Instalasi

```bash
sudo mkdir -p /opt/dora && cd /opt/dora
# salin isi folder deploy/ ke sini, lalu:
mkdir -p license backups
sudo chown 1001:1001 backups          # container berjalan sebagai uid 1001 (bukan root)
cp /path/dora.lic license/dora.lic
cp .env.example .env && chmod 600 .env
docker load -i dora-<client>-<build>.tar.gz
```

Isi `.env`:

- `DORA_IMAGE`: nama image yang ditampilkan `docker load`.
- `DORA_DOMAIN`: misalnya `hr.client.co.id`.
- `DORA_DATA_KEY`: **generate di server client**, jangan di laptop:
  ```bash
  docker run --rm node:24-bookworm-slim node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
- `DORA_BACKUP_PASSPHRASE`: minimal 16 karakter, acak.

> ⚠️ **Simpan `DORA_DATA_KEY` dan `DORA_BACKUP_PASSPHRASE` di luar server** (password manager milik client atau amplop tersegel di brankas). Kalau kunci ini hilang, data terenkripsi dan semua backup **tidak bisa dibuka lagi**, dan vendor juga tidak bisa memulihkannya.

Nyalakan:

```bash
docker compose up -d
docker compose logs -f dora      # tunggu "Ready", lalu Ctrl+C
```

Buat akun admin pertama (password sekali pakai cuma ditampilkan sekali):

```bash
docker compose exec dora node tools/setup-production.js \
  --platform-email it@client.co.id \
  --company "PT Client" --company-admin hr@client.co.id
```

Serahkan password sementara itu lewat kanal yang terpisah dari email login (misalnya langsung atau via telepon). Password wajib diganti saat login pertama dan kedaluwarsa dalam 72 jam.

> Jangan pernah menjalankan seed demo (`npm run db:setup`) di server client. Seed demo menghapus semua data dan membuat akun dengan password yang sama untuk semua user. Seed itu juga otomatis menolak jalan kalau `NODE_ENV=production`.

## 4. HTTPS

- **Domain publik**: Caddy otomatis mengambil dan memperpanjang sertifikat Let's Encrypt. DNS domain harus mengarah ke server, dan port 80/443 harus terbuka.
- **Intranet saja** (tanpa DNS publik): di `Caddyfile`, aktifkan `tls internal` lalu install root CA Caddy di perangkat karyawan, atau pakai sertifikat dari CA internal client (`tls cert.pem key.pem`).
- Cookie session DORA memakai flag `Secure`, jadi **login tidak akan berhasil lewat HTTP biasa**. Ini disengaja. Jalan keluar `DORA_COOKIE_SECURE=false` hanya untuk jaringan tertutup tanpa TLS dan tidak disarankan.
- Kalau karyawan perlu akses dari luar kantor, pertimbangkan VPN atau Cloudflare Access/Zero Trust di depan Caddy, daripada membuka DORA langsung ke internet.

## 5. Backup (wajib)

Backup harian lewat cron di host:

```bash
sudo crontab -e
# setiap hari jam 01:30, simpan 14 backup terakhir
30 1 * * * cd /opt/dora && docker compose exec -T dora node tools/backup.js --out /backups --keep 14 >> /var/log/dora-backup.log 2>&1
```

- Hasilnya berupa file `backups/dora-backup-<waktu>.dorabak`, terenkripsi AES-256-GCM dan berisi snapshot database yang konsisten plus semua file upload.
- **Salin juga ke luar server** (NAS atau object storage milik client). Backup yang cuma ada di server yang sama tidak menolong kalau disknya rusak.
- **Uji restore minimal sebulan sekali**:
  ```bash
  docker compose exec dora node tools/restore.js --file /backups/<file>.dorabak --to /tmp/restore-test
  ```
  Restore selalu mengekstrak ke folder baru dan menolak backup yang passphrase-nya salah atau sudah dimodifikasi.

## 6. Update versi

```bash
docker load -i dora-<client>-<build-baru>.tar.gz
# ubah DORA_IMAGE di .env ke tag baru
docker compose exec -T dora node tools/backup.js --out /backups   # backup dulu
docker compose up -d
```

Saat start, container menyesuaikan skema database secara otomatis. Perubahan yang berpotensi menghapus data akan ditolak (container berhenti dengan pesan error), tidak dijalankan diam-diam.

## 7. Rotasi kunci data (kalau kunci diduga bocor)

1. Backup dulu.
2. Di `.env`: pindahkan kunci lama ke `DORA_DATA_KEYS_PREVIOUS=...`, lalu isi `DORA_DATA_KEY` dengan kunci baru.
3. `docker compose up -d`, lalu `docker compose exec dora node tools/encrypt-data.js`.
4. Jalankan `node tools/encrypt-data.js --dry-run` sampai hasilnya `0`, setelah itu hapus `DORA_DATA_KEYS_PREVIOUS`.

## 8. Lisensi

- File lisensi ada di `license/dora.lic` (di-mount read-only).
- Admin melihat banner peringatan 30 hari sebelum lisensi berakhir. Setelah lewat tanggal berakhir, tidak ada yang bisa login (data tetap aman dan utuh).
- Perpanjangan: ganti file `dora.lic` dengan yang baru dari vendor, lalu `docker compose restart dora`.
- Pesan "Application file was modified" atau "integrity" berarti file aplikasi di dalam image diubah. Hubungi vendor, jangan coba diperbaiki sendiri.

## 9. Ringkasan proteksi yang sudah aktif di aplikasi

| Area | Proteksi |
|---|---|
| Transport | HTTPS (Caddy), HSTS, cookie `Secure` + `HttpOnly` + `SameSite=Lax` |
| Browser | CSP, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy (kamera/lokasi hanya untuk DORA sendiri), SRI untuk Leaflet |
| Login | Lockout per akun, rate limit per IP (20 gagal / 15 menit), respons sama untuk email terdaftar maupun tidak (anti-enumerasi), sesi maksimal 15 menit |
| Data | AES-256-GCM untuk NIK, NPWP, rekening, nomor BPJS/asuransi, riwayat perubahan, dan semua file upload; file import sementara juga dienkripsi |
| Upload | Validasi tipe dari isi file (magic bytes), maksimal 2 MB, disajikan dengan CSP sandbox |
| Container | Berjalan sebagai user non-root, filesystem read-only, `cap_drop: ALL`, `no-new-privileges`, port aplikasi tidak dibuka ke luar |
| Privasi | Tidak ada panggilan ke layanan pihak ketiga dari server (deteksi bahasa memakai header browser) |

## 10. Windows Server

Kalau server client Windows:

- **Disarankan**: Windows Server 2022/2025 dengan WSL2 + Docker Engine di dalam distro Linux, lalu ikuti panduan ini di dalam WSL. Atau minta VM Linux kecil di hypervisor client (Hyper-V/VMware). Opsi ini paling sederhana dan paling aman.
- Docker Desktop tidak ditujukan untuk server produksi.
- Menjalankan Node langsung di Windows (tanpa Docker) memungkinkan, tapi perlu paket rilis terpisah. Minta ke vendor kalau memang harus begitu.

## 11. Kewajiban terkait UU PDP

- Client = **Pengendali Data Pribadi**. Vendor yang punya akses ke server = **Prosesor Data Pribadi**. Tuangkan ini dalam perjanjian pemrosesan data.
- Kalau terjadi kegagalan pelindungan data, pengendali wajib memberi tahu subjek data dan lembaga secara tertulis paling lambat **3 × 24 jam**. Siapkan prosedur insidennya dari sekarang (siapa menghubungi siapa, log mana yang diamankan).
- Audit log DORA mencatat login, login gagal (beserta IP), dan perubahan data penting. Pastikan retensinya disepakati.
