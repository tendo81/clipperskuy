/**
 * Debug: test ONNX face detection on extracted frame
 * node test_face_dbg.js [videoPath] [startTime]
 */
const { detectFaces } = require('./src/services/faceDetectorOnnx');
const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');

const videoPath = process.argv[2] || 'data/uploads/496e4864-f136-481d-a600-286f187983d9.mp4';
const startTime = parseFloat(process.argv[3] || '30');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const FRAME_W = 480;
const framePath = path.join(os.tmpdir(), '_face_dbg_frame.jpg');

async function run() {
    // 1. Probe source
    const probeOut = await new Promise((res, rej) => {
        exec(`"${FFPROBE}" -v quiet -print_format json -show_streams "${videoPath}"`,
            { timeout: 10000 }, (e, o) => e ? rej(e) : res(o));
    });
    const vs = JSON.parse(probeOut).streams.find(s => s.codec_type === 'video');
    const srcW = vs.width, srcH = vs.height;
    const FRAME_H = Math.round(FRAME_W * srcH / srcW);
    console.log(`Source: ${srcW}x${srcH} | Frame will be: ${FRAME_W}x${FRAME_H}`);

    // 2. Extract frame at startTime, scaled to 480px wide (same as faceTracker.js)
    console.log(`Extracting frame at t=${startTime}s...`);
    await new Promise((res, rej) => {
        exec(`"${FFMPEG}" -y -ss ${startTime} -i "${videoPath}" -vf "scale=${FRAME_W}:-2" -frames:v 1 "${framePath}"`,
            { timeout: 20000 }, (e) => e ? rej(e) : res());
    });
    console.log(`Frame saved: ${framePath}`);

    // 3. Run ONNX with FRAME dimensions
    console.log(`\n--- Testing with FRAME dims (${FRAME_W}x${FRAME_H}) ---`);
    const faces = await detectFaces(framePath, FRAME_W, FRAME_H, 0.65);
    console.log(`Faces (thresh 0.65): ${faces.length}`);
    const scaleX = srcW / FRAME_W;
    const scaleY = srcH / FRAME_H;
    for (const f of faces) {
        const cx = Math.round((f.x + f.w / 2) * scaleX);
        const cy = Math.round((f.y + f.h / 2) * scaleY);
        console.log(`  frame=(${f.x},${f.y},${f.w}x${f.h}) conf=${f.confidence.toFixed(3)}`);
        console.log(`  → src_center=(${cx},${cy})  [${Math.round(cx / srcW * 100)}% left, ${Math.round(cy / srcH * 100)}% top]`);
    }

    if (faces.length === 0) {
        console.log('\nNo faces with 0.65. Trying 0.30...');
        const facesLow = await detectFaces(framePath, FRAME_W, FRAME_H, 0.30);
        console.log(`Faces (thresh 0.30): ${facesLow.length}`);
        for (const f of facesLow) {
            console.log(`  conf=${f.confidence.toFixed(3)} bbox=(${f.x},${f.y},${f.w}x${f.h})`);
        }
    }

    // 4. Also test with WRONG src dims (to show old bug)
    console.log(`\n--- OLD BUG (src dims ${srcW}x${srcH} passed to detectFaces) ---`);
    const facesOld = await detectFaces(framePath, srcW, srcH, 0.65);
    console.log(`Faces with old bug: ${facesOld.length}`);
    for (const f of facesOld) {
        console.log(`  "center"=(${Math.round(f.x + f.w / 2)},${Math.round(f.y + f.h / 2)}) — THESE COORDS ARE WRONG (would crop way outside frame)`);
    }
}

run().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
