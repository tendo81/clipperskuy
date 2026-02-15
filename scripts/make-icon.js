/**
 * Convert SVG icon to PNG and ICO for Electron build
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const resDir = path.join(__dirname, '..', 'electron', 'resources');
const svgPath = path.join(resDir, 'icon.svg');

async function main() {
    console.log('🎨 Converting icon.svg → PNG + ICO...\n');

    // 1. SVG → PNG 256x256
    const pngPath = path.join(resDir, 'icon.png');
    await sharp(svgPath)
        .resize(256, 256)
        .png()
        .toFile(pngPath);
    console.log('✅ icon.png (256x256)');

    // 2. SVG → tray icon 32x32
    const trayPath = path.join(resDir, 'tray-icon.png');
    await sharp(svgPath)
        .resize(32, 32)
        .png()
        .toFile(trayPath);
    console.log('✅ tray-icon.png (32x32)');

    // 3. PNG → ICO (wraps PNG in ICO container)
    const pngData = fs.readFileSync(pngPath);
    const icoHeader = Buffer.alloc(22);
    icoHeader.writeUInt16LE(0, 0);      // Reserved
    icoHeader.writeUInt16LE(1, 2);      // Type: ICO
    icoHeader.writeUInt16LE(1, 4);      // 1 image
    icoHeader.writeUInt8(0, 6);         // Width 256 (0=256)
    icoHeader.writeUInt8(0, 7);         // Height 256
    icoHeader.writeUInt8(0, 8);         // Colors
    icoHeader.writeUInt8(0, 9);         // Reserved
    icoHeader.writeUInt16LE(1, 10);     // Planes
    icoHeader.writeUInt16LE(32, 12);    // BPP
    icoHeader.writeUInt32LE(pngData.length, 14); // Size
    icoHeader.writeUInt32LE(22, 18);    // Offset

    const icoPath = path.join(resDir, 'icon.ico');
    fs.writeFileSync(icoPath, Buffer.concat([icoHeader, pngData]));
    console.log('✅ icon.ico (256x256)');

    console.log(`\n🎉 All icons saved to: ${resDir}`);

    // List files
    const files = fs.readdirSync(resDir);
    files.forEach(f => {
        const s = fs.statSync(path.join(resDir, f));
        console.log(`   ${f} (${(s.size / 1024).toFixed(1)} KB)`);
    });
}

main().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
});
