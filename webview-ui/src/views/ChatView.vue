<template>
  <div id="app">
    <!-- 欢迎视图 -->
    <div v-if="!session && !isInHistoryView" class="welcome-view">
      <h1>AI 聊天助手</h1>
      <p>开始一个新的会话来与AI助手交流</p>
      <button class="primary-button" @click="createNewSession">创建新会话</button>
    </div>

    <!-- 聊天视图 -->
    <div v-else-if="session && !isInHistoryView" class="chat-container">
      <!-- 标题栏 -->
      <div class="title-bar">
        <input 
          type="text" 
          class="session-title" 
          v-model="session.title" 
          placeholder="会话标题"
          @change="updateTitle"
        />
        <button class="icon-button" @click="selectModel" title="选择模型">
          <i class="codicon codicon-server"></i>
        </button>
        <button class="icon-button" @click="showHistory" title="历史会话">
          <i class="codicon codicon-history"></i>
        </button>
      </div>

      <!-- 引用栏 -->
      <div class="references-bar">
        <div v-for="(ref, index) in references" :key="index" class="reference-tag">
          <i :class="`codicon ${getRefIcon(ref.type)}`"></i>
          <span>{{ ref.name }}</span>
          <button class="delete-reference" @click="removeReference(index)">
            <i class="codicon codicon-close"></i>
          </button>
        </div>
      </div>

      <!-- 消息容器 -->
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

      <!-- 输入区域 -->
      <div class="input-container">
        <button class="icon-button" @click="addReference" title="添加引用">
          <i class="codicon codicon-link"></i>
        </button>
        <textarea 
          v-model="messageInput" 
          placeholder="输入消息..." 
          @keydown.enter.exact.prevent="sendMessage"
          @keydown.shift.enter.prevent="messageInput += '\n'"
        ></textarea>
        <button class="icon-button primary" @click="sendMessage" title="发送消息">
          <i class="codicon codicon-send"></i>
        </button>
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
    const messageInput = ref('');
    const references = ref<Reference[]>([]);
    
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
    const createNewSession = () => {
      vscode.postMessage({ type: 'createNewSession' });
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

    // 选择模型
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
      messageInput,
      references,
      groupedSessions,
      getRefIcon,
      formatTime,
      createNewSession,
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
/* 原有的 chat_view.css 内容可以放在这里 */
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
  display: flex;
  padding: 10px;
  border-top: 1px solid var(--vscode-sideBarSectionHeader-border);
  background-color: var(--vscode-editor-background);
}

.input-container textarea {
  flex: 1;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 2px;
  padding: 8px;
  resize: none;
  font-family: inherit;
  margin: 0 5px;
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