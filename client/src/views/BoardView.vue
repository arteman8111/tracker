<script setup>
import { computed, onMounted, ref } from 'vue'
import IssueCard from '../components/IssueCard.vue'
import Mark from '../components/Mark.vue'
import { formatShort, PRIORITIES, sprintStatus, STATUSES } from '../labels.js'
import {
  createIssue, filtersActive, loadIssues, moveIssue, openIssue, setError, setScope, state, visibleIssues,
} from '../state.js'

const title = ref('')
const type = ref('task')
const dragId = ref(null)
const over = ref('')
let dragged = false

const scopeModel = computed({
  get: () => String(state.scope),
  set: async (value) => {
    setScope(value === 'backlog' || value === 'all' ? value : Number(value))
    try {
      await loadIssues()
    } catch (error) {
      setError(error)
    }
  },
})

const currentSprint = computed(() => (
  typeof state.scope === 'number'
    ? state.sprints.find((sprint) => sprint.id === state.scope)
    : null
))

const subtitle = computed(() => {
  if (state.scope === 'backlog') return 'Задачи без спринта'
  if (state.scope === 'all') return 'Все задачи'
  if (!currentSprint.value) return ''
  const sprint = currentSprint.value
  const dates = [sprint.startDate, sprint.endDate].filter(Boolean).map(formatShort).join(' — ')
  return [dates, sprintStatus(sprint.status), sprint.goal].filter(Boolean).join(' · ')
})

const placeholder = computed(() => (
  typeof state.scope === 'number' ? 'Новая задача в этот спринт' : 'Новая задача в бэклог'
))

const total = computed(() => state.issues.length)
const visibleCount = computed(() => STATUSES.reduce((sum, column) => sum + visibleIssues(column.id).length, 0))

onMounted(() => {
  loadIssues().catch(setError)
})

async function submit() {
  const value = title.value.trim()
  if (!value) return
  try {
    await createIssue(value, type.value)
    title.value = ''
  } catch (error) {
    setError(error)
  }
}

function onDragStart(issue, event) {
  if (filtersActive()) {
    event.preventDefault()
    return
  }
  dragId.value = issue.id
  dragged = true
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(issue.id))
}

function onDragEnd() {
  dragId.value = null
  over.value = ''
  setTimeout(() => { dragged = false }, 0)
}

function onDragOver(key, event) {
  if (!dragId.value || filtersActive()) return
  event.preventDefault()
  over.value = key
}

async function onDrop(status, index, event) {
  event.preventDefault()
  event.stopPropagation()
  const id = dragId.value
  dragId.value = null
  over.value = ''
  if (!id || filtersActive()) return
  try {
    await moveIssue(id, status, index)
  } catch (error) {
    setError(error)
  }
}

function open(issue) {
  if (dragged) return
  openIssue(issue.id).catch(setError)
}
</script>

<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h1>Доска</h1>
        <p>{{ subtitle }}</p>
      </div>
      <p v-if="state.error" class="error">{{ state.error }}</p>
    </header>

    <div class="toolbar">
      <form class="create" @submit.prevent="submit">
        <input v-model="title" :placeholder="placeholder" maxlength="200" />
        <div class="seg">
          <button type="button" :class="{ on: type === 'task' }" @click="type = 'task'">Задача</button>
          <button type="button" :class="{ on: type === 'bug' }" @click="type = 'bug'">Баг</button>
        </div>
        <button class="btn" type="submit" :disabled="!title.trim()">Добавить</button>
      </form>
      <div class="filters">
        <input v-model="state.query" placeholder="Ключ или название" />
        <select v-model="state.priority">
          <option value="">Приоритет</option>
          <option v-for="item in PRIORITIES" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <select v-model="state.labelId">
          <option value="">Метка</option>
          <option v-for="label in state.labels" :key="label.id" :value="label.id">{{ label.name }}</option>
        </select>
        <select v-model="state.assigneeId">
          <option value="">Исполнитель</option>
          <option v-for="user in state.users" :key="user.id" :value="user.id">{{ user.name }}</option>
        </select>
        <select v-model="scopeModel">
          <option v-for="sprint in state.sprints" :key="sprint.id" :value="String(sprint.id)">
            {{ sprint.name }} · {{ sprintStatus(sprint.status) }}
          </option>
          <option value="backlog">Бэклог</option>
          <option value="all">Все задачи</option>
        </select>
      </div>
      <p v-if="filtersActive()" class="hint">Фильтр включён, перетаскивание выключено</p>
    </div>

    <div v-if="!state.loaded" class="empty">
      <p>Загрузка</p>
    </div>
    <div v-else-if="total === 0" class="empty">
      <Mark />
      <p>В этом срезе пусто</p>
    </div>
    <div v-else-if="visibleCount === 0" class="empty">
      <Mark />
      <p>Ничего не найдено</p>
    </div>
    <div v-else class="board">
      <section v-for="column in STATUSES" :key="column.id" class="column">
        <header>
          <h2>{{ column.name }}</h2>
          <span>{{ visibleIssues(column.id).length }}</span>
        </header>
        <div
          class="column-body"
          :class="{ hot: over === column.id + ':end' }"
          @dragover="onDragOver(column.id + ':end', $event)"
          @drop="onDrop(column.id, visibleIssues(column.id).length, $event)"
        >
          <IssueCard
            v-for="(issue, index) in visibleIssues(column.id)"
            :key="issue.id"
            :issue="issue"
            :locked="filtersActive()"
            :dragging="dragId === issue.id"
            :over="over === column.id + ':' + issue.id"
            @open="open(issue)"
            @dragstart="onDragStart(issue, $event)"
            @dragend="onDragEnd"
            @dragover="onDragOver(column.id + ':' + issue.id, $event)"
            @drop="onDrop(column.id, index, $event)"
          />
        </div>
      </section>
    </div>
  </section>
</template>
