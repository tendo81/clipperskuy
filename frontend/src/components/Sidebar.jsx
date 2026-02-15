import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Upload, FolderOpen, Settings, Zap, Key, Info, Shield } from 'lucide-react';

const navItems = [
    { path: '/', icon: Home, label: 'Dashboard' },
    { path: '/upload', icon: Upload, label: 'New Project' },
    { path: '/projects', icon: FolderOpen, label: 'Projects' },
    { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
    const location = useLocation();

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
                    to="/admin"
                    className={`sidebar-nav-item ${location.pathname === '/admin' ? 'active' : ''}`}
                >
                    <Shield size={20} />
                    <span>Admin</span>
                </NavLink>
                <NavLink
                    to="/about"
                    className={`sidebar-nav-item ${location.pathname === '/about' ? 'active' : ''}`}
                >
                    <Info size={20} />
                    <span>About</span>
                </NavLink>
                <div className="sidebar-version">ClipperSkuy v1.0.0</div>
            </div>
        </aside>
    );
}
