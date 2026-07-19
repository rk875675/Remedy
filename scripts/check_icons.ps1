Add-Type -AssemblyName System.Drawing
$files = @('remedy_icon_concept_glow.png','remedy_icon_concept_embrace.png','remedy_icon_concept_mended.png')
foreach ($f in $files) {
    $p = "C:\Users\rkuma\.cursor\projects\c-Users-rkuma-remedy\assets\$f"
    $img = [System.Drawing.Image]::FromFile($p)
    Write-Output "$f : $($img.Width)x$($img.Height) PixelFormat=$($img.PixelFormat)"
    $img.Dispose()
}
