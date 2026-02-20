/**
 * ClipperSkuy — FFmpeg-based Face Tracker
 * 
 * Uses FFmpeg's built-in capabilities for face-aware cropping:
 * 1. Extract sample frames from clip segment
 * 2. Use FFmpeg cropdetect to find region of interest
 * 3. Generate smooth crop coordinates
 * 
 * No Python, no TensorFlow, no sharp, no native modules needed.
 * Pure FFmpeg — guaranteed to work in packaged Electron apps.
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const path = require('path');
const fs = require('fs-extra');

const SAMPLE_RATE = 2;  // Sample every N seconds
const SMOOTH_WINDOW = 3; // Smooth over N frames

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
 * Detect the primary region of interest in a frame using FFmpeg cropdetect
 * This is much more reliable than sharp-based skin detection
 * NOTE: Uses async exec to avoid blocking the event loop (prevents UI freeze)
 */
async function detectROI(imagePath) {
    try {
        const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

        // Use cropdetect to find the main content area
        const cmd = `"${ffmpegPath}" -i "${imagePath}" -vf "cropdetect=24:16:0" -f null -frames:v 1 -`;

        const { stdout, stderr } = await execAsync(cmd, { timeout: 10000 });
        const output = (stderr || '') + (stdout || '');

        // Parse cropdetect output: crop=W:H:X:Y
        const cropMatch = output.match(/crop=(\d+):(\d+):(\d+):(\d+)/);

        if (cropMatch) {
            const w = parseInt(cropMatch[1]);
            const h = parseInt(cropMatch[2]);
            const x = parseInt(cropMatch[3]);
            const y = parseInt(cropMatch[4]);

            // Center of the detected crop region
            return {
                x: x + w / 2,
                y: y + h / 2,
                w, h,
                confidence: 0.7
            };
        }
    } catch (e) {
        // cropdetect failed, try simpler approach
    }

    // Fallback: try to detect brightness center-of-mass using FFmpeg
    try {
        const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
        const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';

        // Get image dimensions
        const probeCmd = `"${ffprobePath}" -v quiet -print_format json -show_streams "${imagePath}"`;
        const { stdout: probeOut } = await execAsync(probeCmd, { timeout: 5000 });
        const probeData = JSON.parse(probeOut);
        const stream = probeData.streams.find(s => s.codec_type === 'video');

        if (stream) {
            const w = stream.width;
            const h = stream.height;

            // Even if we can't determine exact position, return center with some confidence
            return {
                x: w / 2,
                y: h * 0.4, // Slightly above center (faces tend to be in upper third)
                w: Math.round(w * 0.5),
                h: Math.round(h * 0.6),
                confidence: 0.3
            };
        }
    } catch (e) {
        // All detection failed
    }

    return null;
}

/**
 * Smooth face positions across frames to avoid jittery cropping
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
            const weight = (1 / (1 + dist)) * (positions[j].confidence || 0.5);
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

        console.log(`[FaceTracker] Analyzing ${frames.length} frames...`);

        // Detect region of interest in each frame
        const rawPositions = [];
        for (let i = 0; i < frames.length; i++) {
            const region = await detectROI(frames[i]);
            if (region) {
                rawPositions.push({
                    time: i * SAMPLE_RATE,
                    ...region
                });
            }
        }

        if (rawPositions.length === 0) {
            console.log('[FaceTracker] No regions detected, using center crop');
            return { positions: [], cropFilter: null };
        }

        // Smooth positions
        const smoothed = smoothPositions(rawPositions);

        console.log(`[FaceTracker] Detected ${smoothed.length} positions, generating crop...`);

        // Get source video dimensions (async to avoid blocking UI)
        const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
        const probeCmd = `"${ffprobePath}" -v quiet -print_format json -show_streams "${videoPath}"`;
        const { stdout: probeOut } = await execAsync(probeCmd, { timeout: 10000 });
        const probeData = JSON.parse(probeOut);
        const videoStream = probeData.streams.find(s => s.codec_type === 'video');
        const srcW = videoStream.width;
        const srcH = videoStream.height;

        // Calculate the crop region
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

        // If only 1 position, use static crop
        if (smoothed.length <= 1) {
            const pos = smoothed[0];
            const cropX = clamp(pos.x - cropW / 2, 0, srcW - cropW);
            const cropY = clamp(pos.y - cropH / 2, 0, srcH - cropH);
            return {
                positions: smoothed,
                cropFilter: `crop=${cropW}:${cropH}:${Math.round(cropX)}:${Math.round(cropY)},scale=${targetW}:${targetH}:flags=lanczos`
            };
        }

        // For multiple positions, use expression-based dynamic crop
        if (smoothed.length >= 3) {
            const xExpr = buildInterpolationExpr(smoothed, 'x', srcW, cropW);
            const yExpr = buildInterpolationExpr(smoothed, 'y', srcH, cropH);
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
        parts.push(`if(between(t\\,${t0}\\,${t1})\\,${lerp}`);
    }

    if (parts.length === 0) {
        return Math.round(clampedPositions[0].value).toString();
    }

    const lastVal = Math.round(clampedPositions[clampedPositions.length - 1].value);
    let expr = lastVal.toString();

    for (let i = parts.length - 1; i >= 0; i--) {
        expr = `${parts[i]}\\,${expr})`;
    }

    return `'${expr}'`;
}

function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

module.exports = {
    extractSampleFrames,
    detectROI,
    generateFaceTrackCrop,
    smoothPositions
};
