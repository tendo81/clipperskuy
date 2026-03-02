/**
 * import_opusflow.js
 * Import projects + clips dari opusflow.db → clipperskuy.db
 */

const Database = require('better-sqlite3');

const src = new Database('data/opusflow.db', { readonly: true });
const dst = new Database('data/clipperskuy.db');
dst.pragma('journal_mode = WAL');
dst.pragma('foreign_keys = ON');

try {
    // ===== 1. Import Projects =====
    const projects = src.prepare('SELECT * FROM projects').all();
    console.log(`📦 Found ${projects.length} projects to import`);

    const insertProject = dst.prepare(`
    INSERT OR IGNORE INTO projects 
      (id, name, source_path, source_url, thumbnail_path, duration, width, height, fps,
       file_size, status, platform, aspect_ratio, reframing_mode, ai_provider, language,
       clip_count_target, min_duration, max_duration, brand_kit_id, error_message, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

    const importProjects = dst.transaction((rows) => {
        for (const p of rows) {
            insertProject.run(
                p.id, p.name, p.source_path, p.source_url, p.thumbnail_path,
                p.duration, p.width, p.height, p.fps, p.file_size,
                p.status, p.platform || 'tiktok', p.aspect_ratio || '9:16',
                p.reframing_mode || 'center', p.ai_provider || 'groq',
                p.language || 'auto', p.clip_count_target || 'medium',
                p.min_duration || 15, p.max_duration || 60,
                p.brand_kit_id, p.error_message,
                p.created_at, p.updated_at
            );
        }
    });
    importProjects(projects);
    console.log(`   ✅ ${projects.length} projects imported`);

    // ===== 2. Import Clips =====
    const clips = src.prepare('SELECT * FROM clips').all();
    console.log(`🎬 Found ${clips.length} clips to import`);

    const insertClip = dst.prepare(`
    INSERT OR IGNORE INTO clips
      (id, project_id, clip_number, title, hook_text, summary, start_time, end_time,
       duration, content_type, virality_score, score_hook, score_content, score_emotion,
       score_share, score_complete, improvement_tips, hashtags, transcript,
       platform_descriptions, caption_style, caption_settings, output_path,
       thumbnail_path, status, is_selected, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

    const importClips = dst.transaction((rows) => {
        for (const c of rows) {
            insertClip.run(
                c.id, c.project_id, c.clip_number, c.title, c.hook_text, c.summary,
                c.start_time, c.end_time, c.duration, c.content_type,
                c.virality_score || 0, c.score_hook || 0, c.score_content || 0,
                c.score_emotion || 0, c.score_share || 0, c.score_complete || 0,
                c.improvement_tips, c.hashtags, c.transcript,
                c.platform_descriptions, c.caption_style || 'hormozi',
                c.caption_settings, c.output_path, c.thumbnail_path,
                c.status || 'done', c.is_selected ?? 1, c.created_at
            );
        }
    });
    importClips(clips);
    console.log(`   ✅ ${clips.length} clips imported`);

    // ===== 3. Import Transcripts =====
    const hasTranscripts = src.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='transcripts'").get();
    if (hasTranscripts) {
        const transcripts = src.prepare('SELECT * FROM transcripts').all();
        if (transcripts.length > 0) {
            const insertTr = dst.prepare(`
        INSERT OR IGNORE INTO transcripts (id, project_id, full_text, language, provider, word_data, segment_data, filler_words, silence_gaps, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `);
            dst.transaction((rows) => {
                for (const t of rows) insertTr.run(t.id, t.project_id, t.full_text, t.language, t.provider, t.word_data, t.segment_data, t.filler_words, t.silence_gaps, t.created_at);
            })(transcripts);
            console.log(`   ✅ ${transcripts.length} transcripts imported`);
        }
    }

    // ===== Summary =====
    const pCount = dst.prepare('SELECT COUNT(*) as c FROM projects').get();
    const cCount = dst.prepare('SELECT COUNT(*) as c FROM clips').get();
    console.log('\n🎉 Import complete!');
    console.log('─────────────────────');
    console.log(`Total Projects : ${pCount.c}`);
    console.log(`Total Clips    : ${cCount.c}`);
    console.log('─────────────────────');
    console.log('✅ Refresh browser untuk melihat proyek.');

} catch (err) {
    console.error('❌ Import failed:', err.message);
} finally {
    src.close();
    dst.close();
}
