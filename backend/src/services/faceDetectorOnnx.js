/**
 * ClipperSkuy — Face Detection via ONNX Runtime + UltraFace slim-320
 *
 * Ultra-fast CPU face detection: ~5-15ms per frame.
 * No Python, no OpenCV, no native compilation needed.
 * Model: version-slim-320_simplified.onnx (1MB)
 *   Input:  (1, 3, 240, 320) float32, normalized (pixel - 127) / 128
 *   Output: "scores" (1, 4420, 2)  — [bg_score, face_score]
 *           "boxes"  (1, 4420, 4)  — [x1, y1, x2, y2] normalized 0..1
 */

const ort = require('onnxruntime-node');
const path = require('path');
const fs = require('fs-extra');
const { execFile } = require('child_process');

// UltraFace slim-320 expects exactly 320×240
const MODEL_W = 320;
const MODEL_H = 240;

const MODEL_PATH = path.join(__dirname, '../../models/ultraface_slim_320.onnx');

let _session = null;
let _sessionLoading = null;

/** Singleton ONNX session — loads once, reused across all clips */
async function getSession() {
    if (_session) return _session;
    if (_sessionLoading) return _sessionLoading;
    _sessionLoading = ort.InferenceSession.create(MODEL_PATH, {
        executionProviders: ['cpu'],   // always CPU — fast enough (~10ms/frame)
        logSeverityLevel: 3            // suppress verbose logs
    }).then(sess => {
        _session = sess;
        _sessionLoading = null;
        console.log('[FaceDetector] ONNX model loaded ✅ inputs:', sess.inputNames, 'outputs:', sess.outputNames);
        return sess;
    });
    return _sessionLoading;
}

// Pre-load model at require time so first clip doesn't wait
if (fs.existsSync(MODEL_PATH)) {
    getSession().catch(() => { });
}

/**
 * Extract raw RGB pixels from image using FFmpeg (pipe to stdout).
 * Scales + pads image to exactly MODEL_W × MODEL_H.
 * @returns {Buffer} RGB buffer of size MODEL_W * MODEL_H * 3
 */
function extractRawPixels(imagePath) {
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const vf = `scale=${MODEL_W}:${MODEL_H}:force_original_aspect_ratio=decrease,pad=${MODEL_W}:${MODEL_H}:(ow-iw)/2:(oh-ih)/2,format=rgb24`;
    return new Promise((resolve, reject) => {
        execFile(ffmpegPath,
            ['-y', '-i', imagePath, '-vf', vf, '-f', 'rawvideo', '-frames:v', '1', 'pipe:1'],
            { encoding: 'buffer', maxBuffer: MODEL_W * MODEL_H * 3 + 4096, timeout: 10000 },
            (err, stdout) => {
                if (err || !stdout || stdout.length < MODEL_W * MODEL_H * 3) {
                    reject(new Error(`Pixel extraction failed: ${err?.message || 'empty output'}`));
                    return;
                }
                resolve(stdout.slice(0, MODEL_W * MODEL_H * 3));
            }
        );
    });
}

/**
 * Convert raw RGB buffer → Float32Array (NCHW, normalised for UltraFace).
 * Formula: (pixel - 127) / 128
 */
function preprocessRGB(buf) {
    const n = MODEL_W * MODEL_H;
    const t = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
        t[0 * n + i] = (buf[i * 3] - 127) / 128;  // R
        t[1 * n + i] = (buf[i * 3 + 1] - 127) / 128;  // G
        t[2 * n + i] = (buf[i * 3 + 2] - 127) / 128;  // B
    }
    return t;
}

/** IoU of two boxes [x1,y1,x2,y2] */
function iou(a, b) {
    const ix1 = Math.max(a[0], b[0]);
    const iy1 = Math.max(a[1], b[1]);
    const ix2 = Math.min(a[2], b[2]);
    const iy2 = Math.min(a[3], b[3]);
    if (ix2 <= ix1 || iy2 <= iy1) return 0;
    const inter = (ix2 - ix1) * (iy2 - iy1);
    const areaA = (a[2] - a[0]) * (a[3] - a[1]);
    const areaB = (b[2] - b[0]) * (b[3] - b[1]);
    return inter / (areaA + areaB - inter);
}

/** Non-Maximum Suppression */
function nms(boxes, scores, thresh) {
    const order = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a]);
    const keep = [];
    const used = new Set();
    for (const i of order) {
        if (used.has(i)) continue;
        keep.push(i);
        for (const j of order) {
            if (i === j || used.has(j)) continue;
            if (iou(boxes[i], boxes[j]) > thresh) used.add(j);
        }
    }
    return keep;
}

/**
 * Quick skin-tone check on a specific region of an image using raw pixel buffer.
 * Returns true if the region looks like it could contain skin.
 */
function hasSkinTone(rawRGB, x1, y1, x2, y2, imgW) {
    let skinPixels = 0, totalPixels = 0;
    const bx1 = Math.max(0, Math.floor(x1));
    const by1 = Math.max(0, Math.floor(y1));
    const bx2 = Math.min(MODEL_W - 1, Math.ceil(x2));
    const by2 = Math.min(MODEL_H - 1, Math.ceil(y2));

    for (let y = by1; y < by2; y += 2) {     // skip every other row for speed
        for (let x = bx1; x < bx2; x += 2) {
            const idx = (y * MODEL_W + x) * 3;
            const r = rawRGB[idx], g = rawRGB[idx + 1], b = rawRGB[idx + 2];
            totalPixels++;
            // Convert to YCbCr approximation inline
            const Y = 0.299 * r + 0.587 * g + 0.114 * b;
            const Cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
            const Cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
            // Skin tone range in YCbCr
            if (Y > 40 && Y < 240 && Cb >= 90 && Cb <= 148 && Cr >= 130 && Cr <= 180) {
                skinPixels++;
            }
        }
    }
    if (totalPixels === 0) return false;
    const ratio = skinPixels / totalPixels;
    return ratio >= 0.08;  // at least 8% pixels look like skin
}

/**
 * Detect faces in an image file.
 * @param {string} imagePath  - Path to JPEG/PNG frame
 * @param {number} srcW       - Original image width (to scale bboxes back)
 * @param {number} srcH       - Original image height
 * @param {number} [scoreThresh=0.85] - Minimum confidence (raised to reduce false positives)
 * @returns {Promise<Array<{x,y,w,h,confidence}>>} Detected faces in original coords
 */
async function detectFaces(imagePath, srcW, srcH, scoreThresh = 0.85) {
    if (!fs.existsSync(MODEL_PATH)) {
        console.warn('[FaceDetector] Model file missing:', MODEL_PATH);
        return [];
    }

    const t0 = Date.now();
    try {
        const session = await getSession();

        // 1. Preprocessing — get raw pixels AND keep for skin tone validation
        const rawPixels = await extractRawPixels(imagePath);
        const floatData = preprocessRGB(rawPixels);
        const inputTensor = new ort.Tensor('float32', floatData, [1, 3, MODEL_H, MODEL_W]);

        // 2. Inference
        const feeds = { [session.inputNames[0]]: inputTensor };
        const results = await session.run(feeds);

        // 3. Parse outputs
        let scoresOut, boxesOut;
        for (const name of session.outputNames) {
            const out = results[name];
            if (out.dims[2] === 2) scoresOut = out.data;
            if (out.dims[2] === 4) boxesOut = out.data;
        }

        if (!scoresOut || !boxesOut) {
            console.warn('[FaceDetector] Unexpected output format');
            return [];
        }

        const numAnchors = scoresOut.length / 2;
        const validBoxes = [], validScores = [];

        for (let i = 0; i < numAnchors; i++) {
            const faceScore = scoresOut[i * 2 + 1];
            if (faceScore < scoreThresh) continue;

            const x1 = boxesOut[i * 4] * MODEL_W;
            const y1 = boxesOut[i * 4 + 1] * MODEL_H;
            const x2 = boxesOut[i * 4 + 2] * MODEL_W;
            const y2 = boxesOut[i * 4 + 3] * MODEL_H;
            const bw = x2 - x1;
            const bh = y2 - y1;

            // ── Filter 1: reject detections in the TOP 25% of frame ──
            // Lamps and ceiling objects are almost always in the top portion
            const centerY = (y1 + y2) / 2;
            if (centerY < MODEL_H * 0.25) {
                console.log(`[FaceDetector] Skip: detection in top 25% (y=${centerY.toFixed(0)}) — likely lamp/ceiling`);
                continue;
            }

            // ── Filter 2: aspect ratio sanity check ──
            // Human face bbox roughly square to 1:1.4 (w:h). Lamps often wider than tall.
            const ar = bw / bh;
            if (ar > 2.0 || ar < 0.3) {
                console.log(`[FaceDetector] Skip: weird aspect ratio ${ar.toFixed(2)}`);
                continue;
            }

            // ── Filter 3: skin tone validation using raw pixels ──
            if (!hasSkinTone(rawPixels, x1, y1, x2, y2, MODEL_W)) {
                console.log(`[FaceDetector] Skip: no skin tone in bbox (${x1.toFixed(0)},${y1.toFixed(0)}) score=${faceScore.toFixed(2)} — likely lamp/object`);
                continue;
            }

            validBoxes.push([x1, y1, x2, y2]);
            validScores.push(faceScore);
        }

        if (validBoxes.length === 0) {
            console.log(`[FaceDetector] No valid faces after filtering in ${Date.now() - t0}ms`);
            return [];
        }

        // 4. NMS
        const kept = nms(validBoxes, validScores, 0.3);

        // 5. Scale back to original image coordinates
        const sx = srcW / MODEL_W;
        const sy = srcH / MODEL_H;

        const faces = kept.slice(0, 5).map(i => {
            const [x1, y1, x2, y2] = validBoxes[i];
            return {
                x: Math.round(x1 * sx),
                y: Math.round(y1 * sy),
                w: Math.round((x2 - x1) * sx),
                h: Math.round((y2 - y1) * sy),
                confidence: validScores[i]
            };
        });

        console.log(`[FaceDetector] ${faces.length} face(s) in ${Date.now() - t0}ms:`,
            faces.map(f => `(${f.x},${f.y}) ${f.w}x${f.h} conf=${f.confidence.toFixed(2)}`).join(', '));

        return faces;

    } catch (e) {
        console.error(`[FaceDetector] Error: ${e.message}`);
        return [];
    }
}

module.exports = { detectFaces };
