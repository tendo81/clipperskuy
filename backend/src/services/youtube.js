const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.CLIPPERSKUY_DATA || path.join(__dirname, '..', '..', 'data');

// Resolve yt-dlp binary path (bundled in Electron or system PATH)
function findYtDlp() {
    if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;

    const os = require('os');
    // Common locations for yt-dlp on Windows
    const candidates = [
        'yt-dlp',  // system PATH
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe'),
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe'),
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'Scripts', 'yt-dlp.exe'),
        path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python310', 'Scripts', 'yt-dlp.exe'),
        'C:\\yt-dlp\\yt-dlp.exe',
        path.join(os.homedir(), 'scoop', 'shims', 'yt-dlp.exe'),
    ];
    for (const p of candidates) {
        if (p !== 'yt-dlp' && fs.existsSync(p)) {
            console.log(`[yt-dlp] Found at: ${p}`);
            return p;
        }
    }
    return 'yt-dlp'; // fallback to PATH
}
const YTDLP_BIN = findYtDlp();

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
 * @param {string|null} playerClient - specific player client, or null for yt-dlp default
 */
function getBaseArgs(playerClient = null) {
    const args = [
        '--user-agent', USER_AGENT,
        '--sleep-requests', '0.5',
        '--sleep-interval', '0.5',
        '--max-sleep-interval', '2',
        '--no-check-certificates',
        '--no-warnings',
    ];
    // Only force player_client when explicitly needed (fallback strategies)
    // Default yt-dlp client selection gets ALL formats including HD via JS solver
    if (playerClient) {
        args.push('--extractor-args', `youtube:player_client=${playerClient}`);
    }
    return args;
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

    // Player clients to try (different ones bypass different blocks)
    const playerClients = ['web', 'mweb', 'android', 'ios'];

    // Build list of strategies to try
    // IMPORTANT: Browser cookies are needed for HD formats (720p+)!
    // YouTube now requires PO Token for HD; without cookies only 360p is available.
    // So we try WITH cookies first, then fall back to no-cookies (360p only).
    const strategies = [];

    // Check if user has a preferred browser in settings
    let preferredBrowser = null;
    try {
        const { get } = require('../database');
        const setting = get('SELECT value FROM settings WHERE key = ?', ['yt_cookie_browser']);
        if (setting && setting.value && setting.value !== 'auto' && setting.value !== 'none') {
            preferredBrowser = setting.value;
        }
    } catch (e) { /* ignore */ }

    // 1. Default yt-dlp (no forced player_client, no cookies) — gets HD via JS solver
    strategies.push({ name: 'default (auto)', args: [], client: null });

    // 2. cookies.txt (manual export = most reliable for HD)
    if (hasCookiesFile) {
        strategies.push({ name: 'cookies.txt', args: ['--cookies', cookiesPath], client: null });
    }

    // 3. Preferred browser cookies
    if (preferredBrowser) {
        strategies.push({
            name: `browser: ${preferredBrowser} (preferred)`,
            args: ['--cookies-from-browser', preferredBrowser],
            client: null
        });
    }

    // 4. All installed browsers with cookies (for HD access with PO token)
    for (const browser of installedBrowsers) {
        strategies.push({
            name: `browser: ${browser}`,
            args: ['--cookies-from-browser', browser],
            client: null
        });
    }

    // 5. Forced player_clients as LAST fallback (likely only 360p)
    for (const client of playerClients) {
        strategies.push({ name: `fallback (${client})`, args: [], client });
    }

    let strategyIdx = 0;
    let lastStderr = '';

    function tryStrategy() {
        return new Promise((resolve, reject) => {
            if (strategyIdx >= strategies.length) {
                return reject(new Error(
                    'YouTube download failed with all strategies!\n' +
                    'Tried: ' + strategies.map(s => s.name).join(', ') + '\n' +
                    'Last error: ' + (lastStderr || 'unknown').slice(-200) + '\n' +
                    'Suggestions:\n' +
                    '1. Close ALL browsers, then try again\n' +
                    '2. Export cookies.txt manually → place in backend/data/\n' +
                    '3. Make sure you are logged into YouTube in at least one browser'
                ));
            }

            const strategy = strategies[strategyIdx];
            const allArgs = [...getBaseArgs(strategy.client), ...strategy.args, ...extraArgs];
            console.log(`[yt-dlp] Strategy ${strategyIdx + 1}/${strategies.length}: ${strategy.name}`);
            console.log(`[yt-dlp] Args: ${YTDLP_BIN} ${allArgs.join(' ').substring(0, 200)}...`);

            // Emit strategy info to frontend
            if (opts.io) opts.io.emit('youtube:log', { message: `Trying: ${strategy.name} (${strategyIdx + 1}/${strategies.length})...` });

            // Ensure Deno is in PATH for yt-dlp JS challenge solving
            const denoDir = path.join(require('os').homedir(), '.deno', 'bin');
            const spawnEnv = { ...process.env };
            if (!spawnEnv.PATH?.includes('.deno')) {
                spawnEnv.PATH = `${denoDir};${spawnEnv.PATH || ''}`;
            }

            const proc = spawn(YTDLP_BIN, allArgs, { windowsHide: true, env: spawnEnv });
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
                // yt-dlp sometimes exits with code 1 due to warnings (e.g., PO Token)
                // even though the download succeeded. Check stdout for success indicators
                // before deciding to retry.
                const hasDownloaded = stdout.includes('[download] 100%') ||
                    stdout.includes('has already been downloaded') ||
                    stdout.includes('Merging formats into');

                if (code !== 0 && !hasDownloaded) {
                    const errLower = stderr.toLowerCase();
                    const reason = errLower.includes('sign in') || errLower.includes('bot') ? 'bot detected'
                        : errLower.includes('could not copy') || errLower.includes('cookie database') ? 'cookie locked'
                            : errLower.includes('http error') ? 'HTTP error'
                                : errLower.includes('unsupported url') ? 'unsupported URL'
                                    : 'unknown error';
                    console.log(`[yt-dlp] Strategy "${strategy.name}" failed (${reason})`);
                    console.log(`[yt-dlp] stderr tail: ${stderr.slice(-500)}`);
                    lastStderr = stderr;
                    strategyIdx++;
                    tryStrategy().then(resolve).catch(reject);
                    return;
                }

                if (code !== 0 && hasDownloaded) {
                    console.log(`[yt-dlp] Strategy "${strategy.name}" exited with code ${code} but download completed successfully`);
                }

                resolve({ stdout, stderr, code: 0 });
            });

            proc.on('error', (err) => {
                console.log(`[yt-dlp] Strategy "${strategy.name}" error: ${err.message}, trying next...`);
                lastStderr = err.message;
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
 * @param {string} url
 * @param {string} outputDir
 * @param {Function} onProgress
 * @param {object} io - Socket.IO instance for real-time logs
 */
function downloadYoutube(url, outputDir, onProgress, io) {
    return new Promise(async (resolve, reject) => {
        try {
            fs.ensureDirSync(outputDir);
            const outputId = uuidv4();
            const outputTemplate = path.join(outputDir, `${outputId}.%(ext)s`);

            let outputFile = null;

            // Format priority (more aggressive about getting HD):
            // 1. Best MP4 video ≤1080p + best M4A audio (ideal)
            // 2. Best ANY video ≤1080p + best audio (allows webm/av01 which have more formats)
            // 3. Best combined MP4 (single stream, often 720p)
            // 4. Best anything available
            const formatStr = [
                'bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]',
                'bestvideo[height<=1080]+bestaudio',
                'best[ext=mp4][height>=720]',
                'best[ext=mp4]',
                'best'
            ].join('/');

            console.log('[yt-dlp] Downloading:', url);
            console.log('[yt-dlp] Format selector:', formatStr);
            const result = await runYtDlpWithRetry([
                '-f', formatStr,
                '--merge-output-format', 'mp4',
                '-o', outputTemplate,
                '--no-playlist',
                '--newline',
                url
            ], {
                io,
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

            // Post-download: check actual resolution and warn if low
            let resolution = null;
            try {
                const { execSync } = require('child_process');
                const ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
                const probe = execSync(
                    `"${ffprobePath}" -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${outputFile}"`,
                    { encoding: 'utf-8', timeout: 10000 }
                ).trim();
                const [w, h] = probe.split(',').map(Number);
                resolution = { width: w, height: h };
                if (w && h) {
                    const maxDim = Math.max(w, h);
                    if (maxDim < 720) {
                        console.warn(`[yt-dlp] ⚠️ LOW RESOLUTION: Downloaded video is only ${w}x${h} (${maxDim < 480 ? '360p' : '480p'}). Output quality will be poor.`);
                    } else {
                        console.log(`[yt-dlp] ✅ Resolution: ${w}x${h}`);
                    }
                }
            } catch (e) { /* ignore probe errors */ }

            resolve({
                filePath: outputFile,
                fileSize: stats.size,
                fileName: path.basename(outputFile),
                resolution
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
