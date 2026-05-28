import { NextRequest, NextResponse } from 'next/server';
import { FlowBridgeService } from '@/services/flow-bridge';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { projectId, gender, age, nationality, aspectRatio } = await req.json();

    if (!projectId || !gender || !age || !nationality) {
      return NextResponse.json({ error: 'Missing projectId, gender, age, or nationality' }, { status: 400 });
    }

    FlowBridgeService.init();
    const stats = FlowBridgeService.getStats();
    if (!stats.connected) {
      return NextResponse.json({
        error: 'Google Flow Extension chưa được kết nối. Vui lòng mở trang Flow và bật Extension.'
      }, { status: 400 });
    }

    // Formulate a clean professional prompt for host generation
    const genderTerm = gender === 'Nữ' ? 'female' : gender === 'Nam' ? 'male' : 'person';
    const nationalityTerm = nationality === 'Việt Nam' 
      ? 'Vietnamese' 
      : nationality === 'Châu Á' 
        ? 'Asian' 
        : nationality === 'Hàn Quốc' 
          ? 'Korean' 
          : nationality === 'Nhật Bản' 
            ? 'Japanese' 
            : 'Western Caucasian';

    const characterPrompt = `Close-up studio portrait of a professional virtual host presenter, age ${age}, ${genderTerm}, ${nationalityTerm}, looking directly at camera, smiling, modern professional studio background, soft portrait lighting, clean face, photorealistic, highly detailed, consistent features`;

    console.log(`[FlowCharacter] Generating host portrait on Flow. Prompt: "${characterPrompt}"`);

    const activeAspectRatio = aspectRatio || '9:16'; // Portrait is better for host
    const result = await FlowBridgeService.genImage(characterPrompt, projectId, activeAspectRatio);

    return NextResponse.json({
      success: true,
      mediaId: result.mediaId,
      url: result.url
    });
  } catch (error: any) {
    console.error('API /api/flow/character failed:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
