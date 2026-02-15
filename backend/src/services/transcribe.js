const fs = require('fs-extra');
const path = require('path');
const { keyPool } = require('./keyPool');

/**
 * Transcribe audio using Groq Whisper API (with key rotation)
 */
async function transcribeWithGroq(audioPath, apiKeysString, language = 'auto') {
    keyPool.setKeyString('groq', apiKeysString);
    const keys = keyPool.parseKeys(apiKeysString);

    if (keys.length === 0) throw new Error('No Groq API keys configured');

    let lastError = null;

    // Try each key
    for (let attempt = 0; attempt < keys.length; attempt++) {
        const keyInfo = keyPool.getKey('groq', apiKeysString);
        if (!keyInfo) break;

        console.log(`[Groq] Transcribing with key #${keyInfo.index + 1}/${keyInfo.total}...`);

        try {
            const result = await _groqTranscribe(audioPath, keyInfo.key, language);
            keyPool.markSuccess(keyInfo.key);
            return result;
        } catch (err) {
            lastError = err;
            if (err.message.includes('429') || err.message.includes('rate_limit') || err.message.includes('Rate limit')) {
                // Parse retry delay if available
                const retryMatch = err.message.match(/(\d+)m(\d+)s|(\d+)s/);
                let cooldownMs = 60000;
                if (retryMatch) {
                    if (retryMatch[1]) cooldownMs = (parseInt(retryMatch[1]) * 60 + parseInt(retryMatch[2])) * 1000;
                    else if (retryMatch[3]) cooldownMs = parseInt(retryMatch[3]) * 1000;
                }
                keyPool.markRateLimited('groq', keyInfo.key, cooldownMs);
                console.log(`[Groq] Key #${keyInfo.index + 1} rate limited, trying next...`);
                continue;
            }
            // Non-rate-limit error — don't try other keys
            throw err;
        }
    }

    throw lastError || new Error('All Groq API keys exhausted');
}

/**
 * Internal: actual Groq API call
 */
async function _groqTranscribe(audioPath, apiKey, language) {
    const audioBuffer = fs.readFileSync(audioPath);
    const blob = new Blob([audioBuffer], { type: 'audio/wav' });

    const formData = new FormData();
    formData.append('file', blob, 'audio.wav');
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'verbose_json');
    formData.append('timestamp_granularities[]', 'word');
    formData.append('timestamp_granularities[]', 'segment');
    if (language && language !== 'auto') {
        formData.append('language', language);
    }

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq transcription failed (${response.status}): ${errText}`);
    }

    const result = await response.json();
    console.log(`[Groq] Transcription done: ${result.text?.length || 0} characters, language: ${result.language}`);

    return {
        text: result.text,
        language: result.language,
        segments: result.segments || [],
        words: result.words || [],
        duration: result.duration
    };
}

/**
 * Transcribe audio using Gemini API (with key rotation)
 */
async function transcribeWithGemini(audioPath, apiKeysString, language = 'auto') {
    keyPool.setKeyString('gemini', apiKeysString);
    const keys = keyPool.parseKeys(apiKeysString);

    if (keys.length === 0) throw new Error('No Gemini API keys configured');

    let lastError = null;

    for (let attempt = 0; attempt < keys.length; attempt++) {
        const keyInfo = keyPool.getKey('gemini', apiKeysString);
        if (!keyInfo) break;

        console.log(`[Gemini] Transcribing with key #${keyInfo.index + 1}/${keyInfo.total}...`);

        try {
            const result = await _geminiTranscribe(audioPath, keyInfo.key, language);
            keyPool.markSuccess(keyInfo.key);
            return result;
        } catch (err) {
            lastError = err;
            if (err.message.includes('429') || err.message.includes('RESOURCE_EXHAUSTED')) {
                keyPool.markRateLimited('gemini', keyInfo.key, 60000);
                console.log(`[Gemini] Key #${keyInfo.index + 1} rate limited, trying next...`);
                continue;
            }
            throw err;
        }
    }

    throw lastError || new Error('All Gemini API keys exhausted');
}

/**
 * Internal: actual Gemini API call
 */
async function _geminiTranscribe(audioPath, apiKey, language) {
    const audioBuffer = fs.readFileSync(audioPath);
    const base64Audio = audioBuffer.toString('base64');

    const prompt = `Transcribe this audio accurately. Return a JSON object with this exact structure:
{
  "text": "full transcript text here",
  "language": "detected language code (e.g., id, en)",
  "segments": [
    { "start": 0.0, "end": 5.5, "text": "segment text here" }
  ]
}
Rules:
- Transcribe word for word, including filler words
- Break into segments of roughly 5-15 seconds each
- Return ONLY valid JSON, no markdown`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: prompt },
                    { inline_data: { mime_type: 'audio/wav', data: base64Audio } }
                ]
            }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini transcription failed (${response.status}): ${errText}`);
    }

    const result = await response.json();
    const textContent = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Gemini did not return valid JSON');

    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`[Gemini] Transcription done: ${parsed.text?.length || 0} characters`);

    return {
        text: parsed.text,
        language: parsed.language || 'unknown',
        segments: parsed.segments || [],
        words: [],
        duration: null
    };
}

/**
 * Transcribe with fallback: try primary provider, then fallback
 */
async function transcribe(audioPath, settings) {
    const primary = settings.ai_provider_primary || 'groq';
    const fallback = settings.ai_provider_fallback || 'gemini';
    const groqKeys = settings.groq_api_key;
    const geminiKeys = settings.gemini_api_key;
    const language = settings.language || 'auto';

    const providers = {
        groq: { fn: transcribeWithGroq, keys: groqKeys },
        gemini: { fn: transcribeWithGemini, keys: geminiKeys }
    };

    // Try primary
    const pri = providers[primary];
    if (pri?.keys) {
        try {
            return await pri.fn(audioPath, pri.keys, language);
        } catch (err) {
            console.error(`[Transcribe] ${primary} failed:`, err.message);
        }
    }

    // Try fallback
    const fb = providers[fallback];
    if (fb?.keys) {
        try {
            console.log(`[Transcribe] Falling back to ${fallback}...`);
            return await fb.fn(audioPath, fb.keys, language);
        } catch (err) {
            console.error(`[Transcribe] ${fallback} failed:`, err.message);
        }
    }

    throw new Error('All API keys exhausted. Add more keys in Settings or wait for rate limits to reset.');
}

module.exports = { transcribe, transcribeWithGroq, transcribeWithGemini };
