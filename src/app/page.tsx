'use client';

import React, { useState, useEffect, useRef } from 'react';

interface Scene {
  sceneNumber: number;
  durationSeconds: number;
  visualPrompt: string;
  voiceoverText: string;
}

interface VideoScript {
  title: string;
  targetAudience: string;
  tone: string;
  hook: string;
  scenes: Scene[];
  cta: string;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  preview_url: string;
}

export default function Home() {
  // Hydration guard: suppress client-only content until after first paint
  const [mounted, setMounted] = useState(false);

  // Tab control state
  const [activeTab, setActiveTab] = useState<'direct' | 'competitor'>('direct');

  // Settings / API credentials state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState('');
  const [bananaApiKey, setBananaApiKey] = useState('');
  const [bananaApiUrl, setBananaApiUrl] = useState('https://api.banana-pro.ai/v1/images/generate');
  const [useFlowExtension, setUseFlowExtension] = useState(false);
  const [extensionConnected, setExtensionConnected] = useState(false);
  const [extensionStats, setExtensionStats] = useState<any>(null);

  // Input fields state
  const [productName, setProductName] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [competitorUrl, setCompetitorUrl] = useState('');
  const [competitorFile, setCompetitorFile] = useState<File | null>(null);
  
  // Settings state — always init with stable defaults to avoid hydration mismatch
  const [useElevenLabs, setUseElevenLabs] = useState(true);
  const [localVoice, setLocalVoice] = useState('macos-linh');
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('macos-linh');
  const [visualMode, setVisualMode] = useState<'images' | 'video'>('video');
  const [videoModel, setVideoModel] = useState<'veo-3' | 'omni'>('veo-3');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  
  // App workflow state
  const [script, setScript] = useState<VideoScript | null>(null);
  const [competitorTranscript, setCompetitorTranscript] = useState<string | null>(null);
  const [competitorHookType, setCompetitorHookType] = useState<string | null>(null);
  const [competitorFlow, setCompetitorFlow] = useState<string | null>(null);
  
  // Loading & Progress state
  const [pipelineState, setPipelineState] = useState<'idle' | 'scraping' | 'analyzing' | 'script-ready' | 'media-generating' | 'compiling' | 'completed' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [compiledVideoUrl, setCompiledVideoUrl] = useState<string | null>(null);
  const [flowProjectId, setFlowProjectId] = useState<string | null>(null);
  const [flowProjectTitle, setFlowProjectTitle] = useState<string | null>(null);
  const [progressStatusText, setProgressStatusText] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch available voices from ElevenLabs API
  const fetchVoices = async (elevenlabsKey?: string) => {
    try {
      const headers: Record<string, string> = {};
      if (elevenlabsKey) {
        headers['x-elevenlabs-key'] = elevenlabsKey;
      }
      const res = await fetch('/api/voices', { headers });
      const data = await res.json();
      if (data.voices && data.voices.length > 0) {
        setVoices(data.voices);
        // Do not overwrite selected voice if already chosen
        setSelectedVoice((prev) => {
          const exists = data.voices.some((v: ElevenLabsVoice) => v.voice_id === prev);
          return exists ? prev : data.voices[0].voice_id;
        });
      }
    } catch (err) {
      console.error('Failed to load voices:', err);
    }
  };

  // Sync localStorage → state after mount (client-only, avoids hydration mismatch)
  useEffect(() => {
    setMounted(true);
    const eKey = localStorage.getItem('elevenlabs_api_key') || '';
    const gKey = localStorage.getItem('gemini_api_key') || '';
    const bKey = localStorage.getItem('banana_api_key') || '';
    const bUrl = localStorage.getItem('banana_api_url') || 'https://api.banana-pro.ai/v1/images/generate';
    const flowExt = localStorage.getItem('use_flow_extension') === 'true';
    const useEl = localStorage.getItem('use_elevenlabs') !== 'false';
    const lVoice = localStorage.getItem('local_voice') || 'macos-linh';
    const subs = localStorage.getItem('subtitles_enabled') !== 'false';

    setGeminiApiKey(gKey);
    setElevenLabsApiKey(eKey);
    setBananaApiKey(bKey);
    setBananaApiUrl(bUrl);
    setUseFlowExtension(flowExt);
    setUseElevenLabs(useEl);
    setLocalVoice(lVoice);
    setSubtitlesEnabled(subs);

    fetchVoices(eKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll local Flow extension bridge health
  useEffect(() => {
    const checkExtension = async () => {
      try {
        const res = await fetch('/api/flow/status');
        if (res.ok) {
          const data = await res.json();
          setExtensionConnected(data.connected);
          setExtensionStats(data);
        } else {
          setExtensionConnected(false);
          setExtensionStats(null);
        }
      } catch (err) {
        setExtensionConnected(false);
        setExtensionStats(null);
      }
    };
    checkExtension();
    const interval = setInterval(checkExtension, 2500);
    return () => clearInterval(interval);
  }, []);

  // Save settings handler
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('gemini_api_key', geminiApiKey);
    localStorage.setItem('elevenlabs_api_key', elevenLabsApiKey);
    localStorage.setItem('banana_api_key', bananaApiKey);
    localStorage.setItem('banana_api_url', bananaApiUrl);
    setIsSettingsOpen(false);
    
    // Refresh voices with the newly entered key
    fetchVoices(elevenLabsApiKey);
  };

  // Handle competitor video upload drag/drop/select
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setCompetitorFile(e.target.files[0]);
      setCompetitorUrl(''); // clear url if file is uploaded
    }
  };

  // Run Step 1: Scrape & generate script
  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productUrl) return;

    if (activeTab === 'competitor' && !competitorFile && !competitorUrl) {
      setErrorMsg('Vui lòng chọn 1 file video đối thủ tải lên hoặc dán đường dẫn link video đối thủ.');
      return;
    }

    setErrorMsg(null);
    setScript(null);
    setCompiledVideoUrl(null);
    setPipelineState('scraping');
    setProgressStatusText('Đang truy cập và cào dữ liệu từ trang sản phẩm...');

    try {
      const formData = new FormData();
      formData.append('productName', productName);
      formData.append('productUrl', productUrl);
      
      if (activeTab === 'competitor') {
        if (competitorFile) {
          formData.append('competitorFile', competitorFile);
          setProgressStatusText('Đang tải lên video đối thủ và cào dữ liệu âm thanh...');
        } else if (competitorUrl) {
          formData.append('competitorUrl', competitorUrl);
          setProgressStatusText('Đang tải và trích xuất âm thanh từ link đối thủ (yt-dlp)...');
        }
      }

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'x-gemini-key': geminiApiKey
        },
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Quá trình phân tích sản phẩm thất bại.');
      }

      const data = await res.json();
      const targetScript = data.mode === 'adapted' ? data.analysis.adaptedScript : data.script;

      if (data.mode === 'adapted') {
        setScript(targetScript);
        setCompetitorTranscript(data.analysis.transcript);
        setCompetitorHookType(data.analysis.hookType);
        setCompetitorFlow(data.analysis.flowStructure);
      } else {
        setScript(targetScript);
        setCompetitorTranscript(null);
        setCompetitorHookType(null);
        setCompetitorFlow(null);
      }

      setPipelineState('script-ready');
      setProgressStatusText('Đã tạo kịch bản thành công! Bắt đầu tạo video...');
      await startAutoCompile(targetScript);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Có lỗi xảy ra trong quá trình xử lý.');
      setPipelineState('error');
    }
  };

  // Scene editor update handler
  const handleSceneChange = (index: number, field: keyof Scene, value: string | number) => {
    if (!script) return;
    const updatedScenes = [...script.scenes];
    updatedScenes[index] = {
      ...updatedScenes[index],
      [field]: value
    };
    setScript({
      ...script,
      scenes: updatedScenes
    });
  };

  // Run continuous automation to compile assets and video
  const startAutoCompile = async (scriptToCompile: VideoScript) => {
    if (!scriptToCompile) return;

    setErrorMsg(null);
    setFlowProjectId(null);
    setFlowProjectTitle(null);
    setPipelineState('media-generating');
    setProgressStatusText('Đang khởi động tiến trình tạo giọng nói và hình ảnh/video...');

    try {
      const res = await fetch('/api/compile', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-gemini-key': geminiApiKey,
          'x-elevenlabs-key': elevenLabsApiKey,
          'x-banana-key': bananaApiKey,
          'x-banana-url': bananaApiUrl,
          'x-use-flow-extension': useFlowExtension ? 'true' : 'false'
        },
        body: JSON.stringify({
          script: scriptToCompile,
          productName,
          voiceId: useElevenLabs ? selectedVoice : localVoice,
          visualMode,
          videoModel,
          useElevenLabs,
          subtitlesEnabled
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Biên tập video thất bại.');
      }

      setPipelineState('compiling');
      setProgressStatusText('Đang tiến hành ghép các cảnh âm thanh, hình ảnh và tạo phụ đề (FFmpeg)...');

      const data = await res.json();
      
      if (data.success && data.videoUrl) {
        setCompiledVideoUrl(data.videoUrl);
        if (data.projectId) {
          setFlowProjectId(data.projectId);
        }
        if (data.projectTitle) {
          setFlowProjectTitle(data.projectTitle);
        }
        setPipelineState('completed');
        setProgressStatusText('Sản xuất video thành công! Bạn có thể xem hoặc tải về máy.');
      } else {
        throw new Error('Không nhận được đường dẫn video kết xuất.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Biên tập video thất bại.');
      setPipelineState('error');
    }
  };

  // Run Step 2: Compile assets and video manually
  const handleCompile = async () => {
    if (!script) return;
    await startAutoCompile(script);
  };

  // Reset pipeline
  const handleReset = () => {
    setPipelineState('idle');
    setScript(null);
    setCompetitorTranscript(null);
    setCompiledVideoUrl(null);
    setCompetitorFile(null);
    setFlowProjectId(null);
    setFlowProjectTitle(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <main className="app-container">
      <header className="header">
        <h1>AutoVideo.AI</h1>
        <p>Hệ thống tự động hóa sản xuất Video từ kịch bản và sản phẩm trên macOS M1</p>
      </header>

      <div className="grid-container">
        {/* Left Side: Configuration or Pipeline Status */}
        <section>
          {pipelineState === 'idle' || pipelineState === 'error' ? (
            <div className="card">
              <div className="tabs-container">
                <button
                  id="tab-direct"
                  type="button"
                  className={`tab-btn ${activeTab === 'direct' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('direct');
                    setErrorMsg(null);
                  }}
                >
                  🚀 Tự Động Từ Link/Tên
                </button>
                <button
                  id="tab-competitor"
                  type="button"
                  className={`tab-btn ${activeTab === 'competitor' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('competitor');
                    setErrorMsg(null);
                  }}
                >
                  📊 Phân Tích Video Đối Thủ
                </button>
              </div>

              <form onSubmit={handleAnalyze}>
                <div className="form-group">
                  <label htmlFor="input-product-name">
                    {activeTab === 'competitor' ? 'Tên sản phẩm của bạn (để viết lại kịch bản)' : 'Tên sản phẩm'}
                  </label>
                  <input
                    id="input-product-name"
                    type="text"
                    className="form-input"
                    placeholder="Ví dụ: Nồi chiên không dầu Philips, Macbook Pro..."
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="input-product-url">
                    {activeTab === 'competitor' ? 'Link sản phẩm của bạn (để lấy thông tin)' : 'Link sản phẩm (Cào dữ liệu)'}
                  </label>
                  <input
                    id="input-product-url"
                    type="url"
                    className="form-input"
                    placeholder="Dán link Shopee, Amazon hoặc landing page của sản phẩm"
                    value={productUrl}
                    onChange={(e) => setProductUrl(e.target.value)}
                    required
                  />
                </div>

                {activeTab === 'competitor' && (
                  <div className="form-group" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--card-border)', paddingTop: '1.5rem' }}>
                    <label>Video của đối thủ cần bóc băng và phân tích</label>
                    <input
                      id="input-competitor-url"
                      type="url"
                      className="form-input"
                      placeholder="Dán link video đối thủ (TikTok / YouTube)"
                      value={competitorUrl}
                      onChange={(e) => {
                        setCompetitorUrl(e.target.value);
                        setCompetitorFile(null);
                      }}
                    />
                    
                    <div style={{ margin: '0.75rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>hoặc</div>

                    <div 
                      id="dropzone-competitor-file"
                      className="file-upload"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                      />
                      {competitorFile ? (
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                          ✓ {competitorFile.name} ({(competitorFile.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      ) : (
                        <>
                          <span style={{ fontSize: '1.5rem' }}>📁</span>
                          <p>Kéo thả hoặc nhấp để tải lên tệp video đối thủ (.mp4, .mov)</p>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Pipeline Settings */}
                <h3 style={{ margin: '2rem 0 1rem', fontSize: '1.1rem', borderBottom: '1px solid var(--card-border)', paddingBottom: '0.5rem' }}>
                  ⚙️ Cấu Hình Đầu Ra
                </h3>

                <div className="form-group" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--card-border)', margin: '1rem 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <label style={{ margin: 0, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                      🎙️ Sử dụng giọng đọc AI ElevenLabs
                    </label>
                    <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '22px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={useElevenLabs} 
                        onChange={(e) => {
                          const val = e.target.checked;
                          setUseElevenLabs(val);
                          localStorage.setItem('use_elevenlabs', String(val));
                        }}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span suppressHydrationWarning style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: useElevenLabs ? 'var(--primary)' : '#444',
                        borderRadius: '22px', transition: '0.3s'
                      }}>
                        <span suppressHydrationWarning style={{
                          position: 'absolute', height: '16px', width: '16px', left: useElevenLabs ? '22px' : '4px', bottom: '3px',
                          backgroundColor: 'white', borderRadius: '50%', transition: '0.3s'
                        }}/>
                      </span>
                    </label>
                  </div>

                  {!mounted ? (
                    // Render stable placeholder before hydration to avoid mismatch
                    <div className="form-group" style={{ margin: 0 }}>
                      <label htmlFor="select-voice" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Chọn giọng đọc</label>
                      <select id="select-voice" className="form-input" defaultValue="" disabled><option value="">Đang tải...</option></select>
                    </div>
                  ) : useElevenLabs ? (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label htmlFor="select-voice" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Chọn giọng đọc ElevenLabs</label>
                      <select
                        id="select-voice"
                        className="form-input"
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                      >
                        {voices.filter(v => v.category !== 'local').map((v) => (
                          <option key={v.voice_id} value={v.voice_id}>
                            {v.name} ({v.category})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="form-group" style={{ margin: 0 }}>
                      <label htmlFor="select-local-voice" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Chọn giọng máy macOS nội bộ (Miễn phí)</label>
                      <select
                        id="select-local-voice"
                        className="form-input"
                        value={localVoice}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLocalVoice(val);
                          localStorage.setItem('local_voice', val);
                        }}
                      >
                        <option value="macos-linh">Linh (Giọng máy macOS Tiếng Việt Nữ)</option>
                        <option value="macos-lan">Lan (Giọng máy macOS Tiếng Việt Nữ)</option>
                      </select>
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--card-border)', margin: '1.5rem 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ margin: 0, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                      🌐 Sử dụng Google Flow Extension
                    </label>
                    <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '22px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={useFlowExtension} 
                        onChange={(e) => {
                          const val = e.target.checked;
                          setUseFlowExtension(val);
                          localStorage.setItem('use_flow_extension', String(val));
                        }}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span suppressHydrationWarning style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: useFlowExtension ? 'var(--primary)' : '#444',
                        borderRadius: '22px', transition: '0.3s'
                      }}>
                        <span suppressHydrationWarning style={{
                          position: 'absolute', height: '16px', width: '16px', left: useFlowExtension ? '22px' : '4px', bottom: '3px',
                          backgroundColor: 'white', borderRadius: '50%', transition: '0.3s'
                        }}/>
                      </span>
                    </label>
                  </div>
                  
                  <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Trạng thái:</span>
                      {extensionConnected ? (
                        <span style={{ color: '#22c55e', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          ● Đã kết nối {extensionStats?.userInfo?.email ? `(${extensionStats.userInfo.email})` : ''}
                        </span>
                      ) : (
                        <span style={{ color: '#ef4444', fontWeight: 'bold' }}>
                          ○ Chưa kết nối
                        </span>
                      )}
                    </div>
                    
                    {!extensionConnected && useFlowExtension && (
                      <div style={{ marginTop: '0.75rem', background: 'rgba(239, 68, 68, 0.05)', padding: '0.75rem', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.15)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        <p style={{ fontWeight: 'bold', color: 'var(--danger)', marginBottom: '0.25rem' }}>Hướng dẫn cài đặt Extension:</p>
                        <ol style={{ marginLeft: '1.25rem', paddingLeft: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <li>Mở <code>chrome://extensions/</code> trên Chrome.</li>
                          <li>Bật <b>Developer mode</b> ở góc trên bên phải.</li>
                          <li>Chọn <b>Load unpacked</b> và tìm đến thư mục <code>public/extension</code> trong thư mục dự án này.</li>
                          <li>Mở tab <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>labs.google/fx/tools/flow</a> và đăng nhập tài khoản Google.</li>
                        </ol>
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-group" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--card-border)', margin: '1.5rem 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ margin: 0, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                      💬 Chèn phụ đề lên video
                    </label>
                    <label style={{ position: 'relative', display: 'inline-block', width: '42px', height: '22px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={subtitlesEnabled} 
                        onChange={(e) => {
                          const val = e.target.checked;
                          setSubtitlesEnabled(val);
                          localStorage.setItem('subtitles_enabled', String(val));
                        }}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span suppressHydrationWarning style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: subtitlesEnabled ? 'var(--primary)' : '#444',
                        borderRadius: '22px', transition: '0.3s'
                      }}>
                        <span suppressHydrationWarning style={{
                          position: 'absolute', height: '16px', width: '16px', left: subtitlesEnabled ? '22px' : '4px', bottom: '3px',
                          backgroundColor: 'white', borderRadius: '50%', transition: '0.3s'
                        }}/>
                      </span>
                    </label>
                  </div>
                  
                  <div style={{ marginTop: '0.5rem', fontSize: '0.8rem' }} suppressHydrationWarning>
                    {subtitlesEnabled ? (
                      <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>
                        ● Có phụ đề (Chữ trắng, nền đen mờ)
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-secondary)' }}>
                        ○ Không phụ đề
                      </span>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>Mô hình tạo Video</label>
                  <div className="radio-group">
                    <div 
                      id="opt-video-veo"
                      className={`radio-card ${videoModel === 'veo-3' ? 'active' : ''}`}
                      onClick={() => setVideoModel('veo-3')}
                    >
                      <span>🎬</span>
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.9rem' }}>Veo 3.1</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Độ chi tiết điện ảnh</span>
                      </div>
                    </div>
                    
                    <div 
                      id="opt-video-omni"
                      className={`radio-card ${videoModel === 'omni' ? 'active' : ''}`}
                      onClick={() => setVideoModel('omni')}
                    >
                      <span>⚡</span>
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.9rem' }}>Gemini Omni</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Chuyển động nhanh</span>
                      </div>
                    </div>
                  </div>
                </div>

                {errorMsg && (
                  <div style={{ color: 'var(--danger)', fontSize: '0.9rem', margin: '1rem 0', fontWeight: 'bold' }}>
                    ⚠ Lỗi: {errorMsg}
                  </div>
                )}

                <button 
                  id="btn-submit-analyze"
                  type="submit" 
                  className="btn btn-primary"
                  style={{ marginTop: '1.5rem' }}
                >
                  <span>⚡ Bắt Đầu Sản Xuất Video</span>
                </button>
              </form>
            </div>
          ) : (
            // Running/Status Screen
            <div className="card">
              <h2 className="card-title">⚙️ Tiến Trình Sản Xuất</h2>
              
              <div style={{ margin: '1.5rem 0', padding: '1rem', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '8px', borderLeft: '3px solid var(--primary)' }}>
                <p style={{ fontSize: '0.95rem', fontWeight: 600 }}>{progressStatusText}</p>
              </div>

              <div className="progress-list">
                <div className={`progress-item ${pipelineState === 'scraping' ? 'active' : ''}`}>
                  <div className={`progress-icon ${pipelineState === 'scraping' ? 'loading' : 'done'}`}>
                    {pipelineState === 'scraping' ? '🔄' : '1'}
                  </div>
                  <div className="progress-text">
                    <h4>Cào dữ liệu trang web sản phẩm</h4>
                    <p>Playwright crawler phân tích chi tiết sản phẩm.</p>
                  </div>
                </div>

                {(competitorFile || competitorUrl) && (
                  <div className={`progress-item ${pipelineState === 'analyzing' && competitorTranscript === null ? 'active' : ''}`}>
                    <div className={`progress-icon ${pipelineState === 'analyzing' && competitorTranscript === null ? 'loading' : (competitorTranscript ? 'done' : 'todo')}`}>
                      {pipelineState === 'analyzing' && competitorTranscript === null ? '🔄' : '2'}
                    </div>
                    <div className="progress-text">
                      <h4>Trích xuất & dịch kịch bản đối thủ</h4>
                      <p>Tải video, tách nhạc nền và bóc băng lời thoại bằng Gemini 3.1 Flash Lite.</p>
                    </div>
                  </div>
                )}

                <div className={`progress-item ${pipelineState === 'analyzing' ? 'active' : ''}`}>
                  <div className={`progress-icon ${pipelineState === 'analyzing' ? 'loading' : (pipelineState === 'scraping' ? 'todo' : 'done')}`}>
                    {pipelineState === 'analyzing' ? '🔄' : '3'}
                  </div>
                  <div className="progress-text">
                    <h4>AI Biên soạn kịch bản</h4>
                    <p>Gemini 3.1 Flash Lite xây dựng cấu trúc lời thoại tiếng Việt và gợi ý prompt vẽ ảnh.</p>
                  </div>
                </div>

                <div className={`progress-item ${pipelineState === 'media-generating' ? 'active' : ''}`}>
                  <div className={`progress-icon ${pipelineState === 'media-generating' ? 'loading' : (['compiling', 'completed'].includes(pipelineState) ? 'done' : 'todo')}`}>
                    {pipelineState === 'media-generating' ? '🔄' : '4'}
                  </div>
                  <div className="progress-text">
                    <h4>Tạo giọng đọc & hình ảnh/video</h4>
                    <p>ElevenLabs lồng tiếng, tạo đồ hoạ với Banana Pro hoặc clip Veo 3/Omni.</p>
                  </div>
                </div>

                <div className={`progress-item ${pipelineState === 'compiling' ? 'active' : ''}`}>
                  <div className={`progress-icon ${pipelineState === 'compiling' ? 'loading' : (pipelineState === 'completed' ? 'done' : 'todo')}`}>
                    {pipelineState === 'compiling' ? '🔄' : '5'}
                  </div>
                  <div className="progress-text">
                    <h4>Biên tập & Kết xuất video</h4>
                    <p>FFmpeg xử lý kỹ thuật ghép âm thanh, chuyển cảnh và chèn phụ đề.</p>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div style={{ color: 'var(--danger)', fontSize: '0.9rem', marginTop: '1.5rem', fontWeight: 'bold' }}>
                  ⚠ Lỗi: {errorMsg}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Side: Script Editor & Player Preview */}
        <section>
          {/* Competitor Analysis Report */}
          {competitorTranscript && (
            <div className="card" style={{ marginBottom: '2rem' }}>
              <h2 className="card-title">📊 Kết Quả Bóc Băng Đối Thủ</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.9rem' }}>
                <div>
                  <strong style={{ color: 'var(--primary)' }}>Cấu trúc dòng chảy đối thủ:</strong>
                  <p style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--card-border)', marginTop: '0.25rem' }}>
                    {competitorFlow}
                  </p>
                </div>
                <div>
                  <strong style={{ color: 'var(--warning)' }}>Kiểu Hook của đối thủ:</strong>
                  <p style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--card-border)', marginTop: '0.25rem' }}>
                    {competitorHookType}
                  </p>
                </div>
                <div>
                  <strong style={{ color: 'var(--text-secondary)' }}>Nội dung nguyên bản thoại:</strong>
                  <p style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--card-border)', marginTop: '0.25rem', maxHeight: '150px', overflowY: 'auto' }}>
                    {competitorTranscript}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Script Editor Form */}
          {script && (
            <div className="card">
              <h2 className="card-title">📝 Kịch Bản Được Đề Xuất</h2>
              
              <div className="script-editor-container">
                <div className="form-group">
                  <label htmlFor="script-input-title">Tiêu đề chiến dịch</label>
                  <input
                    id="script-input-title"
                    type="text"
                    className="form-input"
                    value={script.title}
                    onChange={(e) => setScript({ ...script, title: e.target.value })}
                    disabled={['scraping', 'analyzing', 'media-generating', 'compiling'].includes(pipelineState)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="script-input-hook">Câu Hook mở đầu (3 giây đầu)</label>
                  <textarea
                    id="script-input-hook"
                    className="form-input"
                    rows={2}
                    value={script.hook}
                    onChange={(e) => setScript({ ...script, hook: e.target.value })}
                    disabled={['scraping', 'analyzing', 'media-generating', 'compiling'].includes(pipelineState)}
                  />
                </div>

                {script.scenes.map((scene, idx) => (
                  <div key={idx} className="scene-block">
                    <div className="scene-header">
                      <span>CẢNH {scene.sceneNumber || (idx + 1)}</span>
                      <span>{scene.durationSeconds} giây</span>
                    </div>

                    <div className="form-group">
                      <label htmlFor={`scene-${idx}-prompt`}>Prompt thiết kế hình ảnh (Banana Pro/Veo)</label>
                      <textarea
                        id={`scene-${idx}-prompt`}
                        className="form-input"
                        style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}
                        rows={2}
                        value={scene.visualPrompt}
                        onChange={(e) => handleSceneChange(idx, 'visualPrompt', e.target.value)}
                        disabled={['scraping', 'analyzing', 'media-generating', 'compiling'].includes(pipelineState)}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor={`scene-${idx}-voice`}>Lời thoại lồng tiếng (Tiếng Việt)</label>
                      <textarea
                        id={`scene-${idx}-voice`}
                        className="form-input"
                        rows={2}
                        value={scene.voiceoverText}
                        onChange={(e) => handleSceneChange(idx, 'voiceoverText', e.target.value)}
                        disabled={['scraping', 'analyzing', 'media-generating', 'compiling'].includes(pipelineState)}
                      />
                    </div>
                  </div>
                ))}

                <div className="form-group">
                  <label htmlFor="script-input-cta">Lời kêu gọi CTA (Kết thúc)</label>
                  <input
                    id="script-input-cta"
                    type="text"
                    className="form-input"
                    value={script.cta}
                    onChange={(e) => setScript({ ...script, cta: e.target.value })}
                    disabled={['scraping', 'analyzing', 'media-generating', 'compiling'].includes(pipelineState)}
                  />
                </div>

                {!['scraping', 'analyzing', 'media-generating', 'compiling'].includes(pipelineState) && (
                  <button 
                    id="btn-trigger-compile"
                    className="btn btn-primary"
                    onClick={handleCompile}
                  >
                    <span>🎬 Khởi Chạy Render Video</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Render Completed Screen */}
          {pipelineState === 'completed' && compiledVideoUrl && (
            <div className="card">
              <div className="success-banner">
                <h3 style={{ color: 'var(--accent)', fontWeight: 800 }}>✓ ĐÃ HOÀN THÀNH VIDEO</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Video được xử lý và lưu hoàn chỉnh.</p>
              </div>

              {flowProjectId && (
                <div style={{
                  marginBottom: '1.25rem',
                  padding: '1rem',
                  borderRadius: '12px',
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.15)',
                  fontSize: '0.9rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  backdropFilter: 'blur(10px)',
                  textAlign: 'left'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#22c55e', fontWeight: 600 }}>
                    <span style={{ fontSize: '1.1rem' }}>✦</span>
                    <span>Đã tự động tạo dự án riêng trên Google Flow</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', paddingLeft: '1.6rem' }}>
                    Tên dự án: <strong style={{ color: '#fff' }}>{flowProjectTitle}</strong>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', paddingLeft: '1.6rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', marginTop: '0.2rem' }}>
                    <span>ID:</span> <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem', color: '#ccc', wordBreak: 'break-all' }}>{flowProjectId}</code>
                    <a
                      href="https://labs.google/fx/tools/flow"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginLeft: 'auto' }}
                    >
                      Mở Google Flow ↗
                    </a>
                  </div>
                </div>
              )}

              <video 
                id="compiled-video-player"
                src={compiledVideoUrl} 
                controls 
                className="video-preview"
                autoPlay
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.5rem' }}>
                <a 
                  id="link-download-video"
                  href={compiledVideoUrl} 
                  download 
                  className="btn btn-primary"
                  style={{ textDecoration: 'none' }}
                >
                  📥 Tải Video Xuống
                </a>
                <button 
                  id="btn-recreate-video"
                  className="btn" 
                  style={{ background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                  onClick={handleReset}
                >
                  Tạo Video Khác
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Floating Settings Button */}
      <button
        id="btn-settings-toggle"
        className="settings-btn"
        onClick={() => setIsSettingsOpen(true)}
        title="Cấu hình API Keys"
        type="button"
      >
        ⚙️
      </button>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔑 Cấu Hình API Keys</h3>
              <button 
                id="btn-settings-close"
                className="close-btn" 
                onClick={() => setIsSettingsOpen(false)}
                type="button"
              >
                &times;
              </button>
            </div>
            
            <form onSubmit={handleSaveSettings}>
              <div className="form-group">
                <label htmlFor="settings-gemini-key">Gemini API Key</label>
                <input
                  id="settings-gemini-key"
                  type="password"
                  className="form-input"
                  placeholder="Dán Gemini API Key của bạn"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="settings-elevenlabs-key">ElevenLabs API Key</label>
                <input
                  id="settings-elevenlabs-key"
                  type="password"
                  className="form-input"
                  placeholder="Dán ElevenLabs API Key của bạn"
                  value={elevenLabsApiKey}
                  onChange={(e) => setElevenLabsApiKey(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="settings-banana-key">Banana Pro API Key</label>
                <input
                  id="settings-banana-key"
                  type="password"
                  className="form-input"
                  placeholder="Dán Banana Pro API Key của bạn"
                  value={bananaApiKey}
                  onChange={(e) => setBananaApiKey(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor="settings-banana-url">Banana Pro API URL</label>
                <input
                  id="settings-banana-url"
                  type="text"
                  className="form-input"
                  placeholder="https://api.banana-pro.ai/v1/images/generate"
                  value={bananaApiUrl}
                  onChange={(e) => setBananaApiUrl(e.target.value)}
                />
              </div>

              <button 
                id="btn-settings-save"
                type="submit" 
                className="btn btn-primary" 
                style={{ marginTop: '1rem' }}
              >
                Lưu cấu hình
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
