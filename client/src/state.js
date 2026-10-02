import { reactive } from 'vue'
import { api } from './api.js'

export const state = reactive({
  ready: false,
  project: null,
  users: [],
  labels: [],
  sprints: [],
  issues: [],
  loaded: false,
  scope: 'backlog',
  query: '',
  priority: '',
  labelId: '',
  assigneeId: '',
  meId: null,
  user: null,
  detail: null,
  error: '',
  saving: '',
})

export function setError(error) {
  state.error = error?.message || String(error || '')
}

function toCard(issue) {
  return {
    id: issue.id,
    key: issue.key,
    number: issue.number,
    type: issue.type,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    estimateHours: issue.estimateHours,
    spentHours: issue.spentHours,
    assignee: issue.assignee,
    assignees: issue.assignees || (issue.assignee ? [issue.assignee] : []),
    reporter: issue.reporter,
    sprint: issue.sprint,
    startDate: issue.startDate,
    dueDate: issue.dueDate,
    position: issue.position,
    labels: issue.labels,
    checklistDone: issue.checklistDone,
    checklistTotal: issue.checklistTotal,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  }
}

function replaceDetail(issue) {
  const card = toCard(issue)
  const index = state.issues.findIndex((item) => item.id === issue.id)
  if (index >= 0) state.issues[index] = card
  else state.issues.push(card)
  if (state.detail?.id === issue.id) state.detail = issue
}

async function reloadMeta() {
  const meta = await api.meta()
  state.project = meta.project
  state.users = meta.users
  state.labels = meta.labels
  state.sprints = meta.sprints
}

export async function boot() {
  const token = localStorage.getItem('rks-token')
  if (!token) {
    state.user = null
    state.meId = null
    state.ready = true
    return
  }
  try {
    state.user = await api.me()
    state.meId = state.user.id
    await reloadMeta()
    const saved = sessionStorage.getItem('rks-scope')
    const known = state.sprints.some((sprint) => String(sprint.id) === saved)
    if (saved === 'backlog' || saved === 'all' || known) {
      state.scope = saved === 'backlog' || saved === 'all' ? saved : Number(saved)
    } else {
      const active = state.sprints.find((sprint) => sprint.status === 'active')
      state.scope = active ? active.id : 'backlog'
    }
    state.ready = true
  } catch (error) {
    localStorage.removeItem('rks-token')
    state.user = null
    state.meId = null
    state.ready = true
    setError(error)
  }
}

export function setMe(id) {
  state.meId = Number(id)
  localStorage.setItem('rks-user-id', String(state.meId))
}

export function setScope(scope) {
  state.scope = scope === 'backlog' || scope === 'all' ? scope : Number(scope)
  sessionStorage.setItem('rks-scope', String(state.scope))
}

let loadSeq = 0

export async function loadIssues(scope = state.scope) {
  const request = ++loadSeq
  const rows = await api.issues(scope)
  if (request !== loadSeq) return
  state.issues = rows
  state.loaded = true
}

export function filtersActive() {
  return Boolean(state.query.trim() || state.priority || state.labelId || state.assigneeId)
}

export function visibleIssues(status) {
  const query = state.query.trim().toLowerCase()
  return state.issues
    .filter((issue) => !status || issue.status === status)
    .filter((issue) => {
      if (state.priority && issue.priority !== state.priority) return false
      const people = issue.assignees?.length ? issue.assignees : (issue.assignee ? [issue.assignee] : [])
      if (state.assigneeId && !people.some((person) => String(person.id) === String(state.assigneeId))) return false
      if (state.labelId && !issue.labels.some((label) => String(label.id) === String(state.labelId))) return false
      if (query && !`${issue.key} ${issue.title}`.toLowerCase().includes(query)) return false
      return true
    })
    .sort((a, b) => a.position - b.position || a.id - b.id)
}

export async function createIssue(title, type) {
  const sprintId = typeof state.scope === 'number' ? state.scope : null
  const issue = await api.createIssue({ title, type, sprintId })
  state.issues.push(toCard(issue))
  return issue
}

export async function moveIssue(id, status, index) {
  const issue = state.issues.find((item) => item.id === id)
  if (!issue) return
  const column = state.issues
    .filter((item) => item.status === status)
    .sort((a, b) => a.position - b.position || a.id - b.id)
  const from = column.findIndex((item) => item.id === id)
  let to = index
  if (from >= 0 && from < to) to -= 1
  if (issue.status === status && from === to) return
  const next = column.filter((item) => item.id !== id)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, issue)
  const snapshot = state.issues.map((item) => ({ id: item.id, status: item.status, position: item.position }))
  issue.status = status
  next.forEach((item, position) => { item.position = position })
  try {
    await api.reorder({ status, ids: next.map((item) => item.id) })
  } catch (error) {
    for (const item of snapshot) {
      const target = state.issues.find((row) => row.id === item.id)
      if (!target) continue
      target.status = item.status
      target.position = item.position
    }
    throw error
  }
}

let pendingTimer = null
let pendingId = null
let pendingBody = null

export function queueIssueSave(id, body) {
  pendingId = id
  pendingBody = body
  clearTimeout(pendingTimer)
  pendingTimer = setTimeout(() => { flushIssueSave() }, 400)
}

export async function flushIssueSave() {
  clearTimeout(pendingTimer)
  if (!pendingBody || !pendingId) return
  const id = pendingId
  const body = pendingBody
  pendingId = null
  pendingBody = null
  state.saving = 'saving'
  try {
    replaceDetail(await api.patchIssue(id, body))
    state.saving = 'saved'
  } catch (error) {
    state.saving = 'error'
    setError(error)
  }
}

export async function openIssue(id) {
  await flushIssueSave()
  state.detail = await api.issue(id)
  state.saving = ''
}

export async function closeIssue() {
  await flushIssueSave()
  state.detail = null
  state.saving = ''
}

export async function removeIssue(id) {
  await flushIssueSave()
  pendingId = null
  pendingBody = null
  await api.deleteIssue(id)
  state.issues = state.issues.filter((issue) => issue.id !== id)
  if (state.detail?.id === id) state.detail = null
}

export async function login(email, password) {
  const data = await api.login(email, password)
  localStorage.setItem('rks-token', data.token)
  state.ready = false
  state.error = ''
  await boot()
}

export async function logout() {
  localStorage.removeItem('rks-token')
  api.logout().catch(() => {})
  state.user = null
  state.meId = null
  state.detail = null
  state.issues = []
  state.loaded = false
  state.ready = true
}

export async function createUser(name, email, password) {
  const user = await api.createUser({ name, email, password })
  state.users.push(user)
  state.users.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export async function createLabel(name) {
  const label = await api.createLabel(name)
  state.labels.push(label)
  state.labels.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  return label
}

async function detailAction(fn) {
  const issue = await fn()
  replaceDetail(issue)
}

export const addChecklist = (title) => detailAction(() => api.checklist(state.detail.id, title))
export const patchChecklist = (id, body) => detailAction(() => api.patchChecklist(id, body))
export const deleteChecklist = (id) => detailAction(() => api.deleteChecklist(id))
export const addComment = (text) => detailAction(() => api.comment(state.detail.id, text))
export const deleteComment = (id) => detailAction(() => api.deleteComment(id))
export const uploadFile = (file, onProgress) => detailAction(() => api.uploadWithProgress(state.detail.id, file, onProgress))
export const deleteFile = (id) => detailAction(() => api.deleteFile(id))
export const renameFile = (id, filename) => detailAction(() => api.renameFile(id, filename))
export const logTime = (body) => detailAction(() => api.logTime(state.detail.id, body))
export const deleteTime = (id) => detailAction(() => api.deleteTime(id))

export async function placeIssue(id, sprintId, index) {
  const issue = state.issues.find((item) => item.id === id)
  if (!issue) return
  const target = sprintId || null
  const column = state.issues
    .filter((item) => (item.sprint?.id || null) === target)
    .sort((a, b) => a.position - b.position || a.id - b.id)
  const from = column.findIndex((item) => item.id === id)
  let to = index
  if (from >= 0 && from < to) to -= 1
  if ((issue.sprint?.id || null) === target && from === to) return
  const next = column.filter((item) => item.id !== id)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, issue)
  const snapshot = state.issues.map((item) => ({
    id: item.id,
    sprint: item.sprint,
    position: item.position,
  }))
  const sprint = target ? state.sprints.find((item) => item.id === target) : null
  issue.sprint = sprint ? { id: sprint.id, name: sprint.name } : null
  next.forEach((item, position) => { item.position = position })
  try {
    await api.place({ id, sprintId: target, index: Math.max(0, to) })
  } catch (error) {
    for (const item of snapshot) {
      const row = state.issues.find((entry) => entry.id === item.id)
      if (!row) continue
      row.sprint = item.sprint
      row.position = item.position
    }
    throw error
  }
}

export async function assignSprint(issueId, sprintId) {
  replaceDetail(await api.patchIssue(issueId, { sprintId: sprintId || null }))
}

export async function createSprint(body) {
  await api.createSprint(body)
  await reloadMeta()
}

export async function patchSprint(id, body) {
  await api.patchSprint(id, body)
  await reloadMeta()
}

export async function startSprint(id) {
  await api.startSprint(id)
  await reloadMeta()
}

export async function closeSprint(id) {
  await api.closeSprint(id)
  await reloadMeta()
}

export async function deleteSprint(id) {
  await api.deleteSprint(id)
  if (state.scope === id) setScope('backlog')
  await reloadMeta()
}
