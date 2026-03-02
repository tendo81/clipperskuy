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

const SAMPLE_RATE = 1;  // Sample every N seconds (was 2, now more frequent for better tracking)
const SMOOTH_WINDOW = 5; // Smooth over N frames (increased for smoother motion)
const GRID_COLS = 4;     // Split frame into 4 columns
const GRID_ROWS = 3;     // Split frame into 3 rows

/**
 * Extract sample frames from a specific segment of a video
 */
async function extractSampleFrames(videoPath, outputDir, fps = 1 / SAMPLE_RATE, startTime = 0, clipDuration = 0) {
    fs.ensureDirSync(outputDir);

    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

    // Hybrid seeking: rough seek + precise seek for frame-accurate extraction
    const roughSeek = Math.max(0, startTime - 2);
    const preciseSeek = Math.min(2, startTime);
    let cmd = `"${ffmpegPath}" -ss ${roughSeek} -i "${videoPath}" -ss ${preciseSeek}`;
    if (clipDuration > 0) {
        cmd += ` -t ${clipDuration}`;
    }
    cmd += ` -vf "fps=${fps}" -q:v 2 -y "${path.join(outputDir, 'frame_%04d.jpg')}"`;
    console.log(`[FaceTracker] Extracting frames: start=${startTime}s, duration=${clipDuration}s`);

    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 60000 }, (err, stdout, stderr) => {
            if (err) {
                console.error(`[FaceTracker] Frame extraction failed:`, err.message);
                if (stderr) console.error(`[FaceTracker] FFmpeg stderr:`, stderr.substring(0, 500));
                return reject(err);
            }
            const files = fs.readdirSync(outputDir)
                .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
                .sort()
                .map(f => path.join(outputDir, f));
            console.log(`[FaceTracker] Extracted ${files.length} frames`);
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
async function analyzeRegion(imagePath, x, y, w, h) {
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    try {
        // Crop region and get signalstats
        const cmd = `"${ffmpegPath}" -i "${imagePath}" -vf "crop=${w}:${h}:${x}:${y},signalstats=stat=tout+vrep+brng" -f null -frames:v 1 - 2>&1`;
        const { stdout, stderr } = await execAsync(cmd, { timeout: 8000 });
        const output = (stderr || '') + (stdout || '');

        // Parse signalstats values
        const yavgMatch = output.match(/YAVG:\s*([\d.]+)/);
        const uavgMatch = output.match(/UAVG:\s*([\d.]+)/);
        const vavgMatch = output.match(/VAVG:\s*([\d.]+)/);
        const ydifMatch = output.match(/YDIF:\s*([\d.]+)/); // activity/edges

        const yavg = yavgMatch ? parseFloat(yavgMatch[1]) : 128;
        const uavg = uavgMatch ? parseFloat(uavgMatch[1]) : 128;
        const vavg = vavgMatch ? parseFloat(vavgMatch[1]) : 128;
        const ydif = ydifMatch ? parseFloat(ydifMatch[1]) : 0;

        // Score the region for face-likelihood
        let score = 0;

        // Skin tone detection in YUV space:
        // Human skin in YUV:  Y: 60-250, U: 100-145, V: 130-175
        // Broader range to account for different skin tones and lighting
        const skinU = (uavg >= 95 && uavg <= 150);
        const skinV = (vavg >= 125 && vavg <= 180);
        const validBrightness = (yavg >= 50 && yavg <= 240);

        if (skinU && skinV && validBrightness) {
            score += 50; // Strong skin-tone match
        } else if (skinU || skinV) {
            score += 15; // Partial match
        }

        // Moderate brightness is better (not too dark, not too bright = washed out)
        if (yavg >= 80 && yavg <= 200) {
            score += 20;
        } else if (yavg >= 50) {
            score += 10;
        }

        // Edge activity (YDIF) — faces have moderate edge density (facial features)
        if (ydif > 5 && ydif < 40) {
            score += 15; // Good edge activity = likely has facial features
        } else if (ydif > 2) {
            score += 5;
        }

        // Faces are usually in the upper 2/3 of the frame — bias towards upper regions
        // (this is handled by the caller when combining with position info)

        return { yavg, uavg, vavg, ydif: ydif || 0, score };
    } catch (e) {
        return { yavg: 128, uavg: 128, vavg: 128, ydif: 0, score: 0 };
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

        // Apply position bias: faces are typically in the upper 2/3 and center columns
        for (const r of regions) {
            // Vertical bias: prefer upper rows (row 0 and 1 are more likely to have faces)
            if (r.row === 0) r.score += 10;
            else if (r.row === 1) r.score += 5;
            // Row 2 (bottom) usually has desks/hands — no bonus

            // Horizontal bias: center columns are more likely
            if (r.col === 1 || r.col === 2) r.score += 5;
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
        console.log(`[Podcast] Detecting speakers: start=${startTime}s, duration=${duration}s`);

        // Extract more sample frames across the clip for better detection
        const sampleDuration = Math.min(duration, 20);
        const frames = await extractSampleFrames(videoPath, tempDir, 0.5, startTime, sampleDuration);

        if (frames.length === 0) {
            console.log('[Podcast] No frames, fallback to center crop');
            return { mode: 'center', cropFilter: null, faceCount: 0 };
        }

        // Analyze multiple frames and vote on face count
        // Sample up to 5 frames evenly spread across the clip
        const sampleFrames = [];
        const step = Math.max(1, Math.floor(frames.length / 5));
        for (let i = 0; i < frames.length && sampleFrames.length < 5; i += step) {
            sampleFrames.push(frames[i]);
        }

        let votes1 = 0, votes2 = 0;
        let bestFaces = [];

        for (const frame of sampleFrames) {
            const detectedFaces = await detectMultipleFaces(frame);

            if (detectedFaces.length >= 2) {
                // Verify these are DIFFERENT people (not same person detected twice)
                const dist = Math.abs(detectedFaces[0].srcX - detectedFaces[1].srcX);
                const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
                const probeCmd = `"${ffprobePath}" -v quiet -print_format json -show_streams "${frame}"`;
                const { stdout: probeOut } = await execAsync(probeCmd, { timeout: 5000 });
                const probeData = JSON.parse(probeOut);
                const stream = probeData.streams.find(s => s.codec_type === 'video');
                const frameW = stream ? stream.width : 1920;

                // If faces are far apart (>30% of frame width), it's genuinely 2 people
                if (dist > frameW * 0.25) {
                    votes2++;
                    if (bestFaces.length < 2) bestFaces = detectedFaces;
                    console.log(`[Podcast] Frame: 2 faces, dist=${Math.round(dist)}px (${Math.round(dist / frameW * 100)}% of width) → 2 people`);
                } else {
                    votes1++;
                    if (bestFaces.length === 0) bestFaces = [detectedFaces[0]];
                    console.log(`[Podcast] Frame: 2 faces, dist=${Math.round(dist)}px (${Math.round(dist / frameW * 100)}% of width) → SAME person`);
                }
            } else if (detectedFaces.length === 1) {
                votes1++;
                if (bestFaces.length === 0) bestFaces = detectedFaces;
            }
        }

        const isSplit = votes2 > votes1;
        const faceCount = isSplit ? 2 : (bestFaces.length > 0 ? 1 : 0);
        const faces = isSplit ? bestFaces.slice(0, 2) : bestFaces.slice(0, 1);

        console.log(`[Podcast] Vote result: 1-person=${votes1}, 2-people=${votes2} → ${isSplit ? 'SPLIT' : 'SINGLE'} (${faceCount} face(s))`);

        // Get source video dimensions
        const ffprobePath2 = process.env.FFPROBE_PATH || 'ffprobe';
        const probeCmd2 = `"${ffprobePath2}" -v quiet -print_format json -show_streams "${videoPath}"`;
        const { stdout: probeOut2 } = await execAsync(probeCmd2, { timeout: 10000 });
        const probeData2 = JSON.parse(probeOut2);
        const videoStream = probeData2.streams.find(s => s.codec_type === 'video');
        const srcW = videoStream.width;
        const srcH = videoStream.height;

        if (faces.length >= 2) {
            // 2 faces: split screen top/bottom — each face gets half the output height.
            // We do a TIGHT portrait crop around each person's face+head area.
            const sepH = 4;
            const halfH = Math.floor((targetH - sepH) / 2);
            const panelH = halfH % 2 === 0 ? halfH : halfH - 1;
            // Panel aspect ratio = targetW / panelH
            const targetAR = targetW / panelH;

            // Sort faces by X position: left person goes to top, right person goes to bottom
            const sortedFaces = [...faces].sort((a, b) => a.srcX - b.srcX);

            // Zoom level: 1.5 = tight face zoom
            const zoomLevels = [1.5, 1.5];

            const crops = sortedFaces.map((face, i) => {
                const zoom = zoomLevels[i] || 1.5;
                let cropW, cropH;
                // Always crop by width (we have 16:9 source, target panel is narrow portrait)
                cropW = Math.round(srcW / zoom);
                cropH = Math.round(cropW / targetAR);

                cropW = Math.min(cropW, srcW);
                cropH = Math.min(cropH, srcH);
                cropW = cropW % 2 === 0 ? cropW : cropW - 1;
                cropH = cropH % 2 === 0 ? cropH : cropH - 1;

                const cropX = clamp(Math.round(face.srcX - cropW / 2), 0, srcW - cropW);
                // Shift upward aggressively: YUV heuristic scores shoulder/chest area
                // Pull up by 30% of srcH to get head+face into frame
                const faceYBiased = face.srcY - Math.round(srcH * 0.30);
                const cropY = clamp(Math.round(faceYBiased - cropH / 2), 0, srcH - cropH);

                return { cropW, cropH, cropX, cropY, zoom };
            });

            // Separator: thin dark line between panels
            const filter = [
                `[0:v]split=3[pa][pb][sep]`,
                `[pa]crop=${crops[0].cropW}:${crops[0].cropH}:${crops[0].cropX}:${crops[0].cropY},scale=${targetW}:${panelH}:flags=lanczos[ptop]`,
                `[pb]crop=${crops[1].cropW}:${crops[1].cropH}:${crops[1].cropX}:${crops[1].cropY},scale=${targetW}:${panelH}:flags=lanczos[pbottom]`,
                `[sep]crop=${targetW}:${sepH}:0:0,drawbox=x=0:y=0:w=${targetW}:h=${sepH}:color=0x1a1a2e:t=fill[line]`,
                `[ptop][line][pbottom]vstack=inputs=3`
            ].join(';');

            console.log(`[Podcast] 2-speaker split: top=${sortedFaces[0].side}(zoom=${crops[0].zoom}) + bottom=${sortedFaces[1].side}(zoom=${crops[1].zoom}), sep=${sepH}px`);
            return { mode: 'split', cropFilter: filter, faceCount: 2 };
        }

        if (faces.length === 1) {
            // 1 face: use FULL face tracking (dynamic crop following the speaker)
            console.log(`[Podcast] 1-speaker detected → using full face tracking`);
            const ftResult = await generateFaceTrackCrop(videoPath, targetW, targetH, duration, startTime);
            if (ftResult && ftResult.cropFilter) {
                return { mode: 'single', cropFilter: ftResult.cropFilter, faceCount: 1 };
            }
            // Fallback: static crop on detected face
            const face = faces[0];
            const targetAR = targetW / targetH;

            let cropW, cropH;
            if (targetAR < srcW / srcH) {
                cropH = srcH;
                cropW = Math.round(srcH * targetAR);
            } else {
                cropW = srcW;
                cropH = Math.round(srcW / targetAR);
            }
            cropW = Math.min(cropW, srcW);
            cropH = Math.min(cropH, srcH);
            cropW = cropW % 2 === 0 ? cropW : cropW - 1;
            cropH = cropH % 2 === 0 ? cropH : cropH - 1;

            const cropX = clamp(Math.round(face.srcX - cropW / 2), 0, srcW - cropW);
            const cropY = clamp(Math.round(face.srcY - cropH / 2), 0, srcH - cropH);

            const filter = `crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${targetW}:${targetH}:flags=lanczos`;
            console.log(`[Podcast] 1-speaker fallback static crop: side=${face.side}`);
            return { mode: 'single', cropFilter: filter, faceCount: 1 };
        }

        // 0 faces: fallback
        console.log('[Podcast] No faces detected, fallback center crop');
        return { mode: 'center', cropFilter: null, faceCount: 0 };

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
