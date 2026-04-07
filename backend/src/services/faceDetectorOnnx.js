/**
 * ClipperSkuy — Face Detection via ONNX Runtime + YuNet 2023
 *
 * YuNet: High-accuracy face detector from OpenCV Zoo
 * Input:  (1, 3, 640, 640) float32, BGR normalized [0-255]
 * Output: Multi-scale anchors at stride 8, 16, 32
 *   cls_8/16/32:  (1, N, 1)  — face confidence
 *   obj_8/16/32:  (1, N, 1)  — objectness
 *   bbox_8/16/32: (1, N, 4)  — dx, dy, dw, dh (relative to anchor)
 *   kps_8/16/32:  (1, N, 10) — 5 keypoints (x,y each)
 */

const ort = require('onnxruntime-node');
const path = require('path');
const fs = require('fs-extra');
const { execFile } = require('child_process');

const MODEL_W = 640;
const MODEL_H = 640;
const MODEL_PATH = path.join(__dirname, '../../models/yunet_2023mar.onnx');
const strides = [8, 16, 32];

let _session = null;
let _sessionLoading = null;

// Pre-compute anchors once at module load — same for every inference
const _anchorsByStride = {};
for (const s of [8, 16, 32]) {
    const rows = Math.ceil(MODEL_H / s);
    const cols = Math.ceil(MODEL_W / s);
    const anchors = [];
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
            anchors.push([c * s, r * s]);
    _anchorsByStride[s] = anchors;
}

async function getSession() {
    if (_session) return _session;
    if (_sessionLoading) return _sessionLoading;
    _sessionLoading = ort.InferenceSession.create(MODEL_PATH, {
        executionProviders: ['cpu'],
        logSeverityLevel: 3
    }).then(sess => {
        _session = sess;
        _sessionLoading = null;
        console.log('[YuNet] Model loaded ✅');
        return sess;
    });
    return _sessionLoading;
}

if (fs.existsSync(MODEL_PATH)) {
    getSession().catch(() => { });
}

/**
 * Extract raw BGR pixels DIRECTLY from video (start+time seek → pipe raw).
 * Single FFmpeg call: no intermediate JPG file needed → 1 spawn instead of 2.
 * @param {string} videoPath - Source video file
 * @param {number} startTime - Seek to this time (seconds)
 * @returns {Buffer} Raw BGR buffer 640x640x3
 */
function extractRawPixelsDirect(videoPath, startTime) {
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    const vf = `scale=${MODEL_W}:${MODEL_H}:force_original_aspect_ratio=decrease,pad=${MODEL_W}:${MODEL_H}:(ow-iw)/2:(oh-ih)/2,format=bgr24`;
    return new Promise((resolve, reject) => {
        execFile(ffmpegPath,
            ['-y', '-skip_frame', 'noref', '-ss', String(startTime), '-i', videoPath,
             '-vf', vf, '-f', 'rawvideo', '-frames:v', '1', 'pipe:1'],
            { encoding: 'buffer', maxBuffer: MODEL_W * MODEL_H * 3 + 4096, timeout: 12000 },
            (err, stdout) => {
                if (err || !stdout || stdout.length < MODEL_W * MODEL_H * 3) {
                    reject(new Error(`Direct pixel extraction failed: ${err?.message || 'empty'}` ));
                    return;
                }
                resolve(stdout.slice(0, MODEL_W * MODEL_H * 3));
            }
        );
    });
}

/**
 * Extract raw RGB pixels from image using FFmpeg, scaled to MODEL_W x MODEL_H
 * @returns {Buffer} BGR buffer (YuNet uses BGR like OpenCV)
 */
function extractRawPixels(imagePath) {
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    // YuNet wants BGR format (OpenCV convention), padded to 640x640
    const vf = `scale=${MODEL_W}:${MODEL_H}:force_original_aspect_ratio=decrease,pad=${MODEL_W}:${MODEL_H}:(ow-iw)/2:(oh-ih)/2,format=bgr24`;
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
 * Convert raw BGR buffer → Float32Array (NCHW).
 * YuNet expects pixel values in [0, 255] range (NOT normalized)
 */
function preprocessBGR(buf) {
    const n = MODEL_W * MODEL_H;
    const t = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
        // BGR order: buf[i*3]=B, buf[i*3+1]=G, buf[i*3+2]=R
        t[0 * n + i] = buf[i * 3];      // B channel
        t[1 * n + i] = buf[i * 3 + 1];  // G channel
        t[2 * n + i] = buf[i * 3 + 2];  // R channel
    }
    return t;
}

/** Generate anchor grid for given stride */
function generateAnchors(stride, modelH, modelW) {
    const rows = Math.ceil(modelH / stride);
    const cols = Math.ceil(modelW / stride);
    const anchors = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            // Anchor center in model input space
            anchors.push([c * stride, r * stride]);
        }
    }
    return anchors;
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
 * Decode YuNet predictions for one stride level.
 * YuNet encodes bbox as: cx = anchor_cx + dx*stride, cy = anchor_cy + dy*stride
 *                         w  = exp(dw) * stride,      h  = exp(dh) * stride
 */
function decodeLevel(clsData, objData, bboxData, anchors, stride, confThresh) {
    const results = [];
    const n = anchors.length;
    for (let i = 0; i < n; i++) {
        const cls = clsData[i];
        const obj = objData[i];
        // Combined confidence: cls * obj  (similar to YOLO)
        const conf = cls * obj;
        if (conf < confThresh) continue;

        const [ax, ay] = anchors[i];
        const dx = bboxData[i * 4];
        const dy = bboxData[i * 4 + 1];
        const dw = bboxData[i * 4 + 2];
        const dh = bboxData[i * 4 + 3];

        const cx = ax + dx * stride;
        const cy = ay + dy * stride;
        const w = Math.exp(Math.min(dw, 10)) * stride;
        const h = Math.exp(Math.min(dh, 10)) * stride;

        results.push({
            box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2],
            conf
        });
    }
    return results;
}

/**
 * Detect faces using YuNet.
 * Supports two call modes:
 *   Mode A (image file):  detectFaces(imagePath,  srcW, srcH, scoreThresh)
 *   Mode B (video+time):  detectFaces(videoPath,  srcW, srcH, scoreThresh, absTime)
 *
 * @param {string} srcPath     - Path to image or video
 * @param {number} srcW        - Source width (for inverse letterbox scaling)
 * @param {number} srcH        - Source height
 * @param {number} [scoreThresh=0.5]
 * @param {number} [absTime]   - If provided, extract frame at this timestamp from video
 * @returns {Promise<Array<{x,y,w,h,confidence}>>}
 */
async function detectFaces(srcPath, srcW, srcH, scoreThresh = 0.50, absTime) {
    if (!fs.existsSync(MODEL_PATH)) {
        console.warn('[YuNet] Model file missing:', MODEL_PATH);
        return [];
    }

    const t0 = Date.now();
    try {
        const session = await getSession();

        // Preprocess: scale frame to 640x640 with letterbox padding
        // Mode B: extract raw BGR directly from video at absTime (no temp file)
        // Mode A: extract raw BGR from an image file
        const rawPixels = (absTime !== undefined)
            ? await extractRawPixelsDirect(srcPath, absTime)
            : await extractRawPixels(srcPath);
        const floatData = preprocessBGR(rawPixels);
        const inputTensor = new ort.Tensor('float32', floatData, [1, 3, MODEL_H, MODEL_W]);

        // Compute scale factors: image was letterboxed into 640x640
        // Actual scale and padding
        const scaleRaw = Math.min(MODEL_W / srcW, MODEL_H / srcH);
        const scaledW = Math.round(srcW * scaleRaw);
        const scaledH = Math.round(srcH * scaleRaw);
        const padX = (MODEL_W - scaledW) / 2;
        const padY = (MODEL_H - scaledH) / 2;

        // Inference
        const feeds = { input: inputTensor };
        const results = await session.run(feeds);

        // Use pre-computed anchors (cached at module load)
        const anchorsByStride = _anchorsByStride;

        // Collect detections from all scales
        let allBoxes = [];
        let allScores = [];

        for (const stride of strides) {
            const cls = results[`cls_${stride}`].data;
            const obj = results[`obj_${stride}`].data;
            const bbox = results[`bbox_${stride}`].data;
            const anchors = anchorsByStride[stride];
            const dets = decodeLevel(cls, obj, bbox, anchors, stride, scoreThresh);
            for (const d of dets) {
                allBoxes.push(d.box);
                allScores.push(d.conf);
            }
        }

        if (allBoxes.length === 0) {
            console.log(`[YuNet] No detections above threshold ${scoreThresh} in ${Date.now() - t0}ms`);
            return [];
        }

        // NMS
        const kept = nms(allBoxes, allScores, 0.3);

        // Convert from model-space (640x640 letterboxed) → original image coords
        const faces = kept.slice(0, 5).map(i => {
            const [x1, y1, x2, y2] = allBoxes[i];
            // Remove letterbox padding and un-scale
            const ox1 = (x1 - padX) / scaleRaw;
            const oy1 = (y1 - padY) / scaleRaw;
            const ox2 = (x2 - padX) / scaleRaw;
            const oy2 = (y2 - padY) / scaleRaw;

            // Clamp to image bounds
            const fx = Math.max(0, Math.round(ox1));
            const fy = Math.max(0, Math.round(oy1));
            const fw = Math.min(srcW - fx, Math.round(ox2 - ox1));
            const fh = Math.min(srcH - fy, Math.round(oy2 - oy1));

            return { x: fx, y: fy, w: fw, h: fh, confidence: allScores[i] };
        }).filter(f => f.w > 10 && f.h > 10); // Must be at least 10px

        console.log(`[YuNet] ${faces.length} face(s) in ${Date.now() - t0}ms:`,
            faces.map(f => `(${f.x},${f.y}) ${f.w}x${f.h} conf=${f.confidence.toFixed(2)}`).join(', '));

        return faces;

    } catch (e) {
        console.error(`[YuNet] Error: ${e.message}`);
        return [];
    }
}

module.exports = { detectFaces, extractRawPixelsDirect, detectFacesFromVideo: (videoPath, srcW, srcH, scoreThresh, absTime) => detectFaces(videoPath, srcW, srcH, scoreThresh, absTime) };
