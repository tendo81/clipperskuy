import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Zap, Cpu, HardDrive, Monitor, Globe, Github, Heart, Coffee, Shield, CheckCircle } from 'lucide-react';

export default function About() {
    const [systemInfo, setSystemInfo] = useState({});
    const [backendVersion, setBackendVersion] = useState('');

    useEffect(() => {
        // Get system info
        const info = {
            platform: navigator.platform,
            userAgent: navigator.userAgent,
            language: navigator.language,
            cores: navigator.hardwareConcurrency || 'N/A',
            memory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'N/A',
            screen: `${window.screen.width}×${window.screen.height}`,
            isElectron: !!window.electronAPI
        };
        setSystemInfo(info);

        // Get backend health
        fetch('http://localhost:5000/api/settings')
            .then(r => r.json())
            .then(() => setBackendVersion('Connected'))
            .catch(() => setBackendVersion('Offline'));
    }, []);

    const features = [
        { icon: Zap, title: 'AI-Powered Detection', desc: 'Groq & Gemini AI models detect viral moments automatically' },
        { icon: Monitor, title: 'Smart Reframing', desc: 'Auto-reframe for TikTok, Reels, Shorts with face tracking' },
        { icon: Shield, title: 'Hardware Acceleration', desc: 'NVIDIA NVENC, AMD AMF, Intel QSV GPU encoding' },
        { icon: Globe, title: 'YouTube Integration', desc: 'Download, process, and clip YouTube videos directly' },
    ];

    const techStack = [
        { name: 'Frontend', value: 'React 18 + Vite' },
        { name: 'Backend', value: 'Express.js + Socket.IO' },
        { name: 'Database', value: 'SQLite (better-sqlite3)' },
        { name: 'Video', value: 'FFmpeg + yt-dlp' },
        { name: 'AI', value: 'Groq (Whisper) + Gemini' },
        { name: 'Desktop', value: 'Electron 28' },
    ];

    return (
        <>
            <div className="page-header">
                <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                    About ClipperSkuy
                </motion.h1>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                    AI-powered video clipping engine
                </motion.p>
            </div>

            {/* Hero Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                style={{
                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(59, 130, 246, 0.1))',
                    border: '1px solid rgba(139, 92, 246, 0.3)',
                    borderRadius: 16,
                    padding: '40px 32px',
                    textAlign: 'center',
                    marginBottom: 24
                }}
            >
                <div style={{
                    width: 72, height: 72, borderRadius: 16,
                    background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px', boxShadow: '0 8px 32px rgba(139, 92, 246, 0.4)'
                }}>
                    <Zap size={36} color="#fff" />
                </div>
                <h2 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px', color: '#fff' }}>
                    ClipperSkuy
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 16 }}>
                    Version 1.0.0
                </p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, maxWidth: 500, margin: '0 auto', lineHeight: 1.6 }}>
                    Turn long videos into viral short clips with AI.
                    Automatically detect the best moments, add captions, reframe for social media, and export in one click.
                </p>
            </motion.div>

            {/* Features Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, marginBottom: 24 }}>
                {features.map((feat, i) => {
                    const Icon = feat.icon;
                    return (
                        <motion.div
                            key={feat.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 + i * 0.08 }}
                            className="card"
                            style={{ padding: 20 }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: 10,
                                    background: 'rgba(139, 92, 246, 0.15)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    <Icon size={18} color="#8b5cf6" />
                                </div>
                                <h3 style={{ fontSize: 15, fontWeight: 600, color: '#fff', margin: 0 }}>{feat.title}</h3>
                            </div>
                            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.5 }}>{feat.desc}</p>
                        </motion.div>
                    );
                })}
            </div>

            {/* Tech Stack & System Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                {/* Tech Stack */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="card"
                    style={{ padding: 24 }}
                >
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Coffee size={18} color="#8b5cf6" /> Tech Stack
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {techStack.map(t => (
                            <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{t.name}</span>
                                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4 }}>{t.value}</span>
                            </div>
                        ))}
                    </div>
                </motion.div>

                {/* System Info */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55 }}
                    className="card"
                    style={{ padding: 24 }}
                >
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Cpu size={18} color="#3b82f6" /> System Info
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <InfoRow label="Platform" value={systemInfo.platform} />
                        <InfoRow label="CPU Cores" value={systemInfo.cores} />
                        <InfoRow label="Memory" value={systemInfo.memory} />
                        <InfoRow label="Screen" value={systemInfo.screen} />
                        <InfoRow label="Runtime" value={systemInfo.isElectron ? 'Electron' : 'Browser'} />
                        <InfoRow label="Backend" value={backendVersion} color={backendVersion === 'Connected' ? '#22c55e' : '#ef4444'} />
                    </div>
                </motion.div>
            </div>

            {/* Credits */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="card"
                style={{ padding: 24, textAlign: 'center' }}
            >
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    Made with <Heart size={14} color="#ef4444" fill="#ef4444" /> by ClipperSkuy Team
                </p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
                    © 2026 ClipperSkuy — All rights reserved
                </p>
            </motion.div>
        </>
    );
}

function InfoRow({ label, value, color }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{label}</span>
            <span style={{
                fontSize: 13,
                color: color || 'rgba(255,255,255,0.8)',
                fontFamily: 'monospace',
                background: 'rgba(255,255,255,0.05)',
                padding: '2px 8px',
                borderRadius: 4
            }}>{value || '—'}</span>
        </div>
    );
}
