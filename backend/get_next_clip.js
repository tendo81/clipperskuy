// Reset clip status dan trigger render ulang, lalu cek frame
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, 'data');
const db = new Database(path.join(DATA_DIR, 'clipperskuy.db'));

// Reset clip Kesehatan ke detected agar bisa di-render ulang
const clip = db.prepare("SELECT id FROM clips WHERE title LIKE '%Kesehatan%' AND status='detected' LIMIT 1").get();
console.log('Clip to render:', clip);
db.close();
