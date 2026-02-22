import React, { useEffect, useState, createContext, useContext } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import UpdateNotification from './components/UpdateNotification';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import ClipEditor from './pages/ClipEditor';
import Settings from './pages/Settings';
import About from './pages/About';
import License from './pages/License';
import Admin from './pages/Admin';
import AudioLibrary from './pages/AudioLibrary';

const API = 'http://localhost:5000/api';

// Detect if running inside Electron
const isElectron = !!(window && window.process && window.process.type)
  || !!(window && window.__ELECTRON__)
  || (typeof navigator === 'object' && navigator.userAgent.indexOf('Electron') >= 0);

// Theme context
export const ThemeContext = createContext({ theme: 'dark', setTheme: () => { } });

function applyTheme(theme) {
  let resolved = theme;
  if (theme === 'auto') {
    resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', resolved);
}

function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('dark');

  const setTheme = (t) => {
    setThemeState(t);
    applyTheme(t);
    localStorage.setItem('clipperskuy-theme', t);
  };

  useEffect(() => {
    // 1. Try localStorage first (instant, no flash)
    const cached = localStorage.getItem('clipperskuy-theme');
    if (cached) {
      setThemeState(cached);
      applyTheme(cached);
    }

    // 2. Then sync from backend settings
    fetch(`${API}/settings`)
      .then(r => r.json())
      .then(data => {
        const serverTheme = data.settings?.app_theme || 'dark';
        setThemeState(serverTheme);
        applyTheme(serverTheme);
        localStorage.setItem('clipperskuy-theme', serverTheme);
      })
      .catch(() => { });

    // 3. Listen for system theme changes (for auto mode)
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      const current = localStorage.getItem('clipperskuy-theme') || 'dark';
      if (current === 'auto') applyTheme('auto');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Secret shortcut: Ctrl+Shift+A → Admin Panel (only in web browser, NOT in Electron)
function AdminShortcut() {
  const navigate = useNavigate();
  useEffect(() => {
    if (isElectron) return; // Disabled in Electron app
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        navigate('/admin');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);
  return null;
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <AdminShortcut />
        <div className="app-layout">
          <Sidebar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/projects/:id/clips/:clipId" element={<ClipEditor />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/audio" element={<AudioLibrary />} />
              <Route path="/license" element={<License />} />
              {/* Admin route only available in web browser, NOT in Electron app */}
              {!isElectron && <Route path="/admin" element={<Admin />} />}
              <Route path="/about" element={<About />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <UpdateNotification />
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
