export const STATUSES = ['todo', 'in_progress', 'review', 'done']
export const PRIORITIES = ['low', 'medium', 'high', 'critical']
export const TYPES = ['task', 'bug']

export function bad(message, status = 400) {
  const error = new Error(message)
  error.status = status
  error.expose = true
  return error
}

export const wrap = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

export function idOf(value) {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw bad('Некорректный идентификатор')
  return id
}

export function initials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

export function dateOrNull(value) {
  if (value == null || value === '') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw bad('Некорректная дата')
  return String(value)
}

export async function requireUser(db, userId) {
  if (!userId) throw bad('Выберите, кто вы, в боковой панели', 401)
  const { rows } = await db.query('SELECT id, name, initials FROM users WHERE id = $1', [userId])
  if (!rows[0]) throw bad('Пользователь не найден', 401)
  return rows[0]
}

export async function addHistory(db, { issueId, userId, field, oldValue = null, newValue = null, force = false }) {
  const oldText = oldValue == null || oldValue === '' ? null : String(oldValue)
  const newText = newValue == null || newValue === '' ? null : String(newValue)
  if (!force && oldText === newText) return
  await db.query(
    `INSERT INTO issue_history (issue_id, user_id, field, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5)`,
    [issueId, userId, field, oldText, newText],
  )
}

export async function userName(db, id) {
  if (!id) return 'никто'
  const { rows } = await db.query('SELECT name FROM users WHERE id = $1', [id])
  return rows[0]?.name || 'никто'
}

export async function sprintName(db, id) {
  if (!id) return 'Бэклог'
  const { rows } = await db.query('SELECT name FROM sprints WHERE id = $1', [id])
  return rows[0]?.name || 'Бэклог'
}
