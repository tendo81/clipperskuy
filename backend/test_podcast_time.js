// Simulate render logic to see what filter gets built
// Run this AFTER backend starts, as it uses the same modules

process.env.FFMPEG_PATH = 'C:\\ffmpeg\\bin\\ffmpeg.exe';
process.env.FFPROBE_PATH = 'C:\\ffmpeg\\bin\\ffprobe.exe';

const { generatePodcastCrop } = require('./src/services/faceTracker');

const videoPath = 'C:\\Users\\kuyka\\Music\\opus 1\\backend\\data\\uploads\\2f6b9620-b64e-4cd7-8d7c-f1879a021cca.mp4';
const startTime = 1761; // clip #1 start
const duration = 45;   // 1806 - 1761
const outW = 720, outH = 1280;

console.log('Testing generatePodcastCrop for clip #1...');
console.log('Video:', videoPath.split('\\').pop());
console.log('Start:', startTime, 's / Duration:', duration, 's');
console.log();

const t0 = Date.now();

generatePodcastCrop(videoPath, outW, outH, duration, startTime)
    .then(result => {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`\n✅ Done in ${elapsed}s!`);
        console.log('Mode:', result.mode);
        console.log('FaceCount:', result.faceCount);
        console.log('CropFilter (first 200):', (result.cropFilter || 'NULL').substring(0, 200));
    })
    .catch(e => {
        console.error('ERROR:', e.message);
    });
