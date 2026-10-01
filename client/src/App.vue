<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import IssueDrawer from './components/IssueDrawer.vue'
import Mark from './components/Mark.vue'
import { boot, createUser, setError, setMe, state } from './state.js'

const adding = ref(false)
const name = ref('')
const email = ref('')

onMounted(() => { boot() })

async function addPerson() {
  try {
    await createUser(name.value.trim(), email.value.trim())
    name.value = ''
    email.value = ''
    adding.value = false
  } catch (error) {
    setError(error)
  }
}
</script>

<template>
  <div class="app">
    <aside class="side">
      <div class="brand">
        <Mark />
        <div>
          <div class="brand-key">{{ state.project?.key || 'RKS' }}</div>
          <div class="brand-sub">{{ state.project?.name || 'Трекер' }}</div>
        </div>
      </div>
      <div class="nav-label">Работа</div>
      <nav>
        <RouterLink to="/board">Доска</RouterLink>
      </nav>
      <div class="side-foot">
        <div class="nav-label">Вы</div>
        <select :value="state.meId || ''" aria-label="Текущий человек" @change="setMe($event.target.value)">
          <option v-for="user in state.users" :key="user.id" :value="user.id">{{ user.name }}</option>
        </select>
        <button class="btn quiet" type="button" @click="adding = !adding">+ человек</button>
        <form v-if="adding" class="person" @submit.prevent="addPerson">
          <input v-model="name" placeholder="Имя" required />
          <input v-model="email" type="email" placeholder="Почта" required />
          <button class="btn" type="submit">Добавить</button>
        </form>
      </div>
    </aside>
    <main class="main">
      <div v-if="!state.ready" class="empty">
        <Mark />
        <p>{{ state.error || 'Загрузка' }}</p>
      </div>
      <RouterView v-else />
    </main>
    <IssueDrawer v-if="state.detail" />
  </div>
</template>
