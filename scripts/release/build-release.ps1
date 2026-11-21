<#
.SYNOPSIS
  VENDOR ONLY. Builds the protected Docker image for one client and exports it as a .tar.gz.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\release\build-release.ps1 -ClientId ptmaju-01

  Optional: -BuildId 20270101-1  -AllowedOrigins hr.ptmaju.co.id  -KeyPath D:\secure\dora-license-private.pem
#>
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9][a-z0-9-]{1,62}$')][string]$ClientId,
  [string]$BuildId = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [string]$AllowedOrigins = '',
  [string]$KeyPath = (Join-Path $env:USERPROFILE '.dora-license\dora-license-private.pem')
)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
if (-not (Test-Path $KeyPath)) { throw "Signing key not found at $KeyPath. Run npm run license:keygen first." }

$tag = "dora:$ClientId-$BuildId"
Push-Location $root
try {
  $env:DOCKER_BUILDKIT = '1'
  docker build `
    --secret "id=dora_signing_key,src=$KeyPath" `
    --build-arg "DORA_CLIENT_ID=$ClientId" `
    --build-arg "DORA_BUILD_ID=$BuildId" `
    --build-arg "DORA_ALLOWED_ORIGINS=$AllowedOrigins" `
    -t $tag .
  if ($LASTEXITCODE -ne 0) { throw "docker build failed" }

  New-Item -ItemType Directory -Force dist | Out-Null
  $tar = Join-Path 'dist' "dora-$ClientId-$BuildId.tar"
  docker save -o $tar $tag
  if ($LASTEXITCODE -ne 0) { throw "docker save failed" }
  $gz = "$tar.gz"
  $in = [System.IO.File]::OpenRead((Resolve-Path $tar))
  $out = [System.IO.File]::Create((Join-Path $root $gz))
  $zip = New-Object System.IO.Compression.GZipStream($out, [System.IO.Compression.CompressionLevel]::Optimal)
  $in.CopyTo($zip); $zip.Dispose(); $out.Dispose(); $in.Dispose()
  Remove-Item $tar
  $hash = (Get-FileHash $gz -Algorithm SHA256).Hash.ToLower()
  Set-Content -Path "$gz.sha256" -Value "$hash  $(Split-Path $gz -Leaf)" -Encoding ascii
  Write-Host ""
  Write-Host "Image:   $tag"
  Write-Host "Archive: $gz"
  Write-Host "SHA-256: $hash"
  Write-Host "Next: npm run license:issue -- --client-id $ClientId --customer `"...`" --expires YYYY-MM-DD"
} finally {
  Pop-Location
}
