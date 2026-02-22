// Quick script to check & reset stuck rendering clips
const http = require('http');

function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

function httpPost(url) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, { method: 'POST' }, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.end();
    });
}

async function main() {
    const projects = await httpGet('http://localhost:5000/api/projects');
    const list = projects.projects || projects;

    for (const p of list) {
        const detail = await httpGet(`http://localhost:5000/api/projects/${p.id}`);
        const clips = detail.clips || [];
        const stuck = clips.filter(c => c.status === 'rendering');

        if (stuck.length > 0) {
            console.log(`\nProject: ${p.name}`);
            for (const c of stuck) {
                console.log(`  Clip #${c.clip_number} (${c.id}) — status: ${c.status}`);
                try {
                    const result = await httpPost(`http://localhost:5000/api/projects/clips/${c.id}/reset-render`);
                    console.log(`  ✅ Reset to: ${result.clip?.status || 'done'}`);
                } catch (e) {
                    console.log(`  ❌ Reset failed: ${e.message}`);
                }
            }
        } else {
            console.log(`Project: ${p.name} — ${clips.length} clips, none stuck`);
        }
    }
    console.log('\nDone!');
}

main().catch(console.error);
