import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, Plus, Zap, Trash2, Film, Clock, Search, Filter, MoreVertical, Monitor, Smartphone, RefreshCw } from 'lucide-react';

const API = 'http://localhost:5000/api';

function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

const statusConfig = {
    uploaded: { label: 'Uploaded', cls: 'badge-info' },
    transcribing: { label: 'Transcribing', cls: 'badge-warning' },
    analyzing: { label: 'Analyzing', cls: 'badge-warning' },
    clipping: { label: 'Clipping', cls: 'badge-warning' },
    completed: { label: 'Completed', cls: 'badge-success' },
    failed: { label: 'Failed', cls: 'badge-error' },
};

const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: (i) => ({
        opacity: 1, y: 0,
        transition: { delay: i * 0.06, duration: 0.35 }
    })
};

export default function Projects() {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/projects`);
            const data = await res.json();
            setProjects(data.projects || []);
        } catch (err) {
            console.error('Failed to load projects:', err);
        } finally {
            setLoading(false);
        }
    };

    const deleteProject = async (id, e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('Delete this project and all its clips?')) return;
        try {
            await fetch(`${API}/projects/${id}`, { method: 'DELETE' });
            setProjects(prev => prev.filter(p => p.id !== id));
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    // Filtered projects
    const filtered = projects.filter(p => {
        const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchStatus = filterStatus === 'all' || p.status === filterStatus;
        return matchSearch && matchStatus;
    });

    return (
        <>
            <div className="page-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>Projects</motion.h1>
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                            {projects.length} project{projects.length !== 1 ? 's' : ''} total
                        </motion.p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-icon" onClick={loadProjects} title="Refresh">
                            <RefreshCw size={18} />
                        </button>
                        <Link to="/upload" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                            <Plus size={18} /> New Project
                        </Link>
                    </div>
                </div>

                {/* Search & Filter */}
                {projects.length > 0 && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
                        style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
                            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                            <input type="text" className="input-field" placeholder="Search projects..."
                                style={{ paddingLeft: 36 }} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                        </div>
                        <div className="chip-group">
                            {['all', 'uploaded', 'completed', 'failed'].map(s => (
                                <button key={s} className={`chip ${filterStatus === s ? 'active' : ''}`} onClick={() => setFilterStatus(s)}
                                    style={{ textTransform: 'capitalize', fontSize: 12, padding: '5px 12px' }}>
                                    {s === 'all' ? '📋 All' : s}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </div>

            <div className="page-body">
                {loading ? (
                    <div className="projects-grid">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="project-card">
                                <div className="card-thumb skeleton" style={{ height: 140 }} />
                                <div className="card-info">
                                    <div className="skeleton" style={{ height: 16, width: '70%', marginBottom: 8 }} />
                                    <div className="skeleton" style={{ height: 12, width: '40%' }} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filtered.length === 0 && projects.length === 0 ? (
                    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                        <div className="empty-state" style={{ minHeight: 400 }}>
                            <div style={{
                                width: 80, height: 80, borderRadius: '50%', background: 'rgba(124,58,237,0.08)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20
                            }}>
                                <FolderOpen size={36} style={{ color: 'var(--accent-primary)', opacity: 0.6 }} />
                            </div>
                            <h3>No projects yet</h3>
                            <p className="text-muted" style={{ maxWidth: 360, marginBottom: 20 }}>
                                Your video projects will appear here. Upload a video to create your first AI-powered clip collection.
                            </p>
                            <Link to="/upload" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                                <Zap size={18} /> Create First Project
                            </Link>
                        </div>
                    </motion.div>
                ) : filtered.length === 0 ? (
                    <div className="empty-state" style={{ minHeight: 200 }}>
                        <Search size={36} style={{ opacity: 0.4, marginBottom: 12 }} />
                        <h3>No matching projects</h3>
                        <p className="text-muted">Try a different search or filter</p>
                    </div>
                ) : (
                    <div className="projects-grid">
                        <AnimatePresence>
                            {filtered.map((p, i) => {
                                const st = statusConfig[p.status] || statusConfig.uploaded;
                                return (
                                    <motion.div key={p.id} custom={i} initial="hidden" animate="visible" exit={{ opacity: 0, scale: 0.9 }} variants={fadeIn}>
                                        <Link to={`/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                                            <div className="project-card">
                                                <div className="card-thumb">
                                                    {p.thumbnail_path ? (
                                                        <img src={`http://localhost:5000/data/${p.thumbnail_path}`} alt={p.name} />
                                                    ) : (
                                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface)' }}>
                                                            <Film size={36} style={{ color: 'var(--text-muted)' }} />
                                                        </div>
                                                    )}
                                                    {p.duration > 0 && (
                                                        <div className="duration-badge">{formatDuration(p.duration)}</div>
                                                    )}
                                                    {p.width > 0 && (
                                                        <div style={{
                                                            position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,0.7)', padding: '2px 6px',
                                                            borderRadius: 4, fontSize: 10, fontWeight: 600, backdropFilter: 'blur(4px)'
                                                        }}>
                                                            {p.width}×{p.height}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="card-info">
                                                    <div className="project-name">{p.name}</div>
                                                    <div className="project-meta">
                                                        <span className={`badge ${st.cls}`}>{st.label}</span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            {p.file_size > 0 && <span style={{ fontSize: 11 }}>{formatSize(p.file_size)}</span>}
                                                            <button onClick={(e) => deleteProject(p.id, e)} className="btn btn-ghost btn-icon"
                                                                style={{ width: 26, height: 26, color: 'var(--text-muted)' }}>
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                                        {formatDate(p.created_at)}
                                                        {p.clip_count > 0 && ` • ${p.clip_count} clips`}
                                                        {p.platform && ` • ${p.platform}`}
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>

                        <Link to="/upload" style={{ textDecoration: 'none' }}>
                            <div className="new-project-card">
                                <div className="plus-icon"><Plus size={24} /></div>
                                <span style={{ fontWeight: 600, fontSize: 14 }}>New Project</span>
                            </div>
                        </Link>
                    </div>
                )}
            </div>
        </>
    );
}
