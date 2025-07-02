export interface ContextItem {
  type: string;
  name: string;
  paths?: string[];
  content?: string;
  range?: any;
}

export interface ContextOption {
  type: string;
  id: string;
  name: string;
  describe: string;
  icon?: string;
  contextItem?: ContextItem;
  children?: ContextOption[];
}

export interface Message {
  role: string;
  content: string;
  timestamp: number;
  contextOption?: ContextOption[];
  contextExpand?: boolean;
}

export interface Session {
  sessionId: string;
  lastModifiedTimestamp: number;
  name: string;
  history: Message[];
  isAIStreamTransfer: boolean;
}

declare global {
  type IChatMessage = Message;
  type IChatSession = Session;
  type IContextItem = ContextItem;
}

export interface SelectorItemTag {
  text: string;
  fontSize?: string;
  border?: boolean;
}

export interface SelectorItem {
  type: string;
  id: string;
  name: string;
  icon?: string;
  tag?: SelectorItemTag;
  contextItem?: ContextItem;
  children?: SelectorItem[];
}

export interface MenuItem {
  id: string;
  icon: string;
  tooltip: string;
}

export interface SessionRecord {
  id: string;
  selected: boolean;
  lastModifiedTimestamp: number;
  name: string;
  isAIStreamTransfer: boolean;
  icon?: string;
  tag?: SelectorItemTag;
}

export interface SessionRecordList {
  tag: string;
  timestamp: number;
  records: SessionRecord[];
}

export interface ModelInfo {
  id: string;
  name: string;
  type: string;
}