import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Plus, Trash2, Volume2, X, Upload, Search } from 'lucide-react';

const API = 'http://localhost:5000/api';

const SFX_CATEGORIES = [
    { value: 'all', label: 'All', icon: '🔊' },
    { value: 'notification', label: 'Notification', icon: '🔔' },
    { value: 'impact', label: 'Impact', icon: '💥' },
    { value: 'reaction', label: 'Reaction', icon: '😂' },
    { value: 'transition', label: 'Transition', icon: '✨' },
    { value: 'game', label: 'Game', icon: '🎮' },
    { value: 'general', label: 'Other', icon: '📁' },
];

export default function SfxSelector({ clipId, clipDuration, onClose, onUpdate }) {
    const [sfxLibrary, setSfxLibrary] = useState([]);
    const [placedSfx, setPlacedSfx] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [playingId, setPlayingId] = useState(null);
    const [uploading, setUploading] = useState(false);
    const audioRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchLibrary();
        fetchPlaced();
        return () => { audioRef.current?.pause(); };
    }, []);

    const fetchLibrary = async () => {
        try {
            const res = await fetch(`${API}/sfx`);
            setSfxLibrary(await res.json());
        } catch (e) { console.error(e); }
    };

    const fetchPlaced = async () => {
        try {
            const res = await fetch(`${API}/sfx/clip/${clipId}`);
            setPlacedSfx(await res.json());
        } catch (e) { console.error(e); }
    };

    const filtered = sfxLibrary.filter(t => {
        if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;
        if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    const togglePlay = (id) => {
        if (playingId === id) {
            audioRef.current?.pause();
            setPlayingId(null);
        } else {
            audioRef.current?.pause();
            const audio = new Audio(`${API}/sfx/${id}/stream`);
            audio.play();
            audio.onended = () => setPlayingId(null);
            audioRef.current = audio;
            setPlayingId(id);
        }
    };

    const addSfxToClip = async (sfxTrackId) => {
        try {
            await fetch(`${API}/sfx/clip/${clipId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sfx_track_id: sfxTrackId, position: 0, volume: 80 })
            });
            fetchPlaced();
            if (onUpdate) onUpdate();
        } catch (e) { console.error(e); }
    };

    const removePlaced = async (id) => {
        try {
            await fetch(`${API}/sfx/clip-sfx/${id}`, { method: 'DELETE' });
            fetchPlaced();
            if (onUpdate) onUpdate();
        } catch (e) { console.error(e); }
    };

    const updatePlaced = async (id, field, value) => {
        try {
            await fetch(`${API}/sfx/clip-sfx/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value })
            });
            setPlacedSfx(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
        } catch (e) { console.error(e); }
    };

    const handleUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('name', file.name.replace(/\.[^.]+$/, ''));
            formData.append('category', selectedCategory === 'all' ? 'general' : selectedCategory);
            await fetch(`${API}/sfx`, { method: 'POST', body: formData });
            fetchLibrary();
        } catch (e) { console.error(e); }
        finally { setUploading(false); e.target.value = ''; }
    };

    const deleteSfx = async (id) => {
        if (!confirm('Delete this SFX?')) return;
        await fetch(`${API}/sfx/${id}`, { method: 'DELETE' });
        fetchLibrary();
        fetchPlaced();
    };

    const fmt = (s) => {
        if (!s) return '0.0s';
        return s < 1 ? `${(s * 1000).toFixed(0)}ms` : `${s.toFixed(1)}s`;
    };

    return (
        <div className="music-selector-overlay" onClick={onClose}>
            <div className="music-selector" onClick={e => e.stopPropagation()} style={{ width: 560 }}>
                {/* Header */}
                <div className="music-header">
                    <div className="music-title">
                        <span style={{ fontSize: 20 }}>🔊</span>
                        <h3>Sound Effects</h3>
                    </div>
                    <button className="music-close" onClick={onClose}><X size={18} /></button>
                </div>

                {/* Placed SFX on this clip */}
                {placedSfx.length > 0 && (
                    <div style={{ padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                            SFX on this clip ({placedSfx.length})
                        </div>
                        {placedSfx.map(sfx => (
                            <div key={sfx.id} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 8px', background: 'rgba(124,58,237,0.08)',
                                borderRadius: 8, marginBottom: 4, fontSize: 12
                            }}>
                                <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{sfx.name}</span>
                                <span style={{ color: 'var(--text-muted)' }}>@</span>
                                <input
                                    type="number"
                                    value={sfx.position}
                                    min={0}
                                    max={clipDuration || 60}
                                    step={0.1}
                                    onChange={e => updatePlaced(sfx.id, 'position', parseFloat(e.target.value) || 0)}
                                    style={{
                                        width: 55, background: 'var(--bg-deep)', border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 4, color: 'var(--text-primary)', padding: '2px 4px', fontSize: 12, textAlign: 'center'
                                    }}
                                />
                                <span style={{ color: 'var(--text-muted)' }}>s</span>
                                <Volume2 size={12} style={{ color: 'var(--text-muted)', marginLeft: 4 }} />
                                <input
                                    type="range" min={0} max={100} value={sfx.volume}
                                    onChange={e => updatePlaced(sfx.id, 'volume', parseInt(e.target.value))}
                                    style={{ width: 60, height: 3 }}
                                />
                                <span style={{ color: 'var(--text-muted)', minWidth: 28 }}>{sfx.volume}%</span>
                                <button onClick={() => removePlaced(sfx.id)}
                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2 }}>
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Search & Upload */}
                <div className="music-toolbar">
                    <div className="music-search">
                        <Search size={16} />
                        <input type="text" placeholder="Search SFX..." value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)} />
                    </div>
                    <button className="music-upload-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                        <Upload size={16} /> {uploading ? '...' : 'Upload'}
                    </button>
                    <input ref={fileInputRef} type="file" accept=".mp3,.wav,.ogg" onChange={handleUpload} style={{ display: 'none' }} />
                </div>

                {/* Categories */}
                <div className="music-categories">
                    {SFX_CATEGORIES.map(cat => (
                        <button key={cat.value}
                            className={`music-cat-btn ${selectedCategory === cat.value ? 'active' : ''}`}
                            onClick={() => setSelectedCategory(cat.value)}>
                            <span>{cat.icon}</span><span>{cat.label}</span>
                        </button>
                    ))}
                </div>

                {/* SFX Library */}
                <div className="music-tracks">
                    {filtered.length === 0 ? (
                        <div className="music-empty">
                            <span style={{ fontSize: 32 }}>🔊</span>
                            <p>No SFX found</p>
                            <p className="music-empty-sub">Upload WAV/MP3 sound effects</p>
                        </div>
                    ) : filtered.map(sfx => (
                        <div key={sfx.id} className="music-track">
                            <button className="music-play-btn"
                                onClick={() => togglePlay(sfx.id)}
                                style={playingId === sfx.id ? { background: 'var(--accent-primary)', color: '#fff' } : {}}>
                                {playingId === sfx.id ? <Pause size={16} /> : <Play size={16} />}
                            </button>
                            <div className="music-track-info">
                                <span className="music-track-name">{sfx.name}</span>
                                <span className="music-track-meta">{sfx.category} • {fmt(sfx.duration)}</span>
                            </div>
                            <button onClick={() => addSfxToClip(sfx.id)}
                                style={{
                                    background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)',
                                    color: 'var(--accent-primary)', borderRadius: 6, padding: '4px 8px',
                                    cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3
                                }}>
                                <Plus size={12} /> Add
                            </button>
                            <button className="music-delete-btn" onClick={() => deleteSfx(sfx.id)}>
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="music-actions">
                    <button className="music-cancel-btn" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}
