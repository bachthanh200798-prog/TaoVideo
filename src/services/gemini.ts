import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';

// Initialize the Google Gen AI client
const getGenAIClient = (customKey?: string) => {
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured. Please add it in settings (gear icon at top-right).');
  }
  return new GoogleGenAI({ apiKey });
};

export interface Scene {
  sceneNumber: number;
  durationSeconds: number;
  visualPrompt: string;
  voiceoverText: string;
}

export interface VideoScript {
  title: string;
  targetAudience: string;
  tone: string;
  hook: string;
  scenes: Scene[];
  cta: string;
}

export interface CompetitorAnalysis {
  transcript: string;
  hookType: string;
  flowStructure: string;
  adaptedScript: VideoScript;
}

/**
 * Service to interface with Gemini 3.1 Flash Lite
 */
export const GeminiService = {
  /**
   * Scrapes product details and writes a custom video script using Gemini 3.1 Flash Lite
   */
  async generateScriptFromProduct(productName: string, productData: string, geminiKey?: string): Promise<VideoScript> {
    const ai = getGenAIClient(geminiKey);
    const prompt = `
      Bạn là một Product Designer kiêm Creative Video Scriptwriter hàng đầu.
      Hãy phân tích thông tin sản phẩm sau và viết kịch bản video quảng cáo ngắn (dưới 60 giây, khoảng 4-5 cảnh).
      
      Tên sản phẩm: ${productName}
      Thông tin cào được:
      ${productData}
      
      YÊU CẦU:
      1. Viết kịch bản bằng Tiếng Việt hấp dẫn, có sức thuyết phục cao.
      2. Kịch bản bao gồm: tiêu đề, đối tượng khách hàng mục tiêu, tone giọng kịch bản, 1 câu hook thu hút trong 3 giây đầu, 4 cảnh chi tiết (mỗi cảnh gồm mô tả hình ảnh trực quan chi tiết để đưa vào AI tạo ảnh, và lời thoại lồng tiếng ngắn gọn), câu CTA ở cuối.
      3. Định dạng đầu ra bắt buộc là JSON thuần tuý khớp với cấu trúc sau:
      {
        "title": "tiêu đề video",
        "targetAudience": "mô tả đối tượng",
        "tone": "năng động / chuyên nghiệp / hài hước...",
        "hook": "câu hook mở đầu",
        "scenes": [
          {
            "sceneNumber": 1,
            "durationSeconds": 8,
            "visualPrompt": "mô tả hình ảnh cực kỳ chi tiết bằng tiếng Anh (dành cho AI tạo ảnh như Banana Pro) giới thiệu sản phẩm",
            "voiceoverText": "lời thoại tiếng Việt ngắn gọn cho cảnh này"
          }
        ],
        "cta": "câu kêu gọi hành động cuối video"
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini did not return any script text');
    }

    return JSON.parse(text) as VideoScript;
  },

  /**
   * Transcribes a competitor audio track and adapts the script for a user's product
   */
  async analyzeCompetitorAndAdapt(
    audioFilePath: string,
    productName: string,
    productData: string,
    geminiKey?: string
  ): Promise<CompetitorAnalysis> {
    const ai = getGenAIClient(geminiKey);
    
    // Read local audio file as base64
    const audioBuffer = fs.readFileSync(audioFilePath);
    const base64Audio = audioBuffer.toString('base64');

    const prompt = `
      Bạn là một AI phân tích nội dung video đối thủ và chuyên gia chuyển đổi nội dung.
      Dưới đây là tệp âm thanh trích xuất từ video đối thủ và thông tin sản phẩm của tôi.
      
      Tên sản phẩm của tôi: ${productName}
      Thông tin sản phẩm của tôi:
      ${productData}
      
      YÊU CẦU:
      1. Hãy bóc băng (transcribe) phần âm thanh đối thủ sang Tiếng Việt.
      2. Phân tích loại Hook (thu hút sự chú ý) đối thủ đã dùng và cấu trúc dòng chảy nội dung của họ.
      3. Viết lại một kịch bản video mới cho sản phẩm của TÔI, áp dụng chính xác khung cấu trúc, nhịp điệu và tone giọng thành công của đối thủ nhưng thay đổi thông tin sản phẩm và tính năng cho phù hợp.
      4. Định dạng đầu ra bắt buộc là JSON thuần tuý khớp với cấu trúc sau:
      {
        "transcript": "nội dung bóc băng âm thanh của đối thủ",
        "hookType": "loại hook đối thủ dùng và phân tích nhanh",
        "flowStructure": "cấu trúc luồng nội dung của đối thủ",
        "adaptedScript": {
          "title": "tiêu đề video mới",
          "targetAudience": "đối tượng khách hàng mục tiêu",
          "tone": "tone giọng kịch bản tương đồng đối thủ",
          "hook": "câu hook mở đầu mới cho sản phẩm của tôi",
          "scenes": [
            {
              "sceneNumber": 1,
              "durationSeconds": 8,
              "visualPrompt": "mô tả hình ảnh cực kỳ chi tiết bằng tiếng Anh (cho AI tạo ảnh Banana Pro) tương tự bối cảnh đối thủ nhưng chứa sản phẩm của tôi",
              "voiceoverText": "lời thoại tiếng Việt ngắn gọn cho sản phẩm của tôi"
            }
          ],
          "cta": "câu kêu gọi hành động cuối video"
        }
      }
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: [
        {
          inlineData: {
            mimeType: 'audio/mp3',
            data: base64Audio
          }
        },
        {
          text: prompt
        }
      ],
      config: {
        responseMimeType: 'application/json',
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('Gemini did not return any transcription or script adaptation');
    }

    return JSON.parse(text) as CompetitorAnalysis;
  }
};
