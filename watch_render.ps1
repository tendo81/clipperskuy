# ─────────────────────────────────────────────────────────
#  CLIPPERSKUY — Live Render Monitor
#  Jalankan: powershell -File watch_render.ps1
#  Tekan Ctrl+C untuk berhenti
# ─────────────────────────────────────────────────────────

$BackendPort = 5000
$PollInterval = 1

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "   ClipperSkuy  |  Live Render Monitor      " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Backend: http://localhost:$BackendPort" -ForegroundColor DarkGray
Write-Host "  Tekan Ctrl+C untuk berhenti" -ForegroundColor DarkGray
Write-Host ""

while ($true) {
    $timestamp = Get-Date -Format "HH:mm:ss"

    # ── 1. Cek FFmpeg lagi jalan ──────────────────────────
    $ffmpegProcs = Get-Process ffmpeg -ErrorAction SilentlyContinue
    if ($ffmpegProcs) {
        foreach ($p in $ffmpegProcs) {
            $cpu = [math]::Round($p.CPU, 1)
            $mem = [math]::Round($p.WorkingSet / 1MB, 0)
            Write-Host "[$timestamp] [FFMPEG] PID=$($p.Id) | CPU=$cpu s | RAM=$mem MB" -ForegroundColor Green
        }
    }
    else {
        Write-Host "[$timestamp] [FFMPEG] Tidak ada proses FFmpeg berjalan" -ForegroundColor DarkGray
    }

    # ── 2. Node.js backend ────────────────────────────────
    $nodeProcs = Get-Process node -ErrorAction SilentlyContinue
    if ($nodeProcs) {
        foreach ($p in $nodeProcs) {
            $cpu = [math]::Round($p.CPU, 1)
            $mem = [math]::Round($p.WorkingSet / 1MB, 0)
            Write-Host "[$timestamp] [BACKEND] PID=$($p.Id) | CPU=$cpu s | RAM=$mem MB" -ForegroundColor Yellow
        }
    }

    # ── 3. Poll API untuk status clips ───────────────────
    try {
        $resp = Invoke-RestMethod -Uri "http://localhost:$BackendPort/api/projects" `
            -TimeoutSec 2 -ErrorAction Stop

        $renderingClips = @()
        if ($resp -and $resp.Count -gt 0) {
            foreach ($project in $resp) {
                try {
                    $clips = Invoke-RestMethod -Uri "http://localhost:$BackendPort/api/projects/$($project.id)/clips" `
                        -TimeoutSec 2 -ErrorAction Stop
                    $active = $clips | Where-Object { $_.status -eq "rendering" }
                    if ($active) {
                        $renderingClips += $active
                    }
                }
                catch {}
            }
        }

        if ($renderingClips.Count -gt 0) {
            Write-Host ""
            Write-Host "[$timestamp] >>> RENDERING AKTIF: $($renderingClips.Count) clip(s) <<<" -ForegroundColor Magenta
            foreach ($clip in $renderingClips) {
                Write-Host "    Clip #$($clip.clip_number) | $($clip.title) | Status: $($clip.status)" -ForegroundColor Magenta
            }
        }
        else {
            Write-Host "[$timestamp] [STATUS] Tidak ada clip yang sedang render" -ForegroundColor DarkGray
        }
    }
    catch {
        Write-Host "[$timestamp] [ERROR] Backend tidak bisa diakses di port $BackendPort" -ForegroundColor Red
    }

    Write-Host "--------------------------------------------" -ForegroundColor DarkGray
    Start-Sleep -Seconds $PollInterval
}
