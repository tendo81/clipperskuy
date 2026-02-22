const express = require('express');
const router = express.Router();
const { all, get, run } = require('../database');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { getVideoInfo, generateThumbnail, formatDuration } = require('../services/ffmpeg');
const { getYoutubeInfo, downloadYoutube, getYoutubeCaptions, downloadYoutubeCaptions } = require('../services/youtube');
const { processProject, cancelProject, addToQueue, removeFromQueue, getQueueStatus, retranscribeProject } = require('../services/pipeline');
const { renderClip, renderAllClips } = require('../services/clipRenderer');
const { canCreateProject, incrementProjectCount, getRenderLimits } = require('../services/license');

const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, '..', '..', 'data');

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

        // === Enhanced analytics ===
        // Average virality score
        const avgVirality = get('SELECT COALESCE(AVG(virality_score), 0) as avg FROM clips WHERE virality_score > 0');

        // Most used reframing mode
        const topReframe = get("SELECT reframing_mode, COUNT(*) as cnt FROM projects GROUP BY reframing_mode ORDER BY cnt DESC LIMIT 1");

        // Most used platform
        const topPlatform = get("SELECT platform, COUNT(*) as cnt FROM projects GROUP BY platform ORDER BY cnt DESC LIMIT 1");

        // Time saved estimate (assume 10x manual: 30min manual per clip avg)
        const timeSavedMin = (totalClips?.count || 0) * 30;

        // Top 5 clips by virality
        let topClips = [];
        try {
            topClips = all("SELECT c.id, c.title, c.virality_score, c.duration, c.status, p.name as project_name FROM clips c LEFT JOIN projects p ON c.project_id = p.id WHERE c.virality_score > 0 ORDER BY c.virality_score DESC LIMIT 5");
        } catch (e) { }

        // Daily activity (last 7 days)
        let dailyActivity = [];
        try {
            dailyActivity = all(`
                SELECT date(created_at) as day, COUNT(*) as count 
                FROM projects 
                WHERE created_at >= datetime('now', '-7 days')
                GROUP BY date(created_at) 
                ORDER BY day ASC
            `);
        } catch (e) { }

        // Virality distribution
        let viralityDist = { low: 0, medium: 0, high: 0, viral: 0 };
        try {
            const low = get("SELECT COUNT(*) as c FROM clips WHERE virality_score > 0 AND virality_score < 40");
            const med = get("SELECT COUNT(*) as c FROM clips WHERE virality_score >= 40 AND virality_score < 65");
            const high = get("SELECT COUNT(*) as c FROM clips WHERE virality_score >= 65 AND virality_score < 85");
            const viral = get("SELECT COUNT(*) as c FROM clips WHERE virality_score >= 85");
            viralityDist = {
                low: low?.c || 0,
                medium: med?.c || 0,
                high: high?.c || 0,
                viral: viral?.c || 0
            };
        } catch (e) { }

        res.json({
            totalProjects: totalProjects?.count || 0,
            totalClips: totalClips?.count || 0,
            completedProjects: completedProjects?.count || 0,
            totalDuration: totalDuration?.total || 0,
            exportedClips: exportedClips?.count || 0,
            clipsDuration: clipsDuration?.total || 0,
            favCaptionStyle: favCaptionStyle?.caption_style || 'hormozi',
            musicTracks: musicCount,
            // Enhanced
            avgVirality: Math.round(avgVirality?.avg || 0),
            topReframingMode: topReframe?.reframing_mode || 'center',
            topPlatform: topPlatform?.platform || 'tiktok',
            timeSavedMinutes: timeSavedMin,
            topClips,
            dailyActivity,
            viralityDistribution: viralityDist
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

        // Check project limit (Free tier = max 3)
        const limitCheck = canCreateProject();
        if (!limitCheck.allowed) {
            // Delete uploaded file since we're rejecting
            fs.removeSync(req.file.path);
            return res.status(403).json({ error: limitCheck.message });
        }

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

        // Track total projects for free tier limit
        incrementProjectCount();

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

// POST /api/projects/:id/retranscribe — Re-transcribe to get word-level timestamps
router.post('/:id/retranscribe', async (req, res) => {
    try {
        const project = get('SELECT * FROM projects WHERE id = ?', [req.params.id]);
        if (!project) return res.status(404).json({ error: 'Project not found' });

        if (['transcribing', 'analyzing', 'clipping'].includes(project.status)) {
            return res.status(400).json({ error: 'Project is already being processed' });
        }

        const io = req.app.get('io');
        res.json({ message: 'Re-transcription started', projectId: project.id });

        retranscribeProject(project.id, io)
            .then(result => {
                console.log(`[Retranscribe] Complete: ${result.clips} clips detected`);
                if (io) io.emit('project:updated', { id: project.id, status: 'completed' });
            })
            .catch(err => {
                if (err.message === 'CANCELLED') {
                    if (io) io.emit('project:updated', { id: project.id, status: 'cancelled' });
                } else {
                    console.error(`[Retranscribe] Failed: ${err.message}`);
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

        const { start_time, end_time, duration, title, caption_style, caption_settings, music_track_id, music_volume, hook_text, hook_settings } = req.body;

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
        if (hook_text !== undefined) {
            run('UPDATE clips SET hook_text = ? WHERE id = ?', [hook_text, req.params.clipId]);
        }
        if (hook_settings !== undefined) {
            run('UPDATE clips SET hook_settings = ? WHERE id = ?', [
                typeof hook_settings === 'string' ? hook_settings : JSON.stringify(hook_settings),
                req.params.clipId
            ]);
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

// POST /api/projects/clips/:clipId/reset-render — Reset stuck rendering status
router.post('/clips/:clipId/reset-render', (req, res) => {
    try {
        const clip = get('SELECT * FROM clips WHERE id = ?', [req.params.clipId]);
        if (!clip) return res.status(404).json({ error: 'Clip not found' });

        if (clip.status === 'rendering') {
            run("UPDATE clips SET status = 'detected', output_path = NULL WHERE id = ?", [req.params.clipId]);
            console.log(`[Render] Reset stuck clip ${req.params.clipId} from rendering -> detected`);
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

// PUT /api/projects/:id/clips/bulk-hook — Set hook title settings for multiple clips
router.put('/:id/clips/bulk-hook', (req, res) => {
    try {
        const { clipIds, hook_settings } = req.body;

        const ids = clipIds && clipIds.length > 0
            ? clipIds
            : all('SELECT id FROM clips WHERE project_id = ?', [req.params.id]).map(c => c.id);

        const settingsStr = hook_settings ? (typeof hook_settings === 'string' ? hook_settings : JSON.stringify(hook_settings)) : null;

        let updated = 0;
        for (const cid of ids) {
            run('UPDATE clips SET hook_settings = ? WHERE id = ?', [settingsStr, cid]);
            updated++;
        }

        const action = hook_settings ? 'applied' : 'removed';
        res.json({ message: `Hook settings ${action} for ${updated} clips`, updated });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/projects/:id/clips/:clipId/select — Toggle clip selection
router.put('/:id/clips/:clipId/select', (req, res) => {
    try {
        const { is_selected } = req.body;
        run('UPDATE clips SET is_selected = ? WHERE id = ?', [is_selected ? 1 : 0, req.params.clipId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/projects/:id/clips/select-all — Select or deselect all clips
router.put('/:id/clips/select-all', (req, res) => {
    try {
        const { is_selected } = req.body;
        run('UPDATE clips SET is_selected = ? WHERE project_id = ?', [is_selected ? 1 : 0, req.params.id]);
        res.json({ success: true });
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

// Shared progress store for YouTube downloads
const ytProgress = {};

// SSE endpoint for YouTube download progress
router.get('/youtube/progress', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    const interval = setInterval(() => {
        const data = ytProgress.current || { step: 'waiting', progress: 0, message: 'Waiting...' };
        res.write(`data: ${JSON.stringify(data)}\n\n`);

        if (data.step === 'done' || data.step === 'error') {
            clearInterval(interval);
            setTimeout(() => res.end(), 500);
        }
    }, 300);

    req.on('close', () => {
        clearInterval(interval);
    });
});

// POST /api/projects/youtube — Download from YouTube URL
router.post('/youtube', async (req, res) => {
    const { url, platform, reframing_mode, language, clip_count_target, min_duration, max_duration } = req.body;

    if (!url) return res.status(400).json({ error: 'No YouTube URL provided' });

    const id = uuidv4();
    const io = req.app.get('io');

    // Progress emitter: writes to both Socket.IO and shared store
    const emitProgress = (step, progress, message) => {
        const data = { id, step, progress, message };
        ytProgress.current = data;
        if (io) io.emit('youtube:progress', data);
        console.log(`[YouTube] ${message}`);
    };

    // Check project limit (Free tier = max 3)
    const limitCheck = canCreateProject();
    if (!limitCheck.allowed) {
        return res.status(403).json({ error: limitCheck.message });
    }

    try {
        // Step 1: Get video info
        emitProgress('info', 5, 'Getting video info...');

        let ytInfo;
        try {
            ytInfo = await getYoutubeInfo(url);
        } catch (e) {
            emitProgress('error', 0, `Failed: ${e.message}`);
            return res.status(400).json({ error: `Could not get YouTube video info: ${e.message}` });
        }

        emitProgress('info', 10, `Found: ${ytInfo.title} (${formatDuration(ytInfo.duration)})`);

        // Step 2: Download video
        emitProgress('download', 10, `Downloading: ${ytInfo.title}`);

        const uploadDir = path.join(DATA_DIR, 'uploads');
        const downloadResult = await downloadYoutube(url, uploadDir, (progress, line) => {
            emitProgress('download', Math.round(10 + progress * 0.75), `Downloading... ${Math.round(progress)}%`);
        }, io);

        emitProgress('metadata', 90, `Downloaded! Extracting metadata...`);

        let videoInfo = { duration: ytInfo.duration, width: ytInfo.width, height: ytInfo.height, fps: ytInfo.fps };
        try {
            videoInfo = await getVideoInfo(downloadResult.filePath);
        } catch (e) {
            console.error('[FFmpeg] Could not get video info:', e.message);
        }

        // Step 4: Generate thumbnail
        emitProgress('thumbnail', 95, `Creating thumbnail... (${videoInfo.width}x${videoInfo.height})`);

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
        incrementProjectCount();

        emitProgress('done', 100, `Done! ${videoInfo.width}x${videoInfo.height}`);
        if (io) io.emit('project:created', project);

        console.log(`[YouTube] Project created: ${ytInfo.title}`);
        res.json({ project });
    } catch (err) {
        console.error('[YouTube] Error:', err.message);
        emitProgress('error', 0, err.message);
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
        // Check batch export permission (Free tier = blocked)
        const renderLimits = getRenderLimits();
        if (!renderLimits.batchExportAllowed) {
            return res.status(403).json({ error: 'Batch export hanya tersedia untuk Pro. Upgrade untuk export semua sekaligus.' });
        }

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
        // Check batch export permission (Free tier = blocked)
        const renderLimits = getRenderLimits();
        if (!renderLimits.batchExportAllowed) {
            return res.status(403).json({ error: 'Batch export hanya tersedia untuk Pro. Export satu-satu di Free tier.' });
        }

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
                if (io) {
                    io.emit('render:progress', { projectId: project.id, progress, message });
                    io.emit('process:log', { projectId: project.id, type: 'info', message: `[RenderSelected] ${message}`, timestamp: new Date().toTimeString() });
                }
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
        const clipsDir = path.join(DATA_DIR, 'clips', project.id);

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
                // Clear word_data when segments are manually edited, so renderer
                // uses the edited segment text instead of stale word-level timestamps
                run(`UPDATE transcripts SET segment_data = ?, word_data = '[]', updated_at = datetime('now') WHERE project_id = ?`,
                    [segStr, req.params.id]);
                console.log(`[Transcript] segment_data updated + word_data cleared for project ${req.params.id}`);
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
    const dataDir = DATA_DIR;
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

// POST /api/projects/clips/:clipId/generate-social — AI-generate social media copy
router.post('/clips/:clipId/generate-social', async (req, res) => {
    try {
        const clip = get('SELECT * FROM clips WHERE id = ?', [req.params.clipId]);
        if (!clip) return res.status(404).json({ error: 'Clip not found' });

        const project = get('SELECT * FROM projects WHERE id = ?', [clip.project_id]);
        const transcript = get('SELECT * FROM transcripts WHERE project_id = ?', [clip.project_id]);

        // Get clip's transcript portion
        let clipText = clip.hook_text || clip.title || '';
        if (transcript) {
            const parsed = typeof transcript.content === 'string' ? JSON.parse(transcript.content) : transcript.content;
            const segments = parsed?.segments || [];
            clipText = segments
                .filter(s => s.start >= clip.start_time && s.end <= clip.end_time + 2)
                .map(s => s.text)
                .join(' ')
                .trim() || clipText;
        }
        // Sanitize: remove control chars that break JSON/template literals
        clipText = clipText.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').replace(/[`$\\]/g, ' ');

        // Get AI settings
        const settingsRows = all('SELECT key, value FROM settings');
        const settings = {};
        (settingsRows || []).forEach(s => { settings[s.key] = s.value; });

        const { platform, hook_style } = req.body || {};
        const targetPlatform = platform || project?.platform || 'tiktok';
        const hookStyle = hook_style || 'drama'; // drama, edukasi, comedy, motivasi, gossip, horror, storytelling, kontroversial, clickbait, aesthetic

        // Few-shot examples per style
        const hookExamples = {
            drama: `CONTOH HOOK GAYA DRAMA (pelajari polanya, JANGAN copy):
- "Dia bilang 'AKU HAMIL'... tapi suaminya udah 3 tahun meninggal 😱"
- "Ibunya NANGIS di depan rumah... ternyata anaknya yang bikin 💔"
- "Detik 0:45 dia JATUH dari panggung... reaksi penonton bikin merinding"
- "Pacarnya selingkuh sama SAHABATNYA sendiri... pas ketemu langsung..."
- "Dia kerja 15 tahun difitnah korupsi... BUKTI CCTV membuktikan semuanya"`,
            edukasi: `CONTOH HOOK GAYA EDUKASI (pelajari polanya, JANGAN copy):
- "Dokter bilang JANGAN makan ini sebelum tidur... 90% orang masih lakuin 🤯"
- "Ternyata cara cuci muka kita SELAMA INI SALAH... dermatolog jelaskan"
- "Gaji 5 juta tapi bisa nabung 2 juta? Ini RUMUS-nya yang gak diajarin sekolah"
- "Kenapa orang Jepang UMUR PANJANG? Rahasianya cuma 3 kebiasaan ini..."
- "HP kamu DISADAP kalau muncul tanda ini... cek sekarang!"`,
            comedy: `CONTOH HOOK GAYA COMEDY (pelajari polanya, JANGAN copy):
- "Bapak gue nyamar jadi OJOL buat ngecek pacar gue 😂💀"
- "Gue prank istri bilang DIPECAT... reaksinya DILUAR EKSPEKTASI 🤣"
- "Kucing gue masuk interview kerja... dan DITERIMA?! 😹"
- "Guru nanya 'siapa presiden pertama?'... jawabannya bikin satu kelas DIAM 💀"
- "Emak gue review makanan Michelin star... 'mending warteg' 😭"`,
            motivasi: `CONTOH HOOK GAYA MOTIVASI (pelajari polanya, JANGAN copy):
- "Dari jualan GORENGAN di pinggir jalan... sekarang punya 15 cabang resto 🔥"
- "Dulu dibuang keluarga... sekarang yang NGEMIS balik ke dia 💪"
- "Ditolak 47 perusahaan, tapi perusahaan ke-48 MENGUBAH hidupnya selamanya..."
- "Dia BUTA dari lahir tapi jadi programmer di Google... cara belajarnya GILA"
- "IPK 1.9, diragukan semua dosen... 5 tahun kemudian JADI DOSEN di kampus yang sama"`,
            gossip: `CONTOH HOOK GAYA GOSSIP/VIRAL (pelajari polanya, JANGAN copy):
- "Tetangga DENGAR suara aneh dari rumah sebelah... pas diintip ternyata 😱"
- "Chat WA SUAMINYA kepegang istri... isinya bikin langsung GUGAT CERAI"  
- "Ibu mertua DIAM-DIAM kasih racun ke menantunya... alasannya bikin semua syok"
- "Karyawan REKAM bosnya lagi... VIDEO-nya sekarang viral 10 juta views"
- "RT sebelah GEMPAR... ternyata pak ustadz yang selama ini..."`,
            horror: `CONTOH HOOK GAYA HORROR/MISTERI (pelajari polanya, JANGAN copy):
- "Jam 3 pagi CCTV rumahnya rekam SOSOK yang berdiri di pojok kamar... 😨"
- "Dia upload foto selfie... tapi di MIRROR ada wajah ORANG LAIN 👻"
- "Desa ini KOSONG sejak 1998... warga yang kembali ceritakan hal yang MUSTAHIL"
- "Suara ketawa anak kecil dari LOTENG... padahal dia tinggal SENDIRI 💀"
- "Pintu kamar hotelnya TERBUKA sendiri jam 2 pagi... rekaman CCTV-nya viral"`,
            storytelling: `CONTOH HOOK GAYA STORYTELLING/CERITA (pelajari polanya, JANGAN copy):
- "Jadi ceritanya, gue ketemu MANTAN di nikahan TEMEN... dan ini yang terjadi 🍿"
- "2 tahun lalu gue hampir BANGKRUT... ini timeline lengkap bagaimana gue BANGKIT"
- "Kisah cinta mereka dimulai dari SALAH KIRIM CHAT... sekarang udah punya 2 anak 🥹"
- "Waktu itu gue cuma punya Rp50.000 di rekening... terus gue lakuin ini..."
- "Ini kronologinya: hari pertama masuk kerja, bos gue bilang sesuatu yang MENGUBAH hidup gue"`,
            kontroversial: `CONTOH HOOK GAYA KONTROVERSIAL/DEBAT (pelajari polanya, JANGAN copy):
- "Maaf tapi FAKTA-nya: sekolah TIDAK menjamin kesuksesan ⚡"
- "Unpopular opinion: orang yang kerja 12 jam sehari itu BUKAN pekerja keras, tapi..."
- "Semua bilang dia SALAH... tapi coba lihat dari sudut pandang INI 🤔"
- "Gue bakal di-CANCEL abis ini... tapi SESEORANG harus bilang yang sebenarnya"
- "Data menunjukkan 70% orang Indonesia SALAH tentang ini... termasuk kamu?"`,
            clickbait: `CONTOH HOOK GAYA CLICKBAIT AGRESIF (pelajari polanya, JANGAN copy):
- "JANGAN skip video ini kalau kamu masih mau HIDUP lama 🚨"
- "Video ini akan di-DELETE dalam 24 jam... makanya TONTON sekarang"
- "Ini RAHASIA yang gak mau kamu tau... tapi gue tetap BONGKAR 🔓"
- "Stop SCROLL! Kamu WAJIB tau ini sebelum terlambat ⚠️"
- "1 dari 5 orang yang nonton ini akan langsung CEK HP-nya... kamu yang mana?"`,
            aesthetic: `CONTOH HOOK GAYA AESTHETIC/SOFT (pelajari polanya, JANGAN copy):
- "sometimes the universe sends you exactly what you need ✨"
- "pov: kamu akhirnya HEALING setelah 3 tahun 🌿"
- "this is your sign to start over 🦋"
- "quiet moments like this > everything else 🌙"
- "note to self: it's okay to take it slow 🤍"`
        };

        const styleExamples = hookExamples[hookStyle] || hookExamples.drama;

        const prompt = `You are a viral social media copywriter. You create hooks that are SPECIFIC to the video content — NOT generic.

LANGUAGE RULE: Detect the language of the clip text below, and write ALL output in the SAME language.

CLIP TITLE: "${clip.title}"
CLIP TEXT (this is the actual transcript — STUDY IT THOROUGHLY, extract names, events, emotions, conflicts):
"""
${clipText.substring(0, 3000)}
"""
VIRALITY SCORE: ${clip.virality_score || 70}/100
CONTENT TYPE: ${clip.content_type || 'insight'}
PLATFORM: ${targetPlatform}
HOOK STYLE: ${hookStyle.toUpperCase()}

${styleExamples}

CRITICAL HOOK RULES:
1. STUDY the transcript above. Identify: WHO is involved, WHAT happened, the EMOTIONAL peak, and the TWIST/REVELATION
2. Each hook MUST use REAL details from the transcript — actual names, events, quotes, or situations
3. BANNED generic phrases: "Tunggu sampai akhir", "Ini yang gak pernah diberitahu", "Ternyata...", "Yang terjadi selanjutnya..."
4. Write hooks like the examples above — SHORT, PUNCHY, with specific details that create a CURIOSITY GAP
5. The viewer must think: "WAIT WHAT? I need to see this!" — hook them with a SPECIFIC detail, then cut off with "..."
6. Use CAPS for 1-2 key emotional words. Use emoji sparingly (1-2 max per hook)
7. Each hook MAX 20 words. Each must use a DIFFERENT angle on the same content
8. Hooks should feel like someone GOSSIPING a crazy story to their friend

Generate social media copy for ALL platforms. Return ONLY a JSON object (no markdown):
{
  "tiktok": {
    "title": "clickbait title that teases the ACTUAL content, under 100 chars, with emoji",
    "description": "engaging description referencing clip content, 150-300 chars, with CTA",
    "hashtags": "#relevant #trending #hashtags (8-12)",
    "hooks": [
      "hook that teases the BIGGEST revelation/twist using SPECIFIC details from transcript",
      "hook that references a SPECIFIC moment, person, or quote from the clip",
      "hook that creates OUTRAGE or SYMPATHY using real details from the clip",
      "hook that uses the most SHOCKING FACT or DETAIL from the clip",
      "hook phrased as a PROVOCATIVE QUESTION using specifics from the clip"
    ],
    "bestTime": "best posting time and day for this content type",
    "engagementTip": "specific actionable engagement tip"
  },
  "instagram": {
    "title": "clickbait title referencing actual content",
    "description": "longer caption with story elements from clip, 200-500 chars, with CTA",
    "hashtags": "#hashtags (15-20 including niche and broad)",
    "hooks": ["content-specific hook 1", "hook 2", "hook 3", "hook 4", "hook 5"],
    "bestTime": "best posting time",
    "engagementTip": "engagement tip"
  },
  "youtube": {
    "title": "SEO clickbait title with real content keywords, 60-80 chars",
    "description": "description with content details and CTA, 300-500 chars",
    "hashtags": "#tags (5-8)",
    "hooks": ["content-specific hook 1", "hook 2", "hook 3", "hook 4", "hook 5"],
    "bestTime": "best posting time",
    "engagementTip": "engagement tip"
  },
  "twitter": {
    "title": "punchy tweet text, max 280 chars, with hook that drives engagement",
    "description": "follow-up tweet or thread starter, 200-280 chars",
    "hashtags": "#trending #hashtags (3-5 max for Twitter)",
    "hooks": ["tweet-hook 1 under 200 chars", "hook 2", "hook 3", "hook 4", "hook 5"],
    "bestTime": "best posting time",
    "engagementTip": "engagement tip for Twitter/X"
  },
  "facebook": {
    "title": "attention-grabbing share text that makes people STOP scrolling, 80-120 chars",
    "description": "longer story-style caption optimized for Facebook feed, 300-600 chars, with emotional hook and CTA to share/comment",
    "hashtags": "#hashtags (3-5 max, Facebook prefers fewer)",
    "hooks": ["share-worthy hook 1 that triggers COMMENTS", "hook 2", "hook 3", "hook 4", "hook 5"],
    "bestTime": "best posting time for Facebook",
    "engagementTip": "engagement tip optimized for Facebook algorithm (shares, comments, reactions)"
  }
}`;

        // Try Groq first, then Gemini
        let aiResult = null;
        const primary = settings.ai_provider_primary || 'groq';

        if (primary === 'groq' && settings.groq_api_key) {
            const keys = settings.groq_api_key.split(',').map(k => k.trim()).filter(k => k);
            for (const key of keys) {
                try {
                    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: 'llama-3.3-70b-versatile',
                            messages: [
                                { role: 'system', content: 'You are a viral content copywriter. Return ONLY valid JSON. No markdown, no explanation. Write hooks that reference SPECIFIC details from the transcript.' },
                                { role: 'user', content: prompt }
                            ],
                            temperature: 0.85,
                            max_tokens: 3000
                        })
                    });
                    if (resp.ok) {
                        const r = await resp.json();
                        aiResult = r.choices?.[0]?.message?.content;
                        break;
                    }
                } catch (e) { continue; }
            }
        }

        if (!aiResult && settings.gemini_api_key) {
            const keys = settings.gemini_api_key.split(',').map(k => k.trim()).filter(k => k);
            for (const key of keys) {
                try {
                    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: { temperature: 0.6, maxOutputTokens: 2048 }
                        })
                    });
                    if (resp.ok) {
                        const r = await resp.json();
                        aiResult = r.candidates?.[0]?.content?.parts?.[0]?.text;
                        break;
                    }
                } catch (e) { continue; }
            }
        }

        if (!aiResult) {
            return res.status(500).json({ error: 'AI provider not available. Check API keys in Settings.' });
        }

        // Parse AI response
        const cleaned = aiResult.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return res.status(500).json({ error: 'AI returned invalid response' });
        }

        // Smart sanitize: only escape newlines inside JSON string values
        const raw = jsonMatch[0].replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
        let sanitized = '';
        let inStr = false;
        let esc = false;
        for (let i = 0; i < raw.length; i++) {
            const c = raw[i];
            if (esc) { sanitized += c; esc = false; continue; }
            if (c === '\\' && inStr) { sanitized += c; esc = true; continue; }
            if (c === '"') { inStr = !inStr; sanitized += c; continue; }
            if (inStr && c === '\n') { sanitized += '\\n'; continue; }
            if (inStr && c === '\r') { continue; }
            if (inStr && c === '\t') { sanitized += ' '; continue; }
            sanitized += c;
        }
        const socialCopy = JSON.parse(sanitized);

        // Save to clip (optional — store last generated copy)
        run('UPDATE clips SET social_copy = ? WHERE id = ?', [JSON.stringify(socialCopy), req.params.clipId]);

        res.json({ success: true, social: socialCopy });
    } catch (err) {
        console.error('[SocialCopy] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// Thumbnail Generator — Extract best frames
// ========================================
router.post('/clips/:clipId/thumbnails', async (req, res) => {
    try {
        const clip = get('SELECT * FROM clips WHERE id = ?', [req.params.clipId]);
        if (!clip) return res.status(404).json({ error: 'Clip not found' });

        const project = get('SELECT * FROM projects WHERE id = ?', [clip.project_id]);
        if (!project || !project.source_path) return res.status(404).json({ error: 'Project video not found' });

        const fs = require('fs-extra');
        const { execSync } = require('child_process');

        if (!fs.existsSync(project.source_path)) {
            return res.status(404).json({ error: 'Source video file not found on disk' });
        }

        const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, '..', '..', 'data');
        const thumbDir = path.join(DATA_DIR, 'thumbnails', clip.id);
        fs.ensureDirSync(thumbDir);

        const clipDuration = (clip.end_time || 0) - (clip.start_time || 0);
        if (clipDuration <= 0) return res.status(400).json({ error: 'Invalid clip duration' });

        // Pick 6 strategic timestamps
        const timestamps = [
            { t: clip.start_time + 0.5, label: 'Opening' },
            { t: clip.start_time + Math.min(3, clipDuration * 0.1), label: 'Hook' },
            { t: clip.start_time + clipDuration * 0.25, label: '25%' },
            { t: clip.start_time + clipDuration * 0.5, label: 'Middle' },
            { t: clip.start_time + clipDuration * 0.75, label: '75%' },
            { t: clip.end_time - 1, label: 'Ending' },
        ];

        const thumbnails = [];
        for (let i = 0; i < timestamps.length; i++) {
            const { t, label } = timestamps[i];
            const outFile = path.join(thumbDir, `thumb_${i + 1}.jpg`);
            try {
                execSync(
                    `ffmpeg -y -ss ${t.toFixed(2)} -i "${project.source_path}" -vframes 1 -q:v 2 "${outFile}"`,
                    { timeout: 10000, stdio: 'ignore' }
                );
                if (fs.existsSync(outFile)) {
                    thumbnails.push({
                        url: `http://localhost:5000/api/projects/clips/${clip.id}/thumbnail/${i + 1}`,
                        label,
                        index: i + 1
                    });
                }
            } catch (e) {
                console.warn(`[Thumbnail] Frame ${i + 1} failed:`, e.message);
            }
        }

        res.json({ success: true, thumbnails });
    } catch (err) {
        console.error('[Thumbnail] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// Serve individual thumbnail images
router.get('/clips/:clipId/thumbnail/:index', (req, res) => {
    const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, '..', '..', 'data');
    const thumbPath = path.join(DATA_DIR, 'thumbnails', req.params.clipId, `thumb_${req.params.index}.jpg`);
    const fs = require('fs-extra');
    if (fs.existsSync(thumbPath)) {
        res.sendFile(thumbPath);
    } else {
        res.status(404).json({ error: 'Thumbnail not found' });
    }
});

// ========================================
// Trend Analysis — AI analyzes trending potential
// ========================================
router.post('/clips/:clipId/trend-analysis', async (req, res) => {
    try {
        const clip = get('SELECT * FROM clips WHERE id = ?', [req.params.clipId]);
        if (!clip) return res.status(404).json({ error: 'Clip not found' });

        const project = get('SELECT * FROM projects WHERE id = ?', [clip.project_id]);
        const transcript = get('SELECT * FROM transcripts WHERE project_id = ?', [clip.project_id]);

        let clipText = clip.title || '';
        if (transcript && transcript.full_text) {
            const segments = JSON.parse(transcript.segment_data || '[]');
            clipText = segments
                .filter(s => s.start >= clip.start_time && s.end <= clip.end_time + 2)
                .map(s => s.text)
                .join(' ')
                .trim() || clipText;
        }
        clipText = clipText.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').replace(/[`$\\]/g, ' ');

        const settingsRows = all('SELECT key, value FROM settings');
        const settings = {};
        (settingsRows || []).forEach(s => { settings[s.key] = s.value; });

        const prompt = `You are a viral content analyst. Analyze this clip's trending potential.

CLIP TITLE: "${clip.title}"
CONTENT TYPE: ${clip.content_type || 'general'}
VIRALITY SCORE: ${clip.virality_score || 0}/100
PLATFORM: ${project?.platform || 'tiktok'}
TRANSCRIPT:
"""
${clipText.substring(0, 3000)}
"""

Analyze and return ONLY valid JSON (no markdown):
{
  "trendScore": 85,
  "trendingTopics": ["topic1", "topic2", "topic3"],
  "contentStrengths": ["strength1", "strength2", "strength3"],
  "contentWeaknesses": ["weakness1", "weakness2"],
  "improvementSuggestions": ["suggestion1", "suggestion2", "suggestion3"],
  "predictedViews": { "low": 1000, "mid": 5000, "high": 25000 },
  "bestPlatform": "tiktok",
  "targetAudience": "description of ideal audience",
  "competitorInsight": "what top creators do differently with similar content",
  "viralPotential": "high/medium/low with specific reasoning",
  "suggestedSeries": "how to turn this into a content series",
  "soundTrend": "trending audio/sound recommendation if applicable"
}`;

        let aiResult = null;
        const primary = settings.ai_provider_primary || 'groq';

        if (primary === 'groq' && settings.groq_api_key) {
            const keys = settings.groq_api_key.split(',').map(k => k.trim()).filter(k => k);
            for (const key of keys) {
                try {
                    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: 'llama-3.3-70b-versatile',
                            messages: [
                                { role: 'system', content: 'You are a viral content analyst. Return ONLY valid JSON.' },
                                { role: 'user', content: prompt }
                            ],
                            temperature: 0.7, max_tokens: 2000
                        })
                    });
                    if (resp.ok) {
                        const r = await resp.json();
                        aiResult = r.choices?.[0]?.message?.content;
                        break;
                    }
                } catch (e) { continue; }
            }
        }

        if (!aiResult && settings.gemini_api_key) {
            const keys = settings.gemini_api_key.split(',').map(k => k.trim()).filter(k => k);
            for (const key of keys) {
                try {
                    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: { temperature: 0.5, maxOutputTokens: 2048 }
                        })
                    });
                    if (resp.ok) {
                        const r = await resp.json();
                        aiResult = r.candidates?.[0]?.content?.parts?.[0]?.text;
                        break;
                    }
                } catch (e) { continue; }
            }
        }

        if (!aiResult) {
            return res.status(500).json({ error: 'AI provider not available' });
        }

        // Parse with sanitization
        const cleaned = aiResult.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return res.status(500).json({ error: 'AI returned invalid response' });

        const raw = jsonMatch[0].replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
        let sanitized = '';
        let inStr = false, esc2 = false;
        for (let i = 0; i < raw.length; i++) {
            const c = raw[i];
            if (esc2) { sanitized += c; esc2 = false; continue; }
            if (c === '\\' && inStr) { sanitized += c; esc2 = true; continue; }
            if (c === '"') { inStr = !inStr; sanitized += c; continue; }
            if (inStr && c === '\n') { sanitized += '\\n'; continue; }
            if (inStr && c === '\r') continue;
            if (inStr && c === '\t') { sanitized += ' '; continue; }
            sanitized += c;
        }

        const analysis = JSON.parse(sanitized);
        res.json({ success: true, analysis });
    } catch (err) {
        console.error('[TrendAnalysis] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========================================
// B-Roll Search — Find stock footage from Pexels
// ========================================
router.post('/clips/:clipId/broll-search', async (req, res) => {
    try {
        const clip = get('SELECT * FROM clips WHERE id = ?', [req.params.clipId]);
        if (!clip) return res.status(404).json({ error: 'Clip not found' });

        const settingsRows = all('SELECT key, value FROM settings');
        const settings = {};
        (settingsRows || []).forEach(s => { settings[s.key] = s.value; });

        const pexelsKeysRaw = settings.pexels_api_key || req.body.pexels_key || '';
        const pexelsKeys = pexelsKeysRaw.split(',').map(k => k.trim()).filter(k => k);
        const keywords = req.body.keywords || clip.title || '';
        const orientation = req.body.orientation || 'portrait'; // portrait for 9:16

        if (pexelsKeys.length === 0) {
            return res.status(400).json({
                error: 'Pexels API key required. Get free key at pexels.com/api and add it in Settings.',
                needsKey: true
            });
        }

        // Search Pexels for relevant videos — try each key until one works
        const query = encodeURIComponent(keywords.substring(0, 100));
        const pexelsUrl = `https://api.pexels.com/videos/search?query=${query}&per_page=12&orientation=${orientation}`;

        let lastError = null;
        let data = null;

        for (const pexelsKey of pexelsKeys) {
            try {
                const resp = await fetch(pexelsUrl, {
                    headers: { 'Authorization': pexelsKey }
                });

                if (resp.status === 429) {
                    console.log(`[BRoll] Pexels key ${pexelsKey.substring(0, 8)}... rate limited, trying next...`);
                    lastError = 'Rate limited';
                    continue; // try next key
                }

                if (!resp.ok) {
                    lastError = `Pexels API error: ${resp.statusText}`;
                    continue;
                }

                data = await resp.json();
                break; // success, stop trying
            } catch (err) {
                lastError = err.message;
                continue;
            }
        }

        if (!data) {
            return res.status(429).json({ error: `All ${pexelsKeys.length} Pexels key(s) failed. ${lastError}` });
        }

        const videos = (data.videos || []).map(v => {
            // Get best quality file (HD or SD)
            const hdFile = v.video_files?.find(f => f.quality === 'hd' && f.width >= 720);
            const sdFile = v.video_files?.find(f => f.quality === 'sd');
            const file = hdFile || sdFile || v.video_files?.[0];
            return {
                id: v.id,
                url: v.url,
                image: v.image,
                duration: v.duration,
                width: file?.width || 0,
                height: file?.height || 0,
                downloadUrl: file?.link || '',
                user: v.user?.name || 'Unknown',
                userUrl: v.user?.url || ''
            };
        });

        res.json({ success: true, videos, total: data.total_results || 0, query: keywords });
    } catch (err) {
        console.error('[BRoll] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
