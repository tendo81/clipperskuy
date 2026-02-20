const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const { extractAudio, splitAudioToChunks, formatDuration } = require('./ffmpeg');
const { transcribe, transcribeWithGroq } = require('./transcribe');
const { detectClips } = require('./clipDetector');
const { all, get, run } = require('../database');
const { getRenderLimits } = require('./license');

const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, '..', '..', 'data');

// ===== Active Jobs Tracker (for cancel support) =====
const activeJobs = new Map(); // projectId -> { aborted: false }

function cancelProject(projectId) {
    const job = activeJobs.get(projectId);
    if (job) {
        job.aborted = true;
        console.log(`[Process] Cancel requested for: ${projectId}`);
        return true;
    }
    return false;
}

function getActiveJobs() {
    return [...activeJobs.keys()];
}

// ===== Processing Queue =====
const processingQueue = []; // Array of { projectId, addedAt }
let queueProcessing = false;

function addToQueue(projectId, io) {
    // Don't add if already in queue or actively processing
    if (activeJobs.has(projectId)) {
        return { queued: false, reason: 'Already processing' };
    }
    if (processingQueue.some(q => q.projectId === projectId)) {
        return { queued: false, reason: 'Already in queue' };
    }

    processingQueue.push({ projectId, addedAt: new Date().toISOString() });
    console.log(`[Queue] Added ${projectId} to queue (position: ${processingQueue.length})`);

    if (io) io.emit('queue:updated', getQueueStatus());

    // Start processing if not already running
    if (!queueProcessing) {
        processNextInQueue(io);
    }

    return { queued: true, position: processingQueue.length };
}

async function processNextInQueue(io) {
    if (processingQueue.length === 0) {
        queueProcessing = false;
        console.log('[Queue] Queue empty, stopping.');
        if (io) io.emit('queue:updated', getQueueStatus());
        return;
    }

    queueProcessing = true;
    const item = processingQueue.shift();
    console.log(`[Queue] Processing next: ${item.projectId} (${processingQueue.length} remaining)`);

    if (io) io.emit('queue:updated', getQueueStatus());

    try {
        await processProject(item.projectId, io);
        console.log(`[Queue] Completed: ${item.projectId}`);
        if (io) io.emit('project:updated', { id: item.projectId, status: 'completed' });
    } catch (err) {
        if (err.message === 'CANCELLED') {
            console.log(`[Queue] Cancelled: ${item.projectId}`);
            if (io) io.emit('project:updated', { id: item.projectId, status: 'cancelled' });
        } else {
            console.error(`[Queue] Failed: ${item.projectId} - ${err.message}`);
            if (io) io.emit('project:updated', { id: item.projectId, status: 'failed', error: err.message });
        }
    }

    // Process next item
    processNextInQueue(io);
}

function removeFromQueue(projectId) {
    const idx = processingQueue.findIndex(q => q.projectId === projectId);
    if (idx !== -1) {
        processingQueue.splice(idx, 1);
        console.log(`[Queue] Removed ${projectId} from queue`);
        return true;
    }
    return false;
}

function getQueueStatus() {
    return {
        processing: queueProcessing,
        activeJob: activeJobs.size > 0 ? [...activeJobs.keys()][0] : null,
        queue: processingQueue.map((q, i) => ({
            projectId: q.projectId,
            position: i + 1,
            addedAt: q.addedAt
        })),
        queueLength: processingQueue.length
    };
}

/**
 * Process a video project through the full AI pipeline:
 * 1. Extract audio (chunked if needed) — skipped if transcript exists
 * 2. Transcribe (Groq/Gemini)
 * 3. Detect viral clips (AI)
 * 4. Save results to database
 */
async function processProject(projectId, io) {
    const emit = (step, progress, message) => {
        if (io) io.emit('process:progress', { projectId, step, progress, message });
        console.log(`[Process] [${step}] ${progress}% - ${message}`);
    };

    // Real-time log emitter for the Processing Terminal
    const log = (type, message) => {
        const timestamp = new Date().toISOString().substr(11, 12); // HH:MM:SS.mmm
        const logEntry = { projectId, timestamp, type, message };
        if (io) io.emit('process:log', logEntry);
        const prefix = { info: 'ℹ', success: '✓', warn: '⚠', error: '✗' }[type] || '•';
        console.log(`[Process] ${prefix} ${message}`);
    };

    // Register this job for cancel tracking
    const job = { aborted: false };
    activeJobs.set(projectId, job);

    const checkCancelled = () => {
        if (job.aborted) {
            throw new Error('CANCELLED');
        }
    };

    try {
        log('info', `Starting pipeline for project: ${projectId}`);

        // Load project
        const project = get('SELECT * FROM projects WHERE id = ?', [projectId]);
        if (!project) throw new Error('Project not found');
        if (!project.source_path || !fs.existsSync(project.source_path)) {
            throw new Error('Source video file not found');
        }

        log('info', `Project: "${project.name}"`);
        log('info', `Source: ${path.basename(project.source_path)}`);
        log('info', `Duration: ${formatDuration(project.duration || 0)} | Resolution: ${project.width}×${project.height}`);

        // ===== Check source duration limit (free tier) =====
        const tierLimits = getRenderLimits();
        const maxDurationMin = tierLimits.maxSourceDurationMin;
        const videoDurationMin = (project.duration || 0) / 60;
        if (maxDurationMin < Infinity && videoDurationMin > maxDurationMin) {
            log('warn', `🔒 Free tier: max source video ${maxDurationMin} menit. Video ini ${videoDurationMin.toFixed(1)} menit.`);
            throw new Error(`Free tier hanya mendukung video sampai ${maxDurationMin} menit. Video ini ${videoDurationMin.toFixed(1)} menit. Upgrade ke PRO untuk video tanpa batas!`);
        }

        // Load settings
        const settingsRows = all('SELECT * FROM settings');
        const settings = {};
        settingsRows.forEach(r => { settings[r.key] = r.value; });
        settings.language = (project.language && project.language !== 'auto') ? project.language : (settings.language || 'auto');

        const groqKeyCount = settings.groq_api_key ? settings.groq_api_key.split(',').filter(k => k.trim()).length : 0;
        const geminiKeyCount = settings.gemini_api_key ? settings.gemini_api_key.split(',').filter(k => k.trim()).length : 0;
        log('info', `AI Config: Groq keys=${groqKeyCount}, Gemini keys=${geminiKeyCount}, Primary=${settings.ai_provider_primary}, Language=${settings.language}`);

        if (!settings.groq_api_key && !settings.gemini_api_key) {
            throw new Error('No AI API key configured. Go to Settings and add your Groq or Gemini API key.');
        }

        checkCancelled();

        // Update status
        run("UPDATE projects SET status = 'transcribing', error_message = NULL, updated_at = datetime('now') WHERE id = ?", [projectId]);
        log('info', 'Status → transcribing');

        // ===== CHECK FOR EXISTING TRANSCRIPT =====
        const existingTranscript = get('SELECT * FROM transcripts WHERE project_id = ?', [projectId]);
        let transcript;
        const videoDuration = project.duration || 0;

        if (existingTranscript && existingTranscript.full_text) {
            // Reuse existing transcript — skip expensive audio extraction
            emit('transcribe', 50, 'Using existing transcript (skipping re-transcription)');
            log('success', 'Existing transcript found — skipping re-transcription');
            transcript = {
                text: existingTranscript.full_text,
                language: existingTranscript.language || 'unknown',
                segments: JSON.parse(existingTranscript.segment_data || '[]'),
                words: JSON.parse(existingTranscript.word_data || '[]')
            };
            log('info', `Transcript: ${transcript.text.length} chars, ${transcript.segments.length} segments, lang=${transcript.language}`);
        } else {
            // ===== STEP 1: Extract Audio + Transcribe =====
            emit('audio', 5, 'Extracting audio from video...');
            log('info', '── STEP 1: Audio Extraction ──');
            const tempDir = path.join(DATA_DIR, 'temp', projectId);
            fs.ensureDirSync(tempDir);
            log('info', `Temp directory: ${tempDir}`);

            checkCancelled();

            if (videoDuration > 600 && settings.groq_api_key) {
                // Long video: chunked transcription
                log('warn', `Long video detected (${formatDuration(videoDuration)}). Will use chunked transcription.`);
                emit('audio', 8, `Long video detected (${formatDuration(videoDuration)}). Splitting into chunks...`);
                const chunks = await splitAudioToChunks(project.source_path, tempDir, videoDuration);
                emit('audio', 20, `Split into ${chunks.length} audio chunks`);
                log('success', `Audio split into ${chunks.length} chunks (10 min each)`);

                const allSegments = [];
                const allWords = [];
                let fullText = '';
                let detectedLanguage = 'unknown';

                log('info', '── STEP 2: Transcription (Chunked) ──');
                for (let i = 0; i < chunks.length; i++) {
                    checkCancelled();
                    const chunk = chunks[i];
                    const pct = 20 + Math.round((i / chunks.length) * 35);
                    emit('transcribe', pct, `Transcribing chunk ${i + 1}/${chunks.length}...`);
                    log('info', `Transcribing chunk ${i + 1}/${chunks.length} [${formatDuration(chunk.startTime)} → ${formatDuration(chunk.startTime + chunk.duration)}]...`);

                    try {
                        const result = await transcribeWithGroq(chunk.path, settings.groq_api_key, settings.language);
                        const offsetSegments = (result.segments || []).map(seg => ({
                            ...seg,
                            start: (seg.start || 0) + chunk.startTime,
                            end: (seg.end || 0) + chunk.startTime
                        }));
                        allSegments.push(...offsetSegments);
                        // Collect word timestamps with offset
                        const offsetWords = (result.words || []).map(w => ({
                            ...w,
                            start: (w.start || 0) + chunk.startTime,
                            end: (w.end || 0) + chunk.startTime
                        }));
                        allWords.push(...offsetWords);
                        fullText += (fullText ? ' ' : '') + result.text;
                        if (result.language) detectedLanguage = result.language;
                        log('success', `Chunk ${i + 1} done: ${result.text.length} chars, ${(result.segments || []).length} segments, ${offsetWords.length} words`);
                    } catch (err) {
                        log('error', `Chunk ${i + 1} failed: ${err.message}`);
                        if (err.message.includes('429') || err.message.includes('rate')) {
                            log('warn', 'Rate limited — waiting 60s before retry...');
                            emit('transcribe', pct, `Rate limited, waiting 60s...`);
                            await new Promise(r => setTimeout(r, 60000));
                            try {
                                log('info', `Retrying chunk ${i + 1}...`);
                                const result = await transcribeWithGroq(chunk.path, settings.groq_api_key, settings.language);
                                const offsetSegments = (result.segments || []).map(seg => ({
                                    ...seg,
                                    start: (seg.start || 0) + chunk.startTime,
                                    end: (seg.end || 0) + chunk.startTime
                                }));
                                allSegments.push(...offsetSegments);
                                fullText += (fullText ? ' ' : '') + result.text;
                                if (result.language) detectedLanguage = result.language;
                                log('success', `Chunk ${i + 1} retry succeeded: ${result.text.length} chars`);
                            } catch (retryErr) {
                                log('error', `Chunk ${i + 1} retry failed: ${retryErr.message}`);
                            }
                        }
                    }

                    if (i < chunks.length - 1) {
                        log('info', 'Cooldown 2s between chunks...');
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }

                if (!fullText) {
                    throw new Error('Transcription failed: no text produced');
                }

                transcript = { text: fullText, language: detectedLanguage, segments: allSegments, words: allWords };
                log('info', `Word-level timestamps collected: ${allWords.length} words`);
                log('success', `All chunks transcribed. Total: ${fullText.length} chars, ${allSegments.length} segments`);
            } else {
                // Short video: single file transcription
                checkCancelled();
                log('info', 'Extracting audio → WAV (mono, 16kHz)...');
                const audioPath = path.join(tempDir, 'audio.wav');
                await extractAudio(project.source_path, audioPath);
                emit('audio', 20, 'Audio extracted');

                const audioStats = fs.statSync(audioPath);
                const audioSizeMB = audioStats.size / (1024 * 1024);
                log('success', `Audio extracted: ${audioSizeMB.toFixed(1)} MB`);

                if (audioSizeMB > 24 && settings.ai_provider_primary === 'groq') {
                    log('warn', `Audio too large for Groq (${audioSizeMB.toFixed(1)} MB > 24 MB). Switching to Gemini.`);
                    settings.ai_provider_primary = 'gemini';
                    settings.ai_provider_fallback = 'groq';
                }

                checkCancelled();
                log('info', '── STEP 2: Transcription ──');
                log('info', `Provider: ${settings.ai_provider_primary} (fallback: ${settings.ai_provider_fallback})`);
                emit('transcribe', 25, 'Transcribing with AI...');
                transcript = await transcribe(audioPath, settings);
                log('success', `Transcription complete: ${transcript.text.length} chars, lang=${transcript.language}`);
            }

            // Save transcript
            log('info', 'Saving transcript to database...');
            run('DELETE FROM transcripts WHERE project_id = ?', [projectId]);
            const transcriptId = uuidv4();
            run(`INSERT INTO transcripts (id, project_id, full_text, language, provider, segment_data, word_data)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                transcriptId, projectId, transcript.text, transcript.language,
                settings.ai_provider_primary,
                JSON.stringify(transcript.segments),
                JSON.stringify(transcript.words)
            ]);
            log('success', 'Transcript saved');

            // Cleanup temp
            try { fs.removeSync(tempDir); log('info', 'Temp files cleaned up'); } catch (e) { }
        }

        emit('transcribe', 55, `Transcribed: ${transcript.text.length} chars, ${transcript.segments?.length || 0} segments`);

        // Update status
        run("UPDATE projects SET status = 'analyzing', updated_at = datetime('now') WHERE id = ?", [projectId]);
        log('info', 'Status → analyzing');

        checkCancelled();

        // ===== STEP 3: Detect Clips =====
        log('info', '── STEP 3: AI Clip Detection ──');
        emit('clips', 60, 'AI analyzing for viral clips...');

        let clips;
        try {
            // For clip detection (text-only), prefer Groq
            const clipSettings = { ...settings };
            if (clipSettings.groq_api_key) {
                clipSettings.ai_provider_primary = 'groq';
                clipSettings.ai_provider_fallback = 'gemini';
            }
            log('info', `Clip detection provider: ${clipSettings.ai_provider_primary}`);
            log('info', `Config: duration=${project.min_duration}s–${project.max_duration}s, target=${project.clip_count_target}, platform=${project.platform}`);
            clips = await detectClips(transcript, clipSettings, {
                min_duration: project.min_duration,
                max_duration: project.max_duration,
                clip_count_target: project.clip_count_target,
                platform: project.platform,
                duration: project.duration
            });
        } catch (err) {
            log('error', `Clip detection failed: ${err.message}`);
            run("UPDATE projects SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?",
                [`Clip detection failed: ${err.message}`, projectId]);
            throw err;
        }

        log('success', `Found ${clips.length} viral clips!`);
        clips.forEach((c, i) => {
            log('info', `  Clip #${c.clip_number}: "${c.title}" (${formatDuration(c.start_time)}→${formatDuration(c.end_time)}, score=${c.virality_score})`);
        });
        emit('clips', 85, `Found ${clips.length} viral clips!`);

        checkCancelled();

        // ===== STEP 4: Save Clips =====
        log('info', '── STEP 4: Saving Results ──');
        emit('save', 90, 'Saving clips to database...');
        run('DELETE FROM clips WHERE project_id = ?', [projectId]);

        for (const clip of clips) {
            run(`INSERT INTO clips (id, project_id, clip_number, title, hook_text, summary, start_time, end_time, duration, 
                 content_type, virality_score, score_hook, score_content, score_emotion, score_share, score_complete,
                 improvement_tips, hashtags, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'detected')`, [
                clip.id, projectId, clip.clip_number, clip.title, clip.hook_text, clip.summary,
                clip.start_time, clip.end_time, clip.duration, clip.content_type, clip.virality_score,
                clip.score_hook, clip.score_content, clip.score_emotion, clip.score_share, clip.score_complete,
                clip.improvement_tips, clip.hashtags
            ]);
        }
        log('success', `${clips.length} clips saved to database`);

        // ===== Clip count limit (free tier) =====
        const maxClips = tierLimits.maxClipsPerProject;
        if (maxClips < Infinity && clips.length > maxClips) {
            log('warn', `🔒 Free tier: max ${maxClips} clips per project. ${clips.length - maxClips} clip(s) disembunyikan.`);
            // Mark excess clips as 'locked'
            const excessClips = all('SELECT id FROM clips WHERE project_id = ? ORDER BY virality_score DESC LIMIT -1 OFFSET ?', [projectId, maxClips]);
            for (const ec of excessClips) {
                run("UPDATE clips SET status = 'locked' WHERE id = ?", [ec.id]);
            }
            log('info', `Top ${maxClips} clips tersedia. Upgrade ke PRO untuk akses semua ${clips.length} clips.`);
        }

        // ===== DONE =====
        run("UPDATE projects SET status = 'completed', updated_at = datetime('now') WHERE id = ?", [projectId]);
        emit('done', 100, `Processing complete! ${clips.length} clips found.`);
        log('success', `✨ Pipeline complete! ${clips.length} clips ready.`);

        return {
            clips: clips.length,
            transcript: { text: transcript.text, language: transcript.language }
        };

    } catch (err) {
        if (err.message === 'CANCELLED') {
            log('warn', '⏹ Processing cancelled by user.');
            run("UPDATE projects SET status = 'cancelled', error_message = 'Cancelled by user', updated_at = datetime('now') WHERE id = ?", [projectId]);
            emit('cancelled', 0, 'Processing cancelled by user.');

            // Cleanup temp files
            const tempDir = path.join(DATA_DIR, 'temp', projectId);
            try { fs.removeSync(tempDir); } catch (e) { }
        } else {
            console.error('[Process] Pipeline error:', err.message);
            log('error', `Pipeline failed: ${err.message}`);
            run("UPDATE projects SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?",
                [err.message, projectId]);
            emit('error', 0, err.message);
        }
        throw err;
    } finally {
        activeJobs.delete(projectId);
    }
}

/**
 * Re-transcribe a project: delete existing transcript, then run pipeline again
 */
async function retranscribeProject(projectId, io) {
    console.log(`[Retranscribe] Deleting existing transcript for project: ${projectId}`);
    run('DELETE FROM transcripts WHERE project_id = ?', [projectId]);
    return processProject(projectId, io);
}

module.exports = { processProject, cancelProject, getActiveJobs, addToQueue, removeFromQueue, getQueueStatus, retranscribeProject };
