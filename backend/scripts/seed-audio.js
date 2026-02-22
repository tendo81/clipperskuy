/**
 * Seed Audio Library — generate built-in music & SFX using ffmpeg
 * These are simple tones/synths for testing and demo purposes.
 * Users can then upload their own royalty-free tracks.
 * 
 * Run: node scripts/seed-audio.js
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, '..', 'data');
const MUSIC_DIR = path.join(DATA_DIR, 'music');
const SFX_DIR = path.join(DATA_DIR, 'sfx');

fs.ensureDirSync(MUSIC_DIR);
fs.ensureDirSync(SFX_DIR);

// Check ffmpeg available
try {
    execSync(`"${FFMPEG}" -version`, { stdio: 'pipe' });
} catch (e) {
    console.error('FFmpeg not found. Install ffmpeg or set FFMPEG_PATH.');
    process.exit(1);
}

function generateAudio(outPath, filters, duration, label) {
    if (fs.existsSync(outPath)) {
        console.log(`  ⏭️  Skip (exists): ${label}`);
        return;
    }
    try {
        execSync(
            `"${FFMPEG}" -y -f lavfi -i "${filters}" -t ${duration} -c:a libmp3lame -b:a 192k "${outPath}"`,
            { stdio: 'pipe', timeout: 30000 }
        );
        console.log(`  ✅ ${label}`);
    } catch (e) {
        console.warn(`  ❌ Failed: ${label} — ${e.message.split('\n')[0]}`);
    }
}

console.log('\n🎵 Generating Background Music...\n');

// === MUSIC TRACKS (longer ambient loops) ===

// 1. Chill Lo-Fi Beat
generateAudio(
    path.join(MUSIC_DIR, 'chill-lofi-beat.mp3'),
    'sine=frequency=220:duration=30,aformat=sample_fmts=fltp:sample_rates=44100,tremolo=f=2:d=0.3,afade=t=in:d=2,afade=t=out:st=27:d=3',
    30, 'Chill Lo-Fi Beat (30s)'
);

// 2. Upbeat Energy
generateAudio(
    path.join(MUSIC_DIR, 'upbeat-energy.mp3'),
    'sine=frequency=440:duration=25,aformat=sample_fmts=fltp:sample_rates=44100,tremolo=f=6:d=0.5,afade=t=in:d=1,afade=t=out:st=22:d=3',
    25, 'Upbeat Energy (25s)'
);

// 3. Epic Cinematic
generateAudio(
    path.join(MUSIC_DIR, 'epic-cinematic.mp3'),
    'sine=frequency=130:duration=30,aformat=sample_fmts=fltp:sample_rates=44100,aecho=0.8:0.88:60:0.4,afade=t=in:d=3,afade=t=out:st=26:d=4',
    30, 'Epic Cinematic (30s)'
);

// 4. Ambient Pad
generateAudio(
    path.join(MUSIC_DIR, 'ambient-pad.mp3'),
    'sine=frequency=174:duration=30,aformat=sample_fmts=fltp:sample_rates=44100,chorus=0.5:0.9:50|60:0.4|0.32:0.25|0.4:2|1.3,afade=t=in:d=3,afade=t=out:st=26:d=4',
    30, 'Ambient Pad (30s)'
);

// 5. Motivational Rise
generateAudio(
    path.join(MUSIC_DIR, 'motivational-rise.mp3'),
    'sine=frequency=330:duration=20,aformat=sample_fmts=fltp:sample_rates=44100,apulsator=mode=sine:hz=3,afade=t=in:d=2,afade=t=out:st=17:d=3',
    20, 'Motivational Rise (20s)'
);

// 6. Dark Suspense
generateAudio(
    path.join(MUSIC_DIR, 'dark-suspense.mp3'),
    'sine=frequency=80:duration=25,aformat=sample_fmts=fltp:sample_rates=44100,aecho=0.8:0.9:500:0.3,tremolo=f=0.5:d=0.7,afade=t=in:d=3,afade=t=out:st=22:d=3',
    25, 'Dark Suspense (25s)'
);

// 7. Happy Vibes
generateAudio(
    path.join(MUSIC_DIR, 'happy-vibes.mp3'),
    'sine=frequency=523:duration=20,aformat=sample_fmts=fltp:sample_rates=44100,vibrato=f=8:d=0.3,volume=0.6,afade=t=in:d=1,afade=t=out:st=17:d=3',
    20, 'Happy Vibes (20s)'
);

// 8. Gentle Piano Feel
generateAudio(
    path.join(MUSIC_DIR, 'gentle-piano.mp3'),
    'sine=frequency=261:duration=25,aformat=sample_fmts=fltp:sample_rates=44100,aecho=0.6:0.3:100:0.3,volume=0.5,afade=t=in:d=2,afade=t=out:st=22:d=3',
    25, 'Gentle Piano Feel (25s)'
);

console.log('\n🔊 Generating Sound Effects...\n');

// === SFX TRACKS (short effects) ===

// 1. Whoosh Transition
generateAudio(
    path.join(SFX_DIR, 'whoosh-transition.mp3'),
    'anoisesrc=d=0.8:c=pink:a=0.5,bandpass=f=2000:w=1500,afade=t=in:d=0.1,afade=t=out:st=0.3:d=0.5',
    0.8, 'Whoosh Transition'
);

// 2. Notification Ding
generateAudio(
    path.join(SFX_DIR, 'notification-ding.mp3'),
    'sine=frequency=880:duration=0.5,aformat=sample_fmts=fltp:sample_rates=44100,afade=t=out:st=0.1:d=0.4',
    0.5, 'Notification Ding'
);

// 3. Pop Click
generateAudio(
    path.join(SFX_DIR, 'pop-click.mp3'),
    'sine=frequency=1200:duration=0.15,aformat=sample_fmts=fltp:sample_rates=44100,afade=t=out:d=0.15',
    0.15, 'Pop Click'
);

// 4. Impact Hit
generateAudio(
    path.join(SFX_DIR, 'impact-hit.mp3'),
    'anoisesrc=d=0.6:c=brown:a=1,bandpass=f=100:w=200,afade=t=out:st=0.05:d=0.55',
    0.6, 'Impact Hit'
);

// 5. Swoosh Up
generateAudio(
    path.join(SFX_DIR, 'swoosh-up.mp3'),
    'anoisesrc=d=0.5:c=pink:a=0.7,bandpass=f=3000:w=2000,afade=t=in:d=0.05,afade=t=out:st=0.2:d=0.3',
    0.5, 'Swoosh Up'
);

// 6. Error Buzz
generateAudio(
    path.join(SFX_DIR, 'error-buzz.mp3'),
    'sine=frequency=200:duration=0.4,aformat=sample_fmts=fltp:sample_rates=44100,tremolo=f=20:d=0.8,afade=t=out:st=0.2:d=0.2',
    0.4, 'Error Buzz'
);

// 7. Success Chime
generateAudio(
    path.join(SFX_DIR, 'success-chime.mp3'),
    'sine=frequency=660:duration=0.6,aformat=sample_fmts=fltp:sample_rates=44100,aecho=0.6:0.3:50:0.3,afade=t=out:st=0.2:d=0.4',
    0.6, 'Success Chime'
);

// 8. Transition Slide
generateAudio(
    path.join(SFX_DIR, 'transition-slide.mp3'),
    'anoisesrc=d=0.7:c=white:a=0.3,bandpass=f=4000:w=3000,afade=t=in:d=0.1,afade=t=out:st=0.3:d=0.4',
    0.7, 'Transition Slide'
);

// 9. Sparkle Magic
generateAudio(
    path.join(SFX_DIR, 'sparkle-magic.mp3'),
    'sine=frequency=1760:duration=0.8,aformat=sample_fmts=fltp:sample_rates=44100,vibrato=f=12:d=0.5,aecho=0.5:0.3:30:0.4,afade=t=out:st=0.3:d=0.5',
    0.8, 'Sparkle Magic'
);

// 10. Camera Shutter
generateAudio(
    path.join(SFX_DIR, 'camera-shutter.mp3'),
    'anoisesrc=d=0.15:c=white:a=1,bandpass=f=5000:w=4000,afade=t=out:d=0.12',
    0.15, 'Camera Shutter'
);

// 11. Deep Bass Drop
generateAudio(
    path.join(SFX_DIR, 'bass-drop.mp3'),
    'sine=frequency=60:duration=1.5,aformat=sample_fmts=fltp:sample_rates=44100,aecho=0.8:0.7:100:0.5,afade=t=in:d=0.1,afade=t=out:st=0.5:d=1',
    1.5, 'Deep Bass Drop'
);

// 12. Typing Click
generateAudio(
    path.join(SFX_DIR, 'typing-click.mp3'),
    'sine=frequency=3000:duration=0.05,aformat=sample_fmts=fltp:sample_rates=44100,afade=t=out:d=0.05',
    0.05, 'Typing Click'
);

console.log('\n📦 Registering tracks in database...\n');

// === Register in SQLite ===
const initSqlJs = require('sql.js');
const { v4: uuidv4 } = require('uuid');
const dbPath = path.join(DATA_DIR, 'clipperskuy.db');

async function registerTracks() {
    const SQL = await initSqlJs();

    let db;
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath);
        db = new SQL.Database(buffer);
    } else {
        console.error('Database not found at', dbPath);
        console.log('Start the backend first to initialize the database.');
        process.exit(1);
    }

    // Music tracks
    const musicMeta = [
        { file: 'chill-lofi-beat.mp3', name: 'Chill Lo-Fi Beat', category: 'lofi', mood: 'calm', bpm: 85 },
        { file: 'upbeat-energy.mp3', name: 'Upbeat Energy', category: 'upbeat', mood: 'energetic', bpm: 128 },
        { file: 'epic-cinematic.mp3', name: 'Epic Cinematic', category: 'epic', mood: 'inspiring', bpm: 90 },
        { file: 'ambient-pad.mp3', name: 'Ambient Pad', category: 'chill', mood: 'calm', bpm: 70 },
        { file: 'motivational-rise.mp3', name: 'Motivational Rise', category: 'motivational', mood: 'inspiring', bpm: 120 },
        { file: 'dark-suspense.mp3', name: 'Dark Suspense', category: 'cinematic', mood: 'dark', bpm: 60 },
        { file: 'happy-vibes.mp3', name: 'Happy Vibes', category: 'upbeat', mood: 'happy', bpm: 140 },
        { file: 'gentle-piano.mp3', name: 'Gentle Piano', category: 'chill', mood: 'calm', bpm: 72 },
    ];

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

    let musicInserted = 0;
    for (const m of musicMeta) {
        const filePath = path.join(MUSIC_DIR, m.file);
        if (!fs.existsSync(filePath)) continue;

        // Check if already registered
        const existing = db.exec(`SELECT id FROM music_tracks WHERE file_name = '${m.file}'`);
        if (existing.length > 0 && existing[0].values.length > 0) {
            console.log(`  ⏭️  Skip (registered): ${m.name}`);
            continue;
        }

        const stat = fs.statSync(filePath);
        let duration = 0;
        try {
            const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
            const result = execSync(
                `"${ffprobe}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
                { encoding: 'utf-8', timeout: 10000 }
            ).trim();
            duration = parseFloat(result) || 0;
        } catch (e) { /* ignore */ }

        const id = uuidv4();
        db.run(
            `INSERT INTO music_tracks (id, name, file_path, file_name, category, mood, bpm, duration, file_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, m.name, filePath, m.file, m.category, m.mood, m.bpm, duration, stat.size]
        );
        console.log(`  ✅ Music: ${m.name} (${duration.toFixed(1)}s, ${(stat.size / 1024).toFixed(0)} KB)`);
        musicInserted++;
    }

    let sfxInserted = 0;
    for (const s of sfxMeta) {
        const filePath = path.join(SFX_DIR, s.file);
        if (!fs.existsSync(filePath)) continue;

        // Check if already registered
        const existing = db.exec(`SELECT id FROM sfx_tracks WHERE file_name = '${s.file}'`);
        if (existing.length > 0 && existing[0].values.length > 0) {
            console.log(`  ⏭️  Skip (registered): ${s.name}`);
            continue;
        }

        const stat = fs.statSync(filePath);
        let duration = 0;
        try {
            const ffprobe = process.env.FFPROBE_PATH || 'ffprobe';
            const result = execSync(
                `"${ffprobe}" -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`,
                { encoding: 'utf-8', timeout: 10000 }
            ).trim();
            duration = parseFloat(result) || 0;
        } catch (e) { /* ignore */ }

        const id = uuidv4();
        db.run(
            `INSERT INTO sfx_tracks (id, name, file_path, file_name, category, duration, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, s.name, filePath, s.file, s.category, duration, stat.size]
        );
        console.log(`  ✅ SFX: ${s.name} (${duration.toFixed(1)}s, ${(stat.size / 1024).toFixed(0)} KB)`);
        sfxInserted++;
    }

    // Save database  
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
    db.close();

    console.log(`\n🎉 Done! Inserted ${musicInserted} music + ${sfxInserted} SFX tracks.\n`);
}

registerTracks().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
