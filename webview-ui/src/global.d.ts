export {};

declare global {
  interface Window {
    getComputedStyle: (elt: Element, pseudoElt?: string | null) => CSSStyleDeclaration;
    document: Document;
    MutationObserver: {
      prototype: MutationObserver;
      new(callback: MutationCallback): MutationObserver;
    };
  }
}

type MutationCallback = (mutations: MutationRecord[], observer: MutationObserver) => void;