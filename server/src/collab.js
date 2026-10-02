import fs from 'fs/promises'
import path from 'path'
import { Router } from 'express'
import multer from 'multer'
import { getProjectId, pool, uploadDir, withTx } from './db.js'
import { getDetail } from './issues.js'
import { addHistory, bad, dateOrNull, idOf, requireUser, wrap } from './util.js'

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12).replace(/[^.a-zA-Z0-9]/g, '')
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
})

export const collabRouter = Router()

function originalName(file) {
  const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8')
  const base = path.basename(decoded).replace(/[/\\]/g, '').trim()
  return (base || 'file').slice(0, 180)
}

async function touch(db, issueId) {
  await db.query('UPDATE issues SET updated_at = now() WHERE id = $1', [issueId])
}

collabRouter.post('/issues/:id/checklist', wrap(async (req, res) => {
  const issueId = idOf(req.params.id)
  const title = String(req.body?.title || '').trim()
  if (!title || title.length > 200) throw bad('Пункт: от 1 до 200 символов')
  await withTx(async (client) => {
    const user = await requireUser(client, req.userId)
    const projectId = await getProjectId()
    const issue = await client.query(
      'SELECT id FROM issues WHERE id = $1 AND project_id = $2',
      [issueId, projectId],
    )
    if (!issue.rows[0]) throw bad('Задача не найдена', 404)
    const position = await client.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM checklist_items WHERE issue_id = $1',
      [issueId],
    )
    await client.query(
      'INSERT INTO checklist_items (issue_id, title, position) VALUES ($1, $2, $3)',
      [issueId, title, position.rows[0].p],
    )
    await addHistory(client, { issueId, userId: user.id, field: 'checklist', newValue: title })
    await touch(client, issueId)
  })
  res.status(201).json(await getDetail(issueId))
}))

collabRouter.patch('/checklist/:id', wrap(async (req, res) => {
  const itemId = idOf(req.params.id)
  const issueId = await withTx(async (client) => {
    await requireUser(client, req.userId)
    const projectId = await getProjectId()
    const current = await client.query(
      `SELECT c.* FROM checklist_items c
       JOIN issues i ON i.id = c.issue_id
       WHERE c.id = $1 AND i.project_id = $2
       FOR UPDATE`,
      [itemId, projectId],
    )
    if (!current.rows[0]) throw bad('Пункт не найден', 404)
    const row = current.rows[0]
    let title = row.title
    let done = row.done
    if (req.body?.title != null) {
      title = String(req.body.title).trim()
      if (!title || title.length > 200) throw bad('Пункт: от 1 до 200 символов')
    }
    if (req.body?.done != null) done = Boolean(req.body.done)
    await client.query(
      'UPDATE checklist_items SET title = $1, done = $2 WHERE id = $3',
      [title, done, itemId],
    )
    await touch(client, row.issue_id)
    return row.issue_id
  })
  res.json(await getDetail(issueId))
}))

collabRouter.delete('/checklist/:id', wrap(async (req, res) => {
  const itemId = idOf(req.params.id)
  const issueId = await withTx(async (client) => {
    const user = await requireUser(client, req.userId)
    const projectId = await getProjectId()
    const current = await client.query(
      `SELECT c.* FROM checklist_items c
       JOIN issues i ON i.id = c.issue_id
       WHERE c.id = $1 AND i.project_id = $2`,
      [itemId, projectId],
    )
    if (!current.rows[0]) throw bad('Пункт не найден', 404)
    await client.query('DELETE FROM checklist_items WHERE id = $1', [itemId])
    await addHistory(client, {
      issueId: current.rows[0].issue_id,
      userId: user.id,
      field: 'checklist',
      oldValue: current.rows[0].title,
    })
    await touch(client, current.rows[0].issue_id)
    return current.rows[0].issue_id
  })
  res.json(await getDetail(issueId))
}))

collabRouter.post('/issues/:id/comments', wrap(async (req, res) => {
  const issueId = idOf(req.params.id)
  const body = String(req.body?.body || '').trim()
  if (!body || body.length > 5000) throw bad('Комментарий: от 1 до 5000 символов')
  await withTx(async (client) => {
    const user = await requireUser(client, req.userId)
    const projectId = await getProjectId()
    const issue = await client.query(
      'SELECT id FROM issues WHERE id = $1 AND project_id = $2',
      [issueId, projectId],
    )
    if (!issue.rows[0]) throw bad('Задача не найдена', 404)
    await client.query(
      'INSERT INTO comments (issue_id, author_id, body) VALUES ($1, $2, $3)',
      [issueId, user.id, body],
    )
    await touch(client, issueId)
  })
  res.status(201).json(await getDetail(issueId))
}))

collabRouter.delete('/comments/:id', wrap(async (req, res) => {
  const commentId = idOf(req.params.id)
  const issueId = await withTx(async (client) => {
    await requireUser(client, req.userId)
    const projectId = await getProjectId()
    const current = await client.query(
      `SELECT c.id, c.issue_id FROM comments c
       JOIN issues i ON i.id = c.issue_id
       WHERE c.id = $1 AND i.project_id = $2`,
      [commentId, projectId],
    )
    if (!current.rows[0]) throw bad('Комментарий не найден', 404)
    await client.query('DELETE FROM comments WHERE id = $1', [commentId])
    await touch(client, current.rows[0].issue_id)
    return current.rows[0].issue_id
  })
  res.json(await getDetail(issueId))
}))

collabRouter.post('/issues/:id/attachments', upload.single('file'), wrap(async (req, res) => {
  const issueId = idOf(req.params.id)
  if (!req.file) throw bad('Файл не передан')
  try {
    await withTx(async (client) => {
      const user = await requireUser(client, req.userId)
      const projectId = await getProjectId()
      const issue = await client.query(
        'SELECT id FROM issues WHERE id = $1 AND project_id = $2',
        [issueId, projectId],
      )
      if (!issue.rows[0]) throw bad('Задача не найдена', 404)
      const filename = originalName(req.file)
      await client.query(
        `INSERT INTO attachments (issue_id, filename, stored_name, size_bytes, uploaded_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [issueId, filename, req.file.filename, req.file.size, user.id],
      )
      await addHistory(client, { issueId, userId: user.id, field: 'file', newValue: filename })
      await touch(client, issueId)
    })
  } catch (error) {
    await fs.unlink(req.file.path).catch(() => {})
    throw error
  }
  res.status(201).json(await getDetail(issueId))
}))

collabRouter.get('/attachments/:id', wrap(async (req, res) => {
  const id = idOf(req.params.id)
  const projectId = await getProjectId()
  const { rows } = await pool.query(
    `SELECT a.filename, a.stored_name
     FROM attachments a
     JOIN issues i ON i.id = a.issue_id
     WHERE a.id = $1 AND i.project_id = $2`,
    [id, projectId],
  )
  if (!rows[0]) throw bad('Файл не найден', 404)
  const abs = path.join(uploadDir, path.basename(rows[0].stored_name))
  try {
    await fs.access(abs)
  } catch {
    throw bad('Файл не найден', 404)
  }
  res.download(abs, rows[0].filename)
}))

collabRouter.patch('/attachments/:id', wrap(async (req, res) => {
  const id = idOf(req.params.id)
  const filename = String(req.body?.filename || '').trim()
  if (!filename || filename.length > 180) throw bad('Имя файла: от 1 до 180 символов')
  const issueId = await withTx(async (client) => {
    await requireUser(client, req.userId)
    const projectId = await getProjectId()
    const current = await client.query(
      `SELECT a.id, a.issue_id, a.filename FROM attachments a
       JOIN issues i ON i.id = a.issue_id
       WHERE a.id = $1 AND i.project_id = $2`,
      [id, projectId],
    )
    if (!current.rows[0]) throw bad('Файл не найден', 404)
    await client.query('UPDATE attachments SET filename = $1 WHERE id = $2', [filename, id])
    return current.rows[0].issue_id
  })
  res.json(await getDetail(issueId))
}))

collabRouter.delete('/attachments/:id', wrap(async (req, res) => {
  const id = idOf(req.params.id)
  const removed = await withTx(async (client) => {
    const user = await requireUser(client, req.userId)
    const projectId = await getProjectId()
    const current = await client.query(
      `SELECT a.* FROM attachments a
       JOIN issues i ON i.id = a.issue_id
       WHERE a.id = $1 AND i.project_id = $2`,
      [id, projectId],
    )
    if (!current.rows[0]) throw bad('Файл не найден', 404)
    await client.query('DELETE FROM attachments WHERE id = $1', [id])
    await addHistory(client, {
      issueId: current.rows[0].issue_id,
      userId: user.id,
      field: 'file',
      oldValue: current.rows[0].filename,
    })
    await touch(client, current.rows[0].issue_id)
    return current.rows[0]
  })
  await fs.unlink(path.join(uploadDir, path.basename(removed.stored_name))).catch(() => {})
  res.json(await getDetail(removed.issue_id))
}))

collabRouter.post('/issues/:id/time', wrap(async (req, res) => {
  const issueId = idOf(req.params.id)
  const hours = Number(req.body?.hours)
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw bad('Часы: больше 0 и не больше 24')
  const rounded = Math.round(hours * 100) / 100
  const note = String(req.body?.note || '').trim()
  if (note.length > 500) throw bad('Заметка слишком длинная')
  const loggedAt = dateOrNull(req.body?.loggedAt) || new Date().toISOString().slice(0, 10)

  await withTx(async (client) => {
    const user = await requireUser(client, req.userId)
    const projectId = await getProjectId()
    const issue = await client.query(
      'SELECT id FROM issues WHERE id = $1 AND project_id = $2',
      [issueId, projectId],
    )
    if (!issue.rows[0]) throw bad('Задача не найдена', 404)
    await client.query(
      `INSERT INTO time_logs (issue_id, user_id, hours, note, logged_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [issueId, user.id, rounded, note, loggedAt],
    )
    await addHistory(client, {
      issueId,
      userId: user.id,
      field: 'time',
      newValue: String(rounded),
    })
    await touch(client, issueId)
  })
  res.status(201).json(await getDetail(issueId))
}))

collabRouter.delete('/time/:id', wrap(async (req, res) => {
  const timeId = idOf(req.params.id)
  const issueId = await withTx(async (client) => {
    const user = await requireUser(client, req.userId)
    const projectId = await getProjectId()
    const current = await client.query(
      `SELECT t.* FROM time_logs t
       JOIN issues i ON i.id = t.issue_id
       WHERE t.id = $1 AND i.project_id = $2`,
      [timeId, projectId],
    )
    if (!current.rows[0]) throw bad('Запись времени не найдена', 404)
    await client.query('DELETE FROM time_logs WHERE id = $1', [timeId])
    await addHistory(client, {
      issueId: current.rows[0].issue_id,
      userId: user.id,
      field: 'time',
      oldValue: String(current.rows[0].hours),
    })
    await touch(client, current.rows[0].issue_id)
    return current.rows[0].issue_id
  })
  res.json(await getDetail(issueId))
}))

export function attachmentError(error, _req, res, next) {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    res.status(400).json({ error: 'Файл больше 10 МБ' })
    return
  }
  next(error)
}
