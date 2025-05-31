interface AddEventListenerOptions {
  capture?: boolean;
  once?: boolean;
  passive?: boolean;
  signal?: AbortSignal;
}

interface EventListenerOptions {
  capture?: boolean;
}

declare function acquireVsCodeApi(): {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
};

export interface Window {
    addEventListener(
      type: string, 
      listener: (event: MessageEvent) => void, 
      options?: boolean | AddEventListenerOptions
    ): void;
    removeEventListener(
      type: string, 
      listener: (event: MessageEvent) => void, 
      options?: boolean | EventListenerOptions
    ): void;
}