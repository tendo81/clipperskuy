import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import MusicSelector from '../components/MusicSelector';
import SfxSelector from '../components/SfxSelector';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
    Maximize, Minimize, Scissors, Download, RefreshCw, Save, Clock,
    ChevronLeft, ChevronRight, Loader, CheckCircle, AlertCircle,
    Zap, Trophy, Hash, MessageCircle, ThumbsUp, Lightbulb, Share2,
    Settings, Film, Eye, Type, Check, Monitor, Smartphone, Tablet,
    Subtitles, SlidersHorizontal, ChevronDown, ChevronUp, Palette,
    GitBranch, GitMerge, TrendingUp, BarChart2, Search
} from 'lucide-react';

const FONT_OPTIONS = [
    { id: 'Inter, sans-serif', label: 'Inter' },
    { id: 'Montserrat, sans-serif', label: 'Montserrat' },
    { id: 'Outfit, sans-serif', label: 'Outfit' },
    { id: 'Impact, sans-serif', label: 'Impact' },
    { id: 'Georgia, serif', label: 'Georgia' },
    { id: 'Courier New, monospace', label: 'Courier' },
    { id: 'Arial Black, sans-serif', label: 'Arial Black' },
    { id: 'Trebuchet MS, sans-serif', label: 'Trebuchet' },
];

const DEFAULT_CUSTOM = {
    fontFamily: null,  // null = use template default
    fontSize: null,
    fontWeight: null,
    textColor: null,
    highlightColor: null,
    outline: null,
    position: 'bottom',  // top, center, bottom
    textTransform: null,
    bgOpacity: 0.6,
    italic: null,
};

const CAPTION_STYLES = [
    {
        id: 'hormozi', name: 'Hormozi', emoji: '🟡',
        desc: 'Yellow word-by-word highlight',
        preview: { bg: '#000', color: '#fff', highlight: '#FFD700', font: 'Montserrat, sans-serif', weight: 800, size: 15, transform: 'uppercase', outline: true }
    },
    {
        id: 'bold_impact', name: 'Bold Impact', emoji: '⚡',
        desc: 'White text, black outline, bottom',
        preview: { bg: '#000', color: '#fff', highlight: '#fff', font: 'Impact, sans-serif', weight: 900, size: 16, transform: 'uppercase', outline: true }
    },
    {
        id: 'minimal', name: 'Minimal Clean', emoji: '✨',
        desc: 'Thin white text, subtle shadow',
        preview: { bg: '#000', color: 'rgba(255,255,255,0.9)', highlight: '#fff', font: 'Inter, sans-serif', weight: 300, size: 13, transform: 'lowercase', outline: false }
    },
    {
        id: 'karaoke', name: 'Karaoke Pop', emoji: '🎤',
        desc: 'Colorful bouncing text',
        preview: { bg: '#000', color: '#ff6b9d', highlight: '#00f5ff', font: 'Outfit, sans-serif', weight: 700, size: 15, transform: 'none', outline: true }
    },
    {
        id: 'ali_abdaal', name: 'Ali Abdaal', emoji: '📚',
        desc: 'White bold, 1-2 words center',
        preview: { bg: '#000', color: '#fff', highlight: '#4fc3f7', font: 'Inter, sans-serif', weight: 800, size: 16, transform: 'none', outline: false }
    },
    {
        id: 'gaming', name: 'Gaming', emoji: '🎮',
        desc: 'Neon glow, impact shake',
        preview: { bg: '#0a0a1a', color: '#00ff88', highlight: '#ff00ff', font: 'Outfit, sans-serif', weight: 900, size: 15, transform: 'uppercase', outline: true }
    },
    {
        id: 'news', name: 'News Ticker', emoji: '📺',
        desc: 'Lower third bar + text',
        preview: { bg: 'linear-gradient(90deg, #1a1a3e, #2d1b69)', color: '#fff', highlight: '#ffd700', font: 'Inter, sans-serif', weight: 600, size: 12, transform: 'none', outline: false }
    },
    {
        id: 'podcast', name: 'Podcast', emoji: '🎙️',
        desc: '2 lines, speaker color coded',
        preview: { bg: '#111', color: '#e0e0e0', highlight: '#ff9800', font: 'Inter, sans-serif', weight: 500, size: 13, transform: 'none', outline: false }
    },
    {
        id: 'cinema', name: 'Cinema', emoji: '🎬',
        desc: 'Italic cinematic, serif font',
        preview: { bg: '#000', color: '#d4c5a9', highlight: '#fff', font: 'Georgia, serif', weight: 400, size: 14, transform: 'none', outline: false, italic: true }
    },
    {
        id: 'tiktok_og', name: 'TikTok OG', emoji: '📱',
        desc: 'White bold, outline shadow, center',
        preview: { bg: '#000', color: '#fff', highlight: '#fe2c55', font: 'Outfit, sans-serif', weight: 800, size: 15, transform: 'none', outline: true }
    },
    {
        id: 'raymond', name: 'Raymond', emoji: '🎯',
        desc: 'Big yellow highlight, sentence case',
        preview: { bg: '#000', color: '#fff', highlight: '#FFD700', font: 'Montserrat, sans-serif', weight: 800, size: 13, transform: 'none', outline: true, highlightScale: 1.6 }
    },
    {
        id: 'clean_box', name: 'Clean Box', emoji: '🔲',
        desc: 'Dark box, cyan highlight, modern',
        preview: { bg: '#000', color: '#fff', highlight: '#00E5FF', font: 'Inter, sans-serif', weight: 700, size: 14, transform: 'none', outline: false, boxBg: true, boxColor: 'rgba(26,26,46,0.85)' }
    },
    {
        id: 'neon_box', name: 'Neon Box', emoji: '💚',
        desc: 'Neon green on dark box, bold',
        preview: { bg: '#000', color: '#fff', highlight: '#39FF14', font: 'Montserrat, sans-serif', weight: 800, size: 15, transform: 'uppercase', outline: true, boxBg: true, boxColor: 'rgba(0,0,0,0.6)' }
    },
    {
        id: 'pastel_box', name: 'Pastel Box', emoji: '🌸',
        desc: 'White box, dark text, soft colors',
        preview: { bg: '#eee', color: '#2D2D2D', highlight: '#FF6B6B', font: 'Inter, sans-serif', weight: 600, size: 13, transform: 'none', outline: false, boxBg: true, boxColor: 'rgba(255,255,255,0.9)' }
    },
];

const API = 'http://localhost:5000/api';

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00.0';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${m}:${String(s).padStart(2, '0')}.${ms}`;
}

function formatTimeFull(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00.000';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function ScoreBadge({ score, size = 'md' }) {
    const color = score >= 80 ? '#10b981' : score >= 60 ? '#06b6d4' : score >= 40 ? '#f59e0b' : '#ef4444';
    const dim = size === 'lg' ? 56 : 38;
    const fs = size === 'lg' ? 20 : 14;
    return (
        <div style={{
            width: dim, height: dim, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${color}15`, border: `2px solid ${color}40`, fontFamily: 'Outfit', fontWeight: 700, fontSize: fs, color
        }}>
            {score}
        </div>
    );
}

export default function ClipEditor() {
    const { id: projectId, clipId } = useParams();
    const navigate = useNavigate();

    const [project, setProject] = useState(null);
    const [clip, setClip] = useState(null);
    const [allClips, setAllClips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [splitting, setSplitting] = useState(false);
    const [exporting, setExporting] = useState(false);

    // Video player state
    const videoRef = useRef(null);
    const timelineRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [fullscreen, setFullscreen] = useState(false);
    const [videoReady, setVideoReady] = useState(false);
    const playerContainerRef = useRef(null);

    // Trim state
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(0);
    const [originalStart, setOriginalStart] = useState(0);
    const [originalEnd, setOriginalEnd] = useState(0);
    const [isDragging, setIsDragging] = useState(null); // 'start' | 'end' | 'playhead' | null
    const [hasChanges, setHasChanges] = useState(false);

    // Caption style state
    const [captionStyle, setCaptionStyle] = useState('hormozi');
    const [savingStyle, setSavingStyle] = useState(false);
    const [customCaption, setCustomCaption] = useState({ ...DEFAULT_CUSTOM });
    const [showCustomize, setShowCustomize] = useState(false);
    const customSaveTimer = useRef(null);

    // Aspect ratio preview
    const [previewRatio, setPreviewRatio] = useState('16:9');

    // Subtitle preview
    const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
    const [segments, setSegments] = useState([]);
    const [activeCaption, setActiveCaption] = useState(null);
    const [editingSegIdx, setEditingSegIdx] = useState(null);
    const [savingSegments, setSavingSegments] = useState(false);
    const segSaveTimer = useRef(null);
    const [expandedTimingIdx, setExpandedTimingIdx] = useState(null);
    const [wordTimings, setWordTimings] = useState({});  // { segIdx: [{word, start, end}, ...] }

    // Music state
    const [showMusicSelector, setShowMusicSelector] = useState(false);
    const [musicTrackName, setMusicTrackName] = useState(null);

    // SFX state
    const [showSfxSelector, setShowSfxSelector] = useState(false);
    const [sfxCount, setSfxCount] = useState(0);
    const [copiedHashtags, setCopiedHashtags] = useState(false);

    // Social Caption Generator state
    const [socialData, setSocialData] = useState(null);
    const [loadingSocial, setLoadingSocial] = useState(false);
    const [hookStyle, setHookStyle] = useState('drama');
    const [socialPlatform, setSocialPlatform] = useState('tiktok');

    // Thumbnail Generator state
    const [thumbnails, setThumbnails] = useState([]);
    const [loadingThumbnails, setLoadingThumbnails] = useState(false);

    // Trend Analysis state
    const [trendData, setTrendData] = useState(null);
    const [loadingTrend, setLoadingTrend] = useState(false);

    // B-Roll Search state
    const [brollVideos, setBrollVideos] = useState([]);
    const [loadingBroll, setLoadingBroll] = useState(false);
    const [brollQuery, setBrollQuery] = useState('');

    // Hook Title state
    const [hookText, setHookText] = useState('');
    const [hookSettings, setHookSettings] = useState({
        duration: 5,       // 0 = permanent, 3, 5
        position: 'top',   // top, bottom
        fontSize: 48,
        textColor: '#FFFFFF',
        bgColor: '#FF0000',
        bgOpacity: '0.85'
    });

    // Load data
    useEffect(() => {
        loadData();
    }, [projectId, clipId]);

    const loadData = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API}/projects/${projectId}`);
            const data = await res.json();
            if (data.project) {
                setProject(data.project);
                setPreviewRatio(data.project.aspect_ratio || '16:9');
                const clips = data.clips || [];
                setAllClips(clips.sort((a, b) => a.clip_number - b.clip_number));
                const thisClip = clips.find(c => c.id === clipId);
                if (thisClip) {
                    setClip(thisClip);
                    setTrimStart(thisClip.start_time);
                    setTrimEnd(thisClip.end_time);
                    setOriginalStart(thisClip.start_time);
                    setOriginalEnd(thisClip.end_time);
                    setCaptionStyle(thisClip.caption_style || 'hormozi');
                    if (thisClip.caption_settings) {
                        try {
                            setCustomCaption({ ...DEFAULT_CUSTOM, ...JSON.parse(thisClip.caption_settings) });
                        } catch (e) { /* ignore parse errors */ }
                    }
                    // Load hook title data
                    if (thisClip.hook_text) setHookText(thisClip.hook_text);
                    if (thisClip.hook_settings) {
                        try {
                            setHookSettings(prev => ({ ...prev, ...JSON.parse(thisClip.hook_settings) }));
                        } catch (e) { /* ignore */ }
                    }
                }
                // Load transcript segments for subtitle preview
                if (data.transcript && data.transcript.segment_data) {
                    try {
                        const segs = JSON.parse(data.transcript.segment_data);
                        setSegments(segs || []);
                    } catch (e) {
                        console.warn('Failed to parse segments:', e);
                    }
                }

                // If clip is currently rendering, resume polling (don't reset!)
                const thisClip2 = (data.clips || []).find(c => c.id === clipId);
                if (thisClip2 && thisClip2.status === 'rendering') {
                    // Resume polling — render is still running server-side
                    setExporting(true);
                    setSaveMsg('🎬 Render sedang berjalan... menunggu selesai');
                }
            }
        } catch (err) {
            console.error('Load error:', err);
        } finally {
            setLoading(false);
        }
    };

    // Video source URL (stream from source video)
    const videoSrc = project?.source_path ? `${API}/projects/${projectId}/stream` : null;

    // Compute active caption for subtitle overlay
    const getActiveCaption = useCallback((time) => {
        if (!subtitlesEnabled || segments.length === 0) return null;
        // Find segments overlapping with current time
        const activeSeg = segments.find(s => time >= s.start && time < s.end);
        if (!activeSeg) return null;

        let wTimings;
        if (activeSeg.word_timings && activeSeg.word_timings.length > 0) {
            // Use custom word-level timings
            wTimings = activeSeg.word_timings.map(wt => ({
                word: wt.word,
                start: wt.start,
                end: wt.end,
                active: time >= wt.start && time < wt.end
            }));
        } else {
            // Fall back to even distribution
            const words = activeSeg.text.trim().split(/\s+/);
            if (words.length === 0) return null;
            const segDuration = activeSeg.end - activeSeg.start;
            const wordDuration = segDuration / words.length;
            wTimings = words.map((word, i) => ({
                word,
                start: activeSeg.start + i * wordDuration,
                end: activeSeg.start + (i + 1) * wordDuration,
                active: time >= activeSeg.start + i * wordDuration && time < activeSeg.start + (i + 1) * wordDuration
            }));
        }

        // Group into lines of ~3-4 words
        const wordsPerLine = 4;
        const lines = [];
        for (let i = 0; i < wTimings.length; i += wordsPerLine) {
            lines.push(wTimings.slice(i, i + wordsPerLine));
        }

        // Only show the line containing the active word
        const activeLineIdx = lines.findIndex(line => line.some(w => w.active));
        const visibleLine = activeLineIdx >= 0 ? lines[activeLineIdx] : lines[0];

        return visibleLine;
    }, [subtitlesEnabled, segments]);

    // Update active caption on time changes
    useEffect(() => {
        if (subtitlesEnabled && segments.length > 0) {
            setActiveCaption(getActiveCaption(currentTime));
        } else {
            setActiveCaption(null);
        }
    }, [currentTime, subtitlesEnabled, segments, getActiveCaption]);

    // Auto-poll for render completion when exporting
    useEffect(() => {
        if (!exporting || !clipId) return;
        let cancelled = false;
        let attempts = 0;

        const poll = async () => {
            while (!cancelled && attempts < 400) {
                await new Promise(r => setTimeout(r, 3000));
                if (cancelled) return;
                attempts++;
                try {
                    // Check download availability
                    const checkRes = await fetch(`${API}/projects/clips/${clipId}/download`, { method: 'HEAD' });
                    if (checkRes.ok) {
                        const a = document.createElement('a');
                        a.href = `${API}/projects/clips/${clipId}/download`;
                        a.download = `clip_${clip?.clip_number || 'export'}.mp4`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        setSaveMsg('✅ Export selesai! File terdownload.');
                        setTimeout(() => setSaveMsg(''), 5000);
                        setExporting(false);
                        loadData();
                        return;
                    }
                } catch (e) { /* still rendering */ }
                // Check render status
                try {
                    const statusRes = await fetch(`${API}/projects/${projectId}`);
                    const statusData = await statusRes.json();
                    const thisClip = (statusData.clips || []).find(c => c.id === clipId);
                    if (thisClip?.status === 'failed') {
                        setSaveMsg('❌ Render gagal. Coba export ulang.');
                        setExporting(false);
                        return;
                    }
                    if (thisClip?.status === 'rendered' && thisClip?.output_path) {
                        const a = document.createElement('a');
                        a.href = `${API}/projects/clips/${clipId}/download`;
                        a.download = `clip_${clip?.clip_number || 'export'}.mp4`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        setSaveMsg('✅ Export selesai! File terdownload.');
                        setTimeout(() => setSaveMsg(''), 5000);
                        setExporting(false);
                        loadData();
                        return;
                    }
                    if (thisClip?.status !== 'rendering') {
                        // Not rendering anymore (maybe reset)
                        setExporting(false);
                        setSaveMsg('');
                        return;
                    }
                } catch (e) { /* ignore */ }
                const mins = Math.floor((attempts * 3) / 60);
                const secs = (attempts * 3) % 60;
                setSaveMsg(`🎬 Rendering... ${mins > 0 ? mins + 'm ' : ''}${secs}s`);
            }
            if (!cancelled) {
                // Timed out — render likely stuck, auto-reset
                try {
                    await fetch(`${API}/projects/clips/${clipId}/reset-render`, { method: 'POST' });
                } catch (e) { /* ignore */ }
                setSaveMsg('⏱️ Render timeout. Status di-reset. Klik Export untuk coba lagi.');
                setExporting(false);
            }
        };

        poll();
        return () => { cancelled = true; };
    }, [exporting, clipId]);

    // Video event handlers
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !clip) return;

        const onTimeUpdate = () => {
            setCurrentTime(video.currentTime);
            // Loop within clip boundaries
            if (video.currentTime >= trimEnd) {
                video.currentTime = trimStart;
                video.pause();
                setPlaying(false);
            }
        };

        const onLoadedMetadata = () => {
            setVideoReady(true);
            video.currentTime = trimStart;
        };

        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('loadedmetadata', onLoadedMetadata);

        return () => {
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
        };
    }, [clip, trimStart, trimEnd]);

    // Seek to start when clip changes
    useEffect(() => {
        if (videoRef.current && videoReady && trimStart > 0) {
            videoRef.current.currentTime = trimStart;
        }
    }, [clipId, videoReady]);

    // Controls
    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.currentTime < trimStart || video.currentTime >= trimEnd) {
            video.currentTime = trimStart;
        }
        if (playing) {
            video.pause();
        } else {
            video.play();
        }
        setPlaying(!playing);
    }, [playing, trimStart, trimEnd]);

    const seekTo = useCallback((time) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = Math.max(trimStart, Math.min(trimEnd, time));
        setCurrentTime(video.currentTime);
    }, [trimStart, trimEnd]);

    const skipBack = useCallback(() => seekTo(currentTime - 5), [currentTime, seekTo]);
    const skipForward = useCallback(() => seekTo(currentTime + 5), [currentTime, seekTo]);
    const frameBack = useCallback(() => seekTo(currentTime - 1 / 30), [currentTime, seekTo]);
    const frameForward = useCallback(() => seekTo(currentTime + 1 / 30), [currentTime, seekTo]);

    const toggleMute = () => {
        setMuted(!muted);
        if (videoRef.current) videoRef.current.muted = !muted;
    };

    const changeVolume = (val) => {
        setVolume(val);
        if (videoRef.current) videoRef.current.volume = val;
    };

    const changeSpeed = () => {
        const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
        const idx = speeds.indexOf(playbackSpeed);
        const next = speeds[(idx + 1) % speeds.length];
        setPlaybackSpeed(next);
        if (videoRef.current) videoRef.current.playbackRate = next;
    };

    const toggleFullscreen = () => {
        if (!playerContainerRef.current) return;
        if (!document.fullscreenElement) {
            playerContainerRef.current.requestFullscreen();
            setFullscreen(true);
        } else {
            document.exitFullscreen();
            setFullscreen(false);
        }
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKey = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            switch (e.key) {
                case ' ': e.preventDefault(); togglePlay(); break;
                case 'k': togglePlay(); break;
                case 'j': skipBack(); break;
                case 'l': skipForward(); break;
                case ',': frameBack(); break;
                case '.': frameForward(); break;
                case 'f': toggleFullscreen(); break;
                case 'm': toggleMute(); break;
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [togglePlay, skipBack, skipForward, frameBack, frameForward]);

    // Timeline drag handlers
    const handleTimelineMouse = useCallback((e, type) => {
        e.preventDefault();
        const timeline = timelineRef.current;
        if (!timeline) return;

        const updatePosition = (clientX) => {
            const rect = timeline.getBoundingClientRect();
            const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const duration = project?.duration || 0;
            const time = pct * duration;

            if (type === 'start') {
                const newStart = Math.min(time, trimEnd - 1);
                setTrimStart(Math.max(0, newStart));
                setHasChanges(true);
            } else if (type === 'end') {
                const newEnd = Math.max(time, trimStart + 1);
                setTrimEnd(Math.min(duration, newEnd));
                setHasChanges(true);
            } else if (type === 'playhead') {
                seekTo(time);
            }
        };

        updatePosition(e.clientX);
        setIsDragging(type);

        const onMove = (ev) => updatePosition(ev.clientX);
        const onUp = () => {
            setIsDragging(null);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [project, trimStart, trimEnd, seekTo]);

    // Save trimmed clip
    const saveTrim = async () => {
        try {
            setSaving(true);
            setSaveMsg('');
            const res = await fetch(`${API}/projects/clips/${clipId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_time: trimStart,
                    end_time: trimEnd,
                    duration: trimEnd - trimStart
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setOriginalStart(trimStart);
            setOriginalEnd(trimEnd);
            setHasChanges(false);
            setSaveMsg('Saved!');
            setTimeout(() => setSaveMsg(''), 3000);
            loadData();
        } catch (err) {
            setSaveMsg(`Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    const resetTrim = () => {
        setTrimStart(originalStart);
        setTrimEnd(originalEnd);
        setHasChanges(false);
        if (videoRef.current) videoRef.current.currentTime = originalStart;
    };

    // Save all changes (trim + caption)
    const saveAll = async () => {
        try {
            setSaving(true);
            setSaveMsg('');
            const res = await fetch(`${API}/projects/clips/${clipId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_time: trimStart,
                    end_time: trimEnd,
                    duration: trimEnd - trimStart,
                    hook_text: hookText,
                    hook_settings: hookSettings
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setOriginalStart(trimStart);
            setOriginalEnd(trimEnd);
            setHasChanges(false);
            setSaveMsg('✅ Semua perubahan tersimpan!');
            setTimeout(() => setSaveMsg(''), 3000);
            loadData();
        } catch (err) {
            setSaveMsg(`❌ Error: ${err.message}`);
        } finally {
            setSaving(false);
        }
    };

    // Export (render + download) clip
    const exportClip = async () => {
        try {
            // If already rendering/polling, just resume showing progress
            if (exporting) {
                setSaveMsg('🎬 Render masih berjalan...');
                return;
            }

            // Check if clip is already rendering server-side
            const checkRes = await fetch(`${API}/projects/${projectId}`);
            const checkData = await checkRes.json();
            const currentClip = (checkData.clips || []).find(c => c.id === clipId);
            if (currentClip && currentClip.status === 'rendering') {
                // Already rendering — just resume polling, don't start new render
                setExporting(true);
                setSaveMsg('🎬 Render masih berjalan... melanjutkan tracking');
                return;
            }

            // If clip was already rendered, reset it first
            if (currentClip && currentClip.status === 'rendered') {
                // Re-render: reset status first
                await fetch(`${API}/projects/clips/${clipId}/reset-render`, { method: 'POST' });
            }

            setExporting(true);
            setSaveMsg('');

            // Save hook data + trim before rendering
            await fetch(`${API}/projects/clips/${clipId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start_time: trimStart,
                    end_time: trimEnd,
                    duration: trimEnd - trimStart,
                    hook_text: hookText,
                    hook_settings: hookSettings
                })
            });
            setOriginalStart(trimStart);
            setOriginalEnd(trimEnd);
            setHasChanges(false);

            // Start render (server-side, continues even if user navigates away)
            setSaveMsg('🎬 Starting render...');
            const renderRes = await fetch(`${API}/projects/clips/${clipId}/render`, { method: 'POST' });
            const renderData = await renderRes.json();
            if (!renderRes.ok) throw new Error(renderData.error);

            // Polling is handled by the useEffect above (auto-poll when exporting=true)
            setSaveMsg('🎬 Rendering... (bisa klik Back, render tetap jalan)');
        } catch (err) {
            setSaveMsg(`❌ Export error: ${err.message}`);
            setExporting(false);
        }
    };

    // Save caption style
    const saveCaptionStyle = async (styleId) => {
        setCaptionStyle(styleId);
        // Reset custom overrides when switching template
        setCustomCaption({ ...DEFAULT_CUSTOM });
        try {
            setSavingStyle(true);
            const res = await fetch(`${API}/projects/clips/${clipId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caption_style: styleId, caption_settings: JSON.stringify(DEFAULT_CUSTOM) })
            });
            if (!res.ok) throw new Error('Failed to save');
            setSaveMsg('Style saved!');
            setTimeout(() => setSaveMsg(''), 2000);
        } catch (err) {
            console.error('Save style error:', err);
        } finally {
            setSavingStyle(false);
        }
    };

    // Update custom caption setting (with debounced save)
    const updateCustom = (key, value) => {
        const updated = { ...customCaption, [key]: value };
        setCustomCaption(updated);
        // Debounce save to backend
        if (customSaveTimer.current) clearTimeout(customSaveTimer.current);
        customSaveTimer.current = setTimeout(async () => {
            try {
                await fetch(`${API}/projects/clips/${clipId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ caption_settings: JSON.stringify(updated) })
                });
            } catch (err) {
                console.error('Save custom caption error:', err);
            }
        }, 600);
    };

    // Generate Social Copy (description, hooks, hashtags per platform)
    const generateSocialCopy = async () => {
        if (!clip?.id || loadingSocial) return;
        setLoadingSocial(true);
        setSocialData(null);
        try {
            const res = await fetch(`${API}/projects/clips/${clip.id}/generate-social`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform: socialPlatform, hook_style: hookStyle })
            });
            const data = await res.json();
            if (res.ok && data.social) {
                setSocialData(data.social);
            } else {
                setSaveMsg(`❌ Gagal generate: ${data.error || 'Unknown error'}`);
            }
        } catch (err) {
            setSaveMsg(`❌ Error: ${err.message}`);
        } finally {
            setLoadingSocial(false);
        }
    };

    // Generate Thumbnails (extract best frames from clip)
    const generateThumbnails = async () => {
        if (!clip?.id || loadingThumbnails) return;
        setLoadingThumbnails(true);
        setThumbnails([]);
        try {
            const res = await fetch(`${API}/projects/clips/${clip.id}/thumbnails`, { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.thumbnails) {
                setThumbnails(data.thumbnails);
            } else {
                setSaveMsg(`❌ Thumbnail error: ${data.error || 'Unknown'}`);
            }
        } catch (err) {
            setSaveMsg(`❌ Thumbnail error: ${err.message}`);
        } finally {
            setLoadingThumbnails(false);
        }
    };

    // Trend Analysis (AI-powered)
    const analyzeTrend = async () => {
        if (!clip?.id || loadingTrend) return;
        setLoadingTrend(true);
        setTrendData(null);
        try {
            const res = await fetch(`${API}/projects/clips/${clip.id}/trend-analysis`, { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.analysis) {
                setTrendData(data.analysis);
            } else {
                setSaveMsg(`❌ Trend error: ${data.error || 'Unknown'}`);
            }
        } catch (err) {
            setSaveMsg(`❌ Trend error: ${err.message}`);
        } finally {
            setLoadingTrend(false);
        }
    };

    // B-Roll Search (Pexels)
    const searchBroll = async () => {
        if (!clip?.id || loadingBroll) return;
        setLoadingBroll(true);
        setBrollVideos([]);
        try {
            const query = brollQuery || clip?.title || '';
            const res = await fetch(`${API}/projects/clips/${clip.id}/broll-search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keywords: query, orientation: 'portrait' })
            });
            const data = await res.json();
            if (data.needsKey) {
                setSaveMsg('⚠️ Pexels API key belum diisi. Buka Settings → AI Configuration → Pexels API Key');
            } else if (res.ok && data.videos) {
                setBrollVideos(data.videos);
                if (data.videos.length === 0) setSaveMsg('ℹ️ Tidak ada B-Roll ditemukan untuk keyword ini');
            } else {
                setSaveMsg(`❌ B-Roll error: ${data.error || 'Unknown'}`);
            }
        } catch (err) {
            setSaveMsg(`❌ B-Roll error: ${err.message}`);
        } finally {
            setLoadingBroll(false);
        }
    };

    // Get effective caption style (template + custom overrides)
    const getEffectiveStyle = () => {
        const template = CAPTION_STYLES.find(s => s.id === captionStyle) || CAPTION_STYLES[0];
        const p = template.preview;
        return {
            font: customCaption.fontFamily || p.font,
            weight: customCaption.fontWeight || p.weight,
            size: customCaption.fontSize || p.size,
            color: customCaption.textColor || p.color,
            highlight: customCaption.highlightColor || p.highlight,
            outline: customCaption.outline !== null ? customCaption.outline : p.outline,
            transform: customCaption.textTransform || p.transform,
            italic: customCaption.italic !== null ? customCaption.italic : (p.italic || false),
            position: customCaption.position || 'bottom',
            bgOpacity: customCaption.bgOpacity ?? 0.6,
            boxBg: p.boxBg || false,
            boxColor: p.boxColor || null,
            highlightScale: p.highlightScale || 1.1,
        };
    };

    // Navigate clips
    const clipIndex = allClips.findIndex(c => c.id === clipId);
    const prevClip = clipIndex > 0 ? allClips[clipIndex - 1] : null;
    const nextClip = clipIndex < allClips.length - 1 ? allClips[clipIndex + 1] : null;

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Loader size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-purple)' }} />
            </div>
        );
    }

    if (!project || !clip) {
        return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <AlertCircle size={48} style={{ color: 'var(--color-error)', marginBottom: 16 }} />
                <h2>Clip not found</h2>
                <Link to={`/projects/${projectId}`} className="btn btn-secondary" style={{ marginTop: 16 }}>
                    <ArrowLeft size={16} /> Back to Project
                </Link>
            </div>
        );
    }

    const clipDuration = trimEnd - trimStart;
    const totalDuration = project.duration || 1;
    const startPct = (trimStart / totalDuration) * 100;
    const endPct = (trimEnd / totalDuration) * 100;
    const playheadPct = (currentTime / totalDuration) * 100;

    return (
        <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Link to={`/projects/${projectId}`} className="btn btn-ghost btn-sm" style={{ gap: 6 }}>
                        <ArrowLeft size={16} /> Back
                    </Link>
                    <div>
                        <h1 className="page-title" style={{ fontSize: '1.3rem', margin: 0 }}>
                            <Scissors size={20} style={{ marginRight: 8 }} />
                            Clip #{clip.clip_number}
                        </h1>
                        <div className="text-sm text-muted">{clip.title}</div>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Music Button */}
                    <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setShowMusicSelector(true)}
                        style={{ gap: 5, fontSize: 12 }}
                        title="Background Music"
                    >
                        🎵 Music
                    </button>
                    {musicTrackName && (
                        <span className="music-badge">🎵 {musicTrackName}</span>
                    )}

                    {/* SFX Button */}
                    <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setShowSfxSelector(true)}
                        style={{ gap: 5, fontSize: 12 }}
                        title="Sound Effects"
                    >
                        🔊 SFX
                    </button>
                    {sfxCount > 0 && (
                        <span className="music-badge">🔊 {sfxCount}</span>
                    )}

                    {/* Save & Export Buttons */}
                    <button
                        className={`btn btn-sm ${hasChanges ? 'btn-primary' : 'btn-ghost'}`}
                        onClick={saveAll}
                        disabled={saving || exporting}
                        style={{ gap: 5, fontSize: 12 }}
                        title="Simpan semua perubahan"
                    >
                        {saving ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                        Save
                    </button>
                    <button
                        className="btn btn-sm btn-primary"
                        onClick={exportClip}
                        disabled={exporting || saving}
                        style={{ gap: 5, fontSize: 12, background: exporting ? undefined : 'linear-gradient(135deg, #8b5cf6, #06b6d4)' }}
                        title="Render & download clip"
                    >
                        {exporting ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
                        {exporting ? 'Exporting...' : 'Export'}
                    </button>

                    <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />

                    {prevClip && (
                        <Link to={`/projects/${projectId}/clips/${prevClip.id}`} className="btn btn-ghost btn-sm" style={{ gap: 4 }}>
                            <ChevronLeft size={14} /> Prev
                        </Link>
                    )}
                    <span className="text-sm text-muted">{clipIndex + 1} / {allClips.length}</span>
                    {nextClip && (
                        <Link to={`/projects/${projectId}/clips/${nextClip.id}`} className="btn btn-ghost btn-sm" style={{ gap: 4 }}>
                            Next <ChevronRight size={14} />
                        </Link>
                    )}
                </div>
            </div>

            {/* Status Message */}
            <AnimatePresence>
                {saveMsg && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{
                            padding: '8px 16px', borderRadius: 8, marginBottom: 12, fontSize: 13,
                            background: saveMsg.includes('✅') ? 'rgba(16,185,129,0.1)' : saveMsg.includes('❌') ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                            color: saveMsg.includes('✅') ? '#10b981' : saveMsg.includes('❌') ? '#ef4444' : '#3b82f6',
                            border: `1px solid ${saveMsg.includes('✅') ? 'rgba(16,185,129,0.2)' : saveMsg.includes('❌') ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)'}`
                        }}
                    >
                        {saveMsg}
                    </motion.div>
                )}
            </AnimatePresence>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, minHeight: 0 }}>
                {/* Main: Video Player + Timeline */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Aspect Ratio Switcher */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span className="text-sm text-muted" style={{ marginRight: 4 }}>Preview:</span>
                        {[
                            { ratio: '9:16', icon: Smartphone, label: '9:16 Portrait' },
                            { ratio: '1:1', icon: Tablet, label: '1:1 Square' },
                            { ratio: '16:9', icon: Monitor, label: '16:9 Landscape' },
                        ].map(({ ratio, icon: Icon, label }) => (
                            <button
                                key={ratio}
                                className={`btn btn-sm ${previewRatio === ratio ? 'btn-primary' : 'btn-ghost'}`}
                                onClick={() => setPreviewRatio(ratio)}
                                title={label}
                                style={{
                                    gap: 4, fontSize: 12, padding: '4px 10px',
                                    ...(previewRatio === ratio ? {} : { opacity: 0.6 })
                                }}
                            >
                                <Icon size={14} /> {ratio}
                            </button>
                        ))}
                        <div style={{ flex: 1 }} />
                        <button
                            className={`btn btn-sm ${subtitlesEnabled ? 'btn-primary' : 'btn-ghost'}`}
                            onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
                            title={subtitlesEnabled ? 'Hide subtitles' : 'Show subtitles'}
                            style={{ gap: 4, fontSize: 12, padding: '4px 10px' }}
                        >
                            <Subtitles size={14} /> CC
                        </button>
                    </div>

                    {/* Video Player */}
                    <motion.div
                        className="card"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        ref={playerContainerRef}
                        style={{ padding: 0, overflow: 'hidden' }}
                    >
                        {/* Device frame wrapper */}
                        <div style={{
                            background: previewRatio === '9:16' ? 'linear-gradient(135deg, #1a1a2e, #16213e)' : '#0a0a0a',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: previewRatio === '9:16' ? '12px 0' : previewRatio === '1:1' ? '8px 0' : 0,
                            minHeight: previewRatio === '16:9' ? undefined : 200,
                        }}>
                            <div style={{
                                position: 'relative',
                                background: '#000',
                                aspectRatio: previewRatio === '9:16' ? '9/16' : previewRatio === '1:1' ? '1/1' : '16/9',
                                maxHeight: previewRatio === '9:16' ? '55vh' : '50vh',
                                maxWidth: previewRatio === '9:16' ? '280px' : previewRatio === '1:1' ? '400px' : '100%',
                                width: previewRatio === '16:9' ? '100%' : undefined,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: previewRatio === '9:16' ? 24 : previewRatio === '1:1' ? 12 : 0,
                                overflow: 'hidden',
                                border: previewRatio !== '16:9' ? '3px solid rgba(255,255,255,0.1)' : 'none',
                                boxShadow: previewRatio !== '16:9' ? '0 8px 32px rgba(0,0,0,0.5)' : 'none',
                            }}>
                                {videoSrc ? (
                                    <video
                                        ref={videoRef}
                                        src={videoSrc}
                                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                        onClick={togglePlay}
                                        playsInline
                                    />
                                ) : (
                                    <div style={{ color: '#666', textAlign: 'center', padding: 40 }}>
                                        <Film size={48} style={{ marginBottom: 12, opacity: 0.4 }} />
                                        <div>No video preview available</div>
                                    </div>
                                )}
                                {/* Play overlay */}
                                {!playing && videoReady && (
                                    <div
                                        onClick={togglePlay}
                                        style={{
                                            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', background: 'rgba(0,0,0,0.3)', transition: 'opacity 0.2s'
                                        }}
                                    >
                                        <div style={{
                                            width: 64, height: 64, borderRadius: '50%', background: 'rgba(139,92,246,0.85)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            boxShadow: '0 4px 20px rgba(139,92,246,0.4)'
                                        }}>
                                            <Play size={28} fill="white" color="white" style={{ marginLeft: 3 }} />
                                        </div>
                                    </div>
                                )}
                                {/* Hook Title preview overlay */}
                                {hookText && hookText.trim() && (
                                    <div style={{
                                        position: 'absolute',
                                        left: '5%', right: '5%',
                                        [hookSettings.position === 'bottom' ? 'bottom' : 'top']: hookSettings.position === 'bottom' ? '20%' : '4%',
                                        display: 'flex', justifyContent: 'center',
                                        pointerEvents: 'none', zIndex: 15,
                                    }}>
                                        <div style={{
                                            background: hookSettings.bgColor || '#FF0000',
                                            opacity: parseFloat(hookSettings.bgOpacity || 0.85),
                                            padding: `${Math.max(6, hookSettings.fontSize / 6)}px ${Math.max(12, hookSettings.fontSize / 3)}px`,
                                            borderRadius: 4,
                                            maxWidth: '90%',
                                            textAlign: 'center',
                                        }}>
                                            <span style={{
                                                color: hookSettings.textColor || '#FFFFFF',
                                                fontWeight: 800,
                                                fontSize: Math.max(10, hookSettings.fontSize / 4),
                                                textTransform: 'uppercase',
                                                letterSpacing: 1,
                                                lineHeight: 1.3,
                                                display: 'block',
                                                textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                                            }}>
                                                {hookText}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Subtitle overlay */}
                                {subtitlesEnabled && activeCaption && activeCaption.length > 0 && (() => {
                                    const es = getEffectiveStyle();
                                    const posMap = { top: '10%', center: '45%', bottom: previewRatio === '9:16' ? '12%' : '10%' };
                                    return (
                                        <div
                                            onClick={togglePlay}
                                            style={{
                                                position: 'absolute',
                                                left: '5%', right: '5%',
                                                ...(es.position === 'center'
                                                    ? { top: posMap.center, transform: 'translateY(-50%)' }
                                                    : es.position === 'top'
                                                        ? { top: posMap.top }
                                                        : { bottom: posMap.bottom }),
                                                textAlign: 'center',
                                                zIndex: 10,
                                                pointerEvents: 'none',
                                                lineHeight: 1.5,
                                            }}
                                        >
                                            <div style={{
                                                display: 'inline-block',
                                                padding: es.boxBg ? '10px 20px' : '6px 14px',
                                                borderRadius: es.boxBg ? 12 : 8,
                                                background: captionStyle === 'news'
                                                    ? 'linear-gradient(90deg, rgba(26,26,62,0.9), rgba(45,27,105,0.9))'
                                                    : es.boxBg && es.boxColor
                                                        ? es.boxColor
                                                        : `rgba(0,0,0,${es.bgOpacity})`,
                                                backdropFilter: 'blur(4px)',
                                            }}>
                                                {activeCaption.map((w, i) => (
                                                    <span
                                                        key={i}
                                                        style={{
                                                            fontFamily: es.font,
                                                            fontWeight: w.active ? Math.min(es.weight + 100, 900) : es.weight,
                                                            fontSize: previewRatio === '9:16' ? Math.max(es.size - 2, 11) : es.size + 2,
                                                            color: w.active ? es.highlight : es.color,
                                                            textTransform: es.transform,
                                                            fontStyle: es.italic ? 'italic' : 'normal',
                                                            textShadow: es.outline
                                                                ? '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000'
                                                                : '0 1px 4px rgba(0,0,0,0.7)',
                                                            transition: 'color 0.1s, transform 0.15s, font-weight 0.1s',
                                                            display: 'inline-block',
                                                            transform: w.active ? `scale(${es.highlightScale || 1.1})` : 'scale(1)',
                                                            marginRight: 6,
                                                            letterSpacing: es.transform === 'uppercase' ? '0.5px' : '0',
                                                        }}
                                                    >
                                                        {w.word}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* Player Controls */}
                        <div style={{ padding: '10px 16px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid var(--border-subtle)' }}>
                            <button className="btn btn-ghost btn-sm" onClick={skipBack} title="Back 5s (J)" style={{ padding: '4px 6px' }}>
                                <SkipBack size={16} />
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={togglePlay} title="Play/Pause (Space)" style={{ padding: '4px 8px' }}>
                                {playing ? <Pause size={18} /> : <Play size={18} />}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={skipForward} title="Forward 5s (L)" style={{ padding: '4px 6px' }}>
                                <SkipForward size={16} />
                            </button>

                            <div className="text-sm" style={{ fontFamily: 'monospace', minWidth: 100 }}>
                                {formatTime(currentTime - trimStart)} / {formatTime(clipDuration)}
                            </div>

                            {/* Volume */}
                            <button className="btn btn-ghost btn-sm" onClick={toggleMute} style={{ padding: '4px 6px' }}>
                                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                            </button>
                            <input
                                type="range" min="0" max="1" step="0.05"
                                value={muted ? 0 : volume}
                                onChange={(e) => changeVolume(parseFloat(e.target.value))}
                                style={{ width: 60, accentColor: 'var(--accent-purple)' }}
                            />

                            {/* Speed */}
                            <button className="btn btn-ghost btn-sm" onClick={changeSpeed} title="Playback Speed"
                                style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: 12, minWidth: 40 }}>
                                {playbackSpeed}x
                            </button>

                            <div style={{ flex: 1 }} />

                            {/* Subtitle toggle */}
                            <button className={`btn btn-ghost btn-sm`} onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
                                style={{ padding: '4px 6px', opacity: subtitlesEnabled ? 1 : 0.4 }} title="Toggle subtitles">
                                <Subtitles size={16} />
                            </button>

                            {/* Fullscreen */}
                            <button className="btn btn-ghost btn-sm" onClick={toggleFullscreen} style={{ padding: '4px 6px' }}>
                                {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                            </button>
                        </div>
                    </motion.div>

                    {/* Timeline / Trimmer */}
                    <motion.div
                        className="card"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <div className="card-header" style={{ marginBottom: 12 }}>
                            <div className="card-title" style={{ gap: 8 }}>
                                <Scissors size={16} /> Timeline & Trim
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                {hasChanges && (
                                    <>
                                        <button className="btn btn-ghost btn-sm" onClick={resetTrim} style={{ gap: 4 }}>
                                            <RefreshCw size={12} /> Reset
                                        </button>
                                        <button className="btn btn-primary btn-sm" onClick={saveTrim} disabled={saving} style={{ gap: 4 }}>
                                            {saving ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
                                            Save Changes
                                        </button>
                                    </>
                                )}
                                {saveMsg && (
                                    <span className="text-sm" style={{ color: saveMsg.includes('Error') ? 'var(--color-error)' : 'var(--color-success)' }}>
                                        {saveMsg}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Full video timeline */}
                        <div style={{ marginBottom: 16 }}>
                            <div className="text-sm text-muted" style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                                <span>Full Video Timeline</span>
                                <span>{formatTime(totalDuration)}</span>
                            </div>
                            <div
                                ref={timelineRef}
                                style={{
                                    position: 'relative', height: 48, background: 'var(--bg-primary)',
                                    borderRadius: 8, border: '1px solid var(--border-subtle)', overflow: 'hidden',
                                    cursor: 'pointer', userSelect: 'none'
                                }}
                                onMouseDown={(e) => handleTimelineMouse(e, 'playhead')}
                            >
                                {/* Greyed-out before */}
                                <div style={{
                                    position: 'absolute', left: 0, top: 0, bottom: 0, width: `${startPct}%`,
                                    background: 'rgba(0,0,0,0.5)', zIndex: 1
                                }} />
                                {/* Greyed-out after */}
                                <div style={{
                                    position: 'absolute', right: 0, top: 0, bottom: 0, width: `${100 - endPct}%`,
                                    background: 'rgba(0,0,0,0.5)', zIndex: 1
                                }} />

                                {/* Selected clip region */}
                                <div style={{
                                    position: 'absolute', left: `${startPct}%`, width: `${endPct - startPct}%`,
                                    top: 0, bottom: 0,
                                    background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(6,182,212,0.2))',
                                    borderLeft: '3px solid var(--accent-purple)',
                                    borderRight: '3px solid var(--accent-cyan)',
                                    zIndex: 2
                                }} />

                                {/* Start handle */}
                                <div
                                    onMouseDown={(e) => { e.stopPropagation(); handleTimelineMouse(e, 'start'); }}
                                    style={{
                                        position: 'absolute', left: `${startPct}%`, top: 0, bottom: 0, width: 14,
                                        transform: 'translateX(-7px)', cursor: 'ew-resize', zIndex: 5,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    <div style={{
                                        width: 4, height: 24, borderRadius: 2,
                                        background: isDragging === 'start' ? '#fff' : 'var(--accent-purple)',
                                        boxShadow: '0 0 6px rgba(139,92,246,0.6)'
                                    }} />
                                </div>

                                {/* End handle */}
                                <div
                                    onMouseDown={(e) => { e.stopPropagation(); handleTimelineMouse(e, 'end'); }}
                                    style={{
                                        position: 'absolute', left: `${endPct}%`, top: 0, bottom: 0, width: 14,
                                        transform: 'translateX(-7px)', cursor: 'ew-resize', zIndex: 5,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                >
                                    <div style={{
                                        width: 4, height: 24, borderRadius: 2,
                                        background: isDragging === 'end' ? '#fff' : 'var(--accent-cyan)',
                                        boxShadow: '0 0 6px rgba(6,182,212,0.6)'
                                    }} />
                                </div>

                                {/* Playhead */}
                                <div style={{
                                    position: 'absolute', left: `${playheadPct}%`, top: 0, bottom: 0, width: 2,
                                    background: '#fff', zIndex: 4, transform: 'translateX(-1px)',
                                    boxShadow: '0 0 6px rgba(255,255,255,0.6)'
                                }}>
                                    <div style={{
                                        position: 'absolute', top: -4, left: -5, width: 12, height: 12,
                                        background: '#fff', borderRadius: '50%'
                                    }} />
                                </div>
                            </div>
                        </div>

                        {/* Time inputs */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                            <div>
                                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent-purple)' }} />
                                    Start Time
                                </label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={trimStart.toFixed(2)}
                                    onChange={(e) => {
                                        const v = parseFloat(e.target.value);
                                        if (!isNaN(v) && v >= 0 && v < trimEnd) {
                                            setTrimStart(v);
                                            setHasChanges(true);
                                            if (videoRef.current) videoRef.current.currentTime = v;
                                        }
                                    }}
                                    step="0.1"
                                    style={{ fontFamily: 'monospace' }}
                                />
                                <div className="text-sm text-muted" style={{ marginTop: 2 }}>{formatTimeFull(trimStart)}</div>
                            </div>
                            <div>
                                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                    <Clock size={12} /> Duration
                                </label>
                                <div className="form-input" style={{ background: 'var(--bg-primary)', fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-cyan)' }}>
                                    {clipDuration.toFixed(2)}s
                                </div>
                                <div className="text-sm text-muted" style={{ marginTop: 2 }}>{formatTimeFull(clipDuration)}</div>
                            </div>
                            <div>
                                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent-cyan)' }} />
                                    End Time
                                </label>
                                <input
                                    type="number"
                                    className="form-input"
                                    value={trimEnd.toFixed(2)}
                                    onChange={(e) => {
                                        const v = parseFloat(e.target.value);
                                        if (!isNaN(v) && v > trimStart && v <= totalDuration) {
                                            setTrimEnd(v);
                                            setHasChanges(true);
                                        }
                                    }}
                                    step="0.1"
                                    style={{ fontFamily: 'monospace' }}
                                />
                                <div className="text-sm text-muted" style={{ marginTop: 2 }}>{formatTimeFull(trimEnd)}</div>
                            </div>
                        </div>

                        {/* Quick adjust buttons */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                            <span className="text-sm text-muted" style={{ marginRight: 4, lineHeight: '28px' }}>Start:</span>
                            {[-5, -1, -0.1, 0.1, 1, 5].map(delta => (
                                <button
                                    key={`s${delta}`}
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => {
                                        const newStart = Math.max(0, trimStart + delta);
                                        if (newStart < trimEnd) {
                                            setTrimStart(newStart);
                                            setHasChanges(true);
                                            if (videoRef.current) videoRef.current.currentTime = newStart;
                                        }
                                    }}
                                    style={{ padding: '2px 8px', fontSize: 11, fontFamily: 'monospace' }}
                                >
                                    {delta > 0 ? '+' : ''}{delta}s
                                </button>
                            ))}
                            <span className="text-sm text-muted" style={{ marginLeft: 12, marginRight: 4, lineHeight: '28px' }}>End:</span>
                            {[-5, -1, -0.1, 0.1, 1, 5].map(delta => (
                                <button
                                    key={`e${delta}`}
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => {
                                        const newEnd = Math.min(totalDuration, trimEnd + delta);
                                        if (newEnd > trimStart) {
                                            setTrimEnd(newEnd);
                                            setHasChanges(true);
                                        }
                                    }}
                                    style={{ padding: '2px 8px', fontSize: 11, fontFamily: 'monospace' }}
                                >
                                    {delta > 0 ? '+' : ''}{delta}s
                                </button>
                            ))}
                        </div>

                        {/* Split & Merge controls */}
                        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                                className="btn btn-ghost btn-sm"
                                disabled={splitting || !clip}
                                onClick={async () => {
                                    if (!clip || !videoRef.current) return;
                                    const splitAt = currentTime;
                                    if (splitAt <= trimStart + 0.5 || splitAt >= trimEnd - 0.5) {
                                        setSaveMsg('Move playhead to where you want to split');
                                        setTimeout(() => setSaveMsg(''), 2000);
                                        return;
                                    }
                                    setSplitting(true);
                                    try {
                                        const res = await fetch(`${API}/projects/clips/${clip.id}/split`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ split_time: splitAt })
                                        });
                                        const data = await res.json();
                                        if (data.clips) {
                                            setAllClips(data.clips);
                                            setSaveMsg('Clip split! Reload to see results.');
                                            setTimeout(() => { window.location.reload(); }, 800);
                                        } else {
                                            setSaveMsg(data.error || 'Split failed');
                                        }
                                    } catch (err) {
                                        setSaveMsg('Split error: ' + err.message);
                                    } finally {
                                        setSplitting(false);
                                        setTimeout(() => setSaveMsg(''), 3000);
                                    }
                                }}
                                style={{ gap: 4, fontSize: 11 }}
                                title="Split clip at current playhead position"
                            >
                                {splitting ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <GitBranch size={12} />}
                                Split at {formatTime(currentTime)}
                            </button>

                            {(() => {
                                const sortedClips = [...allClips].sort((a, b) => a.start_time - b.start_time);
                                const currentIdx = sortedClips.findIndex(c => c.id === clipId);
                                const prevClip = currentIdx > 0 ? sortedClips[currentIdx - 1] : null;
                                const nextClip = currentIdx < sortedClips.length - 1 ? sortedClips[currentIdx + 1] : null;

                                const handleMerge = async (otherClipId) => {
                                    setSplitting(true);
                                    try {
                                        const res = await fetch(`${API}/projects/clips/merge`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ clipId1: clipId, clipId2: otherClipId })
                                        });
                                        const data = await res.json();
                                        if (data.clips) {
                                            setAllClips(data.clips);
                                            setSaveMsg('Clips merged!');
                                            setTimeout(() => { window.location.reload(); }, 800);
                                        } else {
                                            setSaveMsg(data.error || 'Merge failed');
                                        }
                                    } catch (err) {
                                        setSaveMsg('Merge error: ' + err.message);
                                    } finally {
                                        setSplitting(false);
                                        setTimeout(() => setSaveMsg(''), 3000);
                                    }
                                };

                                return (
                                    <>
                                        {prevClip && (
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                disabled={splitting}
                                                onClick={() => handleMerge(prevClip.id)}
                                                style={{ gap: 4, fontSize: 11 }}
                                                title={`Merge with previous clip (#${prevClip.clip_number})`}
                                            >
                                                <GitMerge size={12} /> Merge ← #{prevClip.clip_number}
                                            </button>
                                        )}
                                        {nextClip && (
                                            <button
                                                className="btn btn-ghost btn-sm"
                                                disabled={splitting}
                                                onClick={() => handleMerge(nextClip.id)}
                                                style={{ gap: 4, fontSize: 11 }}
                                                title={`Merge with next clip (#${nextClip.clip_number})`}
                                            >
                                                <GitMerge size={12} /> Merge → #{nextClip.clip_number}
                                            </button>
                                        )}
                                    </>
                                );
                            })()}
                        </div>

                        {/* Keyboard shortcuts hint */}
                        <div className="text-sm text-muted" style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 6, lineHeight: 1.6 }}>
                            <strong>Shortcuts:</strong> Space = Play/Pause &nbsp; J/L = ±5s &nbsp; ,/. = Frame ±1 &nbsp; F = Fullscreen &nbsp; M = Mute
                        </div>
                    </motion.div>
                </div>

                {/* Right Panel: Clip Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto', paddingRight: 4 }}>
                    {/* Score card */}
                    <motion.div className="card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                            <ScoreBadge score={clip.virality_score} size="lg" />
                            <div>
                                <div className="font-semibold" style={{ fontSize: '1.1rem' }}>Virality Score</div>
                                <div className="text-sm text-muted">
                                    {clip.virality_score >= 80 ? '🔥 Viral potential!' : clip.virality_score >= 60 ? '✨ Good clip' : '📊 Average'}
                                </div>
                            </div>
                        </div>

                        {/* Sub-scores */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {[
                                { label: 'Hook', score: clip.hook_score, icon: Zap },
                                { label: 'Engagement', score: clip.engagement_score, icon: ThumbsUp },
                                { label: 'Trend', score: clip.trend_score, icon: Hash },
                                { label: 'Shareability', score: clip.shareability_score, icon: Share2 },
                            ].map(item => (
                                <div key={item.label} style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '6px 10px', borderRadius: 8, background: 'var(--bg-primary)'
                                }}>
                                    <item.icon size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                    <span className="text-sm">{item.label}</span>
                                    <span className="font-semibold" style={{ marginLeft: 'auto', fontSize: 13 }}>{item.score || '—'}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Clip details */}
                    <motion.div className="card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                        <div className="card-title" style={{ marginBottom: 12, fontSize: 14 }}>
                            <Film size={14} /> Clip Details
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {clip.hook_text && (
                                <div>
                                    <div className="form-label">Hook Text</div>
                                    <div className="text-sm" style={{
                                        padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 6,
                                        borderLeft: '3px solid var(--accent-purple)', lineHeight: 1.5
                                    }}>
                                        "{clip.hook_text}"
                                    </div>
                                </div>
                            )}
                            {clip.why_viral && (
                                <div>
                                    <div className="form-label">Why Viral</div>
                                    <div className="text-sm text-muted" style={{ lineHeight: 1.5 }}>{clip.why_viral}</div>
                                </div>
                            )}
                            {clip.content_type && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className="form-label" style={{ margin: 0 }}>Type:</span>
                                    <span className="badge badge-info" style={{ textTransform: 'capitalize' }}>{clip.content_type}</span>
                                </div>
                            )}
                            {clip.hashtags && (
                                <div>
                                    <div className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Hash size={12} /> Hashtags
                                        </span>
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() => {
                                                navigator.clipboard.writeText(clip.hashtags);
                                                setCopiedHashtags(true);
                                                setTimeout(() => setCopiedHashtags(false), 2000);
                                            }}
                                            style={{ padding: '2px 8px', fontSize: 10, gap: 3 }}
                                        >
                                            {copiedHashtags ? <><CheckCircle size={10} /> Copied!</> : <><Share2 size={10} /> Copy</>}
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                        {clip.hashtags.split(/\s+/).filter(t => t.startsWith('#')).map((tag, i) => (
                                            <span key={i} style={{
                                                fontSize: 11, padding: '2px 8px', borderRadius: 12,
                                                background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)',
                                                color: 'var(--accent-cyan)', cursor: 'pointer', transition: 'all 0.15s',
                                            }}
                                                onClick={() => { navigator.clipboard.writeText(tag); }}
                                                title={`Click to copy ${tag}`}
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {clip.improvement_tips && (
                                <div>
                                    <div className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Lightbulb size={12} /> Tips
                                    </div>
                                    <div className="text-sm text-muted" style={{ lineHeight: 1.5 }}>{clip.improvement_tips}</div>
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Social Caption Generator */}
                    <motion.div className="card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 }}>
                        <div className="card-header" style={{ marginBottom: 12 }}>
                            <div className="card-title" style={{ fontSize: 14 }}>
                                <MessageCircle size={14} /> Social Caption Generator
                            </div>
                        </div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <select
                                    value={hookStyle}
                                    onChange={e => setHookStyle(e.target.value)}
                                    className="form-select"
                                    style={{ flex: 1, fontSize: 11, padding: '4px 8px' }}
                                >
                                    <option value="drama">🎭 Drama</option>
                                    <option value="edukasi">📚 Edukasi</option>
                                    <option value="comedy">😂 Comedy</option>
                                    <option value="motivasi">💪 Motivasi</option>
                                    <option value="gossip">👀 Gossip</option>
                                    <option value="horror">👻 Horror</option>
                                    <option value="storytelling">📖 Story</option>
                                    <option value="kontroversial">⚡ Kontroversial</option>
                                    <option value="clickbait">🚨 Clickbait</option>
                                    <option value="aesthetic">✨ Aesthetic</option>
                                </select>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={generateSocialCopy}
                                    disabled={loadingSocial}
                                    style={{ fontSize: 11, padding: '4px 12px', whiteSpace: 'nowrap' }}
                                >
                                    {loadingSocial ? <><Loader size={12} className="spin" /> Generating...</> : <><Zap size={12} /> Generate</>}
                                </button>
                            </div>

                            {socialData && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    {/* Platform tabs */}
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        {['tiktok', 'instagram', 'youtube', 'twitter', 'facebook'].map(p => (
                                            <button
                                                key={p}
                                                className={`btn btn-sm ${socialPlatform === p ? 'btn-primary' : 'btn-ghost'}`}
                                                onClick={() => setSocialPlatform(p)}
                                                style={{ fontSize: 10, padding: '2px 8px', textTransform: 'capitalize' }}
                                            >
                                                {p === 'tiktok' ? '📱' : p === 'instagram' ? '📸' : p === 'youtube' ? '▶️' : p === 'twitter' ? '🐦' : '👥'} {p}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Platform content */}
                                    {(() => {
                                        const pd = socialData[socialPlatform];
                                        if (!pd) return <div className="text-sm text-muted">No data for this platform</div>;
                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                {/* Title */}
                                                {pd.title && (
                                                    <div>
                                                        <div className="form-label" style={{ fontSize: 10, marginBottom: 2 }}>📌 Title</div>
                                                        <div
                                                            style={{ fontSize: 12, padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 6, cursor: 'pointer', lineHeight: 1.4 }}
                                                            onClick={() => { navigator.clipboard.writeText(pd.title); setSaveMsg('✅ Title copied!'); }}
                                                            title="Click to copy"
                                                        >{pd.title}</div>
                                                    </div>
                                                )}
                                                {/* Description */}
                                                {pd.description && (
                                                    <div>
                                                        <div className="form-label" style={{ fontSize: 10, marginBottom: 2 }}>📝 Description</div>
                                                        <div
                                                            style={{ fontSize: 11, padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 6, cursor: 'pointer', lineHeight: 1.5, maxHeight: 120, overflow: 'auto' }}
                                                            onClick={() => { navigator.clipboard.writeText(pd.description); setSaveMsg('✅ Description copied!'); }}
                                                            title="Click to copy"
                                                        >{pd.description}</div>
                                                    </div>
                                                )}
                                                {/* Hooks */}
                                                {pd.hooks && pd.hooks.length > 0 && (
                                                    <div>
                                                        <div className="form-label" style={{ fontSize: 10, marginBottom: 2 }}>🎣 Hooks ({pd.hooks.length})</div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                            {pd.hooks.map((h, i) => (
                                                                <div
                                                                    key={i}
                                                                    style={{
                                                                        fontSize: 11, padding: '5px 10px', background: 'var(--bg-secondary)', borderRadius: 6,
                                                                        cursor: 'pointer', lineHeight: 1.4, borderLeft: '3px solid var(--accent-purple)',
                                                                        transition: 'background 0.15s'
                                                                    }}
                                                                    onClick={() => { navigator.clipboard.writeText(h); setSaveMsg(`✅ Hook ${i + 1} copied!`); }}
                                                                    title="Click to copy"
                                                                >{h}</div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {/* Hashtags */}
                                                {pd.hashtags && (
                                                    <div>
                                                        <div className="form-label" style={{ fontSize: 10, marginBottom: 2 }}># Hashtags</div>
                                                        <div
                                                            style={{ fontSize: 11, padding: '5px 10px', background: 'var(--bg-secondary)', borderRadius: 6, cursor: 'pointer', color: 'var(--accent-cyan)' }}
                                                            onClick={() => { navigator.clipboard.writeText(pd.hashtags); setSaveMsg('✅ Hashtags copied!'); }}
                                                            title="Click to copy"
                                                        >{pd.hashtags}</div>
                                                    </div>
                                                )}
                                                {/* Best Time + Tip */}
                                                <div style={{ display: 'flex', gap: 6 }}>
                                                    {pd.bestTime && (
                                                        <div style={{ flex: 1, fontSize: 10, padding: '4px 8px', background: 'rgba(6,182,212,0.1)', borderRadius: 6, color: 'var(--accent-cyan)' }}>
                                                            🕐 {pd.bestTime}
                                                        </div>
                                                    )}
                                                    {pd.engagementTip && (
                                                        <div style={{ flex: 1, fontSize: 10, padding: '4px 8px', background: 'rgba(124,58,237,0.1)', borderRadius: 6, color: 'var(--accent-purple)' }}>
                                                            💡 {pd.engagementTip}
                                                        </div>
                                                    )}
                                                </div>
                                                {/* Copy all button */}
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => {
                                                        const all = `${pd.title || ''}\n\n${pd.description || ''}\n\n${pd.hashtags || ''}`;
                                                        navigator.clipboard.writeText(all);
                                                        setSaveMsg('✅ All copied to clipboard!');
                                                    }}
                                                    style={{ fontSize: 11 }}
                                                >
                                                    <Share2 size={12} /> Copy All ({socialPlatform})
                                                </button>
                                            </div>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Thumbnail Generator */}
                    <motion.div className="card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.13 }}>
                        <div className="card-header" style={{ marginBottom: 12 }}>
                            <div className="card-title" style={{ fontSize: 14 }}>
                                <Film size={14} /> Thumbnail Generator
                            </div>
                        </div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={generateThumbnails}
                                disabled={loadingThumbnails}
                                style={{ fontSize: 12 }}
                            >
                                {loadingThumbnails ? <><Loader size={12} className="spin" /> Extracting frames...</> : <><Eye size={12} /> Generate Thumbnails</>}
                            </button>
                            {thumbnails.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                                    {thumbnails.map((thumb, i) => (
                                        <div
                                            key={i}
                                            style={{
                                                position: 'relative', borderRadius: 8, overflow: 'hidden',
                                                border: '2px solid var(--border-subtle)', cursor: 'pointer',
                                                transition: 'border-color 0.15s, transform 0.15s',
                                            }}
                                            onClick={() => {
                                                // Download thumbnail
                                                const a = document.createElement('a');
                                                a.href = thumb.url;
                                                a.download = `thumbnail_${i + 1}.jpg`;
                                                a.click();
                                                setSaveMsg(`✅ Thumbnail ${i + 1} downloaded!`);
                                            }}
                                            title={`${thumb.label || `Frame ${i + 1}`} — Click to download`}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-purple)'; e.currentTarget.style.transform = 'scale(1.03)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'scale(1)'; }}
                                        >
                                            <img src={thumb.url} alt={thumb.label} style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover' }} />
                                            <div style={{
                                                position: 'absolute', bottom: 0, left: 0, right: 0,
                                                background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                                                padding: '12px 6px 4px', fontSize: 9, color: '#fff', textAlign: 'center'
                                            }}>
                                                {thumb.label || `Frame ${i + 1}`}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Trend Analysis */}
                    <motion.div className="card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.18 }}>
                        <div className="card-title" style={{ marginBottom: 12, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <TrendingUp size={14} /> Trend Analysis
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={analyzeTrend}
                                disabled={loadingTrend}
                                style={{ gap: 6 }}
                            >
                                {loadingTrend ? <><Loader size={12} className="spin" /> Analyzing...</> : <><BarChart2 size={12} /> Analyze Trend</>}
                            </button>
                            {trendData && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {/* Score Badge */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: `linear-gradient(135deg, ${trendData.trendScore >= 75 ? 'rgba(34,197,94,0.1)' : trendData.trendScore >= 50 ? 'rgba(234,179,8,0.1)' : 'rgba(239,68,68,0.1)'}, transparent)`, border: `1px solid ${trendData.trendScore >= 75 ? 'rgba(34,197,94,0.2)' : trendData.trendScore >= 50 ? 'rgba(234,179,8,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
                                        <div style={{ fontSize: 28, fontWeight: 800, color: trendData.trendScore >= 75 ? '#22c55e' : trendData.trendScore >= 50 ? '#eab308' : '#ef4444' }}>
                                            {trendData.trendScore}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: 12 }}>Trend Score</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{trendData.viralPotential}</div>
                                        </div>
                                    </div>

                                    {/* Predicted Views */}
                                    {trendData.predictedViews && (
                                        <div style={{ padding: '8px 12px', background: 'rgba(139,92,246,0.06)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.12)' }}>
                                            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>📊 Predicted Views</div>
                                            <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                                                <span>Low: <b>{(trendData.predictedViews.low || 0).toLocaleString()}</b></span>
                                                <span>Mid: <b style={{ color: '#eab308' }}>{(trendData.predictedViews.mid || 0).toLocaleString()}</b></span>
                                                <span>High: <b style={{ color: '#22c55e' }}>{(trendData.predictedViews.high || 0).toLocaleString()}</b></span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Best Platform */}
                                    {trendData.bestPlatform && (
                                        <div style={{ fontSize: 12, padding: '6px 10px', background: 'rgba(59,130,246,0.08)', borderRadius: 6 }}>
                                            🏆 Best Platform: <b style={{ color: 'var(--accent-cyan)' }}>{trendData.bestPlatform}</b>
                                        </div>
                                    )}

                                    {/* Trending Topics */}
                                    {trendData.trendingTopics?.length > 0 && (
                                        <div>
                                            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>🔥 Trending Topics</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                {trendData.trendingTopics.map((t, i) => (
                                                    <span key={i} style={{ padding: '2px 8px', borderRadius: 10, background: 'rgba(234,179,8,0.12)', fontSize: 11, color: '#eab308' }}>{t}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Strengths */}
                                    {trendData.contentStrengths?.length > 0 && (
                                        <div>
                                            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>✅ Strengths</div>
                                            {trendData.contentStrengths.map((s, i) => (
                                                <div key={i} style={{ fontSize: 11, color: '#22c55e', paddingLeft: 8, marginBottom: 2 }}>• {s}</div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Weaknesses */}
                                    {trendData.contentWeaknesses?.length > 0 && (
                                        <div>
                                            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>⚠️ Weaknesses</div>
                                            {trendData.contentWeaknesses.map((w, i) => (
                                                <div key={i} style={{ fontSize: 11, color: '#f59e0b', paddingLeft: 8, marginBottom: 2 }}>• {w}</div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Suggestions */}
                                    {trendData.improvementSuggestions?.length > 0 && (
                                        <div>
                                            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>💡 Improvements</div>
                                            {trendData.improvementSuggestions.map((s, i) => (
                                                <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', paddingLeft: 8, marginBottom: 2 }}>• {s}</div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Target Audience & Series */}
                                    {trendData.targetAudience && (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                                            🎯 <b>Target:</b> {trendData.targetAudience}
                                        </div>
                                    )}
                                    {trendData.suggestedSeries && (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                                            📺 <b>Series Idea:</b> {trendData.suggestedSeries}
                                        </div>
                                    )}
                                    {trendData.soundTrend && (
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                                            🎵 <b>Sound:</b> {trendData.soundTrend}
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </div>
                    </motion.div>

                    {/* B-Roll Stock Footage Search */}
                    <motion.div className="card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                        <div className="card-title" style={{ marginBottom: 12, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Film size={14} /> B-Roll Stock Footage
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <input
                                    className="input-field"
                                    placeholder={clip?.title || 'Search keywords...'}
                                    value={brollQuery}
                                    onChange={(e) => setBrollQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && searchBroll()}
                                    style={{ flex: 1, fontSize: 12, padding: '6px 10px' }}
                                />
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={searchBroll}
                                    disabled={loadingBroll}
                                    style={{ gap: 4, whiteSpace: 'nowrap' }}
                                >
                                    {loadingBroll ? <Loader size={12} className="spin" /> : <Search size={12} />}
                                    Search
                                </button>
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                Powered by Pexels — free stock footage for your clips
                            </div>
                            {brollVideos.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                                    {brollVideos.map((v, i) => (
                                        <div key={v.id} style={{
                                            position: 'relative', borderRadius: 8, overflow: 'hidden',
                                            border: '1px solid var(--border-subtle)', cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                            onClick={() => window.open(v.url, '_blank')}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-cyan)'; e.currentTarget.style.transform = 'scale(1.02)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'scale(1)'; }}
                                            title={`By ${v.user} — Click to view on Pexels`}
                                        >
                                            <img src={v.image} alt="B-Roll" style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover' }} />
                                            <div style={{
                                                position: 'absolute', bottom: 0, left: 0, right: 0,
                                                background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                                                padding: '16px 6px 4px', fontSize: 9, color: '#fff'
                                            }}>
                                                <div>{v.duration}s • {v.width}×{v.height}</div>
                                                <div style={{ opacity: 0.6 }}>by {v.user}</div>
                                            </div>
                                            {v.downloadUrl && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const a = document.createElement('a');
                                                        a.href = v.downloadUrl;
                                                        a.target = '_blank';
                                                        a.rel = 'noopener noreferrer';
                                                        a.click();
                                                    }}
                                                    style={{
                                                        position: 'absolute', top: 4, right: 4,
                                                        background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 6,
                                                        padding: '3px 6px', color: '#fff', fontSize: 10, cursor: 'pointer'
                                                    }}
                                                >⬇</button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>

                    {/* Caption Style Selector */}
                    <motion.div className="card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
                        <div className="card-header" style={{ marginBottom: 12 }}>
                            <div className="card-title" style={{ fontSize: 14 }}>
                                <Type size={14} /> Caption Style
                            </div>
                            {savingStyle && <Loader size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-cyan)' }} />}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            {CAPTION_STYLES.map(style => {
                                const isActive = captionStyle === style.id;
                                const p = style.preview;
                                return (
                                    <div
                                        key={style.id}
                                        onClick={() => saveCaptionStyle(style.id)}
                                        style={{
                                            position: 'relative',
                                            borderRadius: 10,
                                            overflow: 'hidden',
                                            cursor: 'pointer',
                                            border: isActive ? '2px solid var(--accent-purple)' : '2px solid var(--border-subtle)',
                                            transition: 'all 0.2s ease',
                                            background: 'var(--bg-primary)',
                                            opacity: isActive ? 1 : 0.75,
                                            transform: isActive ? 'scale(1)' : 'scale(0.98)',
                                        }}
                                    >
                                        {/* Mini preview */}
                                        <div style={{
                                            height: 48,
                                            background: p.bg,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            position: 'relative',
                                        }}>
                                            <div style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                padding: p.boxBg ? '4px 12px' : '0',
                                                borderRadius: p.boxBg ? 6 : 0,
                                                background: p.boxBg ? (p.boxColor || 'rgba(0,0,0,0.75)') : 'transparent',
                                            }}>
                                                <span style={{
                                                    fontFamily: p.font,
                                                    fontWeight: p.weight,
                                                    fontSize: p.highlightScale ? p.size * p.highlightScale : p.size,
                                                    color: p.highlight,
                                                    textTransform: p.transform,
                                                    fontStyle: p.italic ? 'italic' : 'normal',
                                                    textShadow: p.outline ? `1px 1px 0 ${p.color === '#fff' ? '#000' : 'rgba(0,0,0,0.8)'}, -1px -1px 0 ${p.color === '#fff' ? '#000' : 'rgba(0,0,0,0.8)'}` : (p.boxBg ? 'none' : '1px 1px 3px rgba(0,0,0,0.5)'),
                                                    letterSpacing: p.transform === 'uppercase' ? '0.5px' : '0',
                                                }}>Sample</span>
                                                <span style={{
                                                    fontFamily: p.font,
                                                    fontWeight: p.weight,
                                                    fontSize: p.size,
                                                    color: p.color,
                                                    textTransform: p.transform,
                                                    fontStyle: p.italic ? 'italic' : 'normal',
                                                    textShadow: p.outline ? '1px 1px 0 #000, -1px -1px 0 #000' : (p.boxBg ? 'none' : '1px 1px 3px rgba(0,0,0,0.5)'),
                                                    marginLeft: 5,
                                                    letterSpacing: p.transform === 'uppercase' ? '0.5px' : '0',
                                                }}> Text</span>
                                            </div>
                                            {isActive && (
                                                <div style={{
                                                    position: 'absolute', top: 4, right: 4,
                                                    width: 18, height: 18, borderRadius: '50%',
                                                    background: 'var(--accent-purple)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    <Check size={11} color="#fff" strokeWidth={3} />
                                                </div>
                                            )}
                                        </div>
                                        {/* Label */}
                                        <div style={{ padding: '5px 8px' }}>
                                            <div style={{ fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span>{style.emoji}</span> {style.name}
                                            </div>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>{style.desc}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Customize toggle */}
                        <button
                            onClick={() => setShowCustomize(!showCustomize)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                width: '100%', padding: '8px 0', marginTop: 8,
                                background: 'none', border: 'none', color: 'var(--text-secondary)',
                                cursor: 'pointer', fontSize: 12, fontWeight: 500,
                            }}
                        >
                            <SlidersHorizontal size={13} />
                            Customize Style
                            {showCustomize ? <ChevronUp size={13} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={13} style={{ marginLeft: 'auto' }} />}
                        </button>

                        {/* Customize panel */}
                        {showCustomize && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}
                            >
                                {/* Font Family */}
                                <div>
                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Font Family</label>
                                    <select
                                        value={customCaption.fontFamily || ''}
                                        onChange={(e) => updateCustom('fontFamily', e.target.value || null)}
                                        style={{
                                            width: '100%', padding: '6px 8px', borderRadius: 6,
                                            background: 'var(--bg-primary)', border: '1px solid var(--border-subtle)',
                                            color: 'var(--text-primary)', fontSize: 12,
                                        }}
                                    >
                                        <option value="">Template Default</option>
                                        {FONT_OPTIONS.map(f => (
                                            <option key={f.id} value={f.id}>{f.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Font Size */}
                                <div>
                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Font Size</span>
                                        <span style={{ color: 'var(--text-primary)' }}>{customCaption.fontSize || getEffectiveStyle().size}px</span>
                                    </label>
                                    <input
                                        type="range" min="10" max="28" step="1"
                                        value={customCaption.fontSize || getEffectiveStyle().size}
                                        onChange={(e) => updateCustom('fontSize', parseInt(e.target.value))}
                                        style={{ width: '100%', accentColor: 'var(--accent-purple)' }}
                                    />
                                </div>

                                {/* Font Weight */}
                                <div>
                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Font Weight</span>
                                        <span style={{ color: 'var(--text-primary)' }}>{customCaption.fontWeight || getEffectiveStyle().weight}</span>
                                    </label>
                                    <input
                                        type="range" min="300" max="900" step="100"
                                        value={customCaption.fontWeight || getEffectiveStyle().weight}
                                        onChange={(e) => updateCustom('fontWeight', parseInt(e.target.value))}
                                        style={{ width: '100%', accentColor: 'var(--accent-purple)' }}
                                    />
                                </div>

                                {/* Colors */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    <div>
                                        <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Text Color</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <input
                                                type="color"
                                                value={customCaption.textColor || '#ffffff'}
                                                onChange={(e) => updateCustom('textColor', e.target.value)}
                                                style={{ width: 28, height: 28, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'none' }}
                                            />
                                            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                {(customCaption.textColor || '#ffffff').toUpperCase()}
                                            </span>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Highlight</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <input
                                                type="color"
                                                value={customCaption.highlightColor || '#ffd700'}
                                                onChange={(e) => updateCustom('highlightColor', e.target.value)}
                                                style={{ width: 28, height: 28, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'none' }}
                                            />
                                            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                {(customCaption.highlightColor || '#ffd700').toUpperCase()}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Toggles row */}
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    <button
                                        className={`btn btn-sm ${getEffectiveStyle().outline ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => updateCustom('outline', !getEffectiveStyle().outline)}
                                        style={{ fontSize: 11, padding: '4px 10px' }}
                                    >
                                        Outline
                                    </button>
                                    <button
                                        className={`btn btn-sm ${getEffectiveStyle().italic ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => updateCustom('italic', !getEffectiveStyle().italic)}
                                        style={{ fontSize: 11, padding: '4px 10px', fontStyle: 'italic' }}
                                    >
                                        Italic
                                    </button>
                                    {['none', 'uppercase', 'lowercase'].map(t => (
                                        <button
                                            key={t}
                                            className={`btn btn-sm ${getEffectiveStyle().transform === t ? 'btn-primary' : 'btn-ghost'}`}
                                            onClick={() => updateCustom('textTransform', t)}
                                            style={{ fontSize: 11, padding: '4px 8px', textTransform: t === 'none' ? 'none' : t }}
                                        >
                                            {t === 'none' ? 'Aa' : t === 'uppercase' ? 'AB' : 'ab'}
                                        </button>
                                    ))}
                                </div>

                                {/* Position */}
                                <div>
                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Position</label>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {['top', 'center', 'bottom'].map(pos => (
                                            <button
                                                key={pos}
                                                className={`btn btn-sm ${customCaption.position === pos ? 'btn-primary' : 'btn-ghost'}`}
                                                onClick={() => updateCustom('position', pos)}
                                                style={{ flex: 1, fontSize: 11, padding: '4px 0', textTransform: 'capitalize' }}
                                            >
                                                {pos}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* BG Opacity */}
                                <div>
                                    <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Background Opacity</span>
                                        <span style={{ color: 'var(--text-primary)' }}>{Math.round((customCaption.bgOpacity ?? 0.6) * 100)}%</span>
                                    </label>
                                    <input
                                        type="range" min="0" max="1" step="0.05"
                                        value={customCaption.bgOpacity ?? 0.6}
                                        onChange={(e) => updateCustom('bgOpacity', parseFloat(e.target.value))}
                                        style={{ width: '100%', accentColor: 'var(--accent-purple)' }}
                                    />
                                </div>

                                {/* Reset */}
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => {
                                        const reset = { ...DEFAULT_CUSTOM };
                                        setCustomCaption(reset);
                                        if (customSaveTimer.current) clearTimeout(customSaveTimer.current);
                                        fetch(`${API}/projects/clips/${clipId}`, {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ caption_settings: JSON.stringify(reset) })
                                        }).catch(console.error);
                                    }}
                                    style={{ fontSize: 11, gap: 4, alignSelf: 'flex-start' }}
                                >
                                    <RefreshCw size={12} /> Reset to Template
                                </button>
                            </motion.div>
                        )}
                    </motion.div>

                    {/* Hook Title Editor */}
                    <motion.div className="card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 }}>
                        <div className="card-title" style={{ marginBottom: 12, fontSize: 14 }}>
                            <Zap size={14} /> Hook Title Overlay
                        </div>

                        {/* Hook text input */}
                        <div style={{ marginBottom: 12 }}>
                            <label className="form-label" style={{ fontSize: 11 }}>Hook Text</label>
                            <textarea
                                value={hookText}
                                onChange={(e) => {
                                    setHookText(e.target.value);
                                    setHasChanges(true);
                                }}
                                placeholder="INI DIA RAHASIA SUKSES!"
                                rows={2}
                                style={{
                                    width: '100%', padding: '8px 10px', borderRadius: 6,
                                    border: '1px solid var(--border)', background: 'var(--bg-primary)',
                                    color: 'var(--text-primary)', fontSize: 13, resize: 'vertical',
                                    fontWeight: 700, textTransform: 'uppercase'
                                }}
                            />
                        </div>

                        {/* Live preview */}
                        {hookText && (
                            <div style={{
                                marginBottom: 12, padding: '10px 16px', borderRadius: 8,
                                background: hookSettings.bgColor || '#FF0000',
                                opacity: parseFloat(hookSettings.bgOpacity || 0.85),
                                textAlign: 'center'
                            }}>
                                <span style={{
                                    color: hookSettings.textColor || '#FFFFFF',
                                    fontWeight: 800, fontSize: hookSettings.fontSize ? hookSettings.fontSize / 3 : 16,
                                    textTransform: 'uppercase', letterSpacing: 1, lineHeight: 1.3,
                                    display: 'block'
                                }}>
                                    {hookText}
                                </span>
                            </div>
                        )}

                        {/* Duration */}
                        <div style={{ marginBottom: 10 }}>
                            <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Duration</label>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {[
                                    { value: 3, label: '3s' },
                                    { value: 5, label: '5s' },
                                    { value: 0, label: '∞ Permanent' }
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        className={`btn btn-sm ${hookSettings.duration === opt.value ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => {
                                            setHookSettings(prev => ({ ...prev, duration: opt.value }));
                                            setHasChanges(true);
                                        }}
                                        style={{ flex: 1, fontSize: 11, padding: '4px 0' }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Position */}
                        <div style={{ marginBottom: 10 }}>
                            <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Position</label>
                            <div style={{ display: 'flex', gap: 4 }}>
                                {['top', 'bottom'].map(pos => (
                                    <button
                                        key={pos}
                                        className={`btn btn-sm ${hookSettings.position === pos ? 'btn-primary' : 'btn-ghost'}`}
                                        onClick={() => {
                                            setHookSettings(prev => ({ ...prev, position: pos }));
                                            setHasChanges(true);
                                        }}
                                        style={{ flex: 1, fontSize: 11, padding: '4px 0', textTransform: 'capitalize' }}
                                    >
                                        {pos === 'top' ? '⬆ Top' : '⬇ Bottom'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Font Size */}
                        <div style={{ marginBottom: 10 }}>
                            <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span>Font Size</span>
                                <span style={{ color: 'var(--text-primary)' }}>{hookSettings.fontSize}px</span>
                            </label>
                            <input
                                type="range" min="24" max="80" step="2"
                                value={hookSettings.fontSize}
                                onChange={(e) => {
                                    setHookSettings(prev => ({ ...prev, fontSize: parseInt(e.target.value) }));
                                    setHasChanges(true);
                                }}
                                style={{ width: '100%', accentColor: 'var(--accent-purple)' }}
                            />
                        </div>

                        {/* Colors */}
                        <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Text Color</label>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {['#FFFFFF', '#FFFF00', '#000000'].map(c => (
                                        <div
                                            key={c}
                                            onClick={() => {
                                                setHookSettings(prev => ({ ...prev, textColor: c }));
                                                setHasChanges(true);
                                            }}
                                            style={{
                                                width: 24, height: 24, borderRadius: 4, cursor: 'pointer',
                                                background: c, border: hookSettings.textColor === c ? '2px solid var(--accent-purple)' : '1px solid var(--border)'
                                            }}
                                        />
                                    ))}
                                    <input
                                        type="color" value={hookSettings.textColor}
                                        onChange={(e) => {
                                            setHookSettings(prev => ({ ...prev, textColor: e.target.value }));
                                            setHasChanges(true);
                                        }}
                                        style={{ width: 24, height: 24, border: 'none', padding: 0, cursor: 'pointer' }}
                                    />
                                </div>
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Box Color</label>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                    {['#FF0000', '#FFFF00', '#000000', '#7c3aed'].map(c => (
                                        <div
                                            key={c}
                                            onClick={() => {
                                                setHookSettings(prev => ({ ...prev, bgColor: c }));
                                                setHasChanges(true);
                                            }}
                                            style={{
                                                width: 24, height: 24, borderRadius: 4, cursor: 'pointer',
                                                background: c, border: hookSettings.bgColor === c ? '2px solid var(--accent-purple)' : '1px solid var(--border)'
                                            }}
                                        />
                                    ))}
                                    <input
                                        type="color" value={hookSettings.bgColor}
                                        onChange={(e) => {
                                            setHookSettings(prev => ({ ...prev, bgColor: e.target.value }));
                                            setHasChanges(true);
                                        }}
                                        style={{ width: 24, height: 24, border: 'none', padding: 0, cursor: 'pointer' }}
                                    />
                                </div>
                            </div>
                        </div>

                        {hookText && (
                            <div className="text-sm text-muted" style={{ fontSize: 10, marginTop: 4 }}>
                                💡 Hook title will appear {hookSettings.duration > 0 ? `for ${hookSettings.duration}s` : 'permanently'} at {hookSettings.position} of video
                            </div>
                        )}
                    </motion.div>

                    {/* Caption Editor */}
                    <motion.div className="card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
                        <div className="card-title" style={{ marginBottom: 10, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <MessageCircle size={14} /> Caption Editor
                            </div>
                            {savingSegments && <Loader size={13} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-cyan)' }} />}
                        </div>
                        {(() => {
                            // Filter segments that overlap this clip's time range
                            const clipStart = clip?.start_time || 0;
                            const clipEnd = clip?.end_time || Infinity;
                            const clipSegs = segments
                                .map((seg, idx) => ({ ...seg, _idx: idx }))
                                .filter(s => s.end > clipStart && s.start < clipEnd);

                            if (clipSegs.length === 0) {
                                return (
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
                                        No captions available for this clip.
                                    </div>
                                );
                            }

                            // Format time helper
                            const fmt = (t) => {
                                const m = Math.floor(t / 60);
                                const s = Math.floor(t % 60);
                                return `${m}:${String(s).padStart(2, '0')}`;
                            };

                            const saveSegments = (updatedSegs) => {
                                if (segSaveTimer.current) clearTimeout(segSaveTimer.current);
                                segSaveTimer.current = setTimeout(async () => {
                                    setSavingSegments(true);
                                    try {
                                        await fetch(`${API}/projects/${projectId}/transcript`, {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ segment_data: updatedSegs })
                                        });
                                    } catch (err) {
                                        console.error('Save segments error:', err);
                                    } finally {
                                        setSavingSegments(false);
                                    }
                                }, 800);
                            };

                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
                                    {clipSegs.map((seg) => {
                                        const isActive = currentTime >= seg.start && currentTime < seg.end;
                                        const isEditing = editingSegIdx === seg._idx;
                                        const isTimingExpanded = expandedTimingIdx === seg._idx;

                                        // Compute word timings for this segment
                                        const getSegWordTimings = () => {
                                            if (wordTimings[seg._idx]) return wordTimings[seg._idx];
                                            const words = seg.text.trim().split(/\s+/).filter(Boolean);
                                            if (words.length === 0) return [];
                                            const segDur = seg.end - seg.start;
                                            const wordDur = segDur / words.length;
                                            return words.map((w, i) => ({
                                                word: w,
                                                start: +(seg.start + i * wordDur).toFixed(2),
                                                end: +(seg.start + (i + 1) * wordDur).toFixed(2),
                                            }));
                                        };

                                        return (
                                            <div key={seg._idx} style={{ display: 'flex', flexDirection: 'column' }}>
                                                <div
                                                    style={{
                                                        display: 'flex', gap: 8, padding: '6px 8px',
                                                        borderRadius: 6, cursor: 'pointer',
                                                        background: isActive ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                                                        border: isActive ? '1px solid rgba(124, 58, 237, 0.3)' : '1px solid transparent',
                                                        transition: 'all 0.15s',
                                                    }}
                                                    onClick={() => {
                                                        if (videoRef.current) videoRef.current.currentTime = seg.start;
                                                    }}
                                                >
                                                    {/* Timestamp */}
                                                    <div style={{
                                                        fontSize: 10, color: isActive ? 'var(--accent-purple)' : 'var(--text-muted)',
                                                        fontFamily: 'monospace', minWidth: 42, paddingTop: 2, flexShrink: 0,
                                                        fontWeight: isActive ? 600 : 400,
                                                    }}>
                                                        {fmt(seg.start)}
                                                    </div>

                                                    {/* Text */}
                                                    {isEditing ? (
                                                        <textarea
                                                            autoFocus
                                                            value={seg.text}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onChange={(e) => {
                                                                const updated = [...segments];
                                                                updated[seg._idx] = { ...updated[seg._idx], text: e.target.value };
                                                                setSegments(updated);
                                                                saveSegments(updated);
                                                                // Clear cached word timings for this segment
                                                                setWordTimings(prev => { const n = { ...prev }; delete n[seg._idx]; return n; });
                                                            }}
                                                            onBlur={() => setEditingSegIdx(null)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Escape') setEditingSegIdx(null);
                                                            }}
                                                            style={{
                                                                flex: 1, fontSize: 12, lineHeight: 1.5,
                                                                background: 'var(--bg-primary)', color: 'var(--text-primary)',
                                                                border: '1px solid var(--accent-purple)',
                                                                borderRadius: 4, padding: '3px 6px',
                                                                resize: 'vertical', minHeight: 36, fontFamily: 'inherit',
                                                            }}
                                                        />
                                                    ) : (
                                                        <div
                                                            style={{
                                                                flex: 1, fontSize: 12, lineHeight: 1.5,
                                                                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                                                                wordBreak: 'break-word',
                                                            }}
                                                            onDoubleClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingSegIdx(seg._idx);
                                                            }}
                                                            title="Double-click to edit"
                                                        >
                                                            {seg.text}
                                                        </div>
                                                    )}

                                                    {/* Word timing toggle */}
                                                    <button
                                                        className={`btn btn-ghost btn-sm`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setExpandedTimingIdx(isTimingExpanded ? null : seg._idx);
                                                        }}
                                                        title="Word timing"
                                                        style={{ padding: '2px 4px', opacity: isTimingExpanded ? 1 : 0.4, flexShrink: 0, color: isTimingExpanded ? 'var(--accent-cyan)' : undefined }}
                                                    >
                                                        <Clock size={12} />
                                                    </button>

                                                    {/* Edit button */}
                                                    {!isEditing && (
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingSegIdx(seg._idx);
                                                            }}
                                                            title="Edit caption"
                                                            style={{ padding: '2px 4px', opacity: 0.5, flexShrink: 0 }}
                                                        >
                                                            <Type size={12} />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Word-level timing editor */}
                                                {isTimingExpanded && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        style={{
                                                            marginLeft: 50, marginTop: 2, marginBottom: 4, padding: '6px 8px',
                                                            background: 'var(--bg-primary)', borderRadius: 6,
                                                            border: '1px solid var(--border-subtle)',
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                                            <Clock size={10} /> Word Timing — {fmt(seg.start)} → {fmt(seg.end)}
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                            {getSegWordTimings().map((wt, wi) => {
                                                                const isWordActive = currentTime >= wt.start && currentTime < wt.end;
                                                                return (
                                                                    <div key={wi} style={{
                                                                        display: 'flex', alignItems: 'center', gap: 6,
                                                                        padding: '2px 4px', borderRadius: 4,
                                                                        background: isWordActive ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
                                                                    }}>
                                                                        <span
                                                                            style={{
                                                                                fontSize: 11, minWidth: 60, fontWeight: isWordActive ? 600 : 400,
                                                                                color: isWordActive ? 'var(--accent-cyan)' : 'var(--text-primary)',
                                                                                cursor: 'pointer',
                                                                            }}
                                                                            onClick={() => { if (videoRef.current) videoRef.current.currentTime = wt.start; }}
                                                                        >
                                                                            {wt.word}
                                                                        </span>
                                                                        <input
                                                                            type="number"
                                                                            step="0.05"
                                                                            value={wt.start}
                                                                            onChange={(e) => {
                                                                                const val = parseFloat(e.target.value);
                                                                                if (isNaN(val)) return;
                                                                                const wts = [...getSegWordTimings()];
                                                                                wts[wi] = { ...wts[wi], start: val };
                                                                                // Ensure previous word end matches
                                                                                if (wi > 0) wts[wi - 1] = { ...wts[wi - 1], end: val };
                                                                                setWordTimings(prev => ({ ...prev, [seg._idx]: wts }));
                                                                            }}
                                                                            style={{
                                                                                width: 58, fontSize: 10, padding: '2px 4px',
                                                                                background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                                                                                border: '1px solid var(--border-subtle)', borderRadius: 3,
                                                                                fontFamily: 'monospace', textAlign: 'center',
                                                                            }}
                                                                        />
                                                                        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>→</span>
                                                                        <input
                                                                            type="number"
                                                                            step="0.05"
                                                                            value={wt.end}
                                                                            onChange={(e) => {
                                                                                const val = parseFloat(e.target.value);
                                                                                if (isNaN(val)) return;
                                                                                const wts = [...getSegWordTimings()];
                                                                                wts[wi] = { ...wts[wi], end: val };
                                                                                // Ensure next word start matches
                                                                                if (wi < wts.length - 1) wts[wi + 1] = { ...wts[wi + 1], start: val };
                                                                                setWordTimings(prev => ({ ...prev, [seg._idx]: wts }));
                                                                            }}
                                                                            style={{
                                                                                width: 58, fontSize: 10, padding: '2px 4px',
                                                                                background: 'var(--bg-secondary)', color: 'var(--text-secondary)',
                                                                                border: '1px solid var(--border-subtle)', borderRadius: 3,
                                                                                fontFamily: 'monospace', textAlign: 'center',
                                                                            }}
                                                                        />
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                                            <button
                                                                className="btn btn-ghost btn-sm"
                                                                onClick={() => {
                                                                    // Reset to even distribution
                                                                    setWordTimings(prev => { const n = { ...prev }; delete n[seg._idx]; return n; });
                                                                }}
                                                                style={{ fontSize: 10, padding: '2px 8px', gap: 3 }}
                                                            >
                                                                <RefreshCw size={10} /> Even
                                                            </button>
                                                            <button
                                                                className="btn btn-primary btn-sm"
                                                                onClick={() => {
                                                                    // Save word timings back into segment (update segment start/end and store word_timings)
                                                                    const wts = getSegWordTimings();
                                                                    const updated = [...segments];
                                                                    updated[seg._idx] = {
                                                                        ...updated[seg._idx],
                                                                        word_timings: wts,
                                                                    };
                                                                    setSegments(updated);
                                                                    saveSegments(updated);
                                                                    setExpandedTimingIdx(null);
                                                                }}
                                                                style={{ fontSize: 10, padding: '2px 8px', gap: 3 }}
                                                            >
                                                                <Save size={10} /> Apply
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
                            Click to seek • Double-click or ✏️ to edit
                        </div>
                    </motion.div>

                    {/* Clip list (sidebar nav) */}
                    <motion.div className="card" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                        <div className="card-title" style={{ marginBottom: 12, fontSize: 14 }}>
                            <Scissors size={14} /> All Clips ({allClips.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                            {allClips.map((c, i) => (
                                <Link
                                    key={c.id}
                                    to={`/projects/${projectId}/clips/${c.id}`}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                                        borderRadius: 8, textDecoration: 'none', color: 'inherit',
                                        background: c.id === clipId ? 'rgba(139,92,246,0.15)' : 'var(--bg-primary)',
                                        border: c.id === clipId ? '1px solid rgba(139,92,246,0.3)' : '1px solid transparent',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <span style={{
                                        width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 11, fontWeight: 700, flexShrink: 0,
                                        background: c.id === clipId ? 'var(--accent-purple)' : 'var(--bg-tertiary)',
                                        color: c.id === clipId ? '#fff' : 'var(--text-muted)'
                                    }}>
                                        {c.clip_number}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div className="text-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: c.id === clipId ? 600 : 400 }}>
                                            {c.title || `Clip ${c.clip_number}`}
                                        </div>
                                        <div className="text-sm text-muted" style={{ fontSize: 11 }}>
                                            {formatTime(c.start_time)} → {formatTime(c.end_time)}
                                        </div>
                                    </div>
                                    <ScoreBadge score={c.virality_score} size="sm" />
                                </Link>
                            ))}
                        </div>
                    </motion.div>
                </div>
            </div>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>

            {/* Music Selector Modal */}
            {showMusicSelector && (
                <MusicSelector
                    clipId={clipId}
                    currentTrackId={clip?.music_track_id}
                    currentVolume={clip?.music_volume || 20}
                    onClose={() => setShowMusicSelector(false)}
                    onSelect={async (trackId, vol) => {
                        try {
                            await fetch(`${API}/projects/${projectId}/clips/${clipId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ music_track_id: trackId, music_volume: vol })
                            });
                            // Fetch track name
                            if (trackId) {
                                const res = await fetch(`${API}/music`);
                                const tracks = await res.json();
                                const t = tracks.find(tr => tr.id === trackId);
                                setMusicTrackName(t?.name || 'Music');
                            } else {
                                setMusicTrackName(null);
                            }
                            setClip(prev => ({ ...prev, music_track_id: trackId, music_volume: vol }));
                            setShowMusicSelector(false);
                        } catch (err) {
                            console.error('Failed to set music:', err);
                        }
                    }}
                />
            )}

            {/* SFX Selector Modal */}
            {showSfxSelector && (
                <SfxSelector
                    clipId={clipId}
                    clipDuration={trimEnd - trimStart}
                    onClose={() => setShowSfxSelector(false)}
                    onUpdate={async () => {
                        try {
                            const res = await fetch(`${API}/sfx/clip/${clipId}`);
                            const data = await res.json();
                            setSfxCount(data.length);
                        } catch (e) { }
                    }}
                />
            )}
        </>
    );
}
