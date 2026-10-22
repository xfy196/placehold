const fs = require('fs')
const path = require('path')
const Koa = require('koa')
const app = new Koa()
const views = require('koa-views')
const json = require('koa-json')
const onerror = require('koa-onerror')
const bodyparser = require('koa-bodyparser')
const logger = require('koa-logger')

const image = require('./routes/image')
const publicDir = path.join(__dirname, 'public')

function assetVersion(relPath) {
    try {
        return String(Math.floor(fs.statSync(path.join(publicDir, relPath)).mtimeMs))
    } catch {
        return '0'
    }
}

// error handler
onerror(app)

// middlewares
app.use(bodyparser({
    enableTypes: ['json', 'form', 'text']
}))
app.use(json())
app.use(logger())

// Landing HTML: never cache; bust CSS/JS via file mtime query
app.use(async (ctx, next) => {
    if ((ctx.method === 'GET' || ctx.method === 'HEAD') && (ctx.path === '/' || ctx.path === '/index.html')) {
        let html = await fs.promises.readFile(path.join(publicDir, 'index.html'), 'utf8')
        const cssV = assetVersion('stylesheets/main.css')
        const jsV = assetVersion('javascripts/main.js')
        html = html
            .replace('/stylesheets/main.css"', `/stylesheets/main.css?v=${cssV}"`)
            .replace('/javascripts/main.js"', `/javascripts/main.js?v=${jsV}"`)
        ctx.type = 'html'
        ctx.set('Cache-Control', 'no-cache, must-revalidate')
        ctx.body = html
        return
    }
    await next()
})

// Static assets: long-cache CSS/JS (URL changes when file changes)
app.use(async (ctx, next) => {
    await next()
    if (ctx.status !== 200 && ctx.status !== 304) return
    if (/\.(css|js)$/i.test(ctx.path)) {
        ctx.set('Cache-Control', 'public, max-age=31536000, immutable')
    } else if (/\.(ttf|woff2?|png|jpe?g|gif|webp|svg|ico)$/i.test(ctx.path)) {
        ctx.set('Cache-Control', 'public, max-age=604800')
    }
})

app.use(require('koa-static')(publicDir))

app.use(views(__dirname + '/views', {
    extension: 'ejs'
}))

// logger
app.use(async (ctx, next) => {
    const start = new Date()
    await next()
    const ms = new Date() - start
    console.log(`${ctx.method} ${ctx.url} - ${ms}ms`)
})

// routes
app.use(image.routes(), image.allowedMethods())

// error-handling
app.on('error', (err, ctx) => {
    console.error('server error', err, ctx)
});

module.exports = app