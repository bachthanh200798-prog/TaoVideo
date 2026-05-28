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
  async generateScriptFromProduct(
    productName: string,
    productData: string,
    language: 'vi' | 'en' = 'vi',
    productImageData?: { base64: string; mimeType: string } | null,
    characterData?: { name: string; desc: string } | null,
    geminiKey?: string
  ): Promise<VideoScript> {
    const ai = getGenAIClient(geminiKey);
    const prompt = `
      Bạn là một Product Designer kiêm Creative Video Scriptwriter hàng đầu, có tư duy của một Đạo diễn Video (Video Director) và Đạo diễn Hình ảnh (DoP) chuyên nghiệp.
      Hãy phân tích thông tin sản phẩm sau và viết kịch bản video quảng cáo ngắn (dưới 60 giây, khoảng 4-5 cảnh).
      
      Tên sản phẩm: ${productName}
      Thông tin cào được:
      ${productData}
      
      YÊU CẦU:
      1. Viết kịch bản bằng ${language === 'en' ? 'Tiếng Anh (English)' : 'Tiếng Việt (Vietnamese)'} hấp dẫn, có sức thuyết phục cao.
      2. Kịch bản bao gồm: tiêu đề, đối tượng khách hàng mục tiêu, tone giọng kịch bản, 1 câu hook thu hút trong 3 giây đầu, 4 cảnh chi tiết (mỗi cảnh gồm mô tả hình ảnh trực quan chi tiết để đưa vào AI tạo ảnh/video, và lời thoại lồng tiếng ngắn gọn), câu CTA ở cuối.
      3. ${productImageData ? 'ĐÂY LÀ ẢNH THỰC TẾ SẢN PHẨM ĐƯỢC ĐÍNH KÈM. Hãy phân tích kỹ hình dạng, màu sắc, logo, tỷ lệ của sản phẩm trong ảnh này. Trong phần mô tả "visualPrompt" của mỗi cảnh, hãy đưa mô tả chi tiết đặc tả này vào làm chủ thể chính để các AI tạo hình ảnh (như Banana Pro/Veo 3) vẽ chính xác sản phẩm của bạn, tuyệt đối không được tự ý sửa đổi hoặc làm méo mó sản phẩm thực tế.' : ''}
      4. ${characterData ? `DỰ ÁN CÓ NHÂN VẬT ĐẠI DIỆN TÊN LÀ: "${characterData.name}". Mô tả ngoại hình/phong cách nhân vật: "${characterData.desc}". Hãy tích hợp nhân vật này vào kịch bản của bạn. Trong phần mô tả "visualPrompt" của mỗi cảnh, nhân vật "${characterData.name}" phải xuất hiện làm MC/người dẫn dắt hoặc người trải nghiệm sản phẩm thực tế, sử dụng mô tả ngoại hình "${characterData.desc}" để tạo tính nhất quán tuyệt đối về nhân vật qua mọi cảnh quay.` : ''}
      5. Định dạng đầu ra bắt buộc là JSON thuần tuý khớp với cấu trúc sau:
      {
        "title": "tiêu đề video bằng ${language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}",
        "targetAudience": "mô tả đối tượng bằng ${language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}",
        "tone": "năng động / chuyên nghiệp / hài hước...",
        "hook": "câu hook mở đầu bằng ${language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}",
        "scenes": [
          {
            "sceneNumber": 1,
            "durationSeconds": 8,
            "visualPrompt": "Viết prompt tiếng Anh cực kỳ chi tiết cho AI sinh ảnh/video (như Banana Pro/Veo 3) dưới góc nhìn của một Video Director & DoP chuyên nghiệp. Yêu cầu giữ nguyên sản phẩm (Product Fidelity): Mô tả chi tiết hình dáng, màu sắc gốc, logo thương hiệu, tỷ lệ kích thước và các chi tiết đặc trưng của sản phẩm, đảm bảo sản phẩm xuất hiện đồng nhất tuyệt đối giữa các cảnh, không bị biến dạng hay méo mó hình học (maintain exact shape, colors, brand logo, proportions, and design details across scenes, absolute product consistency, no warping or generic modifications). Phong cách: Đời sống thực tế (real-life, documentary, lifestyle), màu sắc tự nhiên trung thực (natural colors, organic tones, true-to-life), tuyệt đối tránh kiểu giả tạo AI (avoid high contrast, plastic/waxy textures, oversaturated colors, neon bloom, generic 3D/CGI render, digital art look). Chuyển động: Chân thực, mượt mà chuẩn TVC thương hiệu (slow panning, subtle handheld camera shake, cinematic dolly zoom, tracking shot), chuyển động vật lý tự nhiên hợp lý, không phi vật lý. Góc máy: Close-up, medium shot, extreme close-up showing fine texture of the product (leather, metallic edges, glass, water droplets). Ánh sáng & Thiết bị: Soft natural light, side lighting, diffuse shadows, shot on 35mm lens, shallow depth of field, sharp focus, natural film grain.",
            "voiceoverText": "lời thoại bằng ${language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'} ngắn gọn cho cảnh này"
          }
        ],
        "cta": "câu kêu gọi hành động bằng ${language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'} cuối video"
      }
    `;

    const contents: any[] = [];
    if (productImageData) {
      contents.push({
        inlineData: {
          mimeType: productImageData.mimeType,
          data: productImageData.base64
        }
      });
    }
    contents.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: contents,
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
    language: 'vi' | 'en' = 'vi',
    productImageData?: { base64: string; mimeType: string } | null,
    characterData?: { name: string; desc: string } | null,
    geminiKey?: string
  ): Promise<CompetitorAnalysis> {
    const ai = getGenAIClient(geminiKey);
    
    // Read local audio file as base64
    const audioBuffer = fs.readFileSync(audioFilePath);
    const base64Audio = audioBuffer.toString('base64');

    const prompt = `
      Bạn là một AI phân tích nội dung video đối thủ và chuyên gia chuyển đổi nội dung, sở hữu tư duy của một Đạo diễn Video (Video Director) và Đạo diễn Hình ảnh (DoP) chuyên nghiệp.
      Dưới đây là tệp âm thanh trích xuất từ video đối thủ và thông tin sản phẩm của tôi.
      
      Tên sản phẩm của tôi: ${productName}
      Thông tin sản phẩm của tôi:
      ${productData}
      
      YÊU CẦU:
      1. Hãy bóc băng (transcribe) phần âm thanh đối thủ sang ${language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}.
      2. Phân tích loại Hook (thu hút sự chú ý) đối thủ đã dùng và cấu trúc dòng chảy nội dung của họ.
      3. Viết lại một kịch bản video mới cho sản phẩm của TÔI bằng ${language === 'en' ? 'Tiếng Anh (English)' : 'Tiếng Việt (Vietnamese)'}, áp dụng chính xác khung cấu trúc, nhịp điệu và tone giọng thành công của đối thủ nhưng thay đổi thông tin sản phẩm và tính năng cho phù hợp.
      4. ${productImageData ? 'ĐÂY LÀ ẢNH THỰC TẾ SẢN PHẨM ĐƯỢC ĐÍNH KÈM. Hãy phân tích kỹ hình dạng, màu sắc, logo, tỷ lệ của sản phẩm trong ảnh này. Trong phần mô tả "visualPrompt" của mỗi cảnh, hãy đưa mô tả chi tiết đặc tả này vào làm chủ thể chính để các AI tạo hình ảnh (như Banana Pro/Veo 3) vẽ chính xác sản phẩm của bạn, tuyệt đối không được tự ý sửa đổi hoặc làm méo mó sản phẩm thực tế.' : ''}
      5. ${characterData ? `DỰ ÁN CÓ NHÂN VẬT ĐẠI DIỆN TÊN LÀ: "${characterData.name}". Mô tả ngoại hình/phong cách nhân vật: "${characterData.desc}". Hãy tích hợp nhân vật này vào kịch bản của bạn. Trong phần mô tả "visualPrompt" của mỗi cảnh, nhân vật "${characterData.name}" phải xuất hiện làm MC/người dẫn dắt hoặc người trải nghiệm sản phẩm thực tế, sử dụng mô tả ngoại hình "${characterData.desc}" để tạo tính nhất quán tuyệt đối về nhân vật qua mọi cảnh quay.` : ''}
      6. Định dạng đầu ra bắt buộc là JSON thuần tuý khớp với cấu trúc sau:
      {
        "transcript": "nội dung bóc băng âm thanh của đối thủ bằng ${language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}",
        "hookType": "loại hook đối thủ dùng và phân tích nhanh",
        "flowStructure": "cấu trúc luồng nội dung của đối thủ",
        "adaptedScript": {
          "title": "tiêu đề video mới bằng ${language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}",
          "targetAudience": "đối tượng khách hàng mục tiêu bằng ${language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}",
          "tone": "tone giọng kịch bản tương đồng đối thủ",
          "hook": "câu hook mở đầu mới cho sản phẩm của tôi bằng ${language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'}",
          "scenes": [
            {
              "sceneNumber": 1,
              "durationSeconds": 8,
              "visualPrompt": "Viết prompt tiếng Anh cực kỳ chi tiết cho AI sinh ảnh/video (như Banana Pro/Veo 3) tương tự bối cảnh đối thủ nhưng chứa sản phẩm của tôi, dưới góc nhìn của một Video Director & DoP chuyên nghiệp. Yêu cầu giữ nguyên sản phẩm (Product Fidelity): Mô tả chi tiết hình dáng, màu sắc gốc, logo thương hiệu, tỷ lệ kích thước và các chi tiết đặc trưng của sản phẩm, đảm bảo sản phẩm xuất hiện đồng nhất tuyệt đối giữa các cảnh, không bị biến dạng hay méo mó hình học (maintain exact shape, colors, brand logo, proportions, and design details across scenes, absolute product consistency, no warping or generic modifications). Phong cách: Đời sống thực tế (real-life, documentary, lifestyle), màu sắc tự nhiên trung thực (natural colors, organic tones, true-to-life), tuyệt đối tránh kiểu giả tạo AI (avoid high contrast, plastic/waxy textures, oversaturated colors, neon bloom, generic 3D/CGI render, digital art look). Chuyển động: Chân thực, mượt mà chuẩn TVC thương hiệu (slow panning, subtle handheld camera shake, dolly tracking shot, slow dynamic zoom-in), chuyển động vật lý tự nhiên hợp lý, không phi vật lý. Góc máy: Close-up, medium shot, extreme close-up showing fine texture of the product (leather, metallic edges, glass, water droplets). Ánh sáng & Thiết bị: Soft natural light, side lighting, diffuse shadows, shot on 35mm lens, shallow depth of field, sharp focus, natural film grain.",
              "voiceoverText": "lời thoại bằng ${language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'} ngắn gọn cho sản phẩm của tôi"
            }
          ],
          "cta": "câu kêu gọi hành động bằng ${language === 'en' ? 'Tiếng Anh' : 'Tiếng Việt'} cuối video"
        }
      }
    `;

    const contents: any[] = [
      {
        inlineData: {
          mimeType: 'audio/mp3',
          data: base64Audio
        }
      }
    ];
    if (productImageData) {
      contents.push({
        inlineData: {
          mimeType: productImageData.mimeType,
          data: productImageData.base64
        }
      });
    }
    contents.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: contents,
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
