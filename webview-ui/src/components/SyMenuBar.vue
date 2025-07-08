<template>
    <div class="menu-bar">
        <div class="menu-content">
            <div class="menu-content-left">
                <span class="menu-describe">{{ title }}</span>
            </div>
            <div class="menu-content-right">
                <div v-for="(item, index) in items" :key="index" class="menu-item">
                    <button @click="itemClick(item.id)">
                        <img :src="getIconPath(item.icon)"/>
                    </button>
                    <div class="menu-item-tooltip">{{ item.tooltip }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref, watchEffect } from 'vue';
import type { PropType } from 'vue';
import { currentModuleUrl, iconRoot } from '../types/GlobalTypes';
import type { MenuItem } from '../types/ChatTypes';

export default defineComponent({
    name: 'SyMenuBar',
  
    props: {
        isDark: {
            type: Boolean,
            default: false
        },
        title: {
            type: String,
            required: true
        },
        items: {
            type: Array as PropType<MenuItem[]>,
            required: true
        }
    },
  
    emits: ['click'],
  
    setup(props, { emit }) {
        const themeIconRelativePath = ref<string>('');

        const getIconPath = (iconPath: string) => {
            try {
                return new URL(`${iconRoot}${themeIconRelativePath.value}/${iconPath}`, currentModuleUrl).href;
            } catch (error) {
                console.error('图标加载失败:', iconPath, error);
                return '';
            }
        }

        const itemClick = (id: string) => {
            emit('click', id);
        };

        watchEffect(() => {
            if (props.isDark) {
                themeIconRelativePath.value = 'dark';
            } else {
                themeIconRelativePath.value = 'light';
            }
        });

        return {
            getIconPath,
            itemClick,
        };
    },
});
</script>

<style scoped>
.menu-bar {
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 100%;
}
.menu-content {
    position: relative;
    display: flex;
    width: 100%;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding: 2px 5px;
    background-color: var(--sy-menu-bar-background-color);
}
.menu-content-left {
    display: flex;
    flex-direction: row;
    align-items: center;
}
.menu-describe {
    font-size: 12px;
    opacity: 1;
    color: var(--vscode-editorLink-activeForeground);
}
.menu-content-right {
    display: flex;
    flex-direction: row;
    align-items: center;
}
.menu-item {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    margin: 0 3px;
}
.menu-item button {
    height: 16px;
    width: 16px;
    padding: 1px;
    margin: 0;
    background: none;
    border: none;
    line-height: 14px;
    text-align: center;
    font-size: 14px;
    font-family: "Comic Sans MS", cursive, sans-serif;
    border-radius: 30%;
    cursor: pointer;
}
.menu-item button:hover {
  background-color: var(--vscode-toolbar-hoverBackground);
}
.menu-item-tooltip {
    position: absolute;
    top: 100%;
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
    margin-top: 10px;
}
.menu-item-tooltip::before {
    content: '';
    position: absolute;
    width: 0;
    height: 0;
    left: 50%;
    bottom: 100%;
    transform: translate(-50%, 0);
    z-index: 3;
    box-sizing: content-box;
    border-width: 6px;
    border-style: solid;
    border-color: transparent transparent var(--vscode-editorWidget-background) transparent;
}
.menu-item-tooltip::after {
    content: '';
    position: absolute;
    width: 0;
    height: 0;
    left: 50%;
    bottom: calc(100% + 1px);
    transform: translate(-50%, 0);
    z-index: 2;
    box-sizing: content-box;
    border-width: 6px;
    border-style: solid;
    border-color: transparent transparent var(--vscode-widget-border) transparent;
}
.menu-item button:hover + .menu-item-tooltip {
  opacity: 1;
}
</style>