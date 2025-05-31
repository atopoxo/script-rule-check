// webview-ui/src/router/index.ts
import { createRouter, createWebHashHistory } from 'vue-router';
import ChatView from '../views/ChatView.vue';

const routes = [
  {
    path: '/',
    name: 'Chat',
    component: ChatView
  },
  // 可以添加更多路由
];

const router = createRouter({
  history: createWebHashHistory('/static/'),
  routes
});

export default router;