import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Upload, FolderOpen, Settings, Zap, Key, Info, ArrowUpCircle } from 'lucide-react';

const APP_VERSION = __APP_VERSION__ || '1.1.6';

const navItems = [
    { path: '/', icon: Home, label: 'Dashboard' },
    { path: '/upload', icon: Upload, label: 'New Project' },
    { path: '/projects', icon: FolderOpen, label: 'Projects' },
    { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
    const location = useLocation();
    const [hasUpdate, setHasUpdate] = useState(false);

    useEffect(() => {
        if (window.electronAPI) {
            window.electronAPI.onUpdateAvailable(() => {
                setHasUpdate(true);
            });
        }
    }, []);

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="logo-icon">
                    <Zap size={20} />
                </div>
                <span className="logo-text">ClipperSkuy</span>
            </div>

            <nav className="sidebar-nav">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                        >
                            <Icon size={20} />
                            <span>{item.label}</span>
                        </NavLink>
                    );
                })}
            </nav>

            <div className="sidebar-bottom">
                <NavLink
                    to="/license"
                    className={`sidebar-nav-item ${location.pathname === '/license' ? 'active' : ''}`}
                >
                    <Key size={20} />
                    <span>License</span>
                </NavLink>
                <NavLink
                    to="/about"
                    className={`sidebar-nav-item ${location.pathname === '/about' ? 'active' : ''}`}
                    style={{ position: 'relative' }}
                >
                    <Info size={20} />
                    <span>About</span>
                    {hasUpdate && (
                        <span style={{
                            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                            width: 8, height: 8, borderRadius: '50%',
                            background: '#fbbf24',
                            boxShadow: '0 0 8px rgba(251, 191, 36, 0.6)',
                            animation: 'pulse 2s ease-in-out infinite'
                        }} />
                    )}
                </NavLink>
                <NavLink
                    to="/about"
                    className="sidebar-version-link"
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        padding: '6px 0', textDecoration: 'none',
                        fontSize: 11, color: hasUpdate ? '#fbbf24' : 'rgba(255,255,255,0.25)',
                        transition: 'color 0.2s'
                    }}
                >
                    {hasUpdate && <ArrowUpCircle size={12} />}
                    <span>v{APP_VERSION}{hasUpdate ? ' • Update available' : ''}</span>
                </NavLink>
            </div>

            <style>{`
                .sidebar-version-link:hover {
                    color: rgba(255,255,255,0.6) !important;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: translateY(-50%) scale(1); }
                    50% { opacity: 0.5; transform: translateY(-50%) scale(0.8); }
                }
            `}</style>
        </aside>
    );
}

