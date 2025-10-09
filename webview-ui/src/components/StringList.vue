<template>
    <div class="list-container">
        <div v-for="(item, index) in data" :key="index" class="list-item"
        >
            <div class="item-content-snipet" v-text="getSnippet(item)">
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref, watchEffect } from 'vue';
import type { PropType } from 'vue';
import type { ContextOption } from '../types/ChatTypes';

export default defineComponent({
    name: 'StringList',
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
  
    setup(props) {
        const themeIconRelativePath = ref<string>('');

        const getSnippet = (item: any) => {
            return item;
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
            getSnippet
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
.list-item {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-start;
    padding: 6px 12px;
}
.list-item:hover {
    background-color: var(--vscode-toolbar-hoverBackground);
}
.item-content-snipet {
    display: flex;
    align-items: center;
    overflow: hidden;
    opacity: 0.7;
    margin: 2px 0;
}
</style>