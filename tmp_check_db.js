// Test render clip 2 yang sudah rendered — lihat filter yang dipakai
const Database = require('./backend/node_modules/better-sqlite3');
const db = new Database('./backend/data/clipperskuy.db', { readonly: true });
const clip = db.prepare('SELECT * FROM clips WHERE clip_number = 2').get();
const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(clip.project_id);
db.close();

console.log('Clip:', clip.clip_number, clip.title);
console.log('Start/End:', clip.start_time, '->', clip.end_time, '(', clip.end_time - clip.start_time, 's)');
console.log('Reframing:', clip.reframing_mode || project.reframing_mode);
console.log('Hook text:', clip.hook_text ? clip.hook_text.substring(0, 50) : 'NONE');

// Parse hook settings
let hs = {};
try { hs = JSON.parse(clip.hook_settings || '{}'); } catch (e) { }
console.log('Hook settings:', JSON.stringify(hs));

// Check what buildHookTitleFilter would do
// The guard: 
const guard = !hs.position && !hs.textColor && !hs.bgColor && !hs.hookStyle;
console.log('\nguard check (should be FALSE to allow hook):', guard);

// Check if the _tmp_ dir still exists (cleaned up after render)
const fs = require('fs');
const path = require('path');
const clipsDir = path.dirname(clip.output_path || 'backend/data/clips/x/x.mp4');
const tmpDirs = fs.existsSync(clipsDir) ?
    fs.readdirSync(clipsDir).filter(f => f.startsWith('_tmp_')) : [];
console.log('\n_tmp_ dirs (temp clipDir during render):', tmpDirs);
console.log('If empty: clip was cleaned up (hook PNG is deleted after render - this is FINE for pass1 output)');

// Check output file for hook
// Probe the output video to see if there's an annotation stream or check first few seconds
const { execSync } = require('child_process');
if (clip.output_path && fs.existsSync(clip.output_path)) {
    try {
        const ffprobe = execSync(`ffprobe -v quiet -print_format json -show_streams "${clip.output_path}" 2>&1`, {
            encoding: 'utf-8', timeout: 10000
        });
        const info = JSON.parse(ffprobe);
        console.log('\nVideo streams in output:');
        info.streams.filter(s => s.codec_type === 'video').forEach(s => {
            console.log('  Video:', s.codec_name, s.width + 'x' + s.height, '@', s.r_frame_rate, 'fps');
        });
        console.log('File size:', Math.round(fs.statSync(clip.output_path).size / 1024 / 1024), 'MB');
    } catch (e) {
        console.log('ffprobe error:', e.message.substring(0, 100));
    }
}

// KEY QUESTION: In the 2-pass system, pass 1 should have hook baked in.
// The issue might be that clipTempDir doesn't exist when buildHookTitleFilter is called.
// Let's check where clipTempDir is created relative to when buildHookTitleFilter is called.
console.log('\n=== DIAGNOSIS ===');
console.log('The hook PNG is written to: clipTempDir/hook_overlay.png');
console.log('clipTempDir is the _tmp_clip{N}_ dir in the clipsDir folder');
console.log('The PNG must EXIST at the time FFmpeg pass1 runs (as -i input)');
console.log('After pass1 success, clipTempDir is only cleaned up AFTER pass2 (at the very end)');
console.log('So hook PNG should persist through pass1 -> pass2 -> final cleanup');
