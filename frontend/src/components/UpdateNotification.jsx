import { useState, useEffect } from 'react';
import { Download, X, RefreshCw, CheckCircle, ArrowUpCircle } from 'lucide-react';

export default function UpdateNotification() {
    const [updateInfo, setUpdateInfo] = useState(null);
    const [progress, setProgress] = useState(null);
    const [ready, setReady] = useState(false);
    const [dismissed, setDismissed] = useState(false);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        if (!window.electronAPI) return;

        window.electronAPI.onUpdateAvailable((info) => {
            setUpdateInfo(info);
        });

        window.electronAPI.onUpdateProgress((percent) => {
            setProgress(percent);
        });

        window.electronAPI.onUpdateReady(() => {
            setReady(true);
            setDownloading(false);
            setProgress(null);
        });
    }, []);

    if (!updateInfo || dismissed) return null;

    const handleDownload = () => {
        setDownloading(true);
        window.electronAPI?.downloadUpdate();
    };

    const handleInstall = () => {
        window.electronAPI?.installUpdate();
    };

    return (
        <div style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            width: 360,
            background: 'linear-gradient(135deg, rgba(15,15,25,0.98), rgba(20,20,35,0.98))',
            border: '1px solid rgba(124, 58, 237, 0.4)',
            borderRadius: 16,
            padding: '20px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 60px rgba(124,58,237,0.1)',
            backdropFilter: 'blur(20px)',
            animation: 'slideUp 0.4s ease'
        }}>
            {/* Close button */}
            {!downloading && !ready && (
                <button
                    onClick={() => setDismissed(true)}
                    style={{
                        position: 'absolute', top: 12, right: 12,
                        background: 'none', border: 'none', color: 'var(--text-muted)',
                        cursor: 'pointer', padding: 4
                    }}
                >
                    <X size={16} />
                </button>
            )}

            {/* Icon + Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: ready ? 'rgba(16,185,129,0.15)' : 'rgba(124,58,237,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    {ready ? <CheckCircle size={22} style={{ color: '#10b981' }} />
                        : <ArrowUpCircle size={22} style={{ color: '#8b5cf6' }} />}
                </div>
                <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                        {ready ? 'Update Ready!' : `Update Available`}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        v{updateInfo.version}
                    </div>
                </div>
            </div>

            {/* Progress bar */}
            {downloading && progress !== null && (
                <div style={{ marginBottom: 12 }}>
                    <div style={{
                        height: 4, borderRadius: 2,
                        background: 'rgba(255,255,255,0.08)',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            height: '100%', borderRadius: 2,
                            background: 'linear-gradient(90deg, #8b5cf6, #06b6d4)',
                            width: `${progress}%`,
                            transition: 'width 0.3s ease'
                        }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
                        Downloading... {progress}%
                    </div>
                </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
                {ready ? (
                    <button onClick={handleInstall} style={{
                        flex: 1, padding: '10px 16px', borderRadius: 10,
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        border: 'none', color: '#fff', fontWeight: 600, fontSize: 13,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                    }}>
                        <RefreshCw size={14} /> Restart & Update
                    </button>
                ) : downloading ? (
                    <button disabled style={{
                        flex: 1, padding: '10px 16px', borderRadius: 10,
                        background: 'rgba(124,58,237,0.2)',
                        border: '1px solid rgba(124,58,237,0.3)',
                        color: 'var(--text-muted)', fontWeight: 600, fontSize: 13,
                        cursor: 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                    }}>
                        <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Downloading...
                    </button>
                ) : (
                    <>
                        <button onClick={handleDownload} style={{
                            flex: 1, padding: '10px 16px', borderRadius: 10,
                            background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                            border: 'none', color: '#fff', fontWeight: 600, fontSize: 13,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                        }}>
                            <Download size={14} /> Download Update
                        </button>
                        <button onClick={() => setDismissed(true)} style={{
                            padding: '10px 16px', borderRadius: 10,
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: 'var(--text-muted)', fontWeight: 500, fontSize: 13,
                            cursor: 'pointer'
                        }}>
                            Later
                        </button>
                    </>
                )}
            </div>

            <style>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
