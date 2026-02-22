import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Film, Clock, Monitor, HardDrive, Scissors, Play, Trash2, Download, RefreshCw, Settings, Loader, CheckCircle, AlertCircle, Zap, Hash, Trophy, MessageCircle, Share2, ThumbsUp, Lightbulb, Square, CheckSquare, Terminal, ChevronDown, ChevronUp, Copy, StopCircle, Edit3, Save, Upload, FileText, X, Youtube, Eye, FolderOpen, Type, Sparkles } from 'lucide-react';
import { io as socketIO } from 'socket.io-client';

const API = 'http://localhost:5000/api';

const CAPTION_STYLES = [
    { id: 'hormozi', name: 'Hormozi', emoji: '🟡' },
    { id: 'bold_impact', name: 'Bold Impact', emoji: '⚡' },
    { id: 'minimal_clean', name: 'Minimal Clean', emoji: '📝' },
    { id: 'karaoke_pop', name: 'Karaoke Pop', emoji: '🎤' },
    { id: 'ali_abdaal', name: 'Ali Abdaal', emoji: '📘' },
    { id: 'gaming', name: 'Gaming', emoji: '🎮' },
    { id: 'cinema', name: 'Cinema', emoji: '🎬' },
    { id: 'tiktok_og', name: 'TikTok OG', emoji: '📱' },
];

function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const statusConfig = {
    uploaded: { label: 'Uploaded', cls: 'badge-info', color: '#06b6d4' },
    transcribing: { label: 'Transcribing...', cls: 'badge-warning', color: '#f59e0b' },
    analyzing: { label: 'Analyzing...', cls: 'badge-warning', color: '#f59e0b' },
    clipping: { label: 'Generating Clips...', cls: 'badge-warning', color: '#f59e0b' },
    completed: { label: 'Completed', cls: 'badge-success', color: '#10b981' },
    failed: { label: 'Failed', cls: 'badge-error', color: '#ef4444' },
    cancelled: { label: 'Cancelled', cls: 'badge-warning', color: '#f59e0b' },
};

function ScoreBadge({ score, label, icon: Icon }) {
    const color = score >= 80 ? '#10b981' : score >= 60 ? '#06b6d4' : score >= 40 ? '#f59e0b' : '#ef4444';
    return (
        <div style={{ textAlign: 'center' }}>
            <div style={{
                width: 42, height: 42, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `${color}15`, border: `2px solid ${color}40`, fontFamily: 'Outfit', fontWeight: 700, fontSize: 15, color, margin: '0 auto 4px'
            }}>
                {score}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
        </div>
    );
}

export default function ProjectDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [clips, setClips] = useState([]);
    const [transcript, setTranscript] = useState(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [processStep, setProcessStep] = useState('');
    const [processProgress, setProcessProgress] = useState(0);
    const [processMessage, setProcessMessage] = useState('');
    const [expandedClip, setExpandedClip] = useState(null);
    const [rendering, setRendering] = useState({});  // { clipId: { progress, message } }
    const [renderingAll, setRenderingAll] = useState(false);
    const [selectedClips, setSelectedClips] = useState(new Set());
    const [processLogs, setProcessLogs] = useState([]);
    const [terminalCollapsed, setTerminalCollapsed] = useState(false);
    const [editingTranscript, setEditingTranscript] = useState(false);
    const [editedText, setEditedText] = useState('');
    const [savingTranscript, setSavingTranscript] = useState(false);
    const [transcriptSaveMsg, setTranscriptSaveMsg] = useState('');
    const [showPasteModal, setShowPasteModal] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const terminalBodyRef = useRef(null);
    const transcriptFileRef = useRef(null);
    const socketRef = useRef(null);
    const renderStartTimeRef = useRef(null);
    const [renderETA, setRenderETA] = useState('');
    const [showStyleMenu, setShowStyleMenu] = useState(false);
    const [bulkStyleMsg, setBulkStyleMsg] = useState('');
    const [showHookMenu, setShowHookMenu] = useState(false);
    const [bulkHookSettings, setBulkHookSettings] = useState({
        duration: 5, position: 'top', fontSize: 48,
        textColor: '#FFFFFF', bgColor: '#FF0000', bgOpacity: '0.85'
    });

    // Social Copy Generator state
    const [socialModal, setSocialModal] = useState(null); // { clipId, loading, data, error, activeTab, hookStyle }

    const hookStyles = [
        { id: 'drama', label: '🎭 Drama', desc: 'Emosional & bikin nangis' },
        { id: 'gossip', label: '🗣️ Gossip', desc: 'Viral & heboh' },
        { id: 'edukasi', label: '📚 Edukasi', desc: 'Informatif & mind-blowing' },
        { id: 'comedy', label: '😂 Comedy', desc: 'Lucu & relatable' },
        { id: 'motivasi', label: '🔥 Motivasi', desc: 'Inspiring & powerful' },
        { id: 'horror', label: '👻 Horror', desc: 'Seram & misteri' },
        { id: 'storytelling', label: '📖 Storytelling', desc: 'Narasi & kronologis' },
        { id: 'kontroversial', label: '⚡ Kontroversial', desc: 'Debat & polarisasi' },
        { id: 'clickbait', label: '🎯 Clickbait', desc: 'Aggressive CTA' },
        { id: 'aesthetic', label: '✨ Aesthetic', desc: 'Soft & poetic' }
    ];

    const generateSocialCopy = async (clipId, e, style) => {
        e?.stopPropagation();
        const hookStyle = style || socialModal?.hookStyle || 'drama';
        setSocialModal(prev => ({ ...prev, clipId, loading: true, data: null, error: null, activeTab: prev?.activeTab || 'tiktok', hookStyle }));
        try {
            const res = await fetch(`${API}/projects/clips/${clipId}/generate-social`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hook_style: hookStyle })
            });
            const result = await res.json();
            if (result.success) {
                setSocialModal(prev => ({ ...prev, loading: false, data: result.social }));
            } else {
                setSocialModal(prev => ({ ...prev, loading: false, error: result.error }));
            }
        } catch (err) {
            setSocialModal(prev => ({ ...prev, loading: false, error: err.message }));
        }
    };

    const copySocialText = (text) => {
        navigator.clipboard.writeText(text).then(() => {
            // Brief visual feedback
            const toast = document.createElement('div');
            toast.textContent = '✅ Copied!';
            toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#10b981;color:#fff;padding:8px 20px;border-radius:8px;font-size:13px;font-weight:600;z-index:99999;animation:fadeInOut 1.5s ease forwards;pointer-events:none';
            if (!document.querySelector('#copy-toast-style')) {
                const style = document.createElement('style');
                style.id = 'copy-toast-style';
                style.textContent = '@keyframes fadeInOut{0%{opacity:0;transform:translateX(-50%) translateY(10px)}15%{opacity:1;transform:translateX(-50%) translateY(0)}85%{opacity:1;transform:translateX(-50%) translateY(0)}100%{opacity:0;transform:translateX(-50%) translateY(-10px)}}';
                document.head.appendChild(style);
            }
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 1500);
        });
    };

    useEffect(() => {
        loadProject();

        // Connect socket for realtime progress
        const socket = socketIO('http://localhost:5000');
        socketRef.current = socket;

        socket.on('process:progress', (data) => {
            if (data.projectId === id) {
                setProcessStep(data.step);
                setProcessProgress(data.progress);
                setProcessMessage(data.message);

                if (data.step === 'done') {
                    setProcessing(false);
                    loadProject();
                }
                if (data.step === 'error') {
                    setProcessing(false);
                    loadProject();
                }
                if (data.step === 'cancelled') {
                    setProcessing(false);
                    setProcessStep('cancelled');
                    loadProject();
                }
            }
        });

        // Real-time log lines
        socket.on('process:log', (data) => {
            if (data.projectId === id) {
                setProcessLogs(prev => [...prev, data]);
            }
        });

        socket.on('project:updated', (data) => {
            if (data.id === id) {
                loadProject();
            }
        });

        // Clip render progress
        socket.on('clip:progress', (data) => {
            if (data.projectId === id) {
                setRendering(prev => ({ ...prev, [data.clipId]: { progress: data.progress, message: data.message } }));
            }
        });

        socket.on('clip:rendered', (data) => {
            if (data.projectId === id) {
                setRendering(prev => ({ ...prev, [data.clipId]: { progress: 100, message: 'Done!' } }));
                loadProject();
            }
        });

        socket.on('render:progress', (data) => {
            if (data.projectId === id) {
                setProcessMessage(data.message);
                setProcessProgress(data.progress);
                // ETA calculation
                if (!renderStartTimeRef.current) renderStartTimeRef.current = Date.now();
                if (data.progress > 0 && data.progress < 100) {
                    const elapsed = (Date.now() - renderStartTimeRef.current) / 1000;
                    const remaining = (elapsed / data.progress) * (100 - data.progress);
                    if (remaining > 0 && remaining < 36000) {
                        const m = Math.floor(remaining / 60);
                        const s = Math.floor(remaining % 60);
                        setRenderETA(m > 0 ? `~${m}m ${s}s remaining` : `~${s}s remaining`);
                    }
                }
            }
        });

        socket.on('render:complete', (data) => {
            if (data.projectId === id) {
                setRenderingAll(false);
                setRenderETA('');
                renderStartTimeRef.current = null;
                loadProject();
            }
        });

        return () => socket.disconnect();
    }, [id]);

    const loadProject = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/projects/${id}`);
            if (!res.ok) { navigate('/projects'); return; }
            const data = await res.json();
            setProject(data.project);
            setClips(data.clips || []);
            setTranscript(data.transcript);

            // Sync selectedClips with is_selected from database
            const dbSelected = (data.clips || []).filter(c => c.is_selected === 1).map(c => c.id);
            setSelectedClips(new Set(dbSelected));

            // Auto-detect if processing
            if (['transcribing', 'analyzing', 'clipping'].includes(data.project.status)) {
                setProcessing(true);
            }
        } catch (err) {
            console.error('Failed to load project:', err);
        } finally {
            setLoading(false);
        }
    };

    // Auto-scroll terminal to bottom when new logs arrive
    useEffect(() => {
        if (terminalBodyRef.current && !terminalCollapsed) {
            terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
        }
    }, [processLogs, terminalCollapsed]);

    const startProcessing = async () => {
        try {
            setProcessing(true);
            setProcessStep('starting');
            setProcessProgress(0);
            setProcessMessage('Starting AI pipeline...');
            setProcessLogs([]);  // Clear previous logs
            setTerminalCollapsed(false);

            const res = await fetch(`${API}/projects/${id}/process`, { method: 'POST' });
            const data = await res.json();

            if (!res.ok) {
                setProcessing(false);
                alert(`Error: ${data.error}`);
            }
        } catch (err) {
            setProcessing(false);
            alert(`Error: ${err.message}`);
        }
    };

    const cancelProcessing = async () => {
        try {
            const res = await fetch(`${API}/projects/${id}/cancel`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                alert(`Cancel error: ${data.error}`);
            }
        } catch (err) {
            alert(`Cancel error: ${err.message}`);
        }
    };

    const deleteProject = async () => {
        if (!confirm('Delete this project and all its data?')) return;
        try {
            await fetch(`${API}/projects/${id}`, { method: 'DELETE' });
            navigate('/projects');
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const renderSingleClip = async (clipId, e) => {
        e?.stopPropagation();
        setRendering(prev => ({ ...prev, [clipId]: { progress: 0, message: 'Starting...' } }));
        setProcessLogs([]);
        setTerminalCollapsed(false);
        try {
            await fetch(`${API}/projects/clips/${clipId}/render`, { method: 'POST' });
        } catch (err) {
            console.error('Render failed:', err);
        }
    };

    const renderAllClips = async () => {
        setRenderingAll(true);
        setProcessMessage('Starting render of all clips...');
        setProcessProgress(0);
        setRenderETA('');
        setProcessLogs([]);
        setTerminalCollapsed(false);
        renderStartTimeRef.current = Date.now();
        try {
            const res = await fetch(`${API}/projects/${id}/render-all`, { method: 'POST' });
            if (res.status === 403) {
                const data = await res.json();
                setRenderingAll(false);
                alert(data.error || 'Batch export tidak tersedia di Free tier.');
                return;
            }
        } catch (err) {
            setRenderingAll(false);
            console.error('Render all failed:', err);
        }
    };

    const renderSelectedClips = async () => {
        if (selectedClips.size === 0) return;
        setRenderingAll(true);
        setProcessMessage(`Rendering ${selectedClips.size} selected clips...`);
        setProcessProgress(0);
        setProcessLogs([]);
        setTerminalCollapsed(false);
        try {
            const res = await fetch(`${API}/projects/${id}/render-selected`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clipIds: [...selectedClips] })
            });
            if (res.status === 403) {
                const data = await res.json();
                setRenderingAll(false);
                alert(data.error || 'Batch export tidak tersedia di Free tier.');
                return;
            }
        } catch (err) {
            setRenderingAll(false);
            console.error('Render selected failed:', err);
        }
    };

    const downloadClip = (clipId, e) => {
        e?.stopPropagation();
        window.open(`${API}/projects/clips/${clipId}/download`, '_blank');
    };

    const openOutputFolder = async () => {
        try {
            await fetch(`${API}/projects/${id}/open-folder`, { method: 'POST' });
        } catch (err) {
            console.error('Open folder failed:', err);
        }
    };

    const copyClipPath = async (clipId, e) => {
        e?.stopPropagation();
        try {
            const res = await fetch(`${API}/projects/clips/${clipId}/path`);
            const data = await res.json();
            if (data.path) {
                await navigator.clipboard.writeText(data.path);
                setRendering(prev => ({ ...prev, [clipId]: { ...prev[clipId], message: '📋 Path copied!' } }));
                setTimeout(() => {
                    setRendering(prev => ({ ...prev, [clipId]: { ...prev[clipId], message: '' } }));
                }, 2000);
            }
        } catch (err) {
            console.error('Copy path failed:', err);
        }
    };

    const deleteClip = async (clipId, clipTitle, e) => {
        e?.stopPropagation();
        if (!confirm(`Delete clip "${clipTitle || 'Untitled'}"? This cannot be undone.`)) return;
        try {
            const res = await fetch(`${API}/projects/clips/${clipId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            loadProject();
        } catch (err) {
            console.error('Delete clip error:', err);
        }
    };

    const toggleClipSelection = (clipId, e) => {
        e.stopPropagation();
        setSelectedClips(prev => {
            const next = new Set(prev);
            const newState = !next.has(clipId);
            if (newState) next.add(clipId);
            else next.delete(clipId);
            // Persist to database
            fetch(`${API}/projects/${id}/clips/${clipId}/select`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_selected: newState ? 1 : 0 })
            }).catch(() => { });
            return next;
        });
    };

    const selectAllClips = () => {
        setSelectedClips(new Set(clips.map(c => c.id)));
        fetch(`${API}/projects/${id}/clips/select-all`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_selected: 1 })
        }).catch(() => { });
    };
    const selectNoneClips = () => {
        setSelectedClips(new Set());
        fetch(`${API}/projects/${id}/clips/select-all`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_selected: 0 })
        }).catch(() => { });
    };

    const copyLogs = () => {
        const text = processLogs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
        navigator.clipboard.writeText(text);
    };

    const getLogPrefix = (type) => {
        switch (type) {
            case 'success': return '✓';
            case 'warn': return '⚠';
            case 'error': return '✗';
            default: return '›';
        }
    };

    const isSection = (msg) => msg.includes('──');

    const startEditTranscript = () => {
        setEditedText(transcript?.full_text || '');
        setEditingTranscript(true);
        setTranscriptSaveMsg('');
    };

    const cancelEditTranscript = () => {
        setEditingTranscript(false);
        setEditedText('');
        setTranscriptSaveMsg('');
    };

    const saveTranscript = async () => {
        try {
            setSavingTranscript(true);
            setTranscriptSaveMsg('');
            const res = await fetch(`${API}/projects/${id}/transcript`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ full_text: editedText })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setTranscript(data.transcript);
            setEditingTranscript(false);
            setTranscriptSaveMsg('Saved!');
            setTimeout(() => setTranscriptSaveMsg(''), 2000);
        } catch (err) {
            setTranscriptSaveMsg(`Error: ${err.message}`);
        } finally {
            setSavingTranscript(false);
        }
    };

    const importTranscriptFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = ''; // Reset input

        const formData = new FormData();
        formData.append('file', file);

        try {
            setSavingTranscript(true);
            setTranscriptSaveMsg('');
            const res = await fetch(`${API}/projects/${id}/transcript/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setTranscript(data.transcript);
            setEditingTranscript(false);
            setTranscriptSaveMsg(`Imported! ${data.stats.chars} chars, ${data.stats.segments} segments`);
            setTimeout(() => setTranscriptSaveMsg(''), 4000);
            loadProject(); // Refresh project data
        } catch (err) {
            setTranscriptSaveMsg(`Import error: ${err.message}`);
        } finally {
            setSavingTranscript(false);
        }
    };

    const pasteTranscript = async () => {
        if (!pasteText.trim()) return;
        try {
            setSavingTranscript(true);
            setTranscriptSaveMsg('Parsing pasted transcript...');
            const res = await fetch(`${API}/projects/${id}/transcript/paste`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: pasteText, language: 'id' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setTranscript(data.transcript);
            setShowPasteModal(false);
            setPasteText('');
            setEditingTranscript(false);
            const segInfo = data.stats.hasTimestamps ? `${data.stats.segments} timed segments` : 'plain text';
            setTranscriptSaveMsg(`Pasted! ${data.stats.chars} chars, ${segInfo}`);
            setTimeout(() => setTranscriptSaveMsg(''), 4000);
            loadProject();
        } catch (err) {
            setTranscriptSaveMsg(`Paste error: ${err.message}`);
        } finally {
            setSavingTranscript(false);
        }
    };

    const importYoutubeCaptions = async () => {
        if (!project?.source_url) return;
        try {
            setSavingTranscript(true);
            setTranscriptSaveMsg('Fetching YouTube captions...');

            // First, list available captions
            const listRes = await fetch(`${API}/projects/${id}/captions`);
            const listData = await listRes.json();
            if (!listRes.ok) throw new Error(listData.error);

            if (listData.captions.length === 0) {
                throw new Error('No captions available for this YouTube video');
            }

            // Pick best language: prefer manual over auto, prefer project language
            const projLang = project.language === 'auto' ? 'id' : project.language;
            const manual = listData.captions.filter(c => c.type === 'manual');
            const auto = listData.captions.filter(c => c.type === 'auto');

            let selectedLang = 'en';
            const allCaptions = [...manual, ...auto];
            const match = allCaptions.find(c => c.language === projLang)
                || manual.find(c => c.language === 'en')
                || manual[0]
                || auto.find(c => c.language === projLang)
                || auto.find(c => c.language === 'en')
                || auto[0];

            if (match) selectedLang = match.language;

            setTranscriptSaveMsg(`Downloading ${selectedLang} captions...`);

            // Import captions
            const importRes = await fetch(`${API}/projects/${id}/captions/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language: selectedLang })
            });
            const importData = await importRes.json();
            if (!importRes.ok) throw new Error(importData.error);

            setTranscript(importData.transcript);
            setEditingTranscript(false);
            setTranscriptSaveMsg(`YT captions imported! ${importData.stats.chars} chars, ${importData.stats.segments} segments (${importData.stats.provider})`);
            setTimeout(() => setTranscriptSaveMsg(''), 5000);
            loadProject();
        } catch (err) {
            setTranscriptSaveMsg(`YT captions error: ${err.message}`);
        } finally {
            setSavingTranscript(false);
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Loader size={32} style={{ color: 'var(--accent-primary)', animation: 'spin 1s linear infinite' }} />
            </div>
        );
    }

    if (!project) return null;

    const st = statusConfig[project.status] || statusConfig.uploaded;
    const canProcess = ['uploaded', 'completed', 'failed', 'cancelled'].includes(project.status) && !processing;

    return (
        <>
            <div className="page-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                    <button className="btn btn-ghost btn-icon" onClick={() => navigate('/projects')}>
                        <ArrowLeft size={20} />
                    </button>
                    <div style={{ flex: 1 }}>
                        <motion.h1 initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} style={{ fontSize: 22 }}>
                            {project.name}
                        </motion.h1>
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                            Created {formatDate(project.created_at)}
                        </motion.p>
                    </div>
                    <span className={`badge ${st.cls}`} style={{ fontSize: 12, padding: '4px 12px' }}>{st.label}</span>
                    <button className="btn btn-ghost btn-icon" onClick={deleteProject} title="Delete" style={{ color: 'var(--color-error)' }}>
                        <Trash2 size={18} />
                    </button>
                </div>
            </div>

            <div className="page-body">
                {/* Video info + thumbnail */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, marginBottom: 24 }}>
                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            {project.thumbnail_path ? (
                                <img src={`http://localhost:5000/data/${project.thumbnail_path}`} alt={project.name}
                                    style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }} />
                            ) : (
                                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)' }}>
                                    <Film size={40} style={{ color: 'var(--text-muted)' }} />
                                </div>
                            )}
                        </div>
                        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                            <div className="stat-card"><div className="stat-icon purple"><Clock size={22} /></div><div><div className="stat-value" style={{ fontSize: 22 }}>{formatDuration(project.duration)}</div><div className="stat-label">Duration</div></div></div>
                            <div className="stat-card"><div className="stat-icon cyan"><Monitor size={22} /></div><div><div className="stat-value" style={{ fontSize: 22 }}>{project.width}×{project.height}</div><div className="stat-label">Resolution</div></div></div>
                            <div className="stat-card"><div className="stat-icon green"><HardDrive size={22} /></div><div><div className="stat-value" style={{ fontSize: 22 }}>{formatSize(project.file_size)}</div><div className="stat-label">File Size</div></div></div>
                            <div className="stat-card"><div className="stat-icon amber"><Scissors size={22} /></div><div><div className="stat-value" style={{ fontSize: 22 }}>{clips.length}</div><div className="stat-label">Clips</div></div></div>
                        </div>
                    </div>
                </motion.div>

                {/* Processing Terminal */}
                {(processing || renderingAll || processLogs.length > 0) && (
                    <motion.div className="process-terminal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        {/* Terminal Header */}
                        <div className="process-terminal-header">
                            <div className="process-terminal-header-left">
                                <div className="process-terminal-dots">
                                    <span /><span /><span />
                                </div>
                                <Terminal size={14} style={{ color: 'var(--accent-primary)' }} />
                                <span className="process-terminal-title">Processing Pipeline</span>
                            </div>
                            <div className="process-terminal-header-right">
                                {processing ? (
                                    <span className="process-terminal-badge running">RUNNING</span>
                                ) : processStep === 'done' ? (
                                    <span className="process-terminal-badge done">COMPLETE</span>
                                ) : processStep === 'error' ? (
                                    <span className="process-terminal-badge error">FAILED</span>
                                ) : processStep === 'cancelled' ? (
                                    <span className="process-terminal-badge error">CANCELLED</span>
                                ) : null}
                                {processing && (
                                    <button className="process-terminal-toggle" onClick={cancelProcessing} title="Cancel processing"
                                        style={{ color: 'var(--color-error)' }}>
                                        <StopCircle size={16} />
                                    </button>
                                )}
                                <button className="process-terminal-toggle" onClick={copyLogs} title="Copy logs">
                                    <Copy size={14} />
                                </button>
                                <button className="process-terminal-toggle" onClick={() => setTerminalCollapsed(!terminalCollapsed)} title={terminalCollapsed ? 'Expand' : 'Collapse'}>
                                    {terminalCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Terminal Body */}
                        <div className={`process-terminal-body ${terminalCollapsed ? 'collapsed' : ''}`} ref={terminalBodyRef}>
                            {processLogs.map((log, i) => (
                                <div key={i} className={`process-terminal-line log-${log.type} ${isSection(log.message) ? 'log-section' : ''}`}>
                                    <span className="log-time">{(log.timestamp || new Date().toTimeString()).substring(0, 8)}</span>
                                    <span className="log-prefix">{getLogPrefix(log.type)}</span>
                                    <span className="log-message">{log.message}</span>
                                </div>
                            ))}
                            {(processing || renderingAll) && <span className="process-terminal-cursor" />}
                        </div>

                        {/* Progress bar inside terminal */}
                        {(processing || processProgress > 0) && (
                            <div className="process-terminal-progress">
                                <div className="progress-bar">
                                    <div className="progress-fill" style={{ width: `${processProgress}%` }} />
                                </div>
                                <span className="progress-label">{processProgress}%</span>
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Error message */}
                {project.status === 'failed' && project.error_message && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card" style={{ marginBottom: 24, borderColor: 'rgba(239,68,68,0.3)' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <AlertCircle size={20} style={{ color: 'var(--color-error)', flexShrink: 0, marginTop: 2 }} />
                            <div>
                                <div className="font-semibold" style={{ color: 'var(--color-error)', marginBottom: 4 }}>Processing Failed</div>
                                <div className="text-sm text-muted">{project.error_message}</div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Settings */}
                <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} style={{ marginBottom: 24 }}>
                    <div className="card-header">
                        <div className="card-title"><Settings size={18} style={{ marginRight: 8 }} /> Processing Settings</div>
                        {canProcess && (
                            <button className="btn btn-primary btn-sm" onClick={startProcessing}>
                                <Zap size={14} /> {project.status === 'uploaded' ? 'Process Video' : 'Re-process'}
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                        <div><div className="form-label" style={{ marginBottom: 2 }}>Platform</div><div className="font-semibold" style={{ textTransform: 'capitalize' }}>{project.platform}</div></div>
                        <div><div className="form-label" style={{ marginBottom: 2 }}>Reframing</div><div className="font-semibold" style={{ textTransform: 'capitalize' }}>{project.reframing_mode?.replace('_', ' ')}</div></div>
                        <div><div className="form-label" style={{ marginBottom: 2 }}>Language</div><div className="font-semibold" style={{ textTransform: 'capitalize' }}>{project.language === 'auto' ? 'Auto-detect' : project.language}</div></div>
                        <div><div className="form-label" style={{ marginBottom: 2 }}>Clip Count</div><div className="font-semibold" style={{ textTransform: 'capitalize' }}>{project.clip_count_target}</div></div>
                        <div><div className="form-label" style={{ marginBottom: 2 }}>Duration Range</div><div className="font-semibold">{project.min_duration}s – {project.max_duration}s</div></div>
                        <div><div className="form-label" style={{ marginBottom: 2 }}>FPS</div><div className="font-semibold">{project.fps ? Math.round(project.fps) : '—'}</div></div>
                    </div>
                </motion.div>

                {/* Transcript Editor */}
                <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} style={{ marginBottom: 24 }}>
                    <div className="card-header">
                        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <MessageCircle size={18} />
                            Transcript
                            {transcript && <span className="badge badge-info">{transcript.language}</span>}
                            {transcript?.provider && (
                                <span className="badge badge-purple" style={{ fontSize: 10 }}>{transcript.provider}</span>
                            )}
                            {transcriptSaveMsg && (
                                <span style={{
                                    fontSize: 12, fontWeight: 500, marginLeft: 8,
                                    color: transcriptSaveMsg.startsWith('Error') || transcriptSaveMsg.startsWith('Import error') ? 'var(--color-error)' : 'var(--color-success)',
                                    animation: 'terminal-line-in 0.2s ease'
                                }}>
                                    {transcriptSaveMsg}
                                </span>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {/* Import file button */}
                            <input
                                type="file"
                                ref={transcriptFileRef}
                                accept=".srt,.vtt,.txt"
                                onChange={importTranscriptFile}
                                style={{ display: 'none' }}
                            />
                            <button className="btn btn-ghost btn-sm"
                                onClick={() => transcriptFileRef.current?.click()}
                                disabled={savingTranscript}
                                title="Import .srt, .vtt, or .txt file"
                                style={{ gap: 4 }}>
                                <Upload size={14} /> Import
                            </button>

                            {/* Paste Transcript button */}
                            <button className="btn btn-ghost btn-sm"
                                onClick={() => setShowPasteModal(true)}
                                disabled={savingTranscript}
                                title="Paste transcript with timestamps"
                                style={{ gap: 4, color: '#10b981' }}>
                                <Copy size={14} /> Paste
                            </button>

                            {/* YouTube Captions button */}
                            {project.source_url && (
                                <button className="btn btn-ghost btn-sm"
                                    onClick={importYoutubeCaptions}
                                    disabled={savingTranscript}
                                    title="Import captions from YouTube"
                                    style={{ gap: 4, color: '#ff0000' }}>
                                    <Youtube size={14} /> YT Captions
                                </button>
                            )}

                            {transcript && !editingTranscript && (
                                <button className="btn btn-ghost btn-sm" onClick={startEditTranscript} style={{ gap: 4 }}>
                                    <Edit3 size={14} /> Edit
                                </button>
                            )}
                            {editingTranscript && (
                                <>
                                    <button className="btn btn-ghost btn-sm" onClick={cancelEditTranscript} style={{ gap: 4, color: 'var(--text-muted)' }}>
                                        <X size={14} /> Cancel
                                    </button>
                                    <button className="btn btn-primary btn-sm" onClick={saveTranscript} disabled={savingTranscript} style={{ gap: 4 }}>
                                        {savingTranscript ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                                        Save
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {editingTranscript ? (
                        <div>
                            <textarea
                                className="input-field"
                                value={editedText}
                                onChange={(e) => setEditedText(e.target.value)}
                                style={{
                                    minHeight: 240,
                                    maxHeight: 400,
                                    resize: 'vertical',
                                    fontFamily: '"Inter", sans-serif',
                                    fontSize: 13,
                                    lineHeight: 1.7,
                                    whiteSpace: 'pre-wrap'
                                }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                                <span className="text-sm text-muted">
                                    {editedText.length.toLocaleString()} characters · {editedText.split(/\s+/).filter(Boolean).length.toLocaleString()} words
                                </span>
                            </div>
                        </div>
                    ) : transcript ? (
                        <div>
                            <div className="text-sm" style={{
                                maxHeight: 200, overflowY: 'auto', lineHeight: 1.7,
                                color: 'var(--text-secondary)', whiteSpace: 'pre-wrap'
                            }}>
                                {transcript.full_text}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                                <span className="text-sm text-muted">
                                    {transcript.full_text?.length?.toLocaleString() || 0} characters
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state" style={{ padding: '32px 16px', minHeight: 'auto' }}>
                            <FileText size={28} style={{ opacity: 0.3, marginBottom: 8 }} />
                            <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                                No transcript yet. Import a .srt, .vtt, or .txt file, paste a transcript, or process the video to generate one automatically.
                            </p>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => transcriptFileRef.current?.click()} style={{ gap: 6 }}>
                                    <Upload size={14} /> Import File
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowPasteModal(true)} style={{ gap: 6, borderColor: '#10b981', color: '#10b981' }}>
                                    <Copy size={14} /> Paste Transcript
                                </button>
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* Render All Progress */}
                {renderingAll && (
                    <motion.div className="card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 24, textAlign: 'center', padding: '24px 20px' }}>
                        <Loader size={32} style={{ color: 'var(--accent-cyan)', animation: 'spin 1s linear infinite', marginBottom: 10 }} />
                        <h3 style={{ fontFamily: 'Outfit', fontSize: 17, marginBottom: 6 }}>{processMessage || 'Rendering clips...'}</h3>
                        <div className="progress-bar" style={{ maxWidth: 400, margin: '0 auto' }}>
                            <div className="progress-fill" style={{ width: `${processProgress}%`, transition: 'width 0.5s ease', background: 'linear-gradient(90deg, #06b6d4, #7c3aed)' }} />
                        </div>
                        <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>
                            {processProgress}%{renderETA ? ` • ${renderETA}` : ''}
                        </p>
                    </motion.div>
                )}

                {/* Clips */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                    <div className="section-title" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Scissors size={18} /> Generated Clips ({clips.length})
                        </div>
                        {clips.length > 0 && !renderingAll && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <button className="btn btn-ghost btn-sm" onClick={selectedClips.size === clips.length ? selectNoneClips : selectAllClips}
                                    style={{ fontSize: 12, gap: 4, color: 'var(--text-secondary)' }}>
                                    {selectedClips.size === clips.length ? <CheckSquare size={14} /> : <Square size={14} />}
                                    {selectedClips.size === clips.length ? 'Deselect All' : 'Select All'}
                                </button>
                                {/* Caption Style Dropdown */}
                                <div style={{ position: 'relative' }}>
                                    <button className="btn btn-ghost btn-sm" onClick={() => setShowStyleMenu(!showStyleMenu)}
                                        style={{ fontSize: 12, gap: 4, color: 'var(--text-secondary)' }}
                                        title={`Set caption style for ${selectedClips.size > 0 ? 'selected' : 'all'} clips`}>
                                        <Type size={14} /> Caption Style
                                        <ChevronDown size={12} />
                                    </button>
                                    {showStyleMenu && (
                                        <div style={{
                                            position: 'absolute', top: '100%', right: 0, zIndex: 999, marginTop: 4,
                                            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                                            borderRadius: 10, padding: 6, minWidth: 180,
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                                        }}>
                                            <div style={{ padding: '4px 10px', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
                                                {selectedClips.size > 0 ? `Apply to ${selectedClips.size} clips` : 'Apply to all clips'}
                                            </div>
                                            {CAPTION_STYLES.map(s => (
                                                <button key={s.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                                    padding: '7px 10px', background: 'none', border: 'none',
                                                    color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer',
                                                    borderRadius: 6, textAlign: 'left'
                                                }}
                                                    onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.05)'}
                                                    onMouseLeave={e => e.target.style.background = 'none'}
                                                    onClick={async () => {
                                                        setShowStyleMenu(false);
                                                        try {
                                                            const res = await fetch(`${API}/projects/${id}/clips/bulk-style`, {
                                                                method: 'PUT',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({
                                                                    clipIds: selectedClips.size > 0 ? Array.from(selectedClips) : [],
                                                                    caption_style: s.id
                                                                })
                                                            });
                                                            const data = await res.json();
                                                            setBulkStyleMsg(`✅ ${s.emoji} ${s.name} applied to ${data.updated} clips`);
                                                            setTimeout(() => setBulkStyleMsg(''), 3000);
                                                            loadProject();
                                                        } catch (err) {
                                                            setBulkStyleMsg(`❌ Error: ${err.message}`);
                                                        }
                                                    }}>
                                                    <span>{s.emoji}</span>
                                                    <span>{s.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Hook Title Dropdown */}
                                <div style={{ position: 'relative' }}>
                                    <button className="btn btn-ghost btn-sm" onClick={() => { setShowHookMenu(!showHookMenu); setShowStyleMenu(false); }}
                                        style={{ fontSize: 12, gap: 4, color: '#ef4444' }}
                                        title="Apply hook title settings to all clips">
                                        🎯 Hook Title
                                        <ChevronDown size={12} />
                                    </button>
                                    {showHookMenu && (
                                        <div style={{
                                            position: 'absolute', top: '100%', right: 0, zIndex: 999, marginTop: 4,
                                            background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                                            borderRadius: 10, padding: 14, width: 280,
                                            boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
                                        }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>
                                                🎯 Hook Title Settings (Batch)
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>
                                                Apply hook overlay to {selectedClips.size > 0 ? `${selectedClips.size} selected` : 'all'} clips using each clip's AI hook text.
                                            </div>

                                            {/* Duration */}
                                            <div style={{ marginBottom: 8 }}>
                                                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Duration</label>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    {[3, 5, 0].map(d => (
                                                        <button key={d} className="btn btn-ghost btn-sm"
                                                            style={{
                                                                flex: 1, fontSize: 11, padding: '4px 6px',
                                                                background: bulkHookSettings.duration === d ? 'rgba(139,92,246,0.2)' : 'none',
                                                                border: bulkHookSettings.duration === d ? '1px solid rgba(139,92,246,0.5)' : '1px solid var(--border-color)',
                                                                color: bulkHookSettings.duration === d ? '#8b5cf6' : 'var(--text-secondary)'
                                                            }}
                                                            onClick={() => setBulkHookSettings(s => ({ ...s, duration: d }))}>
                                                            {d === 0 ? '∞ Permanent' : `${d}s`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Position */}
                                            <div style={{ marginBottom: 8 }}>
                                                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Position</label>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    {['top', 'bottom'].map(p => (
                                                        <button key={p} className="btn btn-ghost btn-sm"
                                                            style={{
                                                                flex: 1, fontSize: 11, padding: '4px 6px',
                                                                background: bulkHookSettings.position === p ? 'rgba(139,92,246,0.2)' : 'none',
                                                                border: bulkHookSettings.position === p ? '1px solid rgba(139,92,246,0.5)' : '1px solid var(--border-color)',
                                                                color: bulkHookSettings.position === p ? '#8b5cf6' : 'var(--text-secondary)'
                                                            }}
                                                            onClick={() => setBulkHookSettings(s => ({ ...s, position: p }))}>
                                                            {p === 'top' ? '⬆ Top' : '⬇ Bottom'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Font Size */}
                                            <div style={{ marginBottom: 8 }}>
                                                <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Font Size</span><span>{bulkHookSettings.fontSize}px</span>
                                                </label>
                                                <input type="range" min={20} max={80} value={bulkHookSettings.fontSize}
                                                    onChange={e => setBulkHookSettings(s => ({ ...s, fontSize: parseInt(e.target.value) }))}
                                                    style={{ width: '100%', accentColor: '#8b5cf6' }} />
                                            </div>

                                            {/* Colors */}
                                            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                                                <div style={{ flex: 1 }}>
                                                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>Text Color</label>
                                                    <input type="color" value={bulkHookSettings.textColor}
                                                        onChange={e => setBulkHookSettings(s => ({ ...s, textColor: e.target.value }))}
                                                        style={{ width: '100%', height: 28, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 3 }}>BG Color</label>
                                                    <input type="color" value={bulkHookSettings.bgColor}
                                                        onChange={e => setBulkHookSettings(s => ({ ...s, bgColor: e.target.value }))}
                                                        style={{ width: '100%', height: 28, border: 'none', borderRadius: 4, cursor: 'pointer' }} />
                                                </div>
                                            </div>

                                            {/* Preview */}
                                            <div style={{
                                                background: bulkHookSettings.bgColor, padding: '6px 12px', borderRadius: 4,
                                                textAlign: 'center', marginBottom: 10, opacity: parseFloat(bulkHookSettings.bgOpacity)
                                            }}>
                                                <span style={{
                                                    color: bulkHookSettings.textColor, fontWeight: 800, fontSize: 13,
                                                    textTransform: 'uppercase', letterSpacing: 1
                                                }}>Hook Title Preview</span>
                                            </div>

                                            {/* Apply buttons */}
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn-primary btn-sm" style={{ flex: 1, fontSize: 11, gap: 4 }}
                                                    onClick={async () => {
                                                        setShowHookMenu(false);
                                                        try {
                                                            const res = await fetch(`${API}/projects/${id}/clips/bulk-hook`, {
                                                                method: 'PUT',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({
                                                                    clipIds: selectedClips.size > 0 ? Array.from(selectedClips) : [],
                                                                    hook_settings: bulkHookSettings
                                                                })
                                                            });
                                                            const data = await res.json();
                                                            setBulkStyleMsg(`✅ 🎯 Hook title applied to ${data.updated} clips`);
                                                            setTimeout(() => setBulkStyleMsg(''), 3000);
                                                            loadProject();
                                                        } catch (err) {
                                                            setBulkStyleMsg(`❌ Error: ${err.message}`);
                                                        }
                                                    }}>
                                                    ✅ Apply Hook
                                                </button>
                                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, gap: 4, color: '#ef4444' }}
                                                    onClick={async () => {
                                                        setShowHookMenu(false);
                                                        try {
                                                            const res = await fetch(`${API}/projects/${id}/clips/bulk-hook`, {
                                                                method: 'PUT',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({
                                                                    clipIds: selectedClips.size > 0 ? Array.from(selectedClips) : [],
                                                                    hook_settings: null
                                                                })
                                                            });
                                                            const data = await res.json();
                                                            setBulkStyleMsg(`✅ Hook title removed from ${data.updated} clips`);
                                                            setTimeout(() => setBulkStyleMsg(''), 3000);
                                                            loadProject();
                                                        } catch (err) {
                                                            setBulkStyleMsg(`❌ Error: ${err.message}`);
                                                        }
                                                    }}>
                                                    ❌ Remove
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {selectedClips.size > 0 ? (
                                    <button className="btn btn-primary btn-sm" onClick={renderSelectedClips} style={{ gap: 6 }}>
                                        <Download size={14} /> Export Selected ({selectedClips.size})
                                    </button>
                                ) : (
                                    <button className="btn btn-primary btn-sm" onClick={renderAllClips} style={{ gap: 6 }}>
                                        <Download size={14} /> Export All
                                    </button>
                                )}
                                <button className="btn btn-ghost btn-sm" onClick={openOutputFolder} style={{ gap: 4, color: 'var(--text-secondary)' }} title="Open output folder">
                                    <FolderOpen size={14} /> Open Folder
                                </button>
                                <button className="btn btn-ghost btn-sm" onClick={async () => {
                                    if (!confirm('Re-transcribe will delete the current transcript and re-process the video. This will improve subtitle sync accuracy. Continue?')) return;
                                    setProcessing(true);
                                    setProcessStep('transcribe');
                                    setProcessMessage('Re-transcribing for word-level timestamps...');
                                    try {
                                        await fetch(`${API}/projects/${id}/retranscribe`, { method: 'POST' });
                                    } catch (err) {
                                        console.error('Re-transcribe failed:', err);
                                        setProcessing(false);
                                    }
                                }} style={{ gap: 4, color: '#f59e0b' }} title="Re-transcribe to improve subtitle sync accuracy" disabled={processing}>
                                    🔄 Re-transcribe
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Bulk style message */}
                    <AnimatePresence>
                        {bulkStyleMsg && (
                            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                style={{
                                    padding: '8px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13,
                                    background: bulkStyleMsg.includes('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                    color: bulkStyleMsg.includes('✅') ? '#10b981' : '#ef4444',
                                    border: `1px solid ${bulkStyleMsg.includes('✅') ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`
                                }}>
                                {bulkStyleMsg}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {clips.length === 0 && !processing ? (
                        <div className="empty-state" style={{ minHeight: 200 }}>
                            <Scissors size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
                            <h3>No clips generated yet</h3>
                            <p className="text-muted" style={{ marginBottom: 16 }}>
                                {project.status === 'uploaded' ? 'Click "Process Video" to start AI clipping' :
                                    project.status === 'failed' ? 'Processing failed — check error above and try again' : 'Processing in progress...'}
                            </p>
                            {canProcess && (
                                <button className="btn btn-primary" onClick={startProcessing}>
                                    <Zap size={18} /> Start Processing
                                </button>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
                            <AnimatePresence>
                                {clips.map((clip, i) => {
                                    const isExpanded = expandedClip === clip.id;
                                    const scoreColor = clip.virality_score >= 80 ? '#10b981' : clip.virality_score >= 60 ? '#06b6d4' : '#f59e0b';
                                    const isLocked = clip.status === 'locked';
                                    return (
                                        <motion.div key={clip.id} className="card" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                                            style={{ padding: 0, cursor: isLocked ? 'default' : 'pointer', overflow: 'hidden', border: isExpanded ? `1px solid ${scoreColor}40` : undefined, opacity: isLocked ? 0.45 : 1, position: 'relative' }}
                                            onClick={() => !isLocked && setExpandedClip(isExpanded ? null : clip.id)}>
                                            {isLocked && (
                                                <div style={{ position: 'absolute', top: 0, right: 0, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderBottomLeftRadius: 8, zIndex: 1 }}>
                                                    🔒 PRO — Upgrade untuk akses
                                                </div>
                                            )}

                                            {/* Main row */}
                                            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 18px' }}>
                                                {/* Checkbox */}
                                                <div onClick={(e) => toggleClipSelection(clip.id, e)}
                                                    style={{ cursor: 'pointer', flexShrink: 0, color: selectedClips.has(clip.id) ? 'var(--accent-primary)' : 'var(--text-muted)', transition: 'color 0.15s' }}>
                                                    {selectedClips.has(clip.id) ? <CheckSquare size={20} /> : <Square size={20} />}
                                                </div>
                                                <div style={{ width: 36, textAlign: 'center', fontFamily: 'Outfit', fontSize: 18, fontWeight: 700, color: 'var(--accent-primary)' }}>
                                                    #{clip.clip_number || i + 1}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div className="font-semibold" style={{ marginBottom: 2 }}>{clip.title || `Clip ${i + 1}`}</div>
                                                    <div className="text-sm text-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {clip.hook_text}
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'center', minWidth: 80 }}>
                                                    <div className="font-semibold">{formatDuration(clip.duration)}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                        {formatDuration(clip.start_time)} – {formatDuration(clip.end_time)}
                                                    </div>
                                                </div>
                                                <div style={{
                                                    width: 48, height: 48, borderRadius: '50%',
                                                    background: `${scoreColor}15`, border: `2px solid ${scoreColor}40`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontFamily: 'Outfit', fontWeight: 700, fontSize: 17, color: scoreColor
                                                }}>
                                                    {clip.virality_score}
                                                </div>
                                            </div>

                                            {/* Expanded details */}
                                            {isExpanded && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                                    style={{ borderTop: '1px solid var(--border-subtle)', padding: '16px 18px', background: 'rgba(0,0,0,0.15)' }}>

                                                    {clip.summary && (
                                                        <p className="text-sm" style={{ marginBottom: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                                            {clip.summary}
                                                        </p>
                                                    )}

                                                    {/* Score breakdown */}
                                                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 16 }}>
                                                        <ScoreBadge score={clip.score_hook} label="Hook" />
                                                        <ScoreBadge score={clip.score_content} label="Content" />
                                                        <ScoreBadge score={clip.score_emotion} label="Emotion" />
                                                        <ScoreBadge score={clip.score_share} label="Share" />
                                                        <ScoreBadge score={clip.score_complete} label="Complete" />
                                                    </div>

                                                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                                        {clip.content_type && (
                                                            <div>
                                                                <span className="form-label">Type</span>
                                                                <span className="badge badge-info" style={{ marginLeft: 6, textTransform: 'capitalize' }}>{clip.content_type}</span>
                                                            </div>
                                                        )}
                                                        {clip.improvement_tips && (
                                                            <div style={{ flex: 1, minWidth: 200 }}>
                                                                <span className="form-label"><Lightbulb size={12} style={{ marginRight: 4 }} />Tip: </span>
                                                                <span className="text-sm text-muted">{clip.improvement_tips}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {clip.hashtags && (
                                                        <div style={{ marginTop: 8 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                                                <span className="form-label" style={{ margin: 0, fontSize: 11 }}>🏷️ Hashtags</span>
                                                                <button
                                                                    className="btn btn-ghost btn-sm"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        navigator.clipboard.writeText(clip.hashtags);
                                                                        const btn = e.currentTarget;
                                                                        btn.textContent = '✅ Copied!';
                                                                        setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500);
                                                                    }}
                                                                    style={{ padding: '1px 8px', fontSize: 10 }}
                                                                >
                                                                    📋 Copy
                                                                </button>
                                                            </div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                                                {clip.hashtags.split(/\s+/).filter(t => t.startsWith('#')).map((tag, i) => (
                                                                    <span key={i} style={{
                                                                        fontSize: 11, padding: '2px 8px', borderRadius: 12,
                                                                        background: 'rgba(6,182,212,0.1)', border: '1px solid rgba(6,182,212,0.2)',
                                                                        color: 'var(--accent-cyan)', cursor: 'pointer',
                                                                    }}
                                                                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(tag); }}
                                                                        title={`Copy ${tag}`}
                                                                    >
                                                                        {tag}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Export / Download buttons */}
                                                    <div style={{ display: 'flex', gap: 10, marginTop: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 14, alignItems: 'center' }}>
                                                        <Link
                                                            to={`/projects/${id}/clips/${clip.id}`}
                                                            className="btn btn-secondary btn-sm"
                                                            onClick={(e) => e.stopPropagation()}
                                                            style={{ gap: 6, textDecoration: 'none' }}
                                                        >
                                                            <Eye size={14} /> Edit / Preview
                                                        </Link>
                                                        {rendering[clip.id] && rendering[clip.id].progress < 100 ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                                                                <Loader size={16} style={{ color: 'var(--accent-cyan)', animation: 'spin 1s linear infinite' }} />
                                                                <div style={{ flex: 1 }}>
                                                                    <div className="text-sm">{rendering[clip.id].message}</div>
                                                                    <div className="progress-bar" style={{ marginTop: 4, height: 4 }}>
                                                                        <div className="progress-fill" style={{ width: `${rendering[clip.id].progress}%`, background: 'var(--accent-cyan)' }} />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : clip.output_path || (rendering[clip.id] && rendering[clip.id].progress === 100) ? (
                                                            <>
                                                                <button className="btn btn-primary btn-sm" onClick={(e) => downloadClip(clip.id, e)} style={{ gap: 6 }}>
                                                                    <Download size={14} /> Download
                                                                </button>
                                                                <button className="btn btn-secondary btn-sm" onClick={(e) => renderSingleClip(clip.id, e)} style={{ gap: 6 }}>
                                                                    <RefreshCw size={14} /> Re-render
                                                                </button>
                                                                <button className="btn btn-ghost btn-sm" onClick={(e) => copyClipPath(clip.id, e)} style={{ gap: 4, padding: '4px 8px' }} title="Copy file path">
                                                                    <Copy size={14} />
                                                                </button>
                                                                <CheckCircle size={18} style={{ color: 'var(--color-success)', marginLeft: 'auto' }} />
                                                            </>
                                                        ) : (
                                                            <button className="btn btn-primary btn-sm" onClick={(e) => renderSingleClip(clip.id, e)} style={{ gap: 6 }}>
                                                                <Play size={14} /> Export Clip
                                                            </button>
                                                        )}
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={(e) => deleteClip(clip.id, clip.title, e)}
                                                            title="Delete clip"
                                                            style={{ padding: '4px 6px', marginLeft: 'auto', color: 'var(--color-error)', opacity: 0.6 }}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>

                                                    {/* Social Copy Generator Button */}
                                                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                // Check if clip has saved social copy
                                                                const savedCopy = clip.social_copy ? JSON.parse(clip.social_copy) : null;
                                                                setSocialModal({
                                                                    clipId: clip.id,
                                                                    loading: false,
                                                                    data: savedCopy,
                                                                    error: null,
                                                                    activeTab: 'tiktok',
                                                                    hookStyle: 'drama',
                                                                    hasSaved: !!savedCopy
                                                                });
                                                            }}
                                                            style={{ gap: 6, fontSize: 12, color: '#a78bfa', width: '100%', justifyContent: 'center' }}
                                                        >
                                                            <Sparkles size={14} /> Generate Social Media Copy
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </motion.div>
                                    );
                                })}
                            </AnimatePresence>
                        </div>
                    )}
                </motion.div>
            </div>

            {/* Social Copy Modal */}
            <AnimatePresence>
                {socialModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
                        }}
                        onClick={() => setSocialModal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: 'var(--bg-secondary)', borderRadius: 16, width: '100%', maxWidth: 600,
                                maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--border-subtle)'
                            }}
                        >
                            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Sparkles size={20} style={{ color: '#a78bfa' }} />
                                    <span style={{ fontWeight: 700, fontSize: 16 }}>Social Media Copy</span>
                                </div>
                                <button className="btn btn-ghost btn-sm" onClick={() => setSocialModal(null)}><X size={18} /></button>
                            </div>

                            <div style={{ padding: 24 }}>
                                {/* Hook Style Selector */}
                                {!socialModal.loading && !socialModal.data && !socialModal.error && (
                                    <div>
                                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10, display: 'block' }}>
                                            Pilih Gaya Hook
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16 }}>
                                            {hookStyles.map(s => (
                                                <div key={s.id} onClick={() => setSocialModal(prev => ({ ...prev, hookStyle: s.id }))}
                                                    style={{
                                                        padding: '10px 12px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                                                        background: (socialModal.hookStyle || 'drama') === s.id ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.03)',
                                                        border: (socialModal.hookStyle || 'drama') === s.id ? '2px solid #a78bfa' : '1px solid var(--border-subtle)',
                                                    }}>
                                                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.label}</div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.desc}</div>
                                                </div>
                                            ))}
                                        </div>
                                        <button className="btn btn-primary" style={{ width: '100%', gap: 8 }}
                                            onClick={(e) => generateSocialCopy(socialModal.clipId, e, socialModal.hookStyle || 'drama')}>
                                            <Sparkles size={16} /> Generate Hooks
                                        </button>
                                    </div>
                                )}

                                {socialModal.loading && (
                                    <div style={{ textAlign: 'center', padding: 40 }}>
                                        <Loader size={32} style={{ color: '#a78bfa', animation: 'spin 1s linear infinite', marginBottom: 12 }} />
                                        <p style={{ color: 'var(--text-secondary)' }}>AI sedang generate hook {hookStyles.find(s => s.id === socialModal.hookStyle)?.label || '🎭 Drama'}...</p>
                                    </div>
                                )}

                                {socialModal.error && (
                                    <div style={{ textAlign: 'center', padding: 40 }}>
                                        <AlertCircle size={32} style={{ color: 'var(--color-error)', marginBottom: 12 }} />
                                        <p style={{ color: 'var(--color-error)' }}>{socialModal.error}</p>
                                        <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }}
                                            onClick={() => setSocialModal(prev => ({ ...prev, error: null, data: null }))}>
                                            Coba Lagi
                                        </button>
                                    </div>
                                )}

                                {socialModal.data && (() => {
                                    const tabs = [
                                        { id: 'tiktok', label: '🎵 TikTok', color: '#ff0050' },
                                        { id: 'instagram', label: '📸 Instagram', color: '#E1306C' },
                                        { id: 'youtube', label: '▶️ YouTube', color: '#FF0000' },
                                        { id: 'twitter', label: '🐦 Twitter/X', color: '#1DA1F2' },
                                        { id: 'facebook', label: '📘 Facebook', color: '#1877F2' }
                                    ];
                                    const activeTab = socialModal.activeTab || 'tiktok';
                                    const platform = socialModal.data[activeTab];

                                    return (
                                        <>
                                            {/* Platform Tabs */}
                                            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                                                {tabs.map(tab => (
                                                    <button
                                                        key={tab.id}
                                                        onClick={() => setSocialModal(prev => ({ ...prev, activeTab: tab.id }))}
                                                        style={{
                                                            flex: 1, padding: '10px 12px', borderRadius: 10, border: 'none',
                                                            cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all 0.2s',
                                                            background: activeTab === tab.id ? tab.color + '22' : 'rgba(255,255,255,0.03)',
                                                            color: activeTab === tab.id ? tab.color : 'var(--text-secondary)',
                                                            outline: activeTab === tab.id ? `2px solid ${tab.color}44` : '1px solid var(--border-subtle)'
                                                        }}
                                                    >
                                                        {tab.label}
                                                    </button>
                                                ))}
                                            </div>

                                            {platform && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                                    {/* Title */}
                                                    <div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Title</label>
                                                            <button className="btn btn-ghost btn-sm" onClick={() => copySocialText(platform.title)} style={{ fontSize: 11, gap: 4, padding: '2px 8px' }}>
                                                                <Copy size={12} /> Copy
                                                            </button>
                                                        </div>
                                                        <div style={{
                                                            background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px',
                                                            fontSize: 14, lineHeight: 1.5, border: '1px solid var(--border-subtle)'
                                                        }}>{platform.title}</div>
                                                    </div>

                                                    {/* Description */}
                                                    <div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Description</label>
                                                            <button className="btn btn-ghost btn-sm" onClick={() => copySocialText(platform.description)} style={{ fontSize: 11, gap: 4, padding: '2px 8px' }}>
                                                                <Copy size={12} /> Copy
                                                            </button>
                                                        </div>
                                                        <div style={{
                                                            background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 14px',
                                                            fontSize: 13, lineHeight: 1.6, border: '1px solid var(--border-subtle)', whiteSpace: 'pre-wrap'
                                                        }}>{platform.description}</div>
                                                    </div>

                                                    {/* Hashtags */}
                                                    <div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Hashtags</label>
                                                            <button className="btn btn-ghost btn-sm" onClick={() => copySocialText(platform.hashtags)} style={{ fontSize: 11, gap: 4, padding: '2px 8px' }}>
                                                                <Copy size={12} /> Copy
                                                            </button>
                                                        </div>
                                                        <div style={{
                                                            background: 'rgba(167, 139, 250, 0.06)', borderRadius: 8, padding: '10px 14px',
                                                            fontSize: 13, lineHeight: 1.6, border: '1px solid rgba(167,139,250,0.15)', color: '#a78bfa'
                                                        }}>{platform.hashtags}</div>
                                                    </div>

                                                    {/* Hook Variations */}
                                                    {platform.hooks && platform.hooks.length > 0 && (
                                                        <div>
                                                            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'block' }}>
                                                                🪝 Hook Variations
                                                            </label>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                {platform.hooks.map((hook, hi) => (
                                                                    <div key={hi} onClick={() => copySocialText(hook)} style={{
                                                                        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                                                        background: 'rgba(6,182,212,0.06)', borderRadius: 8,
                                                                        border: '1px solid rgba(6,182,212,0.15)', cursor: 'pointer',
                                                                        transition: 'all 0.2s'
                                                                    }}
                                                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(6,182,212,0.12)'; }}
                                                                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(6,182,212,0.06)'; }}
                                                                    >
                                                                        <span style={{ fontWeight: 700, color: '#06b6d4', fontSize: 12, minWidth: 20 }}>#{hi + 1}</span>
                                                                        <span style={{ fontSize: 13, flex: 1 }}>{hook}</span>
                                                                        <Copy size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Best Time & Engagement Tip */}
                                                    {(platform.bestTime || platform.engagementTip) && (
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                                            {platform.bestTime && (
                                                                <div style={{
                                                                    padding: '10px 12px', borderRadius: 8,
                                                                    background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)'
                                                                }}>
                                                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: 4 }}>⏰ Best Time</div>
                                                                    <div style={{ fontSize: 12, lineHeight: 1.4 }}>{platform.bestTime}</div>
                                                                </div>
                                                            )}
                                                            {platform.engagementTip && (
                                                                <div style={{
                                                                    padding: '10px 12px', borderRadius: 8,
                                                                    background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)'
                                                                }}>
                                                                    <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', marginBottom: 4 }}>💡 Tip</div>
                                                                    <div style={{ fontSize: 12, lineHeight: 1.4 }}>{platform.engagementTip}</div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Copy All */}
                                                    <button
                                                        className="btn btn-primary"
                                                        onClick={() => copySocialText(`${platform.title}\n\n${platform.description}\n\n${platform.hashtags}`)}
                                                        style={{ gap: 8, marginTop: 4 }}
                                                    >
                                                        <Copy size={16} /> Copy All ({tabs.find(t => t.id === activeTab)?.label})
                                                    </button>

                                                    {/* Regenerate */}
                                                    <button
                                                        className="btn btn-ghost"
                                                        onClick={() => setSocialModal(prev => ({ ...prev, data: null, error: null }))}
                                                        style={{ gap: 8, fontSize: 13 }}
                                                    >
                                                        🔄 Ganti Gaya Hook
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

            {/* Paste Transcript Modal */}
            <AnimatePresence>
                {showPasteModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', inset: 0, zIndex: 9999,
                            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 20
                        }}
                        onClick={() => setShowPasteModal(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 30 }}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                background: 'var(--bg-card)', borderRadius: 16,
                                border: '1px solid rgba(255,255,255,0.08)',
                                width: '100%', maxWidth: 640, maxHeight: '80vh',
                                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                                boxShadow: '0 24px 64px rgba(0,0,0,0.5)'
                            }}
                        >
                            {/* Header */}
                            <div style={{
                                padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Copy size={20} style={{ color: '#10b981' }} />
                                    <h3 style={{ fontFamily: 'Outfit', fontSize: 18, margin: 0 }}>Paste Transcript</h3>
                                </div>
                                <button className="btn btn-ghost btn-sm" onClick={() => setShowPasteModal(false)} style={{ padding: 4 }}>
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Body */}
                            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                                {/* Format guide */}
                                <div style={{
                                    background: 'rgba(16,185,129,0.08)', borderRadius: 10,
                                    padding: '12px 16px', marginBottom: 16,
                                    border: '1px solid rgba(16,185,129,0.15)',
                                    fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6
                                }}>
                                    <strong style={{ color: '#10b981' }}>📋 Supported formats:</strong>
                                    <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 11, opacity: 0.85 }}>
                                        <div>00:00 Text goes here</div>
                                        <div>01:30 More text here</div>
                                        <div>1:05:30 Text with hours</div>
                                        <div>[00:00] Text with brackets</div>
                                        <div>00:00 - Text with dash</div>
                                    </div>
                                    <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
                                        Plain text without timestamps is also accepted.
                                    </div>
                                </div>

                                <textarea
                                    className="input-field"
                                    value={pasteText}
                                    onChange={(e) => setPasteText(e.target.value)}
                                    placeholder={"00:00 Mana ceweknya sih?\n00:02 Bicara baik-baik,\n00:04 sayang. Sayang, sayang.\n00:06 Apa? Mikir hati kamu itu...\n\nPaste your transcript here..."}
                                    style={{
                                        minHeight: 280, maxHeight: 400, resize: 'vertical',
                                        fontFamily: '"Inter", monospace', fontSize: 13,
                                        lineHeight: 1.7, whiteSpace: 'pre-wrap'
                                    }}
                                    autoFocus
                                />

                                {pasteText && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                                        <span className="text-sm text-muted">
                                            {pasteText.split('\n').filter(l => l.trim()).length} lines · {pasteText.length.toLocaleString()} characters
                                        </span>
                                        <button className="btn btn-ghost btn-sm" onClick={() => setPasteText('')}
                                            style={{ fontSize: 11, padding: '2px 8px', color: 'var(--color-error)' }}>
                                            Clear
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div style={{
                                padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.06)',
                                display: 'flex', justifyContent: 'flex-end', gap: 10
                            }}>
                                <button className="btn btn-ghost" onClick={() => setShowPasteModal(false)}>
                                    Cancel
                                </button>
                                <button
                                    className="btn btn-primary"
                                    onClick={pasteTranscript}
                                    disabled={!pasteText.trim() || savingTranscript}
                                    style={{ gap: 6 }}
                                >
                                    {savingTranscript ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
                                    Import Transcript
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
