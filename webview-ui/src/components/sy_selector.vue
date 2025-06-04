<!-- src/components/sy_selector.vue -->
<template>
    <div class="selector-container" v-if="visible" @click.self="handleOutsideClick">
        <div class="selector-box">
            <div class="selector-header">
                <h3>{{ title }}</h3>
                <button class="close-button" @click="closeSelector">X</button>
            </div>
            <div class="selector-content">
                <div v-for="(item, index) in items" :key="index" class="selector-item"
                    :class="{
                        'has-children': item.children && item.children.length > 0,
                        'selected': isSelected(item),
                        'expanded': expandedItem === item
                    }"
                    @click="handleItemClick(item)"
                    @mouseenter="handleItemHover(item)"
                    >
                    <div class="item-indicators" v-if="isSelected(item) && (mutiSelect || showChoice)">
                        <i class="codicon codicon-check"></i>
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
                        </div>
                    </div>
                    <div class="item-indicators" v-if="item.children && item.children.length > 0">
                        <i class="codicon codicon-chevron-right"></i>
                    </div>
                
                <div 
                    v-if="item.children && item.children.length > 0 && expandedItem === item"
                    class="sub-menu"
                    @mouseleave="expandedItem = null"
                >
                    <div 
                    v-for="(child, childIndex) in item.children"
                    :key="childIndex"
                    class="sub-item"
                    :class="{'selected': isSelected(child)}"
                    @click.stop="handleItemClick(child)"
                    >
                    <div class="sub-item-content">
                        <div class="item-icon" v-if="child.icon">
                        <i :class="`codicon ${child.icon}`"></i>
                        </div>
                        <div class="item-info">
                        <div class="item-name">{{ child.name }}</div>
                        <div 
                            class="item-tag" 
                            v-if="child.tag"
                            :style="{
                            'font-size': child.tag.fontSize || '12px',
                            'border': child.tag.border ? '1px solid currentColor' : 'none'
                            }"
                        >
                            {{ child.tag.text }}
                        </div>
                        </div>
                    </div>
                    <div class="item-indicators">
                        <i 
                        v-if="isSelected(child) && (mutiSelect || showChoice)"
                        class="codicon codicon-check"
                        ></i>
                    </div>
                    </div>
                </div>
                </div>
            </div>
            <div class="selector-footer" v-if="mutiSelect">
                <button class="confirm-button" @click="confirmSelection">确认选择</button>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import type { PropType } from 'vue';
import type { Window }  from '../types/GlobalTypes';
import { currentModuleUrl } from '../types/GlobalTypes';

declare const window: Window;

export interface SelectorItemTag {
  text: string;
  fontSize?: string;
  border?: boolean;
}

export interface SelectorItem {
  id: string | number;
  name: string;
  icon?: string;
  tag?: SelectorItemTag;
  children?: SelectorItem[];
}

export default defineComponent({
    name: 'SySelector',
  
    props: {
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
        mutiSelect: {
            type: Boolean,
            default: false
        },
        showChoice: {
            type: Boolean,
            default: true
        }
    },
  
    emits: ['close', 'select'],
  
  setup(props, { emit }) {
    const selectedItems = ref<SelectorItem[]>([]);
    const expandedItem = ref<SelectorItem | null>(null);
    
    const isSelected = (item: SelectorItem) => {
      return selectedItems.value.some(selected => selected.id === item.id);
    };
    
    const handleItemClick = (item: SelectorItem) => {
      if (props.mutiSelect) {
        // 多选模式：切换选中状态
        const index = selectedItems.value.findIndex(i => i.id === item.id);
        if (index >= 0) {
          selectedItems.value.splice(index, 1);
        } else {
          selectedItems.value.push(item);
        }
      } else {
        // 单选模式：直接选中并返回结果
        selectedItems.value = [item];
        emit('select', [item]);
        emit('close');
      }
    };
    
    const handleItemHover = (item: SelectorItem) => {
      if (item.children && item.children.length > 0) {
        expandedItem.value = item;
      }
    };
    
    const handleOutsideClick = () => {
      if (props.mutiSelect && selectedItems.value.length > 0) {
        // 多选模式下点击外部区域返回结果
        confirmSelection();
      } else {
        // 没有选择或单选模式下直接关闭
        emit('close');
      }
    };
    
    const confirmSelection = () => {
      if (selectedItems.value.length > 0) {
        emit('select', [...selectedItems.value]);
      }
      emit('close');
    };
    
    const closeSelector = () => {
        emit('close');
    };
    // const loadAllIcons = async () => {
    //     const promises = props.items
    //         .filter(item => item.icon)
    //         .map(item => loadIcon(item.icon as string)); 
    //     await Promise.all(promises);
    // };

    // const loadIcon = async(iconPath: string) => {
    //     try {
    //         const module = await import(`../../assets/icons/${iconPath}`);
    //         iconDataUrls.value[iconPath] = module.default;
    //         return module.value;
    //     } catch (error) {
    //         console.error('图标加载失败:', error);
    //         return '';
    //     }
    // };

    const getIconPath = (iconPath: string) => {
        try {
            return new URL(`../assets/icons/${iconPath}`, currentModuleUrl).href;
        } catch (error) {
            console.error('图标加载失败:', iconPath, error);
            return '';
        }
    }

    // onMounted(async () => {
    //     await loadAllIcons();
    // });

    // watchEffect(() => {
    //     if (props.items.length > 0) {
    //         loadAllIcons();
    //     }
    // });
    
    return {
      selectedItems,
      expandedItem,
      isSelected,
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

.selector-box {
    background-color: var(--vscode-editor-background);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    width: 320px;
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
.close-button {
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
}

.selector-content {
    flex: 1;
    flex-direction: column;
    overflow-y: auto;
    padding: 0px 10px 10px 10px;
}

.selector-item {
    position: relative;
    display: flex;
    flex-direction: row;
    align-items: center;
    cursor: pointer;
    margin: 4px 0;
    border-radius: 5px;
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
    padding: 6px 8px;
}
.item-content-left {
    display: flex;
    align-items: center;
}
.item-content-right {
    display: flex;
    align-items: center;
}

.item-icon {
    margin-right: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
}
.item-info {
    flex: 1;
}
.item-name {
    font-size: 14px;
    line-height: 1.4;
}

.item-tag {
    opacity: 0.7;
    padding: 1px 2px;
    border-radius: 4px;
    display: inline-block;
}

.item-indicators {
  width: 20px;
  display: flex;
  justify-content: flex-end;
}

.sub-menu {
  position: absolute;
  top: 0;
  left: 100%;
  background-color: var(--vscode-editor-background);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  width: 280px;
  z-index: 10;
  padding: 4px 0;
}

.sub-item {
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
}

.sub-item:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.sub-item.selected {
  background-color: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.sub-item-content {
  display: flex;
  align-items: center;
  flex: 1;
}

.selector-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--vscode-sideBarSectionHeader-border);
  display: flex;
  justify-content: flex-end;
}

.confirm-button {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
}

.confirm-button:hover {
  background-color: var(--vscode-button-hoverBackground);
}
</style>