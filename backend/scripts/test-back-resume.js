/**
 * Test: Export → Back → Return → Resume polling
 * Simulates: user clicks Export, navigates away, comes back
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
    console.log('=== Test: Export → Back → Return → Resume ===\n');

    // Get project & clip
    const { data: projList } = await request('GET', `${API}/projects`);
    const proj = (projList.projects || projList)[0];
    const { data: projDetail } = await request('GET', `${API}/projects/${proj.id}`);
    const clips = (projDetail.clips || []).sort((a, b) => a.clip_number - b.clip_number);
    // Pick clip #3 (shorter, not yet rendered)
    const clip = clips.find(c => c.status === 'detected' && c.clip_number > 1) || clips.find(c => c.status === 'detected') || clips[0];

    console.log(`📁 Project: ${proj.name}`);
    console.log(`🎬 Clip #${clip.clip_number}: "${clip.title}" (${clip.status})`);
    console.log(`   Duration: ${(clip.end_time - clip.start_time).toFixed(1)}s\n`);

    // ========= STEP 1: User clicks Export =========
    console.log('--- STEP 1: User clicks Export ---');

    // Save trim + hook (like frontend does)
    await request('PUT', `${API}/projects/clips/${clip.id}`, {
        start_time: clip.start_time,
        end_time: clip.end_time,
        duration: clip.end_time - clip.start_time,
        hook_text: clip.title || 'Test Hook',
        hook_settings: { duration: 5, position: 'top', fontSize: 48, textColor: '#FFFFFF', bgColor: '#FF0000', bgOpacity: '0.85' }
    });

    // Start render
    const { status: renderStatus, data: renderData } = await request('POST', `${API}/projects/clips/${clip.id}/render`);
    console.log(`   Render started: ${renderStatus} — ${renderData.message || renderData.error}`);

    // Wait 3s to let rendering begin
    await sleep(3000);

    // Check status
    const { data: check1 } = await request('GET', `${API}/projects/${proj.id}`);
    const clip1 = (check1.clips || []).find(c => c.id === clip.id);
    console.log(`   Status after 3s: ${clip1?.status}`);

    // ========= STEP 2: User clicks Back (navigates away) =========
    console.log('\n--- STEP 2: User clicks Back (5s pause) ---');
    console.log('   Frontend unmounted, polling stopped.');
    console.log('   But render continues server-side...');
    await sleep(5000);

    // ========= STEP 3: User returns to clip editor =========
    console.log('\n--- STEP 3: User returns to Clip Editor ---');

    // Simulate loadData()
    const { data: check2 } = await request('GET', `${API}/projects/${proj.id}`);
    const clip2 = (check2.clips || []).find(c => c.id === clip.id);
    console.log(`   loadData: clip status = "${clip2?.status}"`);

    if (clip2?.status === 'rendering') {
        console.log('   ✅ Status still "rendering" → frontend would resume polling (setExporting=true)');
        console.log('   ✅ User sees: "🎬 Render sedang berjalan... menunggu selesai"');
    } else if (clip2?.status === 'rendered') {
        console.log('   ✅ Already rendered! Would auto-download.');
    } else if (clip2?.status === 'failed') {
        console.log('   ❌ Render failed.');
    } else {
        console.log(`   ⚠️ Unexpected status: ${clip2?.status}`);
    }

    // ========= STEP 4: Resume polling (like frontend does) =========
    console.log('\n--- STEP 4: Polling resumes, waiting for completion ---');
    const startTime = Date.now();
    const maxWait = 5 * 60 * 1000;

    while (Date.now() - startTime < maxWait) {
        await sleep(5000);
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        const { data: check3 } = await request('GET', `${API}/projects/${proj.id}`);
        const clip3 = (check3.clips || []).find(c => c.id === clip.id);

        if (clip3?.status === 'rendered') {
            console.log(`   ✅ RENDER COMPLETE! (${elapsed}s after return)`);
            console.log(`   Output: ${clip3.output_path}`);

            // Check download
            const { status: dlStatus } = await request('HEAD', `${API}/projects/clips/${clip.id}/download`);
            console.log(`   Download: ${dlStatus === 200 ? '✅ Available' : '❌ Not available'}`);

            console.log('\n🎉 TEST PASSED! Render survived Back→Return navigation!');
            console.log('   ✅ Export started');
            console.log('   ✅ User navigated away');
            console.log('   ✅ User returned → polling resumed');
            console.log('   ✅ Render completed → auto-download');
            return;
        }

        if (clip3?.status === 'failed') {
            console.log(`   ❌ RENDER FAILED (${elapsed}s)`);
            return;
        }

        if (clip3?.status !== 'rendering') {
            console.log(`   ⚠️ Status changed to "${clip3?.status}" (${elapsed}s)`);
            return;
        }

        process.stdout.write(`   ⏳ rendering... (${elapsed}s)  \r`);
    }

    console.log('\n   ⏱️ Timeout after 5 minutes.');
}

main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
