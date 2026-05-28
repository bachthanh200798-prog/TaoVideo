'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  BUSY_PIPELINE_STATES,
  DEFAULT_BANANA_API_URL,
  DEFAULT_LOCAL_VOICE,
  DEFAULT_STORED_LOCAL_VOICE,
  type ActiveTab,
  type AspectRatio,
  type ElevenLabsVoice,
  type FlowBridgeStats,
  type PipelineState,
  type Scene,
  type ScriptLanguage,
  type VideoModel,
  type VideoScript,
  type VisualMode,
} from './page-models';
import { assertOkResponse, fileToBase64 } from './page-utils';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}

type SetupPanel = 'source' | 'character' | 'output' | 'flow';

function ToggleSwitch({ checked, onChange, label, description }: ToggleSwitchProps) {
  return (
    <label className="toggle-row">
      <span className="toggle-copy">
        <span className="toggle-title">{label}</span>
        {description && <span className="toggle-description">{description}</span>}
      </span>
      <span className="toggle-control">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="toggle-track" aria-hidden="true">
          <span className="toggle-thumb" />
        </span>
      </span>
    </label>
  );
}

export default function Home() {
  // Hydration guard: suppress client-only content until after first paint
  const [mounted, setMounted] = useState(false);

  // Tab control state
  const [activeTab, setActiveTab] = useState<ActiveTab>('direct');
  const [setupPanel, setSetupPanel] = useState<SetupPanel>('source');

  // Settings / API credentials state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState('');
  const [bananaApiKey, setBananaApiKey] = useState('');
  const [bananaApiUrl, setBananaApiUrl] = useState(DEFAULT_BANANA_API_URL);
  const [useFlowExtension, setUseFlowExtension] = useState(false);
  const [extensionConnected, setExtensionConnected] = useState(false);
  const [extensionStats, setExtensionStats] = useState<FlowBridgeStats | null>(null);

  // Input fields state
  const [productName, setProductName] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [competitorUrl, setCompetitorUrl] = useState('');
  const [competitorFile, setCompetitorFile] = useState<File | null>(null);
  
  // Settings state — always init with stable defaults to avoid hydration mismatch
  const [useElevenLabs, setUseElevenLabs] = useState(true);
  const [localVoice, setLocalVoice] = useState(DEFAULT_LOCAL_VOICE);
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState(DEFAULT_LOCAL_VOICE);
  const [visualMode, setVisualMode] = useState<VisualMode>('video');
  const [videoModel, setVideoModel] = useState<VideoModel>('veo-3');
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [scriptLanguage, setScriptLanguage] = useState<ScriptLanguage>('vi');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [productImage, setProductImage] = useState<File | null>(null);
  const [productFlowMediaId, setProductFlowMediaId] = useState<string | null>(null);
  const [useCharacter, setUseCharacter] = useState(false);
  const [characterName, setCharacterName] = useState('');
  const [characterNationality, setCharacterNationality] = useState('Việt Nam');
  const [characterAge, setCharacterAge] = useState('25-30');
  const [characterGender, setCharacterGender] = useState('Nữ');
  const [characterDesc, setCharacterDesc] = useState('');
  const [characterFlowMediaId, setCharacterFlowMediaId] = useState<string | null>(null);
  const [characterImageUrl, setCharacterImageUrl] = useState<string | null>(null);
  const [isUploadingProduct, setIsUploadingProduct] = useState(false);
  const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);
  const [isRegeneratingScene, setIsRegeneratingScene] = useState<number | null>(null);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  
  // App workflow state
  const [script, setScript] = useState<VideoScript | null>(null);
  const [competitorTranscript, setCompetitorTranscript] = useState<string | null>(null);
  const [competitorHookType, setCompetitorHookType] = useState<string | null>(null);
  const [competitorFlow, setCompetitorFlow] = useState<string | null>(null);
  
  // Loading & Progress state
  const [pipelineState, setPipelineState] = useState<PipelineState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [compiledVideoUrl, setCompiledVideoUrl] = useState<string | null>(null);
  const [flowProjectId, setFlowProjectId] = useState<string | null>(null);
  const [flowProjectTitle, setFlowProjectTitle] = useState<string | null>(null);
  const [progressStatusText, setProgressStatusText] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productImageInputRef = useRef<HTMLInputElement>(null);
  const charImageInputRef = useRef<HTMLInputElement>(null);

  const ensureFlowProject = async (): Promise<string> => {
    if (flowProjectId) return flowProjectId;
    setProgressStatusText('Đang khởi tạo dự án mới trên Google Flow...');
    return triggerCreateFlowProjectOnly();
  };

  const uploadProductImageToFlow = async (file: File, activeProjectId: string) => {
    setIsUploadingProduct(true);
    try {
      const base64 = await fileToBase64(file);

      const res = await fetch('/api/flow/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: file.type,
          projectId: activeProjectId,
          fileName: file.name
        })
      });

      await assertOkResponse(res, 'Failed to upload image');

      const data = await res.json();
      if (data.mediaId) {
        setProductFlowMediaId(data.mediaId);
        localStorage.setItem('product_flow_media_id', data.mediaId);
      }
    } catch (err: any) {
      console.error('Failed to upload product image to Flow:', err);
      setErrorMsg(`Không thể tải ảnh sản phẩm lên Google Flow: ${err.message}`);
    } finally {
      setIsUploadingProduct(false);
    }
  };

  const syncProductImageToFlow = async (file = productImage, force = false) => {
    if (!file || (!force && productFlowMediaId)) return;
    const activeProjectId = await ensureFlowProject();
    await uploadProductImageToFlow(file, activeProjectId);
  };

  const handleGenerateCharacterPortrait = async () => {
    setErrorMsg(null);
    setIsGeneratingCharacter(true);
    try {
      let activeProjId = flowProjectId;
      if (!activeProjId) {
        setProgressStatusText('Đang khởi tạo dự án mới trên Google Flow...');
        activeProjId = await triggerCreateFlowProjectOnly();
      }

      setProgressStatusText('Đang tạo chân dung nhân vật đại diện trên Google Flow...');
      const res = await fetch('/api/flow/character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProjId,
          gender: characterGender,
          age: characterAge,
          nationality: characterNationality,
          aspectRatio: '9:16'
        })
      });

      await assertOkResponse(res, 'Failed to generate character');

      const data = await res.json();
      if (data.mediaId && data.url) {
        setCharacterFlowMediaId(data.mediaId);
        setCharacterImageUrl(data.url);
        localStorage.setItem('character_flow_media_id', data.mediaId);
        localStorage.setItem('character_image_url', data.url);
      }
    } catch (err: any) {
      console.error('Failed to generate character:', err);
      setErrorMsg(`Không thể tạo chân dung nhân vật trên Google Flow: ${err.message}`);
    } finally {
      setIsGeneratingCharacter(false);
    }
  };

  const handleUploadCharacterPortrait = async (file: File) => {
    setIsGeneratingCharacter(true);
    try {
      let activeProjId = flowProjectId;
      if (!activeProjId) {
        setProgressStatusText('Đang khởi tạo dự án mới trên Google Flow...');
        activeProjId = await triggerCreateFlowProjectOnly();
      }

      const base64 = await fileToBase64(file);

      const res = await fetch('/api/flow/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: file.type,
          projectId: activeProjId,
          fileName: file.name
        })
      });

      await assertOkResponse(res, 'Failed to upload character portrait');

      const data = await res.json();
      if (data.mediaId) {
        setCharacterFlowMediaId(data.mediaId);
        const localUrl = URL.createObjectURL(file);
        setCharacterImageUrl(localUrl);
        localStorage.setItem('character_flow_media_id', data.mediaId);
        localStorage.setItem('character_image_url', localUrl);
      }
    } catch (err: any) {
      console.error('Failed to upload character portrait:', err);
      setErrorMsg(`Không thể tải ảnh chân dung MC lên Google Flow: ${err.message}`);
    } finally {
      setIsGeneratingCharacter(false);
    }
  };

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
    const bUrl = localStorage.getItem('banana_api_url') || DEFAULT_BANANA_API_URL;
    const flowExt = localStorage.getItem('use_flow_extension') === 'true';
    const useEl = localStorage.getItem('use_elevenlabs') !== 'false';
    const lVoice = localStorage.getItem('local_voice') || DEFAULT_STORED_LOCAL_VOICE;
    const subs = localStorage.getItem('subtitles_enabled') !== 'false';
    const scriptLang = (localStorage.getItem('script_language') as ScriptLanguage) || 'vi';
    const aspect = (localStorage.getItem('aspect_ratio') as AspectRatio) || '9:16';
    const useChar = localStorage.getItem('use_character') === 'true';
    const charName = localStorage.getItem('character_name') || '';
    const charNationality = localStorage.getItem('character_nationality') || 'Việt Nam';
    const charAge = localStorage.getItem('character_age') || '25-30';
    const charGender = localStorage.getItem('character_gender') || 'Nữ';
    const charDesc = localStorage.getItem('character_desc') || '';

    const cachedProjId = localStorage.getItem('flow_project_id') || null;
    const cachedProjTitle = localStorage.getItem('flow_project_title') || null;
    const prodMediaId = localStorage.getItem('product_flow_media_id') || null;
    const charMediaId = localStorage.getItem('character_flow_media_id') || null;
    const charImgUrl = localStorage.getItem('character_image_url') || null;

    setGeminiApiKey(gKey);
    setElevenLabsApiKey(eKey);
    setBananaApiKey(bKey);
    setBananaApiUrl(bUrl);
    setUseFlowExtension(flowExt);
    setUseElevenLabs(useEl);
    setLocalVoice(lVoice);
    setSubtitlesEnabled(subs);
    setScriptLanguage(scriptLang);
    setAspectRatio(aspect);
    setUseCharacter(useChar);
    setCharacterName(charName);
    setCharacterNationality(charNationality);
    setCharacterAge(charAge);
    setCharacterGender(charGender);
    setCharacterDesc(charDesc);

    if (cachedProjId) setFlowProjectId(cachedProjId);
    if (cachedProjTitle) setFlowProjectTitle(cachedProjTitle);
    if (prodMediaId) setProductFlowMediaId(prodMediaId);
    if (charMediaId) setCharacterFlowMediaId(charMediaId);
    if (charImgUrl) setCharacterImageUrl(charImgUrl);

    fetchVoices(eKey);
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
      } catch {
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
    if (!productName.trim() || !productUrl.trim()) {
      setSetupPanel('source');
      setErrorMsg('Vui lòng nhập tên sản phẩm và link sản phẩm trước khi bắt đầu.');
      return;
    }

    if (activeTab === 'competitor' && !competitorFile && !competitorUrl) {
      setSetupPanel('source');
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
      formData.append('language', scriptLanguage);
      if (productImage) {
        formData.append('productImage', productImage);
      }
      if (useCharacter && characterName) {
        formData.append('characterName', characterName);
        formData.append('characterNationality', characterNationality);
        formData.append('characterAge', characterAge);
        formData.append('characterGender', characterGender);
        formData.append('characterDesc', characterDesc);
      }
      
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

      await assertOkResponse(res, 'Quá trình phân tích sản phẩm thất bại.');

      const data = await res.json();
      const targetScript = data.mode === 'adapted' ? data.analysis.adaptedScript : data.script;

      if (data.mode === 'adapted') {
        setScript(targetScript);
        setSelectedSceneIndex(0);
        setCompetitorTranscript(data.analysis.transcript);
        setCompetitorHookType(data.analysis.hookType);
        setCompetitorFlow(data.analysis.flowStructure);
      } else {
        setScript(targetScript);
        setSelectedSceneIndex(0);
        setCompetitorTranscript(null);
        setCompetitorHookType(null);
        setCompetitorFlow(null);
      }

      setPipelineState('script-ready');
      setProgressStatusText('Kịch bản đã được khởi tạo. Vui lòng rà soát nội dung kịch bản ở khung bên phải, chỉnh sửa nếu cần và nhấn "Duyệt Kịch Bản & Render Video" để bắt đầu sản xuất.');
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

  const handleGenerateStoryboard = async () => {
    if (!script) return;
    setErrorMsg(null);
    setPipelineState('media-generating');
    setProgressStatusText('Đang tiến hành tạo các hình ảnh phác thảo cho Storyboard (Banana Pro/Flow)...');

    try {
      const activeProjId = useFlowExtension ? await triggerCreateFlowProjectOnly() : null;
      
      const res = await fetch('/api/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: script.scenes,
          scriptTitle: script.title,
          useFlowExtension,
          projectId: activeProjId,
          geminiKey: geminiApiKey,
          bananaKey: bananaApiKey,
          bananaUrl: bananaApiUrl,
          aspectRatio,
          refMediaIds: [productFlowMediaId, useCharacter ? characterFlowMediaId : null].filter(Boolean)
        })
      });

      await assertOkResponse(res, 'Tạo Storyboard thất bại.');

      const data = await res.json();
      if (data.success && data.scenes) {
        setScript({
          ...script,
          scenes: data.scenes
        });
        setPipelineState('storyboard-ready');
        setProgressStatusText('Storyboard đã được tạo thành công! Hãy rà soát hình ảnh phác thảo ở khung bên phải. Bạn có thể nhấn "Tạo lại ảnh" cho từng cảnh hoặc nhấn "Duyệt Storyboard & Render Video" để bắt đầu.');
      } else {
        throw new Error('Dữ liệu storyboard phản hồi không hợp lệ.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Tạo Storyboard thất bại.');
      setPipelineState('error');
    }
  };

  const handleRegenerateSceneImage = async (index: number) => {
    if (!script) return;
    setIsRegeneratingScene(index);
    setErrorMsg(null);
    
    try {
      const targetScene = script.scenes[index];
      const res = await fetch('/api/storyboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenes: [targetScene],
          scriptTitle: script.title,
          useFlowExtension,
          projectId: flowProjectId,
          geminiKey: geminiApiKey,
          bananaKey: bananaApiKey,
          bananaUrl: bananaApiUrl,
          aspectRatio,
          refMediaIds: [productFlowMediaId, useCharacter ? characterFlowMediaId : null].filter(Boolean)
        })
      });

      await assertOkResponse(res, 'Tạo lại hình ảnh cảnh thất bại.');

      const data = await res.json();
      if (data.success && data.scenes && data.scenes.length > 0) {
        const updatedScenes = [...script.scenes];
        updatedScenes[index] = data.scenes[0];
        setScript({
          ...script,
          scenes: updatedScenes
        });
      } else {
        throw new Error('Dữ liệu tạo lại hình ảnh phản hồi không hợp lệ.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Cảnh ${index + 1}: ${err.message}`);
    } finally {
      setIsRegeneratingScene(null);
    }
  };

  const triggerCreateFlowProjectOnly = async (): Promise<string> => {
    if (flowProjectId) return flowProjectId;
    try {
      const cleanProduct = productName ? String(productName).trim() : '';
      const cleanScriptTitle = script?.title ? String(script.title).trim() : '';
      const baseTitle = cleanScriptTitle || cleanProduct || 'AutoVideo Production';
      const projTitle = `${baseTitle} - Flow`;
      
      const res = await fetch('/api/compile', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-gemini-key': geminiApiKey,
          'x-use-flow-extension': 'true'
        },
        body: JSON.stringify({
          script: { ...script, scenes: [] },
          productName,
          useFlowExtension: true,
          onlyCreateProject: true
        })
      });
      
      await assertOkResponse(res, 'Failed to create project');
      
      const data = await res.json();
      if (data.projectId) {
        setFlowProjectId(data.projectId);
        setFlowProjectTitle(projTitle);
        localStorage.setItem('flow_project_id', data.projectId);
        localStorage.setItem('flow_project_title', projTitle);
        return data.projectId;
      }
      throw new Error('No project ID returned');
    } catch (err: any) {
      console.error('Failed to create flow project:', err);
      throw new Error(`Không tạo được dự án Google Flow: ${err.message}`);
    }
  };

  // Run continuous automation to compile assets and video
  const startAutoCompile = async (scriptToCompile: VideoScript) => {
    if (!scriptToCompile) return;

    setErrorMsg(null);
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
          subtitlesEnabled,
          aspectRatio,
          projectId: flowProjectId,
          refMediaIds: [productFlowMediaId, useCharacter ? characterFlowMediaId : null].filter(Boolean)
        })
      });

      await assertOkResponse(res, 'Biên tập video thất bại.');

      setPipelineState('compiling');
      setProgressStatusText('Đang tiến hành ghép các cảnh âm thanh, hình ảnh và tạo phụ đề (FFmpeg)...');

      const data = await res.json();
      
      if (data.success && data.videoUrl) {
        setCompiledVideoUrl(data.videoUrl);
        if (data.projectId) {
          setFlowProjectId(data.projectId);
          localStorage.setItem('flow_project_id', data.projectId);
        }
        if (data.projectTitle) {
          setFlowProjectTitle(data.projectTitle);
          localStorage.setItem('flow_project_title', data.projectTitle);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const pipelineStepNumber: Record<PipelineState, number> = {
    idle: 0,
    scraping: 1,
    analyzing: 2,
    'script-ready': 3,
    'storyboard-ready': 4,
    'media-generating': 5,
    compiling: 6,
    completed: 7,
    error: 0,
  };
  const readyReferenceCount = [productFlowMediaId, useCharacter ? characterFlowMediaId : null].filter(Boolean).length;
  const flowHealthLabel = useFlowExtension
    ? (extensionConnected ? 'Flow live' : 'Flow attention')
    : 'Flow optional';
  const activeSourceLabel = activeTab === 'competitor' ? 'Competitor remix' : 'Product direct';
  const productionSteps = [
    { state: 'idle', number: 1, title: 'Thiết lập đầu vào', detail: 'Sản phẩm, nguồn video, ảnh thật và nhân vật.' },
    { state: 'analyzing', number: 2, title: 'AI viết kịch bản', detail: 'Cào dữ liệu, bóc băng đối thủ và tạo script.' },
    { state: 'script-ready', number: 3, title: 'Duyệt kịch bản', detail: 'Sửa hook, CTA, lời thoại và prompt từng cảnh.' },
    { state: 'storyboard-ready', number: 4, title: 'Storyboard', detail: 'Tạo, xem và tái tạo ảnh phác thảo từng cảnh.' },
    { state: 'media-generating', number: 5, title: 'Tạo media', detail: 'Sinh voice, ảnh hoặc clip bằng Flow/Veo/Omni.' },
    { state: 'compiling', number: 6, title: 'Render video', detail: 'Ghép cảnh, âm thanh, chuyển cảnh và phụ đề.' },
    { state: 'completed', number: 7, title: 'Xuất bản', detail: 'Xem, tải video và mở dự án Flow.' },
  ] as const;
  const visibleStepNumber = Math.max(1, pipelineStepNumber[pipelineState] || 1);
  const selectedScene = script?.scenes[selectedSceneIndex] ?? null;
  const workbenchInspector = {
    source: {
      eyebrow: 'Input readiness',
      title: 'Nguồn dữ liệu quyết định chất lượng video.',
      body: 'Điền thông tin sản phẩm, thêm ảnh thật để giữ mẫu chính xác, và dùng competitor mode khi cần bóc cấu trúc bán hàng từ video đối thủ.',
      checks: [
        { label: 'Tên sản phẩm', done: Boolean(productName.trim()) },
        { label: 'Link sản phẩm', done: Boolean(productUrl.trim()) },
        { label: 'Ảnh sản phẩm thật', done: Boolean(productImage) },
        { label: 'Nguồn đối thủ nếu dùng', done: activeTab !== 'competitor' || Boolean(competitorFile || competitorUrl) },
      ],
    },
    character: {
      eyebrow: 'Brand consistency',
      title: 'Nhân vật đại diện giúp video nhất quán hơn.',
      body: 'Bật character khi muốn MC xuất hiện xuyên suốt video. Có thể tạo chân dung bằng Flow hoặc upload ảnh chân dung riêng.',
      checks: [
        { label: 'Character mode', done: useCharacter },
        { label: 'Giới tính/tuổi/quốc tịch', done: Boolean(characterGender && characterAge && characterNationality) },
        { label: 'Chân dung Flow', done: Boolean(characterFlowMediaId || characterImageUrl) },
      ],
    },
    output: {
      eyebrow: 'Render configuration',
      title: 'Đầu ra được tách riêng để chỉnh nhanh trước khi chạy.',
      body: 'Chọn voice, subtitle, tỉ lệ khung hình và model tạo video. Các cấu hình này sẽ được gửi vào pipeline render.',
      checks: [
        { label: 'Voice mode', done: Boolean(useElevenLabs ? selectedVoice : localVoice) },
        { label: 'Aspect ratio', done: Boolean(aspectRatio) },
        { label: 'Visual mode', done: Boolean(visualMode) },
        { label: 'Video model', done: visualMode === 'images' || Boolean(videoModel) },
      ],
    },
    flow: {
      eyebrow: 'Flow bridge',
      title: 'Flow giữ reference sản phẩm và nhân vật.',
      body: 'Bật extension để đẩy asset qua Google Flow. Nếu extension chưa kết nối, panel này sẽ hiển thị hướng dẫn cài đặt và trạng thái project.',
      checks: [
        { label: 'Extension enabled', done: useFlowExtension },
        { label: 'Bridge connected', done: extensionConnected },
        { label: 'Flow project', done: Boolean(flowProjectId) },
        { label: 'Reference asset', done: readyReferenceCount > 0 },
      ],
    },
  } satisfies Record<SetupPanel, {
    eyebrow: string;
    title: string;
    body: string;
    checks: Array<{ label: string; done: boolean }>;
  }>;
  const activeInspector = workbenchInspector[setupPanel];

  return (
    <main id="main-content" className="app-container">
      <header className="header">
        <div>
          <span className="eyebrow">AI video production console</span>
          <h1>AutoVideo.AI</h1>
          <p>Hệ thống tự động hóa sản xuất Video từ kịch bản và sản phẩm trên macOS M1</p>
        </div>
        <div className="header-status" aria-label="Workspace status">
          <span className={`status-pill ${extensionConnected ? 'success' : 'danger'}`}>
            {extensionConnected ? 'Flow extension connected' : 'Flow extension offline'}
          </span>
          {flowProjectId && (
            <span className="status-pill mono" title={flowProjectId}>
              Project {flowProjectId.slice(0, 8)}
            </span>
          )}
        </div>
      </header>

      <section className="command-strip" aria-label="Production overview">
        <div className="command-metric">
          <span>Workflow</span>
          <strong>{activeSourceLabel}</strong>
        </div>
        <div className="command-metric">
          <span>Pipeline</span>
          <strong>Step {pipelineStepNumber[pipelineState]}/7</strong>
        </div>
        <div className="command-metric">
          <span>Reference assets</span>
          <strong>{readyReferenceCount} ready</strong>
        </div>
        <div className="command-metric">
          <span>Flow bridge</span>
          <strong>{flowHealthLabel}</strong>
        </div>
      </section>

      <section className="workflow-steps" aria-label="Production steps">
        {productionSteps.map((step) => {
          const isActive = step.number === visibleStepNumber;
          const isDone = step.number < visibleStepNumber || pipelineState === 'completed';
          return (
            <div
              key={step.number}
              className={`workflow-step ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="workflow-step-index">{isDone ? '✓' : step.number}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.detail}</p>
              </div>
            </div>
          );
        })}
      </section>

      <div className="grid-container">
        {/* Left Side: Configuration or Pipeline Status */}
        <section className="workspace-column" aria-label="Production setup">
          {pipelineState === 'idle' || pipelineState === 'error' ? (
            <div className="card">
              <div className="tabs-container" role="tablist" aria-label="Production source">
                <button
                  id="tab-direct"
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'direct'}
                  aria-controls="production-input-panel"
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
                  role="tab"
                  aria-selected={activeTab === 'competitor'}
                  aria-controls="production-input-panel"
                  className={`tab-btn ${activeTab === 'competitor' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveTab('competitor');
                    setErrorMsg(null);
                  }}
                >
                  📊 Phân Tích Video Đối Thủ
                </button>
              </div>

              <form id="production-input-panel" role="tabpanel" aria-labelledby={activeTab === 'direct' ? 'tab-direct' : 'tab-competitor'} onSubmit={handleAnalyze}>
                <div className="workbench-nav" role="tablist" aria-label="Workbench panels">
                  {[
                    { id: 'source', label: 'Nguồn dữ liệu', hint: productUrl ? 'Đã có link' : 'Cần link' },
                    { id: 'character', label: 'Nhân vật', hint: useCharacter ? 'Đang bật' : 'Tùy chọn' },
                    { id: 'output', label: 'Đầu ra', hint: `${aspectRatio} · ${visualMode === 'video' ? 'Clip' : 'Ảnh'}` },
                    { id: 'flow', label: 'Flow', hint: useFlowExtension ? (extensionConnected ? 'Connected' : 'Cần kết nối') : 'Tắt' },
                  ].map((panel) => (
                    <button
                      key={panel.id}
                      type="button"
                      role="tab"
                      aria-selected={setupPanel === panel.id}
                      className={`workbench-tab ${setupPanel === panel.id ? 'active' : ''}`}
                      onClick={() => setSetupPanel(panel.id as SetupPanel)}
                    >
                      <strong>{panel.label}</strong>
                      <span>{panel.hint}</span>
                    </button>
                  ))}
                </div>

                {setupPanel === 'source' && (
                  <div className="workbench-panel">
                <div className="form-group">
                  <label htmlFor="select-script-language">Ngôn ngữ kịch bản (Script Language)</label>
                  <select
                    id="select-script-language"
                    className="form-input"
                    value={scriptLanguage}
                    onChange={(e) => {
                      const val = e.target.value as 'vi' | 'en';
                      setScriptLanguage(val);
                      localStorage.setItem('script_language', val);
                      
                      // Auto-switch default localVoice to match language
                      if (val === 'en') {
                        setLocalVoice('macos-samantha');
                      } else {
                        setLocalVoice('local-vietnamese');
                      }
                    }}
                  >
                    <option value="vi">🇻🇳 Tiếng Việt (Vietnamese)</option>
                    <option value="en">🇺🇸 Tiếng Anh (English)</option>
                  </select>
                </div>

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

                <div className="form-group upload-section">
                  <label>Ảnh thực tế sản phẩm (Để giữ mẫu sản phẩm chính xác, không biến dạng)</label>
                  <div 
                    id="dropzone-product-image"
                    className="file-upload source-upload"
                    onClick={() => productImageInputRef.current?.click()}
                  >
                    <input
                      ref={productImageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden-file-input"
                      onChange={async (e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          setProductImage(file);
                          setProductFlowMediaId(null);
                          localStorage.removeItem('product_flow_media_id');
                          
                          if (useFlowExtension) {
                            try {
                              let activeProjId = flowProjectId;
                              if (!activeProjId) {
                                setProgressStatusText('Đang khởi tạo dự án mới trên Google Flow...');
                                activeProjId = await triggerCreateFlowProjectOnly();
                              }
                              if (activeProjId) {
                                await uploadProductImageToFlow(file, activeProjId);
                              }
                            } catch (err: any) {
                              setErrorMsg(err.message);
                            }
                          }
                        }
                      }}
                    />
                    {productImage ? (
                      <div className="upload-selected">
                        <span className="upload-selected-name">
                          ✓ {productImage.name} ({(productImage.size / 1024).toFixed(1)} KB)
                        </span>
                        {isUploadingProduct ? (
                          <div className="upload-status">
                            <span className="spinner spinner-xs" /> Đang đồng bộ lên Flow...
                          </div>
                        ) : productFlowMediaId ? (
                          <div className="upload-status success">
                            Đã khoá sản phẩm trên Flow (ID: {productFlowMediaId.substring(0, 8)}...)
                          </div>
                        ) : null}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={URL.createObjectURL(productImage)}
                          alt="Product preview"
                          className="upload-preview-img"
                        />
                      </div>
                    ) : (
                      <>
                        <span className="upload-icon">📸</span>
                        <p>Kéo thả hoặc nhấp để tải lên ảnh sản phẩm (.jpg, .png)</p>
                      </>
                    )}
                  </div>
                </div>
                  </div>
                )}

                {/* Character Configuration Section */}
                {setupPanel === 'character' && (
                  <div className="workbench-panel">
                <div className="form-group section-panel">
                  <ToggleSwitch
                    checked={useCharacter}
                    onChange={(val) => {
                      setUseCharacter(val);
                      localStorage.setItem('use_character', String(val));
                    }}
                    label="👤 Sử dụng nhân vật đại diện (Host/Character)"
                    description="Định hình MC xuất hiện xuyên suốt video để giữ nhận diện hình ảnh."
                  />

                  {useCharacter && (
                    <div className="character-form">
                      <div className="field-grid">
                        <div className="form-group compact">
                          <label htmlFor="select-character-gender">Giới tính</label>
                          <select
                            id="select-character-gender"
                            className="form-input"
                            value={characterGender}
                            onChange={(e) => {
                              setCharacterGender(e.target.value);
                              localStorage.setItem('character_gender', e.target.value);
                            }}
                          >
                            <option value="Nữ">Nữ (Female)</option>
                            <option value="Nam">Nam (Male)</option>
                            <option value="Khác">Khác (Other)</option>
                          </select>
                        </div>

                        <div className="form-group compact">
                          <label htmlFor="select-character-age">Độ tuổi</label>
                          <select
                            id="select-character-age"
                            className="form-input"
                            value={characterAge}
                            onChange={(e) => {
                              setCharacterAge(e.target.value);
                              localStorage.setItem('character_age', e.target.value);
                            }}
                          >
                            <option value="18-24">18-24 tuổi</option>
                            <option value="25-30">25-30 tuổi</option>
                            <option value="31-40">31-40 tuổi</option>
                            <option value="41-50">41-50 tuổi</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-group compact">
                        <label htmlFor="select-character-nationality">Quốc tịch / Sắc tộc</label>
                        <select
                          id="select-character-nationality"
                          className="form-input"
                          value={characterNationality}
                          onChange={(e) => {
                            setCharacterNationality(e.target.value);
                            localStorage.setItem('character_nationality', e.target.value);
                          }}
                        >
                          <option value="Việt Nam">Việt Nam (Vietnamese)</option>
                          <option value="Châu Á">Châu Á (Asian)</option>
                          <option value="Âu Mỹ">Âu Mỹ (Western/Caucasian)</option>
                          <option value="Hàn Quốc">Hàn Quốc (Korean)</option>
                          <option value="Nhật Bản">Nhật Bản (Japanese)</option>
                        </select>
                      </div>

                      {/* Chân dung MC preview & buttons */}
                      <div className="form-group compact character-portrait-section">
                        <label>Chân dung MC trên Google Flow</label>
                        
                        {characterImageUrl ? (
                          <div className="portrait-card">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img 
                              src={characterImageUrl} 
                              alt="MC Portrait preview" 
                              className="portrait-img"
                            />
                            <div className="portrait-id">
                              ID: <code>{characterFlowMediaId}</code>
                            </div>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm btn-compact"
                              onClick={() => {
                                setCharacterFlowMediaId(null);
                                setCharacterImageUrl(null);
                                localStorage.removeItem('character_flow_media_id');
                                localStorage.removeItem('character_image_url');
                              }}
                            >
                              ✕ Xoá chân dung
                            </button>
                          </div>
                        ) : (
                          <div className="portrait-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm full-width-btn"
                              disabled={isGeneratingCharacter}
                              onClick={handleGenerateCharacterPortrait}
                            >
                              {isGeneratingCharacter ? (
                                <>
                                  <span className="spinner spinner-xs" /> Đang tạo chân dung...
                                </>
                              ) : (
                                <>✨ Tạo chân dung MC trên Flow</>
                              )}
                            </button>

                            <div className="muted-separator compact">hoặc</div>

                            <button
                              type="button"
                              className="btn btn-secondary btn-sm full-width-btn subtle-btn"
                              disabled={isGeneratingCharacter}
                              onClick={() => charImageInputRef.current?.click()}
                            >
                              📁 Tải ảnh chân dung của bạn
                            </button>
                            <input
                              ref={charImageInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden-file-input"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleUploadCharacterPortrait(e.target.files[0]);
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                  </div>
                )}

                {activeTab === 'competitor' && (
                setupPanel === 'source' && (
                  <div className="form-group divider-section">
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
                    
                    <div className="muted-separator">hoặc</div>

                    <div 
                      id="dropzone-competitor-file"
                      className="file-upload"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="video/*"
                        className="hidden-file-input"
                        onChange={handleFileChange}
                      />
                      {competitorFile ? (
                        <span className="upload-selected-name">
                          ✓ {competitorFile.name} ({(competitorFile.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      ) : (
                        <>
                          <span className="upload-icon">📁</span>
                          <p>Kéo thả hoặc nhấp để tải lên tệp video đối thủ (.mp4, .mov)</p>
                        </>
                      )}
                    </div>
                  </div>
                )
                )}

                {setupPanel === 'flow' && (
                  <div className="workbench-panel">
                <div className="form-group section-panel">
                  <ToggleSwitch
                    checked={useFlowExtension}
                    onChange={(val) => {
                      setUseFlowExtension(val);
                      localStorage.setItem('use_flow_extension', String(val));
                      if (val) {
                        void syncProductImageToFlow().catch((err: any) => {
                          setErrorMsg(err.message);
                        });
                      }
                    }}
                    label="🌐 Sử dụng Google Flow Extension"
                    description="Đẩy ảnh sản phẩm, nhân vật và media qua Flow để giữ reference."
                  />
                  
                  <div className="flow-panel">
                    <div className="flow-status-row">
                      <span>Trạng thái</span>
                      {extensionConnected ? (
                        <strong className="connected">
                          ● Đã kết nối {extensionStats?.userInfo?.email ? `(${extensionStats.userInfo.email})` : ''}
                        </strong>
                      ) : (
                        <strong className="disconnected">
                          ○ Chưa kết nối
                        </strong>
                      )}
                    </div>
                    
                    {!extensionConnected && useFlowExtension && (
                      <div className="flow-help">
                        <p>Hướng dẫn cài đặt Extension:</p>
                        <ol>
                          <li>Mở <code>chrome://extensions/</code> trên Chrome.</li>
                          <li>Bật <b>Developer mode</b> ở góc trên bên phải.</li>
                          <li>Chọn <b>Load unpacked</b> và tìm đến thư mục <code>public/extension</code> trong thư mục dự án này.</li>
                          <li>Mở tab <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noreferrer">labs.google/fx/tools/flow</a> và đăng nhập tài khoản Google.</li>
                        </ol>
                      </div>
                    )}

                    {useFlowExtension && (
                      <div className="flow-project-section">
                        {flowProjectId ? (
                          <div className="flow-project-card">
                            <span>Dự án đang liên kết</span>
                            <strong>{flowProjectTitle}</strong>
                            <div>
                              <code>{flowProjectId}</code>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                onClick={() => {
                                  setFlowProjectId(null);
                                  setFlowProjectTitle(null);
                                  setProductFlowMediaId(null);
                                  setCharacterFlowMediaId(null);
                                  setCharacterImageUrl(null);
                                  localStorage.removeItem('flow_project_id');
                                  localStorage.removeItem('flow_project_title');
                                  localStorage.removeItem('product_flow_media_id');
                                  localStorage.removeItem('character_flow_media_id');
                                  localStorage.removeItem('character_image_url');
                                }}
                              >
                                ✕ Giải phóng
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flow-empty">
                            <p>
                              Chưa liên kết dự án nào. Một dự án sẽ được tạo tự động khi bạn upload sản phẩm hoặc bắt đầu sản xuất.
                            </p>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={async () => {
                                try {
                                  setProgressStatusText('Đang khởi tạo dự án mới trên Google Flow...');
                                  const activeProjectId = await triggerCreateFlowProjectOnly();
                                  if (productImage && !productFlowMediaId) {
                                    await uploadProductImageToFlow(productImage, activeProjectId);
                                  }
                                } catch (err: any) {
                                  setErrorMsg(err.message);
                                }
                              }}
                            >
                              ➕ Khởi tạo dự án mới trên Flow
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                  </div>
                )}

                {setupPanel === 'output' && (
                  <div className="workbench-panel">
                <h3 className="section-heading">
                  ⚙️ Cấu Hình Đầu Ra
                </h3>

                <div className="form-group section-panel">
                  <ToggleSwitch
                    checked={useElevenLabs}
                    onChange={(val) => {
                      setUseElevenLabs(val);
                      localStorage.setItem('use_elevenlabs', String(val));
                    }}
                    label="🎙️ Sử dụng giọng đọc AI ElevenLabs"
                    description="Bật để dùng voice AI, tắt để dùng giọng máy nội bộ."
                  />

                  {!mounted ? (
                    // Render stable placeholder before hydration to avoid mismatch
                    <div className="form-group compact">
                      <label htmlFor="select-voice">Chọn giọng đọc</label>
                      <select id="select-voice" className="form-input" defaultValue="" disabled><option value="">Đang tải...</option></select>
                    </div>
                  ) : useElevenLabs ? (
                    <div className="form-group compact">
                      <label htmlFor="select-voice">Chọn giọng đọc ElevenLabs</label>
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
                    <div className="form-group compact">
                      <label htmlFor="select-local-voice">Chọn giọng máy nội bộ (Miễn phí)</label>
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
                        {scriptLanguage === 'en' ? (
                          <>
                            <option value="local-english">Giọng Tiếng Anh nội bộ của hệ điều hành</option>
                            <option value="macos-samantha">Samantha (Giọng máy macOS Tiếng Anh Nữ)</option>
                            <option value="macos-daniel">Daniel (Giọng máy macOS Tiếng Anh Nam)</option>
                          </>
                        ) : (
                          <>
                            <option value="local-vietnamese">Giọng Tiếng Việt nội bộ của hệ điều hành</option>
                            <option value="macos-linh">Linh (Giọng máy macOS Tiếng Việt Nữ)</option>
                            <option value="macos-lan">Lan (Giọng máy macOS Tiếng Việt Nữ)</option>
                          </>
                        )}
                      </select>
                    </div>
                  )}
                </div>

                <div className="form-group section-panel">
                  <ToggleSwitch
                    checked={subtitlesEnabled}
                    onChange={(val) => {
                      setSubtitlesEnabled(val);
                      localStorage.setItem('subtitles_enabled', String(val));
                    }}
                    label="💬 Chèn phụ đề lên video"
                    description="Tự động render subtitle vào video thành phẩm."
                  />
                  
                  <div className="setting-status-line" suppressHydrationWarning>
                    {subtitlesEnabled ? (
                      <span className="enabled">
                        ● Có phụ đề (Chữ trắng, nền đen mờ)
                      </span>
                    ) : (
                      <span>
                        ○ Không phụ đề
                      </span>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>Định dạng hình ảnh đầu ra</label>
                  <div className="radio-group">
                    <button
                      id="opt-visual-video"
                      type="button"
                      className={`radio-card ${visualMode === 'video' ? 'active' : ''}`}
                      onClick={() => setVisualMode('video')}
                      aria-pressed={visualMode === 'video'}
                    >
                      <span>🎞️</span>
                      <div>
                        <strong>Video clip</strong>
                        <span>Sinh clip ngắn cho từng cảnh</span>
                      </div>
                    </button>

                    <button
                      id="opt-visual-images"
                      type="button"
                      className={`radio-card ${visualMode === 'images' ? 'active' : ''}`}
                      onClick={() => setVisualMode('images')}
                      aria-pressed={visualMode === 'images'}
                    >
                      <span>🖼️</span>
                      <div>
                        <strong>Ảnh tĩnh</strong>
                        <span>Tạo ảnh rồi pan/zoom bằng FFmpeg</span>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="select-aspect-ratio">Khung hình Video (Aspect Ratio)</label>
                  <select
                    id="select-aspect-ratio"
                    className="form-input"
                    value={aspectRatio}
                    onChange={(e) => {
                      const val = e.target.value as '9:16' | '16:9' | '3:4' | '1:1';
                      setAspectRatio(val);
                      localStorage.setItem('aspect_ratio', val);
                    }}
                  >
                    <option value="9:16">📱 Dọc (TikTok/Reels) - 9:16</option>
                    <option value="16:9">💻 Ngang (YouTube/Web) - 16:9</option>
                    <option value="1:1">⬜ Vuông (Instagram/Post) - 1:1</option>
                    <option value="3:4">📸 Dọc chuẩn (Facebook/Feed) - 3:4</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Mô hình tạo Video</label>
                  <div className="radio-group">
                    <button
                      id="opt-video-veo"
                      type="button"
                      className={`radio-card ${videoModel === 'veo-3' ? 'active' : ''}`}
                      onClick={() => setVideoModel('veo-3')}
                      aria-pressed={videoModel === 'veo-3'}
                    >
                      <span>🎬</span>
                      <div>
                        <strong>Veo 3.1</strong>
                        <span>Độ chi tiết điện ảnh</span>
                      </div>
                    </button>
                    
                    <button
                      id="opt-video-omni"
                      type="button"
                      className={`radio-card ${videoModel === 'omni' ? 'active' : ''}`}
                      onClick={() => setVideoModel('omni')}
                      aria-pressed={videoModel === 'omni'}
                    >
                      <span>⚡</span>
                      <div>
                        <strong>Gemini Omni</strong>
                        <span>Chuyển động nhanh</span>
                      </div>
                    </button>
                  </div>
                </div>
                  </div>
                )}

                {errorMsg && (
                  <div className="error-alert" role="alert">
                    ⚠ Lỗi: {errorMsg}
                  </div>
                )}

                <div className="workbench-action-bar">
                  <div>
                    <strong>Sẵn sàng tạo kịch bản</strong>
                    <span>Kiểm tra nhanh các panel, sau đó bắt đầu pipeline tự động.</span>
                  </div>
                  <button
                    id="btn-submit-analyze"
                    type="submit"
                    className="btn btn-primary workbench-submit"
                  >
                    <span>⚡ Bắt Đầu Sản Xuất Video</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            // Running/Status Screen
            <div className="card">
              <h2 className="card-title">⚙️ Tiến Trình Sản Xuất</h2>
              
              <div className="run-status" role="status" aria-live="polite">
                <p>{progressStatusText}</p>
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
                    <p>Gemini 3.1 Flash Lite xây dựng cấu trúc lời thoại {scriptLanguage === 'en' ? 'tiếng Anh' : 'tiếng Việt'} và gợi ý prompt vẽ ảnh.</p>
                  </div>
                </div>

                <div className={`progress-item ${pipelineState === 'script-ready' ? 'active' : ''}`}>
                  <div className={`progress-icon ${pipelineState === 'script-ready' ? 'loading' : (['storyboard-ready', 'media-generating', 'compiling', 'completed'].includes(pipelineState) ? 'done' : 'todo')}`}>
                    {pipelineState === 'script-ready' ? '🔄' : '4'}
                  </div>
                  <div className="progress-text">
                    <h4>Kiểm duyệt & Chỉnh sửa nội dung</h4>
                    <p>Người dùng kiểm tra, tinh chỉnh lời thoại và prompt hình ảnh trước khi sản xuất.</p>
                  </div>
                </div>

                <div className={`progress-item ${pipelineState === 'storyboard-ready' ? 'active' : ''}`}>
                  <div className={`progress-icon ${pipelineState === 'storyboard-ready' ? 'loading' : (['media-generating', 'compiling', 'completed'].includes(pipelineState) ? 'done' : 'todo')}`}>
                    {pipelineState === 'storyboard-ready' ? '🔄' : '5'}
                  </div>
                  <div className="progress-text">
                    <h4>Duyệt & chỉnh sửa Storyboard</h4>
                    <p>Kiểm duyệt hình ảnh phác thảo cho từng cảnh, tái tạo hoặc chỉnh sửa trước khi dựng video.</p>
                  </div>
                </div>

                <div className={`progress-item ${pipelineState === 'media-generating' ? 'active' : ''}`}>
                  <div className={`progress-icon ${pipelineState === 'media-generating' ? 'loading' : (['compiling', 'completed'].includes(pipelineState) ? 'done' : 'todo')}`}>
                    {pipelineState === 'media-generating' ? '🔄' : '6'}
                  </div>
                  <div className="progress-text">
                    <h4>Tạo giọng đọc & hình ảnh/video</h4>
                    <p>ElevenLabs lồng tiếng, tạo đồ hoạ với Banana Pro hoặc clip Veo 3/Omni.</p>
                  </div>
                </div>

                <div className={`progress-item ${pipelineState === 'compiling' ? 'active' : ''}`}>
                  <div className={`progress-icon ${pipelineState === 'compiling' ? 'loading' : (pipelineState === 'completed' ? 'done' : 'todo')}`}>
                    {pipelineState === 'compiling' ? '🔄' : '7'}
                  </div>
                  <div className="progress-text">
                    <h4>Biên tập & Kết xuất video</h4>
                    <p>FFmpeg xử lý kỹ thuật ghép âm thanh, chuyển cảnh và chèn phụ đề.</p>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="error-alert" role="alert">
                  ⚠ Lỗi: {errorMsg}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Side: Script Editor & Player Preview */}
        <section className="workspace-column workspace-column-main" aria-label="Production output">
          {!competitorTranscript && !script && pipelineState !== 'completed' && (
            <div className="card empty-state">
              <span className="eyebrow">{activeInspector.eyebrow}</span>
              <h2>{activeInspector.title}</h2>
              <p>
                {activeInspector.body}
              </p>
              <ul className="inspector-checklist" aria-label="Panel readiness">
                {activeInspector.checks.map((item) => (
                  <li key={item.label} className={item.done ? 'done' : ''}>
                    <span>{item.done ? '✓' : '○'}</span>
                    <strong>{item.label}</strong>
                  </li>
                ))}
              </ul>
              <div className="empty-state-grid">
                <div>
                  <strong>Next</strong>
                  <span>Hoàn tất panel hiện tại rồi chuyển sang panel kế tiếp trong workbench.</span>
                </div>
                <div>
                  <strong>Review</strong>
                  <span>Sau khi AI tạo script, cột này sẽ chuyển thành khu vực duyệt nội dung.</span>
                </div>
                <div>
                  <strong>Export</strong>
                  <span>Video hoàn chỉnh, link tải và project Flow sẽ xuất hiện ở đây.</span>
                </div>
              </div>
            </div>
          )}

          {/* Competitor Analysis Report */}
          {competitorTranscript && (
            <div className="card">
              <h2 className="card-title">📊 Kết Quả Bóc Băng Đối Thủ</h2>
              <div className="report-grid">
                <div className="report-tile">
                  <strong>Cấu trúc dòng chảy đối thủ</strong>
                  <p>
                    {competitorFlow}
                  </p>
                </div>
                <div className="report-tile">
                  <strong>Kiểu Hook của đối thủ</strong>
                  <p>
                    {competitorHookType}
                  </p>
                </div>
                <div className="report-tile report-tile-wide">
                  <strong>Nội dung nguyên bản thoại</strong>
                  <p className="scroll-text">
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

              {pipelineState === 'script-ready' && (
                <div className="review-banner">
                  <span className="review-banner-icon">⚠️</span>
                  <div>
                    <strong>Yêu cầu phê duyệt:</strong> Vui lòng rà soát lời thoại {scriptLanguage === 'en' ? 'tiếng Anh' : 'tiếng Việt'} và prompt thiết kế hình ảnh của từng cảnh dưới đây. Bạn có thể tự do chỉnh sửa bất kỳ nội dung nào. Sau khi hoàn tất, hãy kéo xuống cuối trang và nhấn nút <strong>🎬 Duyệt Kịch Bản & Render Video</strong> để bắt đầu quá trình sản xuất.
                  </div>
                </div>
              )}
              
              <div className="script-editor-container">
                <div className="form-group">
                  <label htmlFor="script-input-title">Tiêu đề chiến dịch</label>
                  <input
                    id="script-input-title"
                    type="text"
                    className="form-input"
                    value={script.title}
                    onChange={(e) => setScript({ ...script, title: e.target.value })}
                    disabled={BUSY_PIPELINE_STATES.includes(pipelineState)}
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
                    disabled={BUSY_PIPELINE_STATES.includes(pipelineState)}
                  />
                </div>

                {selectedScene && (
                  <div className="scene-workbench">
                    <div className="scene-nav" aria-label="Scenes">
                      {script.scenes.map((scene, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className={`scene-nav-item ${selectedSceneIndex === idx ? 'active' : ''}`}
                          onClick={() => setSelectedSceneIndex(idx)}
                          aria-current={selectedSceneIndex === idx ? 'true' : undefined}
                        >
                          <span>Cảnh {scene.sceneNumber || (idx + 1)}</span>
                          <strong>{scene.durationSeconds}s</strong>
                          <small>{scene.imagePath ? 'Storyboard ready' : 'Prompt only'}</small>
                        </button>
                      ))}
                    </div>

                    <div className="scene-detail">
                      <div className="scene-header">
                        <span>CẢNH {selectedScene.sceneNumber || (selectedSceneIndex + 1)}</span>
                        <span>{selectedScene.durationSeconds} giây</span>
                      </div>

                      <div className="form-group">
                        <label htmlFor={`scene-${selectedSceneIndex}-prompt`}>Prompt thiết kế hình ảnh (Banana Pro/Veo)</label>
                        <textarea
                          id={`scene-${selectedSceneIndex}-prompt`}
                          className="form-input mono-input"
                          rows={4}
                          value={selectedScene.visualPrompt}
                          onChange={(e) => handleSceneChange(selectedSceneIndex, 'visualPrompt', e.target.value)}
                          disabled={BUSY_PIPELINE_STATES.includes(pipelineState)}
                        />
                      </div>

                      {selectedScene.imagePath && (
                        <div className="form-group">
                          <label>Hình ảnh phác thảo (Storyboard Image)</label>
                          <div className="storyboard-preview">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={selectedScene.imagePath}
                              alt={`Storyboard scene ${selectedSceneIndex + 1}`}
                            />
                            {isRegeneratingScene === selectedSceneIndex && (
                              <div className="storyboard-overlay">
                                🔄 Đang tạo lại ảnh...
                              </div>
                            )}
                          </div>
                          {pipelineState === 'storyboard-ready' && (
                            <button
                              type="button"
                              className="btn btn-secondary scene-action"
                              onClick={() => handleRegenerateSceneImage(selectedSceneIndex)}
                              disabled={isRegeneratingScene !== null}
                            >
                              🔄 Tạo lại ảnh cảnh này
                            </button>
                          )}
                        </div>
                      )}

                      <div className="form-group">
                        <label htmlFor={`scene-${selectedSceneIndex}-voice`}>Lời thoại lồng tiếng ({scriptLanguage === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'})</label>
                        <textarea
                          id={`scene-${selectedSceneIndex}-voice`}
                          className="form-input"
                          rows={4}
                          value={selectedScene.voiceoverText}
                          onChange={(e) => handleSceneChange(selectedSceneIndex, 'voiceoverText', e.target.value)}
                          disabled={BUSY_PIPELINE_STATES.includes(pipelineState)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor="script-input-cta">Lời kêu gọi CTA (Kết thúc)</label>
                  <input
                    id="script-input-cta"
                    type="text"
                    className="form-input"
                    value={script.cta}
                    onChange={(e) => setScript({ ...script, cta: e.target.value })}
                    disabled={BUSY_PIPELINE_STATES.includes(pipelineState)}
                  />
                </div>

                {!BUSY_PIPELINE_STATES.includes(pipelineState) && (
                  <div className="review-action-bar">
                    {pipelineState === 'script-ready' && (
                      <>
                        <div className="review-action-copy">
                          <strong>Duyệt kịch bản trước khi tạo hình.</strong>
                          <span>Tạo storyboard để xem từng cảnh, hoặc render trực tiếp nếu không cần bước duyệt ảnh.</span>
                        </div>
                        <div className="review-action-buttons">
                          <button
                            type="button"
                            className="btn btn-primary btn-accent"
                            onClick={handleGenerateStoryboard}
                          >
                            <span>🎨 Tạo Storyboard</span>
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={handleCompile}
                          >
                            <span>⚡ Render trực tiếp</span>
                          </button>
                        </div>
                      </>
                    )}

                    {pipelineState === 'storyboard-ready' && (
                      <>
                        <div className="review-action-copy">
                          <strong>Storyboard đã sẵn sàng để render.</strong>
                          <span>Duyệt ảnh từng cảnh bằng navigator, tái tạo ảnh nếu cần, rồi render video hoàn chỉnh.</span>
                        </div>
                        <div className="review-action-buttons">
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={handleCompile}
                          >
                            <span>🎬 Render Video</span>
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => setPipelineState('script-ready')}
                          >
                            <span>✏️ Sửa script</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Render Completed Screen */}
          {pipelineState === 'completed' && compiledVideoUrl && (
            <div className="card export-panel">
              <div className="success-banner">
                <h3>✓ ĐÃ HOÀN THÀNH VIDEO</h3>
                <p>Video được xử lý và lưu hoàn chỉnh.</p>
              </div>

              {flowProjectId && (
                <div className="flow-summary">
                  <div className="flow-summary-title">
                    <span>✦</span>
                    <strong>Đã tự động tạo dự án riêng trên Google Flow</strong>
                  </div>
                  <div className="flow-summary-row">
                    <span>Tên dự án</span>
                    <strong>{flowProjectTitle}</strong>
                  </div>
                  <div className="flow-summary-row flow-summary-row-wrap">
                    <span>ID</span>
                    <code>{flowProjectId}</code>
                    <a
                      href="https://labs.google/fx/tools/flow"
                      target="_blank"
                      rel="noopener noreferrer"
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

              <div className="export-actions">
                <a 
                  id="link-download-video"
                  href={compiledVideoUrl} 
                  download 
                  className="btn btn-primary"
                >
                  📥 Tải Video Xuống
                </a>
                <button 
                  id="btn-recreate-video"
                  className="btn" 
                  onClick={handleReset}
                  type="button"
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
              <div>
                <span className="eyebrow">System credentials</span>
                <h3>🔑 Cấu Hình API Keys</h3>
                <p>Khai báo key một lần để pipeline AI, voice và image generation hoạt động.</p>
              </div>
              <button 
                id="btn-settings-close"
                className="close-btn" 
                onClick={() => setIsSettingsOpen(false)}
                type="button"
              >
                &times;
              </button>
            </div>
            
            <form className="settings-form" onSubmit={handleSaveSettings}>
              <div className="settings-field">
                <label htmlFor="settings-gemini-key">Gemini API Key</label>
                <p>Phân tích sản phẩm, bóc băng đối thủ và viết kịch bản.</p>
                <input
                  id="settings-gemini-key"
                  type="password"
                  className="form-input"
                  placeholder="Dán Gemini API Key của bạn"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="settings-elevenlabs-key">ElevenLabs API Key</label>
                <p>Tạo voiceover chất lượng cao nếu bật ElevenLabs.</p>
                <input
                  id="settings-elevenlabs-key"
                  type="password"
                  className="form-input"
                  placeholder="Dán ElevenLabs API Key của bạn"
                  value={elevenLabsApiKey}
                  onChange={(e) => setElevenLabsApiKey(e.target.value)}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="settings-banana-key">Banana Pro API Key</label>
                <p>Tạo ảnh tĩnh và storyboard khi không dùng Flow/Veo.</p>
                <input
                  id="settings-banana-key"
                  type="password"
                  className="form-input"
                  placeholder="Dán Banana Pro API Key của bạn"
                  value={bananaApiKey}
                  onChange={(e) => setBananaApiKey(e.target.value)}
                />
              </div>

              <div className="settings-field">
                <label htmlFor="settings-banana-url">Banana Pro API URL</label>
                <p>Endpoint mặc định cho Banana Pro image generation.</p>
                <input
                  id="settings-banana-url"
                  type="text"
                  className="form-input"
                  placeholder="https://api.banana-pro.ai/v1/images/generate"
                  value={bananaApiUrl}
                  onChange={(e) => setBananaApiUrl(e.target.value)}
                />
              </div>

              <div className="modal-action-bar">
                <button
                  type="button"
                  className="btn"
                  onClick={() => setIsSettingsOpen(false)}
                >
                  Hủy
                </button>
                <button
                  id="btn-settings-save"
                  type="submit"
                  className="btn btn-primary"
                >
                  Lưu cấu hình
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
