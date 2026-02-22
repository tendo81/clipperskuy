import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Key, Plus, Trash2, RefreshCw, Copy, CheckCircle, XCircle, AlertTriangle, Crown, Zap, Hash, Users, BarChart3, Ban, Unlock, Download, Clock, Timer, RotateCcw, Lock, UserCheck, ArrowUpCircle, FileText, Filter } from 'lucide-react';

const API = 'http://localhost:5000/api';

export default function Admin() {
    // ===== Admin Auth Gate =====
    const [authenticated, setAuthenticated] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [authError, setAuthError] = useState('');
    const [authLoading, setAuthLoading] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null); // { type, id, key, fn }
    const [showChangePw, setShowChangePw] = useState(false);
    const [currentPw, setCurrentPw] = useState('');
    const [newPw, setNewPw] = useState('');
    const [pwMsg, setPwMsg] = useState('');

    // Check if already authenticated this session
    useEffect(() => {
        const saved = sessionStorage.getItem('admin_password');
        if (saved) {
            setAdminPassword(saved);
            setAuthenticated(true);
        }
    }, []);

    const handleLogin = async () => {
        setAuthLoading(true);
        setAuthError('');
        try {
            const res = await fetch(`${API}/admin/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: passwordInput })
            });
            const data = await res.json();
            if (data.success) {
                setAdminPassword(passwordInput);
                sessionStorage.setItem('admin_password', passwordInput);
                setAuthenticated(true);
            } else {
                setAuthError(data.error || 'Wrong password');
            }
        } catch (e) {
            setAuthError('Connection error');
        }
        setAuthLoading(false);
    };

    // Helper to create fetch with admin auth header
    const adminFetch = (url, options = {}) => {
        return fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                'x-admin-password': adminPassword
            }
        });
    };

    const [keys, setKeys] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [msg, setMsg] = useState('');

    // Generate form
    const [genTier, setGenTier] = useState('pro');
    const [genCount, setGenCount] = useState(1);
    const [genNotes, setGenNotes] = useState('');
    const [genCustomKey, setGenCustomKey] = useState('');
    const [showGenForm, setShowGenForm] = useState(false);
    const [copiedId, setCopiedId] = useState(null);
    const [genDuration, setGenDuration] = useState(0);
    const [genMaxAct, setGenMaxAct] = useState(1);

    // Upgrade modal state
    const [upgradeModal, setUpgradeModal] = useState(null); // { id, key, currentTier, currentDuration }
    const [upgradeTier, setUpgradeTier] = useState('pro');
    const [upgradeDuration, setUpgradeDuration] = useState(0);
    const [upgrading, setUpgrading] = useState(false);

    // Audit log state
    const [showLogs, setShowLogs] = useState(false);
    const [auditLogs, setAuditLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logFilter, setLogFilter] = useState('');

    const loadLogs = async (filter = '') => {
        setLogsLoading(true);
        try {
            const url = filter
                ? `${API}/admin/logs?action=${filter}&limit=100`
                : `${API}/admin/logs?limit=100`;
            const res = await adminFetch(url);
            const data = await res.json();
            setAuditLogs(data.logs || data.recentActivity || []);
        } catch (err) {
            setMsg(`❌ Error loading logs: ${err.message}`);
        } finally {
            setLogsLoading(false);
        }
    };

    const loadData = async () => {
        try {
            const [keysRes, statsRes] = await Promise.all([
                adminFetch(`${API}/admin/licenses`).then(r => r.json()),
                adminFetch(`${API}/admin/stats`).then(r => r.json())
            ]);
            setKeys(keysRes.keys || []);
            setStats(statsRes);
        } catch (err) {
            setMsg(`Error loading: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (authenticated) loadData(); }, [authenticated]);

    const generateKeys = async () => {
        try {
            setGenerating(true);
            setMsg('');
            const res = await adminFetch(`${API}/admin/licenses/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier: genTier,
                    count: genCount,
                    notes: genNotes,
                    customKey: genCustomKey || undefined,
                    duration_days: genDuration,
                    max_activations: genMaxAct
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setMsg(`✅ ${data.message}`);
            setShowGenForm(false);
            setGenCustomKey('');
            setGenNotes('');
            setGenCount(1);
            setGenDuration(0);
            setGenMaxAct(1);
            loadData();
        } catch (err) {
            setMsg(`❌ ${err.message}`);
        } finally {
            setGenerating(false);
        }
    };

    const revokeKey = async (id) => {
        if (!confirm('Revoke this license key?')) return;
        try {
            await adminFetch(`${API}/admin/licenses/${id}/revoke`, { method: 'PUT' });
            setMsg('Key revoked');
            loadData();
        } catch (err) {
            setMsg(`Error: ${err.message}`);
        }
    };

    const reactivateKey = async (id) => {
        try {
            await adminFetch(`${API}/admin/licenses/${id}/activate`, { method: 'PUT' });
            setMsg('Key re-activated');
            loadData();
        } catch (err) {
            setMsg(`Error: ${err.message}`);
        }
    };

    const deleteKey = (id, key) => {
        setConfirmAction({
            type: 'delete',
            id, key,
            message: `Delete key ${key}? This cannot be undone.`,
            fn: async () => {
                try {
                    await adminFetch(`${API}/admin/licenses/${id}`, { method: 'DELETE' });
                    setMsg('✅ Key deleted');
                    loadData();
                } catch (err) { setMsg(`❌ Error: ${err.message}`); }
                setConfirmAction(null);
            }
        });
    };

    const resetActivations = (id, key) => {
        setConfirmAction({
            type: 'reset',
            id, key,
            message: `Reset semua aktivasi untuk key ${key}? Key akan bisa dipakai di perangkat baru.`,
            fn: async () => {
                try {
                    const res = await adminFetch(`${API}/admin/licenses/${id}/reset`, { method: 'PUT' });
                    const data = await res.json();
                    setMsg(`✅ ${data.message}`);
                    loadData();
                } catch (err) { setMsg(`❌ Error: ${err.message}`); }
                setConfirmAction(null);
            }
        });
    };

    const markUsed = (id, key) => {
        setConfirmAction({
            type: 'mark-used',
            id, key,
            message: `Tandai key ${key} sebagai sudah digunakan? (untuk key yang sudah diaktivasi di komputer lain)`,
            fn: async () => {
                try {
                    const res = await adminFetch(`${API}/admin/licenses/${id}/mark-used`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                    const data = await res.json();
                    setMsg(`✅ ${data.message}`);
                    loadData();
                } catch (err) { setMsg(`❌ Error: ${err.message}`); }
                setConfirmAction(null);
            }
        });
    };

    // ===== Upgrade Key =====
    const openUpgrade = (k) => {
        setUpgradeTier(k.tier || 'pro');
        setUpgradeDuration(k.duration_days || 0);
        setUpgradeModal({ id: k.id, key: k.license_key, currentTier: k.tier, currentDuration: k.duration_days || 0 });
    };

    const doUpgrade = async () => {
        if (!upgradeModal) return;
        try {
            setUpgrading(true);
            const res = await adminFetch(`${API}/admin/licenses/${upgradeModal.id}/upgrade`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tier: upgradeTier, duration_days: upgradeDuration })
            });
            const data = await res.json();
            if (data.error) {
                setMsg(`❌ ${data.error}`);
            } else {
                setMsg(`✅ ${data.message}\nKey Baru: ${data.newKey}`);
                // Auto-copy new key
                try { await navigator.clipboard.writeText(data.newKey); } catch (e) { }
            }
            setUpgradeModal(null);
            loadData();
        } catch (err) {
            setMsg(`❌ Error: ${err.message}`);
        } finally {
            setUpgrading(false);
        }
    };

    const copyKey = (key, id) => {
        navigator.clipboard.writeText(key);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);

        // If key is active with 0 activations, ask to mark as used
        const keyData = keys.find(k => k.id === id);
        if (keyData && keyData.status === 'active' && (keyData.activation_count || 0) === 0) {
            setTimeout(() => {
                setConfirmAction({
                    type: 'mark-used',
                    id, key,
                    message: `Key "${key}" sudah di-copy!\n\nTandai sebagai sudah digunakan?\n(klik Ya jika key ini akan diberikan ke user)`,
                    fn: async () => {
                        try {
                            const res = await adminFetch(`${API}/admin/licenses/${id}/mark-used`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                            const data = await res.json();
                            setMsg(`✅ ${data.message}`);
                            loadData();
                        } catch (err) { setMsg(`❌ Error: ${err.message}`); }
                        setConfirmAction(null);
                    }
                });
            }, 300);
        }
    };

    const exportKeys = () => {
        const csv = ['Key,Tier,Status,Machine ID,Notes,Created At,Activated At'];
        keys.forEach(k => {
            csv.push(`${k.license_key},${k.tier},${k.status},${k.machine_id || ''},${(k.notes || '').replace(/,/g, ';')},${k.created_at},${k.activated_at || ''}`);
        });
        const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clipperskuy_licenses_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const statusBadge = (status) => {
        const styles = {
            active: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: '● Active' },
            used: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6', label: '● Used' },
            revoked: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: '● Revoked' },
            expired: { bg: 'rgba(156,163,175,0.15)', color: '#9ca3af', label: '● Expired' }
        };
        const s = styles[status] || styles.active;
        return (
            <span style={{
                padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: s.bg, color: s.color
            }}>{s.label}</span>
        );
    };

    const formatExpiry = (k) => {
        if (!k.expires_at) return { text: '♾️ Lifetime', color: '#10b981' };
        const exp = new Date(k.expires_at);
        const now = new Date();
        const days = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
        const dateStr = exp.toLocaleDateString();
        if (days <= 0) return { text: `⛔ Expired (${dateStr})`, color: '#ef4444' };
        if (days <= 7) return { text: `⚠️ ${dateStr} (${days}d left)`, color: '#ef4444' };
        if (days <= 30) return { text: `${dateStr} (${days}d left)`, color: '#f59e0b' };
        return { text: `${dateStr} (${days}d left)`, color: '#10b981' };
    };

    const tierBadge = (tier) => {
        if (tier === 'enterprise') return (
            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(168,85,247,0.15)', color: '#a855f7' }}>
                👑 Enterprise
            </span>
        );
        return (
            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
                ⚡ Pro
            </span>
        );
    };

    // ===== Password Login Gate =====
    if (!authenticated) {
        return (
            <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh' }}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="card"
                    style={{ padding: 40, maxWidth: 400, width: '100%', textAlign: 'center' }}
                >
                    <div style={{
                        width: 64, height: 64, borderRadius: 16,
                        background: 'rgba(139, 92, 246, 0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 20px'
                    }}>
                        <Lock size={28} color="#8b5cf6" />
                    </div>
                    <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Admin Access</h2>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>
                        Enter admin password to continue
                    </p>
                    <input
                        type="password"
                        className="input-field"
                        placeholder="Admin password"
                        value={passwordInput}
                        onChange={(e) => { setPasswordInput(e.target.value); setAuthError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                        style={{ marginBottom: 12, textAlign: 'center' }}
                        autoFocus
                    />
                    {authError && (
                        <p style={{ fontSize: 12, color: '#ef4444', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            <XCircle size={14} /> {authError}
                        </p>
                    )}
                    <button
                        className="btn btn-primary"
                        onClick={handleLogin}
                        disabled={authLoading || !passwordInput}
                        style={{ width: '100%' }}
                    >
                        {authLoading ? <RefreshCw size={16} className="spin" /> : 'Unlock Admin Panel'}
                    </button>
                </motion.div>
            </div>
        );
    }

    if (loading) return (
        <div className="page-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-cyan)' }} />
        </div>
    );

    return (
        <div className="page-container" style={{ paddingBottom: 40 }}>
            <div className="page-header">
                <h1 className="page-title"><Shield size={24} /> Admin Panel</h1>
                <p className="page-subtitle">Manage license keys, view stats, and control access</p>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowChangePw(!showChangePw)} style={{ marginTop: 8, gap: 6, fontSize: 12 }}>
                    <Lock size={14} /> Change Password
                </button>
            </div>

            {/* Change Password */}
            <AnimatePresence>
                {showChangePw && (
                    <motion.div className="card" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        style={{ marginBottom: 20, padding: 20, maxWidth: 400 }}>
                        <h3 style={{ fontFamily: 'Outfit', fontSize: 15, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Lock size={16} style={{ color: '#f59e0b' }} /> Change Admin Password
                        </h3>
                        <div className="form-group" style={{ marginBottom: 10 }}>
                            <label className="form-label">Current Password</label>
                            <input type="password" className="input-field" value={currentPw}
                                onChange={(e) => setCurrentPw(e.target.value)} placeholder="Enter current password" />
                        </div>
                        <div className="form-group" style={{ marginBottom: 10 }}>
                            <label className="form-label">New Password (min 6 char)</label>
                            <input type="password" className="input-field" value={newPw}
                                onChange={(e) => setNewPw(e.target.value)} placeholder="Enter new password" />
                        </div>
                        {pwMsg && (
                            <p style={{ fontSize: 12, marginBottom: 8, color: pwMsg.startsWith('✅') ? '#10b981' : '#ef4444' }}>{pwMsg}</p>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary btn-sm" onClick={async () => {
                                setPwMsg('');
                                try {
                                    const res = await adminFetch(`${API}/admin/change-password`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw })
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                        setPwMsg('✅ Password changed!');
                                        setAdminPassword(newPw);
                                        sessionStorage.setItem('admin_password', newPw);
                                        setCurrentPw(''); setNewPw('');
                                        setTimeout(() => { setShowChangePw(false); setPwMsg(''); }, 2000);
                                    } else {
                                        setPwMsg(`❌ ${data.error}`);
                                    }
                                } catch { setPwMsg('❌ Connection error'); }
                            }}>Save</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setShowChangePw(false); setPwMsg(''); setCurrentPw(''); setNewPw(''); }}>Cancel</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Stats */}
            {stats && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
                    {[
                        { label: 'Total Keys', value: stats.licenses.total, icon: Key, color: '#8b5cf6' },
                        { label: 'Active', value: stats.licenses.active, icon: CheckCircle, color: '#10b981' },
                        { label: 'Used', value: stats.licenses.used, icon: Users, color: '#3b82f6' },
                        { label: 'Revoked', value: stats.licenses.revoked, icon: Ban, color: '#ef4444' },
                        { label: 'Pro Keys', value: stats.tiers.pro, icon: Zap, color: '#eab308' },
                        { label: 'Enterprise', value: stats.tiers.enterprise, icon: Crown, color: '#a855f7' },
                    ].map(({ label, value, icon: Icon, color }) => (
                        <div key={label} className="card" style={{ padding: '16px 14px', textAlign: 'center' }}>
                            <Icon size={20} style={{ color, marginBottom: 6 }} />
                            <div style={{ fontFamily: 'Outfit', fontSize: 22, fontWeight: 700, color }}>{value}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
                        </div>
                    ))}
                </motion.div>
            )}

            {/* Message */}
            <AnimatePresence>
                {msg && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        style={{
                            padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 13,
                            background: msg.startsWith('✅') ? 'rgba(16,185,129,0.1)' : msg.startsWith('❌') ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                            color: msg.startsWith('✅') ? '#10b981' : msg.startsWith('❌') ? '#ef4444' : '#3b82f6',
                            border: `1px solid ${msg.startsWith('✅') ? 'rgba(16,185,129,0.2)' : msg.startsWith('❌') ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)'}`
                        }}>
                        {msg}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Actions Bar */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => setShowGenForm(!showGenForm)} style={{ gap: 6 }}>
                    <Plus size={16} /> Generate Keys
                </button>
                <button className="btn btn-ghost" onClick={loadData} style={{ gap: 6 }}>
                    <RefreshCw size={14} /> Refresh
                </button>
                {keys.length > 0 && (
                    <button className="btn btn-ghost" onClick={exportKeys} style={{ gap: 6 }}>
                        <Download size={14} /> Export CSV
                    </button>
                )}
                <button className="btn btn-ghost" onClick={() => { setShowLogs(!showLogs); if (!showLogs) loadLogs(logFilter); }} style={{ gap: 6 }}>
                    <FileText size={14} /> {showLogs ? 'Hide Logs' : 'Audit Log'}
                </button>
            </div>

            {/* Audit Log Section */}
            <AnimatePresence>
                {showLogs && (
                    <motion.div className="card" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        style={{ marginBottom: 20, padding: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h3 style={{ fontFamily: 'Outfit', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                                <FileText size={18} style={{ color: '#06b6d4' }} /> Audit Log
                            </h3>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <Filter size={14} style={{ color: 'var(--text-muted)' }} />
                                <select
                                    value={logFilter}
                                    onChange={(e) => { setLogFilter(e.target.value); loadLogs(e.target.value); }}
                                    style={{
                                        padding: '4px 8px', borderRadius: 6, fontSize: 12,
                                        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                                        color: 'var(--text-primary)'
                                    }}
                                >
                                    <option value="">Semua</option>
                                    <option value="activate">Activate</option>
                                    <option value="deactivate">Deactivate</option>
                                    <option value="admin_unbind">Unbind</option>
                                    <option value="admin_revoke">Revoke</option>
                                    <option value="admin_reset">Reset</option>
                                    <option value="reactivate">Reactivate</option>
                                </select>
                                <button className="btn btn-ghost btn-sm" onClick={() => loadLogs(logFilter)} style={{ padding: '3px 8px' }}>
                                    <RefreshCw size={12} />
                                </button>
                            </div>
                        </div>

                        {logsLoading ? (
                            <div style={{ textAlign: 'center', padding: 20 }}>
                                <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent-cyan)' }} />
                            </div>
                        ) : auditLogs.length === 0 ? (
                            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', padding: 20 }}>Belum ada log.</p>
                        ) : (
                            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                            <th style={thStyle}>Waktu</th>
                                            <th style={thStyle}>Action</th>
                                            <th style={thStyle}>License Key</th>
                                            <th style={thStyle}>Machine ID</th>
                                            <th style={thStyle}>IP</th>
                                            <th style={thStyle}>Detail</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {auditLogs.map((log, i) => {
                                            const actionColors = {
                                                activate: { bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
                                                deactivate: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
                                                admin_unbind: { bg: 'rgba(6,182,212,0.15)', color: '#06b6d4' },
                                                admin_revoke: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444' },
                                                admin_reset: { bg: 'rgba(251,191,36,0.15)', color: '#f59e0b' },
                                                reactivate: { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
                                            };
                                            const ac = actionColors[log.action] || { bg: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' };
                                            const time = log.createdAt || log.created_at;
                                            return (
                                                <tr key={log.id || i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                    <td style={tdStyle}>
                                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                            {time ? new Date(time).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                        </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: ac.bg, color: ac.color }}>
                                                            {log.action}
                                                        </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <code style={{ fontSize: 11, color: '#10b981', fontFamily: 'monospace' }}>
                                                            {log.licenseKey || log.license_keys?.license_key || '—'}
                                                        </code>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                            {log.machineId || log.machine_id ? (log.machineId || log.machine_id).substring(0, 12) + '...' : '—'}
                                                        </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                                                            {log.ipAddress || log.ip_address || '—'}
                                                        </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                                            {log.details ? (typeof log.details === 'string' ? log.details : JSON.stringify(log.details)) : '—'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Generate Form */}
            <AnimatePresence>
                {showGenForm && (
                    <motion.div className="card" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                        style={{ marginBottom: 20, padding: 20, overflow: 'visible' }}>
                        <h3 style={{ fontFamily: 'Outfit', fontSize: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Key size={18} style={{ color: '#10b981' }} /> Generate New License Keys
                        </h3>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                            <div className="form-group">
                                <label className="form-label">Tier</label>
                                <div className="chip-group">
                                    <button className={`chip ${genTier === 'pro' ? 'active' : ''}`} onClick={() => setGenTier('pro')}>
                                        ⚡ Pro
                                    </button>
                                    <button className={`chip ${genTier === 'enterprise' ? 'active' : ''}`} onClick={() => setGenTier('enterprise')}>
                                        👑 Enterprise
                                    </button>
                                </div>
                            </div>
                            <div className="form-group">
                                <label className="form-label">Duration</label>
                                <div className="chip-group" style={{ flexWrap: 'wrap' }}>
                                    {[
                                        { label: '♾️ Lifetime', value: 0 },
                                        { label: '3 Hari', value: 3 },
                                        { label: '7 Hari', value: 7 },
                                        { label: '14 Hari', value: 14 },
                                        { label: '30 Hari', value: 30 },
                                        { label: '90 Hari', value: 90 },
                                        { label: '365 Hari', value: 365 },
                                    ].map(d => (
                                        <button key={d.value} className={`chip ${genDuration === d.value ? 'active' : ''}`}
                                            onClick={() => setGenDuration(d.value)}>
                                            {d.label}
                                        </button>
                                    ))}
                                </div>
                                {genDuration > 0 && (
                                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <input type="number" className="input-field" min="1" max="9999"
                                            value={genDuration} onChange={(e) => setGenDuration(parseInt(e.target.value) || 30)}
                                            style={{ maxWidth: 80, padding: '4px 8px', fontSize: 12 }} />
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>hari</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 12 }}>
                            <div className="form-group">
                                <label className="form-label">Quantity</label>
                                <input type="number" className="input-field" min="1" max="50" value={genCount}
                                    onChange={(e) => setGenCount(parseInt(e.target.value) || 1)}
                                    style={{ maxWidth: 100 }} />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Max Aktivasi (perangkat)</label>
                                <input type="number" className="input-field" min="1" max="999" value={genMaxAct}
                                    onChange={(e) => setGenMaxAct(parseInt(e.target.value) || 1)}
                                    style={{ maxWidth: 100 }} />
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                                    1 key bisa dipakai di {genMaxAct} perangkat
                                </span>
                            </div>
                        </div>

                        <div className="form-group" style={{ marginTop: 12 }}>
                            <label className="form-label">Custom Key (optional — leave blank for random)</label>
                            <input type="text" className="input-field" placeholder="XXXX-XXXX-XXXX-XXXX"
                                value={genCustomKey} onChange={(e) => setGenCustomKey(e.target.value.toUpperCase())}
                                style={{ fontFamily: 'monospace', letterSpacing: 2, maxWidth: 300 }} />
                        </div>

                        <div className="form-group" style={{ marginTop: 12 }}>
                            <label className="form-label">Notes (optional)</label>
                            <input type="text" className="input-field" placeholder="e.g. Customer name, order #, batch ID..."
                                value={genNotes} onChange={(e) => setGenNotes(e.target.value)} />
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                            <button className="btn btn-primary" onClick={generateKeys} disabled={generating} style={{ gap: 6 }}>
                                {generating ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={14} />}
                                Generate {genCount > 1 ? `${genCount} Keys` : 'Key'}
                            </button>
                            <button className="btn btn-ghost" onClick={() => setShowGenForm(false)}>Cancel</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* License Keys Table */}
            <motion.div className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <div className="card-header">
                    <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Key size={18} /> License Keys ({keys.length})
                    </div>
                </div>

                {keys.length === 0 ? (
                    <div className="empty-state" style={{ padding: '40px 20px', minHeight: 'auto' }}>
                        <Key size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                        <p className="text-muted text-sm" style={{ marginBottom: 12 }}>
                            No license keys yet. Click "Generate Keys" to create your first key.
                        </p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <th style={thStyle}>Key</th>
                                    <th style={thStyle}>Tier</th>
                                    <th style={thStyle}>Status</th>
                                    <th style={thStyle}>Machine</th>
                                    <th style={thStyle}>Aktivasi</th>
                                    <th style={thStyle}>Expiry</th>
                                    <th style={thStyle}>Notes</th>
                                    <th style={thStyle}>Created</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {keys.map((k) => (
                                    <tr key={k.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <td style={tdStyle}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <code style={{
                                                    fontFamily: 'monospace', fontSize: 12, letterSpacing: 1,
                                                    color: k.status === 'revoked' ? 'var(--text-muted)' : '#10b981',
                                                    textDecoration: k.status === 'revoked' ? 'line-through' : 'none'
                                                }}>
                                                    {k.license_key}
                                                </code>
                                                <button className="btn btn-ghost btn-sm" onClick={() => copyKey(k.license_key, k.id)}
                                                    style={{ padding: 2, minWidth: 'auto' }}>
                                                    {copiedId === k.id ? <CheckCircle size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                                                </button>
                                            </div>
                                        </td>
                                        <td style={tdStyle}>{tierBadge(k.tier)}</td>
                                        <td style={tdStyle}>{statusBadge(k.status)}</td>
                                        <td style={tdStyle}>
                                            <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                                                {k.machine_id ? k.machine_id.substring(0, 12) + '...' : '—'}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{
                                                fontSize: 11, fontWeight: 600,
                                                color: (k.activation_count || 0) >= (k.max_activations || 1) ? '#f59e0b' : '#10b981'
                                            }}>
                                                {k.activation_count || 0}/{k.max_activations || 1}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>
                                            {(() => {
                                                const exp = formatExpiry(k);
                                                return (
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: exp.color }}>
                                                        {exp.text}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                                {k.notes || '—'}
                                            </span>
                                        </td>
                                        <td style={tdStyle}>
                                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                {k.created_at ? new Date(k.created_at).toLocaleDateString() : '—'}
                                            </span>
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                                {k.status === 'revoked' ? (
                                                    <button className="btn btn-ghost btn-sm" onClick={() => reactivateKey(k.id)}
                                                        title="Re-activate" style={{ padding: '3px 8px', color: '#10b981' }}>
                                                        <Unlock size={13} />
                                                    </button>
                                                ) : (
                                                    <button className="btn btn-ghost btn-sm" onClick={() => revokeKey(k.id)}
                                                        title="Revoke" style={{ padding: '3px 8px', color: '#f59e0b' }}>
                                                        <Ban size={13} />
                                                    </button>
                                                )}
                                                {k.status === 'active' && (k.activation_count || 0) === 0 && (
                                                    <button className="btn btn-ghost btn-sm" onClick={() => markUsed(k.id, k.license_key)}
                                                        title="Tandai Sudah Digunakan" style={{ padding: '3px 8px', color: '#10b981' }}>
                                                        <UserCheck size={13} />
                                                    </button>
                                                )}
                                                {(k.activation_count > 0 || k.machine_id || k.status === 'used') && (
                                                    <button className="btn btn-ghost btn-sm" onClick={() => resetActivations(k.id, k.license_key)}
                                                        title="Reset Aktivasi (unbind mesin)" style={{ padding: '3px 8px', color: '#06b6d4' }}>
                                                        <RotateCcw size={13} />
                                                    </button>
                                                )}
                                                <button className="btn btn-ghost btn-sm" onClick={() => openUpgrade(k)}
                                                    title="Ubah Paket (Upgrade/Downgrade)" style={{ padding: '3px 8px', color: '#a78bfa' }}>
                                                    <ArrowUpCircle size={13} />
                                                </button>
                                                <button className="btn btn-ghost btn-sm" onClick={() => deleteKey(k.id, k.license_key)}
                                                    title="Delete" style={{ padding: '3px 8px', color: 'var(--color-error)', opacity: 0.6 }}>
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </motion.div>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>

            {/* Inline Confirm Modal */}
            <AnimatePresence>
                {confirmAction && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.6)', zIndex: 9999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                        onClick={() => setConfirmAction(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="card"
                            style={{ padding: 24, maxWidth: 400, width: '90%', textAlign: 'center' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <AlertTriangle size={32} style={{ color: confirmAction.type === 'delete' ? '#ef4444' : confirmAction.type === 'mark-used' ? '#10b981' : '#f59e0b', marginBottom: 12 }} />
                            <p style={{ fontSize: 14, marginBottom: 20, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{confirmAction.message}</p>
                            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                <button className="btn btn-ghost" onClick={() => setConfirmAction(null)}>Tidak</button>
                                <button
                                    className="btn"
                                    style={{
                                        background: confirmAction.type === 'delete' ? '#ef4444' : confirmAction.type === 'mark-used' ? '#10b981' : '#f59e0b',
                                        color: '#fff', border: 'none'
                                    }}
                                    onClick={confirmAction.fn}
                                >
                                    {confirmAction.type === 'delete' ? 'Delete' : confirmAction.type === 'mark-used' ? 'Ya, Tandai Used' : 'Reset'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Upgrade Modal */}
            <AnimatePresence>
                {upgradeModal && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0,0,0,0.6)', zIndex: 9999,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                        onClick={() => setUpgradeModal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="card"
                            style={{ padding: 28, maxWidth: 440, width: '90%' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                                <ArrowUpCircle size={24} style={{ color: '#a78bfa' }} />
                                <h3 style={{ margin: 0, fontSize: 18 }}>Ubah Paket License</h3>
                            </div>

                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, padding: '8px 12px', background: 'rgba(167,139,250,0.08)', borderRadius: 8 }}>
                                Key saat ini: <strong style={{ color: 'var(--text-primary)' }}>{upgradeModal.key}</strong>
                                <br />Tier: <strong>{upgradeModal.currentTier}</strong> • Durasi: <strong>{upgradeModal.currentDuration > 0 ? upgradeModal.currentDuration + ' hari' : 'Lifetime'}</strong>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Tier Baru</label>
                                    <select value={upgradeTier} onChange={e => setUpgradeTier(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14 }}>
                                        <option value="pro">⚡ Pro ($29/mo)</option>
                                        <option value="enterprise">👑 Enterprise (Custom)</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Durasi Baru</label>
                                    <select value={upgradeDuration} onChange={e => setUpgradeDuration(Number(e.target.value))}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)', fontSize: 14 }}>
                                        <option value={0}>♾️ Lifetime</option>
                                        <option value={3}>3 Hari</option>
                                        <option value={7}>7 Hari</option>
                                        <option value={14}>14 Hari</option>
                                        <option value={30}>30 Hari (1 Bulan)</option>
                                        <option value={90}>90 Hari (3 Bulan)</option>
                                        <option value={180}>180 Hari (6 Bulan)</option>
                                        <option value={365}>365 Hari (1 Tahun)</option>
                                    </select>
                                </div>

                                <div style={{ padding: '10px 12px', background: 'rgba(251,191,36,0.08)', borderRadius: 8, fontSize: 12, color: '#f59e0b' }}>
                                    ⚠️ Key lama akan diganti dengan key baru. Pastikan user mendapat key barunya.
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                                <button className="btn btn-ghost" onClick={() => setUpgradeModal(null)}>Batal</button>
                                <button
                                    className="btn"
                                    disabled={upgrading}
                                    style={{ background: 'linear-gradient(135deg, #a78bfa, #6366f1)', color: '#fff', border: 'none', opacity: upgrading ? 0.6 : 1 }}
                                    onClick={doUpgrade}
                                >
                                    {upgrading ? 'Memproses...' : '🔄 Ubah Paket & Generate Key Baru'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const thStyle = {
    padding: '10px 12px', textAlign: 'left', fontSize: 11,
    color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.5px'
};

const tdStyle = {
    padding: '10px 12px', verticalAlign: 'middle'
};
