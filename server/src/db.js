import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

export const uploadDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads')

const { Pool, types } = pg

types.setTypeParser(1082, (value) => value)
types.setTypeParser(1700, (value) => (value == null ? null : Number(value)))

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://rks:rks@127.0.0.1:5432/rks',
})

export async function waitForDb() {
  let lastError
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await pool.query('SELECT 1')
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  throw lastError
}

export async function withTx(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

let projectIdCache = null

export async function getProjectId() {
  if (projectIdCache) return projectIdCache
  const { rows } = await pool.query('SELECT id FROM projects ORDER BY id LIMIT 1')
  if (!rows[0]) throw new Error('Проект не создан')
  projectIdCache = rows[0].id
  return projectIdCache
}
