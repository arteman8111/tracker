import { createRouter, createWebHistory } from 'vue-router'
import BoardView from './views/BoardView.vue'
import BacklogView from './views/BacklogView.vue'
import RoadmapView from './views/RoadmapView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/board' },
    { path: '/board', component: BoardView },
    { path: '/backlog', component: BacklogView },
    { path: '/roadmap', component: RoadmapView },
  ],
})
