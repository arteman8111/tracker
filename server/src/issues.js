import fs from 'fs/promises'
import path from 'path'
import { Router } from 'express'
import { getProjectId, pool, uploadDir, withTx } from './db.js'
import {
  PRIORITIES,
  STATUSES,
  TYPES,
  addHistory,
  bad,
  dateOrNull,
  idOf,
  requireUser,
  sprintName,
  userName,
  wrap,
} from './util.js'

export const issuesRouter = Router()

const LIST_SQL = `
  SELECT
    i.*,
    p.key || '-' || i.number AS key,
    a.name AS assignee_name,
    a.initials AS assignee_initials,
    r.name AS reporter_name,
    s.name AS sprint_name,
    COALESCE((SELECT SUM(hours) FROM time_logs t WHERE t.issue_id = i.id), 0) AS spent_hours,
    (SELECT COUNT(*)::int FROM checklist_items c WHERE c.issue_id = i.id) AS checklist_total,
    (SELECT COUNT(*)::int FROM checklist_items c WHERE c.issue_id = i.id AND c.done) AS checklist_done,
    COALESCE((
      SELECT json_agg(json_build_object('id', l.id, 'name', l.name) ORDER BY l.name)
      FROM issue_labels il
      JOIN labels l ON l.id = il.label_id
      WHERE il.issue_id = i.id
    ), '[]'::json) AS labels,
    COALESCE((
      SELECT json_agg(json_build_object('id', u.id, 'name', u.name, 'initials', u.initials) ORDER BY u.name)
      FROM issue_assignees ia
      JOIN users u ON u.id = ia.user_id
      WHERE ia.issue_id = i.id
    ), '[]'::json) AS assignees
  FROM issues i
  JOIN projects p ON p.id = i.project_id
  LEFT JOIN users a ON a.id = i.assignee_id
  LEFT JOIN users r ON r.id = i.reporter_id
  LEFT JOIN sprints s ON s.id = i.sprint_id
`

function peopleOf(row) {
  const raw = typeof row.assignees === 'string' ? JSON.parse(row.assignees) : row.assignees
  const people = Array.isArray(raw) ? raw.filter((person) => person && person.id) : []
  if (!people.length && row.assignee_id) {
    people.push({
      id: row.assignee_id,
      name: row.assignee_name,
      initials: row.assignee_initials,
    })
  }
  return people
}

function shapeIssue(row, withDescription = false) {
  const labels = typeof row.labels === 'string' ? JSON.parse(row.labels) : row.labels
  const assignees = peopleOf(row)
  const issue = {
    id: row.id,
    key: row.key,
    number: row.number,
    type: row.type,
    title: row.title,
    status: row.status,
    priority: row.priority,
    estimateHours: row.estimate_hours,
    spentHours: Number(row.spent_hours),
    assignees,
    assignee: assignees[0] || null,
    reporter: row.reporter_id ? { id: row.reporter_id, name: row.reporter_name } : null,
    sprint: row.sprint_id ? { id: row.sprint_id, name: row.sprint_name } : null,
    startDate: row.start_date,
    dueDate: row.due_date,
    position: row.position,
    labels: labels || [],
    checklistDone: row.checklist_done,
    checklistTotal: row.checklist_total,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
  if (withDescription) issue.description = row.description
  return issue
}

export async function getDetail(id, db = pool) {
  const projectId = await getProjectId()
  const { rows } = await db.query(`${LIST_SQL} WHERE i.id = $1 AND i.project_id = $2`, [id, projectId])
  if (!rows[0]) return null
  const issue = shapeIssue(rows[0], true)
  const [checklist, comments, attachments, timeLogs, history] = await Promise.all([
    db.query(
      'SELECT id, title, done, position FROM checklist_items WHERE issue_id = $1 ORDER BY position, id',
      [id],
    ),
    db.query(
      `SELECT c.id, c.body, c.created_at, u.id AS user_id, u.name, u.initials
       FROM comments c
       LEFT JOIN users u ON u.id = c.author_id
       WHERE c.issue_id = $1
       ORDER BY c.created_at, c.id`,
      [id],
    ),
    db.query(
      `SELECT id, filename, size_bytes, created_at
       FROM attachments WHERE issue_id = $1 ORDER BY created_at, id`,
      [id],
    ),
    db.query(
      `SELECT t.id, t.hours, t.note, t.logged_at, u.id AS user_id, u.name, u.initials
       FROM time_logs t
       LEFT JOIN users u ON u.id = t.user_id
       WHERE t.issue_id = $1
       ORDER BY t.logged_at DESC, t.id DESC`,
      [id],
    ),
    db.query(
      `SELECT h.id, h.field, h.old_value, h.new_value, h.created_at, u.name
       FROM issue_history h
       LEFT JOIN users u ON u.id = h.user_id
       WHERE h.issue_id = $1
       ORDER BY h.created_at DESC, h.id DESC`,
      [id],
    ),
  ])
  issue.checklist = checklist.rows
  issue.comments = comments.rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: row.created_at,
    author: row.user_id ? { id: row.user_id, name: row.name, initials: row.initials } : null,
  }))
  issue.attachments = attachments.rows.map((row) => ({
    id: row.id,
    filename: row.filename,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  }))
  issue.timeLogs = timeLogs.rows.map((row) => ({
    id: row.id,
    hours: Number(row.hours),
    note: row.note,
    loggedAt: row.logged_at,
    user: row.user_id ? { id: row.user_id, name: row.name, initials: row.initials } : null,
  }))
  issue.history = history.rows.map((row) => ({
    id: row.id,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    createdAt: row.created_at,
    user: row.name ? { name: row.name } : null,
  }))
  return issue
}

async function assertIssue(db, id) {
  const projectId = await getProjectId()
  const { rows } = await db.query(
    'SELECT * FROM issues WHERE id = $1 AND project_id = $2 FOR UPDATE',
    [id, projectId],
  )
  if (!rows[0]) throw bad('Задача не найдена', 404)
  return rows[0]
}

function scopeFilter(scope) {
  if (!scope || scope === 'active') return { kind: 'active' }
  if (scope === 'backlog' || scope === 'all') return { kind: scope }
  const id = Number(scope)
  if (!Number.isInteger(id) || id <= 0) throw bad('Некорректная выборка')
  return { kind: 'sprint', id }
}

issuesRouter.get('/issues', wrap(async (req, res) => {
  const projectId = await getProjectId()
  const scope = scopeFilter(req.query.scope)
  const params = [projectId]
  let where = 'i.project_id = $1'
  if (scope.kind === 'backlog') where += ' AND i.sprint_id IS NULL'
  if (scope.kind === 'active') {
    where += ` AND i.sprint_id = (
      SELECT id FROM sprints WHERE project_id = $1 AND status = 'active' LIMIT 1
    )`
  }
  if (scope.kind === 'sprint') {
    params.push(scope.id)
    where += ` AND i.sprint_id = $2`
  }
  const { rows } = await pool.query(
    `${LIST_SQL} WHERE ${where} ORDER BY i.position, i.id`,
    params,
  )
  res.json(rows.map((row) => shapeIssue(row)))
}))

issuesRouter.get('/issues/:id', wrap(async (req, res) => {
  const issue = await getDetail(idOf(req.params.id))
  if (!issue) throw bad('Задача не найдена', 404)
  res.json(issue)
}))

issuesRouter.post('/issues', wrap(async (req, res) => {
  const title = String(req.body?.title || '').trim()
  const type = req.body?.type
  if (!TYPES.includes(type)) throw bad('Тип: задача или баг')
  if (!title || title.length > 200) throw bad('Название: от 1 до 200 символов')
  const sprintId = req.body?.sprintId == null || req.body.sprintId === ''
    ? null
    : idOf(req.body.sprintId)

  const id = await withTx(async (client) => {
    const user = await requireUser(client, req.userId)
    const projectId = await getProjectId()
    if (sprintId) {
      const sprint = await client.query(
        'SELECT id FROM sprints WHERE id = $1 AND project_id = $2',
        [sprintId, projectId],
      )
      if (!sprint.rows[0]) throw bad('Спринт не найден', 404)
    }
    await client.query('SELECT pg_advisory_xact_lock($1)', [projectId])
    const number = await client.query(
      'SELECT COALESCE(MAX(number), 0) + 1 AS n FROM issues WHERE project_id = $1',
      [projectId],
    )
    const position = await client.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS p
       FROM issues
       WHERE project_id = $1 AND status = 'todo' AND sprint_id IS NOT DISTINCT FROM $2`,
      [projectId, sprintId],
    )
    const inserted = await client.query(
      `INSERT INTO issues (
         project_id, number, type, title, status, priority, reporter_id, sprint_id, position
       ) VALUES ($1, $2, $3, $4, 'todo', 'medium', $5, $6, $7)
       RETURNING id`,
      [projectId, number.rows[0].n, type, title, user.id, sprintId, position.rows[0].p],
    )
    const issueId = inserted.rows[0].id
    await addHistory(client, {
      issueId,
      userId: user.id,
      field: 'created',
      newValue: title,
    })
    return issueId
  })
  res.status(201).json(await getDetail(id))
}))

issuesRouter.patch('/issues/:id', wrap(async (req, res) => {
  const id = idOf(req.params.id)
  await withTx(async (client) => {
    const user = await requireUser(client, req.userId)
    const issue = await assertIssue(client, id)
    const body = req.body || {}
    const next = { ...issue }

    if (body.title != null) {
      const title = String(body.title).trim()
      if (!title || title.length > 200) throw bad('Название: от 1 до 200 символов')
      await addHistory(client, {
        issueId: id, userId: user.id, field: 'title', oldValue: issue.title, newValue: title,
      })
      next.title = title
    }

    if (body.description != null) {
      const description = String(body.description)
      if (description.length > 20000) throw bad('Описание слишком длинное')
      if (description !== issue.description) {
        await addHistory(client, {
          issueId: id, userId: user.id, field: 'description', force: true,
        })
        next.description = description
      }
    }

    if (body.type != null) {
      if (!TYPES.includes(body.type)) throw bad('Тип: задача или баг')
      await addHistory(client, {
        issueId: id, userId: user.id, field: 'type', oldValue: issue.type, newValue: body.type,
      })
      next.type = body.type
    }

    if (body.status != null) {
      if (!STATUSES.includes(body.status)) throw bad('Некорректный статус')
      await addHistory(client, {
        issueId: id, userId: user.id, field: 'status', oldValue: issue.status, newValue: body.status,
      })
      if (body.status !== issue.status) {
        const position = await client.query(
          `SELECT COALESCE(MAX(position), -1) + 1 AS p
           FROM issues
           WHERE project_id = $1 AND status = $2 AND sprint_id IS NOT DISTINCT FROM $3 AND id <> $4`,
          [issue.project_id, body.status, issue.sprint_id, id],
        )
        next.position = position.rows[0].p
      }
      next.status = body.status
    }

    if (body.priority != null) {
      if (!PRIORITIES.includes(body.priority)) throw bad('Некорректный приоритет')
      await addHistory(client, {
        issueId: id, userId: user.id, field: 'priority', oldValue: issue.priority, newValue: body.priority,
      })
      next.priority = body.priority
    }

    if (body.estimateHours !== undefined) {
      let estimate = null
      if (body.estimateHours !== null && body.estimateHours !== '') {
        estimate = Number(body.estimateHours)
        if (!Number.isFinite(estimate) || estimate < 0 || estimate > 999) throw bad('Некорректная оценка')
        estimate = Math.round(estimate * 100) / 100
      }
      await addHistory(client, {
        issueId: id,
        userId: user.id,
        field: 'estimate',
        oldValue: issue.estimate_hours == null ? null : String(issue.estimate_hours),
        newValue: estimate == null ? null : String(estimate),
      })
      next.estimate_hours = estimate
    }

    if (body.assigneeIds !== undefined || body.assigneeId !== undefined) {
      const raw = Array.isArray(body.assigneeIds)
        ? body.assigneeIds
        : (body.assigneeId == null || body.assigneeId === '' ? [] : [body.assigneeId])
      const ids = raw.map((value) => idOf(value))
      if (new Set(ids).size !== ids.length) throw bad('Исполнители повторяются')
      if (ids.length) {
        const found = await client.query('SELECT id FROM users WHERE id = ANY($1::int[])', [ids])
        if (found.rows.length !== ids.length) throw bad('Исполнитель не найден', 404)
      }
      const previous = await client.query(
        `SELECT u.name FROM issue_assignees ia
         JOIN users u ON u.id = ia.user_id
         WHERE ia.issue_id = $1 ORDER BY u.name`,
        [id],
      )
      const oldNames = previous.rows.length
        ? previous.rows.map((row) => row.name)
        : (issue.assignee_id ? [await userName(client, issue.assignee_id)] : [])
      const nextNames = ids.length
        ? (await client.query('SELECT name FROM users WHERE id = ANY($1::int[]) ORDER BY name', [ids])).rows.map((row) => row.name)
        : []
      await client.query('DELETE FROM issue_assignees WHERE issue_id = $1', [id])
      for (const userId of ids) {
        await client.query('INSERT INTO issue_assignees (issue_id, user_id) VALUES ($1, $2)', [id, userId])
      }
      await addHistory(client, {
        issueId: id,
        userId: user.id,
        field: 'assignee',
        oldValue: oldNames.filter((name) => name && name !== 'никто').join(', ') || null,
        newValue: nextNames.join(', ') || null,
      })
      next.assignee_id = ids[0] ?? null
    }

    if (body.sprintId !== undefined) {
      const sprintId = body.sprintId == null || body.sprintId === '' ? null : idOf(body.sprintId)
      if (sprintId) {
        const found = await client.query(
          'SELECT id FROM sprints WHERE id = $1 AND project_id = $2',
          [sprintId, issue.project_id],
        )
        if (!found.rows[0]) throw bad('Спринт не найден', 404)
      }
      await addHistory(client, {
        issueId: id,
        userId: user.id,
        field: 'sprint',
        oldValue: await sprintName(client, issue.sprint_id),
        newValue: await sprintName(client, sprintId),
      })
      next.sprint_id = sprintId
    }

    if (body.startDate !== undefined || body.dueDate !== undefined) {
      const startDate = body.startDate !== undefined ? dateOrNull(body.startDate) : issue.start_date
      const dueDate = body.dueDate !== undefined ? dateOrNull(body.dueDate) : issue.due_date
      if (startDate && dueDate && startDate > dueDate) throw bad('Начало позже дедлайна')
      if (body.startDate !== undefined) {
        await addHistory(client, {
          issueId: id, userId: user.id, field: 'start_date', oldValue: issue.start_date, newValue: startDate,
        })
        next.start_date = startDate
      }
      if (body.dueDate !== undefined) {
        await addHistory(client, {
          issueId: id, userId: user.id, field: 'due_date', oldValue: issue.due_date, newValue: dueDate,
        })
        next.due_date = dueDate
      }
    }

    await client.query(
      `UPDATE issues SET
         title = $1, description = $2, type = $3, status = $4, priority = $5,
         estimate_hours = $6, assignee_id = $7, sprint_id = $8,
         start_date = $9, due_date = $10, position = $11, updated_at = now()
       WHERE id = $12`,
      [
        next.title, next.description, next.type, next.status, next.priority,
        next.estimate_hours, next.assignee_id, next.sprint_id,
        next.start_date, next.due_date, next.position, id,
      ],
    )

    if (Array.isArray(body.labelIds)) {
      const ids = body.labelIds.map((value) => idOf(value))
      if (new Set(ids).size !== ids.length) throw bad('Метки повторяются')
      if (ids.length) {
        const found = await client.query(
          'SELECT id, name FROM labels WHERE project_id = $1 AND id = ANY($2::int[])',
          [issue.project_id, ids],
        )
        if (found.rows.length !== ids.length) throw bad('Неизвестная метка')
      }
      const previous = await client.query(
        `SELECT l.name FROM issue_labels il
         JOIN labels l ON l.id = il.label_id
         WHERE il.issue_id = $1 ORDER BY l.name`,
        [id],
      )
      const nextNames = ids.length
        ? (await client.query('SELECT name FROM labels WHERE id = ANY($1::int[]) ORDER BY name', [ids])).rows
        : []
      await client.query('DELETE FROM issue_labels WHERE issue_id = $1', [id])
      for (const labelId of ids) {
        await client.query(
          'INSERT INTO issue_labels (issue_id, label_id) VALUES ($1, $2)',
          [id, labelId],
        )
      }
      await addHistory(client, {
        issueId: id,
        userId: user.id,
        field: 'labels',
        oldValue: previous.rows.map((row) => row.name).join(', '),
        newValue: nextNames.map((row) => row.name).join(', '),
      })
    }
  })
  res.json(await getDetail(id))
}))

issuesRouter.delete('/issues/:id', wrap(async (req, res) => {
  const id = idOf(req.params.id)
  const stored = await withTx(async (client) => {
    await requireUser(client, req.userId)
    const issue = await assertIssue(client, id)
    const files = await client.query(
      'SELECT stored_name FROM attachments WHERE issue_id = $1',
      [issue.id],
    )
    await client.query('DELETE FROM issues WHERE id = $1', [issue.id])
    return files.rows.map((row) => row.stored_name)
  })
  for (const name of stored) {
    await fs.unlink(path.join(uploadDir, path.basename(name))).catch(() => {})
  }
  res.status(204).end()
}))

issuesRouter.post('/issues/place', wrap(async (req, res) => {
  const id = idOf(req.body?.id)
  const sprintId = req.body?.sprintId == null || req.body?.sprintId === '' ? null : idOf(req.body.sprintId)
  let index = Number(req.body?.index)
  if (!Number.isInteger(index) || index < 0) index = 0

  await withTx(async (client) => {
    const user = await requireUser(client, req.userId)
    const issue = await assertIssue(client, id)
    if (sprintId) {
      const found = await client.query(
        'SELECT id, name FROM sprints WHERE id = $1 AND project_id = $2',
        [sprintId, issue.project_id],
      )
      if (!found.rows[0]) throw bad('Спринт не найден', 404)
    }
    const column = await client.query(
      `SELECT id FROM issues
       WHERE project_id = $1 AND sprint_id IS NOT DISTINCT FROM $2
       ORDER BY position, id
       FOR UPDATE`,
      [issue.project_id, sprintId],
    )
    const ids = column.rows.map((row) => row.id).filter((item) => item !== id)
    ids.splice(Math.min(index, ids.length), 0, id)
    for (let position = 0; position < ids.length; position += 1) {
      await client.query(
        'UPDATE issues SET sprint_id = $1, position = $2, updated_at = now() WHERE id = $3',
        [sprintId, position, ids[position]],
      )
    }
    if ((issue.sprint_id || null) !== sprintId) {
      await addHistory(client, {
        issueId: id,
        userId: user.id,
        field: 'sprint',
        oldValue: await sprintName(client, issue.sprint_id),
        newValue: await sprintName(client, sprintId),
      })
    }
  })
  res.json({ ok: true })
}))

issuesRouter.post('/issues/reorder', wrap(async (req, res) => {
  const status = req.body?.status
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((value) => idOf(value)) : []
  if (!STATUSES.includes(status) || !ids.length || ids.length > 500) throw bad('Некорректный порядок')
  if (new Set(ids).size !== ids.length) throw bad('Карточки в порядке повторяются')

  await withTx(async (client) => {
    const user = await requireUser(client, req.userId)
    const projectId = await getProjectId()
    const current = await client.query(
      'SELECT id, status FROM issues WHERE project_id = $1 AND id = ANY($2::int[]) FOR UPDATE',
      [projectId, ids],
    )
    if (current.rows.length !== ids.length) throw bad('Не все карточки найдены', 404)
    for (let index = 0; index < ids.length; index += 1) {
      const row = current.rows.find((item) => item.id === ids[index])
      await client.query(
        'UPDATE issues SET status = $1, position = $2, updated_at = now() WHERE id = $3',
        [status, index, ids[index]],
      )
      if (row.status !== status) {
        await addHistory(client, {
          issueId: ids[index],
          userId: user.id,
          field: 'status',
          oldValue: row.status,
          newValue: status,
        })
      }
    }
  })
  res.json({ ok: true })
}))

issuesRouter.post('/labels', wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim()
  if (!name || name.length > 24) throw bad('Метка: от 1 до 24 символов')
  const projectId = await getProjectId()
  const existing = await pool.query(
    'SELECT id FROM labels WHERE project_id = $1 AND lower(name) = lower($2)',
    [projectId, name],
  )
  if (existing.rows[0]) throw bad('Такая метка уже есть')
  const { rows } = await pool.query(
    'INSERT INTO labels (project_id, name) VALUES ($1, $2) RETURNING id, name',
    [projectId, name],
  )
  res.status(201).json(rows[0])
}))

issuesRouter.delete('/labels/:id', wrap(async (req, res) => {
  const id = idOf(req.params.id)
  const projectId = await getProjectId()
  const { rowCount } = await pool.query(
    'DELETE FROM labels WHERE id = $1 AND project_id = $2',
    [id, projectId],
  )
  if (!rowCount) throw bad('Метка не найдена', 404)
  res.status(204).end()
}))
