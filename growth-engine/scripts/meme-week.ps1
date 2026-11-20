# Run by the "Remedy Meme Week" Windows task every Sunday night. Logs to growth-engine/logs/meme-week.log.
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "meme-week.log"
Set-Location $root
"`n===== $(Get-Date -Format o) =====" | Out-File -Append -Encoding utf8 $log
npm run cli -w apps/server -- meme-week 2>&1 | ForEach-Object { "$_" } | Out-File -Append -Encoding utf8 $log
"exit $LASTEXITCODE" | Out-File -Append -Encoding utf8 $log
