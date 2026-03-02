// Test hook PNG generation directly
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptPath = path.join(__dirname, 'src', 'services', '..', '..', 'scripts', 'hook_gen.ps1');
const tempDir = require('os').tmpdir();
const textFilePath = path.join(tempDir, '_hook_test.txt');
const hookImgPath = path.join(tempDir, '_hook_test.png');

const hookText = 'DONOR DARAH BISA SAVES NYAWA ORANG LAIN SETIAP HARI';
const outW = 1080;
const outH = 1920;
const fontSize = Math.round(outW / 11); // ~98
const psFontSize = Math.round(fontSize * 0.75); // ~73
const padX = Math.round(fontSize * 0.5);
const padY = Math.round(fontSize * 0.35);
const maxW = outW - Math.round(outW * 0.14);
const borderThk = 5;
const bgColor = '00E5FF';
const textColor = '000000';
const borderColor = 'FFFFFF';

console.log('Script path:', scriptPath, '| exists:', fs.existsSync(scriptPath));
console.log('Hook text:', hookText);
console.log('fontSize:', fontSize, 'psFontSize:', psFontSize, 'maxW:', maxW);

fs.writeFileSync(textFilePath, hookText, 'utf-8');

const args = [
    `"${textFilePath}"`,
    psFontSize, padX, padY, borderThk,
    bgColor, textColor, borderColor,
    maxW, `"${hookImgPath}"`
].join(' ');

const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Sta -File "${scriptPath}" ${args}`;
console.log('\nRunning:', cmd.substring(0, 200));

try {
    const result = execSync(cmd, { timeout: 15000, encoding: 'utf-8' }).trim();
    console.log('\nResult:', result);
    console.log('PNG exists:', fs.existsSync(hookImgPath));
    if (fs.existsSync(hookImgPath)) {
        const stat = fs.statSync(hookImgPath);
        console.log('PNG size:', stat.size, 'bytes');
    }
} catch (err) {
    console.error('\nERROR:', err.message);
    if (err.stderr) console.error('STDERR:', err.stderr);
    if (err.stdout) console.error('STDOUT:', err.stdout);
}
