import { ReceiptScanResult, ReceiptScanOptions } from '@/types/receipt';
import { aiApiEnabled, scanReceiptImage } from '@/features/ai/api/receiptScanApi';
import { getServerCapabilities } from './capabilitiesService';

// Export error class before using it
export class ReceiptScanError extends Error {
  public code: 'PROCESSING_ERROR' | 'INVALID_IMAGE' | 'API_ERROR' | 'NETWORK_ERROR';

  constructor({ code, message }: { code: ReceiptScanError['code']; message: string }) {
    super(message);
    this.name = 'ReceiptScanError';
    this.code = code;
  }
}

class OpenAIReceiptService {
  private apiKey: string | null = null;
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private initialize() {
    if (aiApiEnabled()) return;
    // In React Native/Expo, use environment variable
    const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
    
    console.log('OpenAI Service initialization:', {
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey ? apiKey.length : 0,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 7) + '...' : 'none'
    });
    
    if (!apiKey || apiKey === 'your_openai_api_key_here') {
      console.warn('OpenAI API key not found or not configured. Receipt scanning will be disabled.');
      return;
    }

    this.apiKey = apiKey;
    this.isInitialized = true;
    console.log('OpenAI client initialized successfully');
  }

  public async isAvailable(): Promise<boolean> {
    if (aiApiEnabled()) return (await getServerCapabilities()).ai === 'available';
    return this.isInitialized && this.apiKey !== null;
  }

  private getPrompt(): string {
    return `
You are a receipt data extraction expert. Analyze this receipt image and extract the following information in JSON format:

{
  "merchantName": "Business name from receipt (string or null)",
  "date": "Transaction date in YYYY-MM-DD format (string or null)", 
  "total": "Total amount as number (number or null)",
  "tax": "Tax amount as number (number or null)",
  "subtotal": "Subtotal before tax (number or null)",
  "items": [
    {
      "description": "Item name/description (string)",
      "quantity": "Number of items (number, default 1)",
      "price": "Item price as number (number)"
    }
  ],
  "paymentMethod": "cash, card, or other (string or null)",
  "suggestedCategory": "One of: Food & Beverage, Transportation, Office Supplies, Travel, Entertainment, Health & Medical, Shopping, Utilities, Other (string or null)",
  "confidence": "0-100 score of extraction confidence (number)",
  "notes": "Any additional relevant information (string or null)"
}

IMPORTANT RULES:
- Extract only information clearly visible in the receipt
- Use null for missing information - NEVER guess or hallucinate data
- For dates, convert to YYYY-MM-DD format
- For amounts, extract as numbers without currency symbols
- If you cannot see the receipt clearly, return confidence score below 50
- Items array can be empty if individual items are not clearly visible
- Return valid JSON only`;
  }

  public async scanReceipt(
    imageBase64: string, 
    options: ReceiptScanOptions = {}
  ): Promise<ReceiptScanResult> {
    console.log('Starting receipt scan with options:', options);
    
    if (aiApiEnabled()) {
      const base64Data = imageBase64.startsWith('data:')
        ? imageBase64
        : `data:image/jpeg;base64,${imageBase64}`;
      try {
        return await scanReceiptImage(base64Data);
      } catch (error) {
        throw new ReceiptScanError({
          code: 'API_ERROR',
          message: error instanceof Error ? error.message : 'Receipt scanning failed',
        });
      }
    }

    if (!(await this.isAvailable())) {
      console.error('OpenAI service not available');
      throw new ReceiptScanError({
        code: 'API_ERROR',
        message: 'OpenAI service is not available. Please check your API key configuration.'
      });
    }

    const { model = 'gpt-4o-mini', maxTokens = 1000 } = options;

    try {
      // Ensure image data is properly formatted
      const base64Data = imageBase64.startsWith('data:') 
        ? imageBase64 
        : `data:image/jpeg;base64,${imageBase64}`;

      console.log('Making OpenAI API call with:', {
        model,
        maxTokens,
        imageDataLength: base64Data.length,
        imageFormat: base64Data.substring(0, 30) + '...'
      });

      // Use fetch API for React Native compatibility
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: this.getPrompt()
                },
                {
                  type: "image_url",
                  image_url: {
                    url: base64Data,
                    detail: "high"
                  }
                }
              ]
            }
          ],
          response_format: { type: "json_object" }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
        
        if (response.status === 401) {
          throw new ReceiptScanError({
            code: 'API_ERROR',
            message: 'Invalid OpenAI API key. Please check your API key configuration.'
          });
        }
        
        if (response.status === 429) {
          throw new ReceiptScanError({
            code: 'API_ERROR',
            message: 'Rate limit exceeded. Please try again in a few moments.'
          });
        }

        throw new ReceiptScanError({
          code: 'API_ERROR',
          message: `OpenAI API Error: ${errorMessage}`
        });
      }

      const data = await response.json();
      
      console.log('OpenAI API response received:', {
        hasChoices: !!data.choices,
        choicesLength: data.choices?.length,
        hasContent: !!data.choices[0]?.message?.content
      });

      const content = data.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content received from OpenAI');
      }

      console.log('Raw OpenAI response content:', content);

      const result = JSON.parse(content) as ReceiptScanResult;
      
      console.log('Parsed result:', result);
      
      // Validate and sanitize the result
      const validatedResult = this.validateAndSanitizeResult(result);
      
      console.log('Validated result:', validatedResult);
      
      return validatedResult;

    } catch (error) {
      console.error('Receipt scanning error details:', {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        type: typeof error,
        name: error instanceof Error ? error.name : undefined
      });
      
      if (error instanceof ReceiptScanError) {
        throw error;
      }

      if (error instanceof SyntaxError) {
        throw new ReceiptScanError({
          code: 'PROCESSING_ERROR',
          message: 'Failed to parse AI response. Please try again.'
        });
      }

      if (error instanceof Error) {
        if (error.message.includes('network') || error.message.includes('fetch')) {
          throw new ReceiptScanError({
            code: 'NETWORK_ERROR',
            message: 'Network error occurred. Please check your connection and try again.'
          });
        }

        throw new ReceiptScanError({
          code: 'PROCESSING_ERROR',
          message: `Error: ${error.message}`
        });
      }

      throw new ReceiptScanError({
        code: 'PROCESSING_ERROR',
        message: 'An unexpected error occurred while processing the receipt.'
      });
    }
  }

  private validateAndSanitizeResult(result: any): ReceiptScanResult {
    // Ensure all required fields exist with proper types
    return {
      merchantName: typeof result.merchantName === 'string' ? result.merchantName : null,
      date: this.validateDate(result.date),
      total: this.validateNumber(result.total),
      tax: this.validateNumber(result.tax),
      subtotal: this.validateNumber(result.subtotal),
      items: Array.isArray(result.items) ? result.items.filter(this.validateItem) : [],
      paymentMethod: this.validatePaymentMethod(result.paymentMethod),
      suggestedCategory: typeof result.suggestedCategory === 'string' ? result.suggestedCategory : null,
      confidence: this.validateNumber(result.confidence) || 0,
      notes: typeof result.notes === 'string' ? result.notes : null
    };
  }

  private validateDate(date: any): string | null {
    if (typeof date !== 'string') return null;
    
    // Basic date format validation (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) return null;
    
    // Check if it's a valid date
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) return null;
    
    return date;
  }

  private validateNumber(value: any): number | null {
    if (typeof value === 'number' && !isNaN(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return !isNaN(parsed) ? parsed : null;
    }
    return null;
  }

  private validateItem = (item: any): boolean => {
    return (
      typeof item === 'object' &&
      typeof item.description === 'string' &&
      item.description.length > 0 &&
      typeof item.price === 'number' &&
      !isNaN(item.price)
    );
  };

  private validatePaymentMethod(method: any): 'cash' | 'card' | 'other' | null {
    if (typeof method === 'string') {
      const normalized = method.toLowerCase();
      if (['cash', 'card', 'other'].includes(normalized)) {
        return normalized as 'cash' | 'card' | 'other';
      }
    }
    return null;
  }

  // Utility method to convert image URI to base64 for React Native
  public static async uriToBase64(uri: string): Promise<string> {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          resolve(base64data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting URI to base64:', error);
      throw new Error('Failed to convert image to base64');
    }
  }

  // Utility method to compress image before sending to API (for React Native)
  public static async compressImage(
    uri: string,
    maxWidth: number = 1024,
    quality: number = 0.8
  ): Promise<string> {
    try {
      // For React Native, we'll use expo-image-manipulator or similar
      // For now, we'll just convert to base64 - compression can be added later
      // using react-native-image-resizer or expo-image-manipulator
      return await this.uriToBase64(uri);
    } catch (error) {
      console.error('Error compressing image:', error);
      throw new Error('Failed to compress image');
    }
  }
}

// Export the class for static method access
export { OpenAIReceiptService };

// Create singleton instance
export const openaiReceiptService = new OpenAIReceiptService();

