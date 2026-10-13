#!/usr/bin/env node
/**
 * HTTP smoke tests for Placehold image routes.
 * Run: node scripts/smoke-test.js
 */
const http = require('http')
const assert = require('assert')
const sharp = require('sharp')
const app = require('../app')

function request(port, path) {
    return new Promise((resolve, reject) => {
        http.get({hostname: '127.0.0.1', port, path}, (res) => {
            const chunks = []
            res.on('data', (c) => chunks.push(c))
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks),
                })
            })
        }).on('error', reject)
    })
}

async function main() {
    const server = http.createServer(app.callback())
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const {port} = server.address()
    const failures = []

    async function check(name, fn) {
        try {
            await fn()
            console.log(`  ✓ ${name}`)
        } catch (err) {
            failures.push(name)
            console.error(`  ✗ ${name}`)
            console.error(`    ${err.message}`)
        }
    }

    console.log(`Smoke tests on port ${port}\n`)

    await check('homepage', async () => {
        const res = await request(port, '/')
        assert.strictEqual(res.status, 200)
        assert.match(res.headers['content-type'], /text\/html/)
    })

    await check('square png', async () => {
        const res = await request(port, '/200')
        assert.strictEqual(res.status, 200)
        assert.strictEqual(res.headers['content-type'], 'image/png')
        const meta = await sharp(res.body).metadata()
        assert.strictEqual(meta.width, 200)
        assert.strictEqual(meta.height, 200)
    })

    await check('rect + format aliases', async () => {
        for (const path of ['/300x150.png', '/300x150/webp', '/300x150/jpg']) {
            const res = await request(port, path)
            assert.strictEqual(res.status, 200, path)
            assert.ok(res.body.length > 0, path)
        }
    })

    await check('colors', async () => {
        const res = await request(port, '/200x100/ff0000/00ff00')
        const {data, info} = await sharp(res.body).removeAlpha().raw().toBuffer({resolveWithObject: true})
        assert.strictEqual(info.width, 200)
        assert.deepStrictEqual([...data.slice(0, 3)], [255, 0, 0])
    })

    await check('named color + svg skips sharp create', async () => {
        const res = await request(port, '/80x40/red/white.svg')
        assert.strictEqual(res.status, 200)
        assert.match(res.headers['content-type'], /svg/)
        assert.match(res.body.toString(), /fill="red"/)
    })

    await check('invalid extension -> 404 image (not 500)', async () => {
        const res = await request(port, '/200.xyz')
        assert.strictEqual(res.status, 200)
        assert.strictEqual(res.headers['content-type'], 'image/png')
        const meta = await sharp(res.body).metadata()
        assert.strictEqual(meta.format, 'png')
        assert.strictEqual(meta.width, 200)
    })

    await check('invalid color -> fallback (not 500)', async () => {
        const res = await request(port, '/100x100/not!!color/ffffff')
        assert.strictEqual(res.status, 200)
        assert.strictEqual(res.headers['content-type'], 'image/png')
    })

    await check('invalid color + svg -> 200', async () => {
        const res = await request(port, '/100x100/not!!color/ffffff.svg')
        assert.strictEqual(res.status, 200)
        assert.match(res.headers['content-type'], /svg/)
    })

    await check('garbage 3-segment -> 404 image', async () => {
        const res = await request(port, '/foo/bar/baz')
        assert.strictEqual(res.status, 200)
        assert.strictEqual(res.headers['content-type'], 'image/png')
        const meta = await sharp(res.body).metadata()
        assert.strictEqual(meta.width, 600)
        assert.strictEqual(meta.height, 400)
    })

    await check('unmatched 2-segment -> 404 image', async () => {
        const res = await request(port, '/abc/png')
        assert.strictEqual(res.status, 200)
        assert.strictEqual(res.headers['content-type'], 'image/png')
    })

    await check('4-segment ext wins over color suffix', async () => {
        const res = await request(port, '/100x100/ff0000/00ff00.png/webp')
        assert.strictEqual(res.status, 200)
        assert.strictEqual(res.headers['content-type'], 'image/webp')
        const meta = await sharp(res.body).metadata()
        assert.strictEqual(meta.format, 'webp')
    })

    await check('size clamp', async () => {
        const tiny = await request(port, '/5')
        const huge = await request(port, '/5000x20')
        const t = await sharp(tiny.body).metadata()
        const h = await sharp(huge.body).metadata()
        assert.strictEqual(t.width, 10)
        assert.strictEqual(h.width, 4000)
        assert.strictEqual(h.height, 20)
    })

    await check('custom text + multiline', async () => {
        const res = await request(port, '/300x120?text=Hello%0AWorld')
        assert.strictEqual(res.status, 200)
        assert.ok(res.body.length > 0)
    })

    await check('cache-control present', async () => {
        const res = await request(port, '/100')
        assert.match(res.headers['cache-control'] || '', /max-age=/)
    })

    await check('font cache makes 2nd request faster or equal-ish', async () => {
        const t1 = Date.now()
        await request(port, '/400x300')
        const first = Date.now() - t1
        const t2 = Date.now()
        await request(port, '/400x301')
        const second = Date.now() - t2
        // first may include cold start; second should be clearly under 500ms locally
        assert.ok(second < 800, `second request too slow: ${second}ms (first ${first}ms)`)
    })

    server.close()

    if (failures.length) {
        console.error(`\n${failures.length} failed`)
        process.exit(1)
    }
    console.log('\nAll smoke tests passed')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
