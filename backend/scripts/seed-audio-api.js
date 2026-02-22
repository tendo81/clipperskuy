/**
 * Seed Audio Library via API — uploads music & SFX files through the running backend
 * This ensures the in-memory database is properly updated.
 * 
 * Prerequisites: backend must be running on localhost:5000
 * Run: node scripts/seed-audio-api.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const API = 'http://localhost:5000/api';
const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, '..', 'data');
const MUSIC_DIR = path.join(DATA_DIR, 'music');
const SFX_DIR = path.join(DATA_DIR, 'sfx');

// Upload a file via multipart form to the API
function uploadFile(endpoint, filePath, metadata) {
    return new Promise((resolve, reject) => {
        const fileName = path.basename(filePath);
        const fileData = fs.readFileSync(filePath);
        const boundary = '----FormBoundary' + Date.now();

        const parts = [];

        // File part
        parts.push(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
            `Content-Type: audio/mpeg\r\n\r\n`
        );
        parts.push(fileData);
        parts.push('\r\n');

        // Metadata parts
        for (const [key, value] of Object.entries(metadata)) {
            parts.push(
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
                `${value}\r\n`
            );
        }
        parts.push(`--${boundary}--\r\n`);

        // Combine parts into Buffer
        const buffers = parts.map(p => typeof p === 'string' ? Buffer.from(p) : p);
        const body = Buffer.concat(buffers);

        const url = new URL(`${API}/${endpoint}`);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// Check if track already exists in API response
function trackExists(tracks, name) {
    return tracks.some(t => t.name === name);
}

async function fetchJSON(endpoint) {
    return new Promise((resolve, reject) => {
        http.get(`${API}/${endpoint}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { resolve([]); }
            });
        }).on('error', reject);
    });
}

async function main() {
    // Check backend is running
    try {
        await fetchJSON('../api/health');
    } catch (e) {
        console.error('❌ Backend not running! Start it first: cd backend && node src/server.js');
        process.exit(1);
    }

    console.log('\n🎵 Seeding Background Music...\n');

    const existingMusic = await fetchJSON('music');
    const existingSfx = await fetchJSON('sfx');

    const musicMeta = [
        { file: 'chill-lofi-beat.mp3', name: 'Chill Lo-Fi Beat', category: 'lofi', mood: 'calm', bpm: '85' },
        { file: 'upbeat-energy.mp3', name: 'Upbeat Energy', category: 'upbeat', mood: 'energetic', bpm: '128' },
        { file: 'epic-cinematic.mp3', name: 'Epic Cinematic', category: 'epic', mood: 'inspiring', bpm: '90' },
        { file: 'ambient-pad.mp3', name: 'Ambient Pad', category: 'chill', mood: 'calm', bpm: '70' },
        { file: 'motivational-rise.mp3', name: 'Motivational Rise', category: 'motivational', mood: 'inspiring', bpm: '120' },
        { file: 'dark-suspense.mp3', name: 'Dark Suspense', category: 'cinematic', mood: 'dark', bpm: '60' },
        { file: 'happy-vibes.mp3', name: 'Happy Vibes', category: 'upbeat', mood: 'happy', bpm: '140' },
        { file: 'gentle-piano.mp3', name: 'Gentle Piano', category: 'chill', mood: 'calm', bpm: '72' },
    ];

    let musicCount = 0;
    for (const m of musicMeta) {
        if (trackExists(existingMusic, m.name)) {
            console.log(`  ⏭️  Skip: ${m.name} (already exists)`);
            continue;
        }
        const filePath = path.join(MUSIC_DIR, m.file);
        if (!fs.existsSync(filePath)) {
            console.log(`  ❌ File not found: ${m.file}`);
            continue;
        }
        try {
            const result = await uploadFile('music', filePath, {
                name: m.name,
                category: m.category,
                mood: m.mood,
                bpm: m.bpm
            });
            console.log(`  ✅ ${m.name} (${m.category}, ${result.duration ? Math.round(result.duration) + 's' : 'uploaded'})`);
            musicCount++;
        } catch (e) {
            console.log(`  ❌ Failed: ${m.name} — ${e.message.substring(0, 100)}`);
        }
    }

    console.log('\n🔊 Seeding Sound Effects...\n');

    const sfxMeta = [
        { file: 'whoosh-transition.mp3', name: 'Whoosh Transition', category: 'whoosh' },
        { file: 'notification-ding.mp3', name: 'Notification Ding', category: 'notification' },
        { file: 'pop-click.mp3', name: 'Pop Click', category: 'ui' },
        { file: 'impact-hit.mp3', name: 'Impact Hit', category: 'impact' },
        { file: 'swoosh-up.mp3', name: 'Swoosh Up', category: 'whoosh' },
        { file: 'error-buzz.mp3', name: 'Error Buzz', category: 'notification' },
        { file: 'success-chime.mp3', name: 'Success Chime', category: 'notification' },
        { file: 'transition-slide.mp3', name: 'Transition Slide', category: 'transition' },
        { file: 'sparkle-magic.mp3', name: 'Sparkle Magic', category: 'transition' },
        { file: 'camera-shutter.mp3', name: 'Camera Shutter', category: 'ui' },
        { file: 'bass-drop.mp3', name: 'Deep Bass Drop', category: 'impact' },
        { file: 'typing-click.mp3', name: 'Typing Click', category: 'ui' },
    ];

    let sfxCount = 0;
    for (const s of sfxMeta) {
        if (trackExists(existingSfx, s.name)) {
            console.log(`  ⏭️  Skip: ${s.name} (already exists)`);
            continue;
        }
        const filePath = path.join(SFX_DIR, s.file);
        if (!fs.existsSync(filePath)) {
            console.log(`  ❌ File not found: ${s.file}`);
            continue;
        }
        try {
            const result = await uploadFile('sfx', filePath, {
                name: s.name,
                category: s.category
            });
            console.log(`  ✅ ${s.name} (${s.category}, ${result.duration ? result.duration.toFixed(1) + 's' : 'uploaded'})`);
            sfxCount++;
        } catch (e) {
            console.log(`  ❌ Failed: ${s.name} — ${e.message.substring(0, 100)}`);
        }
    }

    console.log(`\n🎉 Done! Added ${musicCount} music + ${sfxCount} SFX tracks.\n`);
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
