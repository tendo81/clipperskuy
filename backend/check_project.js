const db = require('better-sqlite3')('data/clipperskuy.db');
const clips = db.prepare(`
    SELECT c.id, c.title, c.status, c.output_path, p.name as project_name, p.reframing_mode
    FROM clips c JOIN projects p ON c.project_id = p.id
    WHERE c.id IN (?,?)
`).all('2fc7ec3d-e889-4c22-b23c-807c2fb6cdaf', 'b93b9559-2867-4be4-88ff-585153a9dcc8');

clips.forEach(c => {
    console.log(`\nClip: ${c.title}`);
    console.log(`  Project: ${c.project_name}`);
    console.log(`  Reframing: ${c.reframing_mode}`);
    console.log(`  Status: ${c.status}`);
});
db.close();
