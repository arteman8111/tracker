import fs from 'fs/promises'
import express from 'express'
import cors from 'cors'
import { getProjectId, pool, uploadDir, waitForDb } from './db.js'
import { issuesRouter } from './issues.js'
import { attachmentError, collabRouter } from './collab.js'
import { listSprints, sprintsRouter } from './sprints.js'
import { seed } from './seed.js'
import { upgrade } from './upgrade.js'
import { hashPassword, newToken, verifyPassword } from './auth.js'
import { bad, initials, wrap } from './util.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))
app.use(async (req, res, next) => {
  try {
    const header = req.header('authorization') || ''
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
    req.userId = null
    if (token) {
      const { rows } = await pool.query(
        'SELECT user_id FROM sessions WHERE token = $1 AND expires_at > now()',
        [token],
      )
      req.userId = rows[0]?.user_id || null
    }
    const open = req.path === '/api/health' || req.path === '/api/login' || req.path === '/api/logout'
    if (req.path.startsWith('/api') && !open && !req.userId) {
      res.status(401).json({ error: 'Нужно войти' })
      return
    }
    next()
  } catch (error) {
    next(error)
  }
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

app.post('/api/login', wrap(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  const { rows } = await pool.query(
    'SELECT id, name, email, initials, password_hash FROM users WHERE lower(email) = $1',
    [email],
  )
  const user = rows[0]
  if (!user || !verifyPassword(password, user.password_hash)) throw bad('Неверная почта или пароль', 401)
  const token = newToken()
  await pool.query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval '30 days')`,
    [token, user.id],
  )
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, initials: user.initials },
  })
}))

app.post('/api/logout', wrap(async (req, res) => {
  const header = req.header('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (token) await pool.query('DELETE FROM sessions WHERE token = $1', [token])
  res.status(204).end()
}))

app.get('/api/me', wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, email, initials FROM users WHERE id = $1',
    [req.userId],
  )
  if (!rows[0]) throw bad('Нужно войти', 401)
  res.json(rows[0])
}))

app.post('/api/users', wrap(async (req, res) => {
  const name = String(req.body?.name || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '')
  if (name.length < 2 || name.length > 80) throw bad('Имя: от 2 до 80 символов')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw bad('Некорректная почта')
  if (password.length < 4 || password.length > 80) throw bad('Пароль: от 4 до 80 символов')
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, initials, password_hash)
       VALUES ($1, $2, $3, $4) RETURNING id, name, email, initials`,
      [name, email, initials(name), hashPassword(password)],
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
await upgrade()
app.listen(port, () => {
  console.log(`API http://127.0.0.1:${port}`)
})
