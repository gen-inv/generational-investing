$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\oilfa\generational-investing'
$dir  = Join-Path $repo 'backups'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Set-Location $repo
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
foreach ($db in 'research-production','webapp-production') {
  $out = Join-Path $dir "${db}_$stamp.sql"
  npx wrangler d1 export $db --remote --output="$out"
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $out) -or (Get-Item $out).Length -lt 1024) {
    throw "Backup failed: $db"
  }
  Get-ChildItem $dir -Filter "${db}_*.sql" | Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 14 | Remove-Item
}
Write-Host "Backups OK: $stamp"
