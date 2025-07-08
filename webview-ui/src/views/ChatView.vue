<template>
  <div id="app">
    <div v-if="selectedSession && !isInHistoryView" class="chat-container">
      <div class="title-bar">
        <sy-menu-bar :isDark="isDark" :title="titleBarText" :items="menuItems" @click="handleMenuClick"></sy-menu-bar>
      </div>
      <div class="messages-container" ref="messagesContainerRef">
        <div v-for="(msg, index) in selectedSession.history" :key="index" :class="`message ${msg.role}`">
          <div v-if="msg.role === 'user' || msg.role === 'assistant'" class="role-block">
            <div class="avatar">
              <img :src="getRoleIconPath(msg.role)" />
            </div>
            <div class="role-name" v-if="msg.role === 'assistant'">AI 助手</div>
          </div>
          <div class="content-block">
            <div v-if="msg.contextOption && msg.contextOption.length > 0" class="context-wraper">
              <div class="context-wraper-box">
                <div v-if="modifiedIndex == index" class="context-wraper-left">
                  <button class="icon-button item-context" @click="showContextOptions(index)">#</button>
                  <sy-selector v-if="showCurrentContextOptions" :visible="showCurrentContextOptions" class="reference-selector left"
                    :ref="el => setCurrentContextSelector(el, index)"
                    title="上下文"
                    :width="460"
                    :isDark = isDark
                    :items="contextOption"
                    :mutiSelect="true"
                    :showChoice="true"
                    :index="index"
                    :selectedItems="getCurrentContextItems(msg.contextOption)"
                    subMenuPosition="top"
                    @close="handleReferenceSelectorClose"
                    @select="handleReferenceSelect"
                    @selectFiles="handleReferenceSelectFiles"
                    @selectWorkspace="handleReferenceSelectWorkspace"
                  />
                  <div class="ref-tooltip">选择上下文</div>
                </div>
                <div class="context-wraper-right">
                  <button class="icon-button context-header" @click="expandContext(index, msg.contextExpand)">
                    <div class="context-header-content"> {{getContextDescription(msg.contextOption)}}</div>
                    <img :src="getContextIconPath(msg.contextExpand)" />
                  </button>
                </div>
              </div>
              <div v-if="msg.contextExpand" class="context-bar highlight"
                :style="{
                  width: `${contentBlockWidth - (8 + 8)}px`
                }">
                <sy-item-list :isDark="isDark" :index="index" :data="msg.contextOption" :isEditable="modifiedIndex != undefined"
                  @remove="removeReference"
                  @click="openContextFile"></sy-item-list>
              </div>
            </div>
            <div class="content">
              <message-render :isDark="isDark"
                :index="index"
                :contentType="msg.role === 'user' ? 'text': 'html'"
                :textAreaBorder=1
                :textAreaPadding=8
                :maxWidth="contentBlockWidth"
                :textEditable="modifiedIndex != undefined"
                :content="msg.content"
                @finish-edit="finishEdit"></message-render>
            </div>
            <div v-if="msg.role === 'user'" class="feedback user">
              <button v-if="modifiedIndex" class="icon-button" @click="cancelModify(index)">
                <img :src="getfeedbackIconPath('cancel')" />
              </button>
              <button v-if="!selectedSession.isAIStreamTransfer && !modifiedIndex" class="icon-button" @click="modify(index)">
                <img :src="getfeedbackIconPath('modify')" />
              </button>
              <button class="icon-button" @click="copy(msg.content, $event)">
                <img :src="getfeedbackIconPath('copy')" />
              </button>
              <button v-if="!selectedSession.isAIStreamTransfer" class="icon-button" @click="removeMessage(index)">
                <img :src="getfeedbackIconPath('remove')" />
              </button>
            </div>
          </div>
          <div v-if="msg.role === 'assistant'" class="feedback">
            <button v-if="!selectedSession.isAIStreamTransfer" class="icon-button" @click="regenerate(index)">
              <img :src="getfeedbackIconPath('regenerate')" />
            </button>
            <button class="icon-button" @click="copy(msg.content, $event)">
              <img :src="getfeedbackIconPath('copy')" />
            </button>
          </div>
        </div>
      </div>
      <div class="input-container" :style="{ height: containerHeight + 'px' }">
        <div class="context-bar" ref="contextBar">
          <div v-for="(ref, refIndex) in contextItems" :key="refIndex">
            <div v-if="ref.contextItem">
              <sy-tag :isDark = isDark :data = ref :refIndex="refIndex" @remove="removeReference"></sy-tag>
            </div>
          </div>
        </div>
        <textarea 
          :value="messageInput" 
          :placeholder="placeholderText"
          ref="textareaRef"
          @input="handleInput"
          @compositionstart="handleCompositionStart"
          @compositionend="handleCompositionEnd"
          @keydown="handleKeyDown"
        ></textarea>
        <div class="input-functions">
          <div class="input-functions-left">
            <button class="icon-button" @click="showContextOptions()">#</button>
            <sy-selector v-if="showReferenceSelector" :visible="showReferenceSelector" class="reference-selector" ref="referenceSelector"
              title="上下文"
              :width="460"
              :isDark = isDark
              :items="contextOption"
              :mutiSelect="true"
              :showChoice="true"
              :selectedItems="contextItems"
              @close="handleReferenceSelectorClose"
              @select="handleReferenceSelect"
              @selectFiles="handleReferenceSelectFiles"
              @selectWorkspace="handleReferenceSelectWorkspace"
            />
            <div class="ref-tooltip">选择上下文</div>
          </div>
          <div class="input-functions-right">
            <button class="icon-button model-select" @click="selectModel">{{ selectedModel }}</button>
            <sy-selector v-if="showModelSelector" :visible="showModelSelector" class="model-selector" ref="modelSelector"
              title="选择模型"
              :width="300"
              :isDark = isDark
              :items="modelOptions"
              :mutiSelect="false"
              :showChoice="true"
              @close="handleModelSelectorClose"
              @select="handleModelSelect"
            />
            <button class="icon-button message-send" @click="handleMessage()"
              :class="{
                'ai-stream-finish': !selectedSession.isAIStreamTransfer,
                'ai-stream-transfering': selectedSession.isAIStreamTransfer
              }"></button>
            <div class="send-tooltip">发送⏎</div>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="isInHistoryView" class="history-container">
      <history-view :isDark="isDark" :groupedSessions="historySessions"
        @back="backToChat()"
        @select="selectSession"
        @remove="removeSession"></history-view>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, watch, onMounted, onBeforeUnmount, reactive, ref, toRaw, nextTick } from 'vue';
import type { Session, SessionRecordList, SessionRecord, SelectorItem, MenuItem, ModelInfo, ContextOption } from '../types/ChatTypes';
import SyMenuBar from '../components/SyMenuBar.vue';
import MessageRender from '../components/MessageRender.vue';
import SySelector from '../components/SySelector.vue';
import SyTag from '../components/SyTag.vue';
import HistoryView from './HistoryView.vue';
import SyItemList from '../components/SyItemList.vue';
import { currentModuleUrl, iconRoot } from '../types/GlobalTypes';
import { throttle } from '../functions/BaseFunctions';
import { cloneDeep } from 'lodash';

export default defineComponent({
  components: {
    SyMenuBar, MessageRender, SySelector, SyTag, HistoryView, SyItemList
  },
  computed: {
    themeClass() {
      return this.isDark ? 'vscode-dark' : 'vscode-light';
    }
  },
  setup() {
    const vscode = (window as any).acquireVsCodeApi();
    const titleBarText = ref('大模型聊天');
    const menuItems = ref<MenuItem[]>([
      { id: 'addSession', tooltip: '创建新会话', icon: 'create-session.svg' },
      { id: 'showSessionsSnapshot', tooltip: '查看历史会话', icon: 'history.svg' },
      { id: 'settings', tooltip: '设置', icon:'settings.svg' },
    ]);
    const selectedSession = ref<Session | undefined>(undefined);
    const currentContextSelectors = ref<Map<number, InstanceType<typeof SySelector>>>(new Map());
    const referenceSelector = ref<InstanceType<typeof SySelector> | null>(null);
    const modelSelector = ref<InstanceType<typeof SySelector> | null>(null);
    const isInHistoryView = ref(false);
    const sessionTagFontSize = "11px";
    const historySessions = ref<SessionRecordList[]>([]);
    const showCurrentContextOptions = ref(false);
    const showReferenceSelector = ref(false);
    const contextItems = ref<SelectorItem[]>([]);
    const currentContext = ref<ContextOption[] | undefined>([]);
    const isDark = ref<boolean>(false);
    const showModelSelector = ref(false);
    const selectedModel = ref('');
    const modelOptions = ref<SelectorItem[]>([]);
    const contextOption = ref<SelectorItem[]>([]);
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const placeholderText = ref(isMac ? '「↑↓」切换历史输入，「⌘+⏎」换行' : '「↑↓」切换历史输入，「Ctrl+⏎」换行');
    const messageInput = ref('');
    const defaultReferenceHeight = 0;
    const referenceBarHeight = ref(defaultReferenceHeight);
    const contextBar = ref<HTMLElement | null>(null);
    let referencesBarResizeObserver: ResizeObserver | null = null;
    const maxTextLines = 16;
    const textAreaBorder = 2;
    const textAreaPadding = 16;
    const textAreaLineHeight = 19;
    const defaultFunctionContainerHeight = 32;
    const maxTextAreaHeight = textAreaLineHeight * maxTextLines;
    const defaultInputContainerHeight = defaultReferenceHeight + textAreaBorder + textAreaPadding + textAreaLineHeight + defaultFunctionContainerHeight;
    const containerHeight = ref(defaultInputContainerHeight);
    const textareaRef = ref<HTMLTextAreaElement | null>(null);
    let aiStreamMessageBeginFlag = false;
    let aiStreamMessage: any;
    const modifiedIndex = ref<number | undefined>(undefined);
    
    const handleMenuClick = (id: string) => {
      switch (id) {
        case 'addSession':
          vscode.postMessage({ type: 'addSession' });
          break;
        case 'showSessionsSnapshot':
          vscode.postMessage({ type: 'showSessionsSnapshot' });
          break;
        case 'settings':
          vscode.postMessage({ type: 'openSettings' });
          break;
      }
    }

    const getSelectedSession = (session: any): Session | undefined => {
        return {
          sessionId: session.sessionId,
          lastModifiedTimestamp: session.lastModifiedTimestamp,
          name: session.name,
          history: session.history.map((msg: any) => reactive({ ...msg })),
          isAIStreamTransfer: session.isAIStreamTransfer
        }
    }

    const getHistorySessions = (sessions: Session[]): SessionRecordList[] => {
      const currentTimestamp = new Date();
      const todayStart = new Date(currentTimestamp);
      todayStart.setHours(0, 0, 0, 0);
      const todayStartTime = todayStart.getTime();
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const yesterdayStartTime = yesterdayStart.getTime();
      const oneWeekAgoStart = new Date(todayStart);
      oneWeekAgoStart.setDate(oneWeekAgoStart.getDate() - 7);
      const oneWeekAgoStartTime = oneWeekAgoStart.getTime();
      const oneMonthAgoStart = new Date(todayStart);
      oneMonthAgoStart.setMonth(oneMonthAgoStart.getMonth() - 1);
      const oneMonthAgoStartTime = oneMonthAgoStart.getTime();
      const categorized: SessionRecordList[] = [];
      sessions.forEach(session => {
        const timestamp = session.lastModifiedTimestamp;
        if (timestamp >= todayStartTime) {
          createChatSessionSnapshot(categorized, "今天", todayStartTime, session);
        } else if (timestamp >= yesterdayStartTime) {
          createChatSessionSnapshot(categorized, "昨天", yesterdayStartTime, session);
        } else if (timestamp >= oneWeekAgoStartTime) {
          createChatSessionSnapshot(categorized, "一周内", oneWeekAgoStartTime, session);
        } else if (timestamp >= oneMonthAgoStartTime) {
          createChatSessionSnapshot(categorized, "一个月内", oneMonthAgoStartTime, session);
        } else {
          createChatSessionSnapshot(categorized, "更早的时候", oneMonthAgoStartTime + 1, session);
        }
      });
      return categorized;
    }

    const createChatSessionSnapshot = (categorized: SessionRecordList[], tag: string, tagTime: number, session: any) => {
      const item: SessionRecord = {
          id: session.id,
          selected: session.selected,
          lastModifiedTimestamp: session.lastModifiedTimestamp,
          name: session.name,
          isAIStreamTransfer: session.isAIStreamTransfer,
          icon: "talk.svg",
          tag: { text: 'chat', fontSize: sessionTagFontSize, border: true }
        };
      for (let i = 0; i < categorized.length; i++) {
        if (categorized[i].tag === tag) {
          categorized[i].records.push(item);
          return;
        }
      }
      categorized.push({ 
        tag: tag,
        timestamp: tagTime,
        records: [item]
      });
    }

    const selectModel = () => {
      showModelSelector.value = showModelSelector.value? false : true;
    };

    const handleModelSelectorClose = (_items: any[] | undefined) => {
      showModelSelector.value = false;
    }
    const handleModelSelect = (selected: any[]) => {
      if (selected.length > 0) {
        vscode.postMessage({ type: 'selectModel', data: {id: selected[0].id} });
      }
    };

    const getModels = (modelInfos: ModelInfo[]): SelectorItem[] => {
      const selectTagfontSize = "9px";
      return modelInfos.map((item) => ({
        type: 'model',
        id: item.id,
        name: item.name,
        tag: {
          text: item.type,
          fontSize: selectTagfontSize,
          border: true
        }
      }));
    };

    const showContextOptions = (index?: number) => {
      vscode.postMessage({ type: 'showContextOptions' });
      if (index) {
        showCurrentContextOptions.value = showCurrentContextOptions.value ? false: true;
      } else {
        showReferenceSelector.value = showReferenceSelector.value ? false : true;
      }
    }

    const getCurrentContextItems = (contextItems: ContextOption[]): SelectorItem[] => {
      const result = getReferenceOptions(contextItems);
      return result;
    }

    const setCurrentContextSelector = (el: any, index: number) => {
      if (el) {
        currentContextSelectors.value.set(index, el);
      } else {
        currentContextSelectors.value.delete(index);
      }
    };

    const handleReferenceSelectorClose = (items: SelectorItem[] | undefined, index: number) => {
      if (index < 0) {
        if (items) {
          contextItems.value = items;
        }
        showReferenceSelector.value = false;
      } else {
        const message = selectedSession.value?.history[index];
        if (message) {
          message.contextOption = getReferences(items);
        }
        showCurrentContextOptions.value = false;
      }
    }
    const handleReferenceSelect = (selected: SelectorItem[], index: number) => {
      if (index < 0) {
        contextItems.value = selected;
      } else {
        const message = selectedSession.value?.history[index];
        if (message) {
          message.contextOption = getReferences(selected);
        }
      }
    };

    const handleReferenceSelectFiles = (onlyFiles: boolean, index: number) => {
      vscode.postMessage({ type: 'selectFiles' , data: {onlyFiles: onlyFiles, index: index}});
    };

    const handleReferenceSelectWorkspace = (index: number) => {
      vscode.postMessage({ type: 'selectWorkspace', data: {index: index}});
    };

    const getReferenceOptions = (contextOption: ContextOption[]): SelectorItem[] => {
      const themeFolder = isDarkTheme() ? 'dark' : 'light';
      const selectTagfontSize = "9px";
      return contextOption.map((item) => ({
        type: item.type,
        id: item.id,
        name: item.name,
        icon: item.icon ? `${themeFolder}/${item.icon}` : undefined,
        tag: {text: item.describe, fontSize: selectTagfontSize, border: false},
        contextItem: item.contextItem,
        children: (item.children && item.children.length > 0) ? getReferenceOptions(item.children) : undefined
      }));
    };

    const getReferences = (selectedItems?: SelectorItem[]): ContextOption[] => {
      let result: ContextOption[] = [];
      if (selectedItems) {
        result = selectedItems.filter(item => item.type !== 'code-block').map((item) => ({
          type: item.type,
          id: item.id,
          name: item.name,
          describe: item.tag?.text as string,
          contextItem: toRaw(item.contextItem),
          children: (item.children && item.children.length > 0) ? getReferences(item.children) : undefined
        }));
      }
      return result;
    };

    const updateContext = (items: ContextOption[], index: number) => {
      if (index < 0) {
        const selectTagfontSize = "9px";
        items.forEach(item => {
          const newItem: SelectorItem = {
            type: item.type,
            id: item.id,
            name: item.name,
            tag: {text: item.describe, fontSize: selectTagfontSize, border: false},
            contextItem: item.contextItem
          }
          const contextIndex = contextItems.value.findIndex(existing => existing.id === newItem.id);
          if (contextIndex !== -1) {
            contextItems.value[contextIndex] = newItem;
          } else {
            contextItems.value.push(newItem);
          }
        });
      } else {
        const message = selectedSession.value?.history[index];
        if (message) {
          items.forEach(item => {
            const contextIndex = message.contextOption?.findIndex(existing => existing.id === item.id) as number;
            if (contextIndex !== -1) {
              if (message.contextOption) {
                message.contextOption[contextIndex] = item;
              }
            } else {
              message.contextOption?.push(item);
            }
          });
        }
      }
    };

    const expandContext = (index: number, expand: boolean | undefined) => {
      if (expand === undefined) {
        expand = false;
      }
      expand = !expand
      vscode.postMessage({ type: 'expandContext', data: {index: index, expand: expand} });
    };

    const getContextIconPath = (expand: boolean | undefined): string => {
      try {
          let iconPath = '';
          let relativePath = isDark.value ? 'dark' : 'light';
          if (expand) {
            iconPath = 'arrow-down.svg';
          } else {
            iconPath = 'arrow-left.svg';
          }
          return new URL(`${iconRoot}${relativePath}/${iconPath}`, currentModuleUrl).href;
      } catch (error) {
          console.error('图标加载失败:', error);
          return '';
      }
    }

    const getContextDescription = (contextOption: ContextOption[]): string => {
      const result = `${contextOption.length} 个上下文信息`;
      return result;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          const textarea = textareaRef.value as HTMLTextAreaElement;
          if (!textarea) {
            return;
          }
          const startPos = textarea.selectionStart;
          const endPos = textarea.selectionEnd;
          const value = textarea.value;
          const newValue = value.substring(0, startPos) + '\n' + value.substring(endPos);
          textarea.value = newValue;
          messageInput.value = newValue;
          const newPos = startPos + 1;
          textarea.setSelectionRange(newPos, newPos);
          adjustTextareaHeight();
        } else if (!event.shiftKey) {
          event.preventDefault();
          handleMessage();
        }
      }
    };

    const isComposing = ref(false);
    const pendingInput = ref('');

    const textareaStyles = ref({
      fontSize: 0,
      fontFamily: 'inherit',
      lineHeight: textAreaLineHeight,
      paddingTop: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 0,
      borderTopWidth: 0,
      borderBottomWidth: 0,
      boxSizing: 'content-box'
    });

    const handleInput = (event: Event) => {
      const target = event.target as HTMLTextAreaElement;
      const value = target.value;
      
      if (isComposing.value) {
        pendingInput.value = value;
      } else {
        messageInput.value = value;
        throttledAdjustHeight();
      }
    };

    const handleCompositionStart = () => {
      isComposing.value = true;
    };

    const handleCompositionEnd = (event: CompositionEvent) => {
      isComposing.value = false;
      messageInput.value = (event.target as HTMLTextAreaElement).value;
      throttledAdjustHeight();
    };

    const adjustTextareaHeight = throttle(async() => {
      if (!textareaRef.value) {
        return;
      }
      const target = textareaRef.value;
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
          boxSizing: style.boxSizing
        };
      }
      const contentHeight = calculateContentHeight(target.value, target.clientWidth);
      target.style.height = `${contentHeight}px`;
      target.style.overflowY = contentHeight >= maxTextAreaHeight ? 'auto' : 'hidden';
      containerHeight.value = referenceBarHeight.value + textAreaBorder + contentHeight + defaultFunctionContainerHeight;
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

    const removeReference = (refIndex: number, index: number) => {
      if (index >= 0) {
        const message = selectedSession.value?.history[index];
        if (message && message.contextOption?.length && refIndex >= 0 && refIndex < message.contextOption.length) {
          message.contextOption.splice(refIndex, 1);
        }
      } else {
        if (contextItems.value?.length && refIndex >= 0 && refIndex < contextItems.value.length) {
          contextItems.value.splice(refIndex, 1);
        }
      }
    };

    const openContextFile = (item: ContextOption) => {
      const context = toRaw(item);
      vscode.postMessage({ type: 'openContextFile', data: { context: context } });
    }

    const getfeedbackIconPath = (type: string) => { 
      try {
          let iconPath = '';
          let relativePath = isDark.value ? 'dark' : 'light';
          switch (type) {
            case 'regenerate':
              iconPath = 'refresh.svg';
              break;
            case 'copy':
              iconPath = 'copy.svg';
              break;
            case 'modify':
              iconPath = 'modify.svg';
              break;
            case 'cancel':
              iconPath = 'cancel-modify.svg';
              break;
            case 'remove':
              iconPath = 'remove.svg';
              break;
          }
          return new URL(`${iconRoot}${relativePath}/${iconPath}`, currentModuleUrl).href;
      } catch (error) {
          console.error('图标加载失败:', type, error);
          return '';
      }
    };

    // 创建新会话
    const createSession = () => {
      vscode.postMessage({ type: 'createSession' });
    };

    const getRoleIconPath = (role: string) => {
      try {
          let iconPath = '';
          let relativePath = isDark.value ? 'dark' : 'light';
          switch (role) {
            case 'user':
              iconPath = 'user.svg';
              break;
            case 'assistant':
              iconPath = 'assistant.svg';
              break;
          }
          return new URL(`${iconRoot}${relativePath}/${iconPath}`, currentModuleUrl).href;
      } catch (error) {
          console.error('图标加载失败:', role, error);
          return '';
      }
    }

    const handleMessage = () => {
      if (selectedSession.value?.isAIStreamTransfer == false) {
        cancelModify(modifiedIndex.value);
        const options = getReferences(contextItems.value)
        sendMessage(messageInput.value, undefined, options);
        contextItems.value = [];
        messageInput.value = '';
        if (textareaRef.value) {
          textareaRef.value.style.height = 'auto';
          containerHeight.value = defaultInputContainerHeight;
        }
      } else {
        vscode.postMessage({
          type: 'pauseAIStreamTransfer',
          data: { sessionId: selectedSession.value?.sessionId}
        });
      }
    }

    const sendMessage = (query: string, index?: number, contextOption?: ContextOption[]) => {
      try {
        if (!query.trim()) {
          return;
        }
        vscode.postMessage({
          type: 'sendMessage',
          data: {
            sessionId: selectedSession.value?.sessionId,
            content: query,
            index: index,
            contextOption: contextOption,
            contextExpand: false
          }
        });
      } catch (error) {
        console.error(error);
      }
    };

    const regenerate = (index: number) => {
      vscode.postMessage({
        type: 'regenerate',
        data: { index: index - 1}
      })
    };

    const modify = (index: number) => {
      modifiedIndex.value = index;
      const original = selectedSession.value?.history[index]?.contextOption;
      currentContext.value = original ? cloneDeep(original) : original;
    };

    const cancelModify = (index: number | undefined) => {
      if (index) {
        const message = selectedSession.value?.history[index];
        if (message) {
          message.contextOption = currentContext.value;
        }
      }
      modifiedIndex.value = undefined;
    };

    const finishEdit = (value: string, index: number) => {
      const options = selectedSession.value?.history[index]?.contextOption?.map(item => {
          return toRaw(item);
        }
      );
      sendMessage(value, index, options);
      modifiedIndex.value = undefined;
    }

    const copy = (content: string, event: MouseEvent) => {
      const button = event.target as HTMLElement;
      if (!button) {
          return;
      }

      if (!document.hasFocus()) {
          window.focus();
      }
      if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(content).then(() => {
              showFeedback(button, '✓');
          }).catch(err => {
              console.error('Clipboard API失败:', err);
              fallbackCopy(content, button);
          });
      } else {
          fallbackCopy(content, button);
      }
    }

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
        feedbackEl.className = isError ? 'feedback-copy error' : 'feedback-copy';
        
        button.replaceWith(feedbackEl);
        setTimeout(() => {
            feedbackEl.replaceWith(button);
        }, 1000);
    };

    const setSessionName = () => {
      if (selectedSession.value) {
        vscode.postMessage({
          type: 'setSessionName',
          sessionId: selectedSession.value.sessionId,
          sessionName: selectedSession.value.name
        });
      }
    };

    const removeMessage = (index: number) => { 
      vscode.postMessage({
        type: 'removeMessage',
        data: { sessinId: selectedSession.value?.sessionId, index: index}
      });
    };

    const selectSession = (sessionId: string) => {
      vscode.postMessage({ 
        type: 'selectSession', 
        data: {sessionId: sessionId }
      });
    };

    const removeSession = (sessionId: string) => {
      vscode.postMessage({ 
        type: 'removeSession', 
        data: {sessionId: sessionId }
      });
    };

    const backToChat = () => {
      isInHistoryView.value = false;
    };

    const isDarkTheme = () => {
        return isDark.value;
    };

    const handleAIStreamStart = (data: any) => {
      selectedSession.value = getSelectedSession(data.selectedSession);
      if (data.messageIndex === -1) {
        aiStreamMessage = reactive({
          role: "assistant",
          content: "正在等待回复..."
        });
        selectedSession.value?.history.push(aiStreamMessage);
        aiStreamMessageBeginFlag = true;
      } else {
        aiStreamMessage = selectedSession.value?.history[data.messageIndex];
        if (data.reconnect) {
          aiStreamMessageBeginFlag = false;
        } else {
          aiStreamMessage.content = "正在等待回复...";
          aiStreamMessageBeginFlag = true;
        }
      }
      scrollToBottom();
    };
    const handleAIStreamChunk = async (chunk: any) => {
      if (chunk) {
        if (aiStreamMessageBeginFlag) {
          aiStreamMessage.content = '';
          aiStreamMessageBeginFlag = false;
        }
        aiStreamMessage.content += chunk;
        scrollToBottom();
        await nextTick();
      }
    };

    const handleAIStreamEnd = (data: any) => {
      if (selectedSession.value?.sessionId == data.currentSession.sessionId) {
        selectedSession.value = getSelectedSession(data.currentSession);
      }
      historySessions.value.forEach((categorized: SessionRecordList) => {
        categorized.records.forEach((session: SessionRecord) => {
          if (session.id === data.currentSession.sessionId) {
            session.isAIStreamTransfer = data.currentSession.isAIStreamTransfer;
          }
        })
      })
    };

    const scrollToBottom = () => {
      const container = document.querySelector('.chat-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    };

    watch(() => contextBar.value, (newVal, oldVal) => {
        if (oldVal && referencesBarResizeObserver) {
            referencesBarResizeObserver.unobserve(oldVal);
        }
        if (newVal) {
          if (!referencesBarResizeObserver) {
              referencesBarResizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    referenceBarHeight.value = entry.contentRect.height;
                    adjustTextareaHeight();
                }
            });
          }
          referencesBarResizeObserver.observe(newVal);
        }
      },
      { immediate: true } // 首次加载立即触发
    );

    const contentBlockWidth = ref(0);
    const messagesContainerRef = ref<HTMLElement | null>(null);
    let messagesContainerResizeObserver: ResizeObserver | null = null;

    watch(() => messagesContainerRef.value, (newVal, oldVal) => {
        if (oldVal && messagesContainerResizeObserver) {
            messagesContainerResizeObserver.unobserve(oldVal);
        }
        if (newVal) {
          if (!messagesContainerResizeObserver) {
              messagesContainerResizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    contentBlockWidth.value = entry.contentRect.width;
                }
            });
          }
          messagesContainerResizeObserver.observe(newVal);
        }
      },
      { immediate: true } // 首次加载立即触发
    );

    watch(showCurrentContextOptions, (newVal, oldVal) => {
        if (oldVal === true && newVal === false) {
            const selector = currentContextSelectors.value.get(modifiedIndex.value as number);
            if (selector) {
                selector.confirmSelection();
            }
        }
    });

    watch(showReferenceSelector, (newVal, oldVal) => {
        if (oldVal === true && newVal === false) {
            if (referenceSelector.value) {
                referenceSelector.value.confirmSelection();
            }
        }
    });

    watch(showModelSelector, (newVal, oldVal) => {
        if (oldVal === true && newVal === false) {
            if (modelSelector.value) {
                modelSelector.value.confirmSelection();
            }
        }
    });

    onMounted(() => {
        if (contextBar.value) {
            referencesBarResizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    referenceBarHeight.value = entry.contentRect.height;
                    adjustTextareaHeight();
                }
            });
            referencesBarResizeObserver.observe(contextBar.value);
        }
        window.addEventListener('message', (event: MessageEvent) => {
            const message = event.data;
            const type = message.type;
            const data = message.data;
            if (type === 'aiStreamChunk') {
              handleAIStreamChunk(data.content);
            }
            switch (type) {
              case 'initSession':
                  isDark.value = data.isDark;
                  titleBarText.value = data.aiCharacter.name || titleBarText.value;
                  selectedSession.value = getSelectedSession(data.selectedSession);
                  selectedModel.value = data.selectedModel.name;
                  modelOptions.value = getModels(data.modelInfos);
                  contextOption.value = getReferenceOptions(data.contextOption)
                  isInHistoryView.value = false;
                  break;
              case 'themeUpdate':
                  isDark.value = data.isDark;
                  break;
              case 'selectAICharacter':
                  titleBarText.value = data.aiCharacter.name || titleBarText.value;
                  break;
              case 'selectModel':
                  selectedModel.value = data.selectedModel.name;
                  break;
              case 'showContextOptions':
                  contextOption.value = getReferenceOptions(data.contextOption);
                  break;
              case 'updateContext':
                  if (data.query) {
                    sendMessage(data.query, undefined, data.contextOption);
                  } else {
                    updateContext(data.contextOption, data.index);
                  }
                  break;
              case 'aiStreamStart':
                  handleAIStreamStart(data);
                  break;
              case 'aiStreamEnd':
                  handleAIStreamEnd(data);
                  break;
              case 'removeMessage':
                  if (selectedSession.value?.sessionId == data.selectedSession.sessionId) {
                    selectedSession.value = getSelectedSession(data.selectedSession);
                  }
                  break;
              case 'showSessionsSnapshot':
                  historySessions.value = getHistorySessions(data.sessionsSnapshot);
                  isInHistoryView.value = true;
                  break;
              case 'addSession':
                  selectedSession.value = getSelectedSession(data.selectedSession);
                  isInHistoryView.value = false;
                  break;
              case 'expandContext':
                  if (selectedSession.value?.sessionId == data.sessionId) {
                    const history = selectedSession.value?.history;
                    if (history) {
                      history[data.index].contextExpand = data.expand;
                    }
                  }
                  break;
              case 'selectSession':
                  selectedSession.value = getSelectedSession(data.selectedSession);
                  isInHistoryView.value = false;
                  break;
              case 'removeSession':
                  selectedSession.value = getSelectedSession(data.selectedSession);
                  historySessions.value = getHistorySessions(data.sessionsSnapshot);
                  break;
            }
        });
        vscode.postMessage({ type: 'ready' });
    });

    onBeforeUnmount(() => {
        if (referencesBarResizeObserver) {
            referencesBarResizeObserver.disconnect();
        }
        if (messagesContainerResizeObserver) {
            messagesContainerResizeObserver.disconnect();
        }
    });

    return {
      vscode,
      isDark,
      titleBarText,
      menuItems,
      selectedSession,
      referenceSelector,
      modelSelector,
      isInHistoryView,
      historySessions,
      placeholderText,
      messageInput,
      contentBlockWidth,
      contextBar,
      contextItems,
      currentContext,
      expandContext,
      getContextIconPath,
      getContextDescription,
      textareaRef,
      referenceBarHeight,
      containerHeight,
      handleMenuClick,
      messagesContainerRef,
      handleKeyDown,
      handleInput,
      handleCompositionStart,
      handleCompositionEnd,
      createSession,
      getRoleIconPath,
      getfeedbackIconPath,
      modifiedIndex,
      handleMessage,
      sendMessage,
      regenerate,
      modify,
      cancelModify,
      finishEdit,
      copy,
      removeMessage,
      removeReference,
      openContextFile,
      setSessionName,
      selectSession,
      removeSession,
      backToChat,
      showCurrentContextOptions,
      showReferenceSelector,
      contextOption,
      showContextOptions,
      getCurrentContextItems,
      setCurrentContextSelector,
      handleReferenceSelectorClose,
      handleReferenceSelect,
      handleReferenceSelectFiles,
      handleReferenceSelectWorkspace,
      showModelSelector,
      modelOptions,
      selectedModel,
      selectModel,
      handleModelSelectorClose,
      handleModelSelect
    };
  }
});
</script>

<style scoped>

:global(:root) {
  --input-content-bg: linear-gradient(var(--vscode-editor-background), var(--vscode-editor-background));
  --input-active-bg: linear-gradient(90deg, #FF7979 15%, #EEA8FF 50%, #E5DCFF 85%);
  --input-bg: linear-gradient(90deg, rgba(255, 121, 121, 0.70) 15%, rgba(238, 168, 255, 0.70) 50%, rgba(229, 220, 255, 0.70) 85%);
}
#app {
  height: 100%;
  display: flex;
  flex-direction: column;
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

.chat-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.title-bar {
  display: flex;
  flex-direction: column;
  padding: 3px 5px;
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

/* 消息容器 */
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}
.message {
  display: flex;
  flex-direction: column;
  margin-bottom: 15px;
}
.message.user {
  align-items: flex-end;
}
.message.assistant {
  align-items: flex-start;
}
.message.system {
  align-items: center;
}
.role-block {
  display: flex;
  flex-direction: row;
  align-items: center;
  margin: 0px 0px 4px 0px;
}
.avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.role-name {
  font-size: 14px;
  font-weight: bold;
  margin-left: 3px;
}
.content-block {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.content {
  position: relative;
  background-color: transparent;
  border-radius: 5px;
}
.message.user .content {
  background-color: var(--vscode-list-inactiveSelectionBackground);
  color: var(--vscode-button-foreground);
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
.feedback.user:hover {
  opacity: 1;
}
.content:hover + .feedback.user {
  opacity: 1;
}
.feedback {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  margin: 6px 0 0 0;
}
.feedback.user {
  opacity: 0;
}
.feedback button {
  width: 24px;
  height: 24px;
  margin: 0 0;
  padding: 3px 3px;
  opacity: 0.6;
}
.feedback-copy {
    font-size: 14px;
    color: #4caf50;
}
.feedback-copy.error {
    color: #f44336;
}

.input-container {
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 1.5% 1.5% 2% 1.5%;
  /* border-top: 1px solid var(--vscode-sideBarSectionHeader-border); */
  /* background-color: var(--vscode-editor-background); */
  border: solid 1px transparent;
  border-radius: 5px;
  background-image: var(--input-content-bg), var(--input-bg);
  background-origin: border-box;
  background-clip: content-box, border-box;
  transition: height 0.2s ease;
  resize: vertical;
  opacity: 1;
}
.input-container:focus-within {
  box-shadow: 0 0 15px rgba(238, 168, 255, 0.5);
}
.input-container:hover {
  box-shadow: 0 0 15px rgba(238, 168, 255, 0.5);
}
.context-wraper {
  display: flex;
  flex-direction: column;
  border-radius: 5px;
  margin-bottom: 5px;
  align-items: flex-end;
}
.context-wraper-box {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
  margin: 0 0 3px 0;
}
.context-wraper-left {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
}
.icon-button.item-context {
  width: 12px;
  height: 12px;
  padding: 1px;
  font-size: 11px;
  line-height: 11px;

}
.context-wraper-right {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: center;
}
.context-header {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  height: 16px;
  padding: 2px;
}
.context-header img {
  width: 8px;
  height: 8px;
  padding: 2px;
  margin-left: 4px;
  border-radius: 3px;
  background-color: var(--vscode-toolbar-hoverBackground);
}
.context-header-content {
  font-weight: 500;
  font-size: 11px;
  line-height: 12px;
  opacity: 0.8;
}
.icon-button.expand {
  width: 14px;
  height: 14px;
}
.context-bar {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  border-radius: 5px;
}
.context-bar.highlight {
  background-color: var(--vscode-editor-selectionHighlightBackground);
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
  box-sizing: border-box;
  transition: height 0.2s ease;
}
.input-container textarea:focus {
  outline: none;
}
.input-container textarea {
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
.reference-selector {
  bottom: 100%;
}
.reference-selector.left {
  right: 100%;
  bottom: auto;
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
  z-index: 10;
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
.vscode-light .message-send.ai-stream-finish {
  background-image: url('@assets/icons/light/send.svg');
}
.vscode-dark .message-send.ai-stream-finish {
  background-image: url('@assets/icons/dark/send.svg');
}

.vscode-light .message-send.ai-stream-transfering {
  background-image: url('@assets/icons/light/pause.svg');
}
.vscode-dark .message-send.ai-stream-transfering {
  background-image: url('@assets/icons/dark/pause.svg');
}
.model-selector {
  bottom: 100%;
  right: 0;
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
  z-index: 10;
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