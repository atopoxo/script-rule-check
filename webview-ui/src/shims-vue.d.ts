declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

declare module 'markdown-it' {
  import MarkdownIt from 'markdown-it/lib';
  export default MarkdownIt;
}

declare module 'markdown-it-mathjax' {
  import MarkdownIt from 'markdown-it-mathjax';
  export default MarkdownIt;
}

declare module 'markdown-it-container' {
  import MarkdownIt from 'markdown-it-container';
  export default MarkdownIt;
}

declare module 'highlight.js' {
  import MarkdownIt from 'highlight.js/lib';
  export default MarkdownIt;
}