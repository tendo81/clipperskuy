const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { get, run } = require('../database');
const { generateFaceTrackCrop, generatePodcastCrop } = require('./faceTracker');

const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, '..', '..', 'data');
const CLIPS_DIR = path.join(DATA_DIR, 'clips');

// Resolve FFmpeg/FFprobe path — use env variable, bundled binary, or fallback to PATH
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE_PATH = process.env.FFPROBE_PATH || 'ffprobe';

fs.ensureDirSync(CLIPS_DIR);



/**
 * Run FFmpeg with given args, returning a promise
 * - Closes stdin immediately to prevent FFmpeg from waiting for input
 * - Has a timeout to prevent infinite hangs
 * - Emits real-time log lines to frontend via socket.io
 */
function runFFmpeg(args, duration, emit, io, projectId) {
    return new Promise((resolve, reject) => {
        const cmdStr = `ffmpeg ${args.join(' ')}`;
        console.log(`[Render] FFmpeg: ${cmdStr}`);

        const proc = spawn(FFMPEG_PATH, args, { windowsHide: true });

        // CRITICAL: Close stdin immediately so FFmpeg doesn't hang waiting for input
        proc.stdin.end();

        let stderr = '';
        let lastProgress = 10;
        let lastLogTime = 0;

        // Timeout: 20 minutes max per render pass
        const TIMEOUT_MS = 20 * 60 * 1000;
        const timeout = setTimeout(() => {
            console.error('[Render] FFmpeg timed out after 20 minutes, killing process...');
            if (emit) emit(null, 'Render timeout after 20 minutes');
            proc.kill('SIGKILL');
        }, TIMEOUT_MS);

        proc.stderr.on('data', (data) => {
            const line = data.toString();
            stderr += line;

            // Parse FFmpeg time progress
            const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
            if (timeMatch && duration > 0) {
                const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
                const pct = Math.min(95, Math.round((currentTime / duration) * 85) + 10);
                if (pct > lastProgress) {
                    lastProgress = pct;
                    if (emit) emit(pct, `Rendering... ${pct}%`);
                }
            }

            // Emit real-time log lines to frontend (throttled to every 500ms)
            const now = Date.now();
            if (io && projectId && now - lastLogTime > 500) {
                lastLogTime = now;
                const cleanLine = line.trim().replace(/\r/g, '');
                if (cleanLine) {
                    io.emit('process:log', {
                        projectId,
                        type: cleanLine.toLowerCase().includes('error') ? 'error' : 'info',
                        message: `[FFmpeg] ${cleanLine.substring(0, 200)}`,
                        timestamp: new Date().toTimeString()
                    });
                }
            }
        });

        proc.on('close', (code) => {
            clearTimeout(timeout);
            if (code === 0) {
                resolve({ success: true, stderr });
            } else {
                const errorLines = stderr.split('\n').filter(l =>
                    l.includes('Error') || l.includes('error') || l.includes('Invalid') || l.includes('No such') || l.includes('does not contain')
                );
                const errorMsg = errorLines.slice(-3).join(' ').trim() || `FFmpeg exited with code ${code}`;
                console.error(`[Render] FFmpeg failed (code ${code}): ${errorMsg}`);
                resolve({ success: false, stderr, errorMsg, code });
            }
        });

        proc.on('error', (err) => {
            clearTimeout(timeout);
            console.error(`[Render] FFmpeg spawn error: ${err.message}. Is FFmpeg installed? Path: ${FFMPEG_PATH}`);
            reject(err);
        });
    });
}

/**
 * Validate output file exists and is playable (>1KB)
 */
function validateOutput(outputPath) {
    if (!fs.existsSync(outputPath)) return false;
    const stats = fs.statSync(outputPath);
    return stats.size > 1024; // Must be >1KB to be valid
}

/**
 * Build output filename from template.
 * Supported tokens: {number}, {title}, {score}, {date}, {date_time}, {duration}, {project}, {id}
 * Default template: '{number}_{title}'
 */
function buildOutputFilename(template, clip, project) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const durSec = Math.round((clip.end_time || 0) - (clip.start_time || 0));
    const durStr = durSec >= 60 ? `${Math.floor(durSec / 60)}m${durSec % 60}s` : `${durSec}s`;

    const sanitize = (str, maxLen = 40) => (str || '')
        .replace(/[^a-zA-Z0-9\u00C0-\u024F\u0100-\u017E\u4e00-\u9fff\uac00-\ud7af\u3040-\u30ff_\-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, maxLen) || 'clip';

    const tpl = (template || '{number}_{title}');
    const filename = tpl
        .replace(/\{number\}/g, String(clip.clip_number || 1).padStart(2, '0'))
        .replace(/\{title\}/g, sanitize(clip.title))
        .replace(/\{score\}/g, String(clip.virality_score || 0))
        .replace(/\{date\}/g, dateStr)
        .replace(/\{date_time\}/g, `${dateStr}_${timeStr}`)
        .replace(/\{duration\}/g, durStr)
        .replace(/\{project\}/g, sanitize(project.name, 20))
        .replace(/\{id\}/g, (clip.id || '').slice(-6));

    // Final sanitize entire filename and ensure no leading/trailing underscores
    return sanitize(filename, 80) + '.mp4';
}

/**
 * Render a single clip from the source video
 * Tries preferred filter first, falls back to simple scale+crop on failure
 */
async function renderClip(clipId, io) {
    const clip = get('SELECT * FROM clips WHERE id = ?', [clipId]);
    if (!clip) throw new Error('Clip not found');

    const project = get('SELECT * FROM projects WHERE id = ?', [clip.project_id]);
    if (!project) throw new Error('Project not found');
    if (!project.source_path || !fs.existsSync(project.source_path)) {
        throw new Error('Source video file not found');
    }

    const emit = (progress, message) => {
        if (io) {
            io.emit('clip:progress', { clipId, projectId: project.id, progress, message });
            // Also emit as process:log so it appears in the log panel
            io.emit('process:log', {
                projectId: project.id,
                type: 'info',
                message: `[Render] Clip #${clip.clip_number}: ${message}`,
                timestamp: new Date().toTimeString()
            });
        }
        console.log(`[Render] Clip #${clip.clip_number}: ${progress != null ? progress + '%' : ''} - ${message}`);
    };

    run("UPDATE clips SET status = 'rendering' WHERE id = ?", [clipId]);
    emit(5, 'Starting render...');

    // Settings
    let reframingMode = project.reframing_mode || 'center';
    const aspectRatio = project.aspect_ratio || '9:16';
    const settingsRows = require('../database').all('SELECT * FROM settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });


    let { outW, outH } = getOutputDimensions(aspectRatio, settings.output_resolution || '1080p');

    // ===== Validate clip timing vs actual video duration =====
    try {
        const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
        const { exec } = require('child_process');
        const probeOut = await new Promise((resolve, reject) => {
            exec(
                `"${ffprobePath}" -v quiet -show_entries format=duration -of csv=p=0 "${project.source_path}"`,
                { timeout: 10000 },
                (err, stdout) => err ? reject(err) : resolve(stdout.trim())
            );
        });
        const videoDuration = parseFloat(probeOut);
        if (!isNaN(videoDuration) && clip.start_time >= videoDuration) {
            const msg = `Clip start (${clip.start_time}s) exceeds video duration (${videoDuration.toFixed(1)}s) — skipping`;
            console.error(`[Render] ${msg}`);
            run("UPDATE clips SET status = 'failed' WHERE id = ?", [clipId]);
            emit(0, `⚠️ ${msg}`);
            throw new Error(msg);
        }
        if (!isNaN(videoDuration) && clip.end_time > videoDuration) {
            console.warn(`[Render] Clip end (${clip.end_time}s) > video duration (${videoDuration.toFixed(1)}s) — clamped`);
            clip.end_time = Math.floor(videoDuration);
        }
        // Enforce minimum clip duration (≥5s) after clamping
        const clampedDuration = clip.end_time - clip.start_time;
        if (clampedDuration < 5) {
            const msg = `Clip too short after clamping (${clampedDuration.toFixed(1)}s < 5s) — skipping`;
            console.error(`[Render] ${msg}`);
            run("UPDATE clips SET status = 'failed' WHERE id = ?", [clipId]);
            emit(0, `⚠️ ${msg}`);
            throw new Error(msg);
        }
    } catch (e) {
        if (e.message && (e.message.includes('exceeds video duration') || e.message.includes('too short'))) throw e;
        console.warn('[Render] Could not validate clip timing:', e.message ? e.message.substring(0, 100) : e);
    }

    // Duration is calculated AFTER clamping end_time above
    const duration = clip.end_time - clip.start_time;

    // ===== Apply license tier restrictions =====
    const { getRenderLimits, checkDailyExportLimit, incrementDailyExport } = require('./license');
    const renderLimits = getRenderLimits();

    // Daily export limit for free tier
    const dailyCheck = checkDailyExportLimit();
    if (!dailyCheck.allowed) {
        emit(0, '\ud83d\udd12 ' + dailyCheck.message);
        return { success: false, error: dailyCheck.message };
    }

    // Force quality to fast for free tier
    if (renderLimits.tier === 'free') {
        const currentQuality = settings.quality_preset || 'balanced';
        if (currentQuality !== 'fast') {
            settings.quality_preset = 'fast';
            emit(5, 'Free tier: menggunakan Quick quality');
        }
    }

    // Resolution cap for free tier (720p max)
    if (renderLimits.maxResolution <= 720) {
        const maxDim = 720;
        if (outW > outH) {
            // Landscape: cap width
            if (outW > 1280) { outW = 1280; outH = 720; }
        } else {
            // Portrait: cap height based on ratio
            if (outH > 1280) {
                const ratio = outW / outH;
                outH = 1280;
                outW = Math.round(outH * ratio);
                outW = outW % 2 === 0 ? outW : outW + 1; // Ensure even
            }
        }
        emit(5, `Free tier: resolusi dibatasi ${outW}x${outH}`);
    }

    // Force CPU for free tier (no GPU acceleration) + faster preset to prevent hanging
    if (!renderLimits.gpuAllowed) {
        settings.encoder = 'libx264';
        settings.hw_accel = 'none';
        settings.quality_preset = 'fast'; // Force fast preset for free tier to avoid CPU bottleneck
    }

    // Force watermark text for free tier if no watermark image
    if (renderLimits.watermarkRequired && !settings.watermark_path) {
        settings.watermark_text = 'ClipperSkuy Free';
    }

    // ===== Check source video resolution → warn if low =====
    let sourceW = 0;
    try {
        const { exec: execCb } = require('child_process');
        const probeResult = await new Promise((resolve) => {
            const timer = setTimeout(() => resolve(''), 8000);
            execCb(
                `"${FFPROBE_PATH}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${project.source_path}"`,
                { encoding: 'utf-8', timeout: 9000 },
                (err, stdout) => { clearTimeout(timer); resolve((stdout || '').trim()); }
            );
        });
        const [srcW, srcH] = probeResult.split(',').map(Number);
        if (srcW && srcH) {
            sourceW = srcW;
            const srcMax = Math.max(srcW, srcH);
            console.log(`[Render] Source resolution: ${srcW}x${srcH}`);
            if (srcMax < 720) {
                emit(4, `⚠️ Video sumber resolusi rendah (${srcW}x${srcH}). Kualitas output terbatas.`);
            }
        }
    } catch (e) { /* ignore */ }


    // Output path — use filename template from settings
    const filenameTemplate = settings.export_filename_template || '{number}_{title}';
    const outputFilename = buildOutputFilename(filenameTemplate, clip, project);
    const projectClipsDir = path.join(CLIPS_DIR, project.id);
    fs.ensureDirSync(projectClipsDir);
    const outputPath = path.join(projectClipsDir, outputFilename);

    // Per-clip temp dir for hook overlay files (avoids race condition on parallel renders)
    const clipTempDir = path.join(projectClipsDir, `_tmp_clip${clip.clip_number}_${clipId}`);
    fs.ensureDirSync(clipTempDir);

    // Remove existing broken file
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) { }

    // ===== Generate subtitle file (ASS) if transcript available =====
    let assPath = null;
    let subFontsDir = null;
    try {
        const subResult = generateSubtitleFile(clip, project, projectClipsDir);
        if (subResult) {
            // generateSubtitleFile returns the ASS path string directly
            assPath = typeof subResult === 'string' ? subResult : subResult.assPath;
            subFontsDir = typeof subResult === 'object' ? subResult.fontsDir : null;
            emit(8, 'Subtitles generated');
        } else {
            emit(8, 'No subtitles (no transcript segments in clip range)');
        }
    } catch (e) {
        console.warn(`[Render] Subtitle generation failed: ${e.message}`);
        emit(8, `Subtitle error: ${e.message}`);
    }

    emit(10, `Reframing: ${reframingMode}, ${outW}x${outH}`);

    // ===== Face track: run detection before building filters =====
    let faceTrackFilter = null;
    if (reframingMode === 'face_track') {
        if (!renderLimits.faceTrackAllowed) {
            emit(8, '🔒 Face Track is a PRO feature — using center crop instead');
            reframingMode = 'center';
        } else {
            try {
                emit(12, 'Analyzing face positions...');
                const result = await generateFaceTrackCrop(project.source_path, outW, outH, duration, clip.start_time);
                if (result.cropFilter) {
                    faceTrackFilter = result.cropFilter;
                    emit(18, `Face tracking: ${result.positions.length} positions detected`);
                } else {
                    emit(15, 'No faces detected, using center crop');
                }
            } catch (e) {
                console.warn('[Render] Face tracking failed, falling back to center:', e.message);
                emit(15, 'Face tracking failed, using center crop');
            }
        }
    }

    // ===== Podcast mode: detect speakers and generate crop =====
    let podcastFilter = null;
    if (reframingMode === 'podcast') {
        if (!renderLimits.podcastAllowed) {
            emit(8, '🔒 Podcast mode is a PRO feature — using center crop instead');
            reframingMode = 'center';
        } else {
            try {
                emit(12, 'Detecting speakers...');
                const result = await generatePodcastCrop(project.source_path, outW, outH, duration, clip.start_time);
                if (result.cropFilter) {
                    podcastFilter = result.cropFilter;
                    if (result.mode === 'split') {
                        emit(18, `Podcast: ${result.faceCount} speakers detected — split screen`);
                    } else {
                        emit(18, `Podcast: 1 speaker detected — full zoom`);
                    }
                } else {
                    emit(15, 'No speakers detected, using center crop');
                    reframingMode = 'center';
                }
            } catch (e) {
                console.warn('[Render] Podcast detection failed, falling back to center:', e.message);
                emit(15, 'Podcast detection failed, using center crop');
                reframingMode = 'center';
            }
        } // end else podcastAllowed
    }

    // ===== Face Track + Blur mode =====
    // TikTok/Reels style: blurred background fills entire 9:16 canvas,
    // face-tracked video shown at full width in center (maintains source aspect ratio).
    // Blurred background peeks through at top & bottom (letterbox areas).
    let faceTrackBlurFilter = null;
    if (reframingMode === 'face_track_blur') {
        if (!renderLimits.faceTrackBlurAllowed) {
            emit(8, '🔒 Face Track + Blur adalah fitur PRO — menggunakan mode fit');
            reframingMode = 'fit';
        } else {
            try {
                emit(12, 'Analyzing face positions for blur mode...');
                const result = await generateFaceTrackCrop(project.source_path, outW, outH, duration, clip.start_time);
                const scaleFlags = ':flags=lanczos';

                // Get source dimensions to build proper filter
                const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
                const probeCmd = `"${ffprobePath}" -v quiet -print_format json -show_streams "${project.source_path}"`;
                const { stdout: probeOut } = await require('util').promisify(require('child_process').exec)(probeCmd, { timeout: 10000 });
                const probeData = JSON.parse(probeOut);
                const videoStream = probeData.streams.find(s => s.codec_type === 'video');
                const srcW = videoStream ? videoStream.width : 1920;
                const srcH = videoStream ? videoStream.height : 1080;

                if (result.positions.length > 0) {
                    // Get average face position for centering
                    const avgFaceX = result.positions.reduce((s, p) => s + p.x, 0) / result.positions.length;
                    const avgFaceY = result.positions.reduce((s, p) => s + p.y, 0) / result.positions.length;

                    // Target: foreground fills ~75% of output height
                    // This keeps blur bars thin (just enough for hook text + subtitles)
                    const fgFillRatio = 0.75;
                    const fgH = Math.round(outH * fgFillRatio);
                    const fgHEven = fgH % 2 === 0 ? fgH : fgH - 1;

                    // Calculate how much of the source to crop to achieve this fill
                    // We want: crop(cropW x cropH) → scale(outW x fgHEven)
                    // Maintain crop aspect ratio = outW/fgHEven
                    const cropAR = outW / fgHEven;
                    let cropH = srcH;  // Use full source height
                    let cropW = Math.round(cropH * cropAR);

                    // If cropW exceeds source width, fit by width instead
                    if (cropW > srcW) {
                        cropW = srcW;
                        cropH = Math.round(srcW / cropAR);
                        cropH = cropH % 2 === 0 ? cropH : cropH - 1;
                    }
                    cropW = cropW % 2 === 0 ? cropW : cropW - 1;

                    // Center crop on face position
                    const cropX = Math.max(0, Math.min(Math.round(avgFaceX - cropW / 2), srcW - cropW));
                    const cropY = Math.max(0, Math.min(Math.round(avgFaceY - cropH / 2), srcH - cropH));

                    faceTrackBlurFilter = [
                        `[0:v]split[a][b]`,
                        // Background: scale+crop to fill entire output, then blur heavily
                        `[a]scale=${outW}:${outH}:force_original_aspect_ratio=increase${scaleFlags},crop=${outW}:${outH},boxblur=30:10[bg]`,
                        // Foreground: crop source centered on face, then scale to target size
                        `[b]crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${outW}:${fgHEven}${scaleFlags}[fg]`,
                        // Overlay foreground centered vertically on blurred background
                        `[bg][fg]overlay=0:(H-h)/2[ftblur_out]`
                    ].join(';');

                    console.log(`[Render] Face Track Blur: srcW=${srcW} srcH=${srcH} crop=${cropW}x${cropH}@${cropX},${cropY} fgH=${fgHEven} (${Math.round(fgHEven / outH * 100)}% fill) faceXY=${Math.round(avgFaceX)},${Math.round(avgFaceY)}`);
                    emit(18, `Face Track Blur: ${result.positions.length} positions, ${Math.round(fgHEven / outH * 100)}% fill`);
                } else {
                    // No faces detected — zoom into center of source
                    emit(15, 'No faces detected, using center zoom with blur');
                    const fgFillRatio = 0.75;
                    const fgH = Math.round(outH * fgFillRatio);
                    const fgHEven = fgH % 2 === 0 ? fgH : fgH - 1;

                    const cropAR = outW / fgHEven;
                    let cropH = srcH;
                    let cropW = Math.round(cropH * cropAR);
                    if (cropW > srcW) {
                        cropW = srcW;
                        cropH = Math.round(srcW / cropAR);
                        cropH = cropH % 2 === 0 ? cropH : cropH - 1;
                    }
                    cropW = cropW % 2 === 0 ? cropW : cropW - 1;

                    // Center crop
                    const cropX = Math.round((srcW - cropW) / 2);
                    const cropY = Math.round((srcH - cropH) / 2);

                    faceTrackBlurFilter = [
                        `[0:v]split[a][b]`,
                        `[a]scale=${outW}:${outH}:force_original_aspect_ratio=increase${scaleFlags},crop=${outW}:${outH},boxblur=30:10[bg]`,
                        `[b]crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${outW}:${fgHEven}${scaleFlags}[fg]`,
                        `[bg][fg]overlay=0:(H-h)/2[ftblur_out]`
                    ].join(';');
                }
            } catch (e) {
                console.warn('[Render] Face track blur failed, falling back to fit:', e.message);
                emit(15, 'Face track blur failed, using fit mode');
                reframingMode = 'fit';
            }
        }
    }

    // ===== Encoder selection (hardware acceleration) =====
    const { encoder, encoderArgs } = await getEncoder(settings);
    console.log(`[Render] Encoder: ${encoder}`);


    const qualityPreset = settings.quality_preset || 'balanced';
    const preset = qualityPreset === 'best' ? 'slow' : qualityPreset === 'fast' ? 'ultrafast' : 'medium';
    const crf = qualityPreset === 'best' ? '18' : qualityPreset === 'fast' ? '28' : '23';

    // ===== Audio filter chain =====
    const audioFilters = [];

    // Noise reduction (afftdn) — PRO only
    const nrEnabled = settings.noise_reduction === 'true' || settings.noise_reduction === '1';
    if (nrEnabled) {
        if (!renderLimits.audioEnhancementAllowed) {
            emit(8, '🔒 Noise Reduction is a PRO feature — skipped');
        } else {
            const nrLevel = settings.noise_reduction_level || 'medium';
            const nf = nrLevel === 'light' ? '-20' : nrLevel === 'heavy' ? '-35' : '-25';
            audioFilters.push(`afftdn=nf=${nf}`);
            audioFilters.push('highpass=f=80');   // Remove low rumble
            audioFilters.push('lowpass=f=13000'); // Remove high hiss
            emit(9, `Noise reduction: ${nrLevel}`);
        }
    }

    // Voice clarity boost (EQ) — PRO only
    const vcEnabled = settings.voice_clarity === 'true' || settings.voice_clarity === '1';
    if (vcEnabled) {
        if (!renderLimits.audioEnhancementAllowed) {
            emit(8, '🔒 Voice Clarity is a PRO feature — skipped');
        } else {
            audioFilters.push('equalizer=f=3000:t=q:w=1.5:g=3');  // Boost vocal presence
            audioFilters.push('equalizer=f=5000:t=q:w=2:g=2');    // Boost clarity/air
            audioFilters.push('acompressor=threshold=-20dB:ratio=3:attack=5:release=50'); // Gentle compression
        }
    }

    // Loudness normalization (always on)
    audioFilters.push('loudnorm=I=-16:TP=-1.5:LRA=11');

    const audioFilter = audioFilters.join(',');

    // ===== Background Music =====
    let musicTrack = null;
    if (clip.music_track_id) {
        const track = get('SELECT * FROM music_tracks WHERE id = ?', [clip.music_track_id]);
        if (track && track.file_path && fs.existsSync(track.file_path)) {
            musicTrack = track;
            emit(9, `Adding music: ${track.name}`);
        }
    }
    const musicVolume = (clip.music_volume || 20) / 100; // 0-1 range

    // ===== Watermark =====
    const watermarkFilter = buildWatermarkFilter(settings, outW, outH);

    // ===== Progress Bar =====
    const progressBarFilter = buildProgressBarFilter(settings, outW, outH, duration);

    // ===== ATTEMPT 1: Preferred filter with subtitles =====
    const podcastIsSplit = podcastFilter && podcastFilter.includes('[0:v]split');
    const ftBlurIsSplit = faceTrackBlurFilter && faceTrackBlurFilter.includes('[0:v]split');
    const useFilterComplex = (reframingMode === 'fit' || reframingMode === 'split' || podcastIsSplit || ftBlurIsSplit || watermarkFilter || musicTrack);
    const vf = faceTrackBlurFilter || podcastFilter || faceTrackFilter || buildVideoFilter(reframingMode, outW, outH, sourceW);

    // Detect if vf is a complex filter graph via its output label.
    // Every complex filter MUST have an explicit output label — this avoids ambiguity.
    // Labels: [ftblur_out] = face_track_blur, [fit_out] = fit, [split_out] = split mode,
    //         vstack = podcast split (podcast uses its own builder, not this flag)
    const COMPLEX_OUTPUT_LABELS = ['[ftblur_out]', '[fit_out]', '[split_out]', 'vstack'];
    const isComplexVf = vf.includes('[0:v]') && COMPLEX_OUTPUT_LABELS.some(label => vf.includes(label));

    // Build subtitle filter string — two variants:
    // subFilter       : for -vf usage (colons escaped as \\:)
    // subFilterComplex: for -filter_complex usage (colons escaped as \: — single backslash)
    const subFilter = assPath ? buildSubtitleFilter(assPath) : '';
    const subFilterComplex = assPath ? buildSubtitleFilterComplex(assPath) : '';

    // Chain order: reframe → progress bar → subtitles → watermark text → format
    let textWatermarkFilter = '';
    const wmType = settings.watermark_type;
    const wmEnabled = settings.watermark_enabled !== 'false' && settings.watermark_enabled !== '0';
    const wmText = (settings.watermark_text || '').replace(/'/g, "\\'").replace(/:/g, "\\:");

    if ((wmType === 'text' || wmType === 'text-moving') && wmText && wmEnabled) {
        const wmFontSize = settings.watermark_font_size || '24';
        const wmColor = (settings.watermark_color || '#ffffff').replace('#', '');
        const wmOpacity = settings.watermark_opacity || '0.5';
        const wmSpeed = parseInt(settings.watermark_speed || '4');

        if (wmType === 'text-moving') {
            const wmMotion = settings.watermark_motion || 'corner-hop';
            let posExpr;

            if (wmMotion === 'corner-hop') {
                // Corner hop: cycle through 4 corners every wmSpeed seconds
                // Same logic as Python: c = int(t/4) % 4
                // c==0: top-right, c==1: bottom-left, c==2: top-left, c==3: bottom-right
                const m = 30; // margin
                posExpr = `x='if(lt(mod(floor(t/${wmSpeed})\\,4)\\,1)\\,w-tw-${m}\\,if(lt(mod(floor(t/${wmSpeed})\\,4)\\,2)\\,${m}\\,if(lt(mod(floor(t/${wmSpeed})\\,4)\\,3)\\,${m}\\,w-tw-${m})))'`
                    + `:y='if(lt(mod(floor(t/${wmSpeed})\\,4)\\,1)\\,${m}\\,if(lt(mod(floor(t/${wmSpeed})\\,4)\\,2)\\,h-th-150\\,if(lt(mod(floor(t/${wmSpeed})\\,4)\\,3)\\,${m}\\,h-th-150)))'`;
                emit(9, `Moving watermark: corner-hop, ${wmSpeed}s cycle`);
            } else if (wmMotion === 'scroll') {
                // Scroll: text moves from left to right continuously
                posExpr = `x='mod(t*w/${wmSpeed}\\,w+tw)-tw':y=h-th-30`;
                emit(9, `Moving watermark: scroll, ${wmSpeed}s cycle`);
            } else if (wmMotion === 'bounce') {
                // Bounce: ping-pong diagonal movement
                posExpr = `x='abs(mod(t*w/${wmSpeed}\\,2*(w-tw))-(w-tw))'`
                    + `:y='abs(mod(t*h/${wmSpeed}\\,2*(h-th))-(h-th))'`;
                emit(9, `Moving watermark: bounce, ${wmSpeed}s speed`);
            }

            textWatermarkFilter = `drawtext=text='${wmText}':fontsize=${wmFontSize}:fontcolor=0x${wmColor}@${wmOpacity}:${posExpr}`;
        } else {
            // Static text watermark
            const wmPos = settings.watermark_position || 'bottom-right';
            const posMap = {
                'top-left': 'x=20:y=20',
                'top-right': 'x=w-tw-20:y=20',
                'bottom-left': 'x=20:y=h-th-20',
                'bottom-right': 'x=w-tw-20:y=h-th-20',
                'center': 'x=(w-tw)/2:y=(h-th)/2'
            };
            const posXY = posMap[wmPos] || posMap['bottom-right'];
            textWatermarkFilter = `drawtext=text='${wmText}':fontsize=${wmFontSize}:fontcolor=0x${wmColor}@${wmOpacity}:${posXY}`;
            emit(9, `Text watermark: "${settings.watermark_text}" (${wmPos})`);
        }
    } else if (settings.watermark_text && !settings.watermark_path) {
        // Free tier fallback watermark
        textWatermarkFilter = `drawtext=text='${settings.watermark_text}':fontsize=24:fontcolor=white@0.5:x=w-tw-20:y=20`;
    }

    // ===== Hook Title =====
    const hookTitleResult = await buildHookTitleFilter(clip, outW, outH, duration, clipTempDir);
    let hookTitleFilter = '';
    let hookOverlay = null;
    if (hookTitleResult) {
        emit(9, `Hook title: "${clip.hook_text}"`);
        if (typeof hookTitleResult === 'object' && hookTitleResult.type === 'overlay') {
            hookOverlay = hookTitleResult;
            emit(9, 'Hook: PNG overlay with emoji support');
        } else if (typeof hookTitleResult === 'string') {
            hookTitleFilter = hookTitleResult;
        }
    }

    // extraFilters    : used when rendering with simple -vf
    // extraFiltersAll : used inside filter_complex (subtitle uses different escaping)
    const extraFilters = [progressBarFilter, subFilter, hookTitleFilter, textWatermarkFilter].filter(Boolean).join(',');

    // Single input-seeking: -ss before -i with accurate_seek (FFmpeg default)
    // This decodes from the nearest keyframe to clip.start_time, ensuring exact positioning.
    // Do NOT use -ss after -i (output-seeking), as it causes subtitle desync when keyframes
    // are far apart (the double -ss offsets don't add up correctly).
    // NOTE: Do NOT add -fflags +genpts or -avoid_negative_ts — these flags interfere with
    // AMD AMF encoder and can cause black video output.
    const args1 = [
        '-y',
        '-ss', String(clip.start_time),
        '-i', project.source_path,
    ];

    // Track input indexes
    let inputIdx = 1;

    // Add watermark input if needed
    if (watermarkFilter && settings.watermark_path && fs.existsSync(settings.watermark_path)) {
        args1.push('-i', settings.watermark_path);
        inputIdx++;
    }

    // Add music input if needed
    const musicInputIdx = inputIdx;
    if (musicTrack) {
        args1.push('-stream_loop', '-1', '-i', musicTrack.file_path);
        inputIdx++;
    }

    // ===== SFX =====
    const { all: dbAll } = require('../database');
    let clipSfxList = [];
    try {
        clipSfxList = dbAll(
            `SELECT cs.*, st.file_path as sfx_path, st.name as sfx_name
             FROM clip_sfx cs JOIN sfx_tracks st ON cs.sfx_track_id = st.id
             WHERE cs.clip_id = ? ORDER BY cs.position`, [clipId]
        ).filter(s => s.sfx_path && fs.existsSync(s.sfx_path));
    } catch (e) { /* table may not exist yet */ }

    // Add SFX inputs
    const sfxInputs = [];
    for (const sfx of clipSfxList) {
        sfxInputs.push({ idx: inputIdx, position: sfx.position || 0, volume: (sfx.volume || 80) / 100 });
        args1.push('-i', sfx.sfx_path);
        inputIdx++;
    }

    if (clipSfxList.length > 0) {
        emit(9, `Adding ${clipSfxList.length} SFX`);
    }

    // Add hook overlay input if PNG was generated
    // IMPORTANT: -loop 1 makes FFmpeg treat the PNG as an infinite-duration stream
    // Without -loop 1, a PNG input is only 1 frame → hook appears for 1 frame then disappears!
    let hookInputIdx = -1;
    if (hookOverlay && fs.existsSync(hookOverlay.imagePath)) {
        hookInputIdx = inputIdx;
        args1.push('-loop', '1', '-framerate', '1', '-i', hookOverlay.imagePath);
        inputIdx++;
    }

    // Build audio filter chain
    let audioArgs;
    const hasSfx = sfxInputs.length > 0;
    if (musicTrack || hasSfx) {
        // Complex audio mixing: speech + music + sfx
        const fadeStart = Math.max(0, duration - 2);
        let parts = [];
        let mixInputs = [];

        // Speech (always input 0)
        parts.push(`[0:a]${audioFilter}[speech]`);
        mixInputs.push('[speech]');

        // Background music
        if (musicTrack) {
            parts.push(`[${musicInputIdx}:a]volume=${musicVolume},afade=t=in:st=0:d=1,afade=t=out:st=${fadeStart}:d=2[bgm]`);
            mixInputs.push('[bgm]');
        }

        // SFX (each with delay positioning)
        sfxInputs.forEach((sfx, i) => {
            const delayMs = Math.round(sfx.position * 1000);
            parts.push(`[${sfx.idx}:a]volume=${sfx.volume},adelay=${delayMs}|${delayMs}[sfx${i}]`);
            mixInputs.push(`[sfx${i}]`);
        });

        // Mix all audio sources
        const totalInputs = mixInputs.length;
        const audioMix = parts.join(';') + ';' +
            mixInputs.join('') + `amix=inputs=${totalInputs}:duration=first:dropout_transition=2[aout]`;

        audioArgs = { complex: audioMix, map: '[aout]' };
    } else {
        audioArgs = { simple: audioFilter };
    }

    // ── Subtitle 2-pass strategy ──────────────────────────────────────────────
    // ASS subtitle filter reliably FAILS inside -filter_complex on Windows
    // because the path "C:\\..." contains ":" which is the filter option separator.
    // Solution: when using filter_complex (isComplexVf OR mustUseComplex with complex filter),
    // do NOT include subtitle in pass 1. Burn subtitle in pass 2 via simple -vf.
    //
    // pass1 = reframing + hook overlay + music + watermark (everything complex)
    // pass2 = subtitle + text overlays (always via -vf, no filter_complex)
    //
    // ── Face Track + Hook overlay ─────────────────────────────────────────────
    // Dynamic crop filter uses 'if(between(t,...))' with single-quotes that
    // conflict with filter_complex escaping on Windows (FFmpeg shell parsing).
    // When face tracking is active (podcastFilter with crop keyframes), we CANNOT
    // safely put hook PNG overlay inside filter_complex.
    // Solution: treat hook as pass-2 via drawtext (hookTitleFilter) for face-track clips.
    const isFaceTrackMode = podcastFilter && !podcastIsSplit; // face tracking, not split screen
    if (isFaceTrackMode && hookOverlay) {
        // Move hook from PNG overlay (pass1 filter_complex) to drawtext pass2
        const hookFallback = await buildHookTitleFilter({ ...clip, _forceFallback: true }, outW, outH, duration, null);
        if (typeof hookFallback === 'string' && hookFallback) {
            hookTitleFilter = hookFallback;
        }
        hookOverlay = null; // disable PNG overlay in pass1
    }

    // IMPORTANT: Re-evaluate needsOverlay AFTER hookOverlay may have been set to null above.
    // (needsOverlay was computed before isFaceTrackMode check which can null hookOverlay)
    const needsOverlay2 = hookOverlay && hookInputIdx >= 0;
    const mustUseComplex = useFilterComplex || needsOverlay2;
    const needsSubtitlePass2 = (isComplexVf || mustUseComplex) && (subFilter || hookTitleFilter || progressBarFilter);


    const extraFiltersPass1 = needsSubtitlePass2
        ? [textWatermarkFilter].filter(Boolean).join(',')   // only non-problematic text in pass1
        : extraFilters;                                      // all filters in single pass
    const extraFiltersPass2 = needsSubtitlePass2
        ? [progressBarFilter, subFilter, hookTitleFilter].filter(Boolean).join(',')
        : '';

    console.log(`[Render] isComplexVf=${isComplexVf} mustUseComplex=${mustUseComplex} needsOverlay2=${needsOverlay2} needsSubP2=${!!needsSubtitlePass2}`);

    if (mustUseComplex && watermarkFilter) {
        // ── Complex filter with watermark IMAGE overlay ──
        // Label sequence: [0:v] → crop/scale → [vid] → watermark overlay → [wm_out] → hook overlay → [outv2]
        let fullFilter;
        if (isComplexVf) {
            // Helper: extract the last output label from a complex vf string
            // e.g. '...overlay=0:0[ftblur_out]' → '[ftblur_out]'
            // e.g. '...vstack=inputs=2' → null (unlabelled, needs tagging)
            const lastLabelMatch = vf.match(/\[([a-z0-9_]+)\]\s*$/i);
            if (lastLabelMatch) {
                // vf already has explicit output label — route it directly to [vid]
                const outLabel = `[${lastLabelMatch[1]}]`;
                fullFilter = vf + (extraFiltersPass1
                    ? `;${outLabel}${extraFiltersPass1}[vid]`
                    : `;${outLabel}null[vid]`);
            } else {
                // vstack or unlabelled: tag vstack output dynamically
                const vstackTagged = vf.replace(/(vstack=inputs=\d+)$/, '$1[vsout]');
                if (vstackTagged !== vf) {
                    fullFilter = vstackTagged + (extraFiltersPass1
                        ? `;[vsout]${extraFiltersPass1}[vid]`
                        : `;[vsout]null[vid]`);
                } else {
                    // Last resort fallback (should not happen with labeled filters)
                    fullFilter = vf + (extraFiltersPass1 ? `,${extraFiltersPass1}` : '') + '[vid]';
                }
            }
        } else {
            fullFilter = `[0:v]${vf}` + (extraFiltersPass1 ? `,${extraFiltersPass1}` : '') + '[vid]';
        }
        // Watermark filter expects [vid] input and produces [outv]
        fullFilter += `;${watermarkFilter}`; // watermarkFilter must produce [outv]
        if (needsOverlay2) {
            // Hook PNG overlay: [outv] + [hookIdx:v] → [outv2]
            const hookEnable = hookOverlay.enableExpr ? `:${hookOverlay.enableExpr}` : '';
            fullFilter += `;[outv][${hookInputIdx}:v]overlay=x=${hookOverlay.overlayX}:y=${hookOverlay.overlayY}${hookEnable},format=yuv420p[outv2]`;
        } else {
            fullFilter += `;[outv]format=yuv420p[outv2]`;
        }
        if (audioArgs.complex) fullFilter += `;${audioArgs.complex}`;
        args1.push('-filter_complex', fullFilter);
        args1.push('-map', '[outv2]');
        if (audioArgs.map) args1.push('-map', audioArgs.map);
        else { args1.push('-map', '0:a?'); args1.push('-af', audioFilter); }

    } else if (mustUseComplex) {
        // ── Complex filter (reframing + hook overlay + music, no watermark image) ──
        // Label: [0:v] → crop/scale/etc → [outv] → (hook overlay) → [outv2]
        let fullFilter;
        if (isComplexVf) {
            // Helper: extract the last output label from a complex vf string automatically.
            // This avoids hard-coding per-mode labels — any new mode only needs a labeled output.
            const lastLabelMatch = vf.match(/\[([a-z0-9_]+)\]\s*$/i);
            if (lastLabelMatch) {
                // vf already has explicit output label — route it to [outv]
                const outLabel = `[${lastLabelMatch[1]}]`;
                fullFilter = vf + (extraFiltersPass1
                    ? `;${outLabel}${extraFiltersPass1}[outv]`
                    : `;${outLabel}null[outv]`);
            } else {
                // vstack or unlabelled: tag vstack output dynamically
                const vstackTagged = vf.replace(/(vstack=inputs=\d+)$/, '$1[vsout]');
                if (vstackTagged !== vf) {
                    fullFilter = vstackTagged + (extraFiltersPass1
                        ? `;[vsout]${extraFiltersPass1}[outv]`
                        : `;[vsout]null[outv]`);
                } else {
                    // Last resort fallback (should not happen with labeled filters)
                    fullFilter = vf + (extraFiltersPass1 ? `,${extraFiltersPass1}` : '') + '[outv]';
                }
            }
        } else {
            fullFilter = `[0:v]${vf}` + (extraFiltersPass1 ? `,${extraFiltersPass1}` : '') + '[outv]';
        }
        if (needsOverlay2) {
            // Hook PNG overlay on top of video
            const hookEnable = hookOverlay.enableExpr ? `:${hookOverlay.enableExpr}` : '';
            fullFilter += `;[outv][${hookInputIdx}:v]overlay=x=${hookOverlay.overlayX}:y=${hookOverlay.overlayY}${hookEnable},format=yuv420p[outv2]`;
        } else {
            fullFilter += `;[outv]format=yuv420p[outv2]`;
        }
        if (audioArgs.complex) fullFilter += `;${audioArgs.complex}`;
        args1.push('-filter_complex', fullFilter);
        args1.push('-map', '[outv2]');
        if (audioArgs.map) args1.push('-map', audioArgs.map);
        else { args1.push('-map', '0:a?'); args1.push('-af', audioFilter); }

    } else {
        // ── Simple filter (center/face_track — no filter_complex needed) ──
        const fullFilter = vf + (extraFilters ? `,${extraFilters}` : '') + ',format=yuv420p';
        args1.push('-vf', fullFilter);
        args1.push('-af', audioFilter);
    }

    args1.push(
        '-c:v', encoder, ...encoderArgs, '-crf', crf,
        '-c:a', 'aac', '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart'
    );

    // Calculate target bitrate based on output resolution
    const pixels = outW * outH;
    let baseBitrate, baseMax;
    if (pixels >= 1920 * 1080) {
        // 1080p+ (1080x1920): 10-15 Mbps
        baseBitrate = { best: '12M', balanced: '8M', fast: '5M' };
        baseMax = { best: '18M', balanced: '12M', fast: '8M' };
    } else if (pixels >= 1280 * 720) {
        // 720p (720x1280): 5-8 Mbps
        baseBitrate = { best: '8M', balanced: '5M', fast: '3M' };
        baseMax = { best: '12M', balanced: '8M', fast: '5M' };
    } else {
        // 480p or lower: 2-4 Mbps
        baseBitrate = { best: '4M', balanced: '3M', fast: '2M' };
        baseMax = { best: '6M', balanced: '5M', fast: '3M' };
    }
    const gpuBitrate = baseBitrate[qualityPreset] || baseBitrate.balanced;
    const gpuMaxrate = baseMax[qualityPreset] || baseMax.balanced;
    console.log(`[Render] Bitrate: ${gpuBitrate} max=${gpuMaxrate}`);

    // For GPU encoders, replace -crf with appropriate quality param
    if (encoder !== 'libx264') {
        const crfIdx = args1.indexOf('-crf');
        if (crfIdx > -1) {
            // Check if encoderArgs already has quality params to avoid duplicates
            const hasQuality = encoderArgs.some(a => ['-quality', '-cq', '-global_quality', '-preset'].includes(a));
            if (hasQuality) {
                // Remove -crf and its value entirely (already set by encoderArgs)
                args1.splice(crfIdx, 2);
                // Still need bitrate cap for GPU encoders (they don't auto-limit like CRF)
                if (!args1.includes('-b:v') && !args1.includes('-maxrate')) {
                    args1.push('-b:v', gpuBitrate, '-maxrate', gpuMaxrate, '-bufsize', '16M');
                }
            } else if (encoder.includes('nvenc')) {
                args1[crfIdx] = '-cq';
                // NVENC: add bitrate cap to prevent excessive bitrate on 720p
                args1.push('-maxrate', gpuMaxrate, '-bufsize', '16M');
            } else if (encoder.includes('amf')) {
                // AMF doesn't support CRF - use quality + bitrate cap
                args1[crfIdx] = '-quality';
                args1[crfIdx + 1] = qualityPreset === 'best' ? 'quality' : qualityPreset === 'fast' ? 'speed' : 'balanced';
                // Add bitrate control (AMF without -b:v produces ~19 Mbps, way too high for 720p)
                args1.push('-b:v', gpuBitrate, '-maxrate', gpuMaxrate, '-bufsize', '16M');
            } else if (encoder.includes('qsv')) {
                args1[crfIdx] = '-global_quality';
                // QSV: add bitrate cap to prevent excessive bitrate on 720p
                args1.push('-maxrate', gpuMaxrate, '-bufsize', '16M');
            }
        }
    }

    // Enforce duration limit: add -t before output path
    // Note: -t here as OUTPUT duration is more reliable than input -t with filter_complex
    args1.push('-t', String(duration), outputPath);

    const result1 = await runFFmpeg(args1, duration, emit, io, project.id);



    // Always log FFmpeg stderr for debugging (last 800 chars)
    if (result1.stderr) {
        const stderrSnip = result1.stderr.slice(-800);
        console.log(`[Render] Pass1 FFmpeg stderr (last 800):\n${stderrSnip}`);
    }

    if (result1.success && validateOutput(outputPath)) {
        // ===== PASS 2: Subtitle + text overlays burn-in (if deferred from pass 1) =====
        if (needsSubtitlePass2 && extraFiltersPass2) {
            emit(96, 'Burning subtitles...');
            console.log(`[Render] Pass 2: burning subtitles — filters: ${extraFiltersPass2.substring(0, 150)}`);

            // Rename pass1 output to temp path — keep it for fallback if pass 2 fails
            const pass1TempPath = outputPath.replace('.mp4', '_pass1.mp4');
            let renamedOk = false;
            try {
                fs.renameSync(outputPath, pass1TempPath);
                renamedOk = true;
            } catch (e) {
                console.warn('[Render] Pass 2: could not rename pass1 output, skipping subtitle burn:', e.message);
            }

            if (renamedOk && fs.existsSync(pass1TempPath)) {
                const pass2Filter = extraFiltersPass2 + ',format=yuv420p';
                const args2pass = [
                    '-y',
                    '-i', pass1TempPath,
                    '-vf', pass2Filter,
                    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                    '-c:a', 'copy',    // audio already processed in pass 1 — just copy
                    '-movflags', '+faststart',
                    outputPath
                ];
                const result2pass = await runFFmpeg(args2pass, duration, emit, io, project.id);

                if (!result2pass.success || !validateOutput(outputPath)) {
                    // Pass 2 failed — fallback to pass 1 output (no subtitles, but has hook)
                    console.warn('[Render] Pass 2 subtitle burn failed, falling back to pass 1 (no subtitles)');
                    try { fs.renameSync(pass1TempPath, outputPath); } catch (e) {
                        console.error('[Render] Pass 2: could not restore pass1 output:', e.message);
                    }
                } else {
                    // Pass 2 success — cleanup temp
                    console.log('[Render] Pass 2 subtitle burn: OK');
                    try { fs.unlinkSync(pass1TempPath); } catch (e) { }
                }
            }
        }

        if (!fs.existsSync(outputPath)) {
            console.error('[Render] Output missing after pass 2 — render failed');
        } else {
            const stats = fs.statSync(outputPath);
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
            run("UPDATE clips SET status = 'rendered', output_path = ? WHERE id = ?", [outputPath, clipId]);
            incrementDailyExport();
            emit(100, `Done! ${sizeMB} MB`);
            console.log(`[Render] Clip #${clip.clip_number} exported: ${outputPath} (${sizeMB} MB)`);
            try { fs.removeSync(clipTempDir); } catch (e) { }
            return { outputPath, size: stats.size };
        }
    }

    // ===== ATTEMPT 2: Simple fallback (scale+crop only) =====
    console.warn(`[Render] Attempt 1 failed for clip #${clip.clip_number}, trying simple fallback...`);
    console.warn(`[Render] Error: ${result1.errorMsg || 'Output file invalid'}`);
    if (result1.stderr) console.warn(`[Render] FFmpeg stderr (last 500 chars): ${result1.stderr.slice(-500)}`);
    emit(15, 'Retrying with simpler encoding...');

    // Cleanup broken file
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) { }

    // Include subtitle filter in fallback if available
    const fallbackSubFilter = assPath ? buildSubtitleFilter(assPath) : '';
    const simpleFallbackFilter = `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}${fallbackSubFilter ? ',' + fallbackSubFilter : ''},format=yuv420p`;

    // Use appropriate quality args for the encoder
    // GPU encoders need explicit bitrate caps — without them q=-0.0 = unlimited bitrate (~19 Mbps at 720p!)
    const fallbackEncoderArgs = encoder.includes('amf')
        ? ['-quality', 'balanced']
        : encoder.includes('nvenc')
            ? ['-preset', 'p4', '-cq', '23']
            : encoder.includes('qsv')
                ? ['-preset', 'medium', '-global_quality', '23']
                : ['-preset', 'medium', '-crf', '23'];

    // Bitrate cap for GPU encoders in fallback (prevents huge files)
    const fallbackBitrateCap = [];
    if (encoder.includes('nvenc') || encoder.includes('amf') || encoder.includes('qsv')) {
        const fbBitrate = gpuBitrate || (outW * outH >= 1280 * 720 ? '5M' : '3M');
        const fbMaxrate = gpuMaxrate || (outW * outH >= 1280 * 720 ? '8M' : '5M');
        fallbackBitrateCap.push('-b:v', fbBitrate, '-maxrate', fbMaxrate, '-bufsize', '12M');
        console.log(`[Render] Fallback GPU bitrate cap: b:v=${fbBitrate} maxrate=${fbMaxrate}`);
    }

    const args2 = [
        '-y',
        '-ss', String(Math.max(0, clip.start_time - 2)),
        '-i', project.source_path,
        '-ss', String(Math.min(2, clip.start_time)),
        '-t', String(duration),
        '-vf', simpleFallbackFilter,
        '-c:v', encoder, ...fallbackEncoderArgs, ...fallbackBitrateCap,
        '-c:a', 'aac', '-b:a', '128k',
        '-shortest',
        '-movflags', '+faststart',
        outputPath
    ];

    const result2 = await runFFmpeg(args2, duration, emit, io, project.id);

    if (result2.success && validateOutput(outputPath)) {
        const stats = fs.statSync(outputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        run("UPDATE clips SET status = 'rendered', output_path = ? WHERE id = ?", [outputPath, clipId]);
        incrementDailyExport(); // Track daily export count
        emit(100, `Done! ${sizeMB} MB (fallback mode)`);
        console.log(`[Render] Clip #${clip.clip_number} exported (fallback): ${outputPath} (${sizeMB} MB)`);
        try { fs.removeSync(clipTempDir); } catch (e) { }
        return { outputPath, size: stats.size };
    }

    // ===== ATTEMPT 3: Ultra-safe stream copy with trim =====
    console.warn(`[Render] Attempt 2 also failed, trying stream copy...`);
    emit(20, 'Retrying with stream copy...');

    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) { }

    const args3 = [
        '-y',
        '-ss', String(Math.max(0, clip.start_time - 2)),
        '-i', project.source_path,
        '-ss', String(Math.min(2, clip.start_time)),
        '-t', String(duration),
        '-c', 'copy',
        '-movflags', '+faststart',
        outputPath
    ];

    const result3 = await runFFmpeg(args3, duration, emit, io, project.id);

    if (result3.success && validateOutput(outputPath)) {
        const stats = fs.statSync(outputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        run("UPDATE clips SET status = 'rendered', output_path = ? WHERE id = ?", [outputPath, clipId]);
        incrementDailyExport(); // Track daily export count
        emit(100, `Done! ${sizeMB} MB (stream copy)`);
        console.log(`[Render] Clip #${clip.clip_number} exported (stream copy): ${outputPath} (${sizeMB} MB)`);
        try { fs.removeSync(clipTempDir); } catch (e) { }
        return { outputPath, size: stats.size };
    }

    // All attempts failed — cleanup any leftover empty/broken files
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) { }
    try { fs.removeSync(clipTempDir); } catch (e) { }

    const finalError = result3.errorMsg || result2.errorMsg || result1.errorMsg || 'All render attempts failed';
    console.error(`[Render] All 3 attempts failed for clip #${clip.clip_number}:`);
    console.error(`[Render]   Attempt 1: ${result1.errorMsg || 'invalid output'}`);
    console.error(`[Render]   Attempt 2: ${result2.errorMsg || 'invalid output'}`);
    console.error(`[Render]   Attempt 3: ${result3.errorMsg || 'invalid output'}`);
    // Dump FFmpeg stderrs to a log file for easier debugging
    try {
        const logPath = require('path').join(require('os').tmpdir(), `clip_fail_${clip.clip_number}_${Date.now()}.log`);
        const logContent = [
            `=== CLIP #${clip.clip_number} "${clip.title}" RENDER FAILURE ===`,
            `Start: ${clip.start_time}s, End: ${clip.end_time}s, Duration: ${clip.end_time - clip.start_time}s`,
            `\n--- ATTEMPT 1 STDERR ---\n${result1.stderr || 'N/A'}`,
            `\n--- ATTEMPT 2 STDERR ---\n${result2.stderr || 'N/A'}`,
            `\n--- ATTEMPT 3 STDERR ---\n${result3.stderr || 'N/A'}`,
        ].join('\n');
        require('fs').writeFileSync(logPath, logContent, 'utf-8');
        console.error(`[Render] Full stderr log saved to: ${logPath}`);
    } catch (e) { /* ignore log write errors */ }


    run("UPDATE clips SET status = 'failed' WHERE id = ?", [clipId]);
    emit(0, `Render failed: ${finalError}`);
    throw new Error(finalError);
}

/**
 * Build Hook Title overlay.
 * Uses PowerShell/WPF to generate PNG image with emoji support,
 * then overlays it on the video via FFmpeg.
 * Falls back to drawtext if PowerShell fails.
 */
async function buildHookTitleFilter(clip, outW, outH, duration, clipDir) {
    const hookText = clip.hook_text;
    if (!hookText || !hookText.trim()) return '';
    if (!clip.hook_settings) return '';

    let settings = {};
    try {
        settings = typeof clip.hook_settings === 'string' ? JSON.parse(clip.hook_settings) : (clip.hook_settings || {});
    } catch (e) { return ''; }
    // Hook is valid if there's text — settings may have defaults, don't block on missing fields
    // Only skip if settings is completely empty (no recognizable fields at all)
    // Only skip if ALL known fields are missing (truly empty settings object)
    const hasAnyHookSetting = settings.position || settings.textColor || settings.bgColor ||
        settings.hookStyle || settings.fontSize || settings.duration !== undefined ||
        settings.style;
    if (!hasAnyHookSetting) return '';

    const hookDuration = settings.duration != null ? settings.duration : 5;
    const position = settings.position || 'top';
    const fontSize = settings.fontSize || Math.round(outW / 11);
    const hookStyle = settings.hookStyle || 'podcast';

    const HOOK_STYLES = {
        podcast: { textColor: '000000', bgColor: 'FFFFFF', borderColor: 'FF0000', borderW: 6 },
        kdm: { textColor: '000000', bgColor: 'FFD700', borderColor: 'CC0000', borderW: 5 },
        neon: { textColor: '000000', bgColor: '00E5FF', borderColor: 'FFFFFF', borderW: 5 },
        drama: { textColor: 'FFFFFF', bgColor: 'CC0000', borderColor: '000000', borderW: 5 },
        dark: { textColor: 'FFFFFF', bgColor: '1A1A2E', borderColor: '8B5CF6', borderW: 5 },
        custom: { textColor: 'FFFFFF', bgColor: 'FF0000', borderColor: '000000', borderW: 5 },
    };

    const sp = HOOK_STYLES[hookStyle] || HOOK_STYLES.podcast;
    const textColor = hookStyle === 'custom' ? (settings.textColor || sp.textColor).replace('#', '') : sp.textColor;
    const bgColor = hookStyle === 'custom' ? (settings.bgColor || sp.bgColor).replace('#', '') : sp.bgColor;
    const borderColor = hookStyle === 'custom' ? (settings.borderColor || sp.borderColor).replace('#', '') : sp.borderColor;
    const borderThk = sp.borderW;

    // UPPERCASE, strip FFmpeg-breaking chars but keep emoji
    const cleanText = hookText
        .replace(/[':%;]/g, ' ').replace(/"/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    if (!cleanText) return '';

    const marginY = Math.round(outH * 0.08);
    const enableExpr = hookDuration > 0 ? `enable='between(t,0,${hookDuration})'` : '';

    // =====================================================
    //  Try PNG overlay approach (supports emoji via WPF!)
    // =====================================================
    if (clipDir && !clip._forceFallback) {

        try {
            const hookImgPath = path.join(clipDir, 'hook_overlay.png');
            const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'hook_gen_gdi.ps1');
            const padX = Math.round(fontSize * 0.5);
            const padY = Math.round(fontSize * 0.35);
            const maxW = outW - Math.round(outW * 0.14);
            const psFontSize = Math.round(fontSize * 0.75);

            // Write text to temp file (preserves emoji/Unicode through pipeline)
            const { exec } = require('child_process');
            const textFilePath = path.join(clipDir, '_hook_text.txt');
            fs.writeFileSync(textFilePath, cleanText, 'utf-8');

            const args = [
                `"${textFilePath}"`,
                psFontSize, padX, padY, borderThk,
                bgColor, textColor, borderColor,
                maxW, `"${hookImgPath}"`
            ].join(' ');

            // Use async exec to avoid blocking Node.js event loop
            // GDI+ version: no -Sta needed, much faster than WPF
            const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" ${args}`;
            const result = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('Hook PNG timeout')), 15000);
                exec(psCmd, { timeout: 16000, encoding: 'utf-8' }, (err, stdout) => {
                    clearTimeout(timer);
                    if (err) reject(err);
                    else resolve((stdout || '').trim());
                });
            });

            // Cleanup text file
            try { fs.unlinkSync(textFilePath); } catch (e) { }

            if (fs.existsSync(hookImgPath)) {
                const dims = result.split(',').map(Number);
                const imgW = dims[0] || 400;
                const imgH = dims[1] || 100;
                const overlayX = Math.round((outW - imgW) / 2);
                const overlayY = position === 'bottom' ? (outH - imgH - marginY) : marginY;

                console.log('[HookTitle] PNG generated:', imgW + 'x' + imgH, '| Style:', hookStyle, '| emoji: YES');

                return {
                    type: 'overlay',
                    imagePath: hookImgPath,
                    overlayX,
                    overlayY,
                    enableExpr,
                    hookDuration
                };
            }
        } catch (err) {
            console.warn('[HookTitle] PNG failed:', err.message.substring(0, 150), '— using drawtext fallback');
        }
    }

    // =====================================================
    //  FALLBACK: drawtext (no emoji support)
    // =====================================================
    console.log('[HookTitle] Using drawtext fallback (no emoji)');

    // Strip emoji for drawtext
    const noEmojiText = cleanText
        .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}\u{2B50}\u{2764}\u{203C}\u{2049}]/gu, '')
        .replace(/\s+/g, ' ').trim();
    if (!noEmojiText) return '';

    const dtEnableExpr = hookDuration > 0 ? `:enable='between(t,0,${hookDuration})'` : '';

    // Font resolution
    const os = require('os');
    const bundledFontsDir = path.join(__dirname, '..', '..', 'fonts');
    const systemFontsDir = 'C:\\Windows\\Fonts';
    const fontCandidates = [
        path.join(bundledFontsDir, 'Montserrat-ExtraBold.ttf'),
        path.join(bundledFontsDir, 'Montserrat-Bold.ttf'),
        path.join(bundledFontsDir, 'Montserrat.ttf'),
        path.join(systemFontsDir, 'arialbd.ttf'),
    ];
    let fontPath = fontCandidates.find(f => fs.existsSync(f)) || path.join(systemFontsDir, 'arial.ttf');
    const escapedFontPath = fontPath.split(path.sep).join('/').replace(/:/g, '\\:');

    const padX = Math.round(fontSize * 0.45);
    const padY = Math.round(fontSize * 0.30);
    const avgCharWidth = fontSize * 0.62;
    const maxCharsPerLine = Math.max(6, Math.floor((outW - outW * 0.1 - padX * 2) / avgCharWidth));

    const words = noEmojiText.split(/\s+/);
    const wLines = [];
    let currentLine = '';
    for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        if (testLine.length > maxCharsPerLine && currentLine) { wLines.push(currentLine); currentLine = word; }
        else { currentLine = testLine; }
    }
    if (currentLine) wLines.push(currentLine);
    while (wLines.length > 4) { const o = wLines.pop(); wLines[wLines.length - 1] += ' ' + o; }

    const lineHeight = Math.round(fontSize * 1.20);
    const totalTextH = wLines.length * lineHeight;
    const longestLine = wLines.reduce((a, b) => a.length > b.length ? a : b, '');
    const boxW = Math.min(outW - Math.round(outW * 0.1), Math.round(longestLine.length * avgCharWidth) + padX * 2);
    const boxH = totalTextH + padY * 2;
    const boxX = Math.round((outW - boxW) / 2);
    const bw = Math.max(4, borderThk);

    let boxY = position === 'bottom' ? outH - boxH - marginY * 2 : marginY;

    const filters = [];
    filters.push('drawbox=x=' + (boxX - bw) + ':y=' + (boxY - bw) + ':w=' + (boxW + bw * 2) + ':h=' + (boxH + bw * 2) +
        ':color=0x' + borderColor + '@1.0:t=fill' + dtEnableExpr);
    filters.push('drawbox=x=' + boxX + ':y=' + boxY + ':w=' + boxW + ':h=' + boxH +
        ':color=0x' + bgColor + '@1.0:t=fill' + dtEnableExpr);
    for (let i = 0; i < wLines.length; i++) {
        filters.push("drawtext=text='" + wLines[i] + "':fontfile='" + escapedFontPath + "':fontsize=" + fontSize +
            ':fontcolor=0x' + textColor + ':x=(w-tw)/2:y=' + (boxY + padY + i * lineHeight) + dtEnableExpr);
    }
    return filters.join(',');
}


/**
 * Build video filter chain based on the selected reframing mode.
 */
function buildVideoFilter(mode, outW, outH, sourceW = 0) {
    // Lanczos = highest quality scaler (barely slower than bilinear)
    const scaleFlags = ':flags=lanczos';
    // Only sharpen when upscaling (source smaller than output) — saves render time on HD sources
    const needsSharpen = sourceW > 0 && sourceW < outW;
    const sharpen = needsSharpen ? ',unsharp=5:5:0.5:5:5:0.0' : '';

    switch (mode) {
        case 'center':
            return `scale=${outW}:${outH}:force_original_aspect_ratio=increase${scaleFlags},crop=${outW}:${outH}${sharpen}`;

        case 'fit':
            // Fit with blur background — popular TikTok/Reels style
            // [fit_out] label allows filter_complex builder to route output correctly
            return [
                `[0:v]split[a][b]`,
                `[a]scale=${outW}:${outH}:force_original_aspect_ratio=increase${scaleFlags},crop=${outW}:${outH},boxblur=20:5[bg]`,
                `[b]scale=${outW}:${outH}:force_original_aspect_ratio=decrease${scaleFlags}${sharpen}[fg]`,
                `[bg][fg]overlay=(W-w)/2:(H-h)/2[fit_out]`
            ].join(';');

        case 'face_track':
            return `scale=${outW}:${outH}:force_original_aspect_ratio=increase${scaleFlags},crop=${outW}:${outH}${sharpen}`;

        case 'split': {
            const halfH = Math.floor(outH / 2);
            // [split_out] label allows filter_complex builder to route output correctly
            return [
                `[0:v]split[a][b]`,
                `[a]scale=${outW}:${halfH}:force_original_aspect_ratio=decrease${scaleFlags}${sharpen},pad=${outW}:${halfH}:(ow-iw)/2:(oh-ih)/2[top]`,
                `[b]scale=${outW * 2}:-2${scaleFlags},crop=${outW}:${halfH}${sharpen}[bottom]`,
                `[top][bottom]vstack[split_out]`
            ].join(';');
        }

        default:
            return `scale=${outW}:${outH}:force_original_aspect_ratio=increase${scaleFlags},crop=${outW}:${outH}${sharpen}`;
    }
}


/**
 * Get output dimensions based on aspect ratio and resolution setting
 * @param {string} aspectRatio - e.g. '9:16', '16:9', '1:1', '4:5'
 * @param {string} resolution - e.g. '1080p', '720p', '480p'
 */
function getOutputDimensions(aspectRatio, resolution = '1080p') {
    // Base dimensions at 1080p
    const baseDims = {
        '9:16': { outW: 1080, outH: 1920 },
        '1:1': { outW: 1080, outH: 1080 },
        '4:5': { outW: 1080, outH: 1350 },
        '16:9': { outW: 1920, outH: 1080 },
    };

    const base = baseDims[aspectRatio] || baseDims['9:16'];

    // Scale factor based on resolution
    let scale = 1;
    if (resolution === '720p') scale = 720 / 1080;
    else if (resolution === '480p') scale = 480 / 1080;

    let outW = Math.round(base.outW * scale);
    let outH = Math.round(base.outH * scale);

    // Ensure even dimensions (required by most codecs)
    outW = outW % 2 === 0 ? outW : outW + 1;
    outH = outH % 2 === 0 ? outH : outH + 1;

    return { outW, outH };
}

// ===== HARDWARE ACCELERATION =====

/**
 * Detect and return the best available encoder
 */
async function getEncoder(settings) {

    const hwAccel = settings.hw_accel || 'auto';
    const encoderSetting = settings.encoder || 'auto';

    // CPU fallback
    const cpuEncoder = {
        encoder: 'libx264',
        encoderArgs: ['-preset', settings.quality_preset === 'best' ? 'slow' : settings.quality_preset === 'fast' ? 'ultrafast' : 'medium']
    };

    // User explicitly chose CPU
    if (encoderSetting === 'libx264' || hwAccel === 'none') {
        return cpuEncoder;
    }

    // Specific encoder requested (not auto)
    if (encoderSetting && encoderSetting !== 'auto' && encoderSetting !== 'libx264') {
        console.log(`[Render] Using GPU encoder: ${encoderSetting}`);
        if (encoderSetting.includes('nvenc')) {
            return { encoder: encoderSetting, encoderArgs: ['-preset', 'p4', '-tune', 'hq'] };
        }
        if (encoderSetting.includes('amf')) {
            // -bf 0: disable B-frames (reduces pipeline delay, prevents black frames at start)
            // -refs 1: minimal reference frames (faster init)
            return { encoder: encoderSetting, encoderArgs: ['-quality', 'balanced', '-bf', '0', '-refs', '1'] };
        }
        if (encoderSetting.includes('qsv')) {
            return { encoder: encoderSetting, encoderArgs: ['-preset', 'medium'] };
        }
        return { encoder: encoderSetting, encoderArgs: [] };
    }

    // Auto-detect: use hwAccel setting to pick encoder
    if (hwAccel === 'nvidia' || hwAccel === 'nvenc') {
        console.log('[Render] Using NVIDIA NVENC (from hw_accel setting)');
        return { encoder: 'h264_nvenc', encoderArgs: ['-preset', 'p4', '-tune', 'hq'] };
    }
    if (hwAccel === 'amd' || hwAccel === 'amf') {
        console.log('[Render] Using AMD AMF (from hw_accel setting)');
        // -bf 0: disable B-frames to prevent black frames at encoder startup
        return { encoder: 'h264_amf', encoderArgs: ['-quality', 'balanced', '-bf', '0', '-refs', '1'] };
    }
    if (hwAccel === 'intel' || hwAccel === 'qsv') {
        console.log('[Render] Using Intel QSV (from hw_accel setting)');
        return { encoder: 'h264_qsv', encoderArgs: ['-preset', 'medium'] };
    }

    // 'auto' — use cached async GPU detection (only runs once per process)
    if (!detectGpuEncoder._cache) {
        detectGpuEncoder._cache = await _detectGpuEncoderAsync();
    }
    return detectGpuEncoder._cache || cpuEncoder;
}

// Async GPU detection helper (result cached in detectGpuEncoder._cache)
async function _detectGpuEncoderAsync() {
    const cpuEncoder = { encoder: 'libx264', encoderArgs: ['-preset', 'fast', '-tune', 'film'] };
    const { exec: execCb } = require('child_process');

    // Helper: test if an encoder actually works by doing a quick 1-frame encode
    // Success = output contains "frame=" indicating encoding completed
    function testEncoder(enc) {
        return new Promise((resolve) => {
            const t = setTimeout(() => resolve(false), 8000);
            execCb(
                `ffmpeg -f lavfi -i color=c=black:size=64x64:r=1 -frames:v 1 -c:v ${enc} -f null - 2>&1`,
                { timeout: 9000 },
                (err, out) => {
                    clearTimeout(t);
                    // Success = "frame=    1" appears in output AND no fatal encoder error
                    const hasFrame = out && /frame=\s*1/.test(out);
                    const hasFatal = out && (out.includes('Failed to create') || out.includes('AMFQueryVersion failed') || out.includes('Could not open encoder'));
                    resolve(hasFrame && !hasFatal);
                }
            );
        });
    }

    try {
        const gpuOut = await new Promise((res) => {
            const t = setTimeout(() => res(''), 3000);
            execCb('wmic path win32_VideoController get name /value', { timeout: 4000 }, (e, o) => { clearTimeout(t); res(o || ''); });
        });

        let gpuName = '';
        const m = gpuOut.match(/Name=(.+)/);
        if (m) gpuName = m[1].trim().toLowerCase();
        console.log(`[Render] GPU detected: ${gpuName || 'unknown'}`);

        // Try GPU H.264 encoders in order — always H.264, never AV1/HEVC
        const candidates = [];
        if (gpuName.includes('nvidia') || gpuName.includes('geforce') || gpuName.includes('rtx') || gpuName.includes('gtx')) {
            candidates.push({ encoder: 'h264_nvenc', encoderArgs: ['-preset', 'p4', '-tune', 'hq'] });
        }
        if (gpuName.includes('amd') || gpuName.includes('radeon')) {
            // -bf 0: disable B-frames to prevent black frames at encoder startup
            candidates.push({ encoder: 'h264_amf', encoderArgs: ['-quality', 'balanced', '-bf', '0', '-refs', '1'] });
        }
        if (gpuName.includes('intel') || gpuName.includes('uhd') || gpuName.includes('iris') || gpuName.includes('arc')) {
            candidates.push({ encoder: 'h264_qsv', encoderArgs: ['-preset', 'medium'] });
        }
        // CPU libx264 as final fallback — reliable with all filter modes including podcast filter_complex
        candidates.push(cpuEncoder);

        for (const candidate of candidates) {
            const works = await testEncoder(candidate.encoder);
            if (works) {
                console.log(`[Render] GPU auto-detect: ${candidate.encoder} ✅ works`);
                return candidate;
            } else {
                console.log(`[Render] GPU auto-detect: ${candidate.encoder} ❌ failed, trying next...`);
            }
        }
    } catch (e) {
        console.warn('[Render] GPU auto-detect failed:', e.message);
    }
    console.log('[Render] Falling back to CPU encoder (libx264)');
    return cpuEncoder;
}


// ===== RETENTION PROGRESS BAR =====

/**
 * Build FFmpeg filter for animated progress bar at bottom of video.
 * Color transitions: start(blue/green) ΓåÆ mid(yellow) ΓåÆ end(red)
 * 
 * @param {object} settings - App settings
 * @param {number} outW - Output width
 * @param {number} outH - Output height
 * @param {number} duration - Clip duration in seconds
 * @returns {string|null} FFmpeg drawbox filter string, or null if disabled
 */
function buildProgressBarFilter(settings, outW, outH, duration) {
    if (settings.progress_bar_enabled === 'false' || settings.progress_bar_enabled === '0') return null;
    if (!settings.progress_bar_enabled || settings.progress_bar_enabled === 'false') return null;
    if (duration <= 0) return null;

    const barHeight = parseInt(settings.progress_bar_height || '6');
    const barOpacity = parseFloat(settings.progress_bar_opacity || '0.85');
    const barPosition = settings.progress_bar_position || 'bottom'; // 'top' or 'bottom'

    // Colors (hex to RGB)
    const startColor = hexToRGB(settings.progress_bar_color_start || '#3b82f6'); // blue
    const midColor = hexToRGB(settings.progress_bar_color_mid || '#eab308');     // yellow
    const endColor = hexToRGB(settings.progress_bar_color_end || '#ef4444');     // red

    // Y position
    const yPos = barPosition === 'top' ? 0 : (outH - barHeight);

    // Progress width expression: (t / duration) * outW
    const progressW = `(t/${duration})*${outW}`;

    // Color interpolation using FFmpeg expressions
    // Phase 1 (0%-50%): startColor ΓåÆ midColor
    // Phase 2 (50%-100%): midColor ΓåÆ endColor
    const progress = `t/${duration}`; // 0.0 to 1.0

    // Red channel interpolation
    const r = buildColorChannelExpr(progress, startColor.r, midColor.r, endColor.r);
    // Green channel
    const g = buildColorChannelExpr(progress, startColor.g, midColor.g, endColor.g);
    // Blue channel
    const b = buildColorChannelExpr(progress, startColor.b, midColor.b, endColor.b);

    // FFmpeg drawbox with dynamic width and color
    // drawbox=x=0:y=Y:w=EXPR:h=H:color=EXPR:t=fill
    // Since drawbox doesn't support expression-based color easily,
    // we use multiple drawbox filters with conditional enable

    // Multi-segment approach for color gradient:
    // Split bar into N segments, each a different color from startΓåÆmidΓåÆend
    const SEGMENTS = 10;
    const filters = [];

    // Background track (dark bar showing total length)
    filters.push(`drawbox=x=0:y=${yPos}:w=${outW}:h=${barHeight}:color=black@0.3:t=fill`);

    for (let i = 0; i < SEGMENTS; i++) {
        const segStart = i / SEGMENTS;        // 0.0 to 0.9
        const segEnd = (i + 1) / SEGMENTS;    // 0.1 to 1.0
        const segMid = (segStart + segEnd) / 2;

        // Interpolate color at this segment's midpoint
        let r, g, b;
        if (segMid <= 0.5) {
            const t = segMid * 2; // 0 to 1 within first half
            r = Math.round(startColor.r + (midColor.r - startColor.r) * t);
            g = Math.round(startColor.g + (midColor.g - startColor.g) * t);
            b = Math.round(startColor.b + (midColor.b - startColor.b) * t);
        } else {
            const t = (segMid - 0.5) * 2; // 0 to 1 within second half
            r = Math.round(midColor.r + (endColor.r - midColor.r) * t);
            g = Math.round(midColor.g + (endColor.g - midColor.g) * t);
            b = Math.round(midColor.b + (endColor.b - midColor.b) * t);
        }

        const segColor = rgbToHex({ r, g, b });
        const segX = Math.round(segStart * outW);
        const segW = Math.round((segEnd - segStart) * outW);
        const segTimeStart = segStart * duration;

        // Each segment is drawn with a width that grows from 0 to segW
        // and is only enabled when the progress reaches this segment
        const progressInSeg = `(t-${segTimeStart.toFixed(4)})/${(duration / SEGMENTS).toFixed(4)}`;
        const clampedW = `min(${segW}\\,max(0\\,${progressInSeg}*${segW}))`;

        filters.push(
            `drawbox=x=${segX}:y=${yPos}:w='${clampedW}':h=${barHeight}:color=${segColor}@${barOpacity}:t=fill:enable='gte(t\\,${segTimeStart.toFixed(4)})'`
        );
    }

    return filters.join(',');
}

/**
 * Build color channel interpolation expression
 */
function buildColorChannelExpr(progress, start, mid, end) {
    return `if(lt(${progress}\\,0.5)\\,${start}+(${mid}-${start})*(${progress}*2)\\,${mid}+(${end}-${mid})*((${progress}-0.5)*2))`;
}

/**
 * Parse hex color to RGB
 */
function hexToRGB(hex) {
    hex = hex.replace('#', '');
    return {
        r: parseInt(hex.substring(0, 2), 16),
        g: parseInt(hex.substring(2, 4), 16),
        b: parseInt(hex.substring(4, 6), 16)
    };
}

/**
 * Convert RGB back to hex for FFmpeg
 */
function rgbToHex(rgb) {
    const toHex = (n) => n.toString(16).padStart(2, '0');
    return `0x${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

// ===== WATERMARK =====

/**
 * Build watermark overlay filter string
 * @returns {string|null} FFmpeg filter_complex fragment, or null if no watermark
 */
function buildWatermarkFilter(settings, outW, outH) {
    if (!settings.watermark_path || !fs.existsSync(settings.watermark_path)) return null;
    if (settings.watermark_enabled === 'false' || settings.watermark_enabled === '0') return null;

    const position = settings.watermark_position || 'bottom-right';
    const opacity = parseFloat(settings.watermark_opacity || '0.5');
    const sizePct = parseInt(settings.watermark_size || '15');
    const wmW = Math.round(outW * sizePct / 100);

    // Scale watermark
    const scaleWm = `[1:v]scale=${wmW}:-1,format=yuva420p,colorchannelmixer=aa=${opacity}[wm]`;

    // Position mapping
    let overlay;
    const pad = 30;
    switch (position) {
        case 'top-left': overlay = `overlay=${pad}:${pad}`; break;
        case 'top-right': overlay = `overlay=W-w-${pad}:${pad}`; break;
        case 'bottom-left': overlay = `overlay=${pad}:H-h-${pad}`; break;
        case 'center': overlay = `overlay=(W-w)/2:(H-h)/2`; break;
        default: overlay = `overlay=W-w-${pad}:H-h-${pad}`; break; // bottom-right
    }

    return `${scaleWm};[vid][wm]${overlay}[outv]`;
}

// ===== SUBTITLE BURN-IN SYSTEM =====

/**
 * Default caption style presets (must match frontend CAPTION_STYLES)
 */
const CAPTION_PRESETS = {
    hormozi: { font: 'Montserrat', weight: 800, size: 72, color: '#FFFFFF', highlight: '#FFD700', outline: true, transform: 'uppercase', position: 'bottom' },
    bold_impact: { font: 'Impact', weight: 900, size: 76, color: '#FFFFFF', highlight: '#FFFFFF', outline: true, transform: 'uppercase', position: 'bottom' },
    minimal: { font: 'Arial', weight: 300, size: 56, color: '#E6E6E6', highlight: '#FFFFFF', outline: false, transform: 'lowercase', position: 'bottom' },
    karaoke: { font: 'Montserrat', weight: 700, size: 68, color: '#FF6B9D', highlight: '#00F5FF', outline: true, transform: 'none', position: 'center' },
    ali_abdaal: { font: 'Arial', weight: 800, size: 72, color: '#FFFFFF', highlight: '#4FC3F7', outline: false, transform: 'none', position: 'center' },
    gaming: { font: 'Montserrat', weight: 900, size: 70, color: '#00FF88', highlight: '#FF00FF', outline: true, transform: 'uppercase', position: 'bottom' },
    news: { font: 'Arial', weight: 600, size: 52, color: '#FFFFFF', highlight: '#FFD700', outline: false, transform: 'none', position: 'bottom' },
    podcast: { font: 'Arial', weight: 500, size: 56, color: '#E0E0E0', highlight: '#FF9800', outline: false, transform: 'none', position: 'bottom' },
    cinema: { font: 'Georgia', weight: 400, size: 60, color: '#D4C5A9', highlight: '#FFFFFF', outline: false, transform: 'none', position: 'bottom', italic: true },
    tiktok_og: { font: 'Montserrat', weight: 800, size: 68, color: '#FFFFFF', highlight: '#FE2C55', outline: true, transform: 'none', position: 'center' },
    // === NEW STYLES ===
    raymond: { font: 'Montserrat', weight: 800, size: 60, color: '#FFFFFF', highlight: '#FFD700', outline: true, transform: 'none', position: 'bottom', highlightScale: 160, spacing: 2 },
    clean_box: { font: 'Inter', weight: 700, size: 60, color: '#FFFFFF', highlight: '#00E5FF', outline: false, transform: 'none', position: 'center', boxBg: true, boxColor: '#1A1A2E', boxOpacity: 0.85, spacing: 2 },
    neon_box: { font: 'Montserrat', weight: 800, size: 66, color: '#FFFFFF', highlight: '#39FF14', outline: true, transform: 'uppercase', position: 'center', boxBg: true, boxColor: '#000000', boxOpacity: 0.6, spacing: 2 },
    pastel_box: { font: 'Inter', weight: 600, size: 58, color: '#2D2D2D', highlight: '#FF6B6B', outline: false, transform: 'none', position: 'bottom', boxBg: true, boxColor: '#FFFFFF', boxOpacity: 0.9, spacing: 2 },
};

/**
 * Convert hex color to ASS color format (&HAABBGGRR)
 */
function hexToASS(hex, alpha = 0) {
    if (!hex || hex === 'transparent') return '&H00000000';
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const r = hex.substr(0, 2);
    const g = hex.substr(2, 2);
    const b = hex.substr(4, 2);
    const a = alpha.toString(16).padStart(2, '0').toUpperCase();
    return `&H${a}${b}${g}${r}`.toUpperCase();
}

/**
 * Format time in seconds to ASS time format (H:MM:SS.CC)
 */
function toASSTime(seconds) {
    if (seconds < 0) seconds = 0;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Apply text transform to text
 */
function applyTransform(text, transform) {
    if (!transform || transform === 'none') return text;
    if (transform === 'uppercase') return text.toUpperCase();
    if (transform === 'lowercase') return text.toLowerCase();
    if (transform === 'capitalize') return text.replace(/\b\w/g, l => l.toUpperCase());
    return text;
}

/**
 * Generate ASS subtitle file from clip transcript and caption settings
 * @returns {string|null} Path to generated ASS file, or null if no transcript
 */
function generateSubtitleFile(clip, project, outputDir) {
    const db = require('../database');

    // Get transcript
    const transcript = db.get(
        'SELECT * FROM transcripts WHERE project_id = ? ORDER BY created_at DESC LIMIT 1',
        [project.id]
    );
    if (!transcript) {
        console.log('[Subtitle] No transcript found for project', project.id);
        return null;
    }

    // sql.js can return TEXT columns as Uint8Array for large data ΓÇö convert to string
    let segmentDataStr = transcript.segment_data;
    if (segmentDataStr instanceof Uint8Array || Buffer.isBuffer(segmentDataStr)) {
        segmentDataStr = Buffer.from(segmentDataStr).toString('utf-8');
    }
    if (!segmentDataStr) {
        console.log('[Subtitle] No segment_data in transcript');
        return null;
    }

    let segments;
    try {
        segments = JSON.parse(segmentDataStr);
    } catch (e) {
        console.warn('[Subtitle] Failed to parse segment_data:', e.message);
        return null;
    }

    if (!segments || segments.length === 0) {
        console.log('[Subtitle] segment_data is empty array');
        return null;
    }

    // Load word-level timestamps if available
    let wordTimestamps = [];
    let wordDataStr = transcript.word_data;
    if (wordDataStr instanceof Uint8Array || Buffer.isBuffer(wordDataStr)) {
        wordDataStr = Buffer.from(wordDataStr).toString('utf-8');
    }
    if (wordDataStr) {
        try {
            wordTimestamps = JSON.parse(wordDataStr) || [];
        } catch (e) { /* ignore */ }
    }

    console.log(`[Subtitle] ${segments.length} segments, ${wordTimestamps.length} words, clip range ${clip.start_time}-${clip.end_time}`);

    // Filter words within clip range
    const clipWords = wordTimestamps.filter(w =>
        w.end > clip.start_time && w.start < clip.end_time
    );

    // Filter segments within clip range
    const clipSegments = segments.filter(seg =>
        seg.end > clip.start_time && seg.start < clip.end_time
    );

    console.log(`[Subtitle] Filtered: ${clipWords.length} words, ${clipSegments.length} segments in clip range`);

    if (clipSegments.length === 0) {
        console.log('[Subtitle] No segments overlap with clip range');
        return null;
    }

    // Get caption style
    const styleId = clip.caption_style || 'hormozi';
    const preset = CAPTION_PRESETS[styleId] || CAPTION_PRESETS.hormozi;

    // Merge with custom settings if available
    let custom = {};
    if (clip.caption_settings) {
        try {
            custom = typeof clip.caption_settings === 'string'
                ? JSON.parse(clip.caption_settings) : clip.caption_settings;
        } catch (e) { /* ignore */ }
    }

    const style = {
        font: custom.fontFamily ? custom.fontFamily.split(',')[0].trim() : preset.font,
        size: custom.fontSize || preset.size,
        weight: custom.fontWeight || preset.weight,
        color: custom.textColor || preset.color,
        highlight: custom.highlightColor || preset.highlight,
        outline: custom.outline !== undefined ? custom.outline : preset.outline,
        transform: custom.textTransform || preset.transform,
        position: custom.position || preset.position,
        italic: custom.italic || preset.italic || false,
        bgOpacity: custom.bgOpacity !== undefined ? custom.bgOpacity : 0.6,
        boxBg: preset.boxBg || false,
        boxColor: preset.boxColor || '#000000',
        boxOpacity: preset.boxOpacity !== undefined ? preset.boxOpacity : 0.75,
        spacing: preset.spacing || 2,
        highlightScale: preset.highlightScale || 110,
    };

    // ASS alignment value based on position
    // ASS alignment: 1-3 bottom, 4-6 middle, 7-9 top (2=bottom-center, 5=middle-center, 8=top-center)
    let alignment = 2; // bottom center
    let marginV = 120;
    if (style.position === 'center') { alignment = 5; marginV = 0; }
    else if (style.position === 'top') { alignment = 8; marginV = 80; }

    const bold = style.weight >= 700 ? -1 : 0;
    const italic = style.italic ? -1 : 0;
    // BorderStyle: 1 = outline+shadow, 3 = opaque box background
    const useBoxBg = style.boxBg;
    const borderStyle = useBoxBg ? 3 : 1;
    const outlineSize = useBoxBg ? 18 : (style.outline ? 6 : 0);
    const shadowSize = useBoxBg ? 8 : (style.outline ? 3 : 1);
    const primaryColor = hexToASS(style.color);
    const highlightColor = hexToASS(style.highlight);
    const outlineColor = useBoxBg ? hexToASS(style.boxColor, Math.round((1 - style.boxOpacity) * 255)) : hexToASS('#000000');
    const bgColor = useBoxBg ? hexToASS(style.boxColor, Math.round((1 - style.boxOpacity) * 255)) : hexToASS('#000000', Math.round((1 - style.bgOpacity) * 255));
    const letterSpacing = style.spacing || 2;

    // Build ASS content
    let ass = `[Script Info]
Title: Clip Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.font},${style.size},${primaryColor},${primaryColor},${outlineColor},${bgColor},${bold},${italic},0,0,100,100,${letterSpacing},0,${borderStyle},${outlineSize},${shadowSize},${alignment},60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // Subtitle delay (seconds): Groq/Whisper word timestamps tend to detect word
    // boundaries slightly early (before actual audio peak). This delay shifts all
    // subtitle timestamps later so text appears in sync with actual speech.
    // With 2-pass rendering (pass 1 single-seek + pass 2 subtitle overlay),
    // the video PTS is accurate, so we add delay purely to compensate for Whisper offset.
    // 0.5s = subtitle appears 0.5s after the word's detected start → feels natural
    // If subtitles appear TOO LATE after this change: reduce to 0.3
    // Subtitle delay (seconds): 0.3s compensates for Whisper early detection.
    // Lower = subtitles appear earlier (less delay). Raise if subs still appear too early.
    const SUBTITLE_DELAY = 0.7;

    // Per-word highlight: all words visible, only the current word gets highlight color
    // This matches the preview behavior exactly
    const MAX_WORDS_PER_CHUNK = 5;
    const hlColor = highlightColor; // ASS format &HBBGGRR
    const hlScale = style.highlightScale || 110; // Scale for active word (110=default, 160=raymond)

    // Helper: build a dialogue line with all words visible, one highlighted
    const buildHighlightLine = (allWords, activeIndex) => {
        let line = '';
        for (let j = 0; j < allWords.length; j++) {
            if (j === activeIndex) {
                line += `{\\c${hlColor}\\fscx${hlScale}\\fscy${hlScale}}${allWords[j]}{\\r} `;
            } else {
                line += `${allWords[j]} `;
            }
        }
        return line.trim();
    };

    if (clipWords.length > 0) {
        // === USE WORD-LEVEL TIMESTAMPS (accurate timing!) ===
        console.log(`[Render] Using ${clipWords.length} word-level timestamps for subtitle sync`);

        // STEP 1: Pre-process ALL words - convert to relative times and eliminate overlaps globally
        // Sort by start time first to handle any out-of-order timestamps
        const processedWords = clipWords
            .map(w => ({
                text: applyTransform((w.word || w.text || '').trim(), style.transform),
                start: Math.max(0, w.start - clip.start_time + SUBTITLE_DELAY),
                end: Math.min(clip.end_time - clip.start_time, w.end - clip.start_time + SUBTITLE_DELAY)
            }))
            .filter(w => w.text.length > 0)
            .sort((a, b) => a.start - b.start);

        // STEP 2: Clamp ALL words globally so no two events overlap
        // Each word's end = min(word.end, nextWord.start)
        for (let i = 0; i < processedWords.length - 1; i++) {
            if (processedWords[i].end > processedWords[i + 1].start) {
                processedWords[i].end = processedWords[i + 1].start;
            }
        }

        // Remove zero/negative duration words
        const validWords = processedWords.filter(w => w.end > w.start);
        console.log(`[Subtitle] ${validWords.length} valid words after dedup (was ${clipWords.length})`);

        // STEP 3: Group into chunks
        const wordChunks = [];
        for (let i = 0; i < validWords.length; i += MAX_WORDS_PER_CHUNK) {
            wordChunks.push(validWords.slice(i, i + MAX_WORDS_PER_CHUNK));
        }

        // STEP 4: Generate ASS Dialogue events ΓÇö one per word, showing full chunk text
        for (const chunk of wordChunks) {
            const chunkTexts = chunk.map(w => w.text);
            if (chunkTexts.length === 0) continue;

            for (let w = 0; w < chunk.length; w++) {
                const line = buildHighlightLine(chunkTexts, w);
                ass += `Dialogue: 0,${toASSTime(chunk[w].start)},${toASSTime(chunk[w].end)},Default,,0,0,0,,${line}\n`;
            }
        }
    } else {
        // === FALLBACK: even distribution from segments ===
        console.log(`[Render] No word timestamps, using even distribution from segments`);

        for (const seg of clipSegments) {
            const relStart = Math.max(0, seg.start - clip.start_time + SUBTITLE_DELAY);
            const relEnd = Math.min(clip.end_time - clip.start_time, seg.end - clip.start_time + SUBTITLE_DELAY);
            const segDuration = relEnd - relStart;

            let text = (seg.text || '').trim();
            if (!text) continue;

            text = applyTransform(text, style.transform);

            const words = text.split(/\s+/).filter(w => w.length > 0);
            if (words.length === 0) continue;

            // Split into chunks
            const chunks = [];
            for (let i = 0; i < words.length; i += MAX_WORDS_PER_CHUNK) {
                chunks.push(words.slice(i, i + MAX_WORDS_PER_CHUNK));
            }
            const chunkDuration = segDuration / chunks.length;

            for (let c = 0; c < chunks.length; c++) {
                const chunkStart = relStart + (c * chunkDuration);
                const chunkWords = chunks[c];
                const wordDuration = chunkDuration / chunkWords.length;

                for (let w = 0; w < chunkWords.length; w++) {
                    const wordStart = chunkStart + (w * wordDuration);
                    const wordEnd = chunkStart + ((w + 1) * wordDuration);

                    const line = buildHighlightLine(chunkWords, w);
                    ass += `Dialogue: 0,${toASSTime(wordStart)},${toASSTime(wordEnd)},Default,,0,0,0,,${line}\n`;
                }
            }
        }
    }

    // Write ASS file
    const assFilename = `clip${clip.clip_number}_subs.ass`;
    const assPath = path.join(outputDir, assFilename);
    fs.writeFileSync(assPath, ass, 'utf-8');
    console.log(`[Render] Generated ASS subtitle: ${assFilename} (${clipSegments.length} segments)`);

    return assPath;
}

/**
 * Build FFmpeg subtitle filter string for ASS file — for use with -vf
 * Colons escaped as \\: (double backslash + colon) as required by -vf argument.
 */
function buildSubtitleFilter(assPath) {
    const escapePath = (p) => p
        .replace(/\\/g, '/')
        .replace(/'/g, "'\\''")
        .replace(/:/g, '\\:');

    const escapedPath = escapePath(assPath);
    const escapedFontsDir = escapePath('C:\\Windows\\Fonts');

    return `ass='${escapedPath}':fontsdir='${escapedFontsDir}'`;
}

/**
 * Build FFmpeg subtitle filter string for ASS file — for use inside -filter_complex
 * The 'ass' filter uses ':' as option separator inside filter_complex, which conflicts
 * with the path that contains ':' (Windows drive letter e.g. C:\\...).
 * Solution: use 'subtitles=' filter (alias for ass) and escape differently.
 * In filter_complex, the option separator ':' inside a quoted string must be escaped as '\:'.
 */
function buildSubtitleFilterComplex(assPath) {
    // In filter_complex: backslash → forward slash, single-escape colon with \:
    const escaped = assPath
        .replace(/\\/g, '/')
        .replace(/'/g, "''")
        .replace(/:/g, '\\:');

    const fontsDir = 'C\\\\:/Windows/Fonts';

    // Use 'subtitles=' which handles filter_complex better than 'ass='
    return `subtitles='${escaped}'`;
}

/**
 * Render all clips for a project
 */
async function renderAllClips(projectId, io) {
    const clips = require('../database').all(
        'SELECT * FROM clips WHERE project_id = ? AND is_selected = 1 ORDER BY clip_number',
        [projectId]
    );

    if (clips.length === 0) throw new Error('No clips to render');

    const results = [];
    const emit = (progress, message) => {
        if (io) {
            io.emit('render:progress', { projectId, progress, message });
            io.emit('process:log', { projectId, type: 'info', message: `[RenderAll] ${message}`, timestamp: new Date().toTimeString() });
        }
    };

    emit(0, `Starting render of ${clips.length} clips...`);

    for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        const clipProgress = Math.round((i / clips.length) * 100);
        emit(clipProgress, `Rendering clip ${i + 1}/${clips.length}: ${clip.title}`);

        try {
            const result = await renderClip(clip.id, io);
            results.push({ clipId: clip.id, success: true, ...result });
        } catch (err) {
            results.push({ clipId: clip.id, success: false, error: err.message });
            console.error(`[RenderAll] Clip ${i + 1} failed:`, err.message);
        }
    }

    const successCount = results.filter(r => r.success).length;
    emit(100, `Done! ${successCount}/${clips.length} clips exported.`);

    return results;
}


module.exports = { renderClip, renderAllClips };
