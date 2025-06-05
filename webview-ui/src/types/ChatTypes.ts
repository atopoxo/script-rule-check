//ReferenceType = 'code' | 'files' | 'workspace' | 'function';

export interface Reference {
  type: string;
  name: string;
  paths?: string[];
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

export interface SelectorItemTag {
  text: string;
  fontSize?: string;
  border?: boolean;
}

export interface SelectorItem {
  id: string | number;
  name: string;
  icon?: string;
  tag?: SelectorItemTag;
  reference?: Reference;
  children?: SelectorItem[];
}