import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload as UploadIcon, Link2, Film, Smartphone, Crosshair, User, Columns, Maximize, Clock, Sparkles, Globe, Rocket, CheckCircle, Loader, X, FileVideo } from 'lucide-react';

const API = 'http://localhost:5000/api';

const platforms = [
    { id: 'tiktok', label: 'TikTok', icon: '📱' },
    { id: 'reels', label: 'Reels', icon: '📸' },
    { id: 'ytshorts', label: 'YT Shorts', icon: '▶️' },
    { id: 'all', label: 'All Platforms', icon: '🌐' },
];

const reframingModes = [
    { id: 'center', label: 'Center Crop', icon: Crosshair, desc: 'Simple center crop' },
    { id: 'face_track', label: 'Face Track', icon: User, desc: 'AI follows speaker' },
    { id: 'split', label: 'Split Screen', icon: Columns, desc: 'Speaker + content' },
    { id: 'fit', label: 'Fit (Blur)', icon: Maximize, desc: 'Full video + blur BG' },
];

const durationModes = [
    { id: 'platform', label: '🎯 Platform', desc: 'Platform optimal' },
    { id: 'custom', label: '⚙️ Custom', desc: 'Set min/max' },
    { id: 'ai_smart', label: '🧠 AI Smart', desc: 'AI decides' },
];

const clipCounts = [
    { id: 'few', label: 'Few', desc: '3-5', icon: '📦' },
    { id: 'medium', label: 'Medium', desc: '6-10', icon: '📦📦' },
    { id: 'many', label: 'Many', desc: '10+', icon: '📦📦📦' },
];

function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

export default function UploadPage() {
    const navigate = useNavigate();
    const [file, setFile] = useState(null);
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [dragActive, setDragActive] = useState(false);
    const [platform, setPlatform] = useState('tiktok');
    const [reframing, setReframing] = useState('center');
    const [durationMode, setDurationMode] = useState('platform');
    const [clipCount, setClipCount] = useState('medium');
    const [customClipCount, setCustomClipCount] = useState(10);
    const [language, setLanguage] = useState('auto');
    const [minDuration, setMinDuration] = useState(15);
    const [maxDuration, setMaxDuration] = useState(60);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [uploadDone, setUploadDone] = useState(false);
    const [error, setError] = useState(null);
    const [licenseTier, setLicenseTier] = useState('free');
    const fileRef = useRef(null);

    // Fetch license tier on mount
    useEffect(() => {
        // Preview free only works if admin is logged in
        const isAdmin = !!sessionStorage.getItem('admin_password');
        const previewFree = isAdmin && localStorage.getItem('previewFreeTier') === 'true';
        if (previewFree) { setLicenseTier('free'); return; }
        fetch(`${API}/license`).then(r => r.json()).then(d => setLicenseTier(d.tier || 'free')).catch(() => { });
    }, []);

    const isYoutubeUrl = (url) => {
        return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragActive(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) { setFile(dropped); setError(null); }
    };

    const handleFileSelect = (e) => {
        const selected = e.target.files?.[0];
        if (selected) { setFile(selected); setError(null); }
    };

    const handleUpload = async () => {
        if (!file && !youtubeUrl) return;
        setUploading(true);
        setUploadProgress(0);
        setProgressMessage('');
        setError(null);

        const settings = {
            platform,
            reframing_mode: reframing,
            language,
            clip_count_target: clipCount === 'custom' ? String(customClipCount) : clipCount,
            min_duration: minDuration,
            max_duration: maxDuration,
        };

        try {
            if (!file && youtubeUrl && isYoutubeUrl(youtubeUrl)) {
                // YouTube URL download with real-time SSE progress
                setProgressMessage('Connecting to YouTube...');
                setUploadProgress(5);

                // Open SSE stream for progress updates
                const evtSource = new EventSource(`${API}/projects/youtube/progress`);

                evtSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.message) setProgressMessage(data.message);
                        if (typeof data.progress === 'number') setUploadProgress(data.progress);
                    } catch (e) { /* ignore parse errors */ }
                };

                try {
                    const res = await fetch(`${API}/projects/youtube`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: youtubeUrl, ...settings })
                    });

                    evtSource.close();

                    if (!res.ok) {
                        const errData = await res.json();
                        throw new Error(errData.error || 'YouTube download failed');
                    }

                    setUploadProgress(100);
                    setProgressMessage('Download complete!');
                    setUploadDone(true);
                    setTimeout(() => navigate('/projects'), 1500);
                } catch (err) {
                    evtSource.close();
                    throw err;
                }
            } else if (file) {
                // File upload
                setProgressMessage(`Uploading ${file.name}...`);
                const formData = new FormData();
                formData.append('video', file);
                Object.entries(settings).forEach(([k, v]) => formData.append(k, v));

                const xhr = new XMLHttpRequest();
                const response = await new Promise((resolve, reject) => {
                    xhr.upload.addEventListener('progress', (e) => {
                        if (e.lengthComputable) {
                            const pct = Math.round((e.loaded / e.total) * 100);
                            setUploadProgress(pct);
                            setProgressMessage(`Uploading... ${pct}%`);
                        }
                    });
                    xhr.addEventListener('load', () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve(JSON.parse(xhr.responseText));
                        } else {
                            try { reject(new Error(JSON.parse(xhr.responseText)?.error || 'Upload failed')); }
                            catch { reject(new Error('Upload failed')); }
                        }
                    });
                    xhr.addEventListener('error', () => reject(new Error('Network error')));
                    xhr.open('POST', `${API}/projects/upload`);
                    xhr.send(formData);
                });

                setUploadDone(true);
                setTimeout(() => navigate('/projects'), 1500);
            } else {
                throw new Error('Please upload a video file or enter a valid YouTube URL');
            }
        } catch (err) {
            let errorMsg = err.message;
            if (err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
                errorMsg = 'Cannot connect to backend server. Please restart the app. If the problem persists, try reinstalling ClipperSkuy.';
            }
            setError(errorMsg);
            setUploading(false);
            setUploadProgress(0);
            setProgressMessage('');
        }
    };

    return (
        <>
            <div className="page-header">
                <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>New Project</motion.h1>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                    Upload a video or paste a YouTube URL to get started
                </motion.p>
            </div>

            <div className="page-body">
                {/* Upload Zone */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                    <AnimatePresence mode="wait">
                        {uploading ? (
                            <motion.div key="uploading" className="card" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: 40 }}>
                                {uploadDone ? (
                                    <>
                                        <CheckCircle size={56} style={{ color: 'var(--color-success)', marginBottom: 16 }} />
                                        <h3 style={{ fontFamily: 'Outfit', fontSize: 20, marginBottom: 8 }}>
                                            {youtubeUrl ? 'Download Complete!' : 'Upload Complete!'}
                                        </h3>
                                        <p className="text-muted">Redirecting to projects...</p>
                                    </>
                                ) : (
                                    <>
                                        <Loader size={48} style={{ color: 'var(--accent-primary)', marginBottom: 16, animation: 'spin 1s linear infinite' }} />
                                        <h3 style={{ fontFamily: 'Outfit', fontSize: 20, marginBottom: 8 }}>
                                            {progressMessage || 'Processing...'}
                                        </h3>
                                        <p className="text-muted mb-2">{uploadProgress}%</p>
                                        <div className="progress-bar" style={{ maxWidth: 400, margin: '16px auto 0' }}>
                                            <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                                        </div>
                                    </>
                                )}
                            </motion.div>
                        ) : !file ? (
                            <motion.div key="dropzone"
                                className={`dropzone ${dragActive ? 'active' : ''}`}
                                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                                onDragLeave={() => setDragActive(false)}
                                onDrop={handleDrop}
                                onClick={() => fileRef.current?.click()}
                            >
                                <div className="drop-icon"><UploadIcon size={32} /></div>
                                <h3>Drag & Drop Video Here</h3>
                                <p>or click to browse • MP4, MOV, AVI, MKV, WebM • Max 5GB</p>
                                <input ref={fileRef} type="file" accept="video/*" onChange={handleFileSelect} style={{ display: 'none' }} />
                                <div className="divider" style={{ margin: '24px auto', maxWidth: 200 }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                                    <Link2 size={18} style={{ color: 'var(--accent-cyan)' }} />
                                    <input type="text" className="input-field" placeholder="Or paste YouTube URL..." style={{ maxWidth: 400 }}
                                        value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} onClick={(e) => e.stopPropagation()} />
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div key="file-selected" className="card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <div style={{ width: 56, height: 56, borderRadius: 'var(--radius-md)', background: 'rgba(124,58,237,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <FileVideo size={28} style={{ color: 'var(--accent-primary)' }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="font-semibold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                                    <div className="text-sm text-muted">{formatSize(file.size)} • {file.type || 'video'}</div>
                                </div>
                                <button className="btn btn-ghost btn-sm" onClick={() => { setFile(null); setError(null); }}>
                                    <X size={16} /> Change
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {error && (
                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                            style={{ marginTop: 12, padding: '10px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--color-error)', fontSize: 13 }}>
                            ❌ {error}
                        </motion.div>
                    )}
                </motion.div>

                {/* Settings - only show when not uploading */}
                {!uploading && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                        <div className="section" style={{ marginTop: 24 }}>
                            <div className="section-title"><Smartphone size={18} /> Platform Target</div>
                            <div className="chip-group">
                                {platforms.map((p) => (
                                    <button key={p.id} className={`chip ${platform === p.id ? 'active' : ''}`} onClick={() => setPlatform(p.id)}>
                                        {p.icon} {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="section">
                            <div className="section-title"><Crosshair size={18} /> Reframing Mode</div>
                            <div className="chip-group">
                                {reframingModes.map((m) => {
                                    const Icon = m.icon;
                                    const isLocked = m.id === 'face_track' && licenseTier === 'free';
                                    return (
                                        <button key={m.id}
                                            className={`chip ${reframing === m.id ? 'active' : ''}`}
                                            onClick={() => !isLocked && setReframing(m.id)}
                                            style={{
                                                minWidth: 130, position: 'relative',
                                                opacity: isLocked ? 0.5 : 1,
                                                cursor: isLocked ? 'not-allowed' : 'pointer'
                                            }}>
                                            <Icon size={16} />
                                            <div style={{ textAlign: 'left' }}>
                                                <div style={{ fontSize: 13 }}>{m.label}</div>
                                                <div style={{ fontSize: 10, opacity: 0.6 }}>{m.desc}</div>
                                            </div>
                                            {isLocked && (
                                                <span style={{
                                                    position: 'absolute', top: -6, right: -6,
                                                    background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                                                    color: '#fff', fontSize: 9, fontWeight: 700,
                                                    padding: '1px 6px', borderRadius: 8
                                                }}>🔒 PRO</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="section">
                            <div className="section-title"><Clock size={18} /> Clip Duration</div>
                            <div className="chip-group">
                                <button className={`chip ${minDuration === 15 && maxDuration === 30 ? 'active' : ''}`}
                                    onClick={() => { setMinDuration(15); setMaxDuration(30); setDurationMode('short'); }}>
                                    ⚡ Short <span style={{ fontSize: 11, opacity: 0.6 }}>(15-30s)</span>
                                </button>
                                <button className={`chip ${minDuration === 30 && maxDuration === 60 ? 'active' : ''}`}
                                    onClick={() => { setMinDuration(30); setMaxDuration(60); setDurationMode('medium'); }}>
                                    🎯 Medium <span style={{ fontSize: 11, opacity: 0.6 }}>(30-60s)</span>
                                </button>
                                <button className={`chip ${minDuration === 60 && maxDuration === 90 ? 'active' : ''}`}
                                    onClick={() => { setMinDuration(60); setMaxDuration(90); setDurationMode('long'); }}>
                                    🔥 Long <span style={{ fontSize: 11, opacity: 0.6 }}>(60-90s)</span>
                                </button>
                                <button className={`chip ${durationMode === 'custom' ? 'active' : ''}`}
                                    onClick={() => setDurationMode('custom')}>
                                    ⚙️ Custom
                                </button>
                            </div>
                            {durationMode === 'custom' && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ display: 'flex', gap: 12, marginTop: 12, maxWidth: 300 }}>
                                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                                        <label className="form-label">Min (sec)</label>
                                        <input type="number" className="input-field" value={minDuration} onChange={(e) => setMinDuration(Number(e.target.value))} min={5} max={300} />
                                    </div>
                                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                                        <label className="form-label">Max (sec)</label>
                                        <input type="number" className="input-field" value={maxDuration} onChange={(e) => setMaxDuration(Number(e.target.value))} min={15} max={600} />
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        <div className="section">
                            <div className="section-title"><Sparkles size={18} /> Number of Clips</div>
                            <div className="chip-group">
                                {clipCounts.map((c) => (
                                    <button key={c.id} className={`chip ${clipCount === c.id ? 'active' : ''}`} onClick={() => setClipCount(c.id)}>
                                        {c.icon} {c.label} <span style={{ fontSize: 11, opacity: 0.6 }}>({c.desc})</span>
                                    </button>
                                ))}
                                <button className={`chip ${clipCount === 'custom' ? 'active' : ''}`} onClick={() => setClipCount('custom')}>
                                    ⚙️ Custom
                                </button>
                            </div>
                            {clipCount === 'custom' && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginTop: 12, maxWidth: 200 }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">Jumlah Clip</label>
                                        <input type="number" className="input-field" value={customClipCount}
                                            onChange={(e) => setCustomClipCount(Math.max(1, Math.min(100, Number(e.target.value))))} min={1} max={100} />
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        <div className="section">
                            <div className="section-title"><Globe size={18} /> Language</div>
                            <select className="select-field" style={{ maxWidth: 280 }} value={language} onChange={(e) => setLanguage(e.target.value)}>
                                <option value="auto">Auto-detect</option>
                                <option value="id">Bahasa Indonesia</option>
                                <option value="en">English</option>
                                <option value="ar">العربية</option>
                                <option value="zh">中文</option>
                                <option value="ja">日本語</option>
                                <option value="ko">한국어</option>
                            </select>
                        </div>

                        <motion.div style={{ marginTop: 32, marginBottom: 48 }}>
                            <button className="btn btn-primary btn-lg" onClick={handleUpload} disabled={!file && !youtubeUrl}
                                style={{ opacity: (!file && !youtubeUrl) ? 0.4 : 1, cursor: (!file && !youtubeUrl) ? 'not-allowed' : 'pointer' }}>
                                <Rocket size={20} />
                                Upload & Generate Clips
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </div>

            <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </>
    );
}
