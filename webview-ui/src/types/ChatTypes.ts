export interface Reference {
  type: 'code' | 'file' | 'folder';
  name: string;
  path?: string;
  content?: string;
  range?: any;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  references?: Reference[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  lastActive: number;
  model?: string;
}

declare global {
  type IChatMessage = ChatMessage;
  type IChatSession = ChatSession;
  type IReference = Reference;
}