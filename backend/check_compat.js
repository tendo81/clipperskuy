const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLIPS_DIR = 'C:\\Users\\kuyka\\Music\\opus 1\\backend\\data\\clips\\acdf5ff0-cbec-4c32-8f14-c219f5520513';

// Get latest clip
const files = fs.readdirSync(CLIPS_DIR)
    .filter(f => f.endsWith('.mp4'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(CLIPS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

const latest = files[0];
const fp = path.join(CLIPS_DIR, latest.name);
console.log('Checking:', latest.name);

// Full ffprobe info
const probe = execSync(
    `ffprobe -v quiet -show_streams -show_format -of json "${fp}"`,
    { encoding: 'utf-8', timeout: 10000 }
);
const data = JSON.parse(probe);
const vs = data.streams?.find(s => s.codec_type === 'video');
const as = data.streams?.find(s => s.codec_type === 'audio');

console.log('\n=== VIDEO STREAM ===');
console.log('Codec        :', vs?.codec_name, '(' + vs?.codec_long_name + ')');
console.log('Profile      :', vs?.profile);
console.log('Width        :', vs?.width);
console.log('Height       :', vs?.height);
console.log('Display Aspect:', vs?.display_aspect_ratio);
console.log('Sample Aspect:', vs?.sample_aspect_ratio);
console.log('Rotation (tag):', vs?.tags?.rotate || vs?.side_data_list?.[0]?.rotation || 'none');
console.log('Frame Rate   :', vs?.r_frame_rate);
console.log('Pixel Format :', vs?.pix_fmt);
console.log('Bitrate      :', Math.round(parseInt(vs?.bit_rate || 0) / 1000), 'kbps');

console.log('\n=== AUDIO STREAM ===');
console.log('Codec        :', as?.codec_name);
console.log('Sample Rate  :', as?.sample_rate, 'Hz');
console.log('Channels     :', as?.channels);
console.log('Bitrate      :', Math.round(parseInt(as?.bit_rate || 0) / 1000), 'kbps');

console.log('\n=== FORMAT ===');
console.log('Container    :', data.format?.format_name);
console.log('Duration     :', parseFloat(data.format?.duration || 0).toFixed(1), 's');
console.log('Total Bitrate:', Math.round(parseInt(data.format?.bit_rate || 0) / 1000), 'kbps');
console.log('Size         :', (parseInt(data.format?.size || 0) / 1024 / 1024).toFixed(1), 'MB');

console.log('\n=== PLATFORM COMPATIBILITY ===');
const codec = vs?.codec_name;
const w = vs?.width, h = vs?.height;
const isPortrait = h > w;
const audioOk = as?.codec_name === 'aac';

console.log('Portrait (9:16)  :', isPortrait ? '✅ YES (' + w + 'x' + h + ')' : '❌ NO - is ' + w + 'x' + h + ' (LANDSCAPE!)');
console.log('Audio AAC        :', audioOk ? '✅ YES' : '❌ NO (' + as?.codec_name + ')');
console.log('TikTok           :', codec === 'h264' ? '✅ H.264' : codec === 'av1' ? '⚠️ AV1 (might work)' : '❌ ' + codec);
console.log('Instagram Reels  :', codec === 'h264' ? '✅ H.264' : '❌ ' + codec + ' NOT supported');
console.log('YouTube Shorts   :', (codec === 'h264' || codec === 'av1') ? '✅ ' + codec : '⚠️ ' + codec);
