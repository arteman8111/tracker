import fs from 'fs/promises'
import express from 'express'
import cors from 'cors'
import { getProjectId, pool, uploadDir, waitForDb } from './db.js'
import { issuesRouter } from './issues.js'
import { attachmentError, collabRouter } from './collab.js'
import { listSprints, sprintsRouter } from './sprints.js'
import { seed } from './seed.js'
import { bad, initials, wrap } from './util.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use((req, _res, next) => {
  const raw = req.header('x-user-id')
  const id = Number(raw)
  req.userId = Number.isInteger(id) && id > 0 ? id : null
  next()
})

app.get('/api/health', wrap(async (_req, res) => {
  await pool.query('SELECT 1')
  res.json({ ok: true })
}))

app.get('/api/meta', wrap(async (_req, res) => {
  const projectId = await getProjectId()
  const [project, users, labels, sprints] = await Promise.all([
    pool.query('SELECT id, key, name FROM projects WHERE id = $1', [projectId]),
    pool.query('SELECT id, name, email, initials FROM users ORDER BY name, id'),
    pool.query('SELECT id, name FROM labels WHERE project_id = $1 ORDER BY name', [projectId]),
    listSprints(),
  ])
  res.json({
    project: project.rows[0],
    users: users.rows,
    labels: labels.rows,
    sprints,
  })
}))

app.post('/api/users', wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  if (name.length < 2 || name.length > 80) throw bad('Имя: от 2 до 80 символов')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw bad('Некорректная почта')
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, initials) VALUES ($1, $2, $3) RETURNING id, name, email, initials',
      [name, email, initials(name)],
    )
    res.status(201).json(rows[0])
  } catch (error) {
    if (error.code === '23505') throw bad('Такая почта уже есть')
    throw error
  }
}))

app.use('/api', issuesRouter)
app.use('/api', collabRouter)
app.use('/api', sprintsRouter)
app.use('/api', attachmentError)
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Не найдено' })
})
app.use((error, _req, res, _next) => {
  if (error.expose) {
    res.status(error.status || 400).json({ error: error.message })
    return
  }
  console.error(error)
  res.status(500).json({ error: 'Внутренняя ошибка' })
})

async function migrate() {
  const sql = await fs.readFile(new URL('./schema.sql', import.meta.url), 'utf8')
  await pool.query(sql)
}

const port = Number(process.env.PORT || 3088)
await fs.mkdir(uploadDir, { recursive: true })
await waitForDb()
await migrate()
await seed()
app.listen(port, () => {
  console.log(`API http://127.0.0.1:${port}`)
})
