import { NextRequest, NextResponse } from 'next/server';
import { MediaService } from '@/services/media';
import { FlowBridgeService } from '@/services/flow-bridge';
import * as fs from 'fs';
import * as path from 'path';

export const maxDuration = 300; // Allow 5 minutes runtime

export async function POST(req: NextRequest) {
  const tempDir = path.join(process.cwd(), 'public', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    const body = await req.json();
    const { scenes, scriptTitle, useFlowExtension, projectId, geminiKey, bananaKey, bananaUrl, aspectRatio, refMediaIds } = body;

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ error: 'Scenes are required' }, { status: 400 });
    }

    console.log(`Starting storyboard image generation for ${scenes.length} scenes. Flow: ${useFlowExtension}`);

    const activeAspectRatio = aspectRatio || '16:9';
    const timestamp = Date.now();
    const updatedScenes = [];

    // Initialize Flow if enabled
    if (useFlowExtension && projectId) {
      FlowBridgeService.init();
    }

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const sceneNum = scene.sceneNumber || (i + 1);
      const visualPrompt = scene.visualPrompt || `Scene ${sceneNum} for ${scriptTitle}`;
      const imageFilename = `storyboard_${timestamp}_scene_${sceneNum}.jpg`;
      const destImagePath = path.join(tempDir, imageFilename);

      let imagePath = '';
      if (useFlowExtension && projectId) {
        try {
          const imgResult = await FlowBridgeService.genImage(visualPrompt, projectId, activeAspectRatio, refMediaIds || []);
          await FlowBridgeService.downloadAsset(imgResult.url, destImagePath);
          imagePath = `/temp/${imageFilename}`;
        } catch (err: any) {
          console.error(`Flow image generation failed for Scene ${sceneNum}:`, err);
          throw new Error(`Tạo ảnh Storyboard bằng Google Flow thất bại ở Cảnh ${sceneNum}: ${err.message}`);
        }
      } else {
        await MediaService.generateImage(
          visualPrompt,
          destImagePath,
          activeAspectRatio === '9:16' ? '9:16' : activeAspectRatio === '1:1' ? '1:1' : activeAspectRatio === '3:4' ? '3:4' : '16:9',
          geminiKey,
          bananaKey,
          bananaUrl
        );
        imagePath = `/temp/${imageFilename}`;
      }

      updatedScenes.push({
        ...scene,
        imagePath
      });
    }

    return NextResponse.json({ success: true, scenes: updatedScenes });
  } catch (error: any) {
    console.error('API /api/storyboard failed:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
