import type { Scene as GeneratedScene, VideoScript as GeneratedVideoScript } from '@/services/gemini';
import type { ElevenLabsVoice } from '@/services/media';
import type { FlowBridgeStats } from '@/services/flow-bridge';

export type { ElevenLabsVoice, FlowBridgeStats };

export interface Scene extends GeneratedScene {
  imagePath?: string;
  mediaId?: string;
}

export interface VideoScript extends Omit<GeneratedVideoScript, 'scenes'> {
  scenes: Scene[];
}

export type ActiveTab = 'direct' | 'competitor';
export type VisualMode = 'images' | 'video';
export type VideoModel = 'veo-3' | 'omni';
export type ScriptLanguage = 'vi' | 'en';
export type AspectRatio = '9:16' | '16:9' | '3:4' | '1:1';
export type PipelineState =
  | 'idle'
  | 'scraping'
  | 'analyzing'
  | 'script-ready'
  | 'storyboard-ready'
  | 'media-generating'
  | 'compiling'
  | 'completed'
  | 'error';

export const DEFAULT_BANANA_API_URL = 'https://api.banana-pro.ai/v1/images/generate';
export const DEFAULT_LOCAL_VOICE = 'macos-linh';
export const DEFAULT_STORED_LOCAL_VOICE = 'local-vietnamese';
export const BUSY_PIPELINE_STATES: PipelineState[] = ['scraping', 'analyzing', 'media-generating', 'compiling'];
