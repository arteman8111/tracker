<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { byId, formatShort, sprintStatus, STATUSES } from '../labels.js'
import {
  assignSprint, closeSprint, createSprint, deleteSprint, loadIssues, openIssue,
  patchSprint, setError, startSprint, state,
} from '../state.js'

const ready = ref(false)
const draft = reactive({ name: '', goal: '', startDate: '', endDate: '' })
const editing = ref(null)
const edit = reactive({ name: '', goal: '', startDate: '', endDate: '' })

const groups = computed(() => {
  const bySprint = new Map(state.sprints.map((sprint) => [sprint.id, []]))
  const backlog = []
  for (const issue of state.issues) {
    if (issue.sprint && bySprint.has(issue.sprint.id)) bySprint.get(issue.sprint.id).push(issue)
    else backlog.push(issue)
  }
  const order = { active: 0, planned: 1, closed: 2 }
  return {
    sprints: [...state.sprints]
      .sort((a, b) => order[a.status] - order[b.status] || String(a.startDate || '').localeCompare(String(b.startDate || '')))
      .map((sprint) => ({ sprint, issues: bySprint.get(sprint.id) || [] })),
    backlog,
  }
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

async function move(issue, sprintId) {
  await run(() => assignSprint(issue.id, sprintId ? Number(sprintId) : null))
}
</script>

<template>
  <section class="page">
    <header class="page-head">
      <h1>Бэклог</h1>
      <p>Очередь и короткие итерации</p>
      <p v-if="state.error" class="error">{{ state.error }}</p>
    </header>

    <div v-if="!ready" class="empty"><p>Загрузка</p></div>
    <div v-else class="groups">
      <section v-for="group in groups.sprints" :key="group.sprint.id" class="group">
        <header>
          <div>
            <h2>{{ group.sprint.name }}</h2>
            <p>{{ [dates(group.sprint), sprintStatus(group.sprint.status), group.sprint.goal].filter(Boolean).join(' · ') }}</p>
          </div>
          <div class="row-actions">
            <button v-if="group.sprint.status !== 'closed'" class="btn quiet" type="button" @click="beginEdit(group.sprint)">Править</button>
            <button v-if="group.sprint.status === 'planned'" class="btn" type="button" @click="run(() => startSprint(group.sprint.id))">Запустить</button>
            <button v-if="group.sprint.status === 'active'" class="btn" type="button" @click="run(() => closeSprint(group.sprint.id))">Закрыть</button>
            <button v-if="group.sprint.status === 'planned'" class="btn quiet" type="button" @click="run(() => deleteSprint(group.sprint.id))">Удалить</button>
          </div>
        </header>
        <form v-if="editing === group.sprint.id" class="edit" @submit.prevent="saveEdit(group.sprint.id)">
          <input v-model="edit.name" required maxlength="80" aria-label="Название спринта" />
          <input v-model="edit.goal" maxlength="500" placeholder="Цель" />
          <input v-model="edit.startDate" type="date" aria-label="Начало" />
          <input v-model="edit.endDate" type="date" aria-label="Конец" />
          <button class="btn" type="submit">Сохранить</button>
        </form>
        <div v-for="issue in group.issues" :key="issue.id" class="list-row" @click="openIssue(issue.id)">
          <span class="key">{{ issue.key }}</span>
          <span class="title">{{ issue.title }}</span>
          <span class="muted">{{ byId(STATUSES, issue.status) }}</span>
          <select :value="String(issue.sprint?.id || '')" @click.stop @change="move(issue, $event.target.value)">
            <option value="">Бэклог</option>
            <option v-for="sprint in state.sprints" :key="sprint.id" :value="String(sprint.id)">{{ sprint.name }}</option>
          </select>
        </div>
        <p v-if="!group.issues.length" class="hint">В спринте пусто</p>
      </section>

      <section class="group">
        <header>
          <div>
            <h2>Бэклог</h2>
            <p>Без спринта</p>
          </div>
        </header>
        <p v-if="!groups.backlog.length" class="hint">Бэклог пуст</p>
        <div v-for="issue in groups.backlog" :key="issue.id" class="list-row" @click="openIssue(issue.id)">
          <span class="key">{{ issue.key }}</span>
          <span class="title">{{ issue.title }}</span>
          <span class="muted">{{ byId(STATUSES, issue.status) }}</span>
          <select value="" @click.stop @change="move(issue, $event.target.value)">
            <option value="">Бэклог</option>
            <option v-for="sprint in state.sprints" :key="sprint.id" :value="String(sprint.id)">{{ sprint.name }}</option>
          </select>
        </div>
      </section>

      <section class="group">
        <div class="section-label">Новый спринт</div>
        <form class="edit" @submit.prevent="addSprint">
          <input v-model="draft.name" required maxlength="80" placeholder="Название" />
          <input v-model="draft.goal" maxlength="500" placeholder="Цель" />
          <input v-model="draft.startDate" type="date" required aria-label="Начало" />
          <input v-model="draft.endDate" type="date" required aria-label="Конец" />
          <button class="btn" type="submit">Создать</button>
        </form>
      </section>
    </div>
  </section>
</template>
