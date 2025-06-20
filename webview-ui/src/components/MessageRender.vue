<!-- MessageRenderer.vue -->
<template>
  <div class="text" v-html="htmlContent" ref="contentRef"></div>
</template>

<script lang="ts">
import { defineComponent, ref, watchEffect, onMounted, onUnmounted } from 'vue';
import MarkdownIt from 'markdown-it';
import MarkdownItMathjax from 'markdown-it-mathjax';
import markdownItContainer from 'markdown-it-container';
import hljs from 'highlight.js';

export default defineComponent({
  props: {
    isDark: {
        type: Boolean,
        default: false
    },
    styleTransform: {
        type: Boolean,
        default: true
    },
    content: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const htmlContent = ref('');
    const contentRef = ref<HTMLElement | null>(null);
    
    const replaceOutsideCode = (source: string, pattern: RegExp, replacement: string) => {
        const codeBlockRegex = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
        let lastIndex = 0;
        let result = '';
        
        source.replace(codeBlockRegex, (match, offset) => {
            result += source.slice(lastIndex, offset).replace(pattern, replacement);
            result += match;
            lastIndex = offset + match.length;
            return match;
        });
        result += source.slice(lastIndex).replace(pattern, replacement);
        return result;
    };
    const md2html = (content: string) => {
		let text = String(content)
        text = text.replace(/<\|tips_start\|>[\s\S]*?<\|tips_end\|>/g, '');
        const codeStyleBegin = `<pre class="hljs"><code>`;
        const codeStyleEnd = `</code></pre>`;
        let md = MarkdownIt({
            html: true,
            breaks: true,
            highlight: function (str: string, lang: string) {
                let highlightedText = '';
                try{
                    if (lang && hljs.getLanguage(lang)) {
                        try {
                            highlightedText = codeStyleBegin + hljs.highlight(str, {language: lang, ignoreIllegals:true}).value + codeStyleEnd;
                        } catch (ex) {
                            highlightedText = codeStyleBegin + md.utils.escapeHtml(str) + codeStyleEnd;
                        }
                    } else {
                        highlightedText = hljs.highlightAuto(str).value;
                    }
                } catch (e) {
                    highlightedText = codeStyleBegin + md.utils.escapeHtml(str) + codeStyleEnd;
                } finally { 
                    const codeWithStyle = `${highlightedText}`;
                    const toolbar = `
                        <div class="code-toolbar">
                            <div class="language">${lang || 'plaintext'}</div>
                            <button class="copy-code-button" title="复制代码">复制</button>
                        </div>
                        `;
                    return `<div class="code-block-wrapper">${toolbar}${codeWithStyle}</div>`;
                }
            }
        })
        .use(markdownItContainer, 'think', {
            validate: function(params: any) {
                return params.trim() === 'think'
            },
            render: function(tokens: any, idx: any) {
                return tokens[idx].nesting === 1 
                    ? '<div class="think-block">\n' 
                    : '</div>\n';
            }
        })
        .use(markdownItContainer, 'conclusion', {
            validate: function(params: any) {
                return params.trim() === 'conclusion'
            },
            render: function(tokens: any, idx: any) {
                return tokens[idx].nesting === 1 
                    ? '<div class="conclusion-block">\n' 
                    : '</div>\n';
            }
        })
        .use(MarkdownItMathjax());
        text = replaceOutsideCode(text, /<think>/g, '::: think\n');
        text = replaceOutsideCode(text, /<\/think>/g, '\n:::\n');
        text = replaceOutsideCode(text, /<conclusion>/g, '::: conclusion\n');
        text = replaceOutsideCode(text, /<\/conclusion>/g, '\n:::\n');
        text = text.replace(/\r\n/g, '\n');
        text = text.replace(/^(\s+)/gm, (match) => {
            return match.replace(/ /g, '\u00A0').replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0');
        });
        // text = text.replace(/\n\n/g, '\n<br>\n');
        try {
          let html = md.render(text);
          html = html.replace(/<p>/g, '<p style="margin:0;">');
          return html;
        } catch (e) {
          console.error('Markdown渲染失败:', e);
          return text; // 降级返回原始文本
        }
        // text = text.replace(/<code>/g, '<pre class="code-block"><code>').replace(/<\/code>/g, '</code></pre>');
	};

    const content2html = (content: string) => {
        let escaped = content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;")
        escaped = escaped.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        escaped = escaped.replace(/ /g, '&nbsp;').replace(/\t/g, '&emsp;');
        escaped = escaped.replace(/\n/g, '<br>');
        return escaped;
    }

    const handleCopyClick = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const button = target.closest('.copy-code-button');
        if (!button) {
            return;
        }
        
        const wrapper = button.closest('.code-block-wrapper');
        if (!wrapper) {
            return;
        }
        
        const pre = wrapper.querySelector('pre.hljs');
        if (!pre) {
            return;
        }

        const codeText = pre.textContent || '';

        if (!document.hasFocus()) {
            window.focus();
        }

        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(codeText).then(() => {
                showFeedback(button, '✓ 已复制');
            }).catch(err => {
                console.error('Clipboard API失败:', err);
                fallbackCopy(codeText, button);
            });
        } else {
            fallbackCopy(codeText, button);
        }
    };

    const fallbackCopy = (text: string, button: Element) => {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'absolute';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.select();
        textArea.setSelectionRange(0, textArea.value.length);
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                showFeedback(button, '✓ 已复制');
            } else {
                showFeedback(button, '✗ 复制失败', true);
            }
        } catch (e) {
            console.error('execCommand失败:', e);
            showFeedback(button, '✗ 复制失败', true);
        } finally {
            document.body.removeChild(textArea);
        }
    };

    const showFeedback = (button: Element, message: string, isError = false) => {
        const feedbackEl = document.createElement('span');
        feedbackEl.textContent = message;
        feedbackEl.className = isError ? 'copy-feedback error' : 'copy-feedback';
        
        button.replaceWith(feedbackEl);
        setTimeout(() => {
            feedbackEl.replaceWith(button);
        }, 1000);
    };

    const themeInit = async () => {
        let link: any;
        try {
            //https://highlightjs.org/demo
            const oldThemeId = props.isDark ? 'atom-one-light' : 'atom-one-dark';
            const oldLink = document.getElementById(oldThemeId);
            if (oldLink && document.head.contains(oldLink)) {
                document.head.removeChild(oldLink);
            }
            const themeId = props.isDark ? 'atom-one-dark': 'atom-one-light';
            if (!document.getElementById(themeId)) {
                link = document.createElement('link');
                link.id = themeId;
                link.rel = 'stylesheet';
                link.href = `https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/${themeId}.min.css`;
                link.dataset.theme = props.isDark ? "dark" : "light";
                document.head.appendChild(link);
            }
        } catch (error) {
            console.error("主题加载失败", error);
            if (document.head.contains(link)) {
                document.head.removeChild(link);
            }
        }
    };

    watchEffect(() => {
        themeInit();
        if (props.styleTransform) {
            htmlContent.value = md2html(props.content);
        } else {
            htmlContent.value = content2html(props.content);
        }
    });

    onMounted(() => {
      if (contentRef.value) {
        contentRef.value.addEventListener('click', handleCopyClick);
      }
    });

    onUnmounted(() => {
      if (contentRef.value) {
        contentRef.value.removeEventListener('click', handleCopyClick);
      }
    });
    
    return { htmlContent, contentRef };
  }
});
</script>

<style>
.code-block-wrapper {
    display: flex;
    flex-direction: column;
    position: relative;
    background: var(--vscode-textCodeBlock-background);
    border: 1px solid var(--line-01);
    border-radius: 5px;
    overflow: hidden;
}
.code-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 10px;
    border-bottom: 1px solid var(--line-01);
    border-radius: 5px 5px 0 0;
    margin: 2px 0 !important;
}
.language {
    color: var(--vscode-foreground);
    font-size: 14px;
    font-weight: 600;
    opacity: 1;
}
.copy-code-button {
    cursor: pointer;
    background: transparent;
    border: none;
    color: var(--vscode-foreground);
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 10px;
    transition: all 0.2s ease;
}
.copy-code-button:hover {
    background-color: var(--vscode-toolbar-hoverBackground);
}
.copy-feedback {
    font-size: 10px;
    color: #4caf50;
    padding: 2px 8px;
}

.copy-feedback.error {
    color: #f44336;
}
</style>
<style scoped>
:global(:root) {
    --line-01: var(--vscode-commandCenter-inactiveBorder);
}
:deep(.hljs) {
    background: transparent !important;
    padding: 10px !important;
    margin: 0 !important;
    /* border-radius: 0px 0px 5px 5px !important;
    border-bottom: 1px solid var(--line-01);
    border-left: 1px solid var(--line-01);
    border-right: 1px solid var(--line-01); */
}
:deep(pre code) {
    background: transparent !important;
    color: inherit !important;
}
.text {
  backdrop-filter: blur(10px);
  /* white-space: pre-wrap; */
  word-wrap: break-word;
  word-break: normal;
  background-color: transparent;
}
</style>