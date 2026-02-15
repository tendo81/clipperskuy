const { v4: uuidv4 } = require('uuid');
const { keyPool } = require('./keyPool');

/**
 * Prepare transcript for analysis — sample segments evenly from entire video
 * to ensure clips from all parts, not just the beginning
 */
function prepareTranscriptForAnalysis(transcript, maxChars = 10000) {
    const segments = transcript.segments || [];

    if (segments.length === 0) {
        return transcript.text.substring(0, maxChars);
    }

    // Include ALL segments but in compact format
    // If too many, sample evenly from the full timeline
    let selectedSegments = segments;

    // Estimate chars needed: roughly 60 chars per segment line
    const estimatedTotal = segments.length * 60;
    if (estimatedTotal > maxChars) {
        // Sample evenly — keep enough segments to fill maxChars
        const keepCount = Math.floor(maxChars / 60);
        const step = segments.length / keepCount;
        selectedSegments = [];
        for (let i = 0; i < segments.length; i += step) {
            selectedSegments.push(segments[Math.floor(i)]);
        }
    }

    let result = '';
    for (const seg of selectedSegments) {
        const start = (seg.start || 0).toFixed(0);
        const end = (seg.end || 0).toFixed(0);
        const text = (seg.text || '').trim();
        if (!text) continue;
        const line = `[${start}s-${end}s] ${text}\n`;
        if (result.length + line.length > maxChars) break;
        result += line;
    }
    return result;
}

/**
 * Build the clip detection prompt — emphasizes duration requirements + language matching
 */
function buildPrompt(compactTranscript, projectInfo) {
    const { min_duration, max_duration, clip_count_target, platform } = projectInfo;
    const minDur = min_duration || 15;
    const maxDur = max_duration || 60;

    const countGuide = {
        few: '3-5',
        medium: '6-10',
        many: '10-15'
    };
    const clipCount = countGuide[clip_count_target] || '6-10';

    return `You are a viral short-form video expert. Analyze the timestamped transcript below and identify ${clipCount} viral-worthy clips for ${platform || 'TikTok/Reels/Shorts'}.

LANGUAGE RULE (MOST IMPORTANT):
- Detect the language of the transcript below.
- ALL your output (title, hook_text, summary, improvement_tips, hashtags) MUST be in the SAME LANGUAGE as the transcript.
- If the transcript is in Indonesian, ALL fields must be in Indonesian.
- If the transcript is in English, ALL fields must be in English.
- NEVER translate or change the language. Match the transcript language exactly.

CRITICAL RULES:
1. Each clip MUST be between ${minDur} and ${maxDur} seconds long. NO EXCEPTIONS.
2. Combine multiple consecutive segments to reach the minimum duration of ${minDur} seconds.
3. start_time and end_time must come from the timestamps in the transcript.
4. end_time minus start_time must be >= ${minDur} and <= ${maxDur}.
5. Select clips from DIFFERENT parts of the video, not just the beginning.
6. Each clip must tell a complete mini-story or deliver a complete thought.

WHAT MAKES A VIRAL CLIP:
- Strong opening hook that grabs attention in 2 seconds
- Emotional story, surprising fact, or controversial opinion
- Actionable advice or relatable experience
- Self-contained — viewers don't need extra context

TRANSCRIPT:
${compactTranscript}

Return EXACTLY a JSON array. No markdown, no explanation. Each object:
{"clip_number":1,"title":"judul pendek menarik (SAME LANGUAGE AS TRANSCRIPT)","hook_text":"kalimat pertama (SAME LANGUAGE)","summary":"apa yang terjadi (SAME LANGUAGE)","start_time":120.0,"end_time":155.0,"content_type":"insight|story|humor|hot_take|tutorial|quote|emotional","virality_score":85,"score_hook":90,"score_content":85,"score_emotion":80,"score_share":85,"score_complete":90,"improvement_tips":"satu tips (SAME LANGUAGE)","hashtags":"#tag1 #tag2 #tag3"}

REMEMBER: Every clip must be ${minDur}-${maxDur} seconds! Clips shorter than ${minDur}s are REJECTED.
REMEMBER: Output language MUST match transcript language!`;
}

/**
 * Detect viral-worthy clips using Groq LLM (with key rotation)
 */
async function detectClipsWithGroq(transcript, settings, projectInfo) {
    const apiKeysString = settings.groq_api_key;
    if (!apiKeysString) throw new Error('Groq API key not set');

    keyPool.setKeyString('groq', apiKeysString);
    const keys = keyPool.parseKeys(apiKeysString);
    let lastError = null;

    const compactTranscript = prepareTranscriptForAnalysis(transcript, 9000);
    const prompt = buildPrompt(compactTranscript, projectInfo);
    console.log(`[ClipDetect] Groq prompt length: ${prompt.length} chars`);

    for (let attempt = 0; attempt < keys.length; attempt++) {
        const keyInfo = keyPool.getKey('groq', apiKeysString);
        if (!keyInfo) break;

        console.log(`[ClipDetect] Using Groq key #${keyInfo.index + 1}/${keyInfo.total}`);

        try {
            const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${keyInfo.key}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: 'You are a viral video analyst. Return ONLY a valid JSON array. No markdown. No explanation. Every clip must meet the minimum duration requirement.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.4,
                    max_tokens: 4096
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                const err = new Error(`Groq clip detection failed (${response.status}): ${errText}`);
                if (response.status === 429 || errText.includes('rate_limit')) {
                    keyPool.markRateLimited('groq', keyInfo.key, 60000);
                    lastError = err;
                    continue;
                }
                throw err;
            }

            const result = await response.json();
            const content = result.choices?.[0]?.message?.content || '';
            keyPool.markSuccess(keyInfo.key);
            return parseClipsJson(content, projectInfo);
        } catch (err) {
            lastError = err;
            if (err.message.includes('429') || err.message.includes('rate_limit')) {
                keyPool.markRateLimited('groq', keyInfo.key, 60000);
                continue;
            }
            throw err;
        }
    }

    throw lastError || new Error('All Groq keys exhausted for clip detection');
}

/**
 * Detect viral-worthy clips using Gemini (with key rotation)
 */
async function detectClipsWithGemini(transcript, settings, projectInfo) {
    const apiKeysString = settings.gemini_api_key;
    if (!apiKeysString) throw new Error('Gemini API key not set');

    keyPool.setKeyString('gemini', apiKeysString);
    const keys = keyPool.parseKeys(apiKeysString);
    let lastError = null;

    const compactTranscript = prepareTranscriptForAnalysis(transcript, 15000);
    const prompt = buildPrompt(compactTranscript, projectInfo);

    for (let attempt = 0; attempt < keys.length; attempt++) {
        const keyInfo = keyPool.getKey('gemini', apiKeysString);
        if (!keyInfo) break;

        console.log(`[ClipDetect] Using Gemini key #${keyInfo.index + 1}/${keyInfo.total}`);

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${keyInfo.key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.4, maxOutputTokens: 4096 }
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                const err = new Error(`Gemini clip detection failed (${response.status}): ${errText}`);
                if (response.status === 429 || errText.includes('RESOURCE_EXHAUSTED')) {
                    keyPool.markRateLimited('gemini', keyInfo.key, 60000);
                    lastError = err;
                    continue;
                }
                throw err;
            }

            const result = await response.json();
            const content = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
            keyPool.markSuccess(keyInfo.key);
            return parseClipsJson(content, projectInfo);
        } catch (err) {
            lastError = err;
            if (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED')) {
                keyPool.markRateLimited('gemini', keyInfo.key, 60000);
                continue;
            }
            throw err;
        }
    }

    throw lastError || new Error('All Gemini keys exhausted for clip detection');
}

/**
 * Parse clips JSON from AI response + enforce duration requirements
 */
function parseClipsJson(text, projectInfo = {}) {
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!arrayMatch) throw new Error('AI did not return a valid JSON array');

    const clips = JSON.parse(arrayMatch[0]);

    if (!Array.isArray(clips) || clips.length === 0) {
        throw new Error('AI returned empty clips array');
    }

    const minDur = projectInfo.min_duration || 15;
    const maxDur = projectInfo.max_duration || 60;

    const parsed = clips.map((clip, i) => {
        let startTime = parseFloat(clip.start_time) || 0;
        let endTime = parseFloat(clip.end_time) || 0;
        let duration = endTime - startTime;

        // Fix clips that are too short — extend end_time
        if (duration < minDur) {
            endTime = startTime + minDur;
            duration = minDur;
        }

        // Fix clips that are too long — trim end_time
        if (duration > maxDur) {
            endTime = startTime + maxDur;
            duration = maxDur;
        }

        return {
            id: uuidv4(),
            clip_number: clip.clip_number || i + 1,
            title: clip.title || `Clip ${i + 1}`,
            hook_text: clip.hook_text || '',
            summary: clip.summary || '',
            start_time: startTime,
            end_time: endTime,
            duration: duration,
            content_type: clip.content_type || 'insight',
            virality_score: Math.min(100, Math.max(0, parseInt(clip.virality_score) || 50)),
            score_hook: Math.min(100, Math.max(0, parseInt(clip.score_hook) || 50)),
            score_content: Math.min(100, Math.max(0, parseInt(clip.score_content) || 50)),
            score_emotion: Math.min(100, Math.max(0, parseInt(clip.score_emotion) || 50)),
            score_share: Math.min(100, Math.max(0, parseInt(clip.score_share) || 50)),
            score_complete: Math.min(100, Math.max(0, parseInt(clip.score_complete) || 50)),
            improvement_tips: clip.improvement_tips || '',
            hashtags: clip.hashtags || ''
        };
    });

    // Sort by virality score descending
    parsed.sort((a, b) => b.virality_score - a.virality_score);

    console.log(`[ClipDetect] Parsed ${parsed.length} clips, durations: ${parsed.map(c => c.duration.toFixed(0) + 's').join(', ')}`);

    return parsed;
}

/**
 * Detect clips with fallback + retry
 */
async function detectClips(transcript, settings, projectInfo) {
    const primary = settings.ai_provider_primary || 'groq';
    const fallback = settings.ai_provider_fallback || 'gemini';

    const providers = {
        groq: { fn: detectClipsWithGroq, key: settings.groq_api_key },
        gemini: { fn: detectClipsWithGemini, key: settings.gemini_api_key }
    };

    // Try primary
    const pri = providers[primary];
    if (pri?.key) {
        try {
            return await pri.fn(transcript, settings, projectInfo);
        } catch (err) {
            console.error(`[ClipDetect] ${primary} failed:`, err.message);
            if (err.message.includes('429') || err.message.includes('rate_limit')) {
                console.log(`[ClipDetect] Rate limited, waiting 30s...`);
                await new Promise(r => setTimeout(r, 30000));
                try {
                    return await pri.fn(transcript, settings, projectInfo);
                } catch (retryErr) {
                    console.error(`[ClipDetect] ${primary} retry failed:`, retryErr.message);
                }
            }
        }
    }

    // Try fallback
    const fb = providers[fallback];
    if (fb?.key) {
        try {
            console.log(`[ClipDetect] Falling back to ${fallback}...`);
            return await fb.fn(transcript, settings, projectInfo);
        } catch (err) {
            console.error(`[ClipDetect] ${fallback} failed:`, err.message);
            if (err.message.includes('429') || err.message.includes('rate_limit')) {
                console.log(`[ClipDetect] Rate limited, waiting 30s...`);
                await new Promise(r => setTimeout(r, 30000));
                try {
                    return await fb.fn(transcript, settings, projectInfo);
                } catch (retryErr) {
                    console.error(`[ClipDetect] ${fallback} retry failed:`, retryErr.message);
                }
            }
        }
    }

    throw new Error('Clip detection failed with all providers. Please try again later or check your API quota.');
}

module.exports = { detectClips, detectClipsWithGroq, detectClipsWithGemini };
