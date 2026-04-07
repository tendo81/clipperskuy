/**
 * Full face tracking diagnostics — tests all frames of a clip
 * node test_full_facetrack.js "video.mp4" startSec durationSec
 */
process.chdir('c:/Users/kuyka/Music/opus 1/backend');
const { detectFaces } = require('./src/services/faceDetectorOnnx');
const { exec, execFile } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');

const videoPath = process.argv[2] || 'data/uploads/496e4864-f136-481d-a600-286f187983d9.mp4';
const startSec = parseFloat(process.argv[3] || '0');
const durSec = parseFloat(process.argv[4] || '30');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';
const SAMPLE_RATE = 5; // 1 frame every 5 seconds
const FRAME_W = 480;
const tempDir = path.join(os.tmpdir(), '_facediag_' + Date.now());

async function probe() {
    const out = await new Promise((res, rej) => exec(
        `"${FFPROBE}" -v quiet -print_format json -show_streams "${videoPath}"`,
        { timeout: 10000 }, (e, o) => e ? rej(e) : res(o)));
    const vs = JSON.parse(out).streams.find(s => s.codec_type === 'video');
    return { srcW: vs.width, srcH: vs.height };
}

async function extractFrames(srcW, srcH) {
    fs.ensureDirSync(tempDir);
    const FRAME_H = Math.round(FRAME_W * srcH / srcW);
    const numFrames = Math.max(1, Math.ceil(durSec / SAMPLE_RATE));
    const frames = [];
    for (let i = 0; i < numFrames; i++) {
        const t = startSec + i * SAMPLE_RATE;
        if (t >= startSec + durSec) break;
        const fp = path.join(tempDir, `frame_${String(i).padStart(3, '0')}.jpg`);
        await new Promise((res, rej) => exec(
            `"${FFMPEG}" -y -ss ${t} -i "${videoPath}" -vf "scale=${FRAME_W}:-2" -frames:v 1 "${fp}"`,
            { timeout: 15000 }, (e) => e ? rej(e) : res()));
        frames.push({ path: fp, time: t, frameH: FRAME_H });
    }
    return { frames, FRAME_H };
}

async function run() {
    console.log(`\n=== Face Tracking Diagnostics ===`);
    console.log(`Video: ${videoPath}`);
    console.log(`Clip:  ${startSec}s → ${startSec + durSec}s (${durSec}s), sampling every ${SAMPLE_RATE}s\n`);

    const { srcW, srcH } = await probe();
    const FRAME_H = Math.round(FRAME_W * srcH / srcW);
    const scaleX = srcW / FRAME_W;
    const scaleY = srcH / FRAME_H;
    console.log(`Source: ${srcW}x${srcH}, Frame: ${FRAME_W}x${FRAME_H}, scale: ${scaleX.toFixed(2)}x/${scaleY.toFixed(2)}x`);

    const { frames } = await extractFrames(srcW, srcH);
    console.log(`Extracted ${frames.length} frames to ${tempDir}\n`);

    let detected = 0, missed = 0;
    for (const f of frames) {
        // Pass 1: normal threshold
        let faces = await detectFaces(f.path, FRAME_W, FRAME_H, 0.50);
        let thresh = 0.50;
        // Pass 2: retry with lower threshold if nothing found
        if (faces.length === 0) {
            faces = await detectFaces(f.path, FRAME_W, FRAME_H, 0.30);
            thresh = 0.30;
        }

        if (faces.length > 0) {
            detected++;
            const best = faces.sort((a, b) => b.confidence - a.confidence)[0];
            const srcCX = Math.round((best.x + best.w / 2) * scaleX);
            const srcCY = Math.round((best.y + best.h / 2) * scaleY);
            const pctL = Math.round(srcCX / srcW * 100);
            const pctT = Math.round(srcCY / srcH * 100);
            console.log(`t=${f.time.toFixed(0)}s ✅ conf=${best.confidence.toFixed(2)}@thresh=${thresh} frame(${best.x},${best.y},${best.w}x${best.h}) → src_center=(${srcCX},${srcCY}) [${pctL}%L ${pctT}%T]`);
        } else {
            missed++;
            console.log(`t=${f.time.toFixed(0)}s ❌ NO FACE DETECTED (frame: ${path.basename(f.path)})`);
        }
    }

    console.log(`\n=== Results ===`);
    console.log(`Detected: ${detected}/${frames.length} (${Math.round(detected / frames.length * 100)}%)`);
    console.log(`Missed: ${missed}/${frames.length}`);
    if (missed > 0) console.log(`\n⚠️  Frames with no detection have been saved to ${tempDir}`);
    else { try { fs.removeSync(tempDir); } catch (e) { } console.log(`\n✅ All frames detected! Temp cleaned up.`); }
}

run().catch(e => { console.error('FAIL:', e.message, e.stack); process.exit(1); });
