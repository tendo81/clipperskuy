const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { exec } = require('child_process');
const execAsync = promisify(exec);

// Face detector (ONNX YuNet)
const { detectFaces: detectFacesOnnx } = require('./faceDetectorOnnx');

// â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SAMPLE_RATE = 2;    // seconds between sample frames (1 frame per 2s)
const SMOOTH_WINDOW = 5;  // smoothing window for position averaging

// â”€â”€ Helper: cleanup temp dir (native Node, no fs-extra) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function removeTempDir(dir) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

// â”€â”€ Helper: extract sample frames from a video clip using FFmpeg â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function extractSampleFrames(videoPath, tempDir, intervalSecs, startTime, duration) {
    await fs.promises.mkdir(tempDir, { recursive: true });
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const fps = 1 / Math.max(0.1, intervalSecs);
    const safeStart = Math.max(0, startTime);
    const safeDur = Math.max(1, duration);
    // Extract at 480px wide (FRAME_W) â€” consistent with ONNX input expectations
    const cmd = `"${ffmpegPath}" -ss ${safeStart} -t ${safeDur} -i "${videoPath}" -vf "fps=${fps.toFixed(4)},scale=480:-2" -q:v 3 "${tempDir}/frame_%04d.jpg" -y`;
    await execAsync(cmd, { timeout: 120000 });
    const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.jpg')).sort();
    return files.map(f => path.join(tempDir, f));
}

// â”€â”€ Helper: simple YUV-based ROI fallback when ONNX fails â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns { x, y, w, h, confidence } or null
async function detectROI(imagePath) {
    try {
        const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
        const { stdout } = await execAsync(
            `"${ffprobePath}" -v quiet -print_format json -show_streams "${imagePath}"`,
            { timeout: 5000 }
        );
        const data = JSON.parse(stdout);
        const s = (data.streams || []).find(s => s.codec_type === 'video');
        if (!s) return null;
        // Return upper-center as best guess for face position (most common in talking-head video)
        const w = s.width || 480;
        const h = s.height || 270;
        return { x: Math.round(w * 0.25), y: Math.round(h * 0.1), w: Math.round(w * 0.5), h: Math.round(h * 0.5), confidence: 0.1 };
    } catch (e) {
        return null;
    }
}

// â”€â”€ Helper: analyze a region of an image for face likelihood â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Returns { score } where score > 40 = likely face region
async function analyzeRegion(imagePath, rx, ry, rw, rh) {
    try {
        const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
        // Use signalstats to get average luminance/saturation â€” proxy for skin tone presence
        const cmd = `"${ffmpegPath}" -i "${imagePath}" -vf "crop=${rw}:${rh}:${rx}:${ry},signalstats=stat=tout" -an -f null - 2>&1`;
        const { stdout, stderr } = await execAsync(cmd, { timeout: 8000 }).catch(e => ({ stdout: '', stderr: e.stderr || '' }));
        const output = stdout + stderr;
        // Extract YAVG (luma average) â€” skin tone is typically 80-200
        const yMatch = output.match(/YAVG:([\d.]+)/);
        const yavg = yMatch ? parseFloat(yMatch[1]) : 128;
        // Heuristic: luma in skin range boosts score
        const skinScore = (yavg >= 80 && yavg <= 210) ? 35 : 0;
        return { score: skinScore };
    } catch (e) {
        return { score: 0 };
    }
}

// â”€â”€ Helper: analyze N vertical columns of a frame for face presence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function analyzeFrameColumns(imagePath, numCols) {
    try {
        const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
        const { stdout } = await execAsync(
            `"${ffprobePath}" -v quiet -print_format json -show_streams "${imagePath}"`,
            { timeout: 5000 }
        );
        const data = JSON.parse(stdout);
        const s = (data.streams || []).find(s => s.codec_type === 'video');
        if (!s) return [];
        const imgW = s.width || 480;
        const imgH = s.height || 270;
        const cellW = Math.floor(imgW / numCols);

        const results = await Promise.all(
            Array.from({ length: numCols }, async (_, col) => {
                const rx = col * cellW;
                const rw = (col === numCols - 1) ? imgW - rx : cellW;
                const r = await analyzeRegion(imagePath, rx, 0, rw, imgH);
                return { col, x: rx, w: rw, score: r.score };
            })
        );
        return results;
    } catch (e) {
        return [];
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

        console.log(`[FaceTracker] Analyzing ${frames.length} frames with ONNX face detection...`);

        // Get source video dimensions (for final crop filter coordinates)
        const ffprobePath2 = process.env.FFPROBE_PATH || 'ffprobe';
        const probeCmd2 = `"${ffprobePath2}" -v quiet -print_format json -show_streams "${videoPath}"`;
        const { stdout: pOut2 } = await execAsync(probeCmd2, { timeout: 10000 });
        const pData2 = JSON.parse(pOut2);
        const vStream2 = pData2.streams.find(s => s.codec_type === 'video');
        const srcWLocal = vStream2?.width || 640;
        const srcHLocal = vStream2?.height || 360;

        // YuNet handles letterbox unprojection internally and returns coordinates
        // in the original image space (srcW x srcH). We pass srcW/srcH so it can
        // correctly unproject. Extracted frames are 480px wide but YuNet letterboxes
        // to 640x640 Ã¢â‚¬â€ the FRAME_W/FRAME_H here is what detectFacesOnnx receives as srcW/srcH.
        // For YUV fallback (detectROI), frames are 480px wide, so we still need scale factors.
        const FRAME_W = 480;
        const frameAR = srcHLocal / srcWLocal;
        const FRAME_H = Math.round(FRAME_W * frameAR);
        // Scale ratio for YUV fallback only: frame-space coords Ã¢â€ â€™ source video coords
        const scaleX = srcWLocal / FRAME_W;
        const scaleY = srcHLocal / FRAME_H;

        // Detect face in each frame using ONNX YuNet
        const rawPositions = [];
        for (let i = 0; i < frames.length; i++) {
            let faces = [];
            try {
                // YuNet: pass FRAME dimensions so it correctly unprojects letterbox coords.
                // Returned coordinates are already in FRAME space (0..FRAME_W, 0..FRAME_H).
                faces = await detectFacesOnnx(frames[i], FRAME_W, FRAME_H);
            } catch (onnxErr) {
                console.warn(`[FaceTracker] ONNX error frame ${i}: ${onnxErr.message} Ã¢â‚¬â€ trying YUV fallback`);
                const region = await detectROI(frames[i]);
                if (region && region.confidence > 0.15) {
                    // detectROI returns coords in frame space Ã¢â‚¬â€ scale to source video space
                    faces = [{
                        x: Math.round(region.x * scaleX),
                        y: Math.round(region.y * scaleY),
                        w: Math.round((region.w || 60) * scaleX),
                        h: Math.round((region.h || 60) * scaleY),
                        confidence: region.confidence
                    }];
                }
            }

            if (faces.length > 0) {
                // Filter out false positives:
                // - Bounding box too large relative to frame (>40% of frame area = not a real face)
                // - Suspiciously low confidence (< 0.55) when high-conf alternatives exist
                const frameArea = FRAME_W * FRAME_H; // 480*270 = 129600
                const maxFaceAreaRatio = 0.40; // max 40% of frame = real face limit
                const hasHighConf = faces.some(f => f.confidence >= 0.65);

                const validFaces = faces.filter(f => {
                    const faceArea = f.w * f.h;
                    const areaRatio = faceArea / frameArea;
                    if (areaRatio > maxFaceAreaRatio) {
                        console.log(`[FaceTracker] Frame ${i}: skip large bbox ${f.w}x${f.h} (${(areaRatio * 100).toFixed(0)}% frame) conf=${f.confidence.toFixed(2)}`);
                        return false;
                    }
                    if (hasHighConf && f.confidence < 0.55) {
                        console.log(`[FaceTracker] Frame ${i}: skip low-conf face conf=${f.confidence.toFixed(2)}`);
                        return false;
                    }
                    return true;
                });

                if (validFaces.length > 0) {
                    // Store ALL valid detected faces for this frame (not just best)
                    // We'll select the consistent subject in phase 2
                    const frameFaces = validFaces.map(f => ({
                        time: i * SAMPLE_RATE,
                        x: Math.round((f.x + f.w / 2) * scaleX),
                        y: Math.round((f.y + f.h / 2) * scaleY),
                        w: Math.round(f.w * scaleX),
                        h: Math.round(f.h * scaleY),
                        confidence: f.confidence
                    }));
                    rawPositions.push(...frameFaces);
                    const best = frameFaces.reduce((a, b) => a.confidence > b.confidence ? a : b);
                    console.log(`[FaceTracker] Frame ${i}: ${validFaces.length} valid (of ${faces.length}), best=(${best.x},${best.y}) conf=${best.confidence.toFixed(2)}`);
                } else {
                    console.log(`[FaceTracker] Frame ${i}: all ${faces.length} detection(s) filtered (false positive)`);
                }
            } else {
                // ONNX found no face Ã¢â‚¬â€ try YUV fallback
                console.log(`[FaceTracker] Frame ${i}: ONNX no face Ã¢â€ â€™ YUV fallback`);
                const region = await detectROI(frames[i]);
                if (region && region.confidence > 0.15) {
                    rawPositions.push({
                        time: i * SAMPLE_RATE,
                        x: Math.round(region.x * scaleX),
                        y: Math.round(region.y * scaleY),
                        w: Math.round((region.w || 80) * scaleX),
                        h: Math.round((region.h || 80) * scaleY),
                        confidence: region.confidence
                    });
                } else {
                    console.log(`[FaceTracker] Frame ${i}: skipped (both ONNX and YUV failed)`);
                }
            }
        }

        // Ã¢â€â‚¬Ã¢â€â‚¬ Phase 2: Find the most CONSISTENT subject to track Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        // When multiple faces are detected (e.g. 2-person interview), rawPositions
        // has multiple entries per frame. We need to identify ONE subject and track
        // that person throughout the clip.
        // Strategy: cluster all detected centers by X position, pick the cluster
        // (= person) whose center is closest to the median Ã¢â‚¬â€ avoiding the host
        // who often sits at center/slightly-left while guest is at the right.

        // First, find the median X of all detections to find the "main speaker zone"
        const allX = rawPositions.map(p => p.x).sort((a, b) => a - b);
        const medianX = allX[Math.floor(allX.length / 2)];
        const medianY = rawPositions.map(p => p.y).sort((a, b) => a - b)[Math.floor(rawPositions.length / 2)];
        console.log(`[FaceTracker] Median face center: (${medianX}, ${medianY}) across ${rawPositions.length} total detections`);

        // For each frame-time, keep only the face closest to the median position
        const frameGroups = {};
        for (const p of rawPositions) {
            const timeKey = p.time;
            if (!frameGroups[timeKey]) frameGroups[timeKey] = [];
            frameGroups[timeKey].push(p);
        }

        const consistentPositions = [];
        for (const [timeKey, group] of Object.entries(frameGroups)) {
            // Pick face closest to median X/Y (the most consistently appearing subject)
            const best = group.reduce((a, b) => {
                const distA = Math.abs(a.x - medianX) + Math.abs(a.y - medianY) * 0.5;
                const distB = Math.abs(b.x - medianX) + Math.abs(b.y - medianY) * 0.5;
                return distA <= distB ? a : b;
            });
            consistentPositions.push(best);
            console.log(`[FaceTracker] t=${timeKey}s Ã¢â€ â€™ selected face src=(${best.x},${best.y}) [${Math.round(best.x / srcWLocal * 100)}%L] conf=${best.confidence.toFixed(2)} (from ${group.length} candidates)`);
        }
        consistentPositions.sort((a, b) => a.time - b.time);

        // Replace rawPositions with the per-frame-consistent selection
        rawPositions.length = 0;
        rawPositions.push(...consistentPositions);

        // Second-pass retry: for frames that got no detection, try with LOWER threshold
        // This helps when people are partially visible, far from camera, or at frame edge
        const missedFrameIndices = [];
        for (let i = 0; i < frames.length; i++) {
            if (!rawPositions.find(p => p.time === i * SAMPLE_RATE)) {
                missedFrameIndices.push(i);
            }
        }
        if (missedFrameIndices.length > 0) {
            console.log(`[FaceTracker] Retry ${missedFrameIndices.length} missed frames with lower threshold (0.35)...`);
            for (const i of missedFrameIndices) {
                try {
                    const facesLow = await detectFacesOnnx(frames[i], FRAME_W, FRAME_H, 0.35);
                    if (facesLow.length > 0) {
                        const best = facesLow.sort((a, b) => b.confidence - a.confidence)[0];
                        const srcCenterX = Math.round((best.x + best.w / 2) * scaleX);
                        const srcCenterY = Math.round((best.y + best.h / 2) * scaleY);
                        rawPositions.push({
                            time: i * SAMPLE_RATE,
                            x: srcCenterX,
                            y: srcCenterY,
                            w: Math.round(best.w * scaleX),
                            h: Math.round(best.h * scaleY),
                            confidence: best.confidence * 0.6 // lower weight for low-confidence
                        });
                        console.log(`[FaceTracker] Frame ${i} retry: found face at src=(${srcCenterX},${srcCenterY}) conf=${best.confidence.toFixed(2)}`);
                    }
                } catch (e) { /* ignore retry errors */ }
            }
            rawPositions.sort((a, b) => a.time - b.time);
        }

        console.log(`[FaceTracker] Detected faces in ${rawPositions.length}/${frames.length} frames`);

        // Fill gaps: if a frame has no detection, interpolate between before/after neighbors
        const allPositions = [];
        for (let i = 0; i < frames.length; i++) {
            const existing = rawPositions.find(p => p.time === i * SAMPLE_RATE);
            if (existing) {
                allPositions.push(existing);
            } else if (rawPositions.length > 0) {
                // Find nearest detected positions before and after this frame
                let before = null, after = null;
                for (const p of rawPositions) {
                    if (p.time <= i * SAMPLE_RATE) before = p;
                    if (p.time > i * SAMPLE_RATE && !after) after = p;
                }
                let interp;
                if (before && after) {
                    // Linear interpolation between before and after
                    const t = (i * SAMPLE_RATE - before.time) / (after.time - before.time);
                    interp = {
                        time: i * SAMPLE_RATE,
                        x: Math.round(before.x + (after.x - before.x) * t),
                        y: Math.round(before.y + (after.y - before.y) * t),
                        w: Math.round(before.w + (after.w - before.w) * t),
                        h: Math.round(before.h + (after.h - before.h) * t),
                        confidence: Math.min(before.confidence, after.confidence) * 0.5
                    };
                } else {
                    // Only one side available Ã¢â‚¬â€ use nearest
                    const ref = before || after;
                    interp = {
                        time: i * SAMPLE_RATE,
                        x: ref.x, y: ref.y, w: ref.w, h: ref.h,
                        confidence: ref.confidence * 0.4
                    };
                }
                allPositions.push(interp);
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
            // Target is taller (e.g., 9:16 from 16:9) Ã¢â‚¬â€ crop width
            cropH = srcH;
            cropW = Math.round(srcH * targetAR);
        } else {
            // Target is wider Ã¢â‚¬â€ crop height
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
        try { removeTempDir(tempDir); } catch (e) { /* ignore cleanup errors */ }
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
            console.log('[Podcast] Cannot probe video Ã¢â€ â€™ center crop fallback');
            return { mode: 'center', cropFilter: null, faceCount: 0 };
        }
        const srcW = videoStream.width;
        const srcH = videoStream.height;
        console.log(`[Podcast] Source: ${srcW}x${srcH}`);

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Helper: build split screen filter Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
                console.log(`[Podcast] ${label}: centerX=${Math.round(centerX)} Ã¢â€ â€™ crop=${cropW}x${cropH}@${cropX},0`);
                return { cropW, cropH, cropX };
            };

            const lc = buildPanelCrop(leftCenterX, 'LEFTÃ¢â€ â€™top');
            const rc = buildPanelCrop(rightCenterX, 'RIGHTÃ¢â€ â€™bottom');

            return [
                `[0:v]split=3[psva][psvb][psvsep]`,
                `[psva]crop=${lc.cropW}:${lc.cropH}:${lc.cropX}:0,scale=${targetW}:${panelH}:flags=lanczos[ptop]`,
                `[psvb]crop=${rc.cropW}:${rc.cropH}:${rc.cropX}:0,scale=${targetW}:${panelH}:flags=lanczos[pbottom]`,
                `[psvsep]crop=${targetW}:${sepH}:0:0,drawbox=x=0:y=0:w=${targetW}:h=${sepH}:color=0x1a1a2e:t=fill[psline]`,
                `[ptop][psline][pbottom]vstack=inputs=3`
            ].join(';');
        };

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 1: Face detection voting on sample frames Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        let votes1 = 0, votes2 = 0;
        let bestSingleFace = null;
        let best2FaceLeft = null, best2FaceRight = null;

        try {
            // Sample ONLY a few frames from the start of the clip for speaker detection.
            // Cap at 8 seconds max sampling Ã¢â‚¬â€ just enough to determine 1 vs 2 speakers.
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

        console.log(`[Podcast] Final vote Ã¢â€ â€™ 1-person: ${votes1}, 2-people: ${votes2}`);

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Step 2: Decide mode Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

        // Ã¢â€â‚¬Ã¢â€â‚¬ CASE A: 2 speakers clearly detected Ã¢â€â‚¬Ã¢â€â‚¬
        if (votes2 > votes1 && best2FaceLeft && best2FaceRight) {
            console.log(`[Podcast] Ã¢â€ â€™ MODE: SPLIT SCREEN (2 speakers, face-centered)`);
            return {
                mode: 'split',
                cropFilter: buildSplitFilter(best2FaceLeft.srcX, best2FaceRight.srcX),
                faceCount: 2
            };
        }

        // Ã¢â€â‚¬Ã¢â€â‚¬ CASE B: 1 speaker detected Ã¢â€ â€™ static face-centered crop (no dynamic tracking for perf) Ã¢â€â‚¬Ã¢â€â‚¬
        if (votes1 > 0 && bestSingleFace) {
            console.log(`[Podcast] Ã¢â€ â€™ MODE: FACE TRACKING (1 speaker) Ã¢â‚¬â€ static centered`);
            // Use static center crop around detected face (avoids re-extracting all frames).
            // Dynamic face tracking (generateFaceTrackCrop) is too slow for long AV1 videos.
            const tAR = targetW / targetH;
            let cropW = Math.round(srcH * tAR);
            let cropH = srcH;
            if (cropW > srcW) { cropW = srcW; cropH = Math.round(srcW / tAR); }
            cropW = cropW % 2 === 0 ? cropW : cropW - 1;
            cropH = cropH % 2 === 0 ? cropH : cropH - 1;
            // srcX from bestSingleFace is in the scaled-down (480px) frame Ã¢â‚¬â€ scale back up
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

        // Ã¢â€â‚¬Ã¢â€â‚¬ CASE C: 0 faces detected Ã¢â€ â€™ podcast fallback = geometric 50/50 split Ã¢â€â‚¬Ã¢â€â‚¬
        // In podcast mode, 0 detected faces usually means detection failed,
        // NOT that there's no one in frame. Geometric split is better than center crop.
        console.log(`[Podcast] Ã¢â€ â€™ MODE: GEOMETRIC SPLIT (0 faces, assuming 2-person podcast setup)`);
        return {
            mode: 'split',
            cropFilter: buildSplitFilter(srcW * 0.25, srcW * 0.75),
            faceCount: 0
        };

    } finally {
        try { removeTempDir(tempDir); } catch (e) { }
    }
}





module.exports = {
    generateFaceTrackCrop,
    generatePodcastCrop,
};

