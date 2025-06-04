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

export const getModulePath = (): string => {
  const meta = import.meta as { url?: string };
  return meta.url || '';
};
export const currentModuleUrl = getModulePath();

export interface Window {
    setTimeout: any;
    matchMedia: (query: string) => MediaQueryList;
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