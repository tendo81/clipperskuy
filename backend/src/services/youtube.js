const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// User agent to match a real browser
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// All browsers to try for cookies (in priority order)
const BROWSER_LIST = ['chrome', 'edge', 'firefox', 'brave', 'opera', 'vivaldi', 'chromium'];

/**
 * Detect which browsers are installed on this system
 */
function getInstalledBrowsers() {
    const home = process.env.LOCALAPPDATA || process.env.APPDATA || '';
    const appData = process.env.APPDATA || '';
    const browserPaths = {
        chrome: path.join(home, 'Google', 'Chrome', 'User Data'),
        edge: path.join(home, 'Microsoft', 'Edge', 'User Data'),
        firefox: path.join(appData, 'Mozilla', 'Firefox', 'Profiles'),
        brave: path.join(home, 'BraveSoftware', 'Brave-Browser', 'User Data'),
        opera: path.join(appData, 'Opera Software', 'Opera Stable'),
        vivaldi: path.join(home, 'Vivaldi', 'User Data'),
        chromium: path.join(home, 'Chromium', 'User Data'),
    };

    const installed = [];
    for (const [name, bPath] of Object.entries(browserPaths)) {
        try {
            if (fs.existsSync(bPath)) installed.push(name);
        } catch (e) { /* skip */ }
    }
    return installed;
}

/**
 * Get base anti-bot yt-dlp args (without cookies)
 */
function getBaseArgs() {
    return [
        '--user-agent', USER_AGENT,
        '--js-runtimes', 'node',
        '--extractor-args', 'youtube:player_client=web',
        '--sleep-requests', '1',
        '--sleep-interval', '1',
        '--max-sleep-interval', '3',
        '--no-check-certificates',
    ];
}

/**
 * Run a yt-dlp command with auto-retry using different browser cookies
 * Strategy:
 *  1. Try with base args only (EJS solver, no cookies)
 *  2. If that fails with bot detection, try cookies.txt
 *  3. If still fails, try each installed browser's cookies
 * @param {string[]} extraArgs - extra yt-dlp args (e.g. --dump-json, -f, etc)
 * @param {object} opts - { onStdout, onStderr } optional handlers
 * @returns {Promise<{stdout: string, code: number}>}
 */
function runYtDlpWithRetry(extraArgs, opts = {}) {
    const installedBrowsers = getInstalledBrowsers();
    const cookiesPath = path.join(DATA_DIR, 'cookies.txt');
    const hasCookiesFile = fs.existsSync(cookiesPath);

    // Build list of cookie strategies to try
    const strategies = [
        { name: 'no-cookies (EJS only)', args: [] },
    ];

    // cookies.txt has highest priority
    if (hasCookiesFile) {
        strategies.splice(0, 0, { name: 'cookies.txt', args: ['--cookies', cookiesPath] });
    }

    // Then try each installed browser
    for (const browser of installedBrowsers) {
        strategies.push({ name: `browser: ${browser}`, args: ['--cookies-from-browser', browser] });
    }

    // Check if user has a preferred browser in settings
    try {
        const { get } = require('../database');
        const setting = get('SELECT value FROM settings WHERE key = ?', ['yt_cookie_browser']);
        if (setting && setting.value && setting.value !== 'auto' && setting.value !== 'none') {
            // Move user's preferred browser to the top (after cookies.txt)
            const insertIdx = hasCookiesFile ? 1 : 0;
            strategies.splice(insertIdx, 0, {
                name: `browser: ${setting.value} (preferred)`,
                args: ['--cookies-from-browser', setting.value]
            });
        }
    } catch (e) { /* ignore */ }

    let strategyIdx = 0;

    function tryStrategy() {
        return new Promise((resolve, reject) => {
            if (strategyIdx >= strategies.length) {
                return reject(new Error(
                    'YouTube download failed with all strategies!\n' +
                    'Tried: ' + strategies.map(s => s.name).join(', ') + '\n' +
                    'Suggestions:\n' +
                    '1. Close ALL browsers, then try again\n' +
                    '2. Export cookies.txt manually → place in backend/data/\n' +
                    '3. Make sure you are logged into YouTube in at least one browser'
                ));
            }

            const strategy = strategies[strategyIdx];
            const allArgs = [...getBaseArgs(), ...strategy.args, ...extraArgs];
            console.log(`[yt-dlp] Strategy ${strategyIdx + 1}/${strategies.length}: ${strategy.name}`);

            const proc = spawn('yt-dlp', allArgs);
            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (d) => {
                stdout += d.toString();
                if (opts.onStdout) opts.onStdout(d.toString());
            });
            proc.stderr.on('data', (d) => {
                const line = d.toString().trim();
                if (line) console.log(`[yt-dlp][${strategy.name}]`, line);
                stderr += d.toString();
                if (opts.onStderr) opts.onStderr(d.toString());
            });

            proc.on('close', (code) => {
                const errLower = stderr.toLowerCase();
                const isBotDetected = errLower.includes('sign in') || errLower.includes('bot') || errLower.includes('confirm your age');
                const isCookieError = errLower.includes('could not copy') || errLower.includes('cookie database');

                // If cookie copy failed or bot detected, try next strategy
                if (code !== 0 && (isBotDetected || isCookieError)) {
                    console.log(`[yt-dlp] Strategy "${strategy.name}" failed (${isCookieError ? 'cookie locked' : 'bot detected'}), trying next...`);
                    strategyIdx++;
                    tryStrategy().then(resolve).catch(reject);
                    return;
                }

                resolve({ stdout, stderr, code });
            });

            proc.on('error', (err) => {
                console.log(`[yt-dlp] Strategy "${strategy.name}" error: ${err.message}, trying next...`);
                strategyIdx++;
                tryStrategy().then(resolve).catch(reject);
            });
        });
    }

    return tryStrategy();
}

/**
 * Get YouTube video info without downloading (with anti-bot + retry)
 */
function getYoutubeInfo(url) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('[yt-dlp] Getting info for:', url);
            const result = await runYtDlpWithRetry([
                '--dump-json', '--no-download', '--no-playlist', url
            ]);

            if (result.code !== 0) {
                return reject(new Error(`yt-dlp info failed: ${result.stderr.slice(-300)}`));
            }

            const info = JSON.parse(result.stdout);
            resolve({
                title: info.title || 'Untitled',
                duration: info.duration || 0,
                width: info.width || 1920,
                height: info.height || 1080,
                fps: info.fps || 30,
                thumbnail: info.thumbnail || null,
                uploader: info.uploader || '',
                description: info.description || '',
                viewCount: info.view_count || 0,
            });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Download YouTube video with progress callback (with anti-bot + retry)
 */
function downloadYoutube(url, outputDir, onProgress) {
    return new Promise(async (resolve, reject) => {
        try {
            fs.ensureDirSync(outputDir);
            const outputId = uuidv4();
            const outputTemplate = path.join(outputDir, `${outputId}.%(ext)s`);

            let outputFile = null;

            console.log('[yt-dlp] Downloading:', url);
            const result = await runYtDlpWithRetry([
                '-f', 'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                '--merge-output-format', 'mp4',
                '-o', outputTemplate,
                '--no-playlist',
                '--newline',
                url
            ], {
                onStdout: (data) => {
                    const line = data.trim();
                    // Parse progress
                    const progressMatch = line.match(/(\d+\.?\d*)%/);
                    if (progressMatch && onProgress) {
                        onProgress(parseFloat(progressMatch[1]), line);
                    }
                    // Capture destination file
                    const destMatch = line.match(/Destination:\s+(.+)/);
                    if (destMatch) outputFile = destMatch[1].trim();
                    // Merge message contains final file
                    const mergeMatch = line.match(/Merging formats into "(.+)"/);
                    if (mergeMatch) outputFile = mergeMatch[1].trim();
                }
            });

            if (result.code !== 0) {
                return reject(new Error(`yt-dlp exited with code ${result.code}: ${result.stderr.slice(-200)}`));
            }

            // Find the output file if we didn't capture it
            if (!outputFile) {
                const files = fs.readdirSync(outputDir).filter(f => f.startsWith(outputId));
                if (files.length > 0) {
                    outputFile = path.join(outputDir, files[0]);
                }
            }

            if (!outputFile || !fs.existsSync(outputFile)) {
                return reject(new Error('Download completed but output file not found'));
            }

            const stats = fs.statSync(outputFile);
            resolve({
                filePath: outputFile,
                fileSize: stats.size,
                fileName: path.basename(outputFile)
            });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * List available YouTube captions/subtitles
 */
function getYoutubeCaptions(url) {
    return new Promise(async (resolve, reject) => {
        try {
            const result = await runYtDlpWithRetry([
                '--list-subs', '--skip-download', '--no-playlist', url
            ]);

            if (result.code !== 0) return reject(new Error(`yt-dlp captions list failed: ${result.stderr.slice(-200)}`));

            const lines = result.stdout.split('\n');
            const captions = [];
            let section = ''; // 'manual' or 'auto'

            for (const line of lines) {
                if (line.includes('Available subtitles')) {
                    section = 'manual';
                    continue;
                }
                if (line.includes('Available automatic captions')) {
                    section = 'auto';
                    continue;
                }
                if (!section) continue;

                // Parse lines like: en       vtt, ttml, srv3, srv2, srv1, json3
                const match = line.match(/^(\S+)\s+(.+)/);
                if (match && !match[1].startsWith('[') && !match[1].startsWith('Language')) {
                    const lang = match[1].trim();
                    const formats = match[2].trim();
                    captions.push({
                        language: lang,
                        type: section, // 'manual' or 'auto'
                        formats: formats
                    });
                }
            }

            resolve(captions);
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Download YouTube captions and parse into transcript
 * @param {string} url - YouTube URL
 * @param {string} lang - Language code (e.g., 'en', 'id')
 * @param {string} outputDir - Temp directory for downloaded files
 * @returns {Object} { text, language, segments, provider }
 */
function downloadYoutubeCaptions(url, lang, outputDir) {
    return new Promise(async (resolve, reject) => {
        try {
            fs.ensureDirSync(outputDir);
            const outputFile = path.join(outputDir, `captions_${lang}`);

            const result = await runYtDlpWithRetry([
                '--write-subs',
                '--write-auto-subs',
                '--sub-lang', lang,
                '--sub-format', 'vtt',
                '--skip-download',
                '-o', outputFile,
                '--no-playlist',
                url
            ]);

            if (result.code !== 0) {
                return reject(new Error(`yt-dlp caption download failed (code ${result.code}): ${result.stderr.slice(-200)}`));
            }

            // Find the downloaded VTT file
            const files = fs.readdirSync(outputDir)
                .filter(f => f.startsWith(`captions_${lang}`) && f.endsWith('.vtt'));

            if (files.length === 0) {
                return reject(new Error(`No captions found for language: ${lang}`));
            }

            // Parse the VTT file
            const vttPath = path.join(outputDir, files[0]);
            const content = fs.readFileSync(vttPath, 'utf-8');

            const { text, segments } = parseVTT(content);

            if (!text || text.trim().length < 10) {
                return reject(new Error('Downloaded captions are empty or too short'));
            }

            // Determine if auto or manual
            const isAuto = files[0].includes('.auto.') || files[0].includes('auto-generated');
            const provider = isAuto ? 'youtube_auto' : 'youtube_manual';

            // Cleanup
            try { fs.unlinkSync(vttPath); } catch (e) { }

            resolve({
                text: text.trim(),
                language: lang,
                segments,
                provider
            });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Parse VTT content into text and segments
 */
function parseVTT(content) {
    const segments = [];
    let fullText = '';
    const seen = new Set(); // Deduplicate repeated lines (common in auto-captions)

    // Remove WEBVTT header and style blocks
    const cleaned = content
        .replace(/^WEBVTT[\s\S]*?\n\n/, '')
        .replace(/Style:[\s\S]*?\n\n/g, '')
        .replace(/<[^>]+>/g, ''); // Remove HTML tags

    const blocks = cleaned.trim().split(/\n\s*\n/);

    for (const block of blocks) {
        const lines = block.trim().split('\n');

        for (let i = 0; i < lines.length; i++) {
            // Match timestamp lines: HH:MM:SS.mmm --> HH:MM:SS.mmm or MM:SS.mmm --> MM:SS.mmm
            const timeMatch = lines[i].match(
                /(?:(\d{2}):)?(\d{2}):(\d{2})[.](\d{3})\s*-->\s*(?:(\d{2}):)?(\d{2}):(\d{2})[.](\d{3})/
            );

            if (timeMatch) {
                const start = (parseInt(timeMatch[1] || 0) * 3600) +
                    (parseInt(timeMatch[2]) * 60) +
                    parseInt(timeMatch[3]) +
                    (parseInt(timeMatch[4]) / 1000);
                const end = (parseInt(timeMatch[5] || 0) * 3600) +
                    (parseInt(timeMatch[6]) * 60) +
                    parseInt(timeMatch[7]) +
                    (parseInt(timeMatch[8]) / 1000);

                const text = lines.slice(i + 1).join(' ').trim();

                if (text && !seen.has(text)) {
                    seen.add(text);
                    segments.push({ start, end, text });
                    fullText += (fullText ? ' ' : '') + text;
                }
                break;
            }
        }
    }

    return { text: fullText, segments };
}

module.exports = { getYoutubeInfo, downloadYoutube, getYoutubeCaptions, downloadYoutubeCaptions };
