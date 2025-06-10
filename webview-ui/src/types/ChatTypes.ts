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
  type: string;
  id: string | number;
  name: string;
  icon?: string;
  tag?: SelectorItemTag;
  reference?: Reference;
  children?: SelectorItem[];
}

export interface MenuItem {
  id: string;
  icon: string;
  tooltip: string;
}

export interface SessionRecord {
  id: string;
  title: string;
  icon?: string;
  tag?: SelectorItemTag;
  messages: ChatMessage[];
}

export interface SessionRecordList {
  date: string;
  records: SessionRecord[];
}

export interface ModelInfo {
  id: string;
  name: string;
  type: string;
}

export interface ReferenceOption {
  type: string;
  id: string;
  name: string;
  describe: string;
  icon?: string;
  reference?: Reference;
  children?: ReferenceOption[];
}