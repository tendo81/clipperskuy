import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FolderOpen, Scissors, Clock, Plus, ArrowRight, Sparkles, TrendingUp, Zap, Trash2, Film, Download, Music } from 'lucide-react';

const API = 'http://localhost:5000/api';

const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: (i) => ({
        opacity: 1, y: 0,
        transition: { delay: i * 0.08, duration: 0.4, ease: [0.4, 0, 0.2, 1] }
    })
};

function formatDuration(seconds) {
    if (!seconds) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function formatSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

const statusConfig = {
    uploaded: { label: 'Uploaded', cls: 'badge-info' },
    transcribing: { label: 'Transcribing...', cls: 'badge-warning' },
    analyzing: { label: 'Analyzing...', cls: 'badge-warning' },
    clipping: { label: 'Clipping...', cls: 'badge-warning' },
    completed: { label: 'Completed', cls: 'badge-success' },
    failed: { label: 'Failed', cls: 'badge-error' },
};

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalProjects: 0, totalClips: 0, completedProjects: 0,
        totalDuration: 0, exportedClips: 0, clipsDuration: 0,
        favCaptionStyle: 'hormozi', musicTracks: 0
    });
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [statsRes, projRes] = await Promise.all([
                fetch(`${API}/projects/stats/overview`),
                fetch(`${API}/projects`)
            ]);
            const statsData = await statsRes.json();
            const projData = await projRes.json();
            setStats(statsData);
            setProjects(projData.projects?.slice(0, 6) || []);
        } catch (err) {
            console.error('Failed to load data:', err);
        } finally {
            setLoading(false);
        }
    };

    const deleteProject = async (id, e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!confirm('Delete this project?')) return;
        try {
            await fetch(`${API}/projects/${id}`, { method: 'DELETE' });
            loadData();
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const statCards = [
        { icon: FolderOpen, label: 'Projects', value: stats.totalProjects, color: 'purple' },
        { icon: Scissors, label: 'Clips Generated', value: stats.totalClips, color: 'cyan' },
        { icon: Download, label: 'Exported', value: stats.exportedClips, color: 'green' },
        { icon: Clock, label: 'Clips Duration', value: formatDuration(stats.clipsDuration), color: 'amber' },
        { icon: TrendingUp, label: 'Completed', value: stats.completedProjects, color: 'purple' },
        { icon: Music, label: 'Music Tracks', value: stats.musicTracks, color: 'cyan' },
    ];

    return (
        <>
            <div className="page-header">
                <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4 }}>
                    Welcome to ClipperSkuy ⚡
                </motion.h1>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
                    AI-powered video clipping engine — turn long videos into viral short clips
                </motion.p>
            </div>

            <div className="page-body">
                {/* Stats */}
                <div className="stats-grid">
                    {statCards.map((stat, i) => {
                        const Icon = stat.icon;
                        return (
                            <motion.div key={stat.label} className="stat-card" custom={i} initial="hidden" animate="visible" variants={fadeIn}>
                                <div className={`stat-icon ${stat.color}`}><Icon size={24} /></div>
                                <div>
                                    <div className="stat-value">{loading ? '—' : stat.value}</div>
                                    <div className="stat-label">{stat.label}</div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Quick actions */}
                <motion.div className="section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                    <div className="section-title"><Sparkles size={18} /> Quick Start</div>
                    <div className="projects-grid">
                        <Link to="/upload" style={{ textDecoration: 'none' }}>
                            <div className="new-project-card">
                                <div className="plus-icon"><Plus size={24} /></div>
                                <span style={{ fontWeight: 600, fontSize: 14 }}>New Project</span>
                                <span style={{ fontSize: 12 }}>Upload video or paste URL</span>
                            </div>
                        </Link>
                    </div>
                </motion.div>

                {/* Recent projects */}
                <motion.div className="section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span className="section-title" style={{ margin: 0 }}>
                            <FolderOpen size={18} /> Recent Projects
                        </span>
                        {projects.length > 0 && (
                            <Link to="/projects" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>
                                View All <ArrowRight size={14} />
                            </Link>
                        )}
                    </div>

                    {projects.length === 0 ? (
                        <div className="empty-state">
                            <Zap size={48} />
                            <h3>No projects yet</h3>
                            <p className="text-muted" style={{ marginBottom: 16 }}>Upload your first video to get started with AI clipping</p>
                            <Link to="/upload" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                                <Plus size={18} /> Create First Project
                            </Link>
                        </div>
                    ) : (
                        <div className="projects-grid">
                            {projects.map((p, i) => {
                                const st = statusConfig[p.status] || statusConfig.uploaded;
                                return (
                                    <motion.div key={p.id} custom={i} initial="hidden" animate="visible" variants={fadeIn}>
                                        <Link to={`/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                                            <div className="project-card">
                                                <div className="card-thumb">
                                                    {p.thumbnail_path ? (
                                                        <img src={`http://localhost:5000/data/${p.thumbnail_path}`} alt={p.name} />
                                                    ) : (
                                                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            <Film size={36} style={{ color: 'var(--text-muted)' }} />
                                                        </div>
                                                    )}
                                                    {p.duration > 0 && (
                                                        <div className="duration-badge">{formatDuration(p.duration)}</div>
                                                    )}
                                                </div>
                                                <div className="card-info">
                                                    <div className="project-name">{p.name}</div>
                                                    <div className="project-meta">
                                                        <span className={`badge ${st.cls}`}>{st.label}</span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <span>{p.clip_count || 0} clips</span>
                                                            <button onClick={(e) => deleteProject(p.id, e)} className="btn btn-ghost btn-icon" style={{ width: 28, height: 28, color: 'var(--text-muted)' }}>
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </Link>
                                    </motion.div>
                                );
                            })}
                            <Link to="/upload" style={{ textDecoration: 'none' }}>
                                <div className="new-project-card">
                                    <div className="plus-icon"><Plus size={24} /></div>
                                    <span style={{ fontWeight: 600, fontSize: 14 }}>New Project</span>
                                </div>
                            </Link>
                        </div>
                    )}
                </motion.div>
            </div>
        </>
    );
}
