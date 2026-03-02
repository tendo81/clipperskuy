// Inject a diagnostic trace into the render pipeline
// Shows exactly what line is executing by writing to a file
const fs = require('fs');
const logFile = 'C:\\Users\\kuyka\\AppData\\Local\\Temp\\render_trace.log';

// Monkey-patch fs.appendFileSync to trace 
const { exec } = require('child_process');
const path = require('path');
const db = require('better-sqlite3')('data/clipperskuy.db');

const clip = db.prepare("SELECT * FROM clips WHERE id='64f0e012-249d-4154-a2f3-0125386ec4f7'").get();
const project = db.prepare("SELECT * FROM projects WHERE id=?").get(clip.project_id);
db.close();

// Load and instrument clipRenderer
const clipRendererPath = require.resolve('./src/services/clipRenderer');
console.log('clipRenderer path:', clipRendererPath);

// Delete cache and re-require
delete require.cache[require.resolve('./src/services/clipRenderer')];
const { renderClip } = require('./src/services/clipRenderer');

fs.writeFileSync(logFile, `[${new Date().toISOString()}] Starting render trace\n`);

const emit = (pct, msg) => {
    const line = `[${new Date().toISOString()}] ${pct}% - ${msg}\n`;
    fs.appendFileSync(logFile, line);
    process.stdout.write(line);
};

console.log('Starting render...');
renderClip(clip.id, emit, null)
    .then(result => {
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] DONE: ${JSON.stringify(result)}\n`);
        console.log('Render done:', result);
    })
    .catch(err => {
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ERROR: ${err.message}\n`);
        console.error('Render error:', err.message);
    });

// Print log file every 5 seconds
setInterval(() => {
    try {
        const log = fs.readFileSync(logFile, 'utf8');
        const lines = log.split('\n').filter(Boolean);
        const lastLines = lines.slice(-3).join('\n');
        console.log('[TRACE]', lastLines);
    } catch (e) { }
}, 5000);
