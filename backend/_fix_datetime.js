const fs = require('fs');
const file = 'backend/src/services/license.js';
let content = fs.readFileSync(file, 'utf8');

// Fix: ganti semua single-quoted datetime('now') dalam JS string single-quote jadi CURRENT_TIMESTAMP
// Also fix double-quoted kalo masih ada
const before1 = (content.match(/datetime\('now'\)/g) || []).length;
const before2 = (content.match(/datetime\("now"\)/g) || []).length;
content = content.replace(/datetime\('now'\)/g, 'CURRENT_TIMESTAMP');
content = content.replace(/datetime\("now"\)/g, 'CURRENT_TIMESTAMP');
fs.writeFileSync(file, content, 'utf8');
console.log(`Fixed ${before1 + before2} occurrences → CURRENT_TIMESTAMP`);
