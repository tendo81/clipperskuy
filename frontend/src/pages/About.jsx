import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Zap, Cpu, HardDrive, Monitor, Globe, Heart, Coffee, Shield, CheckCircle, RefreshCw, Download, ArrowUpCircle, Loader, Package, Clock, Sparkles } from 'lucide-react';

const APP_VERSION = __APP_VERSION__ || '1.1.6';

export default function About() {
    const [systemInfo, setSystemInfo] = useState({});
    const [backendVersion, setBackendVersion] = useState('');
    const [updateState, setUpdateState] = useState('idle'); // idle, checking, available, downloading, ready, uptodate, error
    const [updateInfo, setUpdateInfo] = useState(null);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [updateError, setUpdateError] = useState('');
    const isElectron = !!window.electronAPI;

    useEffect(() => {
        const info = {
            platform: navigator.platform,
            userAgent: navigator.userAgent,
            language: navigator.language,
            cores: navigator.hardwareConcurrency || 'N/A',
            memory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'N/A',
            screen: `${window.screen.width}×${window.screen.height}`,
            isElectron
        };
        setSystemInfo(info);

        fetch('http://localhost:5000/api/settings')
            .then(r => r.json())
            .then(() => setBackendVersion('Connected'))
            .catch(() => setBackendVersion('Offline'));

        // Listen for update events from Electron
        if (isElectron) {
            window.electronAPI.onUpdateAvailable((info) => {
                console.log('[Update] Available:', info);
                setUpdateInfo(info);
                setUpdateState('available');
            });
            window.electronAPI.onUpdateProgress((percent) => {
                setDownloadProgress(percent);
            });
            window.electronAPI.onUpdateReady(() => {
                setUpdateState('ready');
                setDownloadProgress(100);
            });
            window.electronAPI.onUpdateNotAvailable?.((info) => {
                console.log('[Update] Not available:', info);
                setUpdateState('uptodate');
            });
            window.electronAPI.onUpdateError?.((info) => {
                console.log('[Update] Error:', info);
                setUpdateState('error');
                setUpdateError(info?.message || 'Update check failed');
            });
        }
    }, []);

    const handleCheckUpdate = async () => {
        if (!isElectron) {
            setUpdateState('checking');
            // Simulate check for web version
            setTimeout(() => setUpdateState('uptodate'), 1500);
            return;
        }
        setUpdateState('checking');
        setUpdateError('');
        try {
            await window.electronAPI.checkForUpdates();
            // Fallback timeout in case no event fires at all (15s for private repo)
            setTimeout(() => {
                setUpdateState(prev => prev === 'checking' ? 'uptodate' : prev);
            }, 15000);
        } catch (err) {
            setUpdateState('error');
            setUpdateError(err.message || 'Failed to check for updates');
        }
    };

    const handleDownload = () => {
        setUpdateState('downloading');
        setDownloadProgress(0);
        window.electronAPI?.downloadUpdate();
    };

    const handleInstall = () => {
        window.electronAPI?.installUpdate();
    };

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

    const changelog = [
        { version: '1.1.6', date: '2026-02-16', items: ['YouTube fix: Deno bundled for JS challenge', 'Auto-updater fix (electron-updater)', 'Smart yt-dlp binary detection', 'AI Social Media Copy Generator', 'Dynamic version display'] },
        { version: '1.1.2', date: '2026-02-15', items: ['Auto-update from private repo', 'Signed license keys (cross-machine)', 'YouTube download 16 strategies', 'yt-dlp path fix for Electron'] },
        { version: '1.1.0', date: '2026-02-14', items: ['Karaoke subtitle highlight', 'Word-level timestamps', 'Clip selection & export', 'Admin panel (web only)'] },
        { version: '1.0.0', date: '2026-02-11', items: ['Initial release', 'AI clip detection', 'Video reframing', 'Caption rendering'] },
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                    <span style={{
                        background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                        padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                        color: '#fff', letterSpacing: '0.5px'
                    }}>
                        v{APP_VERSION}
                    </span>
                    <span style={{
                        background: isElectron ? 'rgba(139, 92, 246, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                        border: `1px solid ${isElectron ? 'rgba(139, 92, 246, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                        padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                        color: isElectron ? '#a78bfa' : '#60a5fa'
                    }}>
                        {isElectron ? '⚡ Desktop' : '🌐 Web'}
                    </span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15, maxWidth: 500, margin: '0 auto', lineHeight: 1.6 }}>
                    Turn long videos into viral short clips with AI.
                    Automatically detect the best moments, add captions, reframe for social media, and export in one click.
                </p>
            </motion.div>

            {/* Update Checker Card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="card"
                style={{ padding: 24, marginBottom: 24 }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Package size={18} color="#8b5cf6" /> Software Update
                    </h3>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        Current: v{APP_VERSION}
                    </span>
                </div>

                {/* Update Status Display */}
                <div style={{
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 16,
                    border: '1px solid rgba(255,255,255,0.06)'
                }}>
                    {updateState === 'idle' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ArrowUpCircle size={22} color="rgba(255,255,255,0.4)" />
                            </div>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>Click to check for updates</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Make sure you're connected to the internet</div>
                            </div>
                        </div>
                    )}

                    {updateState === 'checking' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(139, 92, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Loader size={22} color="#8b5cf6" style={{ animation: 'spin 1s linear infinite' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 500, color: '#a78bfa' }}>Checking for updates...</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Connecting to update server</div>
                            </div>
                        </div>
                    )}

                    {updateState === 'available' && updateInfo && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(251, 191, 36, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Sparkles size={22} color="#fbbf24" />
                                </div>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fbbf24' }}>Update Available! 🎉</div>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                                        v{APP_VERSION} → v{updateInfo.version}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {updateState === 'downloading' && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Download size={22} color="#3b82f6" style={{ animation: 'bounce 1s ease infinite' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: '#60a5fa' }}>Downloading update...</div>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{downloadProgress}% complete</div>
                                </div>
                            </div>
                            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%', borderRadius: 3,
                                    background: 'linear-gradient(90deg, #8b5cf6, #3b82f6, #06b6d4)',
                                    width: `${downloadProgress}%`,
                                    transition: 'width 0.3s ease',
                                    boxShadow: '0 0 12px rgba(59, 130, 246, 0.5)'
                                }} />
                            </div>
                        </div>
                    )}

                    {updateState === 'ready' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CheckCircle size={22} color="#10b981" />
                            </div>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#10b981' }}>Update Ready!</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Restart the app to apply the update</div>
                            </div>
                        </div>
                    )}

                    {updateState === 'uptodate' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CheckCircle size={22} color="#10b981" />
                            </div>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#10b981' }}>You're up to date!</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>v{APP_VERSION} is the latest version</div>
                            </div>
                        </div>
                    )}

                    {updateState === 'error' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ArrowUpCircle size={22} color="#ef4444" />
                            </div>
                            <div>
                                <div style={{ fontSize: 14, fontWeight: 500, color: '#ef4444' }}>Update check failed</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{updateError || 'Please check your internet connection'}</div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                    {updateState === 'ready' ? (
                        <button onClick={handleInstall} style={{
                            flex: 1, padding: '10px 16px', borderRadius: 10,
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            border: 'none', color: '#fff', fontWeight: 600, fontSize: 13,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            transition: 'all 0.2s'
                        }}>
                            <RefreshCw size={14} /> Restart & Install
                        </button>
                    ) : updateState === 'available' ? (
                        <button onClick={handleDownload} style={{
                            flex: 1, padding: '10px 16px', borderRadius: 10,
                            background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                            border: 'none', color: '#fff', fontWeight: 600, fontSize: 13,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            transition: 'all 0.2s'
                        }}>
                            <Download size={14} /> Download v{updateInfo?.version}
                        </button>
                    ) : updateState === 'downloading' ? (
                        <button disabled style={{
                            flex: 1, padding: '10px 16px', borderRadius: 10,
                            background: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.2)',
                            color: '#60a5fa', fontWeight: 600, fontSize: 13,
                            cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                        }}>
                            <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Downloading {downloadProgress}%
                        </button>
                    ) : (
                        <button
                            onClick={handleCheckUpdate}
                            disabled={updateState === 'checking'}
                            style={{
                                flex: 1, padding: '10px 16px', borderRadius: 10,
                                background: updateState === 'checking' ? 'rgba(139, 92, 246, 0.1)' : 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2))',
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                                color: updateState === 'uptodate' ? '#10b981' : '#a78bfa',
                                fontWeight: 600, fontSize: 13,
                                cursor: updateState === 'checking' ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                transition: 'all 0.2s'
                            }}
                        >
                            {updateState === 'checking' ? (
                                <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Checking...</>
                            ) : updateState === 'uptodate' ? (
                                <><CheckCircle size={14} /> Check Again</>
                            ) : (
                                <><RefreshCw size={14} /> Check for Updates</>
                            )}
                        </button>
                    )}
                </div>
            </motion.div>

            {/* Changelog */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="card"
                style={{ padding: 24, marginBottom: 24 }}
            >
                <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={18} color="#8b5cf6" /> Changelog
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {changelog.map((release, idx) => (
                        <div key={release.version} style={{
                            padding: 16,
                            borderRadius: 10,
                            background: idx === 0 ? 'rgba(139, 92, 246, 0.08)' : 'rgba(255,255,255,0.02)',
                            border: `1px solid ${idx === 0 ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)'}`
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <span style={{
                                    background: idx === 0 ? 'linear-gradient(135deg, #8b5cf6, #06b6d4)' : 'rgba(255,255,255,0.08)',
                                    padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                                    color: idx === 0 ? '#fff' : 'rgba(255,255,255,0.5)'
                                }}>
                                    v{release.version}
                                </span>
                                {idx === 0 && (
                                    <span style={{ fontSize: 10, color: '#10b981', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Latest
                                    </span>
                                )}
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' }}>
                                    {release.date}
                                </span>
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {release.items.map((item, j) => (
                                    <li key={j} style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
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
                            transition={{ delay: 0.3 + i * 0.08 }}
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
                            <InfoRow key={t.name} label={t.name} value={t.value} />
                        ))}
                    </div>
                </motion.div>

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

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-3px); }
                }
            `}</style>
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
