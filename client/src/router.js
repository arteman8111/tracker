import { createRouter, createWebHistory } from 'vue-router'
import BoardView from './views/BoardView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/board' },
    { path: '/board', component: BoardView },
  ],
})
