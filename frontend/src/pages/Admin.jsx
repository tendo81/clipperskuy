import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Key, Plus, Trash2, RefreshCw, Copy, CheckCircle, XCircle, AlertTriangle, Crown, Zap, Hash, Users, BarChart3, Ban, Unlock, Download, Clock, Timer, RotateCcw } from 'lucide-react';

const API = 'http://localhost:5000/api';

export default function Admin() {
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
    const [genDuration, setGenDuration] = useState(0); // 0 = lifetime
    const [genMaxAct, setGenMaxAct] = useState(1); // max activations per key

    const loadData = async () => {
        try {
            const [keysRes, statsRes] = await Promise.all([
                fetch(`${API}/admin/licenses`).then(r => r.json()),
                fetch(`${API}/admin/stats`).then(r => r.json())
            ]);
            setKeys(keysRes.keys || []);
            setStats(statsRes);
        } catch (err) {
            setMsg(`Error loading: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const generateKeys = async () => {
        try {
            setGenerating(true);
            setMsg('');
            const res = await fetch(`${API}/admin/licenses/generate`, {
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
            await fetch(`${API}/admin/licenses/${id}/revoke`, { method: 'PUT' });
            setMsg('Key revoked');
            loadData();
        } catch (err) {
            setMsg(`Error: ${err.message}`);
        }
    };

    const reactivateKey = async (id) => {
        try {
            await fetch(`${API}/admin/licenses/${id}/activate`, { method: 'PUT' });
            setMsg('Key re-activated');
            loadData();
        } catch (err) {
            setMsg(`Error: ${err.message}`);
        }
    };

    const deleteKey = async (id, key) => {
        if (!confirm(`Delete key ${key}? This cannot be undone.`)) return;
        try {
            await fetch(`${API}/admin/licenses/${id}`, { method: 'DELETE' });
            setMsg('Key deleted');
            loadData();
        } catch (err) {
            setMsg(`Error: ${err.message}`);
        }
    };

    const resetActivations = async (id, key) => {
        if (!confirm(`Reset semua aktivasi untuk key ${key}?\nKey akan bisa dipakai di perangkat baru.`)) return;
        try {
            const res = await fetch(`${API}/admin/licenses/${id}/reset`, { method: 'PUT' });
            const data = await res.json();
            setMsg(`✅ ${data.message}`);
            loadData();
        } catch (err) {
            setMsg(`Error: ${err.message}`);
        }
    };

    const copyKey = (key, id) => {
        navigator.clipboard.writeText(key);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
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
        if (days <= 0) return { text: 'Expired', color: '#9ca3af' };
        if (days <= 7) return { text: `${days}d left`, color: '#ef4444' };
        if (days <= 30) return { text: `${days}d left`, color: '#f59e0b' };
        return { text: `${days}d left`, color: '#10b981' };
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
            </div>

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
            </div>

            {/* Generate Form */}
            <AnimatePresence>
                {showGenForm && (
                    <motion.div className="card" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        style={{ marginBottom: 20, padding: 20 }}>
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
                                                {(k.activation_count > 0 || k.machine_id) && (
                                                    <button className="btn btn-ghost btn-sm" onClick={() => resetActivations(k.id, k.license_key)}
                                                        title="Reset Aktivasi (unbind mesin)" style={{ padding: '3px 8px', color: '#06b6d4' }}>
                                                        <RotateCcw size={13} />
                                                    </button>
                                                )}
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
