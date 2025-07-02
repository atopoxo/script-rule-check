<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script setup lang="ts">
</script>

<style>
#app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
}
</style>