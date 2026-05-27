import { NextResponse } from 'next/server';
import { FlowBridgeService } from '@/services/flow-bridge';

export async function GET() {
  try {
    // Automatically start the bridge on port 9222
    FlowBridgeService.init();
    
    // Retrieve connection status/stats
    const stats = FlowBridgeService.getStats();
    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('[FlowStatus API] Failed to initialize or get stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check Flow Bridge status' },
      { status: 500 }
    );
  }
}
