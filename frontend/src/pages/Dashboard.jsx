import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FolderOpen, Scissors, Clock, Plus, ArrowRight, Sparkles, TrendingUp, Zap, Trash2, Film, Download, Music, BarChart3, Target, Timer, Award, Flame, Star } from 'lucide-react';

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

const reframeModeLabels = {
    center: '🎯 Center',
    fit: '🔲 Fit',
    face_track: '👤 Face Track',
    split: '📱 Split Screen'
};

const platformLabels = {
    tiktok: '🎵 TikTok',
    instagram: '📸 Instagram',
    youtube: '▶️ YouTube'
};

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalProjects: 0, totalClips: 0, completedProjects: 0,
        totalDuration: 0, exportedClips: 0, clipsDuration: 0,
        favCaptionStyle: 'hormozi', musicTracks: 0,
        avgVirality: 0, topReframingMode: 'center', topPlatform: 'tiktok',
        timeSavedMinutes: 0, topClips: [], dailyActivity: [],
        viralityDistribution: { low: 0, medium: 0, high: 0, viral: 0 }
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
        { icon: Target, label: 'Avg Virality', value: `${stats.avgVirality}/100`, color: 'amber' },
        { icon: Timer, label: 'Time Saved', value: stats.timeSavedMinutes >= 60 ? `${Math.round(stats.timeSavedMinutes / 60)}h` : `${stats.timeSavedMinutes}m`, color: 'green' },
        { icon: Clock, label: 'Content Duration', value: formatDuration(stats.clipsDuration), color: 'purple' },
    ];

    // Virality distribution bar chart
    const viralDist = stats.viralityDistribution || { low: 0, medium: 0, high: 0, viral: 0 };
    const viralTotal = viralDist.low + viralDist.medium + viralDist.high + viralDist.viral || 1;
    const viralBars = [
        { label: 'Low', value: viralDist.low, pct: (viralDist.low / viralTotal * 100), color: '#6b7280' },
        { label: 'Medium', value: viralDist.medium, pct: (viralDist.medium / viralTotal * 100), color: '#f59e0b' },
        { label: 'High', value: viralDist.high, pct: (viralDist.high / viralTotal * 100), color: '#10b981' },
        { label: '🔥 Viral', value: viralDist.viral, pct: (viralDist.viral / viralTotal * 100), color: '#ef4444' },
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

                {/* Analytics Section */}
                {!loading && stats.totalClips > 0 && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>

                        {/* Virality Distribution */}
                        <div className="card" style={{ padding: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontWeight: 700, fontSize: 14 }}>
                                <BarChart3 size={18} style={{ color: 'var(--color-accent)' }} />
                                Virality Distribution
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {viralBars.map(bar => (
                                    <div key={bar.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: 12, width: 60, color: 'var(--text-muted)' }}>{bar.label}</span>
                                        <div style={{ flex: 1, height: 22, background: 'var(--bg-secondary)', borderRadius: 6, overflow: 'hidden', position: 'relative' }}>
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.max(bar.pct, 2)}%` }}
                                                transition={{ duration: 0.8, delay: 0.5 }}
                                                style={{ height: '100%', background: bar.color, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6 }}
                                            >
                                                {bar.value > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{bar.value}</span>}
                                            </motion.div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Quick Insights */}
                        <div className="card" style={{ padding: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontWeight: 700, fontSize: 14 }}>
                                <Sparkles size={18} style={{ color: 'var(--color-accent)' }} />
                                Quick Insights
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Favorite Platform</span>
                                    <span style={{ fontSize: 13, fontWeight: 600 }}>{platformLabels[stats.topPlatform] || stats.topPlatform}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Top Reframing</span>
                                    <span style={{ fontSize: 13, fontWeight: 600 }}>{reframeModeLabels[stats.topReframingMode] || stats.topReframingMode}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Caption Style</span>
                                    <span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{stats.favCaptionStyle}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Export Rate</span>
                                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                                        {stats.totalClips > 0 ? Math.round((stats.exportedClips / stats.totalClips) * 100) : 0}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Top Clips */}
                {!loading && stats.topClips?.length > 0 && (
                    <motion.div className="section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                        <div className="section-title"><Award size={18} /> Top Viral Clips</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {stats.topClips.map((clip, i) => (
                                <div key={clip.id} style={{
                                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                                    background: 'var(--bg-secondary)', borderRadius: 10,
                                    borderLeft: `3px solid ${clip.virality_score >= 85 ? '#ef4444' : clip.virality_score >= 65 ? '#10b981' : '#f59e0b'}`
                                }}>
                                    <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 14, width: 20 }}>#{i + 1}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {clip.title}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                            {clip.project_name?.substring(0, 40)} · {formatDuration(clip.duration)}
                                        </div>
                                    </div>
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                                        borderRadius: 20, fontWeight: 700, fontSize: 13,
                                        background: clip.virality_score >= 85 ? 'rgba(239,68,68,0.15)' : clip.virality_score >= 65 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                                        color: clip.virality_score >= 85 ? '#ef4444' : clip.virality_score >= 65 ? '#10b981' : '#f59e0b'
                                    }}>
                                        {clip.virality_score >= 85 && <Flame size={14} />}
                                        {clip.virality_score >= 65 && clip.virality_score < 85 && <Star size={14} />}
                                        {clip.virality_score}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

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
