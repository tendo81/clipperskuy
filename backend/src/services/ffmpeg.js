const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs-extra');

/**
 * Get video metadata using ffprobe
 */
function getVideoInfo(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) return reject(err);

            const videoStream = metadata.streams.find(s => s.codec_type === 'video');
            const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

            resolve({
                duration: metadata.format.duration || 0,
                width: videoStream?.width || 0,
                height: videoStream?.height || 0,
                fps: videoStream?.r_frame_rate ? eval(videoStream.r_frame_rate) : 30,
                codec: videoStream?.codec_name || 'unknown',
                bitrate: metadata.format.bit_rate || 0,
                fileSize: metadata.format.size || 0,
                hasAudio: !!audioStream,
                audioCodec: audioStream?.codec_name || null,
                audioSampleRate: audioStream?.sample_rate || null,
            });
        });
    });
}

/**
 * Generate thumbnail from video at specified time
 */
function generateThumbnail(videoPath, outputDir, timestamp = '00:00:02') {
    return new Promise((resolve, reject) => {
        const filename = `thumb_${Date.now()}.jpg`;
        const outputPath = path.join(outputDir, filename);

        fs.ensureDirSync(outputDir);

        ffmpeg(videoPath)
            .screenshots({
                timestamps: [timestamp],
                filename: filename,
                folder: outputDir,
                size: '640x360'
            })
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err));
    });
}

/**
 * Extract audio from video for transcription
 */
function extractAudio(videoPath, outputPath) {
    return new Promise((resolve, reject) => {
        fs.ensureDirSync(path.dirname(outputPath));

        ffmpeg(videoPath)
            .output(outputPath)
            .audioChannels(1)
            .audioFrequency(16000)
            .noVideo()
            .format('wav')
            .on('progress', (progress) => {
                // Can emit progress via callback
            })
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err))
            .run();
    });
}

/**
 * Format duration to human readable
 */
function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Detect hardware acceleration available
 */
async function detectEncoder() {
    return new Promise((resolve) => {
        const { exec } = require('child_process');
        exec('ffmpeg -encoders 2>&1', (err, stdout) => {
            if (err) return resolve({ type: 'cpu', encoder: 'libx264', name: 'CPU (Software)' });

            if (stdout.includes('h264_nvenc')) {
                resolve({ type: 'nvidia', encoder: 'h264_nvenc', name: 'NVIDIA NVENC' });
            } else if (stdout.includes('h264_amf')) {
                resolve({ type: 'amd', encoder: 'h264_amf', name: 'AMD AMF' });
            } else if (stdout.includes('h264_qsv')) {
                resolve({ type: 'intel', encoder: 'h264_qsv', name: 'Intel QSV' });
            } else {
                resolve({ type: 'cpu', encoder: 'libx264', name: 'CPU (Software)' });
            }
        });
    });
}

/**
 * Extract a chunk of audio from a specific time range
 */
function extractAudioChunk(videoPath, outputPath, startTime, duration) {
    return new Promise((resolve, reject) => {
        fs.ensureDirSync(path.dirname(outputPath));

        ffmpeg(videoPath)
            .output(outputPath)
            .setStartTime(startTime)
            .setDuration(duration)
            .audioChannels(1)
            .audioFrequency(16000)
            .noVideo()
            .format('wav')
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err))
            .run();
    });
}

/**
 * Split a long video into audio chunks for transcription
 * Each chunk is ~10 minutes to stay well under Groq's 25MB limit
 */
async function splitAudioToChunks(videoPath, outputDir, totalDuration) {
    fs.ensureDirSync(outputDir);

    const CHUNK_DURATION = 600; // 10 minutes per chunk
    const chunks = [];
    let offset = 0;
    let chunkIndex = 0;

    while (offset < totalDuration) {
        const duration = Math.min(CHUNK_DURATION, totalDuration - offset);
        const chunkPath = path.join(outputDir, `chunk_${chunkIndex}.wav`);

        await extractAudioChunk(videoPath, chunkPath, offset, duration);

        chunks.push({
            path: chunkPath,
            startTime: offset,
            duration: duration,
            index: chunkIndex
        });

        offset += CHUNK_DURATION;
        chunkIndex++;
    }

    console.log(`[FFmpeg] Split audio into ${chunks.length} chunks (${CHUNK_DURATION}s each)`);
    return chunks;
}

module.exports = { getVideoInfo, generateThumbnail, extractAudio, extractAudioChunk, splitAudioToChunks, formatDuration, detectEncoder };
