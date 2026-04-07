# hook_gen_gdi.ps1 — Generate hook overlay PNG using System.Drawing (GDI+)
# Manual word-wrap + per-line centered drawing = perfect centering, no char clipping.
# Args: textFile fontSize padX padY borderW bgHex textHex borderHex maxW outPath

Add-Type -AssemblyName System.Drawing

$textFile  = $args[0]
$fontSize  = [int]$args[1]
$padX      = [int]$args[2]
$padY      = [int]$args[3]
$borderW   = [int]$args[4]
$bgHex     = [string]$args[5]
$textHex   = [string]$args[6]
$borderHex = [string]$args[7]
$maxW      = [int]$args[8]
$outPath   = [string]$args[9]

$MAX_LINES = 4   # auto-shrink font if text wraps to more lines

try {
    # ── Read & clean text ───────────────────────────────────────────────────────
    $text = [System.IO.File]::ReadAllText($textFile.Trim(), [System.Text.Encoding]::UTF8).Trim()
    # Strip ALL possible BOM variants (UTF-8 BOM appears as 0xFEFF after .NET decode)
    $text = $text.TrimStart([char]0xFEFF, [char]0xFFFE, [char]0x200B, [char]0xEF)
    if ($text.Length -eq 0) { Write-Output "0,0"; exit 0 }
    # Non-breaking hyphen: prevent "NGE-MC" splits
    $text = $text -replace '-', [char]0x2011

    # ── Colors ──────────────────────────────────────────────────────────────────
    function HexToColor($hex) {
        $hex = $hex.TrimStart('#')
        if ($hex.Length -eq 6) { $hex = "FF$hex" }
        return [System.Drawing.Color]::FromArgb(
            [Convert]::ToByte($hex.Substring(0,2),16),
            [Convert]::ToByte($hex.Substring(2,2),16),
            [Convert]::ToByte($hex.Substring(4,2),16),
            [Convert]::ToByte($hex.Substring(6,2),16))
    }
    $bgColor  = HexToColor $bgHex
    $txtColor = HexToColor $textHex
    $brdColor = HexToColor $borderHex

    # ── StringFormat (GenericTypographic = no internal GDI+ padding) ────────────
    $sfLine = [System.Drawing.StringFormat]::GenericTypographic.Clone()
    $sfLine.Alignment     = [System.Drawing.StringAlignment]::Near
    $sfLine.LineAlignment = [System.Drawing.StringAlignment]::Near

    # ── Helper: wrap words into lines, each ≤ maxLineW px wide ─────────────────
    function WrapWords($words, $font, $gfx, $maxLineW) {
        $lines   = [System.Collections.Generic.List[string]]::new()
        $curLine = ""
        foreach ($word in $words) {
            $test = if ($curLine -eq "") { $word } else { "$curLine $word" }
            $w    = $gfx.MeasureString($test, $font, [int]::MaxValue, $sfLine).Width
            if ($w -le $maxLineW) {
                $curLine = $test
            } else {
                if ($curLine -ne "") { $lines.Add($curLine) }
                # If single word is wider than maxLineW, allow it (avoids infinite loop)
                $curLine = $word
            }
        }
        if ($curLine -ne "") { $lines.Add($curLine) }
        return ,$lines   # , prefix returns as single object, not flattened array
    }

    # ── Auto-size: reduce fontSize until lines ≤ MAX_LINES ─────────────────────
    # Use 88% of inner width as safety margin — GDI+ measured width can be ~5-10% narrower
    # than actual rendered width, causing overflow if we use the full inner width.
    $maxLineW = [int](($maxW - 2 * $padX - 2 * $borderW) * 0.88)
    if ($maxLineW -lt 60) { $maxLineW = 60 }

    $words    = $text.Split(' ')
    $curSize  = $fontSize
    $font     = $null
    $lines    = $null

    $measureBmp = New-Object System.Drawing.Bitmap(1, 1)
    $measureBmp.SetResolution(96, 96)   # normalize DPI — prevents Windows 125%/150% scaling
    $mg         = [System.Drawing.Graphics]::FromImage($measureBmp)
    $mg.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    for ($i = 0; $i -lt 10; $i++) {
        if ($font) { $font.Dispose() }
        # GraphicsUnit::Pixel = DPI-independent — text renders at exactly $curSize pixels
        # regardless of Windows display scaling (100%/125%/150%)
        try   { $font = New-Object System.Drawing.Font("Arial", $curSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel) }
        catch { $font = New-Object System.Drawing.Font([System.Drawing.FontFamily]::GenericSansSerif, $curSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel) }

        $lines = WrapWords $words $font $mg $maxLineW

        if ($lines.Count -le $MAX_LINES) { break }
        # Shrink proportionally
        $ratio   = [float]$MAX_LINES / [float]$lines.Count
        $curSize = [Math]::Max([int]([Math]::Floor([float]$curSize * $ratio * 0.92)), 8)
    }
    $mg.Dispose(); $measureBmp.Dispose()

    # ── Measure each line for per-line centering ────────────────────────────────
    $measureBmp2 = New-Object System.Drawing.Bitmap(1, 1)
    $measureBmp2.SetResolution(96, 96)  # same 96 DPI as output bitmap
    $mg2         = [System.Drawing.Graphics]::FromImage($measureBmp2)
    $mg2.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    $lineWidths  = @()
    $lineH       = $font.GetHeight(96)    # pixel height per line at 96 dpi
    foreach ($line in $lines) {
        $lw = $mg2.MeasureString($line, $font, [int]::MaxValue, $sfLine).Width
        $lineWidths += $lw
    }

    # ── HARD GUARANTEE: shrink until every line fits within safe drawing area ────
    # safeW = space inside padding/border where text can be drawn without overflow
    $safeW = [float]($maxW - 2 * $padX - 2 * $borderW)
    while ($curSize -gt 8) {
        $allFit = $true
        foreach ($lw in $lineWidths) {
            if ($lw -gt $safeW) { $allFit = $false; break }
        }
        if ($allFit) { break }
        # Reduce font 10% and re-wrap + re-measure
        $curSize = [int]([Math]::Max([Math]::Floor($curSize * 0.90), 8))
        $font.Dispose()
        try   { $font = New-Object System.Drawing.Font("Arial", $curSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel) }
        catch { $font = New-Object System.Drawing.Font([System.Drawing.FontFamily]::GenericSansSerif, $curSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel) }
        $lines      = WrapWords $words $font $mg2 $maxLineW
        $lineH      = $font.GetHeight(96)
        $lineWidths = @()
        foreach ($line in $lines) {
            $lineWidths += $mg2.MeasureString($line, $font, [int]::MaxValue, $sfLine).Width
        }
    }
    $mg2.Dispose(); $measureBmp2.Dispose()

    $totalTextH = [int][Math]::Ceiling($lines.Count * $lineH)
    $imgW       = $maxW
    $imgH       = $totalTextH + 2 * $padY + 2 * $borderW

    # ── Draw ────────────────────────────────────────────────────────────────────
    $bmp = New-Object System.Drawing.Bitmap($imgW, $imgH)
    $bmp.SetResolution(96, 96)          # must match measurement bitmaps — key fix for DPI scaling
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $gfx.TextRenderingHint  = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    # Border
    if ($borderW -gt 0) {
        $b = New-Object System.Drawing.SolidBrush($brdColor)
        $gfx.FillRectangle($b, 0, 0, $imgW, $imgH)
        $b.Dispose()
    }
    # Background
    $b2 = New-Object System.Drawing.SolidBrush($bgColor)
    $gfx.FillRectangle($b2, $borderW, $borderW, $imgW - 2*$borderW, $imgH - 2*$borderW)
    $b2.Dispose()

    # Draw each line individually, centered in full image width
    # drawX = (imgW - lineWidth) / 2  →  G always at imgW/2 - lineWidth/2 ≥ padX
    $tb      = New-Object System.Drawing.SolidBrush($txtColor)
    $lineY   = [float]($padY + $borderW)

    for ($li = 0; $li -lt $lines.Count; $li++) {
        $lw    = [float]$lineWidths[$li]
        $drawX = [float](($imgW - $lw) / 2.0)
        # Clamp: never touch left border, never overflow right border
        if ($drawX -lt $borderW) { $drawX = [float]$borderW }
        if (($drawX + $lw) -gt ($imgW - $borderW)) { $drawX = [float]($imgW - $borderW - $lw) }
        if ($drawX -lt $borderW) { $drawX = [float]$borderW }  # re-clamp after right adjustment
        $gfx.DrawString($lines[$li], $font, $tb, $drawX, $lineY, $sfLine)
        $lineY += $lineH
    }
    $tb.Dispose()

    $font.Dispose()
    $gfx.Dispose()
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    Write-Output "$imgW,$imgH"
    exit 0
}
catch {
    Write-Error "hook_gen_gdi error at line $($_.InvocationInfo.ScriptLineNumber): $($_.Exception.Message)"
    exit 1
}
