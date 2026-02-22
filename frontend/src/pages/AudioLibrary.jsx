import { useState, useEffect, useRef, useCallback } from 'react';
import { Music, Volume2, Upload, Trash2, Play, Pause, Search, Plus, X, Headphones, Mic2, Wand2 } from 'lucide-react';

const API = 'http://localhost:5000/api';

const MUSIC_CATEGORIES = [
    { value: 'all', label: 'All', icon: '🎵' },
    { value: 'upbeat', label: 'Upbeat', icon: '🔥' },
    { value: 'chill', label: 'Chill', icon: '😌' },
    { value: 'epic', label: 'Epic', icon: '⚡' },
    { value: 'funny', label: 'Funny', icon: '😂' },
    { value: 'motivational', label: 'Motivational', icon: '💪' },
    { value: 'sad', label: 'Sad', icon: '😢' },
    { value: 'cinematic', label: 'Cinematic', icon: '🎬' },
    { value: 'lofi', label: 'Lo-Fi', icon: '🎧' },
    { value: 'general', label: 'Other', icon: '📁' },
];

const SFX_CATEGORIES = [
    { value: 'all', label: 'All', icon: '🔊' },
    { value: 'whoosh', label: 'Whoosh', icon: '💨' },
    { value: 'notification', label: 'Notification', icon: '🔔' },
    { value: 'reaction', label: 'Reaction', icon: '😂' },
    { value: 'transition', label: 'Transition', icon: '✨' },
    { value: 'impact', label: 'Impact', icon: '💥' },
    { value: 'ui', label: 'UI', icon: '🖱️' },
    { value: 'game', label: 'Game', icon: '🎮' },
    { value: 'nature', label: 'Nature', icon: '🌿' },
    { value: 'general', label: 'Other', icon: '📁' },
];

function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function formatSize(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AudioLibrary() {
    const [tab, setTab] = useState('music'); // 'music' | 'sfx'
    const [tracks, setTracks] = useState([]);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('all');
    const [playing, setPlaying] = useState(null);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [uploadName, setUploadName] = useState('');
    const [uploadCategory, setUploadCategory] = useState('general');
    const [uploadMood, setUploadMood] = useState('neutral');
    const [uploadBpm, setUploadBpm] = useState('');
    const [uploadFile, setUploadFile] = useState(null);
    const audioRef = useRef(null);
    const fileInputRef = useRef(null);

    const categories = tab === 'music' ? MUSIC_CATEGORIES : SFX_CATEGORIES;
    const endpoint = tab === 'music' ? 'music' : 'sfx';

    const fetchTracks = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/${endpoint}`);
            const data = await res.json();
            setTracks(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Failed to fetch tracks:', e);
            setTracks([]);
        }
        setLoading(false);
    }, [endpoint]);

    useEffect(() => {
        fetchTracks();
        setSearch('');
        setCategory('all');
        stopPlaying();
    }, [tab, fetchTracks]);

    const stopPlaying = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setPlaying(null);
    };

    const togglePlay = (id) => {
        if (playing === id) {
            stopPlaying();
            return;
        }
        stopPlaying();
        const audio = new Audio(`${API}/${endpoint}/${id}/stream`);
        audio.volume = 0.7;
        audio.onended = () => setPlaying(null);
        audio.play().catch(() => { });
        audioRef.current = audio;
        setPlaying(id);
    };

    const handleUpload = async () => {
        if (!uploadFile) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('name', uploadName || uploadFile.name.replace(/\.[^.]+$/, ''));
            formData.append('category', uploadCategory);
            if (tab === 'music') {
                formData.append('mood', uploadMood);
                if (uploadBpm) formData.append('bpm', uploadBpm);
            }
            await fetch(`${API}/${endpoint}`, { method: 'POST', body: formData });
            setShowUploadForm(false);
            setUploadFile(null);
            setUploadName('');
            setUploadCategory('general');
            setUploadMood('neutral');
            setUploadBpm('');
            fetchTracks();
        } catch (e) {
            console.error('Upload failed:', e);
        }
        setUploading(false);
    };

    const handleDelete = async (id) => {
        if (!confirm('Delete this track? This cannot be undone.')) return;
        stopPlaying();
        try {
            await fetch(`${API}/${endpoint}/${id}`, { method: 'DELETE' });
            fetchTracks();
        } catch (e) {
            console.error('Delete failed:', e);
        }
    };

    const filtered = tracks.filter(t => {
        if (category !== 'all' && t.category !== category) return false;
        if (search && !t.name?.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const totalDuration = tracks.reduce((s, t) => s + (t.duration || 0), 0);
    const totalSize = tracks.reduce((s, t) => s + (t.file_size || 0), 0);

    return (
        <div className="audio-library-page">
            <style>{audioLibraryCSS}</style>

            {/* Header */}
            <div className="al-header">
                <div className="al-header-left">
                    <div className="al-header-icon">
                        {tab === 'music' ? <Music size={24} /> : <Volume2 size={24} />}
                    </div>
                    <div>
                        <h1 className="al-title">Audio Library</h1>
                        <p className="al-subtitle">
                            {tracks.length} {tab === 'music' ? 'tracks' : 'effects'} •{' '}
                            {formatDuration(totalDuration)} total •{' '}
                            {formatSize(totalSize)}
                        </p>
                    </div>
                </div>
                <button className="al-upload-btn" onClick={() => setShowUploadForm(true)}>
                    <Plus size={18} />
                    Upload {tab === 'music' ? 'Music' : 'SFX'}
                </button>
            </div>

            {/* Tabs */}
            <div className="al-tabs">
                <button
                    className={`al-tab ${tab === 'music' ? 'active' : ''}`}
                    onClick={() => setTab('music')}
                >
                    <Headphones size={16} />
                    Background Music
                </button>
                <button
                    className={`al-tab ${tab === 'sfx' ? 'active' : ''}`}
                    onClick={() => setTab('sfx')}
                >
                    <Mic2 size={16} />
                    Sound Effects
                </button>
            </div>

            {/* Search + Category Filter */}
            <div className="al-filters">
                <div className="al-search">
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder={`Search ${tab === 'music' ? 'music' : 'sound effects'}...`}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="al-search-clear" onClick={() => setSearch('')}>
                            <X size={14} />
                        </button>
                    )}
                </div>
                <div className="al-categories">
                    {categories.map(c => (
                        <button
                            key={c.value}
                            className={`al-cat-btn ${category === c.value ? 'active' : ''}`}
                            onClick={() => setCategory(c.value)}
                        >
                            <span>{c.icon}</span>
                            <span>{c.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Track List */}
            <div className="al-track-list">
                {loading ? (
                    <div className="al-empty">
                        <div className="al-spinner" />
                        <p>Loading...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="al-empty">
                        <div className="al-empty-icon">
                            {tab === 'music' ? '🎵' : '🔊'}
                        </div>
                        <h3>{search || category !== 'all' ? 'No results found' : `No ${tab === 'music' ? 'music tracks' : 'sound effects'} yet`}</h3>
                        <p>
                            {search || category !== 'all'
                                ? 'Try adjusting your search or filter'
                                : `Upload ${tab === 'music' ? 'background music' : 'sound effects'} to use in your clips`}
                        </p>
                        {!search && category === 'all' && (
                            <button className="al-upload-btn" onClick={() => setShowUploadForm(true)} style={{ marginTop: 16 }}>
                                <Upload size={16} />
                                Upload {tab === 'music' ? 'Music' : 'SFX'}
                            </button>
                        )}
                    </div>
                ) : (
                    filtered.map(track => (
                        <div key={track.id} className={`al-track ${playing === track.id ? 'playing' : ''}`}>
                            {/* Play button */}
                            <button className="al-play-btn" onClick={() => togglePlay(track.id)}>
                                {playing === track.id ? <Pause size={16} /> : <Play size={16} />}
                            </button>

                            {/* Waveform visual */}
                            <div className="al-waveform">
                                {Array.from({ length: 20 }, (_, i) => (
                                    <div
                                        key={i}
                                        className="al-wave-bar"
                                        style={{
                                            height: `${15 + Math.sin(i * 0.8 + (track.id?.charCodeAt(0) || 0)) * 15 + Math.random() * 5}px`,
                                            animationDelay: `${i * 0.05}s`,
                                            opacity: playing === track.id ? 1 : 0.4
                                        }}
                                    />
                                ))}
                            </div>

                            {/* Track info */}
                            <div className="al-track-info">
                                <div className="al-track-name">{track.name || 'Untitled'}</div>
                                <div className="al-track-meta">
                                    <span className="al-cat-badge">
                                        {categories.find(c => c.value === track.category)?.icon || '📁'}{' '}
                                        {track.category}
                                    </span>
                                    {tab === 'music' && track.mood && track.mood !== 'neutral' && (
                                        <span className="al-mood-badge">{track.mood}</span>
                                    )}
                                    {tab === 'music' && track.bpm > 0 && (
                                        <span className="al-bpm-badge">{track.bpm} BPM</span>
                                    )}
                                </div>
                            </div>

                            {/* Duration + Size */}
                            <div className="al-track-duration">
                                {formatDuration(track.duration)}
                            </div>
                            <div className="al-track-size">
                                {formatSize(track.file_size)}
                            </div>

                            {/* Delete */}
                            <button className="al-delete-btn" onClick={() => handleDelete(track.id)} title="Delete">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))
                )}
            </div>

            {/* Upload Modal */}
            {showUploadForm && (
                <div className="al-modal-overlay" onClick={() => setShowUploadForm(false)}>
                    <div className="al-modal" onClick={e => e.stopPropagation()}>
                        <div className="al-modal-header">
                            <h2>Upload {tab === 'music' ? 'Background Music' : 'Sound Effect'}</h2>
                            <button className="al-modal-close" onClick={() => setShowUploadForm(false)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="al-modal-body">
                            {/* Drop zone */}
                            <div
                                className={`al-dropzone ${uploadFile ? 'has-file' : ''}`}
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
                                onDragLeave={e => e.currentTarget.classList.remove('dragover')}
                                onDrop={e => {
                                    e.preventDefault();
                                    e.currentTarget.classList.remove('dragover');
                                    const file = e.dataTransfer.files[0];
                                    if (file) {
                                        setUploadFile(file);
                                        if (!uploadName) setUploadName(file.name.replace(/\.[^.]+$/, ''));
                                    }
                                }}
                            >
                                {uploadFile ? (
                                    <>
                                        <Music size={24} />
                                        <p className="al-dropzone-name">{uploadFile.name}</p>
                                        <p className="al-dropzone-size">{formatSize(uploadFile.size)}</p>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={32} />
                                        <p>Click or drag audio file here</p>
                                        <p className="al-dropzone-hint">MP3, WAV, OGG, M4A, AAC</p>
                                    </>
                                )}
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".mp3,.wav,.ogg,.m4a,.aac"
                                style={{ display: 'none' }}
                                onChange={e => {
                                    const file = e.target.files[0];
                                    if (file) {
                                        setUploadFile(file);
                                        if (!uploadName) setUploadName(file.name.replace(/\.[^.]+$/, ''));
                                    }
                                }}
                            />

                            {/* Form fields */}
                            <div className="al-form-group">
                                <label>Name</label>
                                <input
                                    type="text"
                                    value={uploadName}
                                    onChange={e => setUploadName(e.target.value)}
                                    placeholder="Track name"
                                />
                            </div>

                            <div className="al-form-row">
                                <div className="al-form-group">
                                    <label>Category</label>
                                    <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}>
                                        {categories.filter(c => c.value !== 'all').map(c => (
                                            <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                                        ))}
                                    </select>
                                </div>
                                {tab === 'music' && (
                                    <>
                                        <div className="al-form-group">
                                            <label>Mood</label>
                                            <select value={uploadMood} onChange={e => setUploadMood(e.target.value)}>
                                                <option value="neutral">Neutral</option>
                                                <option value="happy">Happy</option>
                                                <option value="energetic">Energetic</option>
                                                <option value="calm">Calm</option>
                                                <option value="dark">Dark</option>
                                                <option value="romantic">Romantic</option>
                                                <option value="inspiring">Inspiring</option>
                                            </select>
                                        </div>
                                        <div className="al-form-group">
                                            <label>BPM</label>
                                            <input
                                                type="number"
                                                value={uploadBpm}
                                                onChange={e => setUploadBpm(e.target.value)}
                                                placeholder="120"
                                                min="1"
                                                max="300"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="al-modal-footer">
                            <button className="al-btn-cancel" onClick={() => setShowUploadForm(false)}>
                                Cancel
                            </button>
                            <button
                                className="al-upload-btn"
                                onClick={handleUpload}
                                disabled={!uploadFile || uploading}
                            >
                                {uploading ? (
                                    <><div className="al-spinner-sm" /> Uploading...</>
                                ) : (
                                    <><Upload size={16} /> Upload</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const audioLibraryCSS = `
.audio-library-page {
    padding: 24px 32px;
    max-width: 1200px;
    margin: 0 auto;
}

/* Header */
.al-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
}
.al-header-left {
    display: flex;
    align-items: center;
    gap: 16px;
}
.al-header-icon {
    width: 48px; height: 48px;
    border-radius: 14px;
    background: linear-gradient(135deg, #7c3aed, #6366f1);
    display: flex; align-items: center; justify-content: center;
    color: white;
    box-shadow: 0 4px 20px rgba(124, 58, 237, 0.3);
}
.al-title {
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary, #f3f4f6);
    margin: 0;
}
.al-subtitle {
    font-size: 13px;
    color: var(--text-tertiary, #6b7280);
    margin: 4px 0 0;
}
.al-upload-btn {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 20px;
    background: linear-gradient(135deg, #7c3aed, #6366f1);
    color: white;
    border: none; border-radius: 10px;
    font-size: 14px; font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}
.al-upload-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 20px rgba(124, 58, 237, 0.4);
}
.al-upload-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Tabs */
.al-tabs {
    display: flex;
    gap: 4px;
    background: var(--bg-secondary, rgba(255,255,255,0.04));
    border-radius: 12px;
    padding: 4px;
    margin-bottom: 20px;
}
.al-tab {
    flex: 1;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 10px 16px;
    background: transparent;
    color: var(--text-secondary, #9ca3af);
    border: none; border-radius: 9px;
    font-size: 14px; font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}
.al-tab:hover { color: var(--text-primary, #f3f4f6); }
.al-tab.active {
    background: linear-gradient(135deg, rgba(124,58,237,0.2), rgba(99,102,241,0.15));
    color: #a78bfa;
    box-shadow: 0 2px 8px rgba(124, 58, 237, 0.15);
}

/* Filters */
.al-filters {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 20px;
}
.al-search {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--bg-secondary, rgba(255,255,255,0.04));
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 10px;
    color: var(--text-secondary, #9ca3af);
}
.al-search input {
    flex: 1;
    background: none; border: none; outline: none;
    color: var(--text-primary, #f3f4f6);
    font-size: 14px;
}
.al-search input::placeholder { color: var(--text-tertiary, #6b7280); }
.al-search-clear {
    background: none; border: none; cursor: pointer;
    color: var(--text-tertiary, #6b7280);
    padding: 2px;
    display: flex;
}
.al-categories {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 4px;
}
.al-categories::-webkit-scrollbar { height: 4px; }
.al-categories::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
.al-cat-btn {
    display: flex; align-items: center; gap: 5px;
    padding: 6px 12px;
    background: var(--bg-secondary, rgba(255,255,255,0.04));
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--text-secondary, #9ca3af);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
}
.al-cat-btn:hover {
    border-color: rgba(124,58,237,0.3);
    color: var(--text-primary, #f3f4f6);
}
.al-cat-btn.active {
    background: rgba(124,58,237,0.15);
    border-color: rgba(124,58,237,0.4);
    color: #a78bfa;
}

/* Track List */
.al-track-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.al-track {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--bg-secondary, rgba(255,255,255,0.03));
    border: 1px solid transparent;
    border-radius: 10px;
    transition: all 0.2s;
}
.al-track:hover {
    background: var(--bg-tertiary, rgba(255,255,255,0.06));
    border-color: rgba(124,58,237,0.15);
}
.al-track.playing {
    background: rgba(124,58,237,0.08);
    border-color: rgba(124,58,237,0.3);
}

/* Play button */
.al-play-btn {
    width: 36px; height: 36px;
    border-radius: 50%;
    background: linear-gradient(135deg, #7c3aed, #6366f1);
    border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    color: white;
    flex-shrink: 0;
    transition: all 0.2s;
}
.al-play-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 12px rgba(124,58,237,0.4);
}

/* Waveform */
.al-waveform {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 30px;
    flex-shrink: 0;
    width: 100px;
}
.al-wave-bar {
    width: 3px;
    border-radius: 2px;
    background: linear-gradient(to top, #6366f1, #a78bfa);
    transition: opacity 0.3s;
}
.al-track.playing .al-wave-bar {
    animation: waveAnim 0.5s ease-in-out infinite alternate;
}
@keyframes waveAnim {
    from { transform: scaleY(0.6); }
    to { transform: scaleY(1.2); }
}

/* Track info */
.al-track-info {
    flex: 1;
    min-width: 0;
}
.al-track-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #f3f4f6);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.al-track-meta {
    display: flex;
    gap: 8px;
    margin-top: 3px;
}
.al-cat-badge, .al-mood-badge, .al-bpm-badge {
    font-size: 11px;
    padding: 1px 8px;
    border-radius: 6px;
    color: var(--text-secondary, #9ca3af);
    background: rgba(255,255,255,0.05);
}
.al-track-duration {
    font-size: 13px;
    color: var(--text-secondary, #9ca3af);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    width: 45px;
    text-align: right;
}
.al-track-size {
    font-size: 12px;
    color: var(--text-tertiary, #6b7280);
    flex-shrink: 0;
    width: 60px;
    text-align: right;
}
.al-delete-btn {
    width: 28px; height: 28px;
    border-radius: 6px;
    background: transparent;
    border: none; cursor: pointer;
    color: var(--text-tertiary, #6b7280);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    opacity: 0;
    transition: all 0.2s;
}
.al-track:hover .al-delete-btn { opacity: 1; }
.al-delete-btn:hover {
    background: rgba(239,68,68,0.15);
    color: #ef4444;
}

/* Empty state */
.al-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
}
.al-empty-icon { font-size: 48px; margin-bottom: 16px; }
.al-empty h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary, #f3f4f6);
    margin: 0 0 8px;
}
.al-empty p {
    font-size: 14px;
    color: var(--text-tertiary, #6b7280);
    margin: 0;
}
.al-spinner {
    width: 32px; height: 32px;
    border: 3px solid rgba(124,58,237,0.2);
    border-top-color: #7c3aed;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 12px;
}
.al-spinner-sm {
    width: 16px; height: 16px;
    border: 2px solid rgba(255,255,255,0.2);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Modal */
.al-modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.al-modal {
    background: var(--bg-primary, #12121a);
    border: 1px solid var(--border, rgba(255,255,255,0.1));
    border-radius: 16px;
    width: 480px;
    max-width: 90vw;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    animation: slideUp 0.2s;
}
@keyframes slideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}
.al-modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 24px 0;
}
.al-modal-header h2 {
    font-size: 18px; font-weight: 700;
    color: var(--text-primary, #f3f4f6);
    margin: 0;
}
.al-modal-close {
    background: none; border: none; cursor: pointer;
    color: var(--text-tertiary, #6b7280);
    padding: 4px;
    display: flex;
}
.al-modal-close:hover { color: var(--text-primary, #f3f4f6); }
.al-modal-body {
    padding: 20px 24px;
    display: flex; flex-direction: column; gap: 16px;
}

/* Dropzone */
.al-dropzone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 32px;
    border: 2px dashed rgba(124,58,237,0.3);
    border-radius: 12px;
    background: rgba(124,58,237,0.04);
    color: var(--text-secondary, #9ca3af);
    cursor: pointer;
    transition: all 0.2s;
}
.al-dropzone:hover, .al-dropzone.dragover {
    border-color: #7c3aed;
    background: rgba(124,58,237,0.1);
}
.al-dropzone.has-file {
    border-color: #22c55e;
    background: rgba(34,197,94,0.05);
}
.al-dropzone p { margin: 0; font-size: 14px; }
.al-dropzone-hint { font-size: 12px !important; color: var(--text-tertiary, #6b7280) !important; }
.al-dropzone-name { font-weight: 600; color: #22c55e !important; }
.al-dropzone-size { font-size: 12px !important; color: var(--text-tertiary, #6b7280) !important; }

/* Form */
.al-form-group {
    display: flex; flex-direction: column; gap: 6px;
}
.al-form-group label {
    font-size: 12px; font-weight: 600;
    color: var(--text-secondary, #9ca3af);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.al-form-group input, .al-form-group select {
    padding: 10px 12px;
    background: var(--bg-secondary, rgba(255,255,255,0.04));
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 8px;
    color: var(--text-primary, #f3f4f6);
    font-size: 14px;
    outline: none;
    transition: border-color 0.2s;
}
.al-form-group input:focus, .al-form-group select:focus {
    border-color: rgba(124,58,237,0.5);
}
.al-form-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 12px;
}
.al-modal-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 0 24px 20px;
}
.al-btn-cancel {
    padding: 10px 20px;
    background: var(--bg-secondary, rgba(255,255,255,0.04));
    color: var(--text-secondary, #9ca3af);
    border: 1px solid var(--border, rgba(255,255,255,0.08));
    border-radius: 10px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
}
.al-btn-cancel:hover {
    background: rgba(255,255,255,0.08);
    color: var(--text-primary, #f3f4f6);
}
`;
