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
    setTimeout: any;
    getComputedStyle: (
      element: Element, 
      pseudoElt?: string | null
    ) => CSSStyleDeclaration;
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