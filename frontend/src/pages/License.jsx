import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Key, Shield, CheckCircle, XCircle, Crown, Zap, Star, Building2, AlertTriangle, Copy, RefreshCw, Clock } from 'lucide-react';

const API = 'http://localhost:5000/api';

const LICENSE_TIERS = [
    {
        id: 'free',
        name: 'Free',
        icon: Zap,
        price: 'Free',
        color: '#6b7280',
        features: [
            '3 projects max',
            '720p export',
            'Watermark on exports',
            'Basic AI detection',
            'Community support'
        ],
        limits: ['No batch export', 'No GPU acceleration', 'No custom branding']
    },
    {
        id: 'pro',
        name: 'Pro',
        icon: Crown,
        price: '$29/mo',
        color: '#8b5cf6',
        popular: true,
        features: [
            'Unlimited projects',
            '1080p export',
            'No watermark',
            'Advanced AI (Gemini + Groq)',
            'GPU acceleration',
            'Batch export',
            'Custom branding',
            'Priority support'
        ],
        limits: []
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        icon: Building2,
        price: 'Custom',
        color: '#f59e0b',
        features: [
            'Everything in Pro',
            '4K export',
            'White-label branding',
            'API access',
            'Custom AI models',
            'Dedicated support',
            'Team management',
            'SLA guarantee'
        ],
        limits: []
    }
];

export default function License() {
    const [licenseKey, setLicenseKey] = useState('');
    const [licenseData, setLicenseData] = useState(null);
    const [isValidating, setIsValidating] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(true);

    // Load license status from backend
    useEffect(() => {
        loadLicenseStatus();
    }, []);

    const loadLicenseStatus = async () => {
        try {
            const res = await fetch(`${API}/license`);
            const data = await res.json();
            if (data.success) {
                setLicenseData(data);
                if (data.licenseKey) setLicenseKey(data.licenseKey);
            }
        } catch (e) {
            console.error('Failed to load license:', e);
        }
        setLoading(false);
    };

    const handleActivate = async () => {
        if (!licenseKey.trim()) return;
        setIsValidating(true);
        setError(null);

        try {
            const res = await fetch(`${API}/license/activate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: licenseKey })
            });
            const data = await res.json();
            if (data.success) {
                await loadLicenseStatus();
            } else {
                setError(data.error || 'Activation failed');
            }
        } catch (e) {
            setError('Network error. Check your connection.');
        }
        setIsValidating(false);
    };

    const handleDeactivate = async () => {
        try {
            await fetch(`${API}/license/deactivate`, { method: 'POST' });
            setLicenseKey('');
            setError(null);
            await loadLicenseStatus();
        } catch (e) {
            setError('Failed to deactivate');
        }
    };

    const copyMachineId = () => {
        if (licenseData?.machineId) {
            navigator.clipboard.writeText(licenseData.machineId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const status = licenseData?.status || 'free';
    const tier = licenseData?.tier || 'free';
    const trial = licenseData?.trial;
    const isLicensed = status === 'licensed';
    const isTrial = status === 'trial';

    const statusBadge = {
        licensed: { label: `${tier.toUpperCase()} License`, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)' },
        trial: { label: `Trial — ${trial?.daysRemaining || 0} days left`, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
        free: { label: 'Free Tier', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' }
    }[status] || { label: 'Unknown', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
                <RefreshCw size={24} className="spin" color="#8b5cf6" />
            </div>
        );
    }

    return (
        <>
            <div className="page-header">
                <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                    License
                </motion.h1>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                    Manage your ClipperSkuy license
                </motion.p>
            </div>



            {/* Current Status */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="card"
                style={{ padding: 24, marginBottom: 24 }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                        <Shield size={18} color="#8b5cf6" /> License Status
                    </h3>
                    <div style={{
                        padding: '4px 12px', borderRadius: 20,
                        fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1,
                        background: statusBadge.bg,
                        color: statusBadge.color,
                        border: `1px solid ${statusBadge.color}30`
                    }}>
                        {statusBadge.label}
                    </div>
                </div>

                {/* License Key Input */}
                <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 6, display: 'block' }}>
                        License Key
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="text"
                            className="input-field"
                            placeholder="XXXX-XXXX-XXXX-XXXX"
                            value={licenseKey}
                            onChange={(e) => {
                                let val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                                val = val.replace(/-/g, '');
                                if (val.length > 4) val = val.substring(0, 4) + '-' + val.substring(4);
                                if (val.length > 9) val = val.substring(0, 9) + '-' + val.substring(9);
                                if (val.length > 14) val = val.substring(0, 14) + '-' + val.substring(14);
                                if (val.length > 19) val = val.substring(0, 19);
                                setLicenseKey(val);
                                setError(null);
                            }}
                            disabled={isLicensed}
                            style={{
                                fontFamily: 'monospace', letterSpacing: 2,
                                fontSize: 16, textAlign: 'center',
                                borderColor: isLicensed ? '#22c55e' : error ? '#ef4444' : undefined
                            }}
                        />
                        {isLicensed ? (
                            <button className="btn btn-secondary" onClick={handleDeactivate} style={{ whiteSpace: 'nowrap' }}>
                                Deactivate
                            </button>
                        ) : (
                            <button
                                className="btn btn-primary"
                                onClick={handleActivate}
                                disabled={isValidating || !licenseKey.trim()}
                                style={{ whiteSpace: 'nowrap', minWidth: 100 }}
                            >
                                {isValidating ? <RefreshCw size={16} className="spin" /> : 'Activate'}
                            </button>
                        )}
                    </div>
                    {error && (
                        <p style={{ fontSize: 12, color: '#ef4444', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <XCircle size={12} /> {error}
                        </p>
                    )}
                    {isLicensed && (
                        <div style={{ marginTop: 8 }}>
                            <p style={{ fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4, margin: '0 0 6px' }}>
                                <CheckCircle size={12} /> License active since {new Date(licenseData.activatedAt).toLocaleDateString()}
                            </p>
                            {/* Expiry Info */}
                            {licenseData.expiresAt ? (() => {
                                const days = licenseData.daysRemaining;
                                const expDate = new Date(licenseData.expiresAt).toLocaleDateString();
                                const color = days <= 7 ? '#ef4444' : days <= 30 ? '#f59e0b' : '#22c55e';
                                return (
                                    <p style={{ fontSize: 12, color, display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
                                        {days <= 7 ? <AlertTriangle size={12} /> : <Clock size={12} />}
                                        {days <= 0
                                            ? `License expired on ${expDate}`
                                            : `Expires ${expDate} — ${days} day${days !== 1 ? 's' : ''} remaining`
                                        }
                                    </p>
                                );
                            })() : (
                                <p style={{ fontSize: 12, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
                                    ♾️ Lifetime license — never expires
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Machine ID */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Machine ID (for support)</span>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginLeft: 8, fontFamily: 'monospace' }}>
                                {licenseData?.machineId || '...'}
                            </span>
                        </div>
                        <button
                            onClick={copyMachineId}
                            style={{
                                background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
                                cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4
                            }}
                        >
                            <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
                        </button>
                    </div>
                </div>

                {/* Feature Limits Summary */}
                {licenseData?.limits && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12, marginTop: 12 }}>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>Current Limits</div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                                📺 Max Resolution: <strong>{licenseData.limits.maxExportResolution}p</strong>
                            </span>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                                {licenseData.limits.watermarkRequired ? '🏷️ Watermark: Yes' : '✅ No Watermark'}
                            </span>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                                {licenseData.limits.gpuAccel ? '🎮 GPU: Enabled' : '⏸️ GPU: Disabled'}
                            </span>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                                {licenseData.limits.batchExport ? '📦 Batch: Yes' : '❌ Batch: No'}
                            </span>
                        </div>
                    </div>
                )}
            </motion.div>

            {/* Pricing Tiers */}
            <motion.h3
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 16 }}
            >
                Plans & Pricing
            </motion.h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                {LICENSE_TIERS.map((t, i) => {
                    const Icon = t.icon;
                    const isActive = tier === t.id;
                    return (
                        <motion.div
                            key={t.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.35 + i * 0.1 }}
                            className="card"
                            style={{
                                padding: 24, position: 'relative',
                                border: isActive ? `1px solid ${t.color}` : undefined,
                                background: isActive ? `linear-gradient(180deg, ${t.color}08, transparent)` : undefined
                            }}
                        >
                            {t.popular && (
                                <div style={{
                                    position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                    padding: '3px 12px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                                    color: '#fff', letterSpacing: 0.5
                                }}>
                                    MOST POPULAR
                                </div>
                            )}

                            <div style={{ textAlign: 'center', marginBottom: 20 }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: 12,
                                    background: `${t.color}20`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    margin: '0 auto 12px'
                                }}>
                                    <Icon size={24} color={t.color} />
                                </div>
                                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{t.name}</h3>
                                <p style={{ fontSize: 24, fontWeight: 800, color: t.color, margin: 0 }}>{t.price}</p>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {t.features.map(f => (
                                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                                        <CheckCircle size={14} color="#22c55e" />
                                        {f}
                                    </div>
                                ))}
                                {t.limits.map(l => (
                                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
                                        <XCircle size={14} color="rgba(255,255,255,0.2)" />
                                        {l}
                                    </div>
                                ))}
                            </div>

                            {isActive && (
                                <div style={{
                                    marginTop: 16, textAlign: 'center', padding: '6px 0',
                                    borderRadius: 8, background: `${t.color}20`,
                                    color: t.color, fontSize: 12, fontWeight: 600
                                }}>
                                    ✓ Current Plan
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </>
    );
}
