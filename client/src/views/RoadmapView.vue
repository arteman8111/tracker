<script setup>
import { computed, onMounted, ref } from 'vue'
import Mark from '../components/Mark.vue'
import { addDays, formatShort, isoDate, parseDate } from '../labels.js'
import { loadIssues, openIssue, setError, state } from '../state.js'

const DAY = 28
const MAX_DAYS = 120
const ready = ref(false)

onMounted(async () => {
  try {
    await loadIssues('all')
  } catch (error) {
    setError(error)
  } finally {
    ready.value = true
  }
})

const chart = computed(() => {
  const dated = state.issues.filter((issue) => issue.startDate || issue.dueDate)
  const undated = state.issues.filter((issue) => !issue.startDate && !issue.dueDate)
  const points = []
  for (const issue of dated) {
    if (issue.startDate) points.push(issue.startDate)
    if (issue.dueDate) points.push(issue.dueDate)
  }
  for (const sprint of state.sprints) {
    if (sprint.startDate) points.push(sprint.startDate)
    if (sprint.endDate) points.push(sprint.endDate)
  }
  if (!points.length) return { days: [], sprints: [], issues: [], undated, clipped: false, todayLeft: null }

  let start = addDays(parseDate(points.reduce((a, b) => (a < b ? a : b))), -2)
  let end = addDays(parseDate(points.reduce((a, b) => (a > b ? a : b))), 2)
  const span = Math.round((end - start) / 86400000)
  let clipped = false
  if (span > MAX_DAYS) {
    clipped = true
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    start = addDays(today, -14)
    end = addDays(start, MAX_DAYS)
  }

  const days = []
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    const iso = isoDate(cursor)
    days.push({
      iso,
      num: cursor.getDate(),
      weekend: cursor.getDay() === 0 || cursor.getDay() === 6,
      today: iso === isoDate(new Date()),
      month: cursor.getDate() === 1 || days.length === 0 ? formatShort(iso).split(' ')[1] : '',
    })
  }
  const index = new Map(days.map((day, position) => [day.iso, position]))
  const first = days[0].iso
  const last = days[days.length - 1].iso

  function bar(startIso, endIso) {
    const fromIso = startIso || endIso
    const toIso = endIso || startIso
    if (!fromIso || toIso < first || fromIso > last) return null
    const from = fromIso < first ? 0 : index.get(fromIso)
    const to = toIso > last ? days.length - 1 : index.get(toIso)
    if (from == null || to == null) return null
    const left = Math.min(from, to)
    const right = Math.max(from, to)
    return { left: `${left * DAY}px`, width: `${(right - left + 1) * DAY - 8}px` }
  }

  const todayIndex = days.findIndex((day) => day.today)
  return {
    days,
    clipped,
    undated,
    todayLeft: todayIndex >= 0 ? `${220 + todayIndex * DAY + 8}px` : null,
    sprints: state.sprints
      .map((sprint) => ({ sprint, style: bar(sprint.startDate, sprint.endDate) }))
      .filter((row) => row.style),
    issues: dated
      .map((issue) => ({ issue, style: bar(issue.startDate, issue.dueDate) }))
      .filter((row) => row.style)
      .sort((a, b) => (a.issue.startDate || a.issue.dueDate).localeCompare(b.issue.startDate || b.issue.dueDate)),
  }
})
</script>

<template>
  <section class="page">
    <header class="page-head">
      <h1>Roadmap</h1>
      <p>Сроки спринтов и карточек, у которых есть дата</p>
      <p v-if="chart.clipped" class="hint">Показаны 120 дней вокруг сегодня. Более дальние даты за краем.</p>
      <p v-if="state.error" class="error">{{ state.error }}</p>
    </header>

    <div v-if="!ready" class="empty"><p>Загрузка</p></div>
    <div v-else-if="!chart.days.length" class="empty">
      <Mark />
      <p>Нет дат для шкалы</p>
    </div>
    <div v-else class="gantt-scroll">
      <div class="gantt">
        <div v-if="chart.todayLeft" class="today-line" :style="{ left: chart.todayLeft }"></div>
        <div class="gantt-head">
          <div class="gantt-label"></div>
          <div class="gantt-days">
            <div
              v-for="day in chart.days"
              :key="day.iso"
              class="gantt-day"
              :class="{ weekend: day.weekend, today: day.today }"
            >
              <span>{{ day.month }}</span>
              {{ day.num }}
            </div>
          </div>
        </div>
        <div v-for="row in chart.sprints" :key="row.sprint.id" class="gantt-row">
          <div class="gantt-label">{{ row.sprint.name }}</div>
          <div class="gantt-track">
            <div class="bar sprint" :style="row.style"></div>
          </div>
        </div>
        <button
          v-for="row in chart.issues"
          :key="row.issue.id"
          class="gantt-row"
          type="button"
          @click="openIssue(row.issue.id)"
        >
          <span class="gantt-label">{{ row.issue.key }} {{ row.issue.title }}</span>
          <span class="gantt-track">
            <span class="bar" :class="{ bug: row.issue.type === 'bug' }" :style="row.style"></span>
          </span>
        </button>
      </div>
      <p v-if="chart.undated.length" class="undated">
        Без дат: {{ chart.undated.map((issue) => issue.key).join(', ') }}
      </p>
    </div>
  </section>
</template>
