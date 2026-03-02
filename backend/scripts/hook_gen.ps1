Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName WindowsBase

# Args: textFile fontSize padX padY borderW bgHex textHex borderHex maxW outPath
$textFile = $args[0]
$fontSize = [int]$args[1]
$padX = [int]$args[2]
$padY = [int]$args[3]
$borderW = [int]$args[4]
$bgHex = $args[5]
$textHex = $args[6]
$borderHex = $args[7]
$maxW = [int]$args[8]
$outPath = $args[9]

# Read text from file (preserves emoji / Unicode correctly)
$text = [System.IO.File]::ReadAllText($textFile, [System.Text.Encoding]::UTF8).Trim()
if ($text.Length -gt 0 -and [int]$text[0] -eq 0xFEFF) { $text = $text.Substring(1) }

# Parse colors
function HexToMediaColor($hex) {
    $hex = $hex.TrimStart('#')
    $r = [Convert]::ToByte($hex.Substring(0, 2), 16)
    $g = [Convert]::ToByte($hex.Substring(2, 2), 16)
    $b = [Convert]::ToByte($hex.Substring(4, 2), 16)
    return [System.Windows.Media.Color]::FromRgb($r, $g, $b)
}

$bgColor = HexToMediaColor $bgHex
$textColor = HexToMediaColor $textHex
$borderColor = HexToMediaColor $borderHex

# Fixed box width = maxW (consistent, no cutoff)
$boxW = $maxW
$contentW = $boxW - ($padX * 2)

$typeface = New-Object System.Windows.Media.Typeface("Segoe UI")
$brush = New-Object System.Windows.Media.SolidColorBrush($textColor)

# Auto-shrink font to max 2 lines
$maxLines = 3
$currentFontSize = $fontSize

function MeasureText($fs) {
    $ft = New-Object System.Windows.Media.FormattedText(
        $text,
        [System.Globalization.CultureInfo]::InvariantCulture,
        [System.Windows.FlowDirection]::LeftToRight,
        $typeface,
        $fs,
        $brush,
        1.0
    )
    $ft.MaxTextWidth = [double]$contentW
    $ft.TextAlignment = [System.Windows.TextAlignment]::Center
    $ft.SetFontWeight([System.Windows.FontWeights]::Bold)
    return $ft
}

# Measure with initial font → check line count, reduce if > maxLines
$formattedText = MeasureText $currentFontSize
$lineCount = [int][Math]::Round($formattedText.Height / ($currentFontSize * 1.3))

# If more than maxLines, reduce font size step by step
while ($lineCount -gt $maxLines -and $currentFontSize -gt 20) {
    $currentFontSize = [int]($currentFontSize - 2)
    $formattedText = MeasureText $currentFontSize
    $lineCount = [int][Math]::Round($formattedText.Height / ($currentFontSize * 1.3))
}

$textH = [int][Math]::Ceiling($formattedText.Height)
$boxH = $textH + ($padY * 2)
$imgW = $boxW + ($borderW * 2)
$imgH = $boxH + ($borderW * 2)

# Create DrawingVisual
$dv = New-Object System.Windows.Media.DrawingVisual
$dc = $dv.RenderOpen()

# Draw border rect (full image area)
$borderBrush = New-Object System.Windows.Media.SolidColorBrush($borderColor)
$dc.DrawRectangle($borderBrush, $null, (New-Object System.Windows.Rect(0, 0, $imgW, $imgH)))

# Draw background rect (inside border)
$bgBrush = New-Object System.Windows.Media.SolidColorBrush($bgColor)
$dc.DrawRectangle($bgBrush, $null, (New-Object System.Windows.Rect($borderW, $borderW, $boxW, $boxH)))

# Draw text — centered within the full contentW area
$textOrigin = New-Object System.Windows.Point(($borderW + $padX), ($borderW + $padY))
$dc.DrawText($formattedText, $textOrigin)

$dc.Close()

# Render to bitmap at 96 DPI
$dpi = 96
$rtb = New-Object System.Windows.Media.Imaging.RenderTargetBitmap($imgW, $imgH, $dpi, $dpi, [System.Windows.Media.PixelFormats]::Pbgra32)
$rtb.Render($dv)

# Save as PNG
$encoder = New-Object System.Windows.Media.Imaging.PngBitmapEncoder
$encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($rtb))
$stream = [System.IO.File]::Create($outPath)
$encoder.Save($stream)
$stream.Close()

Write-Output "$imgW,$imgH"
