// Test hook GDI script dengan path yang sama seperti backend
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptPath = path.join('C:\\Users\\kuyka\\Music\\opus 1\\backend\\scripts\\hook_gen_gdi.ps1');
const clipDir = 'C:\\Users\\kuyka\\Music\\opus 1\\backend\\data\\clips\\acdf5ff0-cbec-4c32-8f14-c219f5520513\\_tmp_clip1_64f0e012-249d-4154-a2f3-0125386ec4f7';
const hookImgPath = path.join(clipDir, 'hook_overlay.png');
const textFilePath = path.join(clipDir, '_hook_text.txt');

fs.mkdirSync(clipDir, { recursive: true });
const text = 'GIGI SUSU YANG LUCU DAN MENARIK INI MEMBUATKU TERTAWA';
fs.writeFileSync(textFilePath, text, 'utf-8');

const args = [
    `"${textFilePath}"`,
    36, 24, 16, 3,
    '#00E5FF', '#000000', '#FFFFFF',
    620, `"${hookImgPath}"`
].join(' ');

const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}" ${args}`;
console.log('Running:', psCmd.substring(0, 150));
console.log('Time started:', new Date().toISOString());

const t0 = Date.now();
const timer = setTimeout(() => {
    console.error('TIMEOUT after 10s!');
    process.exit(1);
}, 12000);

exec(psCmd, { timeout: 13000, encoding: 'utf-8' }, (err, stdout, stderr) => {
    clearTimeout(timer);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`Done in ${elapsed}s`);
    if (err) console.error('Error:', err.message.substring(0, 200));
    console.log('stdout:', stdout);
    console.log('stderr:', stderr?.substring(0, 200));
    if (fs.existsSync(hookImgPath)) {
        const sz = fs.statSync(hookImgPath).size;
        console.log('✅ PNG created:', sz, 'bytes');
    } else {
        console.log('❌ PNG NOT created');
    }
});
