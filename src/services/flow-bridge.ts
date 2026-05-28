import { createServer, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Global reference for hot-reloads in Next.js dev mode
const globalAny = global as any;

export interface FlowUserInfo {
  email?: string;
  name?: string;
  picture?: string;
  verified_email?: boolean;
}

export interface FlowBridgeStats {
  connected: boolean;
  flowKeyPresent: boolean;
  tokenAgeS: number | null;
  pendingRequests: number;
  requestCount: number;
  successCount: number;
  failedCount: number;
  lastError: string | null;
  userInfo: FlowUserInfo | null;
}

class FlowBridge {
  private server: any = null;
  private wss: WebSocketServer | null = null;
  private wsClient: WebSocket | null = null;
  private callbackSecret: string = '';
  private flowKey: string | null = null;
  private tokenCapturedAt: number | null = null;
  private userInfo: FlowUserInfo | null = null;
  private currentProjectTitle: string = 'AutoVideo Production';
  
  private pendingRequests = new Map<string, {
    resolve: (val: any) => void;
    reject: (err: any) => void;
    timeoutTimer: NodeJS.Timeout;
  }>();

  // Stats
  private requestCount = 0;
  private successCount = 0;
  private failedCount = 0;
  private lastError: string | null = null;

  constructor() {
    this.callbackSecret = crypto.randomBytes(32).toString('hex');
  }

  public init() {
    if (this.server) return;

    console.log('[FlowBridge] Initializing bridge on port 9222...');
    
    // Create standard HTTP server
    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Callback-Secret');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // Handle HTTP callback from extension
      if (req.url === '/api/ext/callback' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          const clientSecret = req.headers['x-callback-secret'] || '';
          if (clientSecret !== this.callbackSecret) {
            console.warn('[FlowBridge] Unauthorized callback attempted');
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'unauthorized' }));
            return;
          }

          try {
            const data = JSON.parse(body);
            const resolved = this.resolveCallback(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: resolved }));
          } catch (e: any) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid json' }));
          }
        });
        return;
      }

      // Health endpoint
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.getStats()));
        return;
      }

      res.writeHead(404);
      res.end();
    });

    // Create WebSocket Server
    this.wss = new WebSocketServer({ noServer: true });

    this.server.on('upgrade', (request: any, socket: any, head: any) => {
      this.wss!.handleUpgrade(request, socket, head, (ws) => {
        this.wss!.emit('connection', ws, request);
      });
    });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[FlowBridge] Extension connected via WebSocket');
      this.wsClient = ws;
      this.lastError = null;

      // Send callback secret immediately
      ws.send(JSON.stringify({
        type: 'callback_secret',
        secret: this.callbackSecret
      }));

      ws.on('message', async (message: string) => {
        try {
          const data = JSON.parse(message);
          await this.handleMessage(data);
        } catch (e) {
          console.error('[FlowBridge] Failed to parse message:', e);
        }
      });

      ws.on('close', () => {
        console.log('[FlowBridge] Extension disconnected');
        this.clearExtension();
      });

      ws.on('error', (err) => {
        console.error('[FlowBridge] WebSocket client error:', err);
        this.lastError = err.message;
      });
    });

    this.server.listen(9222, '127.0.0.1', () => {
      console.log('[FlowBridge] Server listening on http://127.0.0.1:9222');
    });
  }

  public getStats(): FlowBridgeStats {
    const tokenAgeS = this.tokenCapturedAt
      ? Math.floor((Date.now() - this.tokenCapturedAt) / 1000)
      : null;

    return {
      connected: this.wsClient !== null && this.wsClient.readyState === WebSocket.OPEN,
      flowKeyPresent: this.flowKey !== null,
      tokenAgeS,
      pendingRequests: this.pendingRequests.size,
      requestCount: this.requestCount,
      successCount: this.successCount,
      failedCount: this.failedCount,
      lastError: this.lastError,
      userInfo: this.userInfo,
    };
  }

  private clearExtension() {
    this.wsClient = null;
    this.flowKey = null;
    this.tokenCapturedAt = null;
    this.userInfo = null;
    
    // Reject all pending requests
    for (const [id, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timeoutTimer);
      req.reject(new Error('extension_disconnected'));
    }
    this.pendingRequests.clear();
  }

  private async handleMessage(data: any) {
    const t = data.type;
    if (t === 'extension_ready') {
      console.log('[FlowBridge] Extension ready state received');
    } else if (t === 'token_captured') {
      this.flowKey = data.flowKey;
      this.tokenCapturedAt = Date.now();
      console.log('[FlowBridge] Bearer token captured');
    } else if (t === 'user_info') {
      this.userInfo = data.userInfo;
      console.log('[FlowBridge] User info updated:', this.userInfo?.email);
    } else if (data.id && (data.data || data.error || data.status)) {
      // WS response fallback
      this.resolveCallback(data);
    }
  }

  private resolveCallback(data: any): boolean {
    const id = data.id;
    if (!id || !this.pendingRequests.has(id)) return false;

    const req = this.pendingRequests.get(id)!;
    this.pendingRequests.delete(id);
    clearTimeout(req.timeoutTimer);
    const httpError = typeof data.status === 'number' && data.status >= 400;
    const explicitError = !!data.error;

    if (httpError || explicitError) {
      this.failedCount++;
      if (data.status === 401) {
        this.lastError = 'HTTP_401 (Unauthorized). Vui lòng F5 (tải lại trang) tab labs.google/fx/tools/flow trên Chrome để làm mới phiên đăng nhập và cập nhật token.';
      } else {
        const errorMsg = data.error || `HTTP_${data.status}`;
        this.lastError = typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : String(errorMsg);
      }
      req.reject(new Error(this.lastError || 'API error'));
    } else {
      this.successCount++;
      this.lastError = null;
      req.resolve(data.data || data);
    }

    return true;
  }

  private sendRequest(method: string, params: any, timeoutMs = 180000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.wsClient || this.wsClient.readyState !== WebSocket.OPEN) {
        return reject(new Error('Extension is not connected. Vui lòng mở trang Google Flow và tải Extension.'));
      }

      const id = crypto.randomUUID();
      this.requestCount++;

      const timeoutTimer = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.failedCount++;
        this.lastError = 'timeout';
        reject(new Error('API request timed out (180s)'));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeoutTimer });

      const payload = { id, method, params };
      this.wsClient.send(JSON.stringify(payload), (err) => {
        if (err) {
          clearTimeout(timeoutTimer);
          this.pendingRequests.delete(id);
          this.failedCount++;
          this.lastError = err.message;
          reject(err);
        }
      });
    });
  }

  public apiRequest(url: string, method = 'POST', headers: any = {}, body: any = null, captchaAction?: string): Promise<any> {
    const params: any = {
      url,
      method,
      headers: {
        'content-type': 'text/plain;charset=UTF-8',
        'accept': '*/*',
        ...headers
      },
      body
    };
    if (captchaAction) {
      params.captchaAction = captchaAction;
    }
    return this.sendRequest('api_request', params);
  }

  public trpcRequest(url: string, method = 'POST', headers: any = {}, body: any = null): Promise<any> {
    const params: any = {
      url,
      method,
      headers: {
        'content-type': 'application/json',
        'accept': '*/*',
        ...headers
      },
      body
    };
    return this.sendRequest('trpc_request', params, 30000);
  }

  // ─── High-Level Google Flow Methods ─────────────────────────

  public async createProject(title = 'AutoVideo Production'): Promise<string> {
    this.currentProjectTitle = title;
    const url = 'https://labs.google/fx/api/trpc/project.createProject';
    const body = { json: { projectTitle: title, toolName: 'PINHOLE' } };
    
    console.log(`[FlowBridge] Creating project: "${title}"...`);
    const resp = await this.trpcRequest(url, 'POST', {}, body);
    
    const projectId = resp?.result?.data?.json?.result?.projectId;
    if (!projectId) {
      throw new Error('Không nhận được Project ID từ Google Flow. Vui lòng mở tab Flow và kiểm tra trạng thái đăng nhập.');
    }
    console.log(`[FlowBridge] Project created successfully. Project ID: ${projectId}`);
    return projectId;
  }

  public async genImage(prompt: string, projectId: string): Promise<{ mediaId: string; url: string }> {
    const url = `https://aisandbox-pa.googleapis.com/v1/projects/${projectId}/flowMedia:batchGenerateImages`;
    const batchId = crypto.randomUUID();
    const seed = Math.floor(Math.random() * 1000000);
    
    const body = {
      clientContext: {
        clientId: 'FLOW',
        projectId,
        projectTitle: this.currentProjectTitle,
        recaptchaContext: { token: '' } // solved by extension
      },
      mediaGenerationContext: { batchId },
      useNewMedia: true,
      requests: [
        {
          seed,
          structuredPrompt: {
            parts: [{ text: prompt }]
          },
          imageAspectRatio: 'IMAGE_ASPECT_RATIO_LANDSCAPE', // 16:9 — Flow requires LANDSCAPE not SQUARE
          imageModelName: 'GEM_PIX_2'
        }
      ]
    };

    // Propagation delay: Sleep for 2.5s to let Google Flow register the new project ID
    console.log(`[FlowBridge] Waiting 2.5s for project registration to propagate...`);
    await new Promise((resolve) => setTimeout(resolve, 2500));

    let attempts = 0;
    const maxAttempts = 4;

    while (attempts < maxAttempts) {
      try {
        console.log(`[FlowBridge] Requesting image gen: "${prompt.substring(0, 50)}..." (Attempt ${attempts + 1}/${maxAttempts})`);
        const resp = await this.apiRequest(url, 'POST', {}, body, 'IMAGE_GENERATION');
        
        console.log('[FlowBridge] genImage raw response:', JSON.stringify(resp)?.substring(0, 300));

        // Extract media ID and url
        const media = resp?.media?.[0];
        const mediaId = media?.name;
        const fifeUrl = media?.image?.generatedImage?.fifeUrl;

        if (!mediaId || !fifeUrl) {
          throw new Error(`Tạo ảnh thất bại. Google trả về: ${JSON.stringify(resp?.error || resp).substring(0, 200)}`);
        }

        return { mediaId, url: fifeUrl };
      } catch (err: any) {
        attempts++;
        const isRetryable =
          err.message?.includes('HTTP_404') ||
          err.message?.includes('API_404') ||
          err.message?.includes('HTTP_400') ||
          err.message?.includes('API_400');
        if (isRetryable && attempts < maxAttempts) {
          const delay = attempts * 3000; // exponential: 3s, 6s, 9s
          console.warn(`[FlowBridge] Retryable error (${err.message?.substring(0, 60)}). Retrying in ${delay / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw err;
        }
      }
    }

    throw new Error('Tạo ảnh trên Google Flow thất bại sau nhiều lần thử.');
  }

  public async genVideo(prompt: string, projectId: string, startMediaId: string, modelName = 'veo-3'): Promise<string> {
    const url = 'https://aisandbox-pa.googleapis.com/v1/video:batchAsyncGenerateVideoStartImage';
    const batchId = crypto.randomUUID();
    const sceneId = crypto.randomUUID();
    const seed = Math.floor(Math.random() * 1000000);

    // Both Veo 3.1 variants use the same key in Flow
    const videoModelKey = 'veo_3_1_i2v_s_fast';

    const body = {
      clientContext: {
        clientId: 'FLOW',
        projectId,
        projectTitle: this.currentProjectTitle,
        recaptchaContext: { token: '' } // solved by extension
      },
      mediaGenerationContext: { batchId },
      requests: [
        {
          aspectRatio: 'VIDEO_ASPECT_RATIO_LANDSCAPE', // 16:9
          seed,
          textInput: {
            structuredPrompt: {
              parts: [{ text: prompt }]
            }
          },
          videoModelKey,
          startImage: { mediaId: startMediaId },
          metadata: { sceneId }
        }
      ],
      useV2ModelConfig: true
    };

    console.log(`[FlowBridge] Triggering video clip (${videoModelKey}) using image mediaId: ${startMediaId}...`);
    const resp = await this.apiRequest(url, 'POST', {}, body, 'VIDEO_GENERATION');

    console.log('[FlowBridge] genVideo raw response:', JSON.stringify(resp)?.substring(0, 300));

    // Extract operation name
    const opName = resp?.operations?.[0]?.operation?.name || resp?.operations?.[0]?.name;
    if (!opName) {
      throw new Error(`Không tạo được operation sinh video. Google trả về: ${JSON.stringify(resp?.error || resp).substring(0, 200)}`);
    }

    return opName;
  }

  public async pollVideoStatus(operationName: string): Promise<{ done: boolean; url?: string }> {
    const url = 'https://aisandbox-pa.googleapis.com/v1/video:batchCheckAsyncVideoGenerationStatus';
    const body = {
      clientContext: {
        clientId: 'FLOW',
        projectTitle: this.currentProjectTitle
      },
      operations: [{ operation: { name: operationName } }]
    };

    const resp = await this.apiRequest(url, 'POST', {}, body);
    const op = resp?.operations?.[0];
    const status = op?.status;
    const isDone = op?.operation?.done || op?.done || status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL' || status === 'MEDIA_GENERATION_STATUS_FAILED';
    
    if (status === 'MEDIA_GENERATION_STATUS_FAILED') {
      const err = op?.operation?.error?.message || 'MEDIA_GENERATION_STATUS_FAILED';
      throw new Error(`Google Veo generation failed: ${err}`);
    }

    if (isDone) {
      const videoMeta = op?.operation?.metadata?.video || op?.metadata?.video;
      const fifeUrl = videoMeta?.fifeUrl;
      if (fifeUrl) {
        return { done: true, url: fifeUrl };
      }
      
      // Fallback: extract UUID from servingBaseUri or servingUri
      const servingUri = videoMeta?.servingBaseUri || videoMeta?.servingUri;
      if (servingUri) {
        return { done: true, url: servingUri };
      }
    }

    return { done: false };
  }

  public async downloadAsset(fifeUrl: string, outputPath: string): Promise<string> {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    console.log(`[FlowBridge] Downloading asset from CDN: ${fifeUrl.substring(0, 60)}...`);
    const response = await axios({
      method: 'GET',
      url: fifeUrl,
      responseType: 'stream',
    });

    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);
      let error: any = null;
      writer.on('error', err => {
        error = err;
        writer.close();
        reject(err);
      });
      writer.on('close', () => {
        if (!error) {
          resolve(outputPath);
        }
      });
    });
  }
}

// Ensure the server runs as a singleton across Next.js dev reloads
if (!globalAny.flowBridgeInstance) {
  globalAny.flowBridgeInstance = new FlowBridge();
}

export const FlowBridgeService = globalAny.flowBridgeInstance as FlowBridge;
export default FlowBridgeService;
