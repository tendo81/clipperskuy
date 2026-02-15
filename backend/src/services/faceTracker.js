/**
 * ClipperSkuy — JS Face Tracker
 * 
 * Lightweight face tracking for video reframing.
 * Uses FFmpeg to extract sample frames, then analyzes them 
 * to find face positions and generate smooth crop coordinates.
 * 
 * No Python, no TensorFlow, no heavy ML models needed.
 * Strategy: FFmpeg cropdetect + skin-tone detection via sharp.
 */

const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');

const SAMPLE_RATE = 2;  // Sample every N seconds
const SMOOTH_WINDOW = 3; // Smooth over N frames

/**
 * Extract sample frames from a video at regular intervals
 * @param {string} videoPath - Path to source video
 * @param {string} outputDir - Directory to save frames
 * @param {number} fps - Frames per second to extract (default: 0.5 = every 2 sec)
 * @returns {string[]} Array of frame file paths
 */
async function extractSampleFrames(videoPath, outputDir, fps = 1 / SAMPLE_RATE) {
    fs.ensureDirSync(outputDir);

    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const cmd = `"${ffmpegPath}" -i "${videoPath}" -vf "fps=${fps}" -q:v 2 -y "${path.join(outputDir, 'frame_%04d.jpg')}"`;

    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 120000 }, (err) => {
            if (err) return reject(err);
            const files = fs.readdirSync(outputDir)
                .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
                .sort()
                .map(f => path.join(outputDir, f));
            resolve(files);
        });
    });
}

/**
 * Detect the primary "region of interest" (face/person) in an image.
 * Uses skin-tone color detection + center-of-mass calculation.
 * This is lightweight and works without ML models.
 * 
 * @param {string} imagePath - Path to image
 * @returns {{ x: number, y: number, w: number, h: number, confidence: number }}
 */
async function detectFaceRegion(imagePath) {
    try {
        const img = sharp(imagePath);
        const metadata = await img.metadata();
        const { width, height } = metadata;

        // Resize to small size for fast processing
        const analysisSize = 160;
        const scaleX = width / analysisSize;
        const scaleY = height / Math.round(analysisSize * (height / width));
        const resizedH = Math.round(analysisSize * (height / width));

        const { data, info } = await img
            .resize(analysisSize, resizedH)
            .removeAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Scan for skin-tone pixels (HSV-based skin detection in RGB space)
        const skinPixels = [];
        for (let y = 0; y < info.height; y++) {
            for (let x = 0; x < info.width; x++) {
                const idx = (y * info.width + x) * 3;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                if (isSkinTone(r, g, b)) {
                    skinPixels.push({ x, y });
                }
            }
        }

        if (skinPixels.length < 20) {
            // Not enough skin pixels found — fall back to center
            return {
                x: width / 2,
                y: height / 2,
                w: Math.round(width * 0.4),
                h: Math.round(height * 0.5),
                confidence: 0
            };
        }

        // Calculate bounding box of skin-tone cluster
        let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
        let sumX = 0, sumY = 0;

        for (const p of skinPixels) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
            sumX += p.x;
            sumY += p.y;
        }

        // Center of mass (weighted average)
        const centerX = Math.round((sumX / skinPixels.length) * scaleX);
        const centerY = Math.round((sumY / skinPixels.length) * scaleY);
        const regionW = Math.round((maxX - minX) * scaleX * 1.5); // Add padding
        const regionH = Math.round((maxY - minY) * scaleY * 1.5);

        const confidence = Math.min(1, skinPixels.length / (info.width * info.height * 0.15));

        return {
            x: centerX,
            y: centerY,
            w: Math.max(regionW, Math.round(width * 0.3)),
            h: Math.max(regionH, Math.round(height * 0.4)),
            confidence
        };
    } catch (err) {
        console.error('[FaceTracker] Detection error:', err.message);
        return null;
    }
}

/**
 * Check if an RGB pixel is a skin tone
 * Uses a combination of empirical rules from research papers
 */
function isSkinTone(r, g, b) {
    // Rule 1: Basic RGB thresholds
    if (r < 60 || g < 40 || b < 20) return false;
    if (r < g || r < b) return false;

    // Rule 2: Skin tone range
    const maxRGB = Math.max(r, g, b);
    const minRGB = Math.min(r, g, b);
    if ((maxRGB - minRGB) < 15) return false; // Too gray
    if (Math.abs(r - g) < 10 && b > g) return false; // Too blue/gray

    // Rule 3: Empirical skin bounds (works across skin tones)
    // Based on: Peer et al. "Human skin colour clustering for face detection"
    if (r > 95 && g > 40 && b > 20 &&
        r > g && r > b &&
        (maxRGB - minRGB) > 15 &&
        Math.abs(r - g) > 15) {
        return true;
    }

    // Rule 4: Lighter skin tones
    if (r > 200 && g > 150 && b > 100 &&
        r > g && g > b &&
        (r - g) < 80) {
        return true;
    }

    return false;
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
            // Weight by distance from current frame and confidence
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
 * Generate face-aware crop coordinates for a video
 * 
 * @param {string} videoPath - Source video path
 * @param {number} targetW - Target width (e.g., 1080)
 * @param {number} targetH - Target height (e.g., 1920)
 * @param {number} duration - Video duration in seconds
 * @returns {{ positions: Array, cropFilter: string }}
 */
async function generateFaceTrackCrop(videoPath, targetW, targetH, duration) {
    const tempDir = path.join(path.dirname(videoPath), '_face_frames_' + Date.now());

    try {
        console.log('[FaceTracker] Extracting sample frames...');
        const frames = await extractSampleFrames(videoPath, tempDir);

        if (frames.length === 0) {
            console.log('[FaceTracker] No frames extracted, using center crop');
            return { positions: [], cropFilter: null };
        }

        console.log(`[FaceTracker] Analyzing ${frames.length} frames...`);

        // Detect face region in each frame
        const rawPositions = [];
        for (let i = 0; i < frames.length; i++) {
            const region = await detectFaceRegion(frames[i]);
            if (region) {
                rawPositions.push({
                    time: i * SAMPLE_RATE,
                    ...region
                });
            }
        }

        if (rawPositions.length === 0) {
            console.log('[FaceTracker] No faces detected, using center crop');
            return { positions: [], cropFilter: null };
        }

        // Smooth positions
        const smoothed = smoothPositions(rawPositions);

        console.log(`[FaceTracker] Detected ${smoothed.length} face positions, generating crop...`);

        // Get source video dimensions
        const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
        const probeCmd = `"${ffprobePath}" -v quiet -print_format json -show_streams "${videoPath}"`;
        const probeData = JSON.parse(execSync(probeCmd).toString());
        const videoStream = probeData.streams.find(s => s.codec_type === 'video');
        const srcW = videoStream.width;
        const srcH = videoStream.height;

        // Calculate the crop region that follows the face
        // We need to figure out the crop size that will scale to target aspect ratio
        const targetAR = targetW / targetH;
        const srcAR = srcW / srcH;

        let cropW, cropH;
        if (targetAR < srcAR) {
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

        // If only 1 position (very short clip), just use static crop
        if (smoothed.length <= 1) {
            const pos = smoothed[0];
            const cropX = clamp(pos.x - cropW / 2, 0, srcW - cropW);
            const cropY = clamp(pos.y - cropH / 2, 0, srcH - cropH);
            return {
                positions: smoothed,
                cropFilter: `crop=${cropW}:${cropH}:${Math.round(cropX)}:${Math.round(cropY)},scale=${targetW}:${targetH}`
            };
        }

        // Build FFmpeg expression-based crop that interpolates between positions
        // Create keyframe x,y positions for FFmpeg sendcmd or xfade
        // Simplest approach: use the average position (smooth enough for short clips)
        const avgX = smoothed.reduce((sum, p) => sum + p.x, 0) / smoothed.length;
        const avgY = smoothed.reduce((sum, p) => sum + p.y, 0) / smoothed.length;

        // For dynamic tracking, build an expression-based crop
        // FFmpeg crop supports expressions with time variable 't'
        if (smoothed.length >= 3) {
            // Build a linear interpolation expression for X position
            const xExpr = buildInterpolationExpr(smoothed, 'x', srcW, cropW);
            const yExpr = buildInterpolationExpr(smoothed, 'y', srcH, cropH);

            return {
                positions: smoothed,
                cropFilter: `crop=${cropW}:${cropH}:${xExpr}:${yExpr},scale=${targetW}:${targetH}`
            };
        }

        // Fallback: use average position
        const cropX = clamp(avgX - cropW / 2, 0, srcW - cropW);
        const cropY = clamp(avgY - cropH / 2, 0, srcH - cropH);

        return {
            positions: smoothed,
            cropFilter: `crop=${cropW}:${cropH}:${Math.round(cropX)}:${Math.round(cropY)},scale=${targetW}:${targetH}`
        };

    } finally {
        // Cleanup temp frames
        fs.removeSync(tempDir);
    }
}

/**
 * Build an FFmpeg expression that linearly interpolates between keyframe positions.
 * Uses FFmpeg's if()/between() functions for time-based interpolation.
 */
function buildInterpolationExpr(positions, axis, srcSize, cropSize) {
    // Clamp each position to valid crop range
    const clampedPositions = positions.map(p => ({
        time: p.time,
        value: clamp(p[axis] - cropSize / 2, 0, srcSize - cropSize)
    }));

    if (clampedPositions.length === 1) {
        return Math.round(clampedPositions[0].value).toString();
    }

    // Build piecewise linear interpolation:
    // lerp(a, b, (t - t0) / (t1 - t0))
    const parts = [];
    for (let i = 0; i < clampedPositions.length - 1; i++) {
        const t0 = clampedPositions[i].time;
        const t1 = clampedPositions[i + 1].time;
        const v0 = Math.round(clampedPositions[i].value);
        const v1 = Math.round(clampedPositions[i + 1].value);

        if (t1 === t0) continue;

        // FFmpeg expression: if(between(t, t0, t1), lerp(v0, v1, progress), ...)
        const progress = `(t-${t0})/${t1 - t0}`;
        const lerp = `${v0}+(${v1 - v0})*${progress}`;
        parts.push(`if(between(t\\,${t0}\\,${t1})\\,${lerp}`);
    }

    if (parts.length === 0) {
        return Math.round(clampedPositions[0].value).toString();
    }

    // Chain all parts: if(t<t1, lerp1, if(t<t2, lerp2, ..., lastPos))
    const lastVal = Math.round(clampedPositions[clampedPositions.length - 1].value);
    let expr = lastVal.toString(); // fallback

    // Build from end to start
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
    detectFaceRegion,
    generateFaceTrackCrop,
    smoothPositions
};
