/**
 * Test full render flow:
 * 1. Pick a clip
 * 2. Assign background music
 * 3. Add SFX
 * 4. Set hook header
 * 5. Trigger render
 * 6. Poll until complete
 */
const http = require('http');
const API = 'http://localhost:5000/api';

function request(method, url, body) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const opts = { hostname: u.hostname, port: u.port, path: u.pathname, method };
        if (body) opts.headers = { 'Content-Type': 'application/json' };

        const req = http.request(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log('=== Full Render Test ===\n');

    // 1. Get projects & pick first clip
    const { data: projList } = await request('GET', `${API}/projects`);
    const projects = projList.projects || projList;
    const proj = projects[0];
    console.log(`📁 Project: ${proj.name}`);

    const { data: projDetail } = await request('GET', `${API}/projects/${proj.id}`);
    const clips = (projDetail.clips || []).sort((a, b) => a.clip_number - b.clip_number);

    // Pick first clip that is 'detected' (not already rendered)
    const clip = clips.find(c => c.status === 'detected') || clips[0];
    console.log(`🎬 Clip #${clip.clip_number}: "${clip.title}" (${clip.status})`);
    console.log(`   Duration: ${(clip.end_time - clip.start_time).toFixed(1)}s`);

    // 2. Get available music & assign one
    const { data: musicTracks } = await request('GET', `${API}/music`);
    console.log(`\n🎵 Available music: ${musicTracks.length} tracks`);

    if (musicTracks.length > 0) {
        const music = musicTracks[0];
        console.log(`   Assigning: "${music.name}" (${music.category})`);

        const { status } = await request('PUT', `${API}/projects/clips/${clip.id}`, {
            music_track_id: music.id,
            music_volume: 0.15
        });
        console.log(`   ${status === 200 ? '✅' : '❌'} Music assigned (volume: 15%)`);
    } else {
        console.log('   ⚠️ No music tracks available');
    }

    // 3. Add SFX to clip
    const { data: sfxTracks } = await request('GET', `${API}/sfx`);
    console.log(`\n🔊 Available SFX: ${sfxTracks.length} tracks`);

    if (sfxTracks.length > 0) {
        // Add whoosh at start
        const whoosh = sfxTracks.find(s => s.category === 'whoosh') || sfxTracks[0];
        const { status: s1 } = await request('POST', `${API}/sfx/clip/${clip.id}`, {
            sfx_id: whoosh.id,
            position: 0.5,
            volume: 0.8
        });
        console.log(`   ${s1 < 300 ? '✅' : '❌'} Added "${whoosh.name}" at 0.5s`);

        // Add notification ding at 3s
        const ding = sfxTracks.find(s => s.category === 'notification') || sfxTracks[1];
        if (ding && ding.id !== whoosh.id) {
            const { status: s2 } = await request('POST', `${API}/sfx/clip/${clip.id}`, {
                sfx_id: ding.id,
                position: 3.0,
                volume: 0.6
            });
            console.log(`   ${s2 < 300 ? '✅' : '❌'} Added "${ding.name}" at 3.0s`);
        }
    }

    // 4. Set hook header
    const hookText = clip.hook_text || clip.title || 'Test Hook';
    const hookSettings = {
        duration: 5,
        position: 'top',
        fontSize: 48,
        textColor: '#FFFFFF',
        bgColor: '#FF0000',
        bgOpacity: '0.85'
    };

    const { status: hookStatus } = await request('PUT', `${API}/projects/clips/${clip.id}`, {
        hook_text: hookText,
        hook_settings: hookSettings
    });
    console.log(`\n📌 Hook: "${hookText.substring(0, 50)}..."`);
    console.log(`   ${hookStatus === 200 ? '✅' : '❌'} Hook header set`);

    // 5. Trigger render
    console.log('\n🎬 Starting render...');
    const { status: renderStatus, data: renderData } = await request('POST', `${API}/projects/clips/${clip.id}/render`);
    console.log(`   Status: ${renderStatus} — ${renderData.message || renderData.error || 'unknown'}`);

    if (renderStatus !== 200) {
        console.log('❌ Render failed to start!');
        return;
    }

    // 6. Poll for completion (max 5 minutes)
    console.log('\n⏳ Polling for render completion...');
    const startTime = Date.now();
    const maxWait = 5 * 60 * 1000; // 5 minutes

    while (Date.now() - startTime < maxWait) {
        await sleep(5000);
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        // Check clip status
        const { data: projCheck } = await request('GET', `${API}/projects/${proj.id}`);
        const clipCheck = (projCheck.clips || []).find(c => c.id === clip.id);

        if (!clipCheck) {
            console.log(`   ❌ Clip not found! (${elapsed}s)`);
            return;
        }

        if (clipCheck.status === 'rendered') {
            console.log(`   ✅ RENDER COMPLETE! (${elapsed}s)`);
            console.log(`   Output: ${clipCheck.output_path}`);

            // Try to check download
            const { status: dlStatus } = await request('HEAD', `${API}/projects/clips/${clip.id}/download`);
            console.log(`   Download: ${dlStatus === 200 ? '✅ Available' : '❌ Not available (' + dlStatus + ')'}`);

            console.log('\n🎉 FULL TEST PASSED! Music + SFX + Hook + Render = SUCCESS');
            return;
        }

        if (clipCheck.status === 'failed') {
            console.log(`   ❌ RENDER FAILED (${elapsed}s)`);
            console.log(`   Error: ${clipCheck.error_message || 'unknown'}`);
            return;
        }

        process.stdout.write(`   ⏳ ${clipCheck.status}... (${elapsed}s)\r`);
    }

    console.log('\n   ⏱️ Timeout after 5 minutes. Render still running.');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
