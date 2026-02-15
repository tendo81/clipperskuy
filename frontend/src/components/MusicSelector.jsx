import { useState, useEffect, useRef } from 'react';
import { Music, Play, Pause, Plus, Trash2, Volume2, X, Upload, Search } from 'lucide-react';

const API = 'http://localhost:5000/api';

const CATEGORIES = [
    { value: 'all', label: 'All', icon: '🎵' },
    { value: 'energetic', label: 'Energetic', icon: '⚡' },
    { value: 'chill', label: 'Chill', icon: '😎' },
    { value: 'cinematic', label: 'Cinematic', icon: '🎬' },
    { value: 'funny', label: 'Funny', icon: '😂' },
    { value: 'motivational', label: 'Motivational', icon: '💪' },
    { value: 'sad', label: 'Sad', icon: '😢' },
    { value: 'general', label: 'Other', icon: '📁' },
];

export default function MusicSelector({ clipId, currentTrackId, currentVolume, onSelect, onClose }) {
    const [tracks, setTracks] = useState([]);
    const [filteredTracks, setFilteredTracks] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [playingId, setPlayingId] = useState(null);
    const [volume, setVolume] = useState(currentVolume || 20);
    const [selectedTrackId, setSelectedTrackId] = useState(currentTrackId || null);
    const [uploading, setUploading] = useState(false);
    const audioRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        fetchTracks();
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        let filtered = tracks;
        if (selectedCategory !== 'all') {
            filtered = filtered.filter(t => t.category === selectedCategory);
        }
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(t =>
                t.name.toLowerCase().includes(q) ||
                (t.mood && t.mood.toLowerCase().includes(q))
            );
        }
        setFilteredTracks(filtered);
    }, [tracks, selectedCategory, searchQuery]);

    const fetchTracks = async () => {
        try {
            const res = await fetch(`${API}/music`);
            const data = await res.json();
            setTracks(data);
        } catch (err) {
            console.error('Failed to fetch music:', err);
        }
    };

    const togglePlay = (trackId) => {
        if (playingId === trackId) {
            audioRef.current?.pause();
            setPlayingId(null);
        } else {
            if (audioRef.current) audioRef.current.pause();
            const audio = new Audio(`${API}/music/${trackId}/stream`);
            audio.volume = volume / 100;
            audio.play();
            audio.onended = () => setPlayingId(null);
            audioRef.current = audio;
            setPlayingId(trackId);
        }
    };

    const handleSelect = () => {
        if (onSelect) {
            onSelect(selectedTrackId, volume);
        }
    };

    const handleRemoveMusic = () => {
        setSelectedTrackId(null);
        if (onSelect) onSelect(null, 0);
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

            const res = await fetch(`${API}/music`, {
                method: 'POST',
                body: formData
            });
            if (res.ok) {
                await fetchTracks();
            }
        } catch (err) {
            console.error('Upload failed:', err);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleDelete = async (trackId) => {
        if (!confirm('Delete this track?')) return;
        try {
            await fetch(`${API}/music/${trackId}`, { method: 'DELETE' });
            if (selectedTrackId === trackId) setSelectedTrackId(null);
            if (playingId === trackId) {
                audioRef.current?.pause();
                setPlayingId(null);
            }
            fetchTracks();
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="music-selector-overlay" onClick={onClose}>
            <div className="music-selector" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="music-header">
                    <div className="music-title">
                        <Music size={20} />
                        <h3>Background Music</h3>
                    </div>
                    <button className="music-close" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                {/* Search & Upload */}
                <div className="music-toolbar">
                    <div className="music-search">
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Search tracks..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <button
                        className="music-upload-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                    >
                        <Upload size={16} />
                        {uploading ? 'Uploading...' : 'Upload'}
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".mp3,.wav,.ogg,.m4a,.aac"
                        onChange={handleUpload}
                        style={{ display: 'none' }}
                    />
                </div>

                {/* Categories */}
                <div className="music-categories">
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.value}
                            className={`music-cat-btn ${selectedCategory === cat.value ? 'active' : ''}`}
                            onClick={() => setSelectedCategory(cat.value)}
                        >
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                        </button>
                    ))}
                </div>

                {/* Track List */}
                <div className="music-tracks">
                    {filteredTracks.length === 0 ? (
                        <div className="music-empty">
                            <Music size={32} opacity={0.3} />
                            <p>No tracks found</p>
                            <p className="music-empty-sub">Upload MP3 files to build your music library</p>
                        </div>
                    ) : (
                        filteredTracks.map(track => (
                            <div
                                key={track.id}
                                className={`music-track ${selectedTrackId === track.id ? 'selected' : ''} ${playingId === track.id ? 'playing' : ''}`}
                                onClick={() => setSelectedTrackId(track.id)}
                            >
                                <button
                                    className="music-play-btn"
                                    onClick={(e) => { e.stopPropagation(); togglePlay(track.id); }}
                                >
                                    {playingId === track.id ? <Pause size={16} /> : <Play size={16} />}
                                </button>

                                <div className="music-track-info">
                                    <span className="music-track-name">{track.name}</span>
                                    <span className="music-track-meta">
                                        {track.category} • {formatDuration(track.duration)}
                                        {track.bpm > 0 && ` • ${track.bpm} BPM`}
                                    </span>
                                </div>

                                <button
                                    className="music-delete-btn"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(track.id); }}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Volume Control */}
                <div className="music-volume">
                    <Volume2 size={16} />
                    <span className="music-vol-label">Music Volume</span>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={volume}
                        onChange={e => {
                            const v = parseInt(e.target.value);
                            setVolume(v);
                            if (audioRef.current) audioRef.current.volume = v / 100;
                        }}
                    />
                    <span className="music-vol-value">{volume}%</span>
                </div>

                {/* Actions */}
                <div className="music-actions">
                    {currentTrackId && (
                        <button className="music-remove-btn" onClick={handleRemoveMusic}>
                            <X size={16} /> Remove Music
                        </button>
                    )}
                    <button className="music-cancel-btn" onClick={onClose}>Cancel</button>
                    <button
                        className="music-apply-btn"
                        onClick={handleSelect}
                        disabled={!selectedTrackId}
                    >
                        <Plus size={16} /> Apply Music
                    </button>
                </div>
            </div>
        </div>
    );
}
