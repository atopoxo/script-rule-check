<template>
    <div class="reference-tag" @mouseenter="handleItemHover()" @mouseleave="showRemoveButton = false">
        <span>{{ data.contextItem?.name }}</span>
        <button v-if="removeable && showRemoveButton" class="delete-reference" @click="remove">
            <img :src="getIconPath(closeIconPath)"/>
        </button>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref, watchEffect } from 'vue';
import type { PropType } from 'vue';
import type { Window }  from '../types/GlobalTypes';
import { currentModuleUrl, iconRoot } from '../types/GlobalTypes';
import type { SelectorItem } from '../types/ChatTypes';

declare const window: Window;

export default defineComponent({
    name: 'SyTag',
  
    props: {
        isDark: {
            type: Boolean,
            default: false
        },
        index: {
            type: Number,
            default: -1
        },
        refIndex: {
            type: Number,
            default: -1
        },
        removeable: {
            type: Boolean,
            default: true
        },
        data: {
            type: Object as PropType<SelectorItem>,
            required: true
        },
    },
  
    emits: ['remove'],
  
    setup(props, { emit }) {
        const closeIconPath = ref<string>('');
        const showRemoveButton = ref<boolean>(false);

        const getIconPath = (iconPath: string) => {
            try {
                return new URL(`${iconRoot}${iconPath}`, currentModuleUrl).href;
            } catch (error) {
                console.error('图标加载失败:', iconPath, error);
                return '';
            }
        }

        const remove = () => {
            emit('remove', props.refIndex, props.index);
        };

        const handleItemHover = () => {
            showRemoveButton.value = true;
        };

        watchEffect(() => {
            if (props.isDark) {
                closeIconPath.value = 'dark/close.svg';
            } else {
                closeIconPath.value = 'light/close.svg';
            }
        });

        return {
            closeIconPath,
            showRemoveButton,
            getIconPath,
            remove,
            handleItemHover,
        };
    },
});
</script>

<style scoped>
.reference-tag {
    position: relative;
    display: flex;
    align-items: center;
    color: var(--vscode-badge-foreground);
    border-radius: 10px;
    border: 1px solid var(--vscode-widget-border);
    padding: 1px 5px;
    margin: 2px 4px;
    font-size: 10px;
}
.delete-reference {
    position: absolute;
    width: 14px;
    height: 14px;
    left: calc(100% - 4px);
    bottom: calc(100% - 10px);
    padding: 0;
    margin: 0;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    z-index: 2;
}
</style>