// src/main.js
import { createApp } from 'vue'
import App from './App.vue'
import router from './router' // 导入路由

createApp(App)
  .use(router) // 挂载路由
  .mount('#app')