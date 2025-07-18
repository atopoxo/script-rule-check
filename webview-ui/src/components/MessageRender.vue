<!-- MessageRenderer.vue -->
<template>
  <div v-if="contentType === 'html'" class="html-block" v-html="contentValue" ref="contentRef" :style="{
      maxWidth: maxWidth + 'px'
    }"></div>
  <div v-if="contentType === 'text' && textEditable === false" class="text-block" ref="contentRef" :style="{
      maxWidth: maxWidth + 'px'
    }">
    <div class="result-block expanded">
      <div class="block-header">
          <button class="icon-button content-header">
              <img class="expand-icon" src=""/>
              <div class="content-header-content">问题</div>
          </button>
      </div>
      <div class="content-wrapper">
        <div class="text-content" :style="{
            // height: nonEditHeight + 'px',
            overflowX: textOverflowX,
            overflowY: textOverflowY
        }">{{ contentValue }}</div>
      </div>
    </div>
  </div>
  <div v-if="contentType === 'text' && textEditable === true" class="textarea-block" :style="{ 
      height: containerHeight + 'px' 
    }">
    <textarea class="textarea-content" :style="`width: ${maxWidth}px;`"
        :value="contentValue"
        ref="contentRef"
        @input="handleInput"
        @compositionstart="handleCompositionStart"
        @compositionend="handleCompositionEnd"
        @keydown="handleKeyDown"></textarea>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref, watchEffect, onMounted, onUnmounted, nextTick, createApp } from 'vue';
import { throttle, md2html } from '../functions/BaseFunctions';
import { currentModuleUrl, iconRoot } from '../types/GlobalTypes';
import BrowserList from './BrowserList.vue';

export default defineComponent({
  components: {
    BrowserList
  },
  props: {
    isDark: {
      type: Boolean,
      default: false
    },
    index: {
      type: Number,
      default: 0
    },
    contentType: {
      type: String,
      default: "html"
    },
    textEditable: {
      type: Boolean,
      default: false
    },
    textAreaBorder: {
      type: Number,
      default: 0
    },
    textAreaPadding: {
      type: Number,
      default: 0
    },
    maxWidth: {
        type: Number,
        default: 0
    },
    content: {
      type: String,
      required: true
    }
  },

  emits: ['finish-edit', 'open-external'],
  setup(props,  { emit }) {
    const contentValue = ref('');
    const contentRef = ref<HTMLElement | null>(null);
    const contentType = ref('html');
    const textEditable = ref(false);
    const textEditPadding = ref(16);
    const maxWidth = ref(0);

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

    type OverflowType = 'visible' | 'hidden' | 'scroll' | 'auto' | 'inherit';
    // const nonEditHeight = ref(0);
    const textOverflowX = ref<OverflowType>('auto');
    const textOverflowY = ref<OverflowType>('auto');
    const calculateNonEditHeight = () => {
      if (!contentRef.value || props.contentType !== 'text' || props.textEditable) {
        return;
      }
      
      const element = contentRef.value as HTMLElement;
      element.style.height = 'auto';
      // const contentHeight = element.scrollHeight;
      // nonEditHeight.value = contentHeight;
      element.style.height = '';

      textOverflowX.value = element.scrollWidth > props.maxWidth ? 'auto' : 'hidden';
      textOverflowY.value = 'hidden';
    };

    const textAreaLineHeight = 19;
    const maxTextLines = 16;
    const textareaStyles = ref({
      fontSize: 0,
      fontFamily: 'inherit',
      lineHeight: textAreaLineHeight,
      paddingTop: props.textAreaPadding,
      paddingBottom: props.textAreaPadding as number,
      paddingLeft: props.textAreaPadding as number,
      paddingRight: props.textAreaPadding as number,
      borderTopWidth: props.textAreaBorder as number,
      borderBottomWidth: props.textAreaBorder as number,
      borderLeftWidth: props.textAreaBorder as number,
      borderRightWidth: props.textAreaBorder as number,
      boxSizing: 'content-box'
    });
    const maxTextAreaHeight = textAreaLineHeight * maxTextLines;
    const isComposing = ref(false);
    const pendingInput = ref('');
    const defaultInputContainerHeight = (textareaStyles.value.borderTopWidth + textareaStyles.value.borderBottomWidth +
        textareaStyles.value.paddingTop + textareaStyles.value.paddingBottom +
        textAreaLineHeight) as number;
    const containerHeight = ref(defaultInputContainerHeight);

    const handleInput = (event: Event) => {
        const target = event.target as HTMLTextAreaElement;
        const value = target.value;
        
        if (isComposing.value) {
            pendingInput.value = value;
        } else {
            contentValue.value = value;
            throttledAdjustHeight();
        }
    };

    const handleCompositionStart = () => {
      isComposing.value = true;
    };

    const handleCompositionEnd = (event: CompositionEvent) => {
      isComposing.value = false;
      contentValue.value = (event.target as HTMLTextAreaElement).value;
      throttledAdjustHeight();
    };

    const adjustTextareaHeight = throttle(async() => {
      if (!contentRef.value) {
        return;
      }
      const target = contentRef.value as HTMLTextAreaElement;
      if (textareaStyles.value.fontSize == 0) {
        const style = getComputedStyle(target);
        textareaStyles.value = {
          fontSize: parseInt(style.fontSize) || 16,
          fontFamily: style.fontFamily,
          lineHeight: parseInt(style.lineHeight) || 20,
          paddingTop: parseInt(style.paddingTop) || 0,
          paddingBottom: parseInt(style.paddingBottom) || 0,
          paddingLeft: parseInt(style.paddingLeft) || 0,
          paddingRight: parseInt(style.paddingRight) || 0,
          borderTopWidth: parseInt(style.borderTopWidth) || 0,
          borderBottomWidth: parseInt(style.borderBottomWidth) || 0,
          borderLeftWidth: parseInt(style.borderLeftWidth) || 0,
          borderRightWidth: parseInt(style.borderRightWidth) || 0,
          boxSizing: style.boxSizing
        };
      }
      const contentHeight = calculateContentHeight(target.value, target.clientWidth);
      target.style.height = `${contentHeight}px`;
      target.style.overflowY = contentHeight >= maxTextAreaHeight ? 'auto' : 'hidden';
      const textareaHeight = textareaStyles.value.borderTopWidth + textareaStyles.value.paddingTop + contentHeight + textareaStyles.value.paddingBottom + textareaStyles.value.borderBottomWidth;
      containerHeight.value =  textareaHeight;
    }, 100);

    const throttledAdjustHeight = throttle(adjustTextareaHeight, 100);

    const calculateContentHeight = (text: string, availableWidth: number) => {
      const {
        fontSize,
        fontFamily,
        lineHeight,
        paddingTop,
        paddingBottom,
        paddingLeft,
        paddingRight,
        borderTopWidth,
        borderBottomWidth,
        boxSizing
      } = textareaStyles.value;
      const textareaWidth = availableWidth - paddingLeft - paddingRight;
      let canvas: HTMLCanvasElement | null = document.createElement('canvas');
      let ctx: CanvasRenderingContext2D | null = canvas.getContext('2d')!;
      ctx.font = `${fontSize}px ${fontFamily}`;
      const explicitLines = text.split(/\r?\n|\r/);
      let totalLines = 0;
      let currentLineWidth = 0;

      explicitLines.forEach(line => {
        if (line.length === 0) {
          totalLines += 1;
          return;
        }
        let words = line.split(/(\s+)/);
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          let wordWidth = 0;
          if (ctx) {
            wordWidth = ctx.measureText(word).width;
          } else {
            wordWidth = word.length * fontSize * 0.6;
          }
          if (currentLineWidth + wordWidth > textareaWidth) {
            if (currentLineWidth > 0) {
                totalLines++;
                currentLineWidth = wordWidth;
            } else {
                const chars = word.split('');
                for (const char of chars) {
                    const charWidth = ctx ? ctx.measureText(char).width : fontSize * 0.6;
                    if (currentLineWidth + charWidth > textareaWidth) {
                        totalLines++;
                        currentLineWidth = charWidth;
                    } else {
                        currentLineWidth += charWidth;
                    }
                }
            }
          } else {
            currentLineWidth += wordWidth;
          }
        }
        if (currentLineWidth > 0) {
            totalLines++;
        }
      });
      let contentHeight = totalLines * lineHeight;
      if (boxSizing === 'border-box') {
        contentHeight += paddingTop + paddingBottom + borderTopWidth + borderBottomWidth;
      } else {
        contentHeight += paddingTop + paddingBottom;
      }
      return Math.min(contentHeight, maxTextAreaHeight);
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          const textarea = contentRef.value as HTMLTextAreaElement;
          if (!textarea) {
            return;
          }
          const startPos = textarea.selectionStart;
          const endPos = textarea.selectionEnd;
          const value = textarea.value;
          const newValue = value.substring(0, startPos) + '\n' + value.substring(endPos);
          textarea.value = newValue;
          contentValue.value = newValue;
          const newPos = startPos + 1;
          textarea.setSelectionRange(newPos, newPos);
          adjustTextareaHeight();
        } else if (!event.shiftKey) {
          event.preventDefault();
          finishEdit(contentValue.value, props.index);
        }
      }
    };

    const finishEdit = (value: string, index: number) => {
        emit('finish-edit', value, index);
    }

    const blockStates = ref<Record<string, boolean>>({});
    const getBlockSelector = (block: Element, key: string = 'item-name'): string | null => {
      let name: any;
      if (!block.getAttribute(key)) {
        const parent = block.parentElement;
        if (!parent) {
          return null;
        }
        let parentName = parent.getAttribute(key);
        parentName = parentName ? parentName : '';
        const index = Array.from(parent.children).indexOf(block);
        name = `${parentName}:nth-child(${index + 1})`;
        block.setAttribute(key, name);
      }
      name = block.getAttribute(key);
      return name;
    };
    const getBlockIconPath = (isExpanded: boolean) => {
      try {
        const relativePath = props.isDark ? 'dark' : 'light';
        const iconFile = isExpanded ? 'arrow-down.svg' : 'arrow-right.svg';
        return new URL(`${iconRoot}${relativePath}/${iconFile}`, currentModuleUrl).href;
      } catch (error) {
        console.error('图标加载失败:', error);
        return '';
      }
    };

    const expandContext = (event: any) => {
      const header = event.currentTarget as HTMLElement;
      let block: HTMLElement | null = null;
      let blockType = '';
      let currentElement: HTMLElement | null = header.parentElement;
      while (currentElement && !block) {
        if (currentElement.classList.contains('result-block')) {
          block = currentElement;
          blockType = 'result';
        } else if (currentElement.classList.contains('tool-block')) {
          block = currentElement;
          blockType = 'tool';
        } else if (currentElement.classList.contains('tools-block')) {
          block = currentElement;
          blockType = 'tools';
        } else {
          currentElement = currentElement.parentElement;
        }
      }
      if (!block) {
        return;
      }
      const selector = getBlockSelector(block);
      if (!selector) {
        return;
      }
      if (blockStates.value[selector]) {
        if (blockType === 'result') {
          block.classList.remove('expanded');
          const content = block.querySelector('.content-wrapper') as HTMLElement;
          if (content) {
            content.style.maxHeight = '0';
          }
        } else if (blockType === 'tools') {
          block.classList.remove('expanded');
          const children = Array.from(block.children) as HTMLElement[];
          children.forEach(child => {
            if (!child.classList.contains('block-header')) {
              child.style.maxHeight = '0';
            }
          });
        } else if (blockType === 'tool') {
          const children = Array.from(block.children) as HTMLElement[];
          children.forEach(child => {
            if (!child.classList.contains('block-header')) {
              child.classList.remove('expanded');
              child.style.maxHeight = '0';
            }
          });
        }
      } else {
        if (blockType === 'result') {
          block.classList.add('expanded');
          const content = block.querySelector('.content-wrapper') as HTMLElement;
          if (content) {
            content.style.maxHeight = content.scrollHeight + 'px';
          }
        } else if (blockType === 'tools') {
          block.classList.add('expanded');
          const children = Array.from(block.children) as HTMLElement[];
          children.forEach(child => {
            if (!child.classList.contains('block-header')) {
              child.style.maxHeight = child.scrollHeight + 'px';
            }
          });
        } else if (blockType === 'tool') {
          const children = Array.from(block.children) as HTMLElement[];
          children.forEach(child => {
            if (!child.classList.contains('block-header')) {
              child.classList.add('expanded');
              child.style.maxHeight = child.scrollHeight + 'px';
            }
          });
          block.style.maxHeight = block.scrollHeight + 'px';
        }
      }
      blockStates.value[selector] = !blockStates.value[selector];
      const icon = header.querySelector('.expand-icon') as HTMLImageElement;
      if (icon) {
        icon.src = getBlockIconPath(blockStates.value[selector]);
      }
    };

    const createExpandState = () => {
      const blockTypes = ['.result-block', '.tools-block', '.tool-block'];
      blockTypes.forEach(type => {
        contentRef.value?.querySelectorAll(type).forEach((block: Element) => {
          const selector = getBlockSelector(block);
          if (!selector) {
            return;
          }
          if (blockStates.value[selector] === undefined) {
            blockStates.value[selector] = true;
          }
          const header = block.querySelector('.content-header');
          if (header) {
            header.removeEventListener('click', expandContext);
            header.addEventListener('click', expandContext);
            const icon = header.querySelector('.expand-icon') as HTMLImageElement;
            if (icon) {
              icon.src = getBlockIconPath(blockStates.value[selector]);
            }
          }
        });
      });
    }

    const componentInstances = ref<any[]>([]);
    const mountComponents = async (components: any[]) => {
      await nextTick();
      componentInstances.value.forEach(app => app.unmount());
      componentInstances.value = [];
      components.forEach(comp => {
        const container = document.getElementById(`component-${comp.index}`);
        if (!container) {
          return;
        }
        const app = createApp(BrowserList, {
          isDark: props.isDark,
          data: comp.data,
          onOpenExternal: handleOpenExternal
        });
        app.mount(container);
        componentInstances.value.push(app);
      });
    };

    const handleOpenExternal = (url: string) => {
      emit('open-external', url);
    }

    watchEffect(async () => {
        themeInit();
        contentType.value = props.contentType;
        textEditable.value = props.textEditable;
        if (props.contentType === 'html') {
          maxWidth.value = props.maxWidth - 16;
          const { html, components } = md2html(props.content);
          contentValue.value = html;
          await nextTick();
          mountComponents(components);
          createExpandState();
        } else if (props.contentType === 'text') {
          if (textEditable.value) {
              maxWidth.value = props.maxWidth - textareaStyles.value.paddingLeft - textareaStyles.value.paddingRight -
              textareaStyles.value.borderLeftWidth - textareaStyles.value.borderRightWidth;
              await nextTick();
              adjustTextareaHeight();
          } else {
              maxWidth.value = props.maxWidth - 16;
              await nextTick();
              createExpandState();
              calculateNonEditHeight();
          }
        }
    });

    onMounted(() => {
      // initMutationObserver();
      if (contentRef.value) {
        contentRef.value.addEventListener('click', handleCopyClick);
      }
      contentValue.value = props.content;
    });

    onUnmounted(() => {
      if (contentRef.value) {
        contentRef.value.removeEventListener('click', handleCopyClick);
      }
      componentInstances.value.forEach(app => app.unmount());
    });
    
    return { 
        contentValue, 
        contentRef, 
        contentType, 
        textEditable,
        // nonEditHeight,
        textOverflowX,
        textOverflowY,
        handleKeyDown,
        handleInput,
        handleCompositionStart,
        handleCompositionEnd,
        textEditPadding,
        maxWidth,
        containerHeight,
        expandContext
    };
  }
});
</script>

<style>
.block-header {
  display: inline-flex;
  color: var(--vscode-tab-inactiveForeground);
  font-size: 11px;
  height: 16px;
  line-height: 12px;
  font-weight: 500;
  padding: 2px;
  border-radius: 5px;
  cursor: pointer;
  user-select: none;
  align-items: center;
}
.content-wrapper {
  border-radius: 6px;
  padding: 0;
  margin-top: 0;
  overflow: hidden;
}
.result-block.expanded .content-wrapper {
  padding: 0px 8px 8px 8px;
  margin-top: 8px;
}
.tools-block.expanded .content-wrapper {
  padding: 0px 8px 8px 8px;
  margin-top: 8px;
}
.tool-block {
  border-radius: 6px;
  padding: 0;
  margin: 0px 0px 0px 6px;
  overflow: hidden;
}
.json-wrapper {
  border-radius: 6px;
  padding: 0;
  margin-top: 0;
  overflow: hidden;
}
.json-wrapper.expanded {
  margin-left: 6px;
  padding: 0px 2px 0px 2px;
}
.json-wrapper.expanded pre {
  margin: 0 0 4px 0;
}
.output-wrapper {
  border-radius: 6px;
  padding: 0;
  margin-top: 0;
  overflow: hidden;
}
.output-wrapper.expanded {
  margin-left: 6px;
  padding: 0px 2px 0px 2px;
}
.think-content {
  padding: 6px;
  border-radius: 6px;
  border: 1px solid var(--vscode-commandCenter-inactiveBorder);
}
.conclusion-content {
  border: 1px transparent;
}
.icon-button {
  background: none;
  border: none;
  color: var(--vscode-icon-foreground);
  cursor: pointer;
  padding: 4px;
  margin: 0 2px;
  border-radius: 3px;
}
.icon-button:hover {
  background-color: var(--vscode-toolbar-hoverBackground);
}
.content-header {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  height: 16px;
  padding: 2px;
}
.content-header img {
  width: 8px;
  height: 8px;
  padding: 2px;
  margin-right: 4px;
  border-radius: 3px;
  background-color: var(--vscode-toolbar-hoverBackground);
}
.content-header-content {
  font-weight: 500;
  font-size: 11px;
  line-height: 12px;
  opacity: 0.8;
}
.code-block-wrapper {
    display: flex;
    flex-direction: column;
    position: relative;
    background: var(--vscode-textCodeBlock-background);
    border: 1px solid var(--line-01);
    border-radius: 5px;
    overflow: hidden;
    overflow-x: auto;
    overflow-y: auto;
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
.html-block {
  backdrop-filter: blur(10px);
  /* white-space: pre-wrap; */
  word-wrap: break-word;
  word-break: normal;
  background-color: transparent;
  padding: 8px;
  border-radius: 5px;
}
.text-block {
    backdrop-filter: blur(10px);
    /* white-space: pre-wrap; */
    word-wrap: break-word;
    word-break: normal;
    background-color: transparent;
    padding: 8px;
    border-radius: 5px;
}
.text-content {
  box-sizing: border-box;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  transition: height 0.3s ease;
  color: var(--vscode-editor-foreground);
}
.textarea-block {
    position: relative;
    display: flex;
    flex-direction: column;
    border: solid 1px transparent;
    border-radius: 5px;
    background-image: var(--input-content-bg), var(--input-bg);
    background-origin: border-box;
    background-clip: content-box, border-box;
    transition: height 0.2s ease;
    resize: vertical;
    opacity: 0.9;
}
.textarea-content {
    flex: 1;
    background-color: transparent;
    color: var(--vscode-input-foreground);
    border: 1px solid transparent;
    padding: 8px;
    border-radius: 5px;
    resize: none;
    line-height: 19px;
    min-height: 19px !important;
    max-height: none;
    width: calc(100% - 16px);
    overflow-x: auto;
    overflow-y: hidden;
    box-sizing: border-box;
    transition: height 0.2s ease;
}
.textarea-content:focus {
  outline: none;
}
.textarea-block:focus-within {
  box-shadow: 0 0 15px rgba(238, 168, 255, 0.5);
}
.textarea-block:hover {
  box-shadow: 0 0 15px rgba(238, 168, 255, 0.5);
}
</style>