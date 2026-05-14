import { Router, Request, Response } from 'express'
import { loadSpecFromUrl } from '../spec/loader'

const router = Router()

// A minimal OpenAPI 3.x spec describing httpbin.org — used for local testing.
// Load it in the UI via: http://localhost:4000/api/spec/example.json
const EXAMPLE_SPEC = {
  openapi: '3.0.0',
  info: { title: 'HTTPBin (example)', version: '1.0.0' },
  servers: [{ url: 'https://httpbin.org' }],
  paths: {
    '/post': {
      post: {
        summary: 'Echo a POST request',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email'],
                properties: {
                  name:  { type: 'string', minLength: 1 },
                  email: { type: 'string', format: 'email' },
                  age:   { type: 'integer', minimum: 0 },
                },
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Echoed request',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    json: { type: 'object' },
                    url:  { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/get': {
      get: {
        summary: 'Echo a GET request',
        responses: {
          '200': { description: 'Echoed request' },
        },
      },
    },
  },
}

router.get('/example.json', (_req: Request, res: Response) => {
  res.json(EXAMPLE_SPEC)
})

router.post('/load', async (req: Request, res: Response) => {
  const { url } = req.body
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: '`url` is required.' })
    return
  }

  try {
    const { key, title, version, pathCount } = await loadSpecFromUrl(url)
    res.json({ key, title, version, pathCount })
  } catch (err) {
    res.status(422).json({ error: `Failed to load spec: ${(err as Error).message}` })
  }
})

export default router
