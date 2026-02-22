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
    const duration = clip.end_time - clip.start_time;

    // ===== Apply license tier restrictions =====
    const { getRenderLimits } = require('./license');
    const renderLimits = getRenderLimits();

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
        const { execSync } = require('child_process');
        const probeResult = execSync(
            `"${FFPROBE_PATH}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${project.source_path}"`,
            { encoding: 'utf-8', timeout: 10000 }
        ).trim();
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
    }

    // ===== Face Track + Blur mode =====
    let faceTrackBlurFilter = null;
    if (reframingMode === 'face_track_blur') {
        if (!renderLimits.faceTrackAllowed) {
            emit(8, '🔒 Face Track Blur is a PRO feature — using fit mode instead');
            reframingMode = 'fit';
        } else {
            try {
                emit(12, 'Analyzing face positions for blur mode...');
                const result = await generateFaceTrackCrop(project.source_path, outW, outH, duration, clip.start_time);
                const scaleFlags = ':flags=lanczos';

                if (result.cropFilter) {
                    // Extract just the crop part from face tracking (before scale)
                    // cropFilter format: "crop=W:H:X:Y,scale=..." or "crop=W:H:expr:expr,scale=..."
                    const cropPart = result.cropFilter.split(',scale=')[0];

                    faceTrackBlurFilter = [
                        `[0:v]split[a][b]`,
                        `[a]scale=${outW}:${outH}:force_original_aspect_ratio=increase${scaleFlags},crop=${outW}:${outH},boxblur=20:5[bg]`,
                        `[b]${cropPart},scale=${outW}:${outH}:force_original_aspect_ratio=decrease${scaleFlags}[fg]`,
                        `[bg][fg]overlay=(W-w)/2:(H-h)/2`
                    ].join(';');

                    emit(18, `Face Track Blur: ${result.positions.length} positions, blur background active`);
                } else {
                    emit(15, 'No faces detected, using fit mode');
                    reframingMode = 'fit';
                }
            } catch (e) {
                console.warn('[Render] Face track blur failed, falling back to fit:', e.message);
                emit(15, 'Face track blur failed, using fit mode');
                reframingMode = 'fit';
            }
        }
    }

    // ===== Encoder selection (hardware acceleration) =====
    const { encoder, encoderArgs } = getEncoder(settings);

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

    // Build subtitle filter string
    const subFilter = assPath ? buildSubtitleFilter(assPath) : '';

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
    const hookTitleFilter = buildHookTitleFilter(clip, outW, outH, duration);
    if (hookTitleFilter) emit(9, `Hook title: "${clip.hook_text}"`);

    const extraFilters = [progressBarFilter, subFilter, hookTitleFilter, textWatermarkFilter].filter(Boolean).join(',');

    // Single input-seeking: -ss before -i with accurate_seek (FFmpeg default)
    // This decodes from the nearest keyframe to clip.start_time, ensuring exact positioning.
    // Do NOT use -ss after -i (output-seeking), as it causes subtitle desync when keyframes
    // are far apart (the double -ss offsets don't add up correctly).
    const args1 = [
        '-y',
        '-ss', String(clip.start_time),
        '-i', project.source_path,
        '-t', String(duration),
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

    // Detect if vf is already a complex filter graph (fit/split modes start with [0:v]split)
    const isComplexVf = vf.includes('[0:v]');

    // For complex filter modes (fit/split), we separate subtitle burn-in into a second pass.
    // The ASS filter has path escaping issues inside -filter_complex, causing subtitles to silently fail.
    // Strategy: pass 1 = reframing only, pass 2 = subtitle + hook title burn-in via simple -vf.
    const needsSubtitlePass = isComplexVf && (subFilter || hookTitleFilter);
    const extraFiltersNoSub = needsSubtitlePass
        ? [progressBarFilter, textWatermarkFilter].filter(Boolean).join(',')
        : extraFilters;

    if (useFilterComplex && watermarkFilter) {
        // Complex filter with watermark image overlay
        let fullFilter;
        if (isComplexVf) {
            fullFilter = vf + (extraFiltersNoSub ? `,${extraFiltersNoSub}` : '') + ',format=yuv420p[vid]';
        } else {
            fullFilter = `[0:v]${vf}` + (extraFilters ? `,${extraFilters}` : '') + ',format=yuv420p[vid]';
        }
        fullFilter += `;${watermarkFilter}`;
        if (audioArgs.complex) fullFilter += `;${audioArgs.complex}`;
        args1.push('-filter_complex', fullFilter);
        args1.push('-map', '[outv]');
        if (audioArgs.map) args1.push('-map', audioArgs.map);
        else { args1.push('-map', '0:a?'); args1.push('-af', audioFilter); }
    } else if (useFilterComplex) {
        // Complex filter without watermark (fit/split or with music/sfx)
        let fullFilter;
        if (isComplexVf) {
            fullFilter = vf + (extraFiltersNoSub ? `,${extraFiltersNoSub}` : '') + ',format=yuv420p[outv]';
        } else {
            fullFilter = `[0:v]${vf}` + (extraFilters ? `,${extraFilters}` : '') + ',format=yuv420p[outv]';
        }
        if (audioArgs.complex) fullFilter += `;${audioArgs.complex}`;
        args1.push('-filter_complex', fullFilter);
        args1.push('-map', '[outv]');
        if (audioArgs.map) args1.push('-map', audioArgs.map);
        else { args1.push('-map', '0:a?'); args1.push('-af', audioFilter); }
    } else {
        // Simple filter (center/face_track without music/watermark)
        const fullFilter = vf + (extraFilters ? `,${extraFilters}` : '') + ',format=yuv420p';
        args1.push('-vf', fullFilter);
        args1.push('-af', audioFilter);
    }

    // If we need subtitle second pass, output to temp file first
    const needsSecondPass = needsSubtitlePass;
    const tempOutputPath = needsSecondPass ? outputPath.replace('.mp4', '_temp.mp4') : null;

    args1.push(
        '-c:v', encoder, ...encoderArgs, '-crf', crf,
        '-c:a', 'aac', '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
        needsSecondPass ? tempOutputPath : outputPath
    );

    // For GPU encoders, replace -crf with appropriate quality param
    if (encoder !== 'libx264') {
        const crfIdx = args1.indexOf('-crf');
        if (crfIdx > -1) {
            // Check if encoderArgs already has quality params to avoid duplicates
            const hasQuality = encoderArgs.some(a => ['-quality', '-cq', '-global_quality', '-preset'].includes(a));
            if (hasQuality) {
                // Remove -crf and its value entirely (already set by encoderArgs)
                args1.splice(crfIdx, 2);
            } else if (encoder.includes('nvenc')) {
                args1[crfIdx] = '-cq';
            } else if (encoder.includes('amf')) {
                args1[crfIdx] = '-quality';
                args1[crfIdx + 1] = qualityPreset === 'best' ? 'quality' : qualityPreset === 'fast' ? 'speed' : 'balanced';
            } else if (encoder.includes('qsv')) {
                args1[crfIdx] = '-global_quality';
            }
        }
    }

    const result1 = await runFFmpeg(args1, duration, emit, io, project.id);

    // For fit/split modes: run second pass to burn subtitles
    const checkPath = needsSecondPass ? tempOutputPath : outputPath;
    if (result1.success && validateOutput(checkPath)) {
        if (needsSecondPass) {
            // Second pass: burn subtitles + hook title onto the temp file using simple -vf
            emit(85, 'Burning subtitles & overlays...');
            console.log(`[Render] Pass 2: Burning subtitles + hook onto ${tempOutputPath}`);
            const pass2Filters = [subFilter, hookTitleFilter].filter(Boolean).join(',');
            const subArgs = [
                '-y',
                '-i', tempOutputPath,
                '-vf', `${pass2Filters},format=yuv420p`,
                '-c:v', encoder, ...encoderArgs, '-crf', crf,
                '-c:a', 'copy',
                '-shortest',
                '-movflags', '+faststart',
                outputPath
            ];
            // Fix CRF for GPU encoders in pass 2 as well
            if (encoder !== 'libx264') {
                const crfIdx2 = subArgs.indexOf('-crf');
                if (crfIdx2 > -1) {
                    const hasQuality2 = encoderArgs.some(a => ['-quality', '-cq', '-global_quality', '-preset'].includes(a));
                    if (hasQuality2) subArgs.splice(crfIdx2, 2);
                    else if (encoder.includes('nvenc')) subArgs[crfIdx2] = '-cq';
                    else if (encoder.includes('amf')) { subArgs[crfIdx2] = '-quality'; subArgs[crfIdx2 + 1] = 'balanced'; }
                    else if (encoder.includes('qsv')) subArgs[crfIdx2] = '-global_quality';
                }
            }
            console.log(`[Render] Pass 2 args: ffmpeg ${subArgs.join(' ').substring(0, 300)}...`);
            const result1b = await runFFmpeg(subArgs, duration, emit, io, project.id);

            if (result1b.success && validateOutput(outputPath)) {
                // Pass 2 succeeded — clean up temp and return
                try { fs.unlinkSync(tempOutputPath); } catch (e) { }
                const stats = fs.statSync(outputPath);
                const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);
                run("UPDATE clips SET status = 'rendered', output_path = ? WHERE id = ?", [outputPath, clipId]);
                emit(100, `Done! ${sizeMB} MB`);
                console.log(`[Render] Clip #${clip.clip_number} exported (2-pass): ${outputPath} (${sizeMB} MB)`);
                return { outputPath, size: stats.size };
            }

            // Pass 2 FAILED — use temp file as-is (without subtitles/hook)
            console.warn(`[Render] Pass 2 failed: ${result1b.errorMsg || 'Unknown error'}`);
            console.warn(`[Render] Pass 2 stderr (last 500): ${(result1b.stderr || '').slice(-500)}`);
            emit(90, 'Subtitle burn failed, using video without overlays');
            try {
                if (fs.existsSync(tempOutputPath)) {
                    fs.renameSync(tempOutputPath, outputPath);
                    console.log(`[Render] Fallback: renamed temp to output (without subtitles)`);
                }
            } catch (e) {
                console.error(`[Render] Fallback rename failed: ${e.message}`);
            }
        }

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

    // Use appropriate quality args for the encoder
    const fallbackEncoderArgs = encoder.includes('amf')
        ? ['-quality', 'balanced']
        : encoder.includes('nvenc')
            ? ['-preset', 'p4', '-cq', '23']
            : encoder.includes('qsv')
                ? ['-preset', 'medium', '-global_quality', '23']
                : ['-preset', 'medium', '-crf', '23'];

    const args2 = [
        '-y',
        '-ss', String(Math.max(0, clip.start_time - 2)),
        '-i', project.source_path,
        '-ss', String(Math.min(2, clip.start_time)),
        '-t', String(duration),
        '-vf', simpleFallbackFilter,
        '-c:v', encoder, ...fallbackEncoderArgs,
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
 * Build Hook Title drawtext filter
 * Shows a text overlay with colored background box at top or bottom of video.
 * @param {object} clip - clip object (with hook_text, hook_settings)
 * @param {number} outW - output width
 * @param {number} outH - output height
 * @param {number} duration - clip duration in seconds
 * @returns {string} drawtext filter string or empty string
 */
function buildHookTitleFilter(clip, outW, outH, duration) {
    const hookText = clip.hook_text;
    if (!hookText || !hookText.trim()) return '';

    // Only render hook if user explicitly configured settings in the editor
    if (!clip.hook_settings) return '';

    let settings = {};
    try {
        settings = typeof clip.hook_settings === 'string' ? JSON.parse(clip.hook_settings) : (clip.hook_settings || {});
    } catch (e) { return ''; }

    // Must have at least been saved from the editor (has explicit values)
    if (!settings.position && !settings.textColor && !settings.bgColor) return '';

    const hookDuration = settings.duration != null ? settings.duration : 5;
    const position = settings.position || 'top';
    const fontSize = settings.fontSize || Math.round(outW / 14);
    const textColor = (settings.textColor || 'FFFFFF').replace('#', '');
    const bgColor = (settings.bgColor || 'FF0000').replace('#', '');
    const bgOpacity = settings.bgOpacity || '0.85';

    // Simple escape for drawtext - strip problematic chars
    const escapedText = hookText.replace(/['\\:%;]/g, ' ').replace(/"/g, ' ').trim();
    if (!escapedText) return '';

    const margin = Math.round(outW * 0.04);
    const posY = position === 'bottom' ? `h-th-${margin * 4}` : `${margin}`;
    const enableExpr = hookDuration > 0 ? `:enable='between(t,0,${hookDuration})'` : '';
    const boxBorderW = Math.round(fontSize * 0.4);

    // FFmpeg drawtext on Windows requires explicit fontfile= (no Fontconfig configured)
    const os = require('os');
    const userFontsDir = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts');
    const systemFontsDir = 'C:\\Windows\\Fonts';
    const fontCandidates = [
        path.join(userFontsDir, 'Montserrat-Bold.ttf'),
        path.join(userFontsDir, 'Montserrat-ExtraBold.ttf'),
        path.join(systemFontsDir, 'arialbd.ttf'),
        path.join(systemFontsDir, 'arial.ttf'),
    ];
    let fontPath = fontCandidates.find(f => fs.existsSync(f)) || path.join(systemFontsDir, 'arial.ttf');
    const escapedFontPath = fontPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    return `drawtext=text='${escapedText}':fontfile='${escapedFontPath}':fontsize=${fontSize}:fontcolor=0x${textColor}:x=(w-tw)/2:y=${posY}:box=1:boxcolor=0x${bgColor}@${bgOpacity}:boxborderw=${boxBorderW}${enableExpr}`;
}

/**
 * Build video filter string
 * Uses lanczos scaling (highest quality). Sharpening only when upscaling.
 * @param {string} mode - reframing mode
 * @param {number} outW - output width
 * @param {number} outH - output height
 * @param {number} [sourceW=0] - source video width (0 = unknown, skip sharpen)
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
            return [
                `[0:v]split[a][b]`,
                `[a]scale=${outW}:${outH}:force_original_aspect_ratio=increase${scaleFlags},crop=${outW}:${outH},boxblur=20:5[bg]`,
                `[b]scale=${outW}:${outH}:force_original_aspect_ratio=decrease${scaleFlags}${sharpen}[fg]`,
                `[bg][fg]overlay=(W-w)/2:(H-h)/2`
            ].join(';');

        case 'face_track':
            return `scale=${outW}:${outH}:force_original_aspect_ratio=increase${scaleFlags},crop=${outW}:${outH}${sharpen}`;

        case 'split': {
            const halfH = Math.floor(outH / 2);
            return [
                `[0:v]split[a][b]`,
                `[a]scale=${outW}:${halfH}:force_original_aspect_ratio=decrease${scaleFlags}${sharpen},pad=${outW}:${halfH}:(ow-iw)/2:(oh-ih)/2[top]`,
                `[b]scale=${outW * 2}:-2${scaleFlags},crop=${outW}:${halfH}${sharpen}[bottom]`,
                `[top][bottom]vstack`
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
function getEncoder(settings) {
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
            return { encoder: encoderSetting, encoderArgs: ['-quality', 'balanced'] };
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
        return { encoder: 'h264_amf', encoderArgs: ['-quality', 'balanced'] };
    }
    if (hwAccel === 'intel' || hwAccel === 'qsv') {
        console.log('[Render] Using Intel QSV (from hw_accel setting)');
        return { encoder: 'h264_qsv', encoderArgs: ['-preset', 'medium'] };
    }

    // 'auto'/'auto' — try to detect GPU encoder from FFmpeg
    try {
        const { execSync } = require('child_process');
        const encoders = execSync('ffmpeg -encoders 2>&1', { timeout: 5000 }).toString();

        // Also detect actual GPU
        let gpuName = '';
        try {
            const gpuResult = execSync('wmic path win32_VideoController get name /value', { timeout: 3000 }).toString();
            const match = gpuResult.match(/Name=(.+)/);
            if (match) gpuName = match[1].trim().toLowerCase();
        } catch (e) { /* ignore */ }

        // Match GPU to encoder
        if ((gpuName.includes('nvidia') || gpuName.includes('geforce') || gpuName.includes('rtx') || gpuName.includes('gtx'))
            && encoders.includes('h264_nvenc')) {
            console.log(`[Render] Auto-detected NVIDIA GPU (${gpuName}) → using h264_nvenc`);
            return { encoder: 'h264_nvenc', encoderArgs: ['-preset', 'p4', '-tune', 'hq'] };
        }
        if ((gpuName.includes('amd') || gpuName.includes('radeon'))
            && encoders.includes('h264_amf')) {
            console.log(`[Render] Auto-detected AMD GPU (${gpuName}) → using h264_amf`);
            return { encoder: 'h264_amf', encoderArgs: ['-quality', 'balanced'] };
        }
        if ((gpuName.includes('intel') || gpuName.includes('uhd') || gpuName.includes('iris'))
            && encoders.includes('h264_qsv')) {
            console.log(`[Render] Auto-detected Intel GPU (${gpuName}) → using h264_qsv`);
            return { encoder: 'h264_qsv', encoderArgs: ['-preset', 'medium'] };
        }
    } catch (e) {
        console.warn('[Render] GPU auto-detection failed:', e.message);
    }

    // Final fallback to CPU
    console.log('[Render] No GPU detected, using CPU encoder (libx264)');
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

    // Multi-segment approach for color gradient:
    // Split bar into N segments, each a different color from start→mid→end
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

    // sql.js can return TEXT columns as Uint8Array for large data — convert to string
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

    // Subtitle delay offset (seconds) to compensate for FFmpeg seeking imprecision.
    // Positive = subtitles appear later (fixes "subtitles too early" issue)
    const SUBTITLE_DELAY = 0.5;

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

        // STEP 4: Generate ASS Dialogue events — one per word, showing full chunk text
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
 * Build FFmpeg subtitle filter string for ASS file
 * Handles Windows path escaping for FFmpeg
 */
function buildSubtitleFilter(assPath) {
    // FFmpeg ass filter path escaping on Windows:
    // Convert backslashes to forward slashes and escape colons
    const escapePath = (p) => p
        .replace(/\\/g, '/')
        .replace(/'/g, "'\\''")
        .replace(/:/g, '\\:');

    const escapedPath = escapePath(assPath);

    // Add fontsdir so FFmpeg can find user-installed fonts (like Montserrat)
    const os = require('os');
    const userFontsDir = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts');
    const systemFontsDir = 'C:\\Windows\\Fonts';

    // Use the user fonts dir if it exists (Google Fonts are installed there)
    const fontsDir = fs.existsSync(userFontsDir) ? userFontsDir : systemFontsDir;
    const escapedFontsDir = escapePath(fontsDir);

    return `ass='${escapedPath}':fontsdir='${escapedFontsDir}'`;
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
