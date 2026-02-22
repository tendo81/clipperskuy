import React, { useState, useEffect, useRef, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings as SettingsIcon, Cpu, FolderOpen, Eye, EyeOff, CheckCircle, XCircle, RefreshCw, Save, Bot, HardDrive, Palette, Plus, Trash2, Key, Image, Upload, Monitor, Moon, Sun, Paintbrush, Database, AlertTriangle, Volume2, Film, AtSign, Droplets } from 'lucide-react';
import { ThemeContext } from '../App';

const API = 'http://localhost:5000/api';

export default function SettingsPage() {
    const { setTheme } = useContext(ThemeContext);
    const [groqKeys, setGroqKeys] = useState(['']);
    const [geminiKeys, setGeminiKeys] = useState(['']);
    const [showGroq, setShowGroq] = useState({});
    const [showGemini, setShowGemini] = useState({});
    const [groqValid, setGroqValid] = useState({});
    const [geminiValid, setGeminiValid] = useState({});
    const [primaryProvider, setPrimaryProvider] = useState('groq');
    const [encoder, setEncoder] = useState('auto');
    const [hwAccel, setHwAccel] = useState('auto');
    const [quality, setQuality] = useState('balanced');
    const [outputResolution, setOutputResolution] = useState('1080p');
    const [outputDir, setOutputDir] = useState('');
    const [watermarkPath, setWatermarkPath] = useState('');
    const [watermarkPosition, setWatermarkPosition] = useState('bottom-right');
    const [watermarkOpacity, setWatermarkOpacity] = useState(0.5);
    const [watermarkSize, setWatermarkSize] = useState(15);
    const [watermarkEnabled, setWatermarkEnabled] = useState(false);
    const [watermarkType, setWatermarkType] = useState('image'); // 'image', 'text', 'text-moving'
    const [watermarkText, setWatermarkText] = useState('');
    const [watermarkFontSize, setWatermarkFontSize] = useState(24);
    const [watermarkColor, setWatermarkColor] = useState('#ffffff');
    const [watermarkMotion, setWatermarkMotion] = useState('corner-hop'); // 'corner-hop', 'scroll', 'bounce'
    const [watermarkSpeed, setWatermarkSpeed] = useState(4); // seconds per cycle
    const [saved, setSaved] = useState(false);
    const [loaded, setLoaded] = useState(false);

    // App Customization state
    const [brandingAssets, setBrandingAssets] = useState({});
    const [accentColor, setAccentColor] = useState('#8b5cf6');
    const [appTheme, setAppTheme] = useState('dark');
    const [appDisplayName, setAppDisplayName] = useState('ClipperSkuy');
    const [uploadingType, setUploadingType] = useState(null);
    const [hwDetecting, setHwDetecting] = useState(false);
    const [hwInfo, setHwInfo] = useState(null);

    // Progress Bar state
    const [progressBarEnabled, setProgressBarEnabled] = useState(false);
    const [pbColorStart, setPbColorStart] = useState('#3b82f6');
    const [pbColorMid, setPbColorMid] = useState('#eab308');
    const [pbColorEnd, setPbColorEnd] = useState('#ef4444');
    const [pbHeight, setPbHeight] = useState(6);
    const [pbOpacity, setPbOpacity] = useState(0.85);
    const [pbPosition, setPbPosition] = useState('bottom');

    // Audio Enhancement state
    const [noiseReduction, setNoiseReduction] = useState(false);
    const [noiseLevel, setNoiseLevel] = useState('medium');
    const [voiceClarity, setVoiceClarity] = useState(false);
    const [pexelsKeys, setPexelsKeys] = useState(['']);
    const [showPexels, setShowPexels] = useState({});

    // Social Handles state
    const [socialTiktok, setSocialTiktok] = useState('');
    const [socialInstagram, setSocialInstagram] = useState('');
    const [socialYoutube, setSocialYoutube] = useState('');
    const [socialTwitter, setSocialTwitter] = useState('');

    // Brand Colors state
    const [brandPrimary, setBrandPrimary] = useState('#8b5cf6');
    const [brandSecondary, setBrandSecondary] = useState('#1a1a2e');
    const [brandAccent, setBrandAccent] = useState('#06b6d4');

    // License tier
    const [licenseTier, setLicenseTier] = useState('free');
    const [actualTier, setActualTier] = useState('free');

    const fileInputRef = useRef(null);

    // Load existing settings on mount
    useEffect(() => {
        // Fetch license tier
        fetch(`${API}/license`)
            .then(r => r.json())
            .then(data => {
                const t = data.tier || 'free';
                // Preview free only works if admin is logged in
                const isAdmin = !!sessionStorage.getItem('admin_password');
                const previewFree = isAdmin && localStorage.getItem('previewFreeTier') === 'true';
                setLicenseTier(previewFree ? 'free' : t);
                setActualTier(t);
            })
            .catch(() => { });

        fetch(`${API}/settings`)
            .then(r => r.json())
            .then(data => {
                // Handle both formats: object { key: value } or array [{ key, value }]
                let settings = {};
                if (Array.isArray(data.settings)) {
                    data.settings.forEach(s => { settings[s.key] = s.value; });
                } else if (data.settings && typeof data.settings === 'object') {
                    settings = data.settings;
                }

                // Parse comma-separated keys
                const gKeys = (settings.groq_api_key || '').split(',').map(k => k.trim()).filter(k => k);
                const gemKeys = (settings.gemini_api_key || '').split(',').map(k => k.trim()).filter(k => k);

                setGroqKeys(gKeys.length > 0 ? gKeys : ['']);
                setGeminiKeys(gemKeys.length > 0 ? gemKeys : ['']);
                setPrimaryProvider(settings.ai_provider_primary || 'groq');
                setEncoder(settings.encoder || 'auto');
                setHwAccel(settings.hw_accel || 'auto');
                setQuality(settings.quality_preset || 'balanced');
                setOutputResolution(settings.output_resolution || '1080p');
                setOutputDir(settings.output_dir || '');
                setWatermarkPath(settings.watermark_path || '');
                setWatermarkPosition(settings.watermark_position || 'bottom-right');
                setWatermarkOpacity(parseFloat(settings.watermark_opacity || '0.5'));
                setWatermarkSize(parseInt(settings.watermark_size || '15'));
                setWatermarkEnabled(settings.watermark_enabled === 'true' || settings.watermark_enabled === '1');
                setWatermarkType(settings.watermark_type || 'image');
                setWatermarkText(settings.watermark_text || '');
                setWatermarkFontSize(parseInt(settings.watermark_font_size || '24'));
                setWatermarkColor(settings.watermark_color || '#ffffff');
                setWatermarkMotion(settings.watermark_motion || 'corner-hop');
                setWatermarkSpeed(parseInt(settings.watermark_speed || '4'));

                // App customization
                setAccentColor(settings.accent_color || '#8b5cf6');
                setAppTheme(settings.app_theme || 'dark');
                setAppDisplayName(settings.app_display_name || 'ClipperSkuy');

                // Progress bar
                setProgressBarEnabled(settings.progress_bar_enabled === 'true' || settings.progress_bar_enabled === '1');
                setPbColorStart(settings.progress_bar_color_start || '#3b82f6');
                setPbColorMid(settings.progress_bar_color_mid || '#eab308');
                setPbColorEnd(settings.progress_bar_color_end || '#ef4444');
                setPbHeight(parseInt(settings.progress_bar_height || '6'));
                setPbOpacity(parseFloat(settings.progress_bar_opacity || '0.85'));
                setPbPosition(settings.progress_bar_position || 'bottom');

                // Audio Enhancement
                setNoiseReduction(settings.noise_reduction === 'true' || settings.noise_reduction === '1');
                setNoiseLevel(settings.noise_reduction_level || 'medium');
                setVoiceClarity(settings.voice_clarity === 'true' || settings.voice_clarity === '1');
                const pKeys = (settings.pexels_api_key || '').split(',').map(k => k.trim()).filter(k => k);
                setPexelsKeys(pKeys.length > 0 ? pKeys : ['']);

                // Social Handles
                setSocialTiktok(settings.social_tiktok || '');
                setSocialInstagram(settings.social_instagram || '');
                setSocialYoutube(settings.social_youtube || '');
                setSocialTwitter(settings.social_twitter || '');

                // Brand Colors
                setBrandPrimary(settings.brand_color_primary || '#8b5cf6');
                setBrandSecondary(settings.brand_color_secondary || '#1a1a2e');
                setBrandAccent(settings.brand_color_accent || '#06b6d4');

                setLoaded(true);
            })
            .catch(() => setLoaded(true));

        // Load branding assets
        fetch(`${API}/branding`)
            .then(r => r.json())
            .then(data => setBrandingAssets(data.assets || {}))
            .catch(() => { });
    }, []);

    const addGroqKey = () => setGroqKeys([...groqKeys, '']);
    const removeGroqKey = (idx) => {
        const updated = groqKeys.filter((_, i) => i !== idx);
        setGroqKeys(updated.length > 0 ? updated : ['']);
    };
    const updateGroqKey = (idx, val) => {
        const updated = [...groqKeys];
        updated[idx] = val;
        setGroqKeys(updated);
        setGroqValid(prev => ({ ...prev, [idx]: null }));
    };

    const addGeminiKey = () => setGeminiKeys([...geminiKeys, '']);
    const removeGeminiKey = (idx) => {
        const updated = geminiKeys.filter((_, i) => i !== idx);
        setGeminiKeys(updated.length > 0 ? updated : ['']);
    };
    const updateGeminiKey = (idx, val) => {
        const updated = [...geminiKeys];
        updated[idx] = val;
        setGeminiKeys(updated);
        setGeminiValid(prev => ({ ...prev, [idx]: null }));
    };

    const validateKey = async (provider, index) => {
        try {
            const key = provider === 'groq' ? groqKeys[index] : geminiKeys[index];
            if (!key) return;
            const res = await fetch(`${API}/settings/validate-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, apiKey: key })
            });
            const data = await res.json();
            if (provider === 'groq') setGroqValid(prev => ({ ...prev, [index]: data.valid }));
            else setGeminiValid(prev => ({ ...prev, [index]: data.valid }));
        } catch {
            if (provider === 'groq') setGroqValid(prev => ({ ...prev, [index]: false }));
            else setGeminiValid(prev => ({ ...prev, [index]: false }));
        }
    };

    const handleSave = async () => {
        try {
            const groqJoined = groqKeys.filter(k => k.trim()).join(',');
            const geminiJoined = geminiKeys.filter(k => k.trim()).join(',');

            await fetch(`${API}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    groq_api_key: groqJoined,
                    gemini_api_key: geminiJoined,
                    ai_provider_primary: primaryProvider,
                    encoder,
                    hw_accel: hwAccel,
                    quality_preset: quality,
                    output_resolution: outputResolution,
                    output_dir: outputDir,
                    watermark_path: watermarkPath,
                    watermark_position: watermarkPosition,
                    watermark_opacity: String(watermarkOpacity),
                    watermark_size: String(watermarkSize),
                    watermark_enabled: watermarkEnabled ? 'true' : 'false',
                    watermark_type: watermarkType,
                    watermark_text: watermarkText,
                    watermark_font_size: String(watermarkFontSize),
                    watermark_color: watermarkColor,
                    watermark_motion: watermarkMotion,
                    watermark_speed: String(watermarkSpeed),
                    // App customization
                    accent_color: accentColor,
                    app_theme: appTheme,
                    app_display_name: appDisplayName,
                    // Progress bar
                    progress_bar_enabled: progressBarEnabled ? 'true' : 'false',
                    progress_bar_color_start: pbColorStart,
                    progress_bar_color_mid: pbColorMid,
                    progress_bar_color_end: pbColorEnd,
                    progress_bar_height: String(pbHeight),
                    progress_bar_opacity: String(pbOpacity),
                    progress_bar_position: pbPosition,
                    // Audio Enhancement
                    noise_reduction: noiseReduction ? 'true' : 'false',
                    noise_reduction_level: noiseLevel,
                    voice_clarity: voiceClarity ? 'true' : 'false',
                    // B-Roll
                    pexels_api_key: pexelsKeys.filter(k => k.trim()).join(','),
                    // Social Handles
                    social_tiktok: socialTiktok,
                    social_instagram: socialInstagram,
                    social_youtube: socialYoutube,
                    social_twitter: socialTwitter,
                    // Brand Colors
                    brand_color_primary: brandPrimary,
                    brand_color_secondary: brandSecondary,
                    brand_color_accent: brandAccent
                })
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error('Save failed:', err);
        }
    };

    // Branding asset upload
    const handleBrandingUpload = async (type) => {
        fileInputRef.current.dataset.type = type;
        fileInputRef.current.click();
    };

    const onFileSelected = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const type = e.target.dataset.type || 'icon';
        setUploadingType(type);

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${API}/branding/upload/${type}`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                setBrandingAssets(prev => ({
                    ...prev,
                    [type]: { filename: data.filename, path: data.path, size: data.size }
                }));
            }
        } catch (err) {
            console.error('Upload failed:', err);
        }
        setUploadingType(null);
        e.target.value = '';
    };

    const deleteBrandingAsset = async (type) => {
        try {
            await fetch(`${API}/branding/${type}`, { method: 'DELETE' });
            setBrandingAssets(prev => {
                const updated = { ...prev };
                delete updated[type];
                return updated;
            });
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    const KeyStatus = ({ valid }) => {
        if (valid === null || valid === undefined) return null;
        return valid
            ? <CheckCircle size={18} style={{ color: 'var(--color-success)' }} />
            : <XCircle size={18} style={{ color: 'var(--color-error)' }} />;
    };

    const activeGroqCount = groqKeys.filter(k => k.trim()).length;
    const activeGeminiCount = geminiKeys.filter(k => k.trim()).length;

    return (
        <>
            <div className="page-header">
                <motion.h1 initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                    Settings
                </motion.h1>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
                    Configure AI providers, video processing, and application preferences
                </motion.p>
            </div>

            <div className="page-body">
                {/* AI Configuration */}
                <motion.div className="settings-section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                    <div className="settings-section-title"><Bot size={20} /> AI Configuration</div>

                    {/* Groq Keys */}
                    <div className="form-group">
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            Groq API Keys
                            {activeGroqCount > 0 && (
                                <span style={{
                                    background: 'linear-gradient(135deg, #7c3aed, #2dd4bf)',
                                    padding: '2px 10px',
                                    borderRadius: 12,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: '#fff'
                                }}>
                                    {activeGroqCount} key{activeGroqCount > 1 ? 's' : ''} active
                                </span>
                            )}
                        </label>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4 }}>
                            🔄 Add multiple keys for automatic rotation — when one key hits rate limits, the next key takes over
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {groqKeys.map((key, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                                >
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '50%',
                                        background: key.trim() ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 12, fontWeight: 600, color: 'var(--accent-primary)', flexShrink: 0
                                    }}>
                                        {idx + 1}
                                    </div>
                                    <div style={{ flex: 1, position: 'relative' }}>
                                        <input
                                            type={showGroq[idx] ? 'text' : 'password'}
                                            className="input-field"
                                            placeholder="gsk_xxxxxxxxxxxxxxxx"
                                            value={key}
                                            onChange={(e) => updateGroqKey(idx, e.target.value)}
                                            style={{ paddingRight: 40, fontSize: 13 }}
                                        />
                                        <button className="btn btn-ghost btn-icon" onClick={() => setShowGroq({ ...showGroq, [idx]: !showGroq[idx] })}
                                            style={{ position: 'absolute', right: 4, top: 4, width: 32, height: 32 }}>
                                            {showGroq[idx] ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                    <button className="btn btn-secondary btn-sm" onClick={() => validateKey('groq', idx)} style={{ padding: '6px 10px' }}>
                                        <RefreshCw size={13} />
                                    </button>
                                    <KeyStatus valid={groqValid[idx]} />
                                    {groqKeys.length > 1 && (
                                        <button className="btn btn-ghost btn-sm" onClick={() => removeGroqKey(idx)}
                                            style={{ padding: '6px 8px', color: 'var(--color-error)', opacity: 0.7 }}>
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </motion.div>
                            ))}
                        </div>

                        <button className="btn btn-ghost btn-sm" onClick={addGroqKey}
                            style={{ marginTop: 8, color: 'var(--accent-cyan)', gap: 6, fontSize: 12 }}>
                            <Plus size={14} /> Add Another Groq Key
                        </button>
                    </div>

                    {/* Gemini Keys */}
                    <div className="form-group" style={{ marginTop: 24 }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            Gemini API Keys
                            {activeGeminiCount > 0 && (
                                <span style={{
                                    background: 'linear-gradient(135deg, #3b82f6, #10b981)',
                                    padding: '2px 10px',
                                    borderRadius: 12,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: '#fff'
                                }}>
                                    {activeGeminiCount} key{activeGeminiCount > 1 ? 's' : ''} active
                                </span>
                            )}
                        </label>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4 }}>
                            🔄 Fallback provider — also supports multiple keys for rotation
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {geminiKeys.map((key, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                                >
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '50%',
                                        background: key.trim() ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 12, fontWeight: 600, color: 'var(--accent-cyan)', flexShrink: 0
                                    }}>
                                        {idx + 1}
                                    </div>
                                    <div style={{ flex: 1, position: 'relative' }}>
                                        <input
                                            type={showGemini[idx] ? 'text' : 'password'}
                                            className="input-field"
                                            placeholder="AIzaSyxxxxxxxxxxxxxxxxx"
                                            value={key}
                                            onChange={(e) => updateGeminiKey(idx, e.target.value)}
                                            style={{ paddingRight: 40, fontSize: 13 }}
                                        />
                                        <button className="btn btn-ghost btn-icon" onClick={() => setShowGemini({ ...showGemini, [idx]: !showGemini[idx] })}
                                            style={{ position: 'absolute', right: 4, top: 4, width: 32, height: 32 }}>
                                            {showGemini[idx] ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                    <button className="btn btn-secondary btn-sm" onClick={() => validateKey('gemini', idx)} style={{ padding: '6px 10px' }}>
                                        <RefreshCw size={13} />
                                    </button>
                                    <KeyStatus valid={geminiValid[idx]} />
                                    {geminiKeys.length > 1 && (
                                        <button className="btn btn-ghost btn-sm" onClick={() => removeGeminiKey(idx)}
                                            style={{ padding: '6px 8px', color: 'var(--color-error)', opacity: 0.7 }}>
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </motion.div>
                            ))}
                        </div>

                        <button className="btn btn-ghost btn-sm" onClick={addGeminiKey}
                            style={{ marginTop: 8, color: 'var(--accent-cyan)', gap: 6, fontSize: 12 }}>
                            <Plus size={14} /> Add Another Gemini Key
                        </button>
                    </div>

                    {/* Provider priority */}
                    <div className="form-group" style={{ marginTop: 24 }}>
                        <label className="form-label">Primary AI Provider</label>
                        <select className="select-field" style={{ maxWidth: 280 }} value={primaryProvider} onChange={(e) => setPrimaryProvider(e.target.value)}>
                            <option value="groq">Groq (Fast, recommended)</option>
                            <option value="gemini">Gemini (Multimodal)</option>
                        </select>
                    </div>

                    {/* Pexels API Keys for B-Roll */}
                    <div className="form-group" style={{ marginTop: 24 }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Film size={16} /> Pexels API Keys (B-Roll)
                            {pexelsKeys.filter(k => k.trim()).length > 0 && (
                                <span style={{
                                    background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                                    padding: '2px 10px',
                                    borderRadius: 12,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    color: '#fff'
                                }}>
                                    {pexelsKeys.filter(k => k.trim()).length} key{pexelsKeys.filter(k => k.trim()).length > 1 ? 's' : ''} active
                                </span>
                            )}
                        </label>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4 }}>
                            📽️ Free API key for stock footage search — <a href="https://www.pexels.com/api/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)' }}>Get your key at pexels.com/api</a>
                            {pexelsKeys.filter(k => k.trim()).length > 1 && <span style={{ marginLeft: 8, opacity: 0.7 }}>🔄 Auto-rotation on rate limits</span>}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {pexelsKeys.map((key, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                                >
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '50%',
                                        background: key.trim() ? 'rgba(6,182,212,0.2)' : 'rgba(255,255,255,0.05)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 12, fontWeight: 600, color: '#06b6d4', flexShrink: 0
                                    }}>
                                        {idx + 1}
                                    </div>
                                    <div style={{ flex: 1, position: 'relative' }}>
                                        <input
                                            type={showPexels[idx] ? 'text' : 'password'}
                                            className="input-field"
                                            placeholder="Enter Pexels API key..."
                                            value={key}
                                            onChange={(e) => {
                                                const updated = [...pexelsKeys];
                                                updated[idx] = e.target.value;
                                                setPexelsKeys(updated);
                                            }}
                                            style={{ paddingRight: 40, fontSize: 13 }}
                                        />
                                        <button className="btn btn-ghost btn-icon" onClick={() => setShowPexels({ ...showPexels, [idx]: !showPexels[idx] })}
                                            style={{ position: 'absolute', right: 4, top: 4, width: 32, height: 32 }}>
                                            {showPexels[idx] ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                    {pexelsKeys.length > 1 && (
                                        <button className="btn btn-ghost btn-sm" onClick={() => {
                                            const updated = pexelsKeys.filter((_, i) => i !== idx);
                                            setPexelsKeys(updated.length > 0 ? updated : ['']);
                                        }}
                                            style={{ padding: '6px 8px', color: 'var(--color-error)', opacity: 0.7 }}>
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </motion.div>
                            ))}
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => setPexelsKeys([...pexelsKeys, ''])}
                            style={{ marginTop: 8, color: '#06b6d4', gap: 6, fontSize: 12 }}>
                            <Plus size={14} /> Add Another Pexels Key
                        </button>
                    </div>

                    {/* Key Pool Info */}
                    {(activeGroqCount > 1 || activeGeminiCount > 1 || pexelsKeys.filter(k => k.trim()).length > 1) && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{
                                marginTop: 16,
                                padding: '12px 16px',
                                background: 'rgba(124,58,237,0.08)',
                                border: '1px solid rgba(124,58,237,0.15)',
                                borderRadius: 'var(--radius-md)',
                                fontSize: 13,
                                lineHeight: 1.6,
                                color: 'var(--text-secondary)'
                            }}
                        >
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Key size={14} /> Key Pool Active
                            </div>
                            {activeGroqCount > 1 && <div>🟢 Groq: {activeGroqCount} keys — auto-rotation on rate limits</div>}
                            {activeGeminiCount > 1 && <div>🔵 Gemini: {activeGeminiCount} keys — auto-rotation on rate limits</div>}
                            {pexelsKeys.filter(k => k.trim()).length > 1 && <div>🟦 Pexels: {pexelsKeys.filter(k => k.trim()).length} keys — auto-rotation on rate limits</div>}
                            <div style={{ marginTop: 4, opacity: 0.7 }}>Keys automatically rotate when one hits API limits. No manual intervention needed.</div>
                        </motion.div>
                    )}
                </motion.div>

                {/* Video Processing */}
                <motion.div className="settings-section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
                    <div className="settings-section-title"><HardDrive size={20} /> Video Processing</div>

                    <div className="form-group">
                        <label className="form-label">GPU Acceleration</label>
                        <select className="select-field" style={{ maxWidth: 300 }} value={hwAccel} onChange={(e) => setHwAccel(e.target.value)}>
                            <option value="auto">Auto (CPU - most reliable)</option>
                            <option value="nvidia">NVIDIA GPU (NVENC)</option>
                            <option value="amd">AMD GPU (AMF)</option>
                            <option value="intel">Intel GPU (QSV)</option>
                            <option value="none">CPU Only</option>
                        </select>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            GPU acceleration can speed up rendering 3-5x. Make sure your GPU drivers are up to date.
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Video Encoder</label>
                        <select className="select-field" style={{ maxWidth: 300 }} value={encoder} onChange={(e) => setEncoder(e.target.value)}>
                            <option value="auto">Auto (based on GPU setting)</option>
                            <option value="h264_nvenc">NVIDIA NVENC (h264)</option>
                            <option value="h264_amf">AMD AMF (h264)</option>
                            <option value="h264_qsv">Intel QSV (h264)</option>
                            <option value="libx264">CPU - libx264 (Software)</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Quality Preset</label>
                        <div className="chip-group">
                            {['best', 'balanced', 'fast'].map((q) => (
                                <button key={q} className={`chip ${quality === q ? 'active' : ''}`} onClick={() => setQuality(q)}>
                                    {q === 'best' ? '🏆 Best' : q === 'balanced' ? '⚡ Balanced' : '📱 Quick'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Output Resolution */}
                    <div className="form-group">
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            Output Resolution
                            {actualTier !== 'free' && sessionStorage.getItem('admin_password') && (
                                <button
                                    onClick={() => {
                                        const newTier = licenseTier === 'free' ? actualTier : 'free';
                                        setLicenseTier(newTier);
                                        const isPreview = newTier === 'free';
                                        if (isPreview) {
                                            localStorage.setItem('previewFreeTier', 'true');
                                        } else {
                                            localStorage.removeItem('previewFreeTier');
                                        }
                                        // Also save to backend so rendering respects preview mode
                                        fetch(`${API}/settings`, {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ preview_free_tier: isPreview ? 'true' : 'false' })
                                        }).catch(() => { });
                                    }}
                                    style={{
                                        fontSize: 9, padding: '2px 8px', borderRadius: 6,
                                        background: licenseTier === 'free' ? 'rgba(239,68,68,0.2)' : 'rgba(139,92,246,0.15)',
                                        color: licenseTier === 'free' ? '#ef4444' : '#8b5cf6',
                                        border: 'none', cursor: 'pointer', fontWeight: 600
                                    }}>
                                    {licenseTier === 'free' ? '👁 Previewing Free' : '🔧 Preview Free'}
                                </button>
                            )}
                        </label>
                        <div className="chip-group">
                            {[
                                { id: '1080p', label: '🎬 1080p', desc: 'Full HD', pro: true },
                                { id: '720p', label: '📺 720p', desc: 'HD - Faster', pro: false },
                                { id: '480p', label: '📱 480p', desc: 'SD - Fastest', pro: false }
                            ].map((r) => {
                                const isLocked = r.pro && licenseTier === 'free';
                                return (
                                    <button key={r.id}
                                        className={`chip ${outputResolution === r.id ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
                                        onClick={() => !isLocked && setOutputResolution(r.id)}
                                        style={{
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 16px',
                                            position: 'relative',
                                            opacity: isLocked ? 0.5 : 1,
                                            cursor: isLocked ? 'not-allowed' : 'pointer'
                                        }}>
                                        <span>{r.label}</span>
                                        <span style={{ fontSize: 10, opacity: 0.6 }}>{r.desc}</span>
                                        {isLocked && (
                                            <span style={{
                                                position: 'absolute', top: -6, right: -6,
                                                background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                                                color: '#fff', fontSize: 9, fontWeight: 700,
                                                padding: '1px 6px', borderRadius: 8,
                                                letterSpacing: 0.5
                                            }}>🔒 PRO</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            {licenseTier === 'free'
                                ? '🔒 1080p hanya tersedia untuk Pro. 720p cocok untuk TikTok/Reels.'
                                : 'Resolusi output clip yang di-render. 720p lebih cepat dan cocok untuk TikTok/Reels.'
                            }
                        </div>
                    </div>

                    {/* Audio Enhancement */}
                    <div style={{ marginTop: 16, padding: '16px', background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 10, position: 'relative', opacity: licenseTier === 'free' ? 0.6 : 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 600, fontSize: 14 }}>
                            <Volume2 size={18} style={{ color: '#8b5cf6' }} /> Audio Enhancement
                            {licenseTier === 'free' && (
                                <span style={{
                                    background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                                    color: '#fff', fontSize: 9, fontWeight: 700,
                                    padding: '1px 6px', borderRadius: 8
                                }}>🔒 PRO</span>
                            )}
                        </div>

                        {licenseTier === 'free' ? (
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
                                🔒 Noise Reduction & Voice Clarity hanya tersedia untuk Pro.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 200 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                                        <input type="checkbox" checked={noiseReduction} onChange={(e) => setNoiseReduction(e.target.checked)} style={{ accentColor: '#8b5cf6' }} />
                                        🔇 Noise Reduction
                                    </label>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, marginLeft: 24 }}>
                                        Hilangkan noise AC, kipas, traffic dari audio
                                    </div>
                                    {noiseReduction && (
                                        <div style={{ marginLeft: 24, marginTop: 8 }}>
                                            <div className="chip-group" style={{ gap: 6 }}>
                                                {[['light', '🟢 Light'], ['medium', '🟡 Medium'], ['heavy', '🔴 Heavy']].map(([val, label]) => (
                                                    <button key={val} className={`chip ${noiseLevel === val ? 'active' : ''}`}
                                                        onClick={() => setNoiseLevel(val)} style={{ fontSize: 11, padding: '4px 10px' }}>
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div style={{ flex: 1, minWidth: 200 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                                        <input type="checkbox" checked={voiceClarity} onChange={(e) => setVoiceClarity(e.target.checked)} style={{ accentColor: '#8b5cf6' }} />
                                        🎤 Voice Clarity Boost
                                    </label>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, marginLeft: 24 }}>
                                        EQ boost untuk suara lebih jernih dan tajam
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Hardware Detection */}
                    <div className="form-group">
                        <label className="form-label">Hardware Detection</label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={async () => {
                                    setHwDetecting(true);
                                    try {
                                        const res = await fetch(`${API}/settings/hardware-detect`, { method: 'POST' });
                                        const data = await res.json();
                                        if (data.success) {
                                            setHwInfo(data.hardware);
                                            if (data.hardware.recommended_encoder) {
                                                const recEncoder = data.hardware.recommended_encoder;
                                                setEncoder(recEncoder);
                                                // Auto-set GPU acceleration too
                                                let recHwAccel = 'auto';
                                                if (recEncoder.includes('amf')) recHwAccel = 'amd';
                                                else if (recEncoder.includes('nvenc')) recHwAccel = 'nvidia';
                                                else if (recEncoder.includes('qsv')) recHwAccel = 'intel';
                                                setHwAccel(recHwAccel);

                                                // Auto-save encoder settings immediately
                                                await fetch(`${API}/settings`, {
                                                    method: 'PUT',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        encoder: recEncoder,
                                                        hw_accel: recHwAccel
                                                    })
                                                });
                                                console.log(`[Settings] Auto-saved encoder: ${recEncoder}, hw_accel: ${recHwAccel}`);
                                            }
                                        }
                                    } catch (e) { console.error(e); }
                                    setHwDetecting(false);
                                }}
                                disabled={hwDetecting}
                            >
                                {hwDetecting ? <><RefreshCw size={14} className="spin" /> Detecting...</> : <><Cpu size={14} /> Auto-Detect Hardware</>}
                            </button>
                            {hwInfo && (
                                <div style={{
                                    flex: 1, minWidth: 250,
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    borderRadius: 8, padding: '10px 14px', fontSize: 12
                                }}>
                                    {hwInfo.gpu && <div style={{ color: '#8b5cf6', marginBottom: 4 }}>🎮 GPU: {hwInfo.gpu}</div>}
                                    <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                                        CPU: {hwInfo.cpu?.model} ({hwInfo.cpu?.cores} cores)
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.6)' }}>
                                        RAM: {hwInfo.memory?.total}
                                    </div>
                                    {hwInfo.encoders?.length > 0 && (
                                        <div style={{ color: '#22c55e', marginTop: 4 }}>
                                            ✓ Encoders: {hwInfo.encoders.join(', ')}
                                        </div>
                                    )}
                                    {hwInfo.ffmpeg && (
                                        <div style={{ color: 'rgba(255,255,255,0.4)', marginTop: 2, fontSize: 11 }}>
                                            {hwInfo.ffmpeg}
                                        </div>
                                    )}
                                    <div style={{ color: '#f59e0b', marginTop: 4, fontWeight: 600, fontSize: 11 }}>
                                        ⚡ Recommended: {hwInfo.recommended_encoder}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>

                {/* General */}
                <motion.div className="settings-section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
                    <div className="settings-section-title"><FolderOpen size={20} /> General</div>

                    <div className="form-group">
                        <label className="form-label">Default Output Folder</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input type="text" className="input-field" placeholder="C:\Users\Videos\ClipperSkuy" value={outputDir} onChange={(e) => setOutputDir(e.target.value)} />
                            <button className="btn btn-secondary btn-sm">📁 Browse</button>
                        </div>
                    </div>
                </motion.div>

                {/* Retention Progress Bar */}
                <motion.div className="settings-section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}>
                    <div className="settings-section-title"><Eye size={20} /> Retention Progress Bar</div>

                    <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                            <input type="checkbox" checked={progressBarEnabled} onChange={(e) => setProgressBarEnabled(e.target.checked)} />
                            <span className="form-label" style={{ margin: 0 }}>Enable Progress Bar on Exports</span>
                        </label>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                            Animated bar at the bottom of the video that changes color as the video progresses. Increases viewer retention.
                        </div>
                    </div>

                    {progressBarEnabled && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {/* Color Pickers */}
                            <div className="form-group">
                                <label className="form-label">Bar Colors (Start → Middle → End)</label>
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                        <input type="color" value={pbColorStart} onChange={(e) => setPbColorStart(e.target.value)}
                                            style={{ width: 40, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }} />
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Start</span>
                                    </div>
                                    <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>→</span>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                        <input type="color" value={pbColorMid} onChange={(e) => setPbColorMid(e.target.value)}
                                            style={{ width: 40, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }} />
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Middle</span>
                                    </div>
                                    <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>→</span>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                        <input type="color" value={pbColorEnd} onChange={(e) => setPbColorEnd(e.target.value)}
                                            style={{ width: 40, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }} />
                                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>End</span>
                                    </div>
                                </div>
                            </div>

                            {/* Height & Opacity */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Height: {pbHeight}px</label>
                                    <input type="range" min="2" max="16" value={pbHeight}
                                        onChange={(e) => setPbHeight(parseInt(e.target.value))}
                                        style={{ width: '100%' }} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Opacity: {Math.round(pbOpacity * 100)}%</label>
                                    <input type="range" min="30" max="100" value={Math.round(pbOpacity * 100)}
                                        onChange={(e) => setPbOpacity(parseInt(e.target.value) / 100)}
                                        style={{ width: '100%' }} />
                                </div>
                            </div>

                            {/* Position */}
                            <div className="form-group">
                                <label className="form-label">Position</label>
                                <div className="chip-group">
                                    {['bottom', 'top'].map(p => (
                                        <button key={p} className={`chip ${pbPosition === p ? 'active' : ''}`}
                                            onClick={() => setPbPosition(p)}>
                                            {p === 'bottom' ? '⬇️ Bottom' : '⬆️ Top'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Live Preview */}
                            <div className="form-group">
                                <label className="form-label">Preview</label>
                                <div style={{
                                    position: 'relative', width: '100%', height: 80,
                                    background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                                    overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)'
                                }}>
                                    {/* Simulated video content */}
                                    <div style={{
                                        width: '100%', height: '100%',
                                        background: 'linear-gradient(135deg, rgba(20,20,30,1), rgba(30,25,40,1))',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 11, color: 'rgba(255,255,255,0.2)'
                                    }}>
                                        Video Content
                                    </div>
                                    {/* Progress bar preview with animation */}
                                    <div style={{
                                        position: 'absolute',
                                        [pbPosition === 'top' ? 'top' : 'bottom']: 0,
                                        left: 0, width: '100%', height: pbHeight,
                                        background: 'rgba(0,0,0,0.3)'
                                    }}>
                                        <div style={{
                                            height: '100%',
                                            background: `linear-gradient(90deg, ${pbColorStart} 0%, ${pbColorMid} 50%, ${pbColorEnd} 100%)`,
                                            opacity: pbOpacity,
                                            animation: 'progressBarPreview 3s ease-in-out infinite'
                                        }} />
                                    </div>
                                </div>
                            </div>
                            <style>{`
                                @keyframes progressBarPreview {
                                    0% { width: 0%; }
                                    90% { width: 100%; }
                                    100% { width: 100%; }
                                }
                            `}</style>
                        </motion.div>
                    )}
                </motion.div>

                {/* Watermark & Branding */}
                <motion.div className="settings-section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                    <div className="settings-section-title"><Palette size={20} /> Watermark & Branding</div>

                    <div className="form-group">
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                            <input type="checkbox" checked={watermarkEnabled} onChange={(e) => setWatermarkEnabled(e.target.checked)} />
                            <span className="form-label" style={{ margin: 0 }}>Enable Watermark</span>
                        </label>
                    </div>

                    {watermarkEnabled && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                            {/* Watermark Type Toggle */}
                            <div className="form-group">
                                <label className="form-label">Type</label>
                                <div className="chip-group">
                                    {[
                                        { id: 'image', label: '🖼️ Image/Logo' },
                                        { id: 'text', label: '✏️ Text (Static)' },
                                        { id: 'text-moving', label: '🔄 Text (Moving)' },
                                    ].map(t => (
                                        <button key={t.id} className={`chip ${watermarkType === t.id ? 'active' : ''}`} onClick={() => setWatermarkType(t.id)}>
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Image watermark fields */}
                            {watermarkType === 'image' && (
                                <div className="form-group">
                                    <label className="form-label">Logo/Image Path</label>
                                    <input type="text" className="input-field" placeholder="C:\\path\\to\\logo.png" value={watermarkPath} onChange={(e) => setWatermarkPath(e.target.value)} />
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                        PNG with transparent background recommended. Supports PNG, JPG, SVG.
                                    </div>
                                </div>
                            )}

                            {/* Text watermark fields (static & moving share these) */}
                            {(watermarkType === 'text' || watermarkType === 'text-moving') && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Watermark Text</label>
                                        <input type="text" className="input-field" placeholder="@YourChannel" value={watermarkText} onChange={(e) => setWatermarkText(e.target.value)} />
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                            Your channel name, brand, or any custom text.
                                        </div>
                                    </div>
                                    <div className="form-group" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                        <div style={{ flex: 1, minWidth: 140 }}>
                                            <label className="form-label">Font Size: {watermarkFontSize}px</label>
                                            <input type="range" min="12" max="72" step="2" value={watermarkFontSize}
                                                onChange={(e) => setWatermarkFontSize(parseInt(e.target.value))}
                                                style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 140 }}>
                                            <label className="form-label">Font Color</label>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <input type="color" value={watermarkColor} onChange={(e) => setWatermarkColor(e.target.value)}
                                                    style={{ width: 36, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer', background: 'transparent' }} />
                                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{watermarkColor}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Motion settings (only for text-moving) */}
                                    {watermarkType === 'text-moving' && (
                                        <>
                                            <div className="form-group">
                                                <label className="form-label">Motion Style</label>
                                                <div className="chip-group">
                                                    {[
                                                        { id: 'corner-hop', label: '📐 Corner Hop', desc: 'Pindah pojok setiap beberapa detik' },
                                                        { id: 'scroll', label: '➡️ Scroll', desc: 'Geser horizontal terus-menerus' },
                                                        { id: 'bounce', label: '⚡ Bounce', desc: 'Mantul-mantul di layar' },
                                                    ].map(m => (
                                                        <button key={m.id} className={`chip ${watermarkMotion === m.id ? 'active' : ''}`}
                                                            onClick={() => setWatermarkMotion(m.id)}
                                                            title={m.desc}>
                                                            {m.label}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                                                    {watermarkMotion === 'corner-hop' && '⬡ Text berpindah ke 4 sudut layar secara bergantian (mirip DVD screensaver)'}
                                                    {watermarkMotion === 'scroll' && '→ Text bergeser dari kiri ke kanan secara terus-menerus'}
                                                    {watermarkMotion === 'bounce' && '◇ Text memantul-mantul di dalam layar secara diagonal'}
                                                </div>
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Speed: {watermarkSpeed}s per cycle</label>
                                                <input type="range" min="2" max="10" step="1" value={watermarkSpeed}
                                                    onChange={(e) => setWatermarkSpeed(parseInt(e.target.value))}
                                                    style={{ width: '100%', maxWidth: 300, accentColor: 'var(--accent-primary)' }} />
                                                <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 300, fontSize: 11, color: 'var(--text-muted)' }}>
                                                    <span>Cepat</span><span>Lambat</span>
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {/* Text Preview */}
                                    {watermarkText && (
                                        <div style={{
                                            padding: '16px 20px', borderRadius: 10,
                                            background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)',
                                            textAlign: 'center', marginBottom: 16, position: 'relative', overflow: 'hidden', minHeight: 60
                                        }}>
                                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Preview</div>
                                            <span style={{
                                                fontSize: `${Math.min(watermarkFontSize, 40)}px`,
                                                color: watermarkColor,
                                                opacity: watermarkOpacity,
                                                fontWeight: 600,
                                                display: 'inline-block',
                                                animation: watermarkType === 'text-moving'
                                                    ? (watermarkMotion === 'scroll' ? `wmScroll ${watermarkSpeed}s linear infinite`
                                                        : watermarkMotion === 'bounce' ? `wmBounce ${watermarkSpeed}s ease-in-out infinite`
                                                            : `wmCornerHop ${watermarkSpeed * 4}s steps(1) infinite`)
                                                    : 'none'
                                            }}>{watermarkText}</span>
                                            <style>{`
                                                @keyframes wmScroll { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }
                                                @keyframes wmBounce { 0%,100% { transform: translate(-30px,-5px); } 25% { transform: translate(30px,5px); } 50% { transform: translate(30px,-5px); } 75% { transform: translate(-30px,5px); } }
                                                @keyframes wmCornerHop { 0% { transform: translate(40px,0); } 25% { transform: translate(-40px,10px); } 50% { transform: translate(-40px,0); } 75% { transform: translate(40px,10px); } }
                                            `}</style>
                                        </div>
                                    )}
                                </>
                            )}

                            <div className="form-group">
                                <label className="form-label">Position</label>
                                <div className="chip-group">
                                    {[
                                        { id: 'top-left', label: '↖ Top Left' },
                                        { id: 'top-right', label: '↗ Top Right' },
                                        { id: 'bottom-left', label: '↙ Bottom Left' },
                                        { id: 'bottom-right', label: '↘ Bottom Right' },
                                        { id: 'center', label: '⊕ Center' },
                                    ].map(p => (
                                        <button key={p.id} className={`chip ${watermarkPosition === p.id ? 'active' : ''}`} onClick={() => setWatermarkPosition(p.id)}>
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 180 }}>
                                    <label className="form-label">Opacity: {Math.round(watermarkOpacity * 100)}%</label>
                                    <input type="range" min="0.1" max="1" step="0.05" value={watermarkOpacity}
                                        onChange={(e) => setWatermarkOpacity(parseFloat(e.target.value))}
                                        style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                                </div>
                                {watermarkType === 'image' && (
                                    <div style={{ flex: 1, minWidth: 180 }}>
                                        <label className="form-label">Size: {watermarkSize}% of video width</label>
                                        <input type="range" min="5" max="40" step="1" value={watermarkSize}
                                            onChange={(e) => setWatermarkSize(parseInt(e.target.value))}
                                            style={{ width: '100%', accentColor: 'var(--accent-primary)' }} />
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </motion.div>

                {/* Brand Kit */}
                <motion.div className="settings-section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.47 }}>
                    <div className="settings-section-title"><Droplets size={20} /> Brand Kit</div>

                    {/* Brand Colors */}
                    <div className="form-group">
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Palette size={16} /> Brand Colors
                        </label>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                            Warna brand channel kamu — otomatis dipakai untuk caption highlight, progress bar, dan intro/outro
                        </div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            {[
                                { label: 'Primary', value: brandPrimary, set: setBrandPrimary },
                                { label: 'Secondary', value: brandSecondary, set: setBrandSecondary },
                                { label: 'Accent', value: brandAccent, set: setBrandAccent }
                            ].map(c => (
                                <div key={c.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="color"
                                            value={c.value}
                                            onChange={(e) => c.set(e.target.value)}
                                            style={{
                                                width: 56, height: 56, border: 'none', borderRadius: 12,
                                                cursor: 'pointer', padding: 0, background: 'none'
                                            }}
                                        />
                                        <div style={{
                                            position: 'absolute', inset: 0, borderRadius: 12, pointerEvents: 'none',
                                            border: '2px solid rgba(255,255,255,0.1)', boxShadow: `0 0 12px ${c.value}33`
                                        }} />
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 600 }}>{c.label}</span>
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{c.value}</span>
                                </div>
                            ))}
                        </div>
                        {/* Preview strip */}
                        <div style={{ marginTop: 12, display: 'flex', borderRadius: 8, overflow: 'hidden', height: 32 }}>
                            <div style={{ flex: 3, background: brandPrimary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>Primary</div>
                            <div style={{ flex: 2, background: brandSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>Secondary</div>
                            <div style={{ flex: 2, background: brandAccent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>Accent</div>
                        </div>
                    </div>

                    {/* Social Handles */}
                    <div className="form-group" style={{ marginTop: 24 }}>
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AtSign size={16} /> Social Media Handles
                        </label>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
                            Username channel kamu — bisa tampil di outro dan caption
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { icon: '📱', label: 'TikTok', placeholder: '@yourchannel', value: socialTiktok, set: setSocialTiktok },
                                { icon: '📸', label: 'Instagram', placeholder: '@yourchannel', value: socialInstagram, set: setSocialInstagram },
                                { icon: '▶️', label: 'YouTube', placeholder: '@YourChannel', value: socialYoutube, set: setSocialYoutube },
                                { icon: '🐦', label: 'X / Twitter', placeholder: '@yourchannel', value: socialTwitter, set: setSocialTwitter }
                            ].map(s => (
                                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span style={{ fontSize: 18, width: 28, textAlign: 'center' }}>{s.icon}</span>
                                    <span style={{ fontSize: 12, fontWeight: 600, width: 80, color: 'var(--text-secondary)' }}>{s.label}</span>
                                    <input
                                        className="input-field"
                                        placeholder={s.placeholder}
                                        value={s.value}
                                        onChange={(e) => s.set(e.target.value)}
                                        style={{ flex: 1, fontSize: 13 }}
                                    />
                                </div>
                            ))}
                        </div>
                        {(socialTiktok || socialInstagram || socialYoutube || socialTwitter) && (
                            <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                style={{
                                    marginTop: 12, padding: '10px 14px', borderRadius: 10,
                                    background: `linear-gradient(135deg, ${brandPrimary}15, ${brandAccent}10)`,
                                    border: `1px solid ${brandPrimary}25`
                                }}
                            >
                                <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)' }}>Preview Outro Card</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {socialTiktok && <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 16, background: `${brandPrimary}20`, color: brandPrimary, fontWeight: 600 }}>📱 {socialTiktok}</span>}
                                    {socialInstagram && <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 16, background: `${brandPrimary}20`, color: brandPrimary, fontWeight: 600 }}>📸 {socialInstagram}</span>}
                                    {socialYoutube && <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 16, background: `${brandPrimary}20`, color: brandPrimary, fontWeight: 600 }}>▶️ {socialYoutube}</span>}
                                    {socialTwitter && <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 16, background: `${brandPrimary}20`, color: brandPrimary, fontWeight: 600 }}>🐦 {socialTwitter}</span>}
                                </div>
                            </motion.div>
                        )}
                    </div>
                </motion.div>

                {/* Appearance */}
                <motion.div className="settings-section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}>
                    <div className="settings-section-title"><Paintbrush size={20} /> Appearance</div>

                    {/* Hidden file input (keep for admin-level usage) */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        accept=".png,.jpg,.jpeg,.ico,.svg,.webp"
                        onChange={onFileSelected}
                    />

                    {/* Theme */}
                    <div className="form-group">
                        <label className="form-label">Theme</label>
                        <div className="chip-group">
                            {[
                                { id: 'dark', label: 'Dark', icon: Moon },
                                { id: 'light', label: 'Light', icon: Sun },
                                { id: 'auto', label: 'System', icon: Monitor }
                            ].map(t => {
                                const Icon = t.icon;
                                return (
                                    <button
                                        key={t.id}
                                        className={`chip ${appTheme === t.id ? 'active' : ''}`}
                                        onClick={() => { setAppTheme(t.id); setTheme(t.id); }}
                                    >
                                        <Icon size={14} /> {t.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        💡 App branding, accent color, and display name can be configured in <strong>Admin Panel</strong>.
                    </div>
                </motion.div>

                {/* Data Management */}
                <motion.div className="settings-section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                    <div className="settings-section-title"><Database size={20} /> Data Management</div>

                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <button
                            className="btn btn-secondary"
                            onClick={async () => {
                                if (confirm('Clear all cached thumbnails and temp files?')) {
                                    await fetch(`${API}/projects/clear-cache`, { method: 'POST' }).catch(() => { });
                                    alert('Cache cleared!');
                                }
                            }}
                        >
                            <Trash2 size={16} /> Clear Cache
                        </button>
                        <button
                            className="btn btn-secondary"
                            style={{ color: '#ef4444' }}
                            onClick={async () => {
                                if (confirm('⚠️ This will reset ALL settings to default. Are you sure?')) {
                                    await fetch(`${API}/settings/reset`, { method: 'POST' }).catch(() => { });
                                    window.location.reload();
                                }
                            }}
                        >
                            <AlertTriangle size={16} /> Reset All Settings
                        </button>
                    </div>
                </motion.div>

                {/* Save */}
                <motion.div style={{ marginTop: 8, marginBottom: 48 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}>
                    <button className="btn btn-primary" onClick={handleSave}>
                        <Save size={18} />
                        {saved ? '✅ Saved!' : 'Save Settings'}
                    </button>
                </motion.div>
            </div>
        </>
    );
}
