<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import Icon from './Icon.vue'
import {
  fileSize, formatWhen, historyField, historyValue, hoursText, isoDate,
  PRIORITIES, sprintStatus, STATUSES, TYPES,
} from '../labels.js'
import {
  addChecklist, addComment, closeIssue, createLabel, deleteChecklist, deleteComment,
  deleteFile, deleteTime, logTime, patchChecklist, queueIssueSave, removeIssue,
  renameFile, setError, state, uploadFile,
} from '../state.js'

const form = reactive({
  title: '',
  description: '',
  type: 'task',
  status: 'todo',
  priority: 'medium',
  assigneeIds: [],
  sprintId: '',
  estimateHours: '',
  startDate: '',
  dueDate: '',
  labelIds: [],
})

const checkTitle = ref('')
const comment = ref('')
const labelName = ref('')
const timeHours = ref('')
const timeNote = ref('')
const timeDate = ref(isoDate(new Date()))
const confirmDelete = ref(false)
const pending = ref([])
const dropHot = ref(false)
const askRemove = ref(null)
const renaming = ref(null)
const renameValue = ref('')
let silent = true

function payload() {
  return {
    title: form.title,
    description: form.description,
    type: form.type,
    status: form.status,
    priority: form.priority,
    assigneeIds: [...form.assigneeIds],
    sprintId: form.sprintId ? Number(form.sprintId) : null,
    estimateHours: form.estimateHours === '' ? null : Number(form.estimateHours),
    startDate: form.startDate || null,
    dueDate: form.dueDate || null,
    labelIds: [...form.labelIds],
  }
}

function fill(issue) {
  silent = true
  form.title = issue.title
  form.description = issue.description || ''
  form.type = issue.type
  form.status = issue.status
  form.priority = issue.priority
  const people = issue.assignees?.length ? issue.assignees : (issue.assignee ? [issue.assignee] : [])
  form.assigneeIds = people.map((person) => person.id)
  form.sprintId = issue.sprint ? String(issue.sprint.id) : ''
  form.estimateHours = issue.estimateHours ?? ''
  form.startDate = issue.startDate || ''
  form.dueDate = issue.dueDate || ''
  form.labelIds = issue.labels.map((label) => label.id)
  confirmDelete.value = false
}

watch(() => state.detail?.id, async () => {
  if (!state.detail) return
  fill(state.detail)
  await nextTick()
  silent = false
}, { immediate: true })

watch(form, () => {
  if (silent || !state.detail) return
  queueIssueSave(state.detail.id, payload())
}, { deep: true })

const savingText = computed(() => {
  if (state.saving === 'saving') return 'сохранение'
  if (state.saving === 'saved') return 'сохранено'
  if (state.saving === 'error') return 'не сохранилось'
  return ''
})

const ratio = computed(() => {
  const estimate = state.detail?.estimateHours
  if (!estimate) return 0
  return Math.min(100, ((state.detail.spentHours || 0) / estimate) * 100)
})

async function run(fn) {
  try {
    await fn()
  } catch (error) {
    setError(error)
  }
}

function toggleAssignee(id) {
  const index = form.assigneeIds.indexOf(id)
  if (index >= 0) form.assigneeIds.splice(index, 1)
  else form.assigneeIds.push(id)
}

function toggleLabel(id) {
  const index = form.labelIds.indexOf(id)
  if (index >= 0) form.labelIds.splice(index, 1)
  else form.labelIds.push(id)
}

async function submitLabel() {
  const name = labelName.value.trim()
  if (!name) return
  await run(async () => {
    const label = await createLabel(name)
    labelName.value = ''
    if (!form.labelIds.includes(label.id)) form.labelIds.push(label.id)
  })
}

async function submitCheck() {
  const title = checkTitle.value.trim()
  if (!title) return
  await run(async () => {
    await addChecklist(title)
    checkTitle.value = ''
  })
}

async function submitComment() {
  const text = comment.value.trim()
  if (!text) return
  await run(async () => {
    await addComment(text)
    comment.value = ''
  })
}

async function submitTime() {
  await run(async () => {
    await logTime({
      hours: Number(timeHours.value),
      note: timeNote.value,
      loggedAt: timeDate.value,
    })
    timeHours.value = ''
    timeNote.value = ''
  })
}

function queueFiles(list) {
  for (const file of list) {
    if (file.size > 10 * 1024 * 1024) {
      setError(new Error('Файл больше 10 МБ'))
      continue
    }
    pending.value.push({
      id: `${file.name}-${file.size}-${Math.random().toString(16).slice(2)}`,
      file,
      name: file.name,
      size: file.size,
      progress: 0,
    })
  }
}

function onPick(event) {
  queueFiles(event.target.files || [])
  event.target.value = ''
}

function onDropFiles(event) {
  dropHot.value = false
  queueFiles(event.dataTransfer?.files || [])
}

function discardPending() {
  pending.value = []
}

async function attachPending() {
  const queue = [...pending.value]
  for (const item of queue) {
    await run(() => uploadFile(item.file, (value) => { item.progress = value }))
    pending.value = pending.value.filter((row) => row.id !== item.id)
  }
}

async function openFile(file) {
  const token = localStorage.getItem('rks-token')
  const response = await fetch(`/api/attachments/${file.id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) {
    setError(new Error('Файл не открылся'))
    return
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.filename
  link.click()
  URL.revokeObjectURL(url)
}

function startRename(file) {
  renaming.value = file.id
  renameValue.value = file.filename
}

async function saveRename(file) {
  const filename = renameValue.value.trim()
  renaming.value = null
  if (!filename || filename === file.filename) return
  await run(() => renameFile(file.id, filename))
}

function onKey(event) {
  if (event.key === 'Escape') closeIssue()
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="state.detail" class="backdrop" @click="closeIssue()"></div>
  <aside v-if="state.detail" class="drawer" role="dialog" aria-label="Карточка">
    <header class="drawer-head">
      <div>
        <div class="keyline">
          <span>{{ state.detail.key }}</span>
          <span class="save-state">{{ savingText }}</span>
        </div>
        <input v-model="form.title" class="title-input" aria-label="Название" />
      </div>
      <button class="btn quiet" type="button" @click="closeIssue()"><Icon name="close" /> Закрыть</button>
    </header>

    <div class="drawer-body">
      <div class="meta">
        <label>Тип
          <select v-model="form.type">
            <option v-for="item in TYPES" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <label>Статус
          <select v-model="form.status">
            <option v-for="item in STATUSES" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <label>Приоритет
          <select v-model="form.priority">
            <option v-for="item in PRIORITIES" :key="item.id" :value="item.id">{{ item.name }}</option>
          </select>
        </label>
        <div class="assignees">
          <span>Исполнители</span>
          <div class="chips">
            <button
              v-for="user in state.users"
              :key="user.id"
              type="button"
              class="chip"
              :class="{ on: form.assigneeIds.includes(user.id) }"
              @click="toggleAssignee(user.id)"
            >{{ user.name }}</button>
          </div>
        </div>
        <label>Спринт
          <select v-model="form.sprintId">
            <option value="">Бэклог</option>
            <option v-for="sprint in state.sprints" :key="sprint.id" :value="String(sprint.id)">
              {{ sprint.name }} · {{ sprintStatus(sprint.status) }}
            </option>
          </select>
        </label>
        <label>Оценка, ч
          <input v-model="form.estimateHours" type="number" min="0" max="999" step="0.25" />
        </label>
        <label>Начало
          <input v-model="form.startDate" type="date" />
        </label>
        <label>Дедлайн
          <input v-model="form.dueDate" type="date" />
        </label>
      </div>

      <div class="section-label">Описание</div>
      <textarea v-model="form.description" rows="6" placeholder="Обычный текст"></textarea>

      <div class="section-label">Метки</div>
      <div class="chips">
        <button
          v-for="label in state.labels"
          :key="label.id"
          type="button"
          class="chip"
          :class="{ on: form.labelIds.includes(label.id) }"
          @click="toggleLabel(label.id)"
        >{{ label.name }}</button>
      </div>
      <form class="inline" @submit.prevent="submitLabel">
        <input v-model="labelName" placeholder="Новая метка" maxlength="24" />
        <button class="btn" type="submit"><Icon name="plus" /> Добавить</button>
      </form>

      <div class="section-label">Чеклист</div>
      <ul class="plain">
        <li v-for="item in state.detail.checklist" :key="item.id">
          <label class="check">
            <input
              type="checkbox"
              :checked="item.done"
              @change="run(() => patchChecklist(item.id, { done: $event.target.checked }))"
            />
            <input
              class="ghost"
              :value="item.title"
              @change="run(() => patchChecklist(item.id, { title: $event.target.value }))"
            />
          </label>
          <button class="btn quiet" type="button" @click="run(() => deleteChecklist(item.id))"><Icon name="trash" /> убрать</button>
        </li>
      </ul>
      <form class="inline" @submit.prevent="submitCheck">
        <input v-model="checkTitle" placeholder="Пункт" maxlength="200" />
        <button class="btn" type="submit"><Icon name="plus" /> Добавить</button>
      </form>

      <div class="section-label">Время</div>
      <p class="quiet-line">
        {{ hoursText(state.detail.spentHours) }} ч
        <template v-if="state.detail.estimateHours != null">из {{ hoursText(state.detail.estimateHours) }} ч</template>
      </p>
      <div v-if="state.detail.estimateHours" class="meter"><span :style="{ width: ratio + '%' }"></span></div>
      <p v-if="state.detail.estimateHours && state.detail.spentHours > state.detail.estimateHours" class="quiet-line warm">
        Сверх оценки
      </p>
      <ul class="plain">
        <li v-for="entry in state.detail.timeLogs" :key="entry.id">
          <span>{{ hoursText(entry.hours) }} ч · {{ entry.user?.name || 'кто-то' }} · {{ entry.loggedAt }}</span>
          <span v-if="entry.note" class="muted">{{ entry.note }}</span>
          <button class="btn quiet" type="button" @click="run(() => deleteTime(entry.id))"><Icon name="trash" /> убрать</button>
        </li>
      </ul>
      <form class="inline" @submit.prevent="submitTime">
        <input v-model="timeHours" type="number" min="0.25" max="24" step="0.25" placeholder="Часы" required />
        <input v-model="timeNote" placeholder="Заметка" maxlength="500" />
        <input v-model="timeDate" type="date" required />
        <button class="btn" type="submit"><Icon name="clock" /> Списать</button>
      </form>

      <div class="section-label">Файлы</div>
      <ul class="uploads">
        <li v-for="file in state.detail.attachments" :key="file.id">
          <Icon name="file" />
          <div class="upload-main">
            <input
              v-if="renaming === file.id"
              v-model="renameValue"
              @keydown.enter.prevent="saveRename(file)"
              @blur="saveRename(file)"
            />
            <button v-else class="link" type="button" @click="openFile(file)">{{ file.filename }}</button>
            <span class="muted">{{ fileSize(file.sizeBytes) }}</span>
          </div>
          <button class="icon-btn" type="button" aria-label="Переименовать" @click="startRename(file)"><Icon name="pencil" /></button>
          <button class="icon-btn" type="button" aria-label="Убрать файл" @click="askRemove = file.id"><Icon name="trash" /></button>
          <div v-if="askRemove === file.id" class="confirm-pop">
            <p>Убрать файл?</p>
            <button class="btn quiet" type="button" @click="askRemove = null">Отмена</button>
            <button class="btn" type="button" @click="run(() => deleteFile(file.id)); askRemove = null">Убрать</button>
          </div>
        </li>
        <li v-for="item in pending" :key="item.id">
          <Icon name="file" />
          <div class="upload-main">
            <span>{{ item.name }}</span>
            <span class="muted">{{ fileSize(Math.round(item.size * item.progress)) }} из {{ fileSize(item.size) }}</span>
            <span class="progress"><i :style="{ width: `${Math.round(item.progress * 100)}%` }"></i></span>
          </div>
          <button class="icon-btn" type="button" aria-label="Убрать из очереди" @click="pending = pending.filter((row) => row.id !== item.id)"><Icon name="trash" /></button>
        </li>
      </ul>
      <label
        class="drop"
        :class="{ hot: dropHot }"
        @dragover.prevent="dropHot = true"
        @dragleave="dropHot = false"
        @drop.prevent="onDropFiles"
      >
        <Icon name="clip" />
        <span>Перетащите файлы сюда или <u>выберите</u></span>
        <input type="file" multiple @change="onPick" />
      </label>
      <div v-if="pending.length" class="upload-actions">
        <button class="btn quiet" type="button" @click="discardPending">Отменить</button>
        <button class="btn" type="button" @click="attachPending"><Icon name="clip" /> Прикрепить</button>
      </div>

      <div class="section-label">Комментарии</div>
      <article v-for="item in state.detail.comments" :key="item.id" class="comment">
        <header>
          <strong>{{ item.author?.name || 'кто-то' }}</strong>
          <time>{{ formatWhen(item.createdAt) }}</time>
          <button class="btn quiet" type="button" @click="run(() => deleteComment(item.id))"><Icon name="trash" /> убрать</button>
        </header>
        <p>{{ item.body }}</p>
      </article>
      <form @submit.prevent="submitComment">
        <textarea v-model="comment" rows="3" placeholder="Комментарий" maxlength="5000"></textarea>
        <button class="btn" type="submit"><Icon name="send" /> Отправить</button>
      </form>

      <div class="section-label">История</div>
      <ul class="history">
        <li v-for="event in state.detail.history" :key="event.id">
          <span>{{ event.user?.name || 'кто-то' }}</span>
          <span>{{ historyField(event.field) }}</span>
          <span v-if="event.field !== 'description' && event.field !== 'created'">
            <template v-if="event.oldValue && event.newValue">
              {{ historyValue(event.field, event.oldValue) }} → {{ historyValue(event.field, event.newValue) }}
            </template>
            <template v-else>{{ historyValue(event.field, event.newValue || event.oldValue) }}</template>
          </span>
          <time>{{ formatWhen(event.createdAt) }}</time>
        </li>
      </ul>

      <div class="danger">
        <button v-if="!confirmDelete" class="btn quiet" type="button" @click="confirmDelete = true"><Icon name="trash" /> Удалить задачу</button>
        <button v-else class="btn" type="button" @click="run(() => removeIssue(state.detail.id))">Удалить безвозвратно</button>
      </div>
    </div>
  </aside>
</template>
