// Extract frame from rendered clip for visual check
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const db = require('better-sqlite3')('data/clipperskuy.db');

const clip = db.prepare("SELECT output_path FROM clips WHERE title LIKE '%Berolahraga%' AND status='rendered'").get();
db.close();

if (!clip?.output_path) { console.log('No rendered clip found'); process.exit(1); }

const inputPath = clip.output_path;
const outFrame1 = 'C:\\Users\\kuyka\\AppData\\Local\\Temp\\frame_t1.jpg';
const outFrame3 = 'C:\\Users\\kuyka\\AppData\\Local\\Temp\\frame_t3.jpg';
const ffmpeg = process.env.FFMPEG_PATH || 'C:\\ffmpeg\\bin\\ffmpeg.exe';

console.log('Input:', inputPath);
console.log('FFmpeg:', ffmpeg);

// Get video info first
try {
    const ffprobe = process.env.FFPROBE_PATH || 'C:\\ffmpeg\\bin\\ffprobe.exe';
    const info = execSync(`"${ffprobe}" -v quiet -show_entries stream=width,height,codec_name -select_streams v:0 -of csv=p=0 "${inputPath}"`, { encoding: 'utf-8' });
    console.log('Video stream (w,h,codec):', info.trim());
} catch (e) { console.error('probe err:', e.message); }

// Extract frames
try {
    execSync(`"${ffmpeg}" -y -ss 1 -i "${inputPath}" -vframes 1 "${outFrame1}" 2>&1`, { encoding: 'utf-8' });
    const sz1 = fs.existsSync(outFrame1) ? fs.statSync(outFrame1).size : 0;
    console.log('Frame@1s:', outFrame1, sz1, 'bytes');
} catch (e) { console.error('frame1 err:', e.message.substring(0, 200)); }

try {
    execSync(`"${ffmpeg}" -y -ss 3 -i "${inputPath}" -vframes 1 "${outFrame3}" 2>&1`, { encoding: 'utf-8' });
    const sz3 = fs.existsSync(outFrame3) ? fs.statSync(outFrame3).size : 0;
    console.log('Frame@3s:', outFrame3, sz3, 'bytes');
} catch (e) { console.error('frame3 err:', e.message.substring(0, 200)); }
