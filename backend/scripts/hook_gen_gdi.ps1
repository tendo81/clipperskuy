# hook_gen_gdi.ps1 — Generate hook overlay PNG using System.Drawing (GDI+)
# Faster and more robust than WPF version. No STA required.
# Args: textFile fontSize padX padY borderW bgHex textHex borderHex maxW outPath

Add-Type -AssemblyName System.Drawing

$textFile = $args[0]
$fontSize = [int]$args[1]
$padX = [int]$args[2]
$padY = [int]$args[3]
$borderW = [int]$args[4]
$bgHex = [string]$args[5]
$textHex = [string]$args[6]
$borderHex = [string]$args[7]
$maxW = [int]$args[8]
$outPath = [string]$args[9]

try {
    # Read text from file
    $text = [System.IO.File]::ReadAllText($textFile.Trim(), [System.Text.Encoding]::UTF8).Trim()
    # Remove BOM if present
    if ($text.StartsWith([char]0xFEFF)) { $text = $text.Substring(1) }
    if ($text.Length -eq 0) { Write-Output "0,0"; exit 0 }

    # Parse colors
    function HexToColor($hex) {
        $hex = $hex.TrimStart('#')
        if ($hex.Length -eq 6) { $hex = "FF$hex" }
        $a = [Convert]::ToByte($hex.Substring(0, 2), 16)
        $r = [Convert]::ToByte($hex.Substring(2, 2), 16)
        $g = [Convert]::ToByte($hex.Substring(4, 2), 16)
        $b = [Convert]::ToByte($hex.Substring(6, 2), 16)
        return [System.Drawing.Color]::FromArgb($a, $r, $g, $b)
    }

    $bgColor = HexToColor $bgHex
    $txtColor = HexToColor $textHex
    $brdColor = HexToColor $borderHex

    # Create font (use bold Arial, fallback to GenericSansSerif)
    $fontFamily = "Arial"
    try { $font = New-Object System.Drawing.Font($fontFamily, $fontSize, [System.Drawing.FontStyle]::Bold) }
    catch { $font = New-Object System.Drawing.Font([System.Drawing.FontFamily]::GenericSansSerif, $fontSize, [System.Drawing.FontStyle]::Bold) }

    # Measure string
    $measureBmp = New-Object System.Drawing.Bitmap(1, 1)
    $measureGfx = [System.Drawing.Graphics]::FromImage($measureBmp)
    $measureGfx.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center

    # Word-wrap to maxW
    $inner = $maxW - 2 * $padX - 2 * $borderW
    $inner = [Math]::Max($inner, 100)
    $sizef = $measureGfx.MeasureString($text, $font, $inner, $sf)
    $measureGfx.Dispose(); $measureBmp.Dispose()

    $textW = [int]$sizef.Width
    $textH = [int]$sizef.Height
    $imgW = $textW + 2 * $padX + 2 * $borderW
    $imgH = $textH + 2 * $padY + 2 * $borderW

    # Cap width
    if ($imgW -gt $maxW) { $imgW = $maxW }

    # Draw
    $bmp = New-Object System.Drawing.Bitmap($imgW, $imgH)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $gfx.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    # Border (filled rect slightly larger)
    if ($borderW -gt 0) {
        $brdBrush = New-Object System.Drawing.SolidBrush($brdColor)
        $gfx.FillRectangle($brdBrush, 0, 0, $imgW, $imgH)
        $brdBrush.Dispose()
    }

    # Background
    $bgBrush = New-Object System.Drawing.SolidBrush($bgColor)
    $gfx.FillRectangle($bgBrush, $borderW, $borderW, $imgW - 2 * $borderW, $imgH - 2 * $borderW)
    $bgBrush.Dispose()

    # Text
    $txtBrush = New-Object System.Drawing.SolidBrush($txtColor)
    $rectX = [float]($padX + $borderW)
    $rectY = [float]($padY + $borderW)
    $rectW = [float]($imgW - 2 * $padX - 2 * $borderW)
    $rectH = [float]($imgH - 2 * $padY - 2 * $borderW)
    $textRect = New-Object System.Drawing.RectangleF($rectX, $rectY, $rectW, $rectH)
    $gfx.DrawString($text, $font, $txtBrush, $textRect, $sf)
    $txtBrush.Dispose()


    $font.Dispose()
    $gfx.Dispose()

    # Save
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    Write-Output "$imgW,$imgH"
    exit 0

}
catch {
    Write-Error "hook_gen_gdi error at line $($_.InvocationInfo.ScriptLineNumber): $($_.Exception.Message)"
    exit 1
}

