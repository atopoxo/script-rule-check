<template>
  <div id="app">
    <div v-if="session && !isInHistoryView" class="chat-container">
      <div class="references-bar">
        <div v-for="(ref, index) in references" :key="index" class="reference-tag">
          <i :class="`codicon ${getRefIcon(ref.type)}`"></i>
          <span>{{ ref.name }}</span>
          <button class="delete-reference" @click="removeReference(index)">
            <i class="codicon codicon-close"></i>
          </button>
        </div>
      </div>
      <div class="messages-container">
        <div v-for="(msg, index) in session.messages" :key="index" :class="`message ${msg.role}`">
          <div class="avatar">
            <i :class="msg.role === 'user' ? 'codicon codicon-person' : 'codicon codicon-server'"></i>
          </div>
          <div class="content">
            <div class="text">{{ msg.content }}</div>
            <!-- 引用展示 -->
            <div v-if="msg.references && msg.references.length > 0" class="references">
              <div v-for="(ref, refIndex) in msg.references" :key="refIndex" class="reference">
                <i :class="`codicon ${getRefIcon(ref.type)}`"></i>
                <span>{{ ref.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="input-container" :style="{ height: containerHeight + 'px' }">
        <textarea 
          v-model="messageInput" 
          :placeholder="placeholderText"
          ref="textareaRef"
          @input="adjustTextareaHeight"
          @keydown="handleKeyDown"
        ></textarea>
        <div class="input-functions">
          <div class="input-functions-left">
            <button class="icon-button" @click="addReference">#</button>
            <div class="ref-tooltip">选择上下文</div>
          </div>
          <div class="input-functions-right">
            <button class="icon-button model-select" @click="selectModel">DeepSeek-V3-0324</button>
            <button class="icon-button message-send" @click="sendMessage"></button>
            <div class="send-tooltip">发送⏎</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 历史视图 -->
    <div v-else-if="isInHistoryView" class="history-container">
      <div class="title-bar">
        <button class="icon-button" @click="backToChat">
          <i class="codicon codicon-arrow-left"></i>
        </button>
        <h2>历史会话</h2>
      </div>
      
      <div v-for="(group, date) in groupedSessions" :key="date" class="date-section">
        <div class="date-header">{{ date }}</div>
        <div class="sessions-list">
          <div 
            v-for="sess in group" 
            :key="sess.id" 
            class="session-item"
            @click="loadSession(sess.id)"
          >
            <i class="codicon codicon-comment"></i>
            <div class="session-info">
              <div class="session-title">{{ sess.title }}</div>
              <div class="session-time">{{ formatTime(sess.lastActive) }}</div>
            </div>
            <button 
              class="icon-button delete-button" 
              @click.stop="deleteSession(sess.id)"
              title="删除会话"
            >
              <i class="codicon codicon-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, computed } from 'vue';
import type { ChatSession, Reference } from '../types/ChatTypes';
import type { Window }  from '../types/GlobalTypes';

declare const window: Window;

export default defineComponent({
  setup() {
    const vscode = (window as any).acquireVsCodeApi();
    const session = ref<ChatSession | null>(null);
    const isInHistoryView = ref(false);
    const historySessions = ref<ChatSession[]>([]);
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const placeholderText = ref(isMac ? '「↑↓」切换历史输入，「⌘+⏎」换行' : '「↑↓」切换历史输入，「Ctrl+⏎」换行');
    const messageInput = ref('');
    const references = ref<Reference[]>([]);
    const maxTextLines = 16;
    const textAreaBorder = 2;
    const textAreaPadding = 16;
    const textAreaLineHeight = 19;
    const defaultFunctionContainerHeight = 32;
    const maxTextAreaHeight = textAreaLineHeight * maxTextLines;
    const defaultInputContainerHeight = textAreaBorder + textAreaPadding + textAreaLineHeight + defaultFunctionContainerHeight;
    const containerHeight = ref(defaultInputContainerHeight);
    const textareaRef = ref<HTMLTextAreaElement | null>(null);
    
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          messageInput.value += '\n';
          adjustTextareaHeight();
        } else if (!event.shiftKey) {
          event.preventDefault();
          sendMessage();
        }
      }
    };

    const adjustTextareaHeight = async() => {
      if (!textareaRef.value) return;
      const target = textareaRef.value;
      target.value = messageInput.value;
      const scrollHeight = getScrollHeight(target);
      const contentHeight = Math.min(scrollHeight, maxTextAreaHeight);
      target.style.height = `${contentHeight}px`;
      target.style.overflowY = scrollHeight > maxTextAreaHeight ? 'auto' : 'hidden';
      containerHeight.value = textAreaBorder + contentHeight + defaultFunctionContainerHeight;
    };

    function getScrollHeight(target: HTMLTextAreaElement) {
      const hiddenTextarea = document.createElement('textarea');
      hiddenTextarea.setAttribute('style', `
        position: absolute;
        visibility: hidden;
        height: 0;
        overflow: hidden;
        ${getComputedStyleText(target)}  // ✅ 使用自定义方法
      `);
      hiddenTextarea.value = target.value;

      document.body.appendChild(hiddenTextarea);
      const style = getComputedStyle(hiddenTextarea);
      const lineHeight = parseInt(style.lineHeight) || 20;
      const paddingTop = parseInt(style.paddingTop) || 0;
      const paddingBottom = parseInt(style.paddingBottom) || 0;
      const paddingLeft = parseInt(style.paddingLeft) || 0;
      const paddingRight = parseInt(style.paddingRight) || 0;
      const borderTop = parseInt(style.borderTopWidth) || 0;
      const borderBottom = parseInt(style.borderBottomWidth) || 0;
      const fontSize = parseInt(style.fontSize) || 16;
      const fontFamily = style.fontFamily;
      const textareaWidth = target.clientWidth;
      const availableWidth = textareaWidth - paddingLeft - paddingRight;

      let totalLines = 0;
      const explicitLines = target.value.split(/\r?\n|\r/);
      explicitLines.forEach(line => {
        if (line.length === 0) {
          totalLines += 1;
          return;
        }
        let currentLineWidth = 0;
        let lineCountForThisLine = 1;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const charWidth = getCharWidth(char, fontSize, fontFamily);
          if (currentLineWidth + charWidth > availableWidth) {
            lineCountForThisLine++;
            currentLineWidth = charWidth;
          } else {
            currentLineWidth += charWidth;
          }
        }
        totalLines += lineCountForThisLine;
      });
      let contentHeight = totalLines * lineHeight;
      if (style.boxSizing === 'border-box') {
        contentHeight += paddingTop + paddingBottom + borderTop + borderBottom;
      } else {
        contentHeight += paddingTop + paddingBottom;
      }
      document.body.removeChild(hiddenTextarea);
      return contentHeight;
    }

    function getComputedStyleText(element: HTMLElement): string {
      const computedStyle = window.getComputedStyle(element);
      const essentialProps = [
        'font-family', 'font-size', 'font-weight', 'font-style',
        'line-height', 'letter-spacing', 'word-spacing',
        'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
        'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
        'box-sizing'
      ];
      
      return essentialProps.map(prop => 
        `${prop}:${computedStyle.getPropertyValue(prop)}`
      ).join(';');
    }

    function getCharWidth(char: string, fontSize: number, fontFamily: string): number {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      ctx.font = `${fontSize}px ${fontFamily}`;
      return ctx.measureText(char).width;
    }

    // 计算属性：按日期分组的历史会话
    const groupedSessions = computed(() => {
      const groups: Record<string, ChatSession[]> = {};
      historySessions.value.forEach(sess => {
        const date = new Date(sess.lastActive).toLocaleDateString();
        if (!groups[date]) groups[date] = [];
        groups[date].push(sess);
      });
      return groups;
    });
    // 获取引用图标
    const getRefIcon = (type: string) => {
      return type === 'code' ? 'codicon-symbol-method' : 
             type === 'file' ? 'codicon-file' : 'codicon-folder';
    };

    // 格式化时间
    const formatTime = (timestamp: number) => {
      return new Date(timestamp).toLocaleTimeString();
    };

    // 创建新会话
    const createSession = () => {
      vscode.postMessage({ type: 'createSession' });
    };

    // 发送消息
    const sendMessage = () => {
      if (!messageInput.value.trim()) return;
      
      vscode.postMessage({
        type: 'sendMessage',
        content: messageInput.value,
        references: references.value
      });
      
      // 清空输入和引用
      messageInput.value = '';
      references.value = [];

      if (textareaRef.value) {
        textareaRef.value.style.height = 'auto';
        containerHeight.value = defaultInputContainerHeight;
      }
    };

    // 添加引用
    const addReference = () => {
      vscode.postMessage({ type: 'addReference' });
    };

    // 移除引用
    const removeReference = (index: number) => {
      references.value.splice(index, 1);
    };

    // 更新标题
    const updateTitle = () => {
      if (session.value) {
        vscode.postMessage({
          type: 'updateTitle',
          title: session.value.title
        });
      }
    };

    // 加载会话
    const loadSession = (sessionId: string) => {
      vscode.postMessage({ type: 'loadSession', sessionId });
    };

    // 删除会话
    const deleteSession = (sessionId: string) => {
      vscode.postMessage({ type: 'deleteSession', sessionId });
    };

    // 显示历史
    const showHistory = () => {
      vscode.postMessage({ type: 'showHistory' });
    };

    // 返回聊天
    const backToChat = () => {
      vscode.postMessage({ type: 'backToChat' });
    };
    const selectModel = () => {
      vscode.postMessage({ type: 'selectModel' });
    };

    onMounted(() => {
        window.addEventListener('message', (event: MessageEvent) => {
            const message = event.data;
            switch (message.type) {
              case 'update':
                  session.value = message.session;
                  isInHistoryView.value = message.isInHistoryView;
                  historySessions.value = message.historySessions || [];
                  break;
              case 'addReference':
                  references.value.push(message.reference);
                  break;
              }
        });
        vscode.postMessage({ type: 'ready' });
    });

    return {
      session,
      isInHistoryView,
      historySessions,
      placeholderText,
      messageInput,
      references,
      textareaRef,
      containerHeight,
      handleKeyDown,
      adjustTextareaHeight,
      groupedSessions,
      getRefIcon,
      formatTime,
      createSession,
      sendMessage,
      addReference,
      removeReference,
      updateTitle,
      loadSession,
      deleteSession,
      showHistory,
      backToChat,
      selectModel
    };
  }
});
</script>

<style scoped>

#app {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.welcome-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 20px;
  text-align: center;
}

.welcome-view h1 {
  margin-bottom: 16px;
}

.welcome-view p {
  margin-bottom: 24px;
  color: var(--vscode-descriptionForeground);
}

.primary-button {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 8px 16px;
  border-radius: 2px;
  cursor: pointer;
}

.primary-button:hover {
  background-color: var(--vscode-button-hoverBackground);
}

/* 聊天容器 */
.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.title-bar {
  display: flex;
  padding: 10px;
  border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
  background-color: var(--vscode-editor-background);
}

.session-title {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--vscode-foreground);
  font-size: 14px;
  padding: 4px 8px;
  margin-right: 10px;
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

/* 引用栏 */
.references-bar {
  display: flex;
  flex-wrap: wrap;
  padding: 5px;
  border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
  background-color: var(--vscode-sideBar-background);
  max-height: 80px;
  overflow-y: auto;
}

.reference-tag {
  display: flex;
  align-items: center;
  background-color: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  border-radius: 3px;
  padding: 3px 8px;
  margin: 3px;
  font-size: 12px;
}

.delete-reference {
  background: none;
  border: none;
  color: inherit;
  margin-left: 5px;
  cursor: pointer;
}

/* 消息容器 */
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.message {
  display: flex;
  margin-bottom: 15px;
}

.message.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: var(--vscode-activityBarBadge-background);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 10px;
}

.content {
  max-width: 70%;
  padding: 8px 12px;
  border-radius: 5px;
  background-color: var(--vscode-input-background);
}

.message.user .content {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.text {
  white-space: pre-wrap;
  word-break: break-word;
}

.references {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--vscode-sideBarSectionHeader-border);
  font-size: 12px;
}

.reference {
  display: flex;
  align-items: center;
  margin-top: 4px;
}

.reference i {
  margin-right: 5px;
}

/* 输入区域 */
.input-container {
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 1.5% 1.5% 2% 1.5%;
  /* border-top: 1px solid var(--vscode-sideBarSectionHeader-border); */
  /* background-color: var(--vscode-editor-background); */
  border: solid 2px transparent;
  border-radius: 10px;
  background-image: linear-gradient(var(--vscode-editor-background), var(--vscode-editor-background)), linear-gradient(to right, #643f42, #636067);
  background-origin: border-box;
  background-clip: content-box, border-box;
  transition: height 0.2s ease;
  resize: vertical;
}
.input-container:focus-within {
  box-shadow: 0 0 15px rgba(101, 67, 66, 0.8);
}
.input-container:hover {
  box-shadow: 0 0 15px rgba(101, 67, 66, 0.8);
}

.input-container textarea {
  flex: 1;
  /* background: var(--vscode-input-background); */
  background-color: transparent;
  color: var(--vscode-input-foreground);
  border: 1px solid transparent;
  padding: 8px;
  resize: none;
  line-height: 19px;
  min-height: 19px !important;
  max-height: none;
  overflow-y: hidden;
}
.input-container textarea:focus {
  outline: none;
}
.input-container textarea {
  flex: 1;
  /* background: var(--vscode-input-background); */
  background-color: transparent;
  color: var(--vscode-input-foreground);
  border: 1px solid transparent;
  padding: 8px;
  resize: none;
  font-family: inherit;
  margin: 0 5px;
}

.input-functions {
  display: flex;
  margin: 3px 10px;
  align-items: center;
  flex-direction: row;
  justify-content: space-between;
  height: 26px;
}
.input-functions-left {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 100%;
}
.input-functions-left button {
  height: 26px;
  width: 26px;
  padding: 0;
  margin: 0;
  line-height: 26px;
  text-align: center;
  font-size: 14px;
  font-family: "Comic Sans MS", cursive, sans-serif;
  border-radius: 30%;
}
.ref-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background-color: var(--vscode-editorWidget-background);
  color: var(--vscode-editorWidget-foreground);
  padding: 4px 8px;
  border-radius: 10px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 1000;
  border: 1px solid var(--vscode-widget-border);
  box-shadow: 0 2px 8px var(--vscode-widget-shadow);
  margin-bottom: 10px;
}
.ref-tooltip::before {
  content: '';
  position: absolute;
  width: 0;
  height: 0;
  left: 50%;
  top: 100%;
  transform: translate(-50%, 0);
  z-index: 3;
  box-sizing: content-box;
  border-width: 6px;
  border-style: solid;
  border-color: var(--vscode-editorWidget-background) transparent transparent transparent;
}
.ref-tooltip::after {
  content: '';
  position: absolute;
  width: 0;
  height: 0;
  left: 50%;
  top: calc(100% + 1px);
  transform: translate(-50%, 0);
  z-index: 2;
  box-sizing: content-box;
  border-width: 6px;
  border-style: solid;
  border-color: var(--vscode-widget-border) transparent transparent transparent;
}
.input-functions-left button:hover + .ref-tooltip {
  opacity: 1;
}

.input-functions-right {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 100%;
}
.input-functions-right .icon-button.model-select {
  height: 22px;
  padding: 2px 4px;
  margin: 0;
  line-height: 18px;
  text-align: center;
  font-size: 10px;
  border-radius: 5px;
  border: 1px solid var(--vscode-widget-border);
}
.input-functions-right .icon-button.message-send {
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
  background-size: 14px;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 30%;
  margin: 0 0 0 5px;
}
@media (prefers-color-scheme: light) {
  .message-send {
    background-image: url('@/assets/icons/light/send.svg');
  }
}

/* 深色主题图标 */
@media (prefers-color-scheme: dark) {
  .message-send {
    background-image: url('@/assets/icons/dark/send.svg');
  }
}
.send-tooltip {
  position: absolute;
  bottom: 100%;
  left: calc(100% - 13px);
  transform: translateX(-50%);
  background-color: var(--vscode-editorWidget-background);
  color: var(--vscode-editorWidget-foreground);
  padding: 4px 8px;
  border-radius: 10px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 1000;
  border: 1px solid var(--vscode-widget-border);
  box-shadow: 0 2px 8px var(--vscode-widget-shadow);
  margin-bottom: 10px;
}
.send-tooltip::before {
  content: '';
  position: absolute;
  width: 0;
  height: 0;
  left: 50%;
  top: 100%;
  transform: translate(-50%, 0);
  z-index: 3;
  box-sizing: content-box;
  border-width: 6px;
  border-style: solid;
  border-color: var(--vscode-editorWidget-background) transparent transparent transparent;
}
.send-tooltip::after {
  content: '';
  position: absolute;
  width: 0;
  height: 0;
  left: 50%;
  top: calc(100% + 1px);
  transform: translate(-50%, 0);
  z-index: 2;
  box-sizing: content-box;
  border-width: 6px;
  border-style: solid;
  border-color: var(--vscode-widget-border) transparent transparent transparent;
}
.input-functions-right .icon-button.message-send:hover + .send-tooltip {
  opacity: 1;
}

/* 历史视图 */
.history-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.date-section {
  margin-bottom: 15px;
}

.date-header {
  padding: 8px 15px;
  background-color: var(--vscode-sideBarSectionHeader-background);
  color: var(--vscode-sideBarSectionHeader-foreground);
  font-weight: bold;
}

.sessions-list {
  padding: 0 10px;
}

.session-item {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  cursor: pointer;
  border-radius: 3px;
}

.session-item:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.session-info {
  flex: 1;
  margin-left: 10px;
}

.session-title {
  font-weight: 500;
}

.session-time {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}

.delete-button {
  visibility: hidden;
}

.session-item:hover .delete-button {
  visibility: visible;
}
</style>