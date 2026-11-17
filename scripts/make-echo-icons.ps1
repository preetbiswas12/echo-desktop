# Generates the Echo app icons from public/echo_blue_gradient.png (Windows helper).
#
# Outputs (matching the upstream asset dimensions):
#   build/icon.png                        512x512
#   build/icon.icon/Assets/element.png    1024x1024 (freedesktop .icon asset, filename kept for icon.json)
#   build/icon.ico                        multi-size (16..256, via png-to-ico)
#
# Also caches every size the webapp bundle needs in %TEMP%/echo-icons/
# (echo-<size>.png for 16..1024, consumed by scripts/echo-brand-patch.ts to
# overwrite the bundle's vector-icons and theme logos, plus echo-opengraph.png
# 1200x630 for the social share image).
#
# macOS .icns is deferred (iconutil is macOS-only).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-echo-icons.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot # scripts/ -> repo root
Push-Location $repoRoot
try {
    $sourcePath = Join-Path $repoRoot "public/echo_blue_gradient.png"
    $tmp = Join-Path $env:TEMP "echo-icons"
    New-Item -ItemType Directory -Force $tmp | Out-Null

    $src = [System.Drawing.Image]::FromFile($sourcePath)
    foreach ($size in 16, 24, 32, 48, 64, 120, 128, 144, 152, 180, 256, 320, 512, 1024) {
        $bmp = New-Object System.Drawing.Bitmap($size, $size)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage($src, 0, 0, $size, $size)
        $g.Dispose()
        $bmp.Save((Join-Path $tmp "echo-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        Write-Host "Resized to $size"
    }

    # OpenGraph share image (1200x630): Echo navy with the mark centered.
    $og = New-Object System.Drawing.Bitmap(1200, 630)
    $g = [System.Drawing.Graphics]::FromImage($og)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::FromArgb(255, 0x07, 0x1A, 0x6E))
    $logoW = 400
    $logoH = [int][Math]::Round($logoW * $src.Height / $src.Width)
    $g.DrawImage($src, [int](($og.Width - $logoW) / 2), [int](($og.Height - $logoH) / 2), $logoW, $logoH)
    $g.Dispose()
    $og.Save((Join-Path $tmp "echo-opengraph.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $og.Dispose()
    Write-Host "Composed echo-opengraph.png (1200x630)"
    $src.Dispose()

    Copy-Item (Join-Path $tmp "echo-512.png") "build/icon.png" -Force
    Copy-Item (Join-Path $tmp "echo-1024.png") "build/icon.icon/Assets/element.png" -Force
    Write-Host "Wrote build/icon.png (512) and build/icon.icon/Assets/element.png (1024)"

    node (Join-Path $repoRoot "scripts/make-echo-ico.mjs") $tmp
    if ($LASTEXITCODE -ne 0) { throw "png-to-ico failed" }
} finally {
    Pop-Location
}
