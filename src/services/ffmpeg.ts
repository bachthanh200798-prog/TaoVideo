import { exec, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

const execPromise = promisify(exec);

let cachedDrawtextSupported: boolean | null = null;

function checkDrawtextSupport(): boolean {
  if (cachedDrawtextSupported !== null) return cachedDrawtextSupported;
  try {
    const stdout = execSync('ffmpeg -filters', { stdio: ['pipe', 'pipe', 'ignore'] }).toString();
    cachedDrawtextSupported = stdout.includes('drawtext');
  } catch (err) {
    cachedDrawtextSupported = false;
  }
  return cachedDrawtextSupported;
}

export interface CompileSceneInput {
  sceneNumber: number;
  visualPath: string; // Image (.jpg) or video (.mp4)
  audioPath: string;  // Voiceover (.mp3)
  durationSeconds: number;
  subtitleText: string;
}

export const FfmpegService = {
  /**
   * Compiles individual scenes and concatenates them into the final video file.
   * Returns path to the compiled final video.
   */
  async compileVideo(
    scenes: CompileSceneInput[],
    outputDir: string,
    videoFilename: string,
    subtitlesEnabled = true
  ): Promise<string> {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const tempScenePaths: string[] = [];
    const tempSubPaths: string[] = [];
    const finalOutputPath = path.join(outputDir, videoFilename);

    try {
      console.log(`Starting video compile. Scenes count: ${scenes.length}`);
      
      const hasDrawtext = subtitlesEnabled && checkDrawtextSupport();
      console.log(`[FFmpeg] Subtitles enabled: ${subtitlesEnabled}, Drawtext filter support: ${checkDrawtextSupport()}, Active subtitle burn-in: ${hasDrawtext}`);

      // Stage 1: Compile each scene to a separate temporary MP4 file
      for (const scene of scenes) {
        const tempScenePath = path.join(outputDir, `temp_scene_${scene.sceneNumber}.mp4`);
        const isVideo = scene.visualPath.endsWith('.mp4');

        let escapedTextFilePath = '';
        if (hasDrawtext) {
          const subFilename = `sub_${Date.now()}_scene_${scene.sceneNumber}.txt`;
          const subPath = path.join(outputDir, subFilename);
          fs.writeFileSync(subPath, scene.subtitleText);
          tempSubPaths.push(subPath);

          // Get relative path for FFmpeg filtergraph to prevent colon/backslash character issues
          const relativeSubPath = path.relative(process.cwd(), subPath).replace(/\\/g, '/');
          escapedTextFilePath = relativeSubPath.replace(/'/g, "'\\\\''");
        }

        // Build FFmpeg command for compiling this scene
        let cmd = '';

        if (isVideo) {
          // Visual asset is a video clip: Loop it and truncate at audio end
          // -vf scale=1920:1080 scaling to standard Full HD
          const filterChain = hasDrawtext
            ? `scale=1920:1080,drawtext=textfile='${escapedTextFilePath}':expansion=none:fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=20:x=(w-text_w)/2:y=h-180`
            : `scale=1920:1080`;
          cmd = `ffmpeg -y -stream_loop -1 -i "${scene.visualPath}" -i "${scene.audioPath}" -vf "${filterChain}" -c:v libx264 -c:a aac -b:a 192k -shortest "${tempScenePath}"`;
        } else {
          // Visual asset is a static image: Loop image for exact audio duration
          const filterChain = hasDrawtext
            ? `scale=1920:1080,zoompan=z='zoom+0.0005':d=${Math.ceil(scene.durationSeconds * 25)}:s=1920x1080,drawtext=textfile='${escapedTextFilePath}':expansion=none:fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=20:x=(w-text_w)/2:y=h-180`
            : `scale=1920:1080,zoompan=z='zoom+0.0005':d=${Math.ceil(scene.durationSeconds * 25)}:s=1920x1080`;
          cmd = `ffmpeg -y -loop 1 -i "${scene.visualPath}" -i "${scene.audioPath}" -vf "${filterChain}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -shortest -pix_fmt yuv420p -t ${scene.durationSeconds} "${tempScenePath}"`;
        }

        console.log(`Compiling Scene ${scene.sceneNumber}...`);
        await execPromise(cmd);
        tempScenePaths.push(tempScenePath);
      }

      // Stage 2: Create file list for concatenation
      const concatListPath = path.join(outputDir, 'concat_list.txt');
      const fileListContent = tempScenePaths
        .map((p) => `file '${path.resolve(p).replace(/'/g, "'\\''")}'`)
        .join('\n');
      
      fs.writeFileSync(concatListPath, fileListContent);

      // Stage 3: Concatenate scenes into final MP4
      console.log('Concatenating scenes into final video...');
      const concatCmd = `ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${finalOutputPath}"`;
      await execPromise(concatCmd);

      // Clean up temporary files
      try {
        fs.unlinkSync(concatListPath);
        for (const p of tempScenePaths) {
          if (fs.existsSync(p)) {
            fs.unlinkSync(p);
          }
        }
        for (const p of tempSubPaths) {
          if (fs.existsSync(p)) {
            fs.unlinkSync(p);
          }
        }
      } catch (err) {
        console.error('Failed to clean up temporary compilation files:', err);
      }

      console.log(`Video compilation successful. Output: ${finalOutputPath}`);
      return finalOutputPath;
    } catch (error) {
      console.error('Video compilation failed:', error);
      // Clean up whatever we can in case of failure
      for (const p of tempScenePaths) {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      }
      for (const p of tempSubPaths) {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
        }
      }
      throw error;
    }
  }
};
