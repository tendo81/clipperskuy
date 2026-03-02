// Get clip ID for "Pentingnya Berolahraga" 
const Database = require('better-sqlite3');
const path = require('path');
const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'clipperskuy.db'));
const clip = db.prepare("SELECT id FROM clips WHERE title LIKE '%Berolahraga%' AND status = 'detected' LIMIT 1").get();
console.log(clip ? clip.id : 'NOT FOUND');
db.close();
