<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import IssueDrawer from './components/IssueDrawer.vue'
import Icon from './components/Icon.vue'
import Logo from './components/Logo.vue'
import Mark from './components/Mark.vue'
import Onboarding from './components/Onboarding.vue'
import { boot, createUser, login, logout, setError, state } from './state.js'

const seenKey = 'rks-onboarded'
const adding = ref(false)
const guide = ref(false)
const name = ref('')
const email = ref('')
const password = ref('')
const loginEmail = ref('')
const loginPassword = ref('')
const collapsed = ref(localStorage.getItem('rks-nav') === '0')
const theme = ref(localStorage.getItem('rks-theme') === 'light' ? 'light' : 'dark')
const route = useRoute()
const router = useRouter()

const work = computed(() => ['/board', '/backlog', '/roadmap'].includes(route.path))

function applyTheme(value) {
  document.documentElement.dataset.theme = value
  localStorage.setItem('rks-theme', value)
}

applyTheme(theme.value)

onMounted(() => { boot() })

watch(() => state.ready && state.user, (ready) => {
  if (ready && !localStorage.getItem(seenKey)) guide.value = true
})

function closeGuide() {
  guide.value = false
  localStorage.setItem(seenKey, '1')
}

function toggleNav() {
  collapsed.value = !collapsed.value
  localStorage.setItem('rks-nav', collapsed.value ? '0' : '1')
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme(theme.value)
}

async function signIn() {
  try {
    await login(loginEmail.value.trim(), loginPassword.value)
    loginPassword.value = ''
  } catch (error) {
    setError(error)
  }
}

async function addPerson() {
  try {
    await createUser(name.value.trim(), email.value.trim(), password.value)
    name.value = ''
    email.value = ''
    password.value = ''
    adding.value = false
  } catch (error) {
    setError(error)
  }
}

function openProject() {
  router.push('/board')
}
</script>

<template>
  <div v-if="!state.ready" class="app">
    <main class="main">
      <div class="empty">
        <Mark />
        <p>Загрузка</p>
      </div>
    </main>
  </div>

  <div v-else-if="!state.user" class="app login-app">
    <main class="main">
      <form class="login" @submit.prevent="signIn">
        <div class="logo-plate"><Logo /></div>
        <h1>Наш трекер</h1>
        <p>Почта команды и пароль. Для уже заведённых людей пароль <strong>tracker</strong>.</p>
        <input v-model="loginEmail" type="email" placeholder="Почта" required autocomplete="username" />
        <input v-model="loginPassword" type="password" placeholder="Пароль" required autocomplete="current-password" />
        <p v-if="state.error" class="error">{{ state.error }}</p>
        <button class="btn" type="submit">Войти</button>
      </form>
    </main>
  </div>

  <div v-else class="app" :class="{ collapsed }">
    <aside class="side">
      <div class="brand">
        <div class="logo-plate"><Logo /></div>
        <div class="brand-name">Наш трекер</div>
      </div>

      <div class="nav-label">Проекты</div>
      <button class="nav-item" :class="{ on: work }" type="button" @click="openProject">
        {{ state.project?.name || 'Наш трекер' }}
      </button>

      <div class="nav-label">Команда</div>
      <ul class="team">
        <li v-for="user in state.users" :key="user.id" :class="{ me: user.id === state.user.id }">
          {{ user.name }}
        </li>
      </ul>
      <button class="btn quiet" type="button" @click="adding = !adding">+ человек</button>
      <form v-if="adding" class="person" @submit.prevent="addPerson">
        <input v-model="name" placeholder="Имя" required />
        <input v-model="email" type="email" placeholder="Почта" required />
        <input v-model="password" type="password" placeholder="Пароль" required />
        <button class="btn" type="submit">Добавить</button>
      </form>

      <div class="side-foot">
        <div class="whoami">{{ state.user.name }}</div>
        <div class="foot-actions">
          <button class="icon-btn" type="button" title="Как пользоваться" aria-label="Как пользоваться" @click="guide = true">
            <Icon name="help" />
          </button>
          <button class="icon-btn" type="button" title="Тема" aria-label="Сменить тему" @click="toggleTheme">
            <Icon :name="theme === 'dark' ? 'sun' : 'moon'" />
          </button>
          <button class="icon-btn" type="button" title="Выйти" aria-label="Выйти" @click="logout">
            <Icon name="logout" />
          </button>
        </div>
      </div>
    </aside>

    <main class="main">
      <header class="workspace">
        <button class="icon-btn" type="button" aria-label="Скрыть меню" @click="toggleNav">
          <Icon name="menu" />
        </button>
        <nav class="views">
          <RouterLink to="/board">Канбан</RouterLink>
          <RouterLink to="/backlog">Бэклог</RouterLink>
          <RouterLink to="/roadmap">Роудмап</RouterLink>
        </nav>
      </header>
      <RouterView />
    </main>
    <IssueDrawer v-if="state.detail" />
    <Onboarding :open="guide" @close="closeGuide" />
  </div>
</template>
