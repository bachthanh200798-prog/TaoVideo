import { NextRequest, NextResponse } from 'next/server';
import { MediaService } from '@/services/media';

export async function GET(req: NextRequest) {
  try {
    const elevenlabsKey = req.headers.get('x-elevenlabs-key') || '';
    const voices = await MediaService.getVoices(elevenlabsKey);
    return NextResponse.json({ voices });
  } catch (error: any) {
    console.error('API /api/voices failed:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
