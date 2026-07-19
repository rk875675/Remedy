# Usage:
#   .\process.ps1 -url "https://youtube.com/watch?v=..." -name "cat_cow" -start "00:00:45" -duration "00:01:00"
#
# -start    timestamp in source video where reps begin (skip intros)
# -duration how many seconds to keep (30-90 sec ideal)
# -name     snake_case exercise name — becomes the output filename

param(
    [Parameter(Mandatory)][string]$url,
    [Parameter(Mandatory)][string]$name,
    [Parameter(Mandatory)][string]$start,
    [Parameter(Mandatory)][string]$duration
)

$scriptDir  = $PSScriptRoot
$rawDir     = "$scriptDir\raw"
$outputDir  = "$scriptDir\output"
$bgFile     = "$scriptDir\background.jpg"
$composite  = "$scriptDir\composite.py"

$rawFile    = "$rawDir\${name}.mp4"
$trimFile   = "$rawDir\${name}_trim.mp4"
$outputFile = "$outputDir\${name}.mp4"

Write-Host ""
Write-Host "=== $name ===" -ForegroundColor Cyan

# 1. Download
Write-Host "[1/3] Downloading..." -ForegroundColor Yellow
yt-dlp $url `
    -f "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]" `
    --merge-output-format mp4 `
    -o $rawFile
if (-not (Test-Path $rawFile)) { Write-Host "Download failed." -ForegroundColor Red; exit 1 }

# 2. Trim
Write-Host "[2/3] Trimming ($start + $duration)..." -ForegroundColor Yellow
ffmpeg -i $rawFile -ss $start -t $duration -c copy $trimFile -y -loglevel error
if (-not (Test-Path $trimFile)) { Write-Host "Trim failed." -ForegroundColor Red; exit 1 }

# 3. Composite
Write-Host "[3/3] Removing background and compositing..." -ForegroundColor Yellow
python $composite $trimFile $bgFile $outputFile

# Cleanup trim file
Remove-Item $trimFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "Done: $outputFile" -ForegroundColor Green
