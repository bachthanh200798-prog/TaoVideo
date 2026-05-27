import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import { GoogleGenAI } from '@google/genai';

const execPromise = promisify(exec);

let cachedDrawtextSupported: boolean | null = null;
function checkDrawtextSupport(): boolean {
  if (cachedDrawtextSupported !== null) return cachedDrawtextSupported;
  try {
    const stdout = execSync('ffmpeg -filters', { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    cachedDrawtextSupported = stdout.includes('drawtext');
  } catch {
    cachedDrawtextSupported = false;
  }
  return cachedDrawtextSupported;
}

const getGenAIClient = (customKey?: string) => {
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  preview_url: string;
}

export const MediaService = {
  /**
   * Retrieves available voices from ElevenLabs.
   * If key is missing or request fails, returns a default mock list including local macOS voices.
   */
  async getVoices(elevenlabsKey?: string): Promise<ElevenLabsVoice[]> {
    const apiKey = elevenlabsKey || process.env.ELEVENLABS_API_KEY;
    
    if (apiKey && apiKey !== 'YOUR_ELEVENLABS_API_KEY') {
      try {
        const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
          headers: { 'xi-api-key': apiKey }
        });
        return response.data.voices.map((v: any) => ({
          voice_id: v.voice_id,
          name: v.name,
          category: v.category,
          preview_url: v.preview_url
        }));
      } catch (err: any) {
        console.error('Failed to fetch ElevenLabs voices, falling back:', err.message);
      }
    }

    // Fallback/Mock list of voices (including macOS native voices)
    return [
      { voice_id: 'macos-linh', name: 'Linh (macOS Vietnamese Female)', category: 'local', preview_url: '' },
      { voice_id: 'macos-lan', name: 'Lan (macOS Vietnamese Female)', category: 'local', preview_url: '' },
      { voice_id: 'eleven-rachel', name: 'Rachel (ElevenLabs standard)', category: 'premade', preview_url: 'https://api.elevenlabs.io/v1/voices/21m00Tcm4TlvDq8ikWAM/previews' },
      { voice_id: 'eleven-domi', name: 'Domi (ElevenLabs standard)', category: 'premade', preview_url: 'https://api.elevenlabs.io/v1/voices/AZnzlk1XvdvUeBnXmlld/previews' }
    ];
  },

  /**
   * Generates a voiceover audio file using ElevenLabs or macOS native 'say' as fallback.
   * Returns path to audio file and duration in seconds.
   */
  async generateSpeech(
    text: string,
    voiceId: string,
    outputPath: string,
    elevenlabsKey?: string
  ): Promise<{ audioPath: string; durationSeconds: number }> {
    const apiKey = elevenlabsKey || process.env.ELEVENLABS_API_KEY;
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check if we should use macOS local TTS fallback
    const useLocalTTS = !apiKey || apiKey === 'YOUR_ELEVENLABS_API_KEY' || voiceId.startsWith('macos-');

    if (useLocalTTS) {
      console.log(`Using macOS local speech synthesis for Vietnamese: "${text.substring(0, 30)}..."`);
      try {
        // AIFF temporary file path
        const tempAiffPath = outputPath.replace('.mp3', '.aiff');
        
        // Select macOS voice (default to Linh for Vietnamese)
        let macVoice = 'Linh';
        if (voiceId === 'macos-lan') macVoice = 'Lan';

        // Run 'say' command on Mac
        await execPromise(`say -v ${macVoice} -o "${tempAiffPath}" "${text.replace(/"/g, '\\"')}"`);
        
        // Convert AIFF to MP3 using local FFmpeg
        await execPromise(`ffmpeg -y -i "${tempAiffPath}" -codec:a libmp3lame -qscale:a 2 "${outputPath}"`);
        
        // Clean up temporary AIFF file
        if (fs.existsSync(tempAiffPath)) {
          fs.unlinkSync(tempAiffPath);
        }

        // Get duration using ffprobe
        const { stdout } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`);
        const duration = parseFloat(stdout.trim()) || 5.0;

        return { audioPath: outputPath, durationSeconds: duration };
      } catch (err: any) {
        console.error('macOS local TTS failed, creating mock silent audio:', err);
        return this.generateMockAudio(outputPath);
      }
    }

    // ElevenLabs generation
    try {
      console.log(`Calling ElevenLabs API for voice ${voiceId}...`);
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        },
        {
          headers: { 'xi-api-key': apiKey },
          responseType: 'arraybuffer'
        }
      );

      fs.writeFileSync(outputPath, response.data);

      // Get duration via ffprobe
      const { stdout } = await execPromise(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`);
      const duration = parseFloat(stdout.trim()) || 5.0;

      return { audioPath: outputPath, durationSeconds: duration };
    } catch (err: any) {
      console.error('ElevenLabs API failed, falling back to local TTS:', err.message);
      // Fallback to local macOS voice
      return this.generateSpeech(text, 'macos-linh', outputPath, elevenlabsKey);
    }
  },

  /**
   * Generates a static image using Google Imagen 3 (Google nano banana pro) or Banana Pro API fallback
   */
  async generateImage(
    prompt: string,
    outputPath: string,
    geminiKey?: string,
    bananaKey?: string,
    bananaUrlOverride?: string
  ): Promise<string> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 1. Google Gen AI - Imagen 3 (Google nano banana pro)
    const client = getGenAIClient(geminiKey);
    if (client) {
      try {
        console.log(`Calling Google Imagen 3 (Google nano banana pro) for prompt: "${prompt.substring(0, 40)}..."`);
        const response = await client.models.generateImages({
          model: 'imagen-3.0-generate-002',
          prompt: prompt,
          config: {
            numberOfImages: 1,
            aspectRatio: '1:1',
          },
        });
        
        if (response?.generatedImages && response.generatedImages.length > 0) {
          const imgBytes = response.generatedImages[0]?.image?.imageBytes;
          if (imgBytes) {
            fs.writeFileSync(outputPath, Buffer.from(imgBytes, 'base64'));
            return outputPath;
          }
        }
      } catch (err: any) {
        console.error('Google Imagen 3 (Google nano banana pro) failed, trying Banana Pro:', err.message);
      }
    }

    // 2. Banana Pro API Fallback
    const apiKey = bananaKey || process.env.BANANA_PRO_API_KEY;
    const apiUrl = bananaUrlOverride || process.env.BANANA_PRO_API_URL || 'https://api.banana-pro.ai/v1/images/generate';

    if (apiKey && apiKey !== 'YOUR_BANANA_PRO_API_KEY') {
      try {
        console.log(`Calling Banana Pro Image API for prompt: "${prompt.substring(0, 40)}..."`);
        const response = await axios.post(
          apiUrl,
          {
            prompt: prompt,
            model: 'banana-pro',
            width: 1024,
            height: 1024
          },
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            responseType: 'arraybuffer'
          }
        );

        fs.writeFileSync(outputPath, response.data);
        return outputPath;
      } catch (err: any) {
        console.error('Banana Pro Image Gen failed, using local placeholder:', err.message);
      }
    }

    // Fallback: Generate a stylized placeholder image using FFmpeg canvas text
    console.log(`Generating local image placeholder for prompt: "${prompt.substring(0, 40)}..."`);
    const tempTextPath = outputPath.replace('.jpg', '_prompt.txt');
    const hasDrawtext = checkDrawtextSupport();
    try {
      const randomColor = ['0x1a1a2e', '0x16213e', '0x0f3460', '0x1f4068', '0x321f28'][Math.floor(Math.random() * 5)];
      
      let cmd = '';
      if (hasDrawtext) {
        const textContent = `Banana Pro Image Placeholder\n\nPrompt: ${prompt.substring(0, 120)}...`;
        fs.writeFileSync(tempTextPath, textContent);
        cmd = `ffmpeg -y -f lavfi -i color=c=${randomColor}:s=1024x1024:d=1 -vf "drawtext=textfile='${tempTextPath}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2" -vframes 1 "${outputPath}"`;
      } else {
        // Plain solid color fallback without drawtext
        cmd = `ffmpeg -y -f lavfi -i color=c=${randomColor}:s=1024x1024:d=1 -vframes 1 "${outputPath}"`;
      }
      
      await execPromise(cmd);
      return outputPath;
    } catch (err) {
      console.error('Failed to render local image placeholder:', err);
      // Create empty file
      fs.writeFileSync(outputPath, '');
      return outputPath;
    } finally {
      if (fs.existsSync(tempTextPath)) {
        try {
          fs.unlinkSync(tempTextPath);
        } catch (unlinkErr) {
          console.warn('Failed to delete temporary prompt text file:', unlinkErr);
        }
      }
    }
  },

  /**
   * Generates a 4-second video clip using Veo 3 / Omni or local FFmpeg animation fallback
   */
  async generateVideoClip(
    prompt: string,
    modelName: 'veo-3' | 'omni',
    outputPath: string,
    geminiKey?: string,
    bananaKey?: string,
    bananaUrlOverride?: string
  ): Promise<string> {
    const client = getGenAIClient(geminiKey);
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (client) {
      try {
        console.log(`Calling Google GenAI SDK for video generation (${modelName}): "${prompt.substring(0, 45)}..."`);
        const modelId = modelName === 'veo-3' ? 'veo-3.1-generate-001' : 'gemini-omni-flash';
        
        // Call the official video generation API in SDK
        const operation = await (client.models as any).generateVideos({
          model: modelId,
          prompt: prompt,
          config: {
            durationSeconds: 4,
            aspectRatio: '16:9'
          }
        });

        // Wait for the long-running generation operation to complete
        const result = await operation.waitForResult();
        const videoBuffer = result?.generatedVideos?.[0]?.video?.data;
        if (videoBuffer) {
          fs.writeFileSync(outputPath, Buffer.from(videoBuffer, 'base64'));
          return outputPath;
        }
      } catch (err: any) {
        console.error(`Google Video Generation (${modelName}) failed, using local fallback:`, err.message);
      }
    }

    // Fallback: Generate a zooming panning video clip from a placeholder image using FFmpeg
    console.log(`Generating local video clip fallback for prompt: "${prompt.substring(0, 45)}..."`);
    try {
      const tempImgPath = outputPath.replace('.mp4', '_temp.jpg');
      await this.generateImage(`Video scene showing: ${prompt}`, tempImgPath, bananaKey, bananaUrlOverride);
      
      // Render a zooming pan clip of 4 seconds from the image using FFmpeg
      const cmd = `ffmpeg -y -loop 1 -i "${tempImgPath}" -vf "scale=1920:1080,zoompan=z='zoom+0.001':d=100:s=1920x1080" -c:v libx264 -t 4 -pix_fmt yuv420p "${outputPath}"`;
      await execPromise(cmd);
      
      if (fs.existsSync(tempImgPath)) {
        fs.unlinkSync(tempImgPath);
      }
      return outputPath;
    } catch (err) {
      console.error('Failed to create local video clip:', err);
      fs.writeFileSync(outputPath, '');
      return outputPath;
    }
  },

  // Helper to generate a 5-second silence MP3
  async generateMockAudio(outputPath: string): Promise<{ audioPath: string; durationSeconds: number }> {
    try {
      await execPromise(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 5 -qscale:a 9 -codec:a libmp3lame "${outputPath}"`);
      return { audioPath: outputPath, durationSeconds: 5.0 };
    } catch (err) {
      fs.writeFileSync(outputPath, '');
      return { audioPath: outputPath, durationSeconds: 5.0 };
    }
  }
};
