<template>
    <div class="history-container">
        <div class="back-container">
            <button class="icon-button back" @click="back">
                <img :src="getIconPath(returnIconPath)"/>
            </button>
            <div class="back-tooltip">返回到聊天窗口</div>
        </div>
        <div class="detail-container">
            <div class="detail-title">
                <img :src="getIconPath('history.svg')" />
                <div class="detail-title-text">历史会话</div>
            </div>
            <div class="detail-content">
                <div v-for="(group, index) in groupedSessions" :key="index" class="date-section">
                    <div class="date-header">{{ group.date }}</div>
                    <div class="sessions-list">
                        <div v-for="item in group.records" :key="item.id" class="session-item"
                            @mouseenter="handleItemHover(item.id)"
                            @mouseleave="handleItemLeave(item.id)"
                            @click="loadSession(item.id)"
                        >
                            <div class="item-content-left">
                                <div class="item-icon" v-if="item.icon">
                                    <img :src="getIconPath(item.icon)"/>
                                </div>
                                <div class="item-name">{{ item.title }}</div>
                            </div>
                            <div class="item-content-right">
                                <div class="item-tag" v-if="item.tag"
                                    :style="{
                                        'font-size': item.tag.fontSize || '12px',
                                        'border': item.tag.border ? '1px solid  var(--vscode-toolbar-hoverBackground)' : 'none'
                                    }"
                                >{{ item.tag.text }}</div>
                                <button v-if="showRemoveButton(item.id)" class="icon-button delete" @click.stop="deleteSession(item.id)"></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref, watchEffect } from 'vue';
import type { PropType } from 'vue';
import { currentModuleUrl, iconRoot } from '../types/GlobalTypes';
import type { SessionRecordList } from '../types/ChatTypes';

export default defineComponent({
    name: 'HistoryView',
  
    props: {
        isDark: {
            type: Boolean,
            default: false
        },
        groupedSessions: {
            type: Array as PropType<SessionRecordList[]>,
            required: true,
            default: () => [] 
        }
    },
  
    emits: ['back', 'loadSession', 'removeSession'],

    setup(props, { emit }) {
        const returnIconPath = ref<string>('return.svg');
        const themeIconRelativePath = ref<string>('');
        const removeButtonVisible = ref<Map<string, boolean>>(new Map());

        const getIconPath = (iconPath: string) => {
            try {
                return new URL(`${iconRoot}${themeIconRelativePath.value}/${iconPath}`, currentModuleUrl).href;
            } catch (error) {
                console.error('图标加载失败:', iconPath, error);
                return '';
            }
        }

        const back = () => {
            emit('back');
        };

        const loadSession = (id: string) => {
            emit('loadSession', id);
        }

        const deleteSession = (id: string) => {
            emit('removeSession', id);
        }

        const handleItemHover = (id: string) => {
            const item = removeButtonVisible.value?.get(id);
            if (item) {
                removeButtonVisible.value?.set(id, !item);
            } else {
                removeButtonVisible.value?.set(id, true);
            }
        };

        const handleItemLeave = (id: string) => {
            const item = removeButtonVisible.value?.get(id);
            if (item) {
                removeButtonVisible.value?.delete(id);
            } 
        };

        const showRemoveButton = (id: string) => {
            const item = removeButtonVisible.value?.get(id);
            const result = (item && item === true);
            return result;
        };

        watchEffect(() => {
            if (props.isDark) {
                themeIconRelativePath.value = 'dark';
            } else {
                themeIconRelativePath.value = 'light';
            }
        });

        return {
            returnIconPath,
            getIconPath,
            back,
            loadSession,
            deleteSession,
            handleItemHover,
            handleItemLeave,
            showRemoveButton
        };
    },
});
</script>

<style scoped>
.history-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    margin: 10px 10px;
}
.back-container {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
}
.icon-button {
    background: none;
    border: none;
    color: var(--vscode-icon-foreground);
    cursor: pointer;
    padding: 0;
    margin: 0;
    border-radius: 3px;
}
.icon-button:hover {
    background-color: var(--vscode-toolbar-hoverBackground);
}
.icon-button.back {
    width: 22px;
    height: 22px;
}
.back-tooltip {
    position: absolute;
    left: 34px;
    transform: translateX(0%);
    background-color: var(--vscode-editorWidget-background);
    color: var(--vscode-editorWidget-foreground);
    padding: 4px 4px;
    border-radius: 10px;
    font-size: 12px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease;
    z-index: 10;
    border: 1px solid var(--vscode-widget-border);
    box-shadow: 0 2px 8px var(--vscode-widget-shadow);
    margin-right: 2px;
}
.back-tooltip::before {
    content: '';
    position: absolute;
    width: 0;
    height: 0;
    top: 50%;
    right: 100%;
    transform: translate(0, -50%);
    z-index: 3;
    box-sizing: content-box;
    border-width: 6px;
    border-style: solid;
    border-color: transparent var(--vscode-editorWidget-background) transparent transparent;
}
.back-tooltip::after {
    content: '';
    position: absolute;
    width: 0;
    height: 0;
    top: 50%;
    right: calc(100% + 1px);
    transform: translate(0, -50%);
    z-index: 2;
    box-sizing: content-box;
    border-width: 6px;
    border-style: solid;
    border-color: transparent var(--vscode-widget-border) transparent transparent;
}
.icon-button.back:hover + .back-tooltip {
  opacity: 1;
}
.detail-container {
    display: flex;
    flex-direction: column;
    margin: 4px 2px;
}
.detail-title {
    display: flex;
    flex-direction: row;
    align-items: center;
}
.detail-title img {
    width: 18px;
    height: 18px;
}
.detail-title-text {
    font-size: 20px;
    margin-left: 4px;
}
.detail-content {
    display: flex;
    flex-direction: column;
}
.date-section {
    display: flex;
    flex-direction: column;
}
.date-header {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin: 4px 0;
}
.sessions-list {
    display: flex;
    flex-direction: column;
}
.session-item {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    margin: 6px 0;
    padding: 6px 6px;
    border-radius: 5px;
}
.session-item:hover {
    background-color: var(--vscode-toolbar-hoverBackground);
}
.item-icon {
    margin-right: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
}
.item-name {
    font-size: 14px;
    line-height: 1.4;
    margin-left: 4px;
}
.item-tag {
    opacity: 1;
    padding: 1px 4px;
    border-radius: 4px;
    display: inline-block;
    background-color: var(--vscode-toolbar-hoverBackground);
}
.item-content-left {
    display: flex;
    align-items: center;
}
.item-content-right {
    display: flex;
    align-items: center;
}
.item-content-right .icon-button.delete {
    background-image: url('@assets/icons/dark/delete.svg');
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
    background-size: 14px;
    width: 16px;
    height: 16px;
    border: none;
    border-radius: 30%;
    margin: 0 0 0 5px;
}
</style>