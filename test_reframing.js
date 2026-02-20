/**
 * Test All Reframing Modes
 * 
 * Tests center, fit, face_track, and split modes
 * by temporarily changing project reframing_mode and rendering a clip.
 */

const API = 'http://localhost:5000/api';

async function testMode(projectId, clipId, mode) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 Testing mode: ${mode.toUpperCase()}`);
    console.log('='.repeat(60));

    // 1. Update project reframing mode
    const updateRes = await fetch(`${API}/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reframing_mode: mode })
    });
    if (!updateRes.ok) {
        console.error(`❌ Failed to update mode: ${await updateRes.text()}`);
        return false;
    }
    console.log(`✅ Project mode set to: ${mode}`);

    // 2. Render clip
    console.log(`🎬 Starting render...`);
    const startTime = Date.now();

    const renderRes = await fetch(`${API}/projects/clips/${clipId}/render`, {
        method: 'POST'
    });

    if (!renderRes.ok) {
        const err = await renderRes.text();
        console.error(`❌ Render request failed: ${err}`);
        return false;
    }

    // 3. Wait for render to complete (poll status)
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes max

    while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000)); // wait 2 sec
        attempts++;

        const statusRes = await fetch(`${API}/projects/${projectId}`);
        const data = await statusRes.json();
        const clip = data.clips?.find(c => c.id === clipId);

        if (!clip) {
            console.error(`❌ Clip not found!`);
            return false;
        }

        if (clip.status === 'completed' || clip.output_path) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`✅ Mode "${mode}" PASSED! (${elapsed}s)`);
            console.log(`   Output: ${clip.output_path}`);
            return true;
        }

        if (clip.status === 'error' || clip.status === 'failed') {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.error(`❌ Mode "${mode}" FAILED! (${elapsed}s)`);
            console.error(`   Status: ${clip.status}`);
            return false;
        }

        // Still rendering
        if (attempts % 5 === 0) {
            console.log(`   ⏳ Still rendering... (${attempts * 2}s, status: ${clip.status})`);
        }
    }

    console.error(`❌ Mode "${mode}" TIMEOUT after ${maxAttempts * 2}s`);
    return false;
}

async function main() {
    const projectId = '733480be-9177-49d6-9740-b06210e03f04';
    const clipId = '54a5d3b9-27b4-4c7e-8103-783b1652d948';

    const modes = ['center', 'fit', 'split', 'face_track'];
    const results = {};

    console.log('🚀 Testing all reframing modes...');
    console.log(`   Project: ${projectId}`);
    console.log(`   Clip: ${clipId}`);

    for (const mode of modes) {
        results[mode] = await testMode(projectId, clipId, mode);

        // Reset clip status between tests
        await fetch(`${API}/projects/clips/${clipId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'ready' })
        });

        // Small delay between tests
        await new Promise(r => setTimeout(r, 1000));
    }

    // Restore original mode
    await fetch(`${API}/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reframing_mode: 'fit' })
    });

    // Print summary
    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 TEST RESULTS:');
    console.log('='.repeat(60));
    for (const [mode, passed] of Object.entries(results)) {
        console.log(`   ${passed ? '✅' : '❌'} ${mode.toUpperCase().padEnd(15)} ${passed ? 'PASSED' : 'FAILED'}`);
    }

    const allPassed = Object.values(results).every(v => v);
    console.log(`\n${allPassed ? '🎉 ALL TESTS PASSED!' : '⚠️  SOME TESTS FAILED!'}`);
    process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
