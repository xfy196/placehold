import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono().basePath("/api")

app.get('/', (c) => {
  return c.text('Hello Hono!sss')
})

const port = 3000
console.log(`Server is running on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
