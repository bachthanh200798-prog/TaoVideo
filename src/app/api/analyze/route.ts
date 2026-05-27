import { NextRequest, NextResponse } from 'next/server';
import { ScraperService } from '@/services/scraper';
import { GeminiService } from '@/services/gemini';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execPromise = promisify(exec);

export const maxDuration = 300; // Allow long runtime (5 minutes) for downloads and API calls

export async function POST(req: NextRequest) {
  const tempDir = path.join(process.cwd(), 'public', 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  try {
    const formData = await req.formData();
    const productName = formData.get('productName') as string || 'Sản phẩm mới';
    const productUrl = formData.get('productUrl') as string || '';
    const competitorUrl = formData.get('competitorUrl') as string || '';
    const file = formData.get('competitorFile') as File | null;

    if (!productUrl) {
      return NextResponse.json({ error: 'Product URL is required' }, { status: 400 });
    }

    console.log(`Processing analyze request. Product: "${productName}", URL: ${productUrl}`);

    // Step 1: Scrape product page
    let productData = '';
    try {
      productData = await ScraperService.scrapeProductPage(productUrl);
    } catch (scrapeErr: any) {
      console.warn('Scraping product page failed, using product name context only:', scrapeErr.message);
      productData = `Tên sản phẩm: ${productName}\nURL: ${productUrl}`;
    }

    let competitorAudioPath = '';

    // Step 2: Handle competitor video/audio input if provided
    if (file && file.size > 0) {
      console.log('Processing uploaded competitor video file...');
      const buffer = Buffer.from(await file.arrayBuffer());
      const tempVideoPath = path.join(tempDir, `competitor_upload_${Date.now()}${path.extname(file.name)}`);
      fs.writeFileSync(tempVideoPath, buffer);
      
      competitorAudioPath = path.join(tempDir, `competitor_audio_${Date.now()}.mp3`);
      
      try {
        // Extract audio from uploaded video
        await execPromise(`ffmpeg -y -i "${tempVideoPath}" -q:a 2 -map a "${competitorAudioPath}"`);
      } catch (ffmpegErr: any) {
        console.error('Failed to extract audio from video file:', ffmpegErr);
        throw new Error('Could not extract audio from uploaded competitor video.');
      } finally {
        // Clean up video file
        if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
      }
    } else if (competitorUrl) {
      console.log(`Downloading audio from competitor URL: ${competitorUrl}`);
      competitorAudioPath = path.join(tempDir, `competitor_audio_${Date.now()}.mp3`);
      
      try {
        // Use yt-dlp to download only audio track as MP3
        // -x: extract audio, --audio-format: mp3, -o: output template
        await execPromise(`yt-dlp -x --audio-format mp3 -o "${competitorAudioPath.replace('.mp3', '.%(ext)s')}" "${competitorUrl}"`);
        
        // yt-dlp might append extension based on format, so let's verify file path
        if (!fs.existsSync(competitorAudioPath)) {
          // Find any file starting with competitor_audio_ and ending with .mp3
          const files = fs.readdirSync(tempDir);
          const foundFile = files.find(f => f.startsWith('competitor_audio_') && f.endsWith('.mp3'));
          if (foundFile) {
            competitorAudioPath = path.join(tempDir, foundFile);
          } else {
            throw new Error('yt-dlp finished but MP3 file was not found.');
          }
        }
      } catch (ytdlErr: any) {
        console.error('Failed to download competitor video/audio:', ytdlErr);
        throw new Error('Could not fetch or download competitor video from link. Please make sure the link is public.');
      }
    }

    // Step 3: Run AI analysis and script generation
    const geminiKey = req.headers.get('x-gemini-key') || '';
    let result;
    if (competitorAudioPath && fs.existsSync(competitorAudioPath)) {
      console.log('Running competitor analysis and script adaptation...');
      try {
        const analysis = await GeminiService.analyzeCompetitorAndAdapt(
          competitorAudioPath,
          productName,
          productData,
          geminiKey
        );
        result = {
          mode: 'adapted',
          analysis
        };
      } finally {
        // Clean up temporary audio file
        if (fs.existsSync(competitorAudioPath)) fs.unlinkSync(competitorAudioPath);
      }
    } else {
      console.log('Generating script directly from product data...');
      const script = await GeminiService.generateScriptFromProduct(productName, productData, geminiKey);
      result = {
        mode: 'direct',
        script
      };
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('API /api/analyze failed:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
