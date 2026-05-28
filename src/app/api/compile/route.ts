import { NextRequest, NextResponse } from 'next/server';
import { MediaService } from '@/services/media';
import { FfmpegService, CompileSceneInput } from '@/services/ffmpeg';
import { FlowBridgeService } from '@/services/flow-bridge';
import * as fs from 'fs';
import * as path from 'path';

export const maxDuration = 300; // Allow 5 minutes runtime

export async function POST(req: NextRequest) {
  const tempDir = path.join(process.cwd(), 'public', 'temp');
  const outputDir = path.join(process.cwd(), 'public', 'output');

  // Create folders if they don't exist
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  try {
    const body = await req.json();
    const { script, productName, voiceId, visualMode, videoModel, useElevenLabs, subtitlesEnabled } = body;
    const isElevenLabsEnabled = useElevenLabs !== false;
    const isSubtitlesEnabled = subtitlesEnabled !== false;

    if (!script || !script.scenes || script.scenes.length === 0) {
      return NextResponse.json({ error: 'Valid script with scenes is required' }, { status: 400 });
    }

    console.log(`Starting compilation. Visual Mode: ${visualMode}, Voice ID: ${voiceId}, Use ElevenLabs: ${isElevenLabsEnabled}`);

    const geminiKey = req.headers.get('x-gemini-key') || '';
    const elevenlabsKey = req.headers.get('x-elevenlabs-key') || '';
    const bananaKey = req.headers.get('x-banana-key') || '';
    const bananaUrl = req.headers.get('x-banana-url') || '';
    const useFlowExtension = req.headers.get('x-use-flow-extension') === 'true';

    // Verify Flow Extension state if enabled
    let projectId = '';
    let projectTitle = '';
    if (useFlowExtension) {
      FlowBridgeService.init();
      const stats = FlowBridgeService.getStats();
      if (!stats.connected) {
        return NextResponse.json({
          error: 'Google Flow Extension chưa được kết nối. Vui lòng tải unpacked extension và mở trang https://labs.google/fx/tools/flow.'
        }, { status: 400 });
      }
      try {
        const cleanProduct = productName ? String(productName).trim() : '';
        const cleanScriptTitle = script.title ? String(script.title).trim() : '';
        const baseTitle = cleanScriptTitle || cleanProduct || 'AutoVideo Production';
        projectTitle = `${baseTitle} - Flow`;
        projectId = await FlowBridgeService.createProject(projectTitle);
      } catch (err: any) {
        return NextResponse.json({
          error: `Không khởi tạo được dự án Google Flow: ${err.message}`
        }, { status: 400 });
      }
    }

    const compileInputs: CompileSceneInput[] = [];
    const timestamp = Date.now();

    // Stage 1: Generate assets for each scene
    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i];
      const sceneNum = scene.sceneNumber || (i + 1);
      
      console.log(`Generating assets for Scene ${sceneNum}...`);

      // 1. Generate Voiceover Audio
      const audioFilename = `voiceover_${timestamp}_scene_${sceneNum}.mp3`;
      const audioPath = path.join(tempDir, audioFilename);
      
      // Use voiceoverText, or fallback to hook/cta for start/end scenes
      const speechText = scene.voiceoverText || scene.text || script.hook || script.cta;
      
      const { audioPath: generatedAudioPath, durationSeconds } = await MediaService.generateSpeech(
        speechText,
        isElevenLabsEnabled ? (voiceId || 'macos-linh') : (voiceId?.startsWith('macos-') ? voiceId : 'macos-linh'),
        audioPath,
        isElevenLabsEnabled ? elevenlabsKey : ''
      );

      // 2. Generate Visual Asset (Image or Video)
      let visualPath = '';
      const visualPrompt = scene.visualPrompt || `Product scene for ${script.title}`;

      if (useFlowExtension) {
        if (visualMode === 'video') {
          const videoFilename = `clip_${timestamp}_scene_${sceneNum}.mp4`;
          const destVideoPath = path.join(tempDir, videoFilename);
          
          console.log(`[FlowBridge] Generating video for Scene ${sceneNum} via Flow...`);
          try {
            // Veo 3.1 is image-to-video in Flow, so generate starting image first
            const imgResult = await FlowBridgeService.genImage(visualPrompt, projectId);
            const opName = await FlowBridgeService.genVideo(visualPrompt, projectId, imgResult.mediaId, videoModel || 'veo-3');
            
            // Poll for completion
            let videoUrl = '';
            let pollAttempts = 0;
            const maxPollAttempts = 40; // ~2 minutes max
            while (pollAttempts < maxPollAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 3000));
              const pollResult = await FlowBridgeService.pollVideoStatus(opName, projectId);
              if (pollResult.done) {
                if (pollResult.url) {
                  videoUrl = pollResult.url;
                  break;
                } else {
                  throw new Error('Video generation succeeded but URL was empty');
                }
              }
              pollAttempts++;
            }
            
            if (!videoUrl) {
              throw new Error('Timeout waiting for video generation in Google Flow');
            }
            
            await FlowBridgeService.downloadAsset(videoUrl, destVideoPath);
            visualPath = destVideoPath;
          } catch (err: any) {
            console.error(`[FlowBridge] Flow video generation failed for Scene ${sceneNum}:`, err);
            throw new Error(`Tạo video bằng Google Flow thất bại ở Cảnh ${sceneNum}: ${err.message}`);
          }
        } else {
          // Image mode
          const imageFilename = `image_${timestamp}_scene_${sceneNum}.jpg`;
          const destImagePath = path.join(tempDir, imageFilename);
          
          console.log(`[FlowBridge] Generating image for Scene ${sceneNum} via Flow...`);
          try {
            const imgResult = await FlowBridgeService.genImage(visualPrompt, projectId);
            await FlowBridgeService.downloadAsset(imgResult.url, destImagePath);
            visualPath = destImagePath;
          } catch (err: any) {
            console.error(`[FlowBridge] Flow image generation failed for Scene ${sceneNum}:`, err);
            throw new Error(`Tạo ảnh bằng Google Flow thất bại ở Cảnh ${sceneNum}: ${err.message}`);
          }
        }
      } else {
        if (visualMode === 'video') {
          const videoFilename = `clip_${timestamp}_scene_${sceneNum}.mp4`;
          const destVideoPath = path.join(tempDir, videoFilename);
          
          visualPath = await MediaService.generateVideoClip(
            visualPrompt,
            videoModel || 'veo-3',
            destVideoPath,
            geminiKey,
            bananaKey,
            bananaUrl
          );
        } else {
          // Default to images (Banana Pro)
          const imageFilename = `image_${timestamp}_scene_${sceneNum}.jpg`;
          const destImagePath = path.join(tempDir, imageFilename);
          
          visualPath = await MediaService.generateImage(
            visualPrompt,
            destImagePath,
            geminiKey,
            bananaKey,
            bananaUrl
          );
        }
      }

      // Add to compiler inputs
      compileInputs.push({
        sceneNumber: sceneNum,
        visualPath,
        audioPath: generatedAudioPath,
        durationSeconds,
        subtitleText: speechText
      });
    }

    // Stage 2: Compile all scenes into a single video file
    const finalFilename = `production_${timestamp}.mp4`;
    console.log(`Compiling final video: ${finalFilename}...`);
    
    const finalVideoPath = await FfmpegService.compileVideo(
      compileInputs,
      outputDir,
      finalFilename,
      isSubtitlesEnabled
    );

    // Clean up temporary assets (images, audio) to save disk space
    try {
      for (const input of compileInputs) {
        if (fs.existsSync(input.visualPath)) fs.unlinkSync(input.visualPath);
        if (fs.existsSync(input.audioPath)) fs.unlinkSync(input.audioPath);
      }
    } catch (cleanErr) {
      console.warn('Failed to clean up some temporary assets:', cleanErr);
    }

    // Return the relative URL so the frontend can play/download it
    const videoUrl = `/output/${finalFilename}`;
    console.log(`Compilation complete! Video URL: ${videoUrl}`);

    return NextResponse.json({
      success: true,
      videoUrl,
      videoPath: finalVideoPath,
      projectId,
      projectTitle
    });
  } catch (error: any) {
    console.error('API /api/compile failed:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
