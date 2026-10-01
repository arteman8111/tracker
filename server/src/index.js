import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

const port = Number(process.env.PORT || 3001)
app.listen(port, () => {
  console.log(`API http://127.0.0.1:${port}`)
})
