import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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

function App() {
  return (
    <Router>
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
            <Route path="/license" element={<License />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <UpdateNotification />
      </div>
    </Router>
  );
}

export default App;
