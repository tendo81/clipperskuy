const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { get, run } = require('../database');
const { generateFaceTrackCrop } = require('./faceTracker');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CLIPS_DIR = path.join(DATA_DIR, 'clips');

fs.ensureDirSync(CLIPS_DIR);

/**
 * Run FFmpeg with given args, returning a promise
 */
function runFFmpeg(args, duration, emit) {
    return new Promise((resolve, reject) => {
        console.log(`[Render] FFmpeg: ffmpeg ${args.join(' ')}`);
        const proc = spawn('ffmpeg', args, { windowsHide: true });

        let stderr = '';
        let lastProgress = 10;

        proc.stderr.on('data', (data) => {
            const line = data.toString();
            stderr += line;

            const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.\d+)/);
            if (timeMatch && duration > 0) {
                const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
                const pct = Math.min(95, Math.round((currentTime / duration) * 85) + 10);
                if (pct > lastProgress) {
                    lastProgress = pct;
                    if (emit) emit(pct, `Rendering... ${pct}%`);
                }
            }
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ success: true, stderr });
            } else {
                const errorLines = stderr.split('\n').filter(l =>
                    l.includes('Error') || l.includes('error') || l.includes('Invalid') || l.includes('No such') || l.includes('does not contain')
                );
                const errorMsg = errorLines.slice(-3).join(' ').trim() || `FFmpeg exited with code ${code}`;
                resolve({ success: false, stderr, errorMsg, code });
            }
        });

        proc.on('error', (err) => {
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
        if (io) io.emit('clip:progress', { clipId, projectId: project.id, progress, message });
        console.log(`[Render] Clip #${clip.clip_number}: ${progress}% - ${message}`);
    };

    run("UPDATE clips SET status = 'rendering' WHERE id = ?", [clipId]);
    emit(5, 'Starting render...');

    // Settings
    const reframingMode = project.reframing_mode || 'center';
    const aspectRatio = project.aspect_ratio || '9:16';
    const settingsRows = require('../database').all('SELECT * FROM settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });

    const { outW, outH } = getOutputDimensions(aspectRatio);
    const duration = clip.end_time - clip.start_time;

    // Output path
    const safeTitle = (clip.title || `clip${clip.clip_number}`)
        .replace(/[^a-zA-Z0-9_\-]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 40);
    const outputFilename = `clip${clip.clip_number}_${safeTitle}.mp4`;
    const projectClipsDir = path.join(CLIPS_DIR, project.id);
    fs.ensureDirSync(projectClipsDir);
    const outputPath = path.join(projectClipsDir, outputFilename);

    // Remove existing broken file
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) { }

    // ===== Generate subtitle file (ASS) if transcript available =====
    let assPath = null;
    try {
        assPath = generateSubtitleFile(clip, project, projectClipsDir);
        if (assPath) {
            emit(8, 'Subtitles generated');
        }
    } catch (e) {
        console.warn(`[Render] Subtitle generation failed: ${e.message}`);
    }

    emit(10, `Reframing: ${reframingMode}, ${outW}x${outH}`);

    // ===== Face track: run detection before building filters =====
    let faceTrackFilter = null;
    if (reframingMode === 'face_track') {
        try {
            emit(12, 'Analyzing face positions...');
            const result = await generateFaceTrackCrop(project.source_path, outW, outH, duration);
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

    // ===== Encoder selection (hardware acceleration) =====
    const { encoder, encoderArgs } = getEncoder(settings);

    const qualityPreset = settings.quality_preset || 'balanced';
    const preset = qualityPreset === 'best' ? 'slow' : qualityPreset === 'fast' ? 'ultrafast' : 'medium';
    const crf = qualityPreset === 'best' ? '18' : qualityPreset === 'fast' ? '28' : '23';

    // ===== Audio filter (normalization) =====
    const audioFilter = 'loudnorm=I=-16:TP=-1.5:LRA=11';

    // ===== Watermark =====
    const watermarkFilter = buildWatermarkFilter(settings, outW, outH);

    // ===== Progress Bar =====
    const progressBarFilter = buildProgressBarFilter(settings, outW, outH, duration);

    // ===== ATTEMPT 1: Preferred filter with subtitles =====
    const useFilterComplex = (reframingMode === 'fit' || reframingMode === 'split' || watermarkFilter);
    const vf = faceTrackFilter || buildVideoFilter(reframingMode, outW, outH);

    // Build subtitle filter string
    const subFilter = assPath ? buildSubtitleFilter(assPath) : '';

    // Chain order: reframe → progress bar → subtitles → format
    const extraFilters = [progressBarFilter, subFilter].filter(Boolean).join(',');

    const args1 = [
        '-y',
        '-ss', String(clip.start_time),
        '-i', project.source_path,
        '-t', String(duration),
    ];

    // Add watermark input if needed
    if (watermarkFilter && settings.watermark_path && fs.existsSync(settings.watermark_path)) {
        args1.push('-i', settings.watermark_path);
    }

    if (useFilterComplex && watermarkFilter) {
        // Complex filter with watermark
        const vidChain = vf + (extraFilters ? `,${extraFilters}` : '') + ',format=yuv420p';
        const fullFilter = `[0:v]${vidChain}[vid];${watermarkFilter}`;
        args1.push('-filter_complex', fullFilter);
        args1.push('-map', '[outv]', '-map', '0:a?');
        args1.push('-af', audioFilter);
    } else if (useFilterComplex) {
        // Complex filter without watermark
        const fullFilter = vf + (extraFilters ? `,${extraFilters}` : '') + ',format=yuv420p[outv]';
        args1.push('-filter_complex', fullFilter);
        args1.push('-map', '[outv]', '-map', '0:a?');
        args1.push('-af', audioFilter);
    } else {
        // Simple filter
        const fullFilter = vf + (extraFilters ? `,${extraFilters}` : '') + ',format=yuv420p';
        args1.push('-vf', fullFilter);
        args1.push('-af', audioFilter);
    }

    args1.push(
        '-c:v', encoder, ...encoderArgs, '-crf', crf,
        '-c:a', 'aac', '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
        outputPath
    );

    // For GPU encoders, replace -crf with appropriate quality param
    if (encoder !== 'libx264') {
        const crfIdx = args1.indexOf('-crf');
        if (crfIdx > -1) {
            if (encoder.includes('nvenc')) {
                args1[crfIdx] = '-cq';
            } else if (encoder.includes('amf')) {
                args1[crfIdx] = '-quality';
                args1[crfIdx + 1] = qualityPreset === 'best' ? 'quality' : qualityPreset === 'fast' ? 'speed' : 'balanced';
            } else if (encoder.includes('qsv')) {
                args1[crfIdx] = '-global_quality';
            }
        }
    }

    const result1 = await runFFmpeg(args1, duration, emit);

    if (result1.success && validateOutput(outputPath)) {
        const stats = fs.statSync(outputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        run("UPDATE clips SET status = 'rendered', output_path = ? WHERE id = ?", [outputPath, clipId]);
        emit(100, `Done! ${sizeMB} MB`);
        console.log(`[Render] Clip #${clip.clip_number} exported: ${outputPath} (${sizeMB} MB)`);
        return { outputPath, size: stats.size };
    }

    // ===== ATTEMPT 2: Simple fallback (scale+crop only) =====
    console.warn(`[Render] Attempt 1 failed for clip #${clip.clip_number}, trying simple fallback...`);
    console.warn(`[Render] Error: ${result1.errorMsg || 'Output file invalid'}`);
    emit(15, 'Retrying with simpler encoding...');

    // Cleanup broken file
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) { }

    const simpleFallbackFilter = `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},format=yuv420p`;

    const args2 = [
        '-y',
        '-ss', String(clip.start_time),
        '-i', project.source_path,
        '-t', String(duration),
        '-vf', simpleFallbackFilter,
        '-c:v', encoder, '-preset', 'medium', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k',
        '-shortest',
        '-movflags', '+faststart',
        outputPath
    ];

    const result2 = await runFFmpeg(args2, duration, emit);

    if (result2.success && validateOutput(outputPath)) {
        const stats = fs.statSync(outputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        run("UPDATE clips SET status = 'rendered', output_path = ? WHERE id = ?", [outputPath, clipId]);
        emit(100, `Done! ${sizeMB} MB (fallback mode)`);
        console.log(`[Render] Clip #${clip.clip_number} exported (fallback): ${outputPath} (${sizeMB} MB)`);
        return { outputPath, size: stats.size };
    }

    // ===== ATTEMPT 3: Ultra-safe stream copy with trim =====
    console.warn(`[Render] Attempt 2 also failed, trying stream copy...`);
    emit(20, 'Retrying with stream copy...');

    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) { }

    const args3 = [
        '-y',
        '-ss', String(clip.start_time),
        '-i', project.source_path,
        '-t', String(duration),
        '-c', 'copy',
        '-movflags', '+faststart',
        outputPath
    ];

    const result3 = await runFFmpeg(args3, duration, emit);

    if (result3.success && validateOutput(outputPath)) {
        const stats = fs.statSync(outputPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
        run("UPDATE clips SET status = 'rendered', output_path = ? WHERE id = ?", [outputPath, clipId]);
        emit(100, `Done! ${sizeMB} MB (stream copy)`);
        console.log(`[Render] Clip #${clip.clip_number} exported (stream copy): ${outputPath} (${sizeMB} MB)`);
        return { outputPath, size: stats.size };
    }

    // All attempts failed — cleanup any leftover empty/broken files
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch (e) { }

    const finalError = result3.errorMsg || result2.errorMsg || result1.errorMsg || 'All render attempts failed';
    console.error(`[Render] All 3 attempts failed for clip #${clip.clip_number}:`);
    console.error(`[Render]   Attempt 1: ${result1.errorMsg || 'invalid output'}`);
    console.error(`[Render]   Attempt 2: ${result2.errorMsg || 'invalid output'}`);
    console.error(`[Render]   Attempt 3: ${result3.errorMsg || 'invalid output'}`);

    run("UPDATE clips SET status = 'failed' WHERE id = ?", [clipId]);
    emit(0, `Render failed: ${finalError}`);
    throw new Error(finalError);
}

/**
 * Build video filter string
 */
function buildVideoFilter(mode, outW, outH) {
    switch (mode) {
        case 'center':
            return `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}`;

        case 'fit':
            // Fit with blur background — popular TikTok/Reels style
            return [
                `[0:v]split[a][b]`,
                `[a]scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH},boxblur=20:5[bg]`,
                `[b]scale=${outW}:${outH}:force_original_aspect_ratio=decrease[fg]`,
                `[bg][fg]overlay=(W-w)/2:(H-h)/2`
            ].join(';');

        case 'face_track':
            return `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}`;

        case 'split': {
            const halfH = Math.floor(outH / 2);
            return [
                `[0:v]split[a][b]`,
                `[a]scale=${outW}:${halfH}:force_original_aspect_ratio=decrease,pad=${outW}:${halfH}:(ow-iw)/2:(oh-ih)/2[top]`,
                `[b]scale=${outW * 2}:-2,crop=${outW}:${halfH}[bottom]`,
                `[top][bottom]vstack`
            ].join(';');
        }

        default:
            return `scale=${outW}:${outH}:force_original_aspect_ratio=increase,crop=${outW}:${outH}`;
    }
}

/**
 * Get output dimensions based on aspect ratio
 */
function getOutputDimensions(aspectRatio) {
    switch (aspectRatio) {
        case '9:16': return { outW: 1080, outH: 1920 };
        case '1:1': return { outW: 1080, outH: 1080 };
        case '4:5': return { outW: 1080, outH: 1350 };
        case '16:9': return { outW: 1920, outH: 1080 };
        default: return { outW: 1080, outH: 1920 };
    }
}

// ===== HARDWARE ACCELERATION =====

/**
 * Detect and return the best available encoder
 */
function getEncoder(settings) {
    const hwAccel = settings.hw_accel || 'auto';
    const encoderSetting = settings.encoder || 'auto';

    // CPU fallback
    const cpuEncoder = {
        encoder: 'libx264',
        encoderArgs: ['-preset', settings.quality_preset === 'best' ? 'slow' : settings.quality_preset === 'fast' ? 'ultrafast' : 'medium']
    };

    if (hwAccel === 'none' || encoderSetting === 'libx264') {
        return cpuEncoder;
    }

    // Specific encoder requested
    if (encoderSetting && encoderSetting !== 'auto') {
        console.log(`[Render] Using encoder: ${encoderSetting}`);
        return { encoder: encoderSetting, encoderArgs: [] };
    }

    // Auto-detect: try GPU encoders in order
    // We don't actually probe here (that would slow down rendering)
    // Instead we rely on the setting and FFmpeg's own fallback
    if (hwAccel === 'nvidia' || hwAccel === 'nvenc') {
        return { encoder: 'h264_nvenc', encoderArgs: ['-preset', 'p4', '-tune', 'hq'] };
    }
    if (hwAccel === 'amd' || hwAccel === 'amf') {
        return { encoder: 'h264_amf', encoderArgs: [] };
    }
    if (hwAccel === 'intel' || hwAccel === 'qsv') {
        return { encoder: 'h264_qsv', encoderArgs: ['-preset', 'medium'] };
    }

    // 'auto' setting — just use CPU (most reliable)
    return cpuEncoder;
}

// ===== RETENTION PROGRESS BAR =====

/**
 * Build FFmpeg filter for animated progress bar at bottom of video.
 * Color transitions: start(blue/green) → mid(yellow) → end(red)
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
    // Phase 1 (0%-50%): startColor → midColor
    // Phase 2 (50%-100%): midColor → endColor
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

    // Simple reliable approach: single drawbox with animated width
    // Background track (dark bar showing total length)
    const bgBar = `drawbox=x=0:y=${yPos}:w=${outW}:h=${barHeight}:color=black@0.3:t=fill`;

    // Animated progress bar: width grows from 0 to outW based on time
    // Use single color for reliability (the start color)
    const progressHex = rgbToHex(startColor);
    const progressBar = `drawbox=x=0:y=${yPos}:w='t/${duration.toFixed(4)}*${outW}':h=${barHeight}:color=${progressHex}@${barOpacity}:t=fill`;

    return `${bgBar},${progressBar}`;
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
    minimal: { font: 'Inter', weight: 300, size: 56, color: '#E6E6E6', highlight: '#FFFFFF', outline: false, transform: 'lowercase', position: 'bottom' },
    karaoke: { font: 'Outfit', weight: 700, size: 68, color: '#FF6B9D', highlight: '#00F5FF', outline: true, transform: 'none', position: 'center' },
    ali_abdaal: { font: 'Inter', weight: 800, size: 72, color: '#FFFFFF', highlight: '#4FC3F7', outline: false, transform: 'none', position: 'center' },
    gaming: { font: 'Outfit', weight: 900, size: 70, color: '#00FF88', highlight: '#FF00FF', outline: true, transform: 'uppercase', position: 'bottom' },
    news: { font: 'Inter', weight: 600, size: 52, color: '#FFFFFF', highlight: '#FFD700', outline: false, transform: 'none', position: 'bottom' },
    podcast: { font: 'Inter', weight: 500, size: 56, color: '#E0E0E0', highlight: '#FF9800', outline: false, transform: 'none', position: 'bottom' },
    cinema: { font: 'Georgia', weight: 400, size: 60, color: '#D4C5A9', highlight: '#FFFFFF', outline: false, transform: 'none', position: 'bottom', italic: true },
    tiktok_og: { font: 'Outfit', weight: 800, size: 68, color: '#FFFFFF', highlight: '#FE2C55', outline: true, transform: 'none', position: 'center' },
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
    if (!transcript || !transcript.segment_data) return null;

    let segments;
    try {
        segments = JSON.parse(transcript.segment_data);
    } catch (e) {
        return null;
    }

    if (!segments || segments.length === 0) return null;

    // Filter segments within clip range
    const clipSegments = segments.filter(seg =>
        seg.end > clip.start_time && seg.start < clip.end_time
    );

    if (clipSegments.length === 0) return null;

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
    };

    // ASS alignment value based on position
    // ASS alignment: 1-3 bottom, 4-6 middle, 7-9 top (2=bottom-center, 5=middle-center, 8=top-center)
    let alignment = 2; // bottom center
    let marginV = 120;
    if (style.position === 'center') { alignment = 5; marginV = 0; }
    else if (style.position === 'top') { alignment = 8; marginV = 80; }

    const bold = style.weight >= 700 ? -1 : 0;
    const italic = style.italic ? -1 : 0;
    const outlineSize = style.outline ? 4 : 0;
    const shadowSize = style.outline ? 2 : 1;
    const primaryColor = hexToASS(style.color);
    const outlineColor = hexToASS('#000000');
    const bgColor = hexToASS('#000000', Math.round((1 - style.bgOpacity) * 255));

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
Style: Default,${style.font},${style.size},${primaryColor},${primaryColor},${outlineColor},${bgColor},${bold},${italic},0,0,100,100,0,0,1,${outlineSize},${shadowSize},${alignment},60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // Add dialogue events — offset times relative to clip start
    for (const seg of clipSegments) {
        const relStart = Math.max(0, seg.start - clip.start_time);
        const relEnd = Math.min(clip.end_time - clip.start_time, seg.end - clip.start_time);

        let text = (seg.text || '').trim();
        if (!text) continue;

        text = applyTransform(text, style.transform);

        // Escape ASS special characters
        text = text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
        // Convert newlines to ASS line breaks
        text = text.replace(/\n/g, '\\N');

        ass += `Dialogue: 0,${toASSTime(relStart)},${toASSTime(relEnd)},Default,,0,0,0,,${text}\n`;
    }

    // Write ASS file
    const assFilename = `clip${clip.clip_number}_subs.ass`;
    const assPath = path.join(outputDir, assFilename);
    fs.writeFileSync(assPath, ass, 'utf-8');
    console.log(`[Render] Generated ASS subtitle: ${assFilename} (${clipSegments.length} segments)`);

    return assPath;
}

/**
 * Build FFmpeg subtitle filter string for ASS file
 * Handles Windows path escaping for FFmpeg
 */
function buildSubtitleFilter(assPath) {
    // FFmpeg requires forward slashes and special escaping on Windows
    const escapedPath = assPath
        .replace(/\\/g, '/')  // backslash → forward slash
        .replace(/:/g, '\\:'); // escape colons (C: → C\:)
    return `ass='${escapedPath}'`;
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
        if (io) io.emit('render:progress', { projectId, progress, message });
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
