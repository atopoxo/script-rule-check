<template>
    <div class="selector-container" v-if="visible" @click.self="handleOutsideClick">
        <div class="selector-box" :style="{ width: width + 'px' }">
            <div class="selector-header">
                <h3>{{ title }}</h3>
            </div>
            <div class="selector-content">
                <div v-for="(item, index) in items" :key="index" class="selector-item"
                    :class="{
                        'selected': isSelected(item)
                    }"
                    @click="handleItemClick(item)"
                    @mouseenter="handleItemHover(item)"
                >
                    <div class="item-indicators" v-if="isSelected(item) && (mutiSelect || showChoice)">
                        <img :src="getIconPath(choiceIconPath)"/>
                    </div>
                    <div class="item-content">
                        <div class="item-content-left">
                            <div class="item-icon" v-if="item.icon">
                                <img :src="getIconPath(item.icon)"/>
                            </div>
                            <div class="item-name">{{ item.name }}</div>
                        </div>
                        <div class="item-content-right">
                            <div class="item-tag" v-if="item.tag"
                                :style="{
                                    'font-size': item.tag.fontSize || '12px',
                                    'border': item.tag.border ? '1px solid currentColor' : 'none'
                                }"
                            >{{ item.tag.text }}</div>
                            <div class="item-indicators" v-if="item.children && item.children.length > 0">
                                <img class="transparent-icon" :src="getIconPath(expandIconPath)"/>
                            </div>
                        </div>
                    </div>
                    <div v-if="canExpand(item)" class="sub-menu" :style="{ width: width + 'px' }"
                        @mouseleave="expandedItem = null"
                    >
                        <div class="selector-header">
                            <h3>{{ item.name }}</h3>
                        </div>
                        <div class="selector-content">
                            <div v-for="(child, childIndex) in item.children" :key="childIndex" class="selector-item"
                                :class="{'selected': isSelected(child)}"
                                @click.stop="handleItemClick(child)"
                            >
                                <div class="item-indicators" v-if="isSelected(child) && (mutiSelect || showChoice)">
                                    <img :src="getIconPath(choiceIconPath)"/>
                                </div>
                                <div class="item-content">
                                    <div class="item-content-left">
                                        <div class="item-icon" v-if="child.icon">
                                            <img :src="getIconPath(child.icon)"/>
                                        </div>
                                        <div class="item-name">{{ child.name }}</div>
                                    </div>
                                    <div class="item-content-right">
                                        <div class="item-tag" v-if="child.tag"
                                            :style="{
                                                'font-size': child.tag.fontSize || '12px',
                                                'border': child.tag.border ? '1px solid currentColor' : 'none'
                                            }"
                                        >{{ child.tag.text }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref, watchEffect, defineExpose } from 'vue';
import type { PropType } from 'vue';
import type { Window }  from '../types/GlobalTypes';
import { currentModuleUrl, iconRoot } from '../types/GlobalTypes';
import type { SelectorItem } from '../types/ChatTypes';

declare const window: Window;

export default defineComponent({
    name: 'SySelector',
  
    props: {
        width: {
            type: Number,
            default: 200
        },
        isDark: {
            type: Boolean,
            default: false
        },
        visible: {
            type: Boolean,
            required: true
        },
        title: {
            type: String,
            default: '请选择'
        },
        items: {
            type: Array as PropType<SelectorItem[]>,
            required: true
        },
        selectedItems: {
            type: Array as PropType<SelectorItem[]>,
            default: () => []
        },
        mutiSelect: {
            type: Boolean,
            default: false
        },
        showChoice: {
            type: Boolean,
            default: true
        }
    },
  
    emits: ['close', 'select', 'selectFiles', 'selectWorkspace'],
  
  setup(props, { emit }) {
    const selectedItems = ref<SelectorItem[]>([]);
    const expandedItem = ref<SelectorItem | null>(null);
    const expandIconPath = ref<string>('');
    const choiceIconPath = ref<string>('');
    
    const isSelected = (item: SelectorItem) => {
        if (item.children && item.children.length > 0) {
            let flag = true;
            item.children.forEach(child => {
                if (!isSelected(child)) {
                    flag = false;
                    return;
                }
            });
            updateSelectedItems(item, true, flag);
        }
        return selectedItems.value.some(selected => selected.id === item.id);
    };
    
    const handleItemClick = (item: SelectorItem) => {
        switch (item.type) {
            case "code":
                const flag = !isSelected(item);
                item.children?.map(child => {
                    updateSelectedItems(child, true, flag);
                });
                updateSelectedItems(item, true, flag);
                break;
            case "function":
                updateSelectedItems(item);
                break;
            case "files":
                filesSelect(true);
                break;
            case "folders":
                filesSelect(false);
                break;
            case "workspace":
                workspaceSelect();
                break;
            default:
                updateSelectedItems(item);
                break;
        }
        if (!props.mutiSelect) {
            closeSelector(selectedItems.value);
        }
    };

    const updateSelectedItems = (item: SelectorItem, force?: boolean, flag?: boolean) => {
        if (!props.mutiSelect) {
            selectedItems.value = []
        }
        if (force) {
            const index = selectedItems.value.findIndex(i => i.id === item.id);
            if (flag) {
                if (index < 0) {
                    selectedItems.value.push(item);
                }
            } else {
                if (index >= 0) {
                    selectedItems.value.splice(index, 1);
                }
            }
        } else {
            const index = selectedItems.value.findIndex(i => i.id === item.id);
            if (index >= 0) {
                selectedItems.value.splice(index, 1);
            } else {
                selectedItems.value.push(item);
            }
        }
    }

    const filesSelect = (onlyFiles: boolean) => {
        emit('selectFiles', onlyFiles);
    };

    const workspaceSelect = () => {
        emit('selectWorkspace');
    }
    
    const handleItemHover = (item: SelectorItem) => {
      expandedItem.value = item;
    };
    
    const handleOutsideClick = () => {
      closeSelector(undefined);
    };
    
    const confirmSelection = () => {
      if (selectedItems.value.length > 0) {
        emit('select', [...selectedItems.value]);
      }
    };
    
    const closeSelector = (items: SelectorItem[] | undefined) => {
        let data = undefined;
        if (items) {
            data = [...items]
        }
        emit('close', data);
    };

    const getIconPath = (iconPath: string) => {
        try {
            return new URL(`${iconRoot}${iconPath}`, currentModuleUrl).href;
        } catch (error) {
            console.error('图标加载失败:', iconPath, error);
            return '';
        }
    }

    const canExpand = (item: SelectorItem) => {
        if (item.children && item.children.length > 0) {
            return expandedItem.value?.id == item.id;
        } else {
            return false;
        }
    }

    watchEffect(() => {
        selectedItems.value = props.selectedItems;
        if (props.isDark) {
            expandIconPath.value = 'dark/expand.svg';
            choiceIconPath.value = 'dark/check.svg';
        } else {
            expandIconPath.value = 'light/expand.svg';
            choiceIconPath.value = 'light/check.svg';
        }
    });

    defineExpose({
        confirmSelection
    });

    return {
      selectedItems,
      expandedItem,
      expandIconPath,
      choiceIconPath,
      isSelected,
      canExpand,
      handleItemClick,
      handleItemHover,
      handleOutsideClick,
      confirmSelection,
      closeSelector,
      getIconPath
    };
  }
});
</script>

<style scoped>
.selector-container {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* .selector-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    background-color: rgba(0, 0, 0, 0.01);
} */

.selector-box {
    background-color: var(--vscode-editor-background);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.selector-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 3px 20px 1px 20px;
    /* border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border); */
}
.selector-header h3 {
    margin: 0;
    font-size: 10px;
    font-weight: 500;
    color: var(--vscode-foreground);
    opacity: 0.5;
}
/* .close-button {
    width: 20px;
    height: 20px;
    background: none;
    border: none;
    color: var(--vscode-icon-foreground);
    cursor: pointer;
    border-radius: 100%;
    text-align: center;
    font-size: 10px;
    font-family: "Comic Sans MS", cursive, sans-serif;
}
.close-button:hover {
    background-color: var(--vscode-toolbar-hoverBackground);
} */

.selector-content {
    flex: 1;
    flex-direction: column;
    justify-content: space-between;
    overflow-x: hidden;
    overflow-y: auto;
    max-height: 600px;
    padding: 0px 10px 10px 10px;
}

.selector-item {
    display: flex;
    flex-direction: row;
    align-items: center;
    cursor: pointer;
    margin: 3px 0;
    border-radius: 5px;
    width: 100%;
}
.selector-item:hover {
    background-color: var(--vscode-list-hoverBackground);
}
.selector-item.selected {
    background-color: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
}

.item-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex: 1;
    padding: 5px 8px;
    width: calc(100% - 16px);
}
.item-content-left {
    display: flex;
    align-items: center;
    width: 50%;
}
.item-content-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    white-space: nowrap;
    width: 50%;
}
.item-icon {
    margin-right: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
}
.item-name {
    font-size: 14px;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
}

.item-tag {
    opacity: 0.7;
    padding: 1px 2px;
    border-radius: 4px;
    display: inline-block;
    overflow: hidden;
    text-overflow: ellipsis;
}

.item-indicators {
    width: 15px;
    height: 15px;
    display: flex;
    justify-content: flex-end;
}

.transparent-icon {
    opacity: 0.6;
}

.sub-menu {
    position: absolute;
    left: 0;
    bottom: 100%;
    background-color: var(--vscode-editor-background);
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    z-index: 10;
    padding: 4px 0;
}
</style>