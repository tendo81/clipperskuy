const db = require('better-sqlite3')('data/clipperskuy.db');
const { execSync } = require('child_process');
const c = db.prepare("SELECT output_path FROM clips WHERE id = ?").get('2fc7ec3d-e889-4c22-b23c-807c2fb6cdaf');
db.close();

const ffprobe = 'C:\\ffmpeg\\bin\\ffprobe.exe';
const info = execSync(`"${ffprobe}" -v quiet -show_entries stream=width,height -of csv=p=0 -select_streams v:0 "${c.output_path}"`, { encoding: 'utf-8' });
console.log('Video dimensions (w,h):', info.trim());
