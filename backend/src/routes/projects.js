const express = require('express');
const router = express.Router();
const { all, get, run } = require('../database');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { getVideoInfo, generateThumbnail, formatDuration } = require('../services/ffmpeg');
const { getYoutubeInfo, downloadYoutube, getYoutubeCaptions, downloadYoutubeCaptions } = require('../services/youtube');
const { processProject, cancelProject, addToQueue, removeFromQueue, getQueueStatus } = require('../services/pipeline');
const { renderClip, renderAllClips } = require('../services/clipRenderer');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// File upload config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(DATA_DIR, 'uploads');
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${uuidv4()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv', '.flv'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error(`File type ${ext} not supported`));
    }
});

// Transcript file upload config
const transcriptUpload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.srt', '.vtt', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error(`File type ${ext} not supported. Use .srt, .vtt, or .txt`));
    }
});

// GET /api/projects/stats/overview
router.get('/stats/overview', (req, res) => {
    try {
        const totalProjects = get('SELECT COUNT(*) as count FROM projects');
        const totalClips = get('SELECT COUNT(*) as count FROM clips');
        const completedProjects = get("SELECT COUNT(*) as count FROM projects WHERE status = 'completed'");
        const totalDuration = get('SELECT COALESCE(SUM(duration), 0) as total FROM projects');
        const exportedClips = get("SELECT COUNT(*) as count FROM clips WHERE status = 'rendered'");
        const clipsDuration = get('SELECT COALESCE(SUM(duration), 0) as total FROM clips');
        const favCaptionStyle = get("SELECT caption_style, COUNT(*) as cnt FROM clips GROUP BY caption_style ORDER BY cnt DESC LIMIT 1");

        // Music tracks count
        let musicCount = 0;
        try {
            const mc = get('SELECT COUNT(*) as count FROM music_tracks');
            musicCount = mc?.count || 0;
        } catch (e) { /* table may not exist */ }

        res.json({
            totalProjects: totalProjects?.count || 0,
            totalClips: totalClips?.count || 0,
            completedProjects: completedProjects?.count || 0,
            totalDuration: totalDuration?.total || 0,
            exportedClips: exportedClips?.count || 0,
            clipsDuration: clipsDuration?.total || 0,
            favCaptionStyle: favCaptionStyle?.caption_style || 'hormozi',
            musicTracks: musicCount
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/projects
router.get('/', (req, res) => {
    try {
        const projects = all('SELECT * FROM projects ORDER BY created_at DESC');
        // Get clip counts for each project
        const withCounts = projects.map(p => {
            const clipData = get('SELECT COUNT(*) as count FROM clips WHERE project_id = ?', [p.id]);
            return { ...p, clip_count: clipData?.count || 0 };
        });
        res.json({ projects: withCounts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/projects/:id
router.get('/:id', (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const clips = all('SELECT * FROM clips WHERE project_id = ? ORDER BY virality_score DESC', [req.params.id]);
        const transcript = get('SELECT * FROM transcripts WHERE project_id = ?', [req.params.id]);

        res.json({ project, clips, transcript });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/upload — Upload video + extract metadata
router.post('/upload', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No video file uploaded' });

        const id = uuidv4();
        const { platform, aspect_ratio, reframing_mode, language, clip_count_target, min_duration, max_duration } = req.body;

        // Extract video info
        let videoInfo = { duration: 0, width: 0, height: 0, fps: 30 };
        try {
            videoInfo = await getVideoInfo(req.file.path);
        } catch (e) {
            console.error('[FFmpeg] Could not get video info:', e.message);
        }

        // Generate thumbnail
        let thumbnailPath = null;
        try {
            const thumbDir = path.join(DATA_DIR, 'thumbnails');
            const thumbTime = videoInfo.duration > 5 ? '00:00:03' : '00:00:01';
            thumbnailPath = await generateThumbnail(req.file.path, thumbDir, thumbTime);
            // Store relative path for serving
            thumbnailPath = path.relative(DATA_DIR, thumbnailPath).replace(/\\/g, '/');
        } catch (e) {
            console.error('[FFmpeg] Could not generate thumbnail:', e.message);
        }

        run(`
      INSERT INTO projects (id, name, source_path, thumbnail_path, duration, width, height, fps, file_size, platform, aspect_ratio, reframing_mode, language, clip_count_target, min_duration, max_duration)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            id,
            path.parse(req.file.originalname).name,
            req.file.path,
            thumbnailPath,
            videoInfo.duration,
            videoInfo.width,
            videoInfo.height,
            videoInfo.fps,
            req.file.size,
            platform || 'tiktok',
            aspect_ratio || '9:16',
            reframing_mode || 'center',
            language || 'auto',
            clip_count_target || 'medium',
            min_duration || 15,
            max_duration || 60
        ]);

        const project = get('SELECT * FROM projects WHERE id = ?', [id]);

        // Emit socket event
        const io = req.app.get('io');
        if (io) io.emit('project:created', project);

        console.log(`[Upload] Project created: ${project.name} (${formatDuration(videoInfo.duration)}, ${videoInfo.width}x${videoInfo.height})`);

        res.json({ project });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/projects/:id — Update project
router.put('/:id', (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const fields = req.body;
        const allowed = ['name', 'status', 'platform', 'aspect_ratio', 'reframing_mode', 'language', 'clip_count_target', 'min_duration', 'max_duration', 'brand_kit_id', 'error_message'];

        for (const [key, value] of Object.entries(fields)) {
            if (allowed.includes(key)) {
                run(`UPDATE projects SET ${key} = ?, updated_at = datetime('now') WHERE id = ?`, [value, req.params.id]);
            }
        }

        const updated = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        res.json({ project: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/:id/process — Start AI processing pipeline
router.post('/:id/process', async (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        if (['transcribing', 'analyzing', 'clipping'].includes(project.status)) {
            return res.status(400).json({ error: 'Project is already being processed' });
        }

        const io = req.app.get('io');

        // Start pipeline in background (don't await — return immediately)
        res.json({ message: 'Processing started', projectId: project.id });

        // Run pipeline async
        processProject(project.id, io)
            .then(result => {
                console.log(`[Process] Complete: ${result.clips} clips detected`);
                if (io) io.emit('project:updated', { id: project.id, status: 'completed' });
            })
            .catch(err => {
                if (err.message === 'CANCELLED') {
                    console.log(`[Process] Cancelled: ${project.id}`);
                    if (io) io.emit('project:updated', { id: project.id, status: 'cancelled' });
                } else {
                    console.error(`[Process] Failed: ${err.message}`);
                    if (io) io.emit('project:updated', { id: project.id, status: 'failed', error: err.message });
                }
            });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/:id/cancel — Cancel active processing
router.post('/:id/cancel', (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const cancelled = cancelProject(req.params.id);
        if (cancelled) {
            res.json({ message: 'Cancel signal sent', projectId: project.id });
        } else {
            res.status(400).json({ error: 'No active processing to cancel for this project' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ===== Queue Routes =====

// POST /api/projects/queue/add — Add project to processing queue
router.post('/queue/add', (req, res) => {
    try {
        const { projectId } = req.body;
        if (!projectId) return res.status(400).json({ error: 'projectId is required' });

        const project = get('SELECT * FROM projects WHERE id = ?', [projectId]);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const io = req.app.get('io');
        const result = addToQueue(projectId, io);

        if (result.queued) {
            res.json({ message: `Added to queue (position ${result.position})`, ...result });
        } else {
            res.status(400).json({ error: result.reason });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/projects/queue/status — Get queue status
router.get('/queue/status', (req, res) => {
    try {
        res.json(getQueueStatus());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/queue/:id/remove — Remove from queue
router.post('/queue/:id/remove', (req, res) => {
    try {
        const removed = removeFromQueue(req.params.id);
        if (removed) {
            const io = req.app.get('io');
            if (io) io.emit('queue:updated', getQueueStatus());
            res.json({ message: 'Removed from queue' });
        } else {
            res.status(404).json({ error: 'Project not found in queue' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/queue/batch — Add multiple projects to queue
router.post('/queue/batch', (req, res) => {
    try {
        const { projectIds } = req.body;
        if (!projectIds || !Array.isArray(projectIds)) {
            return res.status(400).json({ error: 'projectIds array is required' });
        }

        const io = req.app.get('io');
        const results = projectIds.map(pid => {
            const project = get('SELECT * FROM projects WHERE id = ?', [pid]);
            if (!project) return { projectId: pid, queued: false, reason: 'Not found' };
            return { projectId: pid, ...addToQueue(pid, io) };
        });

        const queued = results.filter(r => r.queued).length;
        res.json({ message: `${queued}/${projectIds.length} added to queue`, results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/projects/:id/stream — Stream source video (supports Range requests for seeking)
router.get('/:id/stream', (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        if (!project.source_path || !fs.existsSync(project.source_path)) {
            return res.status(404).json({ error: 'Source video not found' });
        }

        const stat = fs.statSync(project.source_path);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = end - start + 1;

            const file = fs.createReadStream(project.source_path, { start, end });
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': 'video/mp4',
            });
            file.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
            });
            fs.createReadStream(project.source_path).pipe(res);
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/projects/clips/:clipId — Update clip properties (trim, title, etc.)
router.put('/clips/:clipId', (req, res) => {
    try {
        const clip = get('SELECT * FROM clips WHERE id = ?', [req.params.clipId]);
        if (!clip) return res.status(404).json({ error: 'Clip not found' });

        const { start_time, end_time, duration, title, caption_style, caption_settings, music_track_id, music_volume } = req.body;

        if (start_time !== undefined) {
            run('UPDATE clips SET start_time = ? WHERE id = ?', [start_time, req.params.clipId]);
        }
        if (end_time !== undefined) {
            run('UPDATE clips SET end_time = ? WHERE id = ?', [end_time, req.params.clipId]);
        }
        if (duration !== undefined) {
            run('UPDATE clips SET duration = ? WHERE id = ?', [duration, req.params.clipId]);
        }
        if (title !== undefined) {
            run('UPDATE clips SET title = ? WHERE id = ?', [title, req.params.clipId]);
        }
        if (caption_style !== undefined) {
            run('UPDATE clips SET caption_style = ? WHERE id = ?', [caption_style, req.params.clipId]);
        }
        if (caption_settings !== undefined) {
            run('UPDATE clips SET caption_settings = ? WHERE id = ?', [
                typeof caption_settings === 'string' ? caption_settings : JSON.stringify(caption_settings),
                req.params.clipId
            ]);
        }
        if (music_track_id !== undefined) {
            run('UPDATE clips SET music_track_id = ? WHERE id = ?', [music_track_id, req.params.clipId]);
        }
        if (music_volume !== undefined) {
            run('UPDATE clips SET music_volume = ? WHERE id = ?', [music_volume, req.params.clipId]);
        }

        // If times changed, reset render status (clip needs re-render)
        if (start_time !== undefined || end_time !== undefined) {
            run("UPDATE clips SET status = 'detected', output_path = NULL WHERE id = ?", [req.params.clipId]);
        }

        const updated = get('SELECT * FROM clips WHERE id = ?', [req.params.clipId]);
        res.json({ clip: updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/projects/:id/clips/bulk-style — Set caption style for multiple clips
router.put('/:id/clips/bulk-style', (req, res) => {
    try {
        const { clipIds, caption_style } = req.body;
        if (!caption_style) return res.status(400).json({ error: 'caption_style is required' });

        const ids = clipIds && clipIds.length > 0
            ? clipIds
            : all('SELECT id FROM clips WHERE project_id = ?', [req.params.id]).map(c => c.id);

        let updated = 0;
        for (const cid of ids) {
            run('UPDATE clips SET caption_style = ?, caption_settings = NULL WHERE id = ?', [caption_style, cid]);
            updated++;
        }

        res.json({ message: `Caption style "${caption_style}" applied to ${updated} clips`, updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/projects/clips/:clipId — Delete a single clip
router.delete('/clips/:clipId', (req, res) => {
    try {
        const clip = get('SELECT * FROM clips WHERE id = ?', [req.params.clipId]);
        if (!clip) return res.status(404).json({ error: 'Clip not found' });

        // Delete rendered file if exists
        if (clip.output_path && fs.existsSync(clip.output_path)) {
            fs.unlinkSync(clip.output_path);
        }
        // Delete thumbnail if exists
        if (clip.thumbnail_path && fs.existsSync(clip.thumbnail_path)) {
            fs.unlinkSync(clip.thumbnail_path);
        }

        run('DELETE FROM clips WHERE id = ?', [req.params.clipId]);
        res.json({ message: 'Clip deleted', clipId: req.params.clipId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/clips/:clipId/split — Split a clip into two at a given time
router.post('/clips/:clipId/split', (req, res) => {
    try {
        const clip = get('SELECT * FROM clips WHERE id = ?', [req.params.clipId]);
        if (!clip) return res.status(404).json({ error: 'Clip not found' });

        const { split_time } = req.body;
        if (split_time === undefined || split_time <= clip.start_time || split_time >= clip.end_time) {
            return res.status(400).json({ error: 'Split time must be between clip start and end' });
        }

        const { v4: uuidv4 } = require('uuid');

        // Update original clip to end at split_time
        run('UPDATE clips SET end_time = ?, duration = ?, status = ?, output_path = NULL WHERE id = ?',
            [split_time, +(split_time - clip.start_time).toFixed(2), 'detected', clip.id]);

        // Create new clip starting at split_time
        const newId = uuidv4();
        const newDuration = +(clip.end_time - split_time).toFixed(2);
        run(`INSERT INTO clips (id, project_id, clip_number, title, start_time, end_time, duration,
             caption_style, caption_settings, status, is_selected)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'detected', ?)`,
            [newId, clip.project_id, (clip.clip_number || 0) + 1, `${clip.title || 'Clip'} (B)`,
                split_time, clip.end_time, newDuration,
                clip.caption_style || 'hormozi', clip.caption_settings || null, clip.is_selected ?? 1]);

        // Renumber all clips for this project
        const allClips = all('SELECT id FROM clips WHERE project_id = ? ORDER BY start_time ASC', [clip.project_id]);
        allClips.forEach((c, i) => {
            run('UPDATE clips SET clip_number = ? WHERE id = ?', [i + 1, c.id]);
        });

        // Update original clip title
        run('UPDATE clips SET title = ? WHERE id = ?', [`${clip.title || 'Clip'} (A)`, clip.id]);

        const updatedClips = all('SELECT * FROM clips WHERE project_id = ? ORDER BY start_time ASC', [clip.project_id]);
        res.json({ message: 'Clip split', clips: updatedClips });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/clips/merge — Merge two adjacent clips into one
router.post('/clips/merge', (req, res) => {
    try {
        const { clipId1, clipId2 } = req.body;
        if (!clipId1 || !clipId2) return res.status(400).json({ error: 'Two clip IDs required' });

        const clip1 = get('SELECT * FROM clips WHERE id = ?', [clipId1]);
        const clip2 = get('SELECT * FROM clips WHERE id = ?', [clipId2]);
        if (!clip1 || !clip2) return res.status(404).json({ error: 'One or both clips not found' });
        if (clip1.project_id !== clip2.project_id) return res.status(400).json({ error: 'Clips must be from same project' });

        // Determine order — earlier clip absorbs later clip
        const [first, second] = clip1.start_time <= clip2.start_time ? [clip1, clip2] : [clip2, clip1];

        // Update first clip to span both
        const newEnd = Math.max(first.end_time, second.end_time);
        const newDuration = +(newEnd - first.start_time).toFixed(2);
        run('UPDATE clips SET end_time = ?, duration = ?, status = ?, output_path = NULL WHERE id = ?',
            [newEnd, newDuration, 'detected', first.id]);

        // Delete rendered files of second clip
        if (second.output_path && fs.existsSync(second.output_path)) {
            fs.unlinkSync(second.output_path);
        }
        if (second.thumbnail_path && fs.existsSync(second.thumbnail_path)) {
            fs.unlinkSync(second.thumbnail_path);
        }

        // Remove second clip
        run('DELETE FROM clips WHERE id = ?', [second.id]);

        // Renumber
        const allClips = all('SELECT id FROM clips WHERE project_id = ? ORDER BY start_time ASC', [first.project_id]);
        allClips.forEach((c, i) => {
            run('UPDATE clips SET clip_number = ? WHERE id = ?', [i + 1, c.id]);
        });

        const updatedClips = all('SELECT * FROM clips WHERE project_id = ? ORDER BY start_time ASC', [first.project_id]);
        res.json({ message: 'Clips merged', clips: updatedClips });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/projects/:id
router.delete('/:id', (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        // Delete source file
        if (project.source_path && fs.existsSync(project.source_path)) {
            fs.removeSync(project.source_path);
        }
        // Delete thumbnail
        if (project.thumbnail_path) {
            const thumbFull = path.join(DATA_DIR, project.thumbnail_path);
            if (fs.existsSync(thumbFull)) fs.removeSync(thumbFull);
        }

        run('DELETE FROM clips WHERE project_id = ?', [req.params.id]);
        run('DELETE FROM transcripts WHERE project_id = ?', [req.params.id]);
        run('DELETE FROM projects WHERE id = ?', [req.params.id]);

        const io = req.app.get('io');
        if (io) io.emit('project:deleted', { id: req.params.id });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/youtube — Download from YouTube URL
router.post('/youtube', async (req, res) => {
    const { url, platform, reframing_mode, language, clip_count_target, min_duration, max_duration } = req.body;

    if (!url) return res.status(400).json({ error: 'No YouTube URL provided' });

    const id = uuidv4();
    const io = req.app.get('io');

    try {
        // Step 1: Get video info
        if (io) io.emit('youtube:progress', { id, step: 'info', progress: 0, message: 'Getting video info...' });
        console.log(`[YouTube] Getting info for: ${url}`);

        let ytInfo;
        try {
            ytInfo = await getYoutubeInfo(url);
        } catch (e) {
            return res.status(400).json({ error: `Could not get YouTube video info: ${e.message}` });
        }

        console.log(`[YouTube] Title: ${ytInfo.title} (${formatDuration(ytInfo.duration)})`);

        // Step 2: Download video
        if (io) io.emit('youtube:progress', { id, step: 'download', progress: 0, message: `Downloading: ${ytInfo.title}` });

        const uploadDir = path.join(DATA_DIR, 'uploads');
        const downloadResult = await downloadYoutube(url, uploadDir, (progress, line) => {
            if (io) io.emit('youtube:progress', { id, step: 'download', progress: Math.round(progress), message: `Downloading... ${Math.round(progress)}%` });
        });

        console.log(`[YouTube] Downloaded: ${downloadResult.fileName} (${formatDuration(ytInfo.duration)})`);

        // Step 3: Get video info from downloaded file
        if (io) io.emit('youtube:progress', { id, step: 'metadata', progress: 90, message: 'Extracting metadata...' });

        let videoInfo = { duration: ytInfo.duration, width: ytInfo.width, height: ytInfo.height, fps: ytInfo.fps };
        try {
            videoInfo = await getVideoInfo(downloadResult.filePath);
        } catch (e) {
            console.error('[FFmpeg] Could not get video info:', e.message);
        }

        // Step 4: Generate thumbnail
        if (io) io.emit('youtube:progress', { id, step: 'thumbnail', progress: 95, message: 'Generating thumbnail...' });

        let thumbnailPath = null;
        try {
            const thumbDir = path.join(DATA_DIR, 'thumbnails');
            const thumbTime = videoInfo.duration > 5 ? '00:00:03' : '00:00:01';
            thumbnailPath = await generateThumbnail(downloadResult.filePath, thumbDir, thumbTime);
            thumbnailPath = path.relative(DATA_DIR, thumbnailPath).replace(/\\/g, '/');
        } catch (e) {
            console.error('[FFmpeg] Could not generate thumbnail:', e.message);
        }

        // Step 5: Save to database
        run(`
            INSERT INTO projects (id, name, source_path, source_url, thumbnail_path, duration, width, height, fps, file_size, platform, aspect_ratio, reframing_mode, language, clip_count_target, min_duration, max_duration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            ytInfo.title,
            downloadResult.filePath,
            url,
            thumbnailPath,
            videoInfo.duration,
            videoInfo.width,
            videoInfo.height,
            videoInfo.fps,
            downloadResult.fileSize,
            platform || 'tiktok',
            '9:16',
            reframing_mode || 'center',
            language || 'auto',
            clip_count_target || 'medium',
            min_duration || 15,
            max_duration || 60
        ]);

        const project = get('SELECT * FROM projects WHERE id = ?', [id]);
        if (io) {
            io.emit('youtube:progress', { id, step: 'done', progress: 100, message: 'Done!' });
            io.emit('project:created', project);
        }

        console.log(`[YouTube] Project created: ${ytInfo.title}`);
        res.json({ project });
    } catch (err) {
        console.error('[YouTube] Error:', err.message);
        if (io) io.emit('youtube:progress', { id, step: 'error', progress: 0, message: err.message });
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/clips/:clipId/render — Render a single clip
router.post('/clips/:clipId/render', async (req, res) => {
    try {
        const clip = get('SELECT * FROM clips WHERE id = ?', [req.params.clipId]);
        if (!clip) return res.status(404).json({ error: 'Clip not found' });

        const io = req.app.get('io');
        res.json({ message: 'Rendering started', clipId: clip.id });

        // Run async
        renderClip(clip.id, io)
            .then(() => {
                if (io) io.emit('clip:rendered', { clipId: clip.id, projectId: clip.project_id });
            })
            .catch(err => {
                console.error('[Render] Error:', err.message);
            });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/:id/render-all — Render all selected clips
router.post('/:id/render-all', async (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const io = req.app.get('io');
        res.json({ message: 'Rendering all clips started', projectId: project.id });

        // Run async
        renderAllClips(project.id, io)
            .then(results => {
                if (io) io.emit('render:complete', { projectId: project.id, results });
            })
            .catch(err => {
                console.error('[RenderAll] Error:', err.message);
            });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/:id/render-selected — Render only selected clips
router.post('/:id/render-selected', async (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const { clipIds } = req.body;
        if (!clipIds || !Array.isArray(clipIds) || clipIds.length === 0) {
            return res.status(400).json({ error: 'No clips selected' });
        }

        const io = req.app.get('io');
        res.json({ message: `Rendering ${clipIds.length} selected clips`, projectId: project.id });

        // Render only selected clips sequentially
        (async () => {
            const emit = (progress, message) => {
                if (io) io.emit('render:progress', { projectId: project.id, progress, message });
            };

            emit(0, `Starting render of ${clipIds.length} clips...`);

            const results = [];
            for (let i = 0; i < clipIds.length; i++) {
                const clipProgress = Math.round((i / clipIds.length) * 100);
                const clip = get('SELECT * FROM clips WHERE id = ?', [clipIds[i]]);
                emit(clipProgress, `Rendering clip ${i + 1}/${clipIds.length}: ${clip?.title || 'Unknown'}`);

                try {
                    const result = await renderClip(clipIds[i], io);
                    results.push({ clipId: clipIds[i], success: true, ...result });
                } catch (err) {
                    results.push({ clipId: clipIds[i], success: false, error: err.message });
                }
            }

            const successCount = results.filter(r => r.success).length;
            emit(100, `Done! ${successCount}/${clipIds.length} clips exported.`);
            if (io) io.emit('render:complete', { projectId: project.id, results });
        })();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/projects/clips/:clipId/download — Download rendered clip
router.get('/clips/:clipId/download', (req, res) => {
    try {
        const clip = get('SELECT * FROM clips WHERE id = ?', [req.params.clipId]);
        if (!clip) return res.status(404).json({ error: 'Clip not found' });
        if (!clip.output_path || !fs.existsSync(clip.output_path)) {
            return res.status(404).json({ error: 'Clip not rendered yet' });
        }

        // Validate file is not empty/corrupt
        const stats = fs.statSync(clip.output_path);
        if (stats.size < 1024) {
            // File is too small to be valid — mark as failed and cleanup
            run("UPDATE clips SET status = 'failed', output_path = NULL WHERE id = ?", [req.params.clipId]);
            try { fs.unlinkSync(clip.output_path); } catch (e) { }
            return res.status(400).json({ error: 'Clip file is corrupt (0 bytes). Please re-render this clip.' });
        }

        const filename = path.basename(clip.output_path);
        res.download(clip.output_path, filename);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/:id/open-folder — Open output folder in file explorer
router.post('/:id/open-folder', (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const { exec } = require('child_process');
        const clipsDir = path.join(__dirname, '..', '..', 'data', 'clips', project.id);

        // Check if custom output dir is set
        const outputDirSetting = get('SELECT value FROM settings WHERE key = ?', ['output_dir']);
        const targetDir = (outputDirSetting && outputDirSetting.value)
            ? outputDirSetting.value
            : clipsDir;

        // Create dir if it doesn't exist
        const fs2 = require('fs-extra');
        fs2.ensureDirSync(targetDir);

        // Open in Windows Explorer
        exec(`explorer "${targetDir}"`, (err) => {
            if (err) console.warn('[OpenFolder] Warning:', err.message);
        });

        res.json({ success: true, folder: targetDir });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/projects/clips/:clipId/path — Get rendered clip file path
router.get('/clips/:clipId/path', (req, res) => {
    try {
        const clip = get('SELECT * FROM clips WHERE id = ?', [req.params.clipId]);
        if (!clip) return res.status(404).json({ error: 'Clip not found' });
        if (!clip.output_path) return res.status(404).json({ error: 'Clip not rendered' });
        res.json({ path: clip.output_path, exists: require('fs').existsSync(clip.output_path) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/projects/:id/transcript — Save edited transcript text
router.put('/:id/transcript', (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const { full_text, language, segment_data } = req.body;

        const existing = get('SELECT * FROM transcripts WHERE project_id = ?', [req.params.id]);
        if (existing) {
            if (full_text !== undefined) {
                run(`UPDATE transcripts SET full_text = ?, updated_at = datetime('now') WHERE project_id = ?`,
                    [full_text.trim(), req.params.id]);
            }
            if (language !== undefined) {
                run(`UPDATE transcripts SET language = ?, updated_at = datetime('now') WHERE project_id = ?`,
                    [language, req.params.id]);
            }
            if (segment_data !== undefined) {
                const segStr = typeof segment_data === 'string' ? segment_data : JSON.stringify(segment_data);
                run(`UPDATE transcripts SET segment_data = ?, updated_at = datetime('now') WHERE project_id = ?`,
                    [segStr, req.params.id]);
            }
        } else {
            if (!full_text || !full_text.trim()) {
                return res.status(400).json({ error: 'Transcript text is required for new transcripts' });
            }
            const { v4: uuidv4 } = require('uuid');
            const segStr = segment_data ? (typeof segment_data === 'string' ? segment_data : JSON.stringify(segment_data)) : '[]';
            run(`INSERT INTO transcripts (id, project_id, full_text, language, provider, segment_data, word_data)
                 VALUES (?, ?, ?, ?, 'manual', ?, '[]')`,
                [uuidv4(), req.params.id, full_text.trim(), language || 'unknown', segStr]);
        }

        const transcript = get('SELECT * FROM transcripts WHERE project_id = ?', [req.params.id]);
        res.json({ message: 'Transcript saved', transcript });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/:id/transcript/upload — Import SRT/VTT/TXT transcript file
router.post('/:id/transcript/upload', transcriptUpload.single('file'), (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const content = fs.readFileSync(req.file.path, 'utf-8');
        const ext = path.extname(req.file.originalname).toLowerCase();

        let fullText = '';
        let segments = [];

        if (ext === '.srt') {
            // Parse SRT format
            const blocks = content.trim().split(/\n\s*\n/);
            for (const block of blocks) {
                const lines = block.trim().split('\n');
                if (lines.length < 3) continue;
                const timeLine = lines[1];
                const timeMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
                if (timeMatch) {
                    const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
                    const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
                    const text = lines.slice(2).join(' ').replace(/<[^>]+>/g, '').trim();
                    if (text) {
                        segments.push({ start, end, text });
                        fullText += (fullText ? ' ' : '') + text;
                    }
                }
            }
        } else if (ext === '.vtt') {
            // Parse VTT format
            const blocks = content.replace(/^WEBVTT.*\n/, '').trim().split(/\n\s*\n/);
            for (const block of blocks) {
                const lines = block.trim().split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const timeMatch = lines[i].match(/(\d{2}):(\d{2}):(\d{2})[.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.](\d{3})/);
                    if (!timeMatch) {
                        // Also try MM:SS.mmm format
                        const shortMatch = lines[i].match(/(\d{2}):(\d{2})[.](\d{3})\s*-->\s*(\d{2}):(\d{2})[.](\d{3})/);
                        if (shortMatch) {
                            const start = parseInt(shortMatch[1]) * 60 + parseInt(shortMatch[2]) + parseInt(shortMatch[3]) / 1000;
                            const end = parseInt(shortMatch[4]) * 60 + parseInt(shortMatch[5]) + parseInt(shortMatch[6]) / 1000;
                            const text = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim();
                            if (text) {
                                segments.push({ start, end, text });
                                fullText += (fullText ? ' ' : '') + text;
                            }
                            break;
                        }
                        continue;
                    }
                    const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
                    const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
                    const text = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim();
                    if (text) {
                        segments.push({ start, end, text });
                        fullText += (fullText ? ' ' : '') + text;
                    }
                    break;
                }
            }
        } else {
            // Plain text — just use the content as-is
            fullText = content.trim();
        }

        if (!fullText) {
            // Cleanup uploaded file
            try { fs.unlinkSync(req.file.path); } catch (e) { }
            return res.status(400).json({ error: 'Could not extract text from the uploaded file' });
        }

        // Save to database
        const { v4: uuidv4 } = require('uuid');
        run('DELETE FROM transcripts WHERE project_id = ?', [req.params.id]);
        run(`INSERT INTO transcripts (id, project_id, full_text, language, provider, segment_data, word_data)
             VALUES (?, ?, ?, ?, ?, ?, '[]')`,
            [uuidv4(), req.params.id, fullText, req.body.language || 'unknown', `import_${ext.replace('.', '')}`, JSON.stringify(segments)]);

        // Cleanup uploaded file
        try { fs.unlinkSync(req.file.path); } catch (e) { }

        const transcript = get('SELECT * FROM transcripts WHERE project_id = ?', [req.params.id]);
        res.json({
            message: `Transcript imported from ${ext.toUpperCase()} file`,
            transcript,
            stats: { chars: fullText.length, segments: segments.length }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/:id/transcript/paste — Import pasted timestamp transcript
// Accepts formats like:
//   00:00 Text here
//   00:02 More text
//   01:30:15 Text with hours
//   [00:00] Text with brackets
router.post('/:id/transcript/paste', (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        const { text, language } = req.body;
        if (!text || !text.trim()) return res.status(400).json({ error: 'No transcript text provided' });

        const lines = text.trim().split('\n').filter(l => l.trim());
        let segments = [];
        let fullText = '';
        let hasTimestamps = false;

        // Try to parse each line as "TIMESTAMP TEXT"
        // Supported formats:
        //   MM:SS Text
        //   HH:MM:SS Text
        //   [MM:SS] Text
        //   [HH:MM:SS] Text
        //   MM:SS - Text
        const timestampRegex = /^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?\s*[-–—]?\s*(.+)$/;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const match = trimmed.match(timestampRegex);
            if (match) {
                hasTimestamps = true;
                let startSeconds;
                if (match[3] !== undefined) {
                    // HH:MM:SS format
                    startSeconds = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
                } else {
                    // MM:SS format
                    startSeconds = parseInt(match[1]) * 60 + parseInt(match[2]);
                }
                const segText = match[4].trim();
                if (segText) {
                    segments.push({ start: startSeconds, end: startSeconds + 2, text: segText });
                    fullText += (fullText ? ' ' : '') + segText;
                }
            } else {
                // Line without timestamp — append to previous segment or create new
                if (segments.length > 0) {
                    segments[segments.length - 1].text += ' ' + trimmed;
                    fullText += ' ' + trimmed;
                } else {
                    fullText += (fullText ? ' ' : '') + trimmed;
                }
            }
        }

        // Fix end times: each segment ends when the next one starts
        for (let i = 0; i < segments.length - 1; i++) {
            segments[i].end = segments[i + 1].start;
        }
        // Last segment: estimate 5 seconds or use video duration
        if (segments.length > 0) {
            const lastSeg = segments[segments.length - 1];
            if (project.duration) {
                lastSeg.end = project.duration;
            } else {
                lastSeg.end = lastSeg.start + 5;
            }
        }

        if (!fullText.trim()) {
            return res.status(400).json({ error: 'Could not extract any text from pasted content' });
        }

        // Save to database
        const { v4: uuidv4 } = require('uuid');
        run('DELETE FROM transcripts WHERE project_id = ?', [req.params.id]);
        run(`INSERT INTO transcripts (id, project_id, full_text, language, provider, segment_data, word_data)
             VALUES (?, ?, ?, ?, ?, ?, '[]')`,
            [uuidv4(), req.params.id, fullText, language || 'id',
            hasTimestamps ? 'paste_timed' : 'paste_plain',
            JSON.stringify(segments)]);

        const transcript = get('SELECT * FROM transcripts WHERE project_id = ?', [req.params.id]);
        res.json({
            message: `Transcript pasted successfully`,
            transcript,
            stats: {
                chars: fullText.length,
                segments: segments.length,
                hasTimestamps,
                provider: hasTimestamps ? 'paste_timed' : 'paste_plain'
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/projects/:id/captions — List available YouTube captions
router.get('/:id/captions', async (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        if (!project.source_url) {
            return res.status(400).json({ error: 'Project has no YouTube source URL' });
        }

        const captions = await getYoutubeCaptions(project.source_url);
        res.json({ captions, url: project.source_url });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/:id/captions/import — Download and import YouTube captions
router.post('/:id/captions/import', async (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });
        if (!project.source_url) {
            return res.status(400).json({ error: 'Project has no YouTube source URL' });
        }

        const lang = req.body.language || 'en';
        const tempDir = path.join(DATA_DIR, 'temp', req.params.id);
        fs.ensureDirSync(tempDir);

        const result = await downloadYoutubeCaptions(project.source_url, lang, tempDir);

        // Save to database
        const { v4: uuidv4 } = require('uuid');
        run('DELETE FROM transcripts WHERE project_id = ?', [req.params.id]);
        run(`INSERT INTO transcripts (id, project_id, full_text, language, provider, segment_data, word_data)
             VALUES (?, ?, ?, ?, ?, ?, '[]')`,
            [uuidv4(), req.params.id, result.text, result.language, result.provider, JSON.stringify(result.segments)]);

        // Cleanup temp
        try { fs.removeSync(tempDir); } catch (e) { }

        const transcript = get('SELECT * FROM transcripts WHERE project_id = ?', [req.params.id]);
        res.json({
            message: `YouTube captions imported (${result.provider})`,
            transcript,
            stats: {
                chars: result.text.length,
                segments: result.segments.length,
                provider: result.provider
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/projects/clear-cache — Clear temp and thumbnail files
router.post('/clear-cache', (req, res) => {
    const dataDir = path.join(__dirname, '..', '..', 'data');
    let cleared = 0;
    try {
        ['thumbnails', 'temp'].forEach(dir => {
            const p = path.join(dataDir, dir);
            if (fs.existsSync(p)) {
                const files = fs.readdirSync(p);
                files.forEach(f => {
                    fs.removeSync(path.join(p, f));
                    cleared++;
                });
            }
        });
        res.json({ success: true, cleared, message: `Cleared ${cleared} cached files` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
