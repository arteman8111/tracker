<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import IssueCard from '../components/IssueCard.vue'
import { formatShort, sprintStatus } from '../labels.js'
import {
  closeSprint, createSprint, deleteSprint, loadIssues, openIssue, patchSprint,
  placeIssue, setError, startSprint, state,
} from '../state.js'

const ready = ref(false)
const draft = reactive({ name: '', goal: '', startDate: '', endDate: '' })
const editing = ref(null)
const edit = reactive({ name: '', goal: '', startDate: '', endDate: '' })
const dragId = ref(null)
const over = ref('')
let dragged = false

const columns = computed(() => {
  const bySprint = new Map(state.sprints.map((sprint) => [sprint.id, []]))
  const backlog = []
  const sorted = [...state.issues].sort((a, b) => a.position - b.position || a.id - b.id)
  for (const issue of sorted) {
    if (issue.sprint && bySprint.has(issue.sprint.id)) bySprint.get(issue.sprint.id).push(issue)
    else backlog.push(issue)
  }
  const order = { active: 0, planned: 1, closed: 2 }
  const sprints = [...state.sprints].sort((a, b) => (
    order[a.status] - order[b.status] || String(a.startDate || '').localeCompare(String(b.startDate || ''))
  ))
  return [
    { key: 'backlog', title: 'Бэклог', sprint: null, issues: backlog },
    ...sprints.map((sprint) => ({
      key: String(sprint.id),
      title: sprint.name,
      sprint,
      issues: bySprint.get(sprint.id) || [],
    })),
  ]
})

onMounted(async () => {
  try {
    await loadIssues('all')
  } catch (error) {
    setError(error)
  } finally {
    ready.value = true
  }
})

function dates(sprint) {
  return [sprint.startDate, sprint.endDate].filter(Boolean).map(formatShort).join(' — ')
}

async function run(fn) {
  try {
    await fn()
    await loadIssues('all')
  } catch (error) {
    setError(error)
  }
}

async function addSprint() {
  await run(async () => {
    await createSprint({ ...draft })
    draft.name = ''
    draft.goal = ''
    draft.startDate = ''
    draft.endDate = ''
  })
}

function beginEdit(sprint) {
  editing.value = sprint.id
  edit.name = sprint.name
  edit.goal = sprint.goal
  edit.startDate = sprint.startDate || ''
  edit.endDate = sprint.endDate || ''
}

async function saveEdit(id) {
  await run(async () => {
    await patchSprint(id, { ...edit })
    editing.value = null
  })
}

function onDragStart(issue, event) {
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
  if (!dragId.value) return
  event.preventDefault()
  over.value = key
}

async function onDrop(column, index, event) {
  event.preventDefault()
  event.stopPropagation()
  const id = dragId.value
  over.value = ''
  dragId.value = null
  if (!id) return
  try {
    await placeIssue(id, column.sprint?.id || null, index)
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
      <h1>Бэклог</h1>
      <p>Очередь слева, спринты рядом. Карточки перетаскиваются.</p>
      <p v-if="state.error" class="error">{{ state.error }}</p>
    </header>

    <form class="edit sprint-create" @submit.prevent="addSprint">
      <input v-model="draft.name" required maxlength="80" placeholder="Новый спринт" />
      <input v-model="draft.goal" maxlength="500" placeholder="Цель" />
      <input v-model="draft.startDate" type="date" required aria-label="Начало" />
      <input v-model="draft.endDate" type="date" required aria-label="Конец" />
      <button class="btn" type="submit">Создать</button>
    </form>

    <div v-if="!ready" class="empty"><p>Загрузка</p></div>
    <div v-else class="board plan">
      <section v-for="column in columns" :key="column.key" class="column" :class="{ todo: !column.sprint }">
        <header>
          <div>
            <h2>{{ column.title }}</h2>
            <p v-if="column.sprint" class="hint">
              {{ [dates(column.sprint), sprintStatus(column.sprint.status), column.sprint.goal].filter(Boolean).join(' · ') }}
            </p>
            <p v-else class="hint">Без спринта</p>
          </div>
          <span>{{ column.issues.length }}</span>
        </header>
        <div v-if="column.sprint && column.sprint.status !== 'closed'" class="row-actions">
          <button class="btn quiet" type="button" @click="beginEdit(column.sprint)">Править</button>
          <button v-if="column.sprint.status === 'planned'" class="btn" type="button" @click="run(() => startSprint(column.sprint.id))">Запустить</button>
          <button v-if="column.sprint.status === 'active'" class="btn" type="button" @click="run(() => closeSprint(column.sprint.id))">Закрыть</button>
          <button v-if="column.sprint.status === 'planned'" class="btn quiet" type="button" @click="run(() => deleteSprint(column.sprint.id))">Удалить</button>
        </div>
        <form v-if="column.sprint && editing === column.sprint.id" class="edit" @submit.prevent="saveEdit(column.sprint.id)">
          <input v-model="edit.name" required maxlength="80" aria-label="Название спринта" />
          <input v-model="edit.goal" maxlength="500" placeholder="Цель" />
          <input v-model="edit.startDate" type="date" aria-label="Начало" />
          <input v-model="edit.endDate" type="date" aria-label="Конец" />
          <button class="btn" type="submit">Сохранить</button>
        </form>
        <div
          class="column-body"
          :class="{ hot: over === column.key + ':end' }"
          @dragover="onDragOver(column.key + ':end', $event)"
          @drop="onDrop(column, column.issues.length, $event)"
        >
          <IssueCard
            v-for="(issue, index) in column.issues"
            :key="issue.id"
            :issue="issue"
            :dragging="dragId === issue.id"
            :over="over === column.key + ':' + issue.id"
            @open="open(issue)"
            @dragstart="onDragStart(issue, $event)"
            @dragend="onDragEnd"
            @dragover="onDragOver(column.key + ':' + issue.id, $event)"
            @drop="onDrop(column, index, $event)"
          />
        </div>
      </section>
    </div>
  </section>
</template>
