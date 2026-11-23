# Poin Kontrak, Lisensi & Hak Cipta DORA

> Ini daftar poin untuk dibawa ke konsultan hukum, **bukan nasihat hukum dan bukan draf final**. Minta advokat atau konsultan HKI menyusun teks finalnya.

## A. Perjanjian Lisensi Perangkat Lunak (EULA / Perjanjian Lisensi)

1. **Sifat lisensi**: non-eksklusif, tidak dapat dialihkan, terbatas untuk satu instalasi (sebut client ID), untuk keperluan internal client, selama masa berlaku.
2. **Kepemilikan**: seluruh hak cipta atas program komputer, dokumentasi, dan pembaruannya tetap milik vendor. Client hanya mendapat hak pakai.
3. **Larangan**, termasuk bila dilakukan dengan bantuan pihak ketiga, alat otomatis, atau kecerdasan buatan (AI):
   - reverse engineering, dekompilasi, de-obfuscation, disassembly;
   - mengubah, memodifikasi, atau membuat karya turunan;
   - menyalin, mendistribusikan, menyewakan, atau mensublisensikan;
   - menghindari, menonaktifkan, atau mengakali mekanisme lisensi, pemeriksaan integritas, atau watermark;
   - memindahkan ke server atau instalasi lain tanpa persetujuan tertulis.
4. **Batas penggunaan**: jumlah karyawan aktif maksimal sesuai lisensi. Penambahan kuota lewat addendum.
5. **Masa berlaku & perpanjangan**: tanggal berakhir, mekanisme perpanjangan, dan apa yang terjadi saat lisensi berakhir. Data client tetap milik client dan tetap utuh, hanya aplikasinya yang tidak bisa dipakai.
6. **Konsekuensi pelanggaran**: garansi dan support gugur, hak vendor untuk mengakhiri lisensi, dan ganti rugi.
7. **Bukti teknis**: para pihak sepakat bahwa log pemeriksaan integritas, watermark build, dan audit log aplikasi dapat dijadikan bukti.
8. **Hak audit**: vendor (atau auditor independen) boleh memverifikasi kepatuhan dengan pemberitahuan wajar.

## B. Perjanjian Layanan / SLA

1. Ruang lingkup support (jam layanan, kanal, waktu respons per tingkat keparahan).
2. **Garansi gugur** kalau sistem diubah oleh selain vendor. Deteksi integritas aplikasi menjadi dasar teknisnya.
3. Pembaruan keamanan: siapa yang memasang, berapa lama setelah dirilis.
4. **Akses vendor ke server**: lewat VPN/bastion, akun personal (bukan akun bersama), tercatat di log, dan hanya dengan izin client.
5. Pembagian tanggung jawab: client menanggung server, OS, jaringan, backup offsite, dan penyimpanan kunci. Vendor menanggung aplikasi.

## C. Perjanjian Pemrosesan Data Pribadi (UU 27/2022 tentang PDP)

1. Peran: **client = Pengendali Data Pribadi**, **vendor = Prosesor Data Pribadi** (selama punya akses ke server atau data).
2. Vendor memproses data hanya atas instruksi tertulis client dan untuk tujuan support/pemeliharaan.
3. Kerahasiaan personel vendor (NDA perorangan).
4. Langkah keamanan yang sudah ada: enkripsi AES-256-GCM untuk field sensitif dan file, HTTPS, kontrol akses berbasis peran, audit log, backup terenkripsi. Lampirkan `docs/deployment-guide.md` bagian 9.
5. **Pemberitahuan insiden**: vendor memberi tahu client segera (sarankan ≤ 24 jam) sejak mengetahui insiden, supaya client bisa memenuhi kewajiban pemberitahuan tertulis 3 × 24 jam kepada subjek data dan lembaga.
6. Larangan sub-prosesor tanpa persetujuan.
7. Pengembalian dan penghapusan data saat kontrak berakhir.
8. **Kunci enkripsi** (`DORA_DATA_KEY`) dibuat dan disimpan oleh client. Vendor tidak menyimpan salinannya, sehingga vendor tidak bisa memulihkan data kalau kunci hilang. Ini perlu ditulis eksplisit.

## D. NDA

- Untuk tim IT client yang memegang server (mencakup informasi teknis, arsitektur, dan file instalasi).
- Untuk personel vendor terkait data client.

## E. Hak Cipta (DJKI)

- Program komputer adalah ciptaan yang dilindungi menurut **UU 28/2014 tentang Hak Cipta**. Perlindungannya muncul otomatis sejak diwujudkan, tetapi **pencatatan di DJKI** memberi bukti kepemilikan dan tanggal yang kuat kalau terjadi sengketa.
- Pendaftaran online lewat layanan e-Hak Cipta DJKI (dgip.go.id). Cek tarif PNBP terbaru (biasanya ada tarif khusus untuk UMK).
- Siapkan: identitas pencipta/pemegang hak, contoh ciptaan (misalnya cuplikan kode dan manual), dan surat pernyataan kepemilikan. Kalau kode dibuat oleh karyawan atau freelancer, siapkan **surat pengalihan hak** dari mereka.
- Simpan arsip bertanggal (repo git dengan riwayat commit, build ID tiap rilis) sebagai bukti pendukung. *Catatan: project ini belum memakai git. Disarankan segera `git init`.*

## F. Lampiran teknis yang bisa dirujuk di kontrak

- Client ID dan build ID per rilis (dari `scripts/release/build-release.ps1`)
- License ID dan masa berlaku (dari `npm run license:issue`)
- Hash SHA-256 arsip image yang diserahkan (file `.sha256`)
