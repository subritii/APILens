import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import proxyRoutes from './routes/proxy'
import specRoutes from './routes/spec'

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors({ origin: 'http://localhost:3000' }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/proxy', proxyRoutes)
app.use('/api/spec', specRoutes)

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`)
})
