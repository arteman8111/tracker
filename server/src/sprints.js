import { Router } from 'express'
import { getProjectId, pool, withTx } from './db.js'
import { addHistory, bad, dateOrNull, idOf, requireUser, wrap } from './util.js'

export const sprintsRouter = Router()

function shapeSprint(row) {
  return {
    id: row.id,
    name: row.name,
    goal: row.goal,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    createdAt: row.created_at,
  }
}

export async function listSprints() {
  const projectId = await getProjectId()
  const { rows } = await pool.query(
    `SELECT * FROM sprints WHERE project_id = $1
     ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 ELSE 2 END,
              start_date NULLS LAST, id`,
    [projectId],
  )
  return rows.map(shapeSprint)
}

function readSprintBody(body, { partial }) {
  const next = {}
  if (!partial || body.name != null) {
    const name = String(body.name || '').trim()
    if (!name || name.length > 80) throw bad('Название спринта: от 1 до 80 символов')
    next.name = name
  }
  if (!partial || body.goal != null) {
    const goal = String(body.goal || '').trim()
    if (goal.length > 500) throw bad('Цель спринта слишком длинная')
    next.goal = goal
  }
  if (!partial || body.startDate !== undefined) next.startDate = dateOrNull(body.startDate)
  if (!partial || body.endDate !== undefined) next.endDate = dateOrNull(body.endDate)
  return next
}

async function loadSprint(db, id) {
  const projectId = await getProjectId()
  const { rows } = await db.query(
    'SELECT * FROM sprints WHERE id = $1 AND project_id = $2 FOR UPDATE',
    [id, projectId],
  )
  if (!rows[0]) throw bad('Спринт не найден', 404)
  return rows[0]
}

sprintsRouter.get('/sprints', wrap(async (_req, res) => {
  res.json(await listSprints())
}))

sprintsRouter.post('/sprints', wrap(async (req, res) => {
  const fields = readSprintBody(req.body || {}, { partial: false })
  if (fields.startDate && fields.endDate && fields.startDate > fields.endDate) {
    throw bad('Начало позже конца')
  }
  const row = await withTx(async (client) => {
    await requireUser(client, req.userId)
    const projectId = await getProjectId()
    const inserted = await client.query(
      `INSERT INTO sprints (project_id, name, goal, start_date, end_date, status)
       VALUES ($1, $2, $3, $4, $5, 'planned')
       RETURNING *`,
      [projectId, fields.name, fields.goal || '', fields.startDate || null, fields.endDate || null],
    )
    return inserted.rows[0]
  })
  res.status(201).json(shapeSprint(row))
}))

sprintsRouter.patch('/sprints/:id', wrap(async (req, res) => {
  const id = idOf(req.params.id)
  const row = await withTx(async (client) => {
    await requireUser(client, req.userId)
    const sprint = await loadSprint(client, id)
    if (sprint.status === 'closed') throw bad('Закрытый спринт нельзя менять')
    const fields = readSprintBody(req.body || {}, { partial: true })
    const name = fields.name ?? sprint.name
    const goal = fields.goal ?? sprint.goal
    const startDate = fields.startDate === undefined ? sprint.start_date : fields.startDate
    const endDate = fields.endDate === undefined ? sprint.end_date : fields.endDate
    if (startDate && endDate && startDate > endDate) throw bad('Начало позже конца')
    const updated = await client.query(
      `UPDATE sprints SET name = $1, goal = $2, start_date = $3, end_date = $4
       WHERE id = $5 RETURNING *`,
      [name, goal, startDate, endDate, id],
    )
    return updated.rows[0]
  })
  res.json(shapeSprint(row))
}))

sprintsRouter.post('/sprints/:id/start', wrap(async (req, res) => {
  const id = idOf(req.params.id)
  let row
  try {
    row = await withTx(async (client) => {
      await requireUser(client, req.userId)
      const sprint = await loadSprint(client, id)
      if (sprint.status !== 'planned') throw bad('Запустить можно только запланированный спринт')
      if (!sprint.start_date || !sprint.end_date) throw bad('Укажите даты спринта')
      const active = await client.query(
        `SELECT id FROM sprints WHERE project_id = $1 AND status = 'active' AND id <> $2`,
        [sprint.project_id, id],
      )
      if (active.rows[0]) throw bad('Уже есть активный спринт')
      const updated = await client.query(
        `UPDATE sprints SET status = 'active' WHERE id = $1 RETURNING *`,
        [id],
      )
      return updated.rows[0]
    })
  } catch (error) {
    if (error.code === '23505') throw bad('Уже есть активный спринт')
    throw error
  }
  res.json(shapeSprint(row))
}))

sprintsRouter.post('/sprints/:id/close', wrap(async (req, res) => {
  const id = idOf(req.params.id)
  const result = await withTx(async (client) => {
    const user = await requireUser(client, req.userId)
    const sprint = await loadSprint(client, id)
    if (sprint.status !== 'active') throw bad('Закрыть можно только активный спринт')
    const undone = await client.query(
      `SELECT id FROM issues WHERE sprint_id = $1 AND status <> 'done'`,
      [id],
    )
    for (const issue of undone.rows) {
      await addHistory(client, {
        issueId: issue.id,
        userId: user.id,
        field: 'sprint',
        oldValue: sprint.name,
        newValue: 'Бэклог',
      })
    }
    await client.query(
      `UPDATE issues SET sprint_id = NULL, updated_at = now()
       WHERE sprint_id = $1 AND status <> 'done'`,
      [id],
    )
    const updated = await client.query(
      `UPDATE sprints SET status = 'closed' WHERE id = $1 RETURNING *`,
      [id],
    )
    return { sprint: updated.rows[0], moved: undone.rows.length }
  })
  res.json({ sprint: shapeSprint(result.sprint), moved: result.moved })
}))

sprintsRouter.delete('/sprints/:id', wrap(async (req, res) => {
  const id = idOf(req.params.id)
  await withTx(async (client) => {
    const user = await requireUser(client, req.userId)
    const sprint = await loadSprint(client, id)
    if (sprint.status !== 'planned') throw bad('Удалить можно только запланированный спринт')
    const issues = await client.query('SELECT id FROM issues WHERE sprint_id = $1', [id])
    for (const issue of issues.rows) {
      await addHistory(client, {
        issueId: issue.id,
        userId: user.id,
        field: 'sprint',
        oldValue: sprint.name,
        newValue: 'Бэклог',
      })
    }
    await client.query(
      'UPDATE issues SET sprint_id = NULL, updated_at = now() WHERE sprint_id = $1',
      [id],
    )
    await client.query('DELETE FROM sprints WHERE id = $1', [id])
  })
  res.status(204).end()
}))
