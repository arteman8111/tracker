import { pool } from './db.js'
import { initials } from './util.js'

const people = [
  ['Артём Волков', 'artem@rks.local'],
  ['Мария Соколова', 'maria@rks.local'],
  ['Илья Петров', 'ilya@rks.local'],
  ['Ольга Ким', 'olga@rks.local'],
  ['Никита Орлов', 'nikita@rks.local'],
  ['Светлана Мороз', 'svetlana@rks.local'],
]

export async function seed() {
  const existing = await pool.query('SELECT COUNT(*)::int AS n FROM users')
  if (existing.rows[0].n > 0) return

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const users = new Map()
    for (const [name, email] of people) {
      const { rows } = await client.query(
        'INSERT INTO users (name, email, initials) VALUES ($1, $2, $3) RETURNING id, name',
        [name, email, initials(name)],
      )
      users.set(name, rows[0].id)
    }

    const project = await client.query(
      `INSERT INTO projects (key, name) VALUES ('TASK', 'Наш трекер') RETURNING id`,
    )
    const projectId = project.rows[0].id

    const labels = new Map()
    for (const name of ['api', 'интерфейс', 'инфра']) {
      const { rows } = await client.query(
        'INSERT INTO labels (project_id, name) VALUES ($1, $2) RETURNING id',
        [projectId, name],
      )
      labels.set(name, rows[0].id)
    }

    const sprints = new Map()
    const sprintRows = [
      ['Спринт 11', 'Закрыть каркас', '2026-09-14', '2026-09-27', 'closed'],
      ['Спринт 12', 'Доска и карточка', '2026-09-28', '2026-10-11', 'active'],
      ['Спринт 13', 'Планирование сроков', '2026-10-12', '2026-10-25', 'planned'],
    ]
    for (const [name, goal, start, end, status] of sprintRows) {
      const { rows } = await client.query(
        `INSERT INTO sprints (project_id, name, goal, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [projectId, name, goal, start, end, status],
      )
      sprints.set(name, rows[0].id)
    }

    let number = 1
    const positions = new Map()
    const nextPosition = (status, sprint) => {
      const key = `${status}:${sprint || ''}`
      const value = positions.get(key) || 0
      positions.set(key, value + 1)
      return value
    }

    async function addIssue(spec) {
      const sprintId = spec.sprint ? sprints.get(spec.sprint) : null
      const { rows } = await client.query(
        `INSERT INTO issues (
           project_id, number, type, title, description, status, priority,
           estimate_hours, assignee_id, reporter_id, sprint_id, start_date, due_date, position
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id`,
        [
          projectId,
          number,
          spec.type,
          spec.title,
          spec.description || '',
          spec.status,
          spec.priority,
          spec.estimate ?? null,
          spec.assignee ? users.get(spec.assignee) : null,
          users.get(spec.reporter || spec.assignee || 'Артём Волков'),
          sprintId,
          spec.start || null,
          spec.due || null,
          nextPosition(spec.status, spec.sprint),
        ],
      )
      const id = rows[0].id
      number += 1
      for (const label of spec.labels || []) {
        await client.query(
          'INSERT INTO issue_labels (issue_id, label_id) VALUES ($1, $2)',
          [id, labels.get(label)],
        )
      }
      for (const [index, item] of (spec.checklist || []).entries()) {
        await client.query(
          'INSERT INTO checklist_items (issue_id, title, done, position) VALUES ($1, $2, $3, $4)',
          [id, item.title, item.done, index],
        )
      }
      for (const comment of spec.comments || []) {
        await client.query(
          'INSERT INTO comments (issue_id, author_id, body, created_at) VALUES ($1, $2, $3, $4)',
          [id, users.get(comment.author), comment.body, comment.at],
        )
      }
      for (const log of spec.time || []) {
        await client.query(
          'INSERT INTO time_logs (issue_id, user_id, hours, note, logged_at) VALUES ($1, $2, $3, $4, $5)',
          [id, users.get(log.user), log.hours, log.note, log.at],
        )
      }
      await client.query(
        `INSERT INTO issue_history (issue_id, user_id, field, new_value, created_at)
         VALUES ($1, $2, 'created', $3, $4)`,
        [id, users.get(spec.reporter || spec.assignee || 'Артём Волков'), spec.title, spec.createdAt || '2026-09-28T09:00:00Z'],
      )
      for (const event of spec.history || []) {
        await client.query(
          `INSERT INTO issue_history (issue_id, user_id, field, old_value, new_value, created_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, users.get(event.user), event.field, event.old, event.next, event.at],
        )
      }
      return id
    }

    await addIssue({
      type: 'task', title: 'Поднять базу и схему', status: 'done', priority: 'high',
      assignee: 'Артём Волков', sprint: 'Спринт 11', estimate: 5,
      start: '2026-09-14', due: '2026-09-16', labels: ['инфра'],
      description: 'PostgreSQL, таблицы карточек и первый набор данных.',
      time: [{ user: 'Артём Волков', hours: 5, note: 'схема и сид', at: '2026-09-16' }],
      createdAt: '2026-09-14T09:00:00Z',
    })
    await addIssue({
      type: 'task', title: 'Пустой каркас интерфейса', status: 'done', priority: 'medium',
      assignee: 'Мария Соколова', sprint: 'Спринт 11', estimate: 4,
      start: '2026-09-17', due: '2026-09-20', labels: ['интерфейс'],
      description: 'Тёмная оболочка без предметных экранов.',
      time: [{ user: 'Мария Соколова', hours: 3, note: 'каркас', at: '2026-09-19' }],
      createdAt: '2026-09-17T09:00:00Z',
    })
    await addIssue({
      type: 'bug', title: 'Фильтр доски сбрасывает порядок колонки', status: 'review', priority: 'critical',
      assignee: 'Мария Соколова', sprint: 'Спринт 12', estimate: 3, due: '2026-10-02',
      labels: ['интерфейс'],
      description: 'После поиска по ключу карточки возвращаются не в том порядке, в котором их оставили.',
      comments: [
        { author: 'Мария Соколова', body: 'Появляется, если искать по ключу и сразу сбросить строку.', at: '2026-09-30T11:00:00Z' },
        { author: 'Илья Петров', body: 'Пока фильтр включён, перетаскивание лучше не трогать.', at: '2026-09-30T14:20:00Z' },
      ],
      time: [{ user: 'Мария Соколова', hours: 1, note: 'повтор', at: '2026-09-30' }],
      history: [{ user: 'Мария Соколова', field: 'status', old: 'in_progress', next: 'review', at: '2026-10-01T08:30:00Z' }],
      createdAt: '2026-09-29T10:00:00Z',
    })
    await addIssue({
      type: 'task', title: 'Панель карточки: описание и чеклист', status: 'in_progress', priority: 'high',
      assignee: 'Илья Петров', sprint: 'Спринт 12', estimate: 8,
      start: '2026-09-29', due: '2026-10-03', labels: ['интерфейс'],
      description: 'Описание остаётся обычным текстом. Чеклист — плоский список без вложенности.',
      checklist: [
        { title: 'Макет панели', done: true },
        { title: 'Сохранение описания', done: true },
        { title: 'Пункты чеклиста', done: false },
      ],
      time: [{ user: 'Илья Петров', hours: 5, note: 'панель', at: '2026-10-01' }],
      createdAt: '2026-09-29T09:10:00Z',
    })
    await addIssue({
      type: 'task', title: 'Комментарии и история правок', status: 'in_progress', priority: 'medium',
      assignee: 'Ольга Ким', sprint: 'Спринт 12', estimate: 6,
      start: '2026-09-30', due: '2026-10-06', labels: ['api'],
      description: 'Комментарии отдельной лентой. История не хранит полный текст описания.',
      time: [{ user: 'Ольга Ким', hours: 2, note: 'лента', at: '2026-10-01' }],
      createdAt: '2026-09-30T09:00:00Z',
    })
    await addIssue({
      type: 'bug', title: 'Большой файл не объясняет, почему не загрузился', status: 'todo', priority: 'high',
      assignee: 'Никита Орлов', sprint: 'Спринт 12', estimate: 2, due: '2026-10-08',
      labels: ['api'],
      description: 'Предел — 10 МБ. Человек должен увидеть эту причину, а не пустую ошибку.',
      createdAt: '2026-10-01T09:00:00Z',
    })
    await addIssue({
      type: 'task', title: 'Списание часов на карточке', status: 'todo', priority: 'medium',
      assignee: 'Светлана Мороз', sprint: 'Спринт 12', estimate: 5,
      start: '2026-10-02', due: '2026-10-09', labels: ['интерфейс'],
      description: 'Оценка и сумма списаний на одной карточке. Одна запись не длиннее суток.',
      createdAt: '2026-09-30T12:00:00Z',
    })
    await addIssue({
      type: 'task', title: 'Пустое состояние без активного спринта', status: 'done', priority: 'low',
      assignee: 'Мария Соколова', sprint: 'Спринт 12', estimate: 2,
      start: '2026-09-28', due: '2026-09-29', labels: ['интерфейс'],
      time: [{ user: 'Мария Соколова', hours: 2, note: 'пустое состояние', at: '2026-09-29' }],
      createdAt: '2026-09-28T09:00:00Z',
    })
    await addIssue({
      type: 'task', title: 'Поиск по тексту комментария', status: 'todo', priority: 'low',
      estimate: 3, labels: ['api'],
      description: 'Сейчас поиск смотрит ключ и название. Комментарии — отдельно, позже.',
      createdAt: '2026-09-28T15:00:00Z',
    })
    await addIssue({
      type: 'bug', title: 'Два быстрых создания получают один номер', status: 'todo', priority: 'high',
      assignee: 'Илья Петров', estimate: 3, labels: ['api'],
      description: 'Номер карточки нужно брать под блокировкой, иначе ключи столкнутся.',
      createdAt: '2026-09-29T16:00:00Z',
    })
    await addIssue({
      type: 'task', title: 'Добавление человека из боковой панели', status: 'todo', priority: 'medium',
      assignee: 'Ольга Ким', labels: ['интерфейс'],
      createdAt: '2026-09-30T16:00:00Z',
    })
    await addIssue({
      type: 'task', title: 'Шкала сроков по дням', status: 'todo', priority: 'medium',
      assignee: 'Артём Волков', sprint: 'Спринт 13', estimate: 8,
      start: '2026-10-12', due: '2026-10-16', labels: ['интерфейс'],
      description: 'Полосы спринтов и карточек, у которых есть хотя бы одна дата.',
      createdAt: '2026-09-28T11:00:00Z',
    })
    await addIssue({
      type: 'task', title: 'Закрытие спринта уносит незавершённое в бэклог', status: 'todo', priority: 'high',
      assignee: 'Никита Орлов', sprint: 'Спринт 13', estimate: 5,
      start: '2026-10-13', due: '2026-10-18', labels: ['api'],
      createdAt: '2026-09-28T11:20:00Z',
    })
    await addIssue({
      type: 'bug', title: 'Карточка без дат пропадает со шкалы без следа', status: 'todo', priority: 'medium',
      assignee: 'Светлана Мороз', sprint: 'Спринт 13', estimate: 2, due: '2026-10-20',
      labels: ['интерфейс'],
      description: 'Такие карточки нужно перечислить под шкалой, а не молча скрыть.',
      createdAt: '2026-09-29T11:00:00Z',
    })

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
