import { NextRequest, NextResponse } from 'next/server';
import { FlowBridgeService } from '@/services/flow-bridge';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mimeType, projectId } = await req.json();

    if (!imageBase64 || !mimeType || !projectId) {
      return NextResponse.json({ error: 'Missing imageBase64, mimeType, or projectId' }, { status: 400 });
    }

    FlowBridgeService.init();
    const stats = FlowBridgeService.getStats();
    if (!stats.connected) {
      return NextResponse.json({
        error: 'Google Flow Extension chưa được kết nối. Vui lòng mở trang Flow và bật Extension.'
      }, { status: 400 });
    }

    const mediaId = await FlowBridgeService.uploadImage(imageBase64, mimeType, projectId);
    return NextResponse.json({ success: true, mediaId });
  } catch (error: any) {
    console.error('API /api/flow/upload failed:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
