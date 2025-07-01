<template>
    <div class="list-container">
        <div v-for="(item, index) in data" :key="index" class="list-item"
            @mouseenter="handleItemHover(index)"
            @mouseleave="handleItemLeave(index)"
            @click="click(item)"
        >
            <div class="item-content-left">
                <div class="item-icon">
                    <img :src="getIconPath('talk.svg')"/>
                </div>
                <div class="item-name">{{ item.name }}</div>
            </div>
            <div class="item-content-right">
                <button v-if="showRemoveButton(index)" class="icon-button remove"
                    :disabled="!isEditable"
                    @click.stop="remove(index)">
                    <img :src="getIconPath('delete.svg', isEditable)" />
                </button>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref, watchEffect } from 'vue';
import type { PropType } from 'vue';
import type { Window }  from '../types/GlobalTypes';
import { currentModuleUrl, iconRoot } from '../types/GlobalTypes';
import type { ContextOption } from '../types/ChatTypes';

declare const window: Window;

export default defineComponent({
    name: 'SyItemList',
    props: {
        isDark: {
            type: Boolean,
            default: false
        },
        index: {
            type: Number,
            default: -1
        },
        data: {
            type: Array as PropType<ContextOption[]>,
            required: true
        },
        isEditable: {
            type: Boolean,
            default: false
        }
    },
  
    emits: ['remove', 'click'],
  
    setup(props, { emit }) {
        const themeIconRelativePath = ref<string>('');
        const removeButtonVisible = ref<Map<number, boolean>>(new Map());
        const isEditable = ref<boolean>(false);

        const click = (item: ContextOption) => {
            emit('click', item);
        };

        const remove = (id: number) => {
            emit('remove', id, props.index);
        };

        const handleItemHover = (id: number) => {
            const item = removeButtonVisible.value?.get(id);
            if (item) {
                removeButtonVisible.value?.set(id, !item);
            } else {
                removeButtonVisible.value?.set(id, true);
            }
        };

        const handleItemLeave = (id: number) => {
            const item = removeButtonVisible.value?.get(id);
            if (item) {
                removeButtonVisible.value?.delete(id);
            } 
        };

        const showRemoveButton = (id: number) => {
            const item = removeButtonVisible.value?.get(id);
            const result = (item && item === true);
            return result;
        };

        const getIconPath = (iconPath: string, enable?: boolean) => {
            try {
                if (enable === false) {
                    iconPath = "delete-disable.svg"
                }
                return new URL(`${iconRoot}${themeIconRelativePath.value}/${iconPath}`, currentModuleUrl).href;
            } catch (error) {
                console.error('图标加载失败:', iconPath, error);
                return '';
            }
        }

        watchEffect(() => {
            isEditable.value = props.isEditable;
            if (props.isDark) {
                themeIconRelativePath.value = 'dark';
            } else {
                themeIconRelativePath.value = 'light';
            }
        });

        return {
            getIconPath,
            click,
            remove,
            handleItemHover,
            handleItemLeave,
            showRemoveButton,
            isEditable
        };
    },
});
</script>

<style scoped>
.list-container {
    display: flex;
    flex-direction: column;
    width: 100%;
}
.list-item {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    margin: 6px 0;
    padding: 6px 6px;
    border-radius: 5px;
}
.list-item:hover {
    background-color: var(--vscode-toolbar-hoverBackground);
}
.item-content-left {
    display: flex;
    align-items: center;
    overflow: hidden;
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
.item-content-right {
    display: flex;
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
.item-content-right .icon-button.remove {
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