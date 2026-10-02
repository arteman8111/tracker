export const STATUSES = [
  { id: 'todo', name: 'Бэклог' },
  { id: 'in_progress', name: 'В работе' },
  { id: 'review', name: 'Ревью' },
  { id: 'done', name: 'Готово' },
]

export const PRIORITIES = [
  { id: 'low', name: 'Низкий' },
  { id: 'medium', name: 'Средний' },
  { id: 'high', name: 'Высокий' },
  { id: 'critical', name: 'Критический' },
]

export const TYPES = [
  { id: 'task', name: 'Задача' },
  { id: 'bug', name: 'Баг' },
]

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

const HISTORY_FIELDS = {
  created: 'Создание',
  title: 'Название',
  description: 'Описание',
  type: 'Тип',
  status: 'Статус',
  priority: 'Приоритет',
  estimate: 'Оценка',
  assignee: 'Исполнитель',
  sprint: 'Спринт',
  start_date: 'Начало',
  due_date: 'Дедлайн',
  labels: 'Метки',
  checklist: 'Чеклист',
  file: 'Файл',
  time: 'Время',
}

export function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  if (parts.length === 1) return parts[0]
  const last = parts[parts.length - 1]
  const initials = parts.slice(0, -1).map((part) => `${part[0].toUpperCase()}.`).join('')
  return `${last} ${initials}`
}

const CHIP_COLORS = ['#7ea0c4', '#c4a574', '#8fad8a', '#c49a9a', '#9a8ec4', '#7d9aa0']

export function chipColor(name) {
  const text = String(name || '')
  let hash = 0
  for (let index = 0; index < text.length; index += 1) hash = (hash + text.charCodeAt(index) * (index + 1)) % CHIP_COLORS.length
  return CHIP_COLORS[hash]
}

export function byId(list, id) {
  return list.find((item) => item.id === id)?.name || id || ''
}

export function formatDate(iso) {
  if (!iso) return ''
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return `${day} ${MONTHS[month - 1]} ${year}`
}

export function formatShort(iso) {
  if (!iso) return ''
  const [, month, day] = iso.slice(0, 10).split('-').map(Number)
  return `${day} ${MONTHS[month - 1]}`
}

export function formatWhen(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${formatShort(isoDate(date))} ${hours}:${minutes}`
}

export function isoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function parseDate(iso) {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(date, count) {
  const next = new Date(date)
  next.setDate(next.getDate() + count)
  return next
}

export function hoursText(value) {
  if (value == null || value === '') return ''
  const number = Number(value)
  if (!Number.isFinite(number)) return ''
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100)
}

export function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
}

export function historyField(field) {
  return HISTORY_FIELDS[field] || field
}

export function historyValue(field, value) {
  if (value == null || value === '') return '—'
  if (field === 'status') return byId(STATUSES, value)
  if (field === 'priority') return byId(PRIORITIES, value)
  if (field === 'type') return byId(TYPES, value)
  if (field === 'start_date' || field === 'due_date') return formatShort(value)
  if (field === 'time' || field === 'estimate') return `${hoursText(value)} ч`
  return value
}

export function sprintStatus(status) {
  if (status === 'active') return 'активный'
  if (status === 'planned') return 'план'
  if (status === 'closed') return 'закрыт'
  return status
}
