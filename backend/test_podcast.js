// Simulate what generatePodcastCrop returns for this project's video
// to check the filter string
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'clipperskuy.db'));

// Get the project source video
const proj = db.prepare("SELECT source_path, reframing_mode FROM projects WHERE name LIKE '%GIA%'").get();
const clip = db.prepare("SELECT start_time, end_time FROM clips WHERE id = ?").get('2fc7ec3d-e889-4c22-b23c-807c2fb6cdaf');
db.close();

console.log('Project source:', proj?.source_path);
console.log('Reframing mode:', proj?.reframing_mode);
console.log('Clip start:', clip?.start_time, 'end:', clip?.end_time);

// Now simulate the filter
const { generatePodcastCrop } = require('./src/services/faceTracker');

const srcPath = proj.source_path;
const targetW = 720;
const targetH = 1280;
const duration = (clip.end_time - clip.start_time);
const startTime = clip.start_time;

console.log('\nRunning generatePodcastCrop...');
generatePodcastCrop(srcPath, targetW, targetH, duration, startTime)
    .then(result => {
        console.log('\n=== RESULT ===');
        console.log('Mode:', result.mode);
        console.log('FaceCount:', result.faceCount);
        console.log('CropFilter (first 500):', result.cropFilter?.substring(0, 500));
    })
    .catch(err => console.error('ERROR:', err.message));
