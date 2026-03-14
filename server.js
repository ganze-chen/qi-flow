/**
 * Gemini AI Enhancement Server
 *
 * Proxy server for Gemini API calls to keep API key secure
 */

import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const app = express();
const PORT = 3001;

// Configure proxy for Node.js fetch (undici)
const proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy || 'http://127.0.0.1:7890';
console.log('[Server] Configuring proxy:', proxyUrl);

const proxyAgent = new ProxyAgent(proxyUrl);
setGlobalDispatcher(proxyAgent);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Large limit for base64 images

// Initialize Gemini AI
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || 'AIzaSyD1_fWBdXuoPUc9eN3LeJOex1TD0-qVVN4',
});

/**
 * POST /api/enhance-image
 *
 * Request body:
 * {
 *   imageData: string,  // base64 encoded image (without data:image/png;base64, prefix)
 *   mimeType: string,   // e.g., 'image/png'
 *   prompt: string      // enhancement prompt
 * }
 *
 * Response:
 * {
 *   success: boolean,
 *   imageData: string,  // base64 encoded enhanced image
 *   mimeType: string,
 *   error: string       // if success is false
 * }
 */
app.post('/api/enhance-image', async (req, res) => {
  const startTime = Date.now();

  try {
    const { imageData, mimeType = 'image/png', prompt } = req.body;

    if (!imageData || !prompt) {
      console.error('[Server] Missing required fields');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: imageData and prompt',
      });
    }

    console.log('[Server] ========================================');
    console.log('[Server] Received enhancement request');
    console.log('[Server] Image size:', imageData.length, 'bytes');
    console.log('[Server] MIME type:', mimeType);
    console.log('[Server] Prompt:', prompt.substring(0, 100) + '...');

    // Configure Gemini model
    // Reference: https://ai.google.dev/gemini-api/docs/image-generation
    const config = {
      responseModalities: ['IMAGE'],
    };

    const model = 'gemini-3-pro-image-preview';

    // Prepare content with image and prompt
    const contents = [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: imageData,
            },
          },
          {
            text: prompt,
          },
        ],
      },
    ];

    console.log('[Server] Calling Gemini API...');
    console.log('[Server] Model:', model);

    // Call Gemini API with timeout
    const timeoutMs = 120000; // 2 minutes
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('API call timeout after 2 minutes')), timeoutMs);
    });

    const apiPromise = (async () => {
      try {
        console.log('[Server] Creating API request...');
        const response = await ai.models.generateContentStream({
          model,
          contents,
          config,
        });

        console.log('[Server] API request sent, waiting for response...');

        // Collect response chunks
        let enhancedImageData = null;
        let enhancedMimeType = null;
        let chunkCount = 0;

        for await (const chunk of response) {
          chunkCount++;
          console.log('[Server] Received chunk', chunkCount);
          console.log('[Server] Chunk structure:', JSON.stringify(chunk, null, 2).substring(0, 500));

          if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
            const inlineData = chunk.candidates[0].content.parts[0].inlineData;
            enhancedImageData = inlineData.data;
            enhancedMimeType = inlineData.mimeType;
            console.log('[Server] Received image chunk, mime:', enhancedMimeType);
            console.log('[Server] Image data length:', enhancedImageData?.length || 0);
          }
        }

        console.log('[Server] Finished processing all chunks. Total chunks:', chunkCount);
        return { enhancedImageData, enhancedMimeType };
      } catch (apiError) {
        console.error('[Server] API call error:', apiError);
        console.error('[Server] API error message:', apiError.message);
        console.error('[Server] API error stack:', apiError.stack);
        console.error('[Server] API error details:', JSON.stringify(apiError, null, 2));
        throw apiError;
      }
    })();

    const { enhancedImageData, enhancedMimeType } = await Promise.race([apiPromise, timeoutPromise]);

    if (!enhancedImageData) {
      throw new Error('No image data received from Gemini API');
    }

    const elapsed = Date.now() - startTime;
    console.log('[Server] Enhancement complete in', elapsed, 'ms');
    console.log('[Server] ========================================');

    res.json({
      success: true,
      imageData: enhancedImageData,
      mimeType: enhancedMimeType || mimeType,
    });

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error('[Server] ========================================');
    console.error('[Server] Enhancement error after', elapsed, 'ms');
    console.error('[Server] Error type:', error.constructor.name);
    console.error('[Server] Error message:', error.message);
    console.error('[Server] Error stack:', error.stack);

    // Try to extract more details from the error
    if (error.cause) {
      console.error('[Server] Error cause:', error.cause);
    }
    if (error.response) {
      console.error('[Server] Error response:', error.response);
    }

    console.error('[Server] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    console.error('[Server] ========================================');

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to enhance image',
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[Server] Gemini AI Enhancement Server running on http://localhost:${PORT}`);
  console.log(`[Server] API Key configured: ${ai ? 'Yes' : 'No'}`);
});
