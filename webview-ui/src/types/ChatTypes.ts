//ReferenceType = 'code' | 'files' | 'workspace' | 'function';

export interface Reference {
  type: string;
  name: string;
  paths?: string[];
  content?: string;
  range?: any;
}

export interface Message {
  role: string;
  content: string;
  timestamp: number;
  references?: Reference[];
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

export interface ReferenceOption {
  type: string;
  id: string;
  name: string;
  describe: string;
  icon?: string;
  reference?: Reference;
  children?: ReferenceOption[];
}