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
    const { min_duration, max_duration, clip_count_target, platform, duration: videoDur } = projectInfo;
    const minDur = min_duration || 15;
    const maxDur = max_duration || 60;
    const videoDurationInfo = videoDur ? `\nVIDEO DURATION: ${Math.floor(videoDur / 60)}:${String(Math.round(videoDur % 60)).padStart(2, '0')} (${videoDur.toFixed(0)} seconds total). Do NOT generate clips that start in the last ${minDur} seconds of the video (after ${(videoDur - minDur).toFixed(0)}s).` : '';

    // Support both text labels AND custom numbers
    const countGuide = {
        few: '3-5',
        medium: '6-10',
        many: '10-15'
    };
    let clipCount;
    const numTarget = parseInt(clip_count_target);
    if (!isNaN(numTarget) && numTarget > 0) {
        // User specified exact number (e.g., 5)
        clipCount = `exactly ${numTarget}`;
    } else {
        clipCount = countGuide[clip_count_target] || '6-10';
    }

    console.log(`[ClipDetect] Clip count target: "${clip_count_target}" → prompt: "${clipCount}"`);

    return `You are a viral short-form video expert. Analyze the timestamped transcript below and identify ${clipCount} viral-worthy clips for ${platform || 'TikTok/Reels/Shorts'}.${videoDurationInfo}

LANGUAGE RULE (MOST IMPORTANT):
- Detect the language of the transcript below.
- ALL your output (title, hook_text, summary, improvement_tips, hashtags) MUST be in the SAME LANGUAGE as the transcript.
- If the transcript is in Indonesian, ALL fields must be in Indonesian.
- If the transcript is in English, ALL fields must be in English.
- NEVER translate or change the language. Match the transcript language exactly.

CRITICAL RULES:
1. Each clip MUST be between ${minDur} and ${maxDur} seconds long. NO EXCEPTIONS.
2. VARY the durations! Do NOT make all clips the same length. Use the FULL range (${minDur}-${maxDur}s).
   - Short clips (${minDur}-${Math.round(minDur + (maxDur - minDur) * 0.3)}s): for punchy, high-energy moments
   - Medium clips (${Math.round(minDur + (maxDur - minDur) * 0.3)}-${Math.round(minDur + (maxDur - minDur) * 0.7)}s): for stories with setup+payoff
   - Long clips (${Math.round(minDur + (maxDur - minDur) * 0.7)}-${maxDur}s): for emotional arcs that need time to develop
   - Let the CONTENT dictate the ideal length — include enough for a COMPLETE thought.
3. Combine multiple consecutive segments to reach the minimum duration of ${minDur} seconds.
4. start_time and end_time must come from the timestamps in the transcript.
5. end_time minus start_time must be >= ${minDur} and <= ${maxDur}.
6. Select clips from DIFFERENT parts of the video, not just the beginning.
7. Each clip must tell a complete mini-story or deliver a complete thought.
8. EVERY clip MUST have DIFFERENT start_time and end_time — NO DUPLICATES allowed.
9. Clips must NOT overlap more than 30% with each other.
${!isNaN(numTarget) ? `9. Return EXACTLY ${numTarget} clips — no more, no less.
` : ''}
HOOK TEXT RULES (VERY IMPORTANT):
- hook_text is the TEXT OVERLAY shown on screen for the first 3 seconds to GRAB attention.
- It must be 8-15 words (NOT 1-3 words! MINIMUM 8 words).
- It must create a CURIOSITY GAP — make the viewer think "WAIT, WHAT?!"
- Use CAPS for 1-2 emotional key words (e.g., "HANCUR", "VIRAL", "TERNYATA")
- Add 1-2 emoji at the end
- Reference SPECIFIC details from the clip (names, events, quotes)
- NEVER just copy the first sentence of the transcript
- NEVER use generic phrases like the title
- Examples of GOOD hooks: "Dia bilang HAMIL tapi suaminya udah 3 tahun MENINGGAL 😱", "Chat WA SUAMINYA kepegang istri isinya bikin langsung GUGAT CERAI 💔", "This teacher got FIRED for what she said about students 🤯"
- Examples of BAD hooks: "Astagfirullah", "Namaku Nining", "Pertandingan ini seru", "Gua menginap di hotel"

WHAT MAKES A VIRAL CLIP:
- Strong opening hook that grabs attention in 2 seconds
- Emotional story, surprising fact, or controversial opinion
- Actionable advice or relatable experience
- Self-contained — viewers don't need extra context

TRANSCRIPT:
${compactTranscript}

Return EXACTLY a JSON array. No markdown, no explanation. Each object:
{"clip_number":1,"title":"judul pendek menarik (SAME LANGUAGE)","hook_text":"HOOK VIRAL 8-15 kata dengan CAPS dan emoji yang bikin penasaran 🔥 (SAME LANGUAGE)","summary":"apa yang terjadi (SAME LANGUAGE)","start_time":120.0,"end_time":${120 + Math.round(minDur + (maxDur - minDur) * 0.6)}.0,"content_type":"insight|story|humor|hot_take|tutorial|quote|emotional","virality_score":85,"score_hook":90,"score_content":85,"score_emotion":80,"score_share":85,"score_complete":90,"improvement_tips":"satu tips (SAME LANGUAGE)","hashtags":"#tag1 #tag2 #tag3"}

REMEMBER: Every clip must be ${minDur}-${maxDur} seconds! Clips shorter than ${minDur}s are REJECTED.
REMEMBER: VARY clip durations! Do NOT make all clips ${minDur}s. Use different lengths like ${minDur}s, ${Math.round(minDur + (maxDur - minDur) * 0.4)}s, ${Math.round(minDur + (maxDur - minDur) * 0.7)}s, ${maxDur}s based on content.
REMEMBER: Output language MUST match transcript language!
REMEMBER: hook_text MUST be 8-15 words with CAPS and emoji — NOT just 1-3 generic words!
${!isNaN(numTarget) ? `REMEMBER: Return EXACTLY ${numTarget} clips!` : ''}`;
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
    const videoDuration = projectInfo.duration || Infinity; // video length in seconds

    const parsed = [];
    for (let i = 0; i < clips.length; i++) {
        const clip = clips[i];
        let startTime = parseFloat(clip.start_time) || 0;
        let endTime = parseFloat(clip.end_time) || 0;

        // ── Step 1: reject if start_time is beyond video ──
        if (startTime >= videoDuration) {
            console.warn(`[ClipDetect] Discarding clip "${clip.title}" — start_time (${startTime}s) >= video duration (${videoDuration.toFixed(1)}s)`);
            continue;
        }

        // ── Step 2: clamp end_time to video boundary ──
        if (endTime > videoDuration) {
            endTime = videoDuration;
        }

        // ── Step 2: fix too-short duration ──
        let duration = endTime - startTime;

        if (duration < minDur) {
            // Try to extend end_time first (up to maxDur, up to videoDuration)
            const extendEnd = Math.min(startTime + minDur, videoDuration);
            if (extendEnd - startTime >= minDur) {
                endTime = extendEnd;
            } else {
                // Not enough room forward — pull start_time BACK instead
                const neededStart = endTime - minDur;
                if (neededStart >= 0) {
                    startTime = neededStart;
                } else {
                    // Video too short for this clip entirely — discard
                    console.warn(`[ClipDetect] Discarding clip "${clip.title}" — insufficient video content (only ${(endTime - Math.max(0, neededStart)).toFixed(1)}s available < ${minDur}s min)`);
                    continue;
                }
            }
            duration = endTime - startTime;
        }

        // ── Step 3: fix too-long duration ──
        if (duration > maxDur) {
            endTime = startTime + maxDur;
            duration = maxDur;
        }

        parsed.push({
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
        });
    }

    if (parsed.length === 0) {
        throw new Error('AI returned no valid clips after duration validation');
    }

    // Sort by virality score descending
    parsed.sort((a, b) => b.virality_score - a.virality_score);

    // === DEDUPLICATION ===
    // Remove clips that overlap >30% with a higher-scored clip
    const deduplicated = [];
    for (const clip of parsed) {
        const isDuplicate = deduplicated.some(existing => {
            const overlapStart = Math.max(existing.start_time, clip.start_time);
            const overlapEnd = Math.min(existing.end_time, clip.end_time);
            const overlapDuration = Math.max(0, overlapEnd - overlapStart);
            const clipDuration = clip.end_time - clip.start_time;
            const overlapPercent = clipDuration > 0 ? overlapDuration / clipDuration : 0;
            return overlapPercent > 0.3; // Remove if >30% overlap
        });
        if (!isDuplicate) {
            deduplicated.push(clip);
        } else {
            console.log(`[ClipDetect] Removed duplicate clip: "${clip.title}" (${clip.start_time}s-${clip.end_time}s)`);
        }
    }

    // Enforce exact clip count if specified as number
    const numTarget = parseInt(projectInfo.clip_count_target);
    let finalClips = deduplicated;
    if (!isNaN(numTarget) && numTarget > 0 && deduplicated.length > numTarget) {
        finalClips = deduplicated.slice(0, numTarget);
        console.log(`[ClipDetect] Trimmed from ${deduplicated.length} to ${numTarget} clips`);
    }

    // Re-number clips
    finalClips.forEach((clip, i) => { clip.clip_number = i + 1; });

    console.log(`[ClipDetect] Final: ${finalClips.length} clips (dedup removed ${parsed.length - deduplicated.length}), durations: ${finalClips.map(c => c.duration.toFixed(0) + 's').join(', ')}`);

    return finalClips;
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
