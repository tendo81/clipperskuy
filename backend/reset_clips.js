// Reset clips to detected so they re-render
const db = require('better-sqlite3')('data/clipperskuy.db');
db.prepare("UPDATE clips SET status='detected', output_path=NULL WHERE id IN (?,?)")
    .run('2fc7ec3d-e889-4c22-b23c-807c2fb6cdaf', 'b93b9559-2867-4be4-88ff-585153a9dcc8');
console.log('Reset to detected:', db.prepare("SELECT id, title, status FROM clips WHERE id IN (?,?)").all('2fc7ec3d-e889-4c22-b23c-807c2fb6cdaf', 'b93b9559-2867-4be4-88ff-585153a9dcc8'));
db.close();
