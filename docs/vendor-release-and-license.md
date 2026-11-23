# Rilis & Lisensi DORA (khusus vendor)

Dokumen internal. **Jangan diberikan ke client.**

## Gambaran lapisan proteksi

| Lapisan | Yang dilakukan | Batasannya (jujur) |
|---|---|---|
| Tanpa source code | Image cuma berisi hasil build standalone Next.js. Tidak ada `src/`, test, seed, atau `.env`. | Kode JavaScript hasil kompilasi tetap bisa dibaca kalau dibongkar. |
| Obfuscation | Kode server (logika payroll, PPh 21/BPJS, workflow, lisensi) dan tool ops diobfuscate (string array base64, nama variabel diacak). | Memperlambat manusia dan AI, tapi tidak membuat analisis jadi mustahil. |
| Lisensi Ed25519 | File lisensi ditandatangani dengan private key vendor. Berisi client ID, nama customer, batas karyawan aktif, dan tanggal berakhir. Kalau satu byte diubah, tanda tangannya jadi tidak sah. | Orang yang sanggup membongkar dan mengedit kode hasil obfuscate bisa membuang pengecekannya. |
| Watermark build | Client ID + build ID ditanam ke bundle saat build. Lisensi hanya berlaku untuk build dengan client ID yang sama. | Fungsinya forensik: kalau bocor, ketahuan dari client mana. |
| Integrity manifest | Setiap file JS server + tool di-hash dan daftarnya ditandatangani. Saat start, app memeriksa semuanya. File diubah, dihapus, atau ditambah = app menolak dipakai. | Pemeriksanya sendiri ada di dalam kode. Penyerang yang niat bisa menonaktifkannya. |
| Anti mundur jam | Waktu terakhir yang terlihat disimpan di DB. Kalau jam server lebih mundur dari 48 jam, lisensi ditolak. | Bisa diakali dengan mengedit DB langsung. |
| Kontrak | Lihat `docs/contract-points.md`. | Inilah yang paling menentukan di dunia nyata. |

Intinya: kombinasi lapisan ini bikin "ngoprek" jadi mahal, kelihatan jejaknya, dan berisiko secara hukum. Karena kode berjalan di mesin milik client, tidak ada cara teknis yang 100% mencegahnya. Kalau suatu saat butuh perlindungan penuh, satu-satunya cara adalah hosting di server lo sendiri (SaaS/VPS).

## Sekali saja: kunci penandatangan

```bash
npm run license:keygen
```

- Private key tersimpan di `%USERPROFILE%\.dora-license\dora-license-private.pem` (di luar project).
- Public key ditulis ke `src/lib/license-public-key.ts` dan ikut terkompilasi.
- **Backup private key secara offline** (USB terenkripsi di brankas + password manager). Kalau hilang, lo tidak bisa menerbitkan lisensi atau membuat rilis untuk build yang sudah ada.
- Private key **tidak boleh** masuk repo, image Docker, atau server client. `.gitignore` dan `.dockerignore` sudah memblokir `*.pem`. Saat build Docker, kunci dikirim sebagai BuildKit secret dan tidak tertulis ke layer image.

## Setiap client: build rilis

Prasyarat: Docker Desktop berjalan.

```powershell
npm run release:build -- -ClientId ptmaju-01
# opsional: -AllowedOrigins hr.ptmaju.co.id  -BuildId 20270101-1
```

Hasilnya `dist/dora-ptmaju-01-<build>.tar.gz` plus file `.sha256`. Di dalam build Docker terjadi: `next build` (mode rilis: lisensi dan integritas wajib) → bersihkan standalone → bundle tool ops → obfuscate → tanda tangani manifest integritas → image runtime non-root.

Satu client ID dipakai per instalasi. Kalau client punya dua server (misalnya produksi dan staging), pakai dua client ID.

## Setiap client: terbitkan lisensi

```bash
npm run license:issue -- --client-id ptmaju-01 --customer "PT Maju Jaya" --expires 2027-12-31 --max-employees 250
```

- Output: `licenses/ptmaju-01.lic` (di-ignore git & Docker). Kirim ke client untuk ditaruh di `license/dora.lic`.
- `--max-employees 0` = tanpa batas. Yang dihitung adalah karyawan berstatus ACTIVE + PENDING OFFBOARDING di semua perusahaan. Saat batas tercapai, aktivasi karyawan baru ditolak dengan pesan yang jelas.
- Perpanjangan: terbitkan file baru dengan `--expires` baru. Client tinggal mengganti file dan restart.

## Build lokal / development

- `npm run dev` dan `npm run build && npm start` **tidak** memaksa lisensi. Penegakan lisensi hanya aktif di build yang memakai `DORA_RELEASE=1` (otomatis di Dockerfile). Nilainya ditanam saat build, jadi client tidak bisa mematikannya lewat environment variable.
- `.env` lokal butuh `DORA_DATA_KEY` (sudah dibuat). Data demo yang lama sudah dienkripsi dengan `npm run encrypt-data`.

## Checklist sebelum menyerahkan rilis

- [ ] `npm test` lulus, `npx tsc --noEmit` bersih
- [ ] Build rilis sukses, smoke test: container start, `/api/health` OK, login berhasil dengan lisensi, ditolak tanpa lisensi
- [ ] `.tar.gz` + `.sha256` + `dora.lic` + folder `deploy/` + `docs/deployment-guide.md`
- [ ] Kontrak/EULA dan perjanjian pemrosesan data sudah ditandatangani
- [ ] Catat: client ID, build ID, license ID, tanggal berakhir (untuk pengingat perpanjangan)

## Dependency yang perlu dipantau

`npm audit` saat ini melaporkan advisory di `postcss` (bundel internal Next.js, dipakai saat build), `deepmerge-ts` (Prisma CLI, saat build/migrasi), dan `uuid` (lewat exceljs). Ketiganya tidak menerima input dari user di runtime. Perbaikannya butuh upgrade major (Next 16, Prisma 7), jadi jadwalkan sebagai pekerjaan terpisah dan jangan pakai `npm audit fix --force` sembarangan. Next.js 15.5.29 dan React 19.3.1 yang dipakai sudah versi patch terbaru di line masing-masing.
