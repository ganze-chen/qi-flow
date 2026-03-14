/**
 * AIEnhancer — AI 图像增强模块
 *
 * 调用后端服务使用 Gemini API 对导出图像进行艺术化润色
 */

const DEFAULT_PROMPT = `Based on the "ink marks" in the picture, Wu Guanzhong's minimalist and abstract style is used to express the shapes of mountains, rivers and houses, with minimal alteration and preservation of the original ink dots' spontaneity, and large areas of blank space.`;

// Use 127.0.0.1 instead of localhost to bypass proxy
const API_ENDPOINT = 'http://127.0.0.1:3001/api/enhance-image';
const HEALTH_ENDPOINT = 'http://127.0.0.1:3001/api/health';

export class AIEnhancer {
  /**
   * Enhance an image using Gemini AI
   *
   * @param {string} imageDataURL - Data URL of the image (data:image/png;base64,...)
   * @param {string} [customPrompt] - Optional custom prompt
   * @returns {Promise<string>} - Data URL of enhanced image
   */
  async enhance(imageDataURL, customPrompt = null) {
    try {
      // Extract base64 data and mime type from data URL
      const matches = imageDataURL.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error('Invalid image data URL format');
      }

      const mimeType = matches[1];
      const base64Data = matches[2];

      console.log('[AIEnhancer] Starting enhancement...');
      console.log('[AIEnhancer] Image size:', base64Data.length, 'bytes');
      console.log('[AIEnhancer] MIME type:', mimeType);

      // Call backend API
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData: base64Data,
          mimeType: mimeType,
          prompt: customPrompt || DEFAULT_PROMPT,
        }),
      });

      console.log('[AIEnhancer] Response status:', response.status);
      console.log('[AIEnhancer] Response headers:', response.headers.get('content-type'));

      // Get response text first for debugging
      const responseText = await response.text();
      console.log('[AIEnhancer] Response text length:', responseText.length);
      console.log('[AIEnhancer] Response preview:', responseText.substring(0, 200));

      if (!response.ok) {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch (e) {
          throw new Error(`HTTP ${response.status}: ${responseText.substring(0, 100)}`);
        }
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (e) {
        throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}`);
      }

      if (!result.success) {
        throw new Error(result.error || 'Enhancement failed');
      }

      console.log('[AIEnhancer] Enhancement complete');

      // Convert back to data URL
      const enhancedDataURL = `data:${result.mimeType};base64,${result.imageData}`;
      return enhancedDataURL;

    } catch (error) {
      console.error('[AIEnhancer] Error:', error);
      throw error;
    }
  }

  /**
   * Check if the enhancement service is available
   *
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    try {
      const response = await fetch(HEALTH_ENDPOINT, {
        method: 'GET',
      });
      return response.ok;
    } catch (error) {
      console.warn('[AIEnhancer] Health check failed:', error);
      return false;
    }
  }
}
