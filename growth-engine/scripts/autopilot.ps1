# Run by the "Remedy Growth Autopilot" Windows task. Logs to growth-engine/logs/autopilot.log.
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "autopilot.log"
Set-Location $root
"`n===== $(Get-Date -Format o) =====" | Out-File -Append -Encoding utf8 $log
npm run cli -w apps/server -- autopilot 7 2>&1 | ForEach-Object { "$_" } | Out-File -Append -Encoding utf8 $log
"exit $LASTEXITCODE" | Out-File -Append -Encoding utf8 $log
