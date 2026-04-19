export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  base64?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  attachments?: Attachment[];
}

export interface KnowledgeBase {
  text: string;
  images?: Attachment[];
}

export interface AISettings {
  apiKey: string;
  model: string;
  provider: 'gemini' | 'openai'; 
  whatsapp?: {
    accessToken: string;
    phoneNumberId: string;
    verifyToken: string;
    isActive: boolean;
  };
  qrIntegration?: {
    apiUrl: string; 
    apiKey: string;
    isActive: boolean;
    channelId?: string;
  };
}

export interface ChatSession {
  id: string;
  messages: Message[];
  title: string;
}
