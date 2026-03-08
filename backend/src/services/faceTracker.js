/**
 * ClipperSkuy — FFmpeg-based Face Tracker (v2)
 * 
 * Improved face detection using FFmpeg signalstats + grid analysis:
 * 1. Extract sample frames from clip segment
 * 2. Split each frame into grid regions
 * 3. Analyze brightness, saturation, and edge density per region
 * 4. Score regions by skin-tone and face likelihood heuristics
 * 5. Generate smooth crop coordinates following the best region
 * 
 * No Python, no TensorFlow, no native modules needed.
 * Pure FFmpeg — guaranteed to work in packaged Electron apps.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');
const fs = require('fs-extra');

const SAMPLE_RATE = 2;  // Sample every N seconds (2s = fewer frames, faster for long videos)
const SMOOTH_WINDOW = 5; // Smooth over N frames
const GRID_COLS = 4;     // Split frame into 4 columns
const GRID_ROWS = 3;     // Split frame into 3 rows
const FRAME_EXTRACT_TIMEOUT = 45000; // 45s max per frame extraction (AV1 can be slow)

/**
 * Extract sample frames from a specific segment of a video
 */
async function extractSampleFrames(videoPath, outputDir, fps = 1 / SAMPLE_RATE, startTime = 0, clipDuration = 0) {
    fs.ensureDirSync(outputDir);

    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

    // Fast I-frame only seeking for long videos (especially AV1 from YouTube).
    // -skip_frame noref: skip non-reference frames during seeking (decode only keyframes)
    // -ss before -i: fast input seek (jumps to nearest keyframe, no decode)
    // This makes seeking to minute 29+ feasible without decoding 40k frames.
    const sampleDur = clipDuration > 0 ? Math.min(clipDuration, 8) : 8;
    let cmd = `"${ffmpegPath}" -skip_frame noref -ss ${startTime} -i "${videoPath}" -t ${sampleDur}`;
    // Lower resolution for faster analysis: scale to max 480px wide
    cmd += ` -vf "fps=${fps},scale=480:-2" -q:v 6 -y "${path.join(outputDir, 'frame_%04d.jpg')}"`;
    console.log(`[FaceTracker] Extracting frames (fast I-frame seek): start=${startTime}s, dur=${sampleDur}s`);

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            console.error('[FaceTracker] Frame extraction timed out — returning empty');
            resolve([]);
        }, FRAME_EXTRACT_TIMEOUT);

        exec(cmd, { timeout: FRAME_EXTRACT_TIMEOUT + 5000 }, (err) => {
            clearTimeout(timer);
            if (err) {
                console.error(`[FaceTracker] Frame extraction err:`, err.message.substring(0, 150));
            }
            const files = (fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : [])
                .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
                .sort()
                .map(f => path.join(outputDir, f));
            console.log(`[FaceTracker] Got ${files.length} frames`);
            resolve(files);
        });
    });
}


/**
 * Analyze a specific region of an image for face-likelihood metrics.
 * Uses FFmpeg signalstats to compute brightness (YAVG), saturation (UAVG/VAVG).
 * Face regions tend to have: moderate-high brightness, specific saturation range (skin tones).
 * 
 * @param {string} imagePath - Path to the image
 * @param {number} x - Region X offset
 * @param {number} y - Region Y offset
 * @param {number} w - Region width  
 * @param {number} h - Region height
 * @returns {{ yavg: number, uavg: number, vavg: number, score: number }}
 */
/**
 * Analyze a specific region of an image for face-likelihood metrics.
 * Uses FFmpeg signalstats to compute brightness (YAVG), saturation (UAVG/VAVG).
 * @returns {{ yavg, uavg, vavg, score }}
 */
async function analyzeRegion(imagePath, x, y, w, h) {
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    try {
        const cmd = `"${ffmpegPath}" -i "${imagePath}" -vf "crop=${w}:${h}:${x}:${y},signalstats=stat=tout+vrep+brng" -f null -frames:v 1 - 2>&1`;
        const { stdout, stderr } = await execAsync(cmd, { timeout: 8000 });
        const output = (stderr || '') + (stdout || '');
        const yavg = parseFloat((output.match(/YAVG:\s*([\d.]+)/) || [])[1] || '128');
        const uavg = parseFloat((output.match(/UAVG:\s*([\d.]+)/) || [])[1] || '128');
        const vavg = parseFloat((output.match(/VAVG:\s*([\d.]+)/) || [])[1] || '128');
        const ydif = parseFloat((output.match(/YDIF:\s*([\d.]+)/) || [])[1] || '0');
        let score = 0;

        // Expanded skin tone range for various skin tones (light to dark/sawo matang):
        // YCbCr skin: Cb(U) ~77-127, Cr(V) ~133-173 (wider range for darker skin)
        const skinU = (uavg >= 80 && uavg <= 155);   // Cb: wider range
        const skinV = (vavg >= 120 && vavg <= 185);   // Cr: wider range
        const validBrightness = (yavg >= 40 && yavg <= 240);

        if (skinU && skinV && validBrightness) score += 50;
        else if ((skinU || skinV) && validBrightness) score += 20;

        // Moderate brightness bonus (avoid pure white walls/windows = yavg > 230)
        if (yavg >= 70 && yavg <= 210) score += 20;
        else if (yavg >= 40 && yavg < 70) score += 10;

        // Edge/texture bonus (faces have more texture than flat backgrounds)
        if (ydif > 5 && ydif < 50) score += 15;
        else if (ydif > 2) score += 5;

        return { yavg, uavg, vavg, ydif, score };
    } catch (e) {
        return { yavg: 128, uavg: 128, vavg: 128, ydif: 0, score: 0 };
    }
}

/**
 * Fast single-call frame analysis: splits frame into N columns and analyzes all via one FFmpeg
 * Returns array of YUV stats per column. MUCH faster than N separate analyzeRegion calls.
 */
async function analyzeFrameColumns(imagePath, numCols = 4) {
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
    try {
        // Get dimensions first
        const { stdout: pOut } = await execAsync(`"${ffprobePath}" -v quiet -print_format json -show_streams "${imagePath}"`, { timeout: 5000 });
        const pData = JSON.parse(pOut);
        const stream = pData.streams.find(s => s.codec_type === 'video');
        if (!stream) return [];
        const imgW = stream.width, imgH = stream.height;
        const colW = Math.floor(imgW / numCols);

        // Build filter_complex: split into N columns and get signalstats for each
        // Each signalstats output goes to metadata logs in stderr
        const splits = [];
        for (let i = 0; i < numCols; i++) {
            const x = i * colW;
            const w = (i === numCols - 1) ? (imgW - x) : colW;
            // Upper 2/3 of frame (lower third is table/desk, reduces noise)
            const h = Math.floor(imgH * 0.67);
            splits.push(`[s${i}]crop=${w}:${h}:${x}:0,signalstats=stat=tout+vrep+brng[cs${i}]`);
        }

        const inputSplit = `[0:v]split=${numCols}` + Array.from({ length: numCols }, (_, i) => `[s${i}]`).join('') + ';';
        const filterStr = inputSplit + splits.join(';');
        // Map all outputs to null sinks
        const maps = Array.from({ length: numCols }, (_, i) => `-map [cs${i}]`).join(' ');
        const cmd = `"${ffmpegPath}" -i "${imagePath}" -filter_complex "${filterStr}" ${maps} -f null -frames:v 1 - 2>&1`;

        const { stdout, stderr } = await execAsync(cmd, { timeout: 10000 });
        const output = (stderr || '') + (stdout || '');

        // Parse per-column stats — signalstats outputs sequentially per stream
        // Each stream outputs: lavfi.signalstats.YAVG / UAVG / VAVG
        const colResults = [];
        const yMatches = [...output.matchAll(/YAVG[=:]\s*([\d.]+)/g)];
        const uMatches = [...output.matchAll(/UAVG[=:]\s*([\d.]+)/g)];
        const vMatches = [...output.matchAll(/VAVG[=:]\s*([\d.]+)/g)];

        for (let i = 0; i < numCols; i++) {
            const yavg = parseFloat((yMatches[i] || [])[1] || '128');
            const uavg = parseFloat((uMatches[i] || [])[1] || '128');
            const vavg = parseFloat((vMatches[i] || [])[1] || '128');
            const skinU = (uavg >= 95 && uavg <= 150), skinV = (vavg >= 125 && vavg <= 180);
            const valid = (yavg >= 50 && yavg <= 240);
            let score = 0;
            if (skinU && skinV && valid) score += 50;
            else if (skinU || skinV) score += 15;
            if (yavg >= 80 && yavg <= 200) score += 20; else if (yavg >= 50) score += 10;
            colResults.push({ col: i, x: i * colW, w: colW, score, yavg, uavg, vavg });
        }
        return colResults;
    } catch (e) {
        console.warn('[FaceAnalysis] analyzeFrameColumns error:', e.message.substring(0, 80));
        return [];
    }
}

/**
 * Detect the primary face/person region in a frame using grid analysis.
 * Splits the frame into a grid, analyzes each cell, and finds the best candidate.
 * 
 * @param {string} imagePath - Path to frame image
 * @returns {{ x: number, y: number, w: number, h: number, confidence: number } | null}
 */
async function detectROI(imagePath) {
    const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';

    try {
        // Get image dimensions
        const probeCmd = `"${ffprobePath}" -v quiet -print_format json -show_streams "${imagePath}"`;
        const { stdout: probeOut } = await execAsync(probeCmd, { timeout: 5000 });
        const probeData = JSON.parse(probeOut);
        const stream = probeData.streams.find(s => s.codec_type === 'video');
        if (!stream) return null;

        const imgW = stream.width;
        const imgH = stream.height;

        const cellW = Math.floor(imgW / GRID_COLS);
        const cellH = Math.floor(imgH / GRID_ROWS);

        // Analyze each grid cell in parallel (max 12 cells = fast)
        const regionPromises = [];
        for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
                const rx = col * cellW;
                const ry = row * cellH;
                const rw = (col === GRID_COLS - 1) ? imgW - rx : cellW;
                const rh = (row === GRID_ROWS - 1) ? imgH - ry : cellH;

                regionPromises.push(
                    analyzeRegion(imagePath, rx, ry, rw, rh).then(result => ({
                        ...result,
                        col, row,
                        cx: rx + rw / 2,  // center X
                        cy: ry + rh / 2,  // center Y
                        rx, ry, rw, rh
                    }))
                );
            }
        }

        const regions = await Promise.all(regionPromises);

        // Apply position bias: faces are typically in the upper 2/3
        for (const r of regions) {
            // Vertical bias: prefer upper-mid rows (row 1 most likely has face/torso)
            if (r.row === 0) r.score += 8;   // Top: might have face
            else if (r.row === 1) r.score += 12; // Mid: most likely face/body
            // Row 2 (bottom) usually has desks/hands/legs — small bonus

            // Horizontal bias: VERY small center bonus, don't penalize sides
            // People sit anywhere (left, center, right) in podcast/interview settings
            if (r.col === 1 || r.col === 2) r.score += 2; // tiny center preference
        }

        // Sort by score descending
        regions.sort((a, b) => b.score - a.score);

        const best = regions[0];

        if (best.score < 20) {
            // No convincing face region found
            console.log(`[FaceTracker] Low confidence: best score=${best.score} at (${best.col},${best.row})`);
            // Fallback: center-biased upper region  
            return {
                x: imgW / 2,
                y: imgH * 0.38,
                w: Math.round(imgW * 0.4),
                h: Math.round(imgH * 0.5),
                confidence: 0.2
            };
        }

        // Find cluster of high-scoring adjacent cells to get better center
        const topRegions = regions.filter(r => r.score >= best.score * 0.6);
        let weightedX = 0, weightedY = 0, totalScore = 0;
        for (const r of topRegions) {
            weightedX += r.cx * r.score;
            weightedY += r.cy * r.score;
            totalScore += r.score;
        }

        const faceX = weightedX / totalScore;
        const faceY = weightedY / totalScore;
        const confidence = Math.min(1.0, best.score / 80);

        console.log(`[FaceTracker] Best region: score=${best.score} pos=(${Math.round(faceX)},${Math.round(faceY)}) confidence=${confidence.toFixed(2)} topCells=${topRegions.length}`);

        return {
            x: Math.round(faceX),
            y: Math.round(faceY),
            w: Math.round(imgW * 0.3),
            h: Math.round(imgH * 0.4),
            confidence
        };
    } catch (e) {
        console.error(`[FaceTracker] detectROI error: ${e.message}`);
        return null;
    }
}

/**
 * Smooth face positions across frames to avoid jittery cropping.
 * Uses weighted moving average with confidence-based weighting.
 */
function smoothPositions(positions) {
    if (positions.length <= 1) return positions;

    const smoothed = [];
    for (let i = 0; i < positions.length; i++) {
        const windowStart = Math.max(0, i - Math.floor(SMOOTH_WINDOW / 2));
        const windowEnd = Math.min(positions.length - 1, i + Math.floor(SMOOTH_WINDOW / 2));

        let sumX = 0, sumY = 0, totalWeight = 0;

        for (let j = windowStart; j <= windowEnd; j++) {
            const dist = Math.abs(j - i);
            // Higher weight for closer frames and higher confidence detections
            const weight = (1 / (1 + dist * 0.5)) * (positions[j].confidence || 0.5);
            sumX += positions[j].x * weight;
            sumY += positions[j].y * weight;
            totalWeight += weight;
        }

        smoothed.push({
            ...positions[i],
            x: Math.round(sumX / totalWeight),
            y: Math.round(sumY / totalWeight)
        });
    }

    // Second pass: clamp large jumps (prevent sudden teleportation)
    for (let i = 1; i < smoothed.length; i++) {
        const prev = smoothed[i - 1];
        const curr = smoothed[i];
        const maxJumpX = 200; // max pixels jump per sample
        const maxJumpY = 150;

        if (Math.abs(curr.x - prev.x) > maxJumpX) {
            curr.x = prev.x + Math.sign(curr.x - prev.x) * maxJumpX;
        }
        if (Math.abs(curr.y - prev.y) > maxJumpY) {
            curr.y = prev.y + Math.sign(curr.y - prev.y) * maxJumpY;
        }
    }

    return smoothed;
}

/**
 * Generate face-aware crop coordinates for a video clip
 * 
 * @param {string} videoPath - Source video path
 * @param {number} targetW - Target width (e.g., 1080)
 * @param {number} targetH - Target height (e.g., 1920)
 * @param {number} duration - Clip duration in seconds
 * @param {number} startTime - Clip start position in source video
 * @returns {{ positions: Array, cropFilter: string }}
 */
async function generateFaceTrackCrop(videoPath, targetW, targetH, duration, startTime = 0) {
    const tempDir = path.join(path.dirname(videoPath), '_face_frames_' + Date.now());

    try {
        console.log(`[FaceTracker] Starting face tracking: start=${startTime}s, duration=${duration}s`);
        const frames = await extractSampleFrames(videoPath, tempDir, 1 / SAMPLE_RATE, startTime, duration);

        if (frames.length === 0) {
            console.log('[FaceTracker] No frames extracted, using center crop');
            return { positions: [], cropFilter: null };
        }

        console.log(`[FaceTracker] Analyzing ${frames.length} frames with grid-based detection...`);

        // Detect face region in each frame
        const rawPositions = [];
        for (let i = 0; i < frames.length; i++) {
            const region = await detectROI(frames[i]);
            if (region && region.confidence > 0.15) {
                rawPositions.push({
                    time: i * SAMPLE_RATE,
                    ...region
                });
            } else {
                console.log(`[FaceTracker] Frame ${i}: skipped (low confidence or null)`);
            }
        }

        if (rawPositions.length === 0) {
            console.log('[FaceTracker] No face regions detected in any frame, using center crop');
            return { positions: [], cropFilter: null };
        }

        console.log(`[FaceTracker] Detected faces in ${rawPositions.length}/${frames.length} frames`);

        // Fill gaps: if a frame has no detection, interpolate from neighbors
        const allPositions = [];
        for (let i = 0; i < frames.length; i++) {
            const existing = rawPositions.find(p => p.time === i * SAMPLE_RATE);
            if (existing) {
                allPositions.push(existing);
            } else if (rawPositions.length > 0) {
                // Interpolate from nearest detected positions
                let before = null, after = null;
                for (const p of rawPositions) {
                    if (p.time <= i * SAMPLE_RATE) before = p;
                    if (p.time > i * SAMPLE_RATE && !after) after = p;
                }
                const ref = before || after;
                if (ref) {
                    allPositions.push({
                        time: i * SAMPLE_RATE,
                        x: ref.x,
                        y: ref.y,
                        w: ref.w,
                        h: ref.h,
                        confidence: ref.confidence * 0.5 // lower confidence for interpolated
                    });
                }
            }
        }

        // Smooth positions
        const smoothed = smoothPositions(allPositions.length > 0 ? allPositions : rawPositions);

        console.log(`[FaceTracker] Smoothed ${smoothed.length} positions, generating crop filter...`);

        // Get source video dimensions
        const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
        const probeCmd = `"${ffprobePath}" -v quiet -print_format json -show_streams "${videoPath}"`;
        const { stdout: probeOut } = await execAsync(probeCmd, { timeout: 10000 });
        const probeData = JSON.parse(probeOut);
        const videoStream = probeData.streams.find(s => s.codec_type === 'video');
        const srcW = videoStream.width;
        const srcH = videoStream.height;

        // Calculate the crop region size (maintains target aspect ratio)
        const targetAR = targetW / targetH;

        let cropW, cropH;
        if (targetAR < srcW / srcH) {
            // Target is taller (e.g., 9:16 from 16:9) — crop width
            cropH = srcH;
            cropW = Math.round(srcH * targetAR);
        } else {
            // Target is wider — crop height
            cropW = srcW;
            cropH = Math.round(srcW / targetAR);
        }

        // Clamp crop to valid range
        cropW = Math.min(cropW, srcW);
        cropH = Math.min(cropH, srcH);
        // Ensure even dimensions
        cropW = cropW % 2 === 0 ? cropW : cropW - 1;
        cropH = cropH % 2 === 0 ? cropH : cropH - 1;

        console.log(`[FaceTracker] Source: ${srcW}x${srcH}, Crop: ${cropW}x${cropH}, Target: ${targetW}x${targetH}`);

        // If only 1 position, use static crop
        if (smoothed.length <= 1) {
            const pos = smoothed[0];
            const cropX = clamp(pos.x - cropW / 2, 0, srcW - cropW);
            const cropY = clamp(pos.y - cropH / 2, 0, srcH - cropH);
            console.log(`[FaceTracker] Static crop at (${Math.round(cropX)}, ${Math.round(cropY)})`);
            return {
                positions: smoothed,
                cropFilter: `crop=${cropW}:${cropH}:${Math.round(cropX)}:${Math.round(cropY)},scale=${targetW}:${targetH}:flags=lanczos`
            };
        }

        // For multiple positions, use expression-based dynamic crop
        if (smoothed.length >= 3) {
            const xExpr = buildInterpolationExpr(smoothed, 'x', srcW, cropW);
            const yExpr = buildInterpolationExpr(smoothed, 'y', srcH, cropH);
            console.log(`[FaceTracker] Dynamic crop with ${smoothed.length} keyframes`);
            return {
                positions: smoothed,
                cropFilter: `crop=${cropW}:${cropH}:${xExpr}:${yExpr},scale=${targetW}:${targetH}:flags=lanczos`
            };
        }

        // Fallback: average position
        const avgX = smoothed.reduce((sum, p) => sum + p.x, 0) / smoothed.length;
        const avgY = smoothed.reduce((sum, p) => sum + p.y, 0) / smoothed.length;
        const cropX = clamp(avgX - cropW / 2, 0, srcW - cropW);
        const cropY = clamp(avgY - cropH / 2, 0, srcH - cropH);

        console.log(`[FaceTracker] Average crop at (${Math.round(cropX)}, ${Math.round(cropY)})`);
        return {
            positions: smoothed,
            cropFilter: `crop=${cropW}:${cropH}:${Math.round(cropX)}:${Math.round(cropY)},scale=${targetW}:${targetH}:flags=lanczos`
        };

    } finally {
        // Cleanup temp frames
        try { fs.removeSync(tempDir); } catch (e) { /* ignore cleanup errors */ }
    }
}

/**
 * Build an FFmpeg expression that linearly interpolates between keyframe positions.
 */
function buildInterpolationExpr(positions, axis, srcSize, cropSize) {
    const clampedPositions = positions.map(p => ({
        time: p.time,
        value: clamp(p[axis] - cropSize / 2, 0, srcSize - cropSize)
    }));

    if (clampedPositions.length === 1) {
        return Math.round(clampedPositions[0].value).toString();
    }

    const parts = [];
    for (let i = 0; i < clampedPositions.length - 1; i++) {
        const t0 = clampedPositions[i].time;
        const t1 = clampedPositions[i + 1].time;
        const v0 = Math.round(clampedPositions[i].value);
        const v1 = Math.round(clampedPositions[i + 1].value);

        if (t1 === t0) continue;

        const progress = `(t-${t0})/${t1 - t0}`;
        const lerp = `${v0}+(${v1 - v0})*${progress}`;
        parts.push(`if(between(t\\\\,${t0}\\\\,${t1})\\\\,${lerp}`);
    }

    if (parts.length === 0) {
        return Math.round(clampedPositions[0].value).toString();
    }

    const lastVal = Math.round(clampedPositions[clampedPositions.length - 1].value);
    let expr = lastVal.toString();

    for (let i = parts.length - 1; i >= 0; i--) {
        expr = `${parts[i]}\\\\,${expr})`;
    }

    return `'${expr}'`;
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

/**
 * Detect face COUNT in a frame using cluster analysis on the full grid.
 * Instead of splitting into halves (which falsely detects 1 person as 2),
 * we analyze the full grid, find high-scoring clusters, and determine
 * if there are 1 or 2 separate face regions based on column gaps.
 */
async function detectMultipleFaces(imagePath) {
    const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';

    try {
        // Get image dimensions
        const probeCmd = `"${ffprobePath}" -v quiet -print_format json -show_streams "${imagePath}"`;
        const { stdout: probeOut } = await execAsync(probeCmd, { timeout: 5000 });
        const probeData = JSON.parse(probeOut);
        const stream = probeData.streams.find(s => s.codec_type === 'video');
        if (!stream) return [];

        const imgW = stream.width;
        const imgH = stream.height;

        // Use a wider grid for better face detection: 6 columns x 3 rows
        const cols = 6;
        const rows = 3;
        const cellW = Math.floor(imgW / cols);
        const cellH = Math.floor(imgH / rows);

        // Analyze each grid cell
        const regionPromises = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const rx = col * cellW;
                const ry = row * cellH;
                const rw = (col === cols - 1) ? imgW - rx : cellW;
                const rh = (row === rows - 1) ? imgH - ry : cellH;

                regionPromises.push(
                    analyzeRegion(imagePath, rx, ry, rw, rh).then(result => ({
                        ...result,
                        col, row,
                        cx: rx + rw / 2,
                        cy: ry + rh / 2,
                    }))
                );
            }
        }

        const regions = await Promise.all(regionPromises);

        // Apply position bias (faces typically upper 2/3)
        for (const r of regions) {
            if (r.row === 0) r.score += 10;
            else if (r.row === 1) r.score += 5;
        }

        // Find cells with strong face-likelihood scores
        const faceThreshold = 40;
        let faceCells = regions.filter(r => r.score >= faceThreshold);

        if (faceCells.length === 0) {
            // Try lower threshold
            const weakCells = regions.filter(r => r.score >= 25);
            if (weakCells.length > 0) {
                const best = weakCells.sort((a, b) => b.score - a.score)[0];
                return [{
                    x: best.cx, y: best.cy,
                    w: cellW, h: cellH,
                    side: best.col < cols / 2 ? 'left' : 'right',
                    srcX: best.cx, srcY: best.cy
                }];
            }
            return [];
        }

        // Cluster face cells by column proximity
        faceCells.sort((a, b) => a.col - b.col);

        const clusters = [];
        let currentCluster = [faceCells[0]];

        for (let i = 1; i < faceCells.length; i++) {
            // Column gap >= 2 means separate person
            if (faceCells[i].col - faceCells[i - 1].col >= 2) {
                clusters.push(currentCluster);
                currentCluster = [faceCells[i]];
            } else {
                currentCluster.push(faceCells[i]);
            }
        }
        clusters.push(currentCluster);

        console.log(`[Podcast] Grid: ${faceCells.length} face cells -> ${clusters.length} cluster(s), cols: [${clusters.map(c => c.map(r => r.col).join(',')).join(' | ')}]`);

        // Convert clusters to face regions
        const faces = clusters.map(cluster => {
            const totalScore = cluster.reduce((s, c) => s + c.score, 0);
            const cx = cluster.reduce((s, c) => s + c.cx * c.score, 0) / totalScore;
            const cy = cluster.reduce((s, c) => s + c.cy * c.score, 0) / totalScore;
            const avgCol = cluster.reduce((s, c) => s + c.col, 0) / cluster.length;

            return {
                x: Math.round(cx), y: Math.round(cy),
                w: cellW * cluster.length, h: cellH * 2,
                side: avgCol < cols / 2 ? 'left' : 'right',
                srcX: Math.round(cx), srcY: Math.round(cy),
                score: totalScore, cellCount: cluster.length
            };
        });

        // If 2+ clusters, verify they are far enough apart (>25% of frame width)
        if (faces.length >= 2) {
            const dist = Math.abs(faces[0].srcX - faces[1].srcX);
            // If faces are closer than 20% frame width, treat as 1 person
            if (dist < imgW * 0.20) {
                console.log(`[Podcast] Clusters too close (${Math.round(dist)}px) -> 1 person`);
                const merged = {
                    x: Math.round((faces[0].srcX + faces[1].srcX) / 2),
                    y: Math.round((faces[0].srcY + faces[1].srcY) / 2),
                    w: faces[0].w + faces[1].w, h: Math.max(faces[0].h, faces[1].h),
                    side: 'center',
                    srcX: Math.round((faces[0].srcX + faces[1].srcX) / 2),
                    srcY: Math.round((faces[0].srcY + faces[1].srcY) / 2),
                };
                return [merged];
            }
            console.log(`[Podcast] 2 clusters: dist=${Math.round(dist)}px (${Math.round(dist / imgW * 100)}%) -> 2 people`);
        }

        return faces.slice(0, 2);
    } catch (e) {
        console.error(`[Podcast] detectMultipleFaces error: ${e.message}`);
        return [];
    }
}

/**
 * Generate podcast-style crop for video with 1 or 2 speakers.
 * - 2 faces: Split screen (top + bottom), each zoomed to a speaker
 * - 1 face: Full frame zoom on that speaker
 * - 0 faces: Fallback to center crop
 * 
 * @returns {{ mode: 'single'|'split'|'center', cropFilter: string, faceCount: number }}
 */
async function generatePodcastCrop(videoPath, targetW, targetH, duration, startTime = 0) {
    const tempDir = path.join(path.dirname(videoPath), '_podcast_frames_' + Date.now());

    try {
        console.log(`[Podcast] Generating split for: start=${startTime}s, duration=${duration}s`);

        // Get source video dimensions
        const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
        const probeCmd = `"${ffprobePath}" -v quiet -print_format json -show_streams "${videoPath}"`;
        const { stdout: probeOut } = await execAsync(probeCmd, { timeout: 10000 });
        const probeData = JSON.parse(probeOut);
        const videoStream = probeData.streams.find(s => s.codec_type === 'video');
        if (!videoStream) {
            console.log('[Podcast] Cannot probe video → center crop fallback');
            return { mode: 'center', cropFilter: null, faceCount: 0 };
        }
        const srcW = videoStream.width;
        const srcH = videoStream.height;
        console.log(`[Podcast] Source: ${srcW}x${srcH}`);

        // ─── Helper: build split screen filter ─────────────────────────────────
        const buildSplitFilter = (leftCenterX, rightCenterX) => {
            const sepH = 4;
            const halfH = Math.floor((targetH - sepH) / 2);
            const panelH = halfH % 2 === 0 ? halfH : halfH - 1;
            const pAR = targetW / panelH;

            const buildPanelCrop = (centerX, label) => {
                let cropW = Math.round(srcH * pAR);
                let cropH = srcH;
                if (cropW > srcW / 2) {
                    cropW = Math.floor(srcW / 2);
                    cropW = cropW % 2 === 0 ? cropW : cropW - 1;
                    cropH = Math.round(cropW / pAR);
                    cropH = cropH % 2 === 0 ? cropH : cropH - 1;
                }
                cropW = cropW % 2 === 0 ? cropW : cropW - 1;
                cropH = cropH % 2 === 0 ? cropH : cropH - 1;
                const cropX = clamp(Math.round(centerX - cropW / 2), 0, srcW - cropW);
                console.log(`[Podcast] ${label}: centerX=${Math.round(centerX)} → crop=${cropW}x${cropH}@${cropX},0`);
                return { cropW, cropH, cropX };
            };

            const lc = buildPanelCrop(leftCenterX, 'LEFT→top');
            const rc = buildPanelCrop(rightCenterX, 'RIGHT→bottom');

            return [
                `[0:v]split=3[psva][psvb][psvsep]`,
                `[psva]crop=${lc.cropW}:${lc.cropH}:${lc.cropX}:0,scale=${targetW}:${panelH}:flags=lanczos[ptop]`,
                `[psvb]crop=${rc.cropW}:${rc.cropH}:${rc.cropX}:0,scale=${targetW}:${panelH}:flags=lanczos[pbottom]`,
                `[psvsep]crop=${targetW}:${sepH}:0:0,drawbox=x=0:y=0:w=${targetW}:h=${sepH}:color=0x1a1a2e:t=fill[psline]`,
                `[ptop][psline][pbottom]vstack=inputs=3`
            ].join(';');
        };

        // ─── Step 1: Face detection voting on sample frames ─────────────────────
        let votes1 = 0, votes2 = 0;
        let bestSingleFace = null;
        let best2FaceLeft = null, best2FaceRight = null;

        try {
            // Sample ONLY a few frames from the start of the clip for speaker detection.
            // Cap at 8 seconds max sampling — just enough to determine 1 vs 2 speakers.
            const sampleDuration = Math.min(duration, 8);
            const frames = await extractSampleFrames(videoPath, tempDir, 0.5, startTime, sampleDuration);

            // Sample up to 5 evenly-spread frames
            const step = Math.max(1, Math.floor(frames.length / 5));
            const sampleFrames = [];
            for (let i = 0; i < frames.length && sampleFrames.length < 5; i += step) {
                sampleFrames.push(frames[i]);
            }

            for (const frame of sampleFrames) {
                // Use fast single-call column analysis (1 FFmpeg call per frame instead of 12)
                const cols = await analyzeFrameColumns(frame, 4);
                if (cols.length === 0) { console.log(`[Podcast] Vote: 0 faces (no columns)`); continue; }

                // Find high-score columns (skin tone detected)
                const faceCols = cols.filter(c => c.score >= 40);
                const scoreSorted = [...faceCols].sort((a, b) => b.score - a.score);

                if (scoreSorted.length >= 2) {
                    // Check if top 2 cols are far apart (> 1 col gap = 2 people on different sides)
                    const col1 = scoreSorted[0], col2 = scoreSorted[1];
                    const colGap = Math.abs(col1.col - col2.col);
                    const faceCenterX1 = (col1.x + col1.w / 2) * (srcW / 480); // scale back to srcW
                    const faceCenterX2 = (col2.x + col2.w / 2) * (srcW / 480);
                    const dist = Math.abs(faceCenterX1 - faceCenterX2);

                    if (colGap >= 2 && dist > srcW * 0.25) {
                        votes2++;
                        const left = faceCenterX1 < faceCenterX2 ? { srcX: faceCenterX1 } : { srcX: faceCenterX2 };
                        const right = faceCenterX1 < faceCenterX2 ? { srcX: faceCenterX2 } : { srcX: faceCenterX1 };
                        if (!best2FaceLeft) { best2FaceLeft = left; best2FaceRight = right; }
                        console.log(`[Podcast] Vote: 2 people (cols ${col1.col} & ${col2.col}, dist=${Math.round(dist)}px)`);
                    } else {
                        votes1++;
                        if (!bestSingleFace) bestSingleFace = { srcX: (faceCenterX1 + faceCenterX2) / 2, srcY: srcH * 0.33 };
                        console.log(`[Podcast] Vote: 1 person (high cols close together)`);
                    }
                } else if (scoreSorted.length === 1) {
                    votes1++;
                    const faceCenterX = (scoreSorted[0].x + scoreSorted[0].w / 2) * (srcW / 480);
                    if (!bestSingleFace) bestSingleFace = { srcX: faceCenterX, srcY: srcH * 0.33 };
                    console.log(`[Podcast] Vote: 1 person (1 face col)`);
                } else if (faceCols.length === 0) {
                    // Lower threshold fallback
                    const bestCol = [...cols].sort((a, b) => b.score - a.score)[0];
                    if (bestCol && bestCol.score >= 20) {
                        votes1++;
                        const faceCenterX = (bestCol.x + bestCol.w / 2) * (srcW / 480);
                        if (!bestSingleFace) bestSingleFace = { srcX: faceCenterX, srcY: srcH * 0.33 };
                        console.log(`[Podcast] Vote: 1 person (weak signal, score=${bestCol.score})`);
                    } else {
                        console.log(`[Podcast] Vote: 0 faces`);
                    }
                }
            }

        } catch (e) {
            console.log('[Podcast] Face detection error:', e.message.substring(0, 100));
        }

        console.log(`[Podcast] Final vote → 1-person: ${votes1}, 2-people: ${votes2}`);

        // ─── Step 2: Decide mode ────────────────────────────────────────────────

        // ── CASE A: 2 speakers clearly detected ──
        if (votes2 > votes1 && best2FaceLeft && best2FaceRight) {
            console.log(`[Podcast] → MODE: SPLIT SCREEN (2 speakers, face-centered)`);
            return {
                mode: 'split',
                cropFilter: buildSplitFilter(best2FaceLeft.srcX, best2FaceRight.srcX),
                faceCount: 2
            };
        }

        // ── CASE B: 1 speaker detected → static face-centered crop (no dynamic tracking for perf) ──
        if (votes1 > 0 && bestSingleFace) {
            console.log(`[Podcast] → MODE: FACE TRACKING (1 speaker) — static centered`);
            // Use static center crop around detected face (avoids re-extracting all frames).
            // Dynamic face tracking (generateFaceTrackCrop) is too slow for long AV1 videos.
            const tAR = targetW / targetH;
            let cropW = Math.round(srcH * tAR);
            let cropH = srcH;
            if (cropW > srcW) { cropW = srcW; cropH = Math.round(srcW / tAR); }
            cropW = cropW % 2 === 0 ? cropW : cropW - 1;
            cropH = cropH % 2 === 0 ? cropH : cropH - 1;
            // srcX from bestSingleFace is in the scaled-down (480px) frame — scale back up
            const scaleRatioX = srcW / 480;
            const faceX = Math.round((bestSingleFace.srcX || srcW / 2) * scaleRatioX);
            const cropX = clamp(Math.round(faceX - cropW / 2), 0, srcW - cropW);
            const cropY = 0; // podcast: people are at consistent height, keep full height crop
            console.log(`[Podcast] Face at srcX=${Math.round(faceX)}, crop=${cropW}x${cropH}@${cropX}`);
            return {
                mode: 'single',
                cropFilter: `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${targetW}:${targetH}:flags=lanczos`,
                faceCount: 1
            };
        }

        // ── CASE C: 0 faces detected → podcast fallback = geometric 50/50 split ──
        // In podcast mode, 0 detected faces usually means detection failed,
        // NOT that there's no one in frame. Geometric split is better than center crop.
        console.log(`[Podcast] → MODE: GEOMETRIC SPLIT (0 faces, assuming 2-person podcast setup)`);
        return {
            mode: 'split',
            cropFilter: buildSplitFilter(srcW * 0.25, srcW * 0.75),
            faceCount: 0
        };

    } finally {
        try { fs.removeSync(tempDir); } catch (e) { }
    }
}







module.exports = {
    extractSampleFrames,
    detectROI,
    analyzeRegion,
    generateFaceTrackCrop,
    generatePodcastCrop,
    smoothPositions
};
