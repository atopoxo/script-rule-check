<template>
    <div class="list-container">
        <div class="list-header" v-text="getItemsHeader()"></div>
        <div v-for="(item, index) in data" :key="index" class="list-item"
            @click="click(item)"
        >
            <div class="item-content-header" v-text="getHeader(index, item)">
            </div>
            <div class="item-content-snipet" v-text="getSnippet(item)">
            </div>
            <div class="item-content-bottom" v-text="getAuthority(item)">
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, watchEffect } from 'vue';
import type { PropType } from 'vue';
import { currentModuleUrl, iconRoot } from '../types/GlobalTypes';
import type { ContextOption } from '../types/ChatTypes';

export default defineComponent({
    name: 'BrowserList',
    props: {
        isDark: {
            type: Boolean,
            default: false
        },
        data: {
            type: Array as PropType<ContextOption[]>,
            required: true
        }
    },
  
    emits: ['open-external'],
  
    setup(props, { emit }) {
        const themeIconRelativePath = ref<string>('');

        const getItemsHeader = () => {
            const count = props.data.length;
            return `共${count}条结果`;
        }

        const getHeader = (index: number, item: any) => {
            const text = `${index + 1}.${item.title}`;
            return text;
        }

        const getSnippet = (item: any) => {
            return item.snippet;
        }

        const getAuthority = (item: any) => {
            return item.authority;
        }

        const click = (item: any) => {
            emit('open-external', item.link)
        };

        const getIconPath = (iconPath: string) => {
            try {
                return new URL(`${iconRoot}${themeIconRelativePath.value}/${iconPath}`, currentModuleUrl).href;
            } catch (error) {
                console.error('图标加载失败:', iconPath, error);
                return '';
            }
        }

        watchEffect(() => {
            if (props.isDark) {
                themeIconRelativePath.value = 'dark';
            } else {
                themeIconRelativePath.value = 'light';
            }
        });

        onMounted(() => {
        });

        return {
            getItemsHeader,
            getHeader,
            getSnippet,
            getAuthority,
            getIconPath,
            click
        };
    },
});
</script>

<style scoped>
.list-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    background-color: var(--vscode-toolbar-hoverBackground);
    border-radius: 5px;
}
.list-header {
    margin: 2px 6px;
    padding: 6px 6px;
}
.list-item {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    cursor: pointer;
    padding: 6px 12px;
}
.list-item:hover {
    background-color: var(--vscode-toolbar-hoverBackground);
}
.item-content-header {
    display: flex;
    align-items: center;
    overflow: hidden;
    font-size: 16px;
}
.item-content-snipet {
    display: flex;
    align-items: center;
    overflow: hidden;
    opacity: 0.7;
    margin: 2px 0;
}
.item-content-bottom {
    display: flex;
    align-items: center;
    overflow: hidden;
    opacity: 0.8;
}
.item-icon {
    margin-right: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
}
.item-name {
    font-size: 14px;
    line-height: 1.4;
    margin-left: 4px;
    white-space: nowrap;
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
</style>