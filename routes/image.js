const router = require('koa-router')()
const path = require('path')
const sharp = require('sharp')
const TextToSVG = require('text-to-svg')
const {normalizeColor, escapeSvgAttr} = require('../utils/color.js')

const MIN_SIZE = 10
const MAX_SIZE = 4000
const DEFAULT_WIDTH = 600
const DEFAULT_HEIGHT = 400
const DEFAULT_BG = '#dddddd'
const DEFAULT_FG = '#999999'
const FONT_PATH = path.join(__dirname, '../public/fonts/小米MiSans-Medium.ttf')

const FORMAT_MIME = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
}
const ALLOWED_FORMATS = new Set(Object.keys(FORMAT_MIME))

let cachedTextToSVG = null

function getTextToSVG() {
    if (!cachedTextToSVG) {
        cachedTextToSVG = TextToSVG.loadSync(FONT_PATH)
    }
    return cachedTextToSVG
}

function clampSize(n) {
    const num = Number(n)
    if (!Number.isFinite(num)) return MIN_SIZE
    return Math.max(Math.min(Math.trunc(num), MAX_SIZE), MIN_SIZE)
}

function parseSize(size) {
    if (!size) return null
    let match = String(size).match(/^(\d+)$/)
    if (match) {
        const side = Number(match[1])
        return {width: side, height: side}
    }
    match = String(size).match(/^(\d+)x(\d+)$/i)
    if (match) {
        return {width: Number(match[1]), height: Number(match[2])}
    }
    return null
}

function normalizeExt(ext) {
    if (ext == null || ext === '') return 'png'
    const cleaned = String(ext).replace(/^\./, '').toLowerCase()
    return ALLOWED_FORMATS.has(cleaned) ? cleaned : null
}

function resolveFormat(ext, {force404 = false} = {}) {
    const normalized = normalizeExt(ext)
    if (!normalized || force404) {
        return {type: 'png', mimeType: 'image/png', is404: true}
    }
    // sharp uses "jpeg"; "jpg" is accepted as alias but normalize to jpeg
    const type = normalized === 'jpg' ? 'jpeg' : normalized
    return {type, mimeType: FORMAT_MIME[normalized], is404: false}
}

function splitColorAndExt(token) {
    const raw = String(token || '')
    const match = raw.match(/^(.*?)(\.\w+)?$/)
    if (!match) return {colorToken: raw, ext: null}
    const [, colorToken, extWithDot] = match
    const ext = extWithDot ? normalizeExt(extWithDot) : null
    // only treat suffix as format when it is in the whitelist
    if (extWithDot && !ext) {
        return {colorToken: raw, ext: null}
    }
    return {colorToken, ext}
}

function normalizeText(text) {
    if (text == null || text === '') return ''
    // querystring already turns "+" into space; keep "%2B" as literal "+"
    return String(text).replace(/\r\n/g, '\n').replace(/\\n/g, '\n')
}

async function generatePlaceholdImg({
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    textColor = DEFAULT_FG,
    bgColor = DEFAULT_BG,
    type = 'png',
    is404 = false,
    text,
}) {
    const safeBg = normalizeColor(bgColor, DEFAULT_BG)
    const safeFg = normalizeColor(textColor, DEFAULT_FG)
    const textToSVG = getTextToSVG()

    let fontSize = Math.min(width, height) / 6
    const newText = is404
        ? '4 0 4'
        : text
            ? normalizeText(text)
            : `${width} x ${height}`
    const fill = is404 ? '#32343b' : safeFg
    const lines = newText.split('\n')

    let lineHeight = fontSize * 1.1
    let totalHeight = lines.length * lineHeight
    let guard = 0
    while (guard < 60) {
        guard += 1
        lineHeight = fontSize * 1.1
        totalHeight = lines.length * lineHeight
        const exceedsWidth = lines.some(
            (line) => textToSVG.getMetrics(line, {fontSize}).width > width * 0.8
        )
        const exceedsHeight = totalHeight > height * 0.9
        if ((exceedsWidth || exceedsHeight) && fontSize > 6) {
            fontSize *= 0.9
            continue
        }
        break
    }

    const svgPaths = lines
        .map((line, index) => {
            const metrics = textToSVG.getMetrics(line, {fontSize})
            const x = (width - metrics.width) / 2
            const y = height / 2 - totalHeight / 2 + index * lineHeight + fontSize
            const pathData = textToSVG.getD(line, {x, y, fontSize})
            return `<path d="${pathData}" fill="${escapeSvgAttr(fill)}" />`
        })
        .join('')

    const svgText = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${escapeSvgAttr(safeBg)}" />
      ${svgPaths}
    </svg>
  `

    if (type === 'svg') {
        return svgText
    }

    return sharp({
        create: {
            width,
            height,
            channels: 3,
            background: safeBg,
        },
    })
        .composite([{input: Buffer.from(svgText), gravity: 'center'}])
        .toFormat(type)
        .toBuffer()
}

async function sendImageBuffer({
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    textColor = DEFAULT_FG,
    bgColor = DEFAULT_BG,
    ext = 'png',
    is404 = false,
    text,
}, ctx) {
    const newWidth = clampSize(width)
    const newHeight = clampSize(height)
    const {type, mimeType, is404: format404} = resolveFormat(ext, {force404: is404})
    const buffer = await generatePlaceholdImg({
        width: newWidth,
        height: newHeight,
        textColor,
        bgColor,
        type,
        is404: is404 || format404,
        text,
    })
    ctx.set('Content-Type', mimeType)
    ctx.set('Cache-Control', 'public, max-age=86400')
    ctx.status = 200
    ctx.body = buffer
}

async function send404Image(ctx, overrides = {}) {
    return sendImageBuffer({
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        is404: true,
        ...overrides,
    }, ctx)
}

// /600 | /600.png | /600x400 | /600x400.webp
router.get('/:param', async (ctx) => {
    const {param} = ctx.params
    const {text = ''} = ctx.query

    let match = param.match(/^(\d+)(\.\w+)?$/i)
    if (match) {
        const [, width, extWithDot] = match
        const ext = extWithDot ? normalizeExt(extWithDot) : 'png'
        return sendImageBuffer({
            width: Number(width),
            height: Number(width),
            ext: ext || extWithDot,
            is404: !ext && !!extWithDot,
            text,
        }, ctx)
    }

    match = param.match(/^(\d+)x(\d+)(\.\w+)?$/i)
    if (match) {
        const [, width, height, extWithDot] = match
        const ext = extWithDot ? normalizeExt(extWithDot) : 'png'
        return sendImageBuffer({
            width: Number(width),
            height: Number(height),
            ext: ext || extWithDot,
            is404: !ext && !!extWithDot,
            text,
        }, ctx)
    }

    return send404Image(ctx)
})

// /600/png | /600x400/webp
router.get('/:size/:ext', async (ctx) => {
    const {size, ext} = ctx.params
    const {text = ''} = ctx.query
    const parsed = parseSize(size)
    if (!parsed) {
        return send404Image(ctx)
    }
    const normalized = normalizeExt(ext)
    return sendImageBuffer({
        ...parsed,
        ext: normalized || ext,
        is404: !normalized,
        text,
    }, ctx)
})

// /600x400/dfdfdf/000000 | /600x400/dfdfdf/000000.png
router.get('/:size/:bgColor/:textColor', async (ctx) => {
    const {size, bgColor, textColor} = ctx.params
    const {text = ''} = ctx.query
    const parsed = parseSize(size)
    if (!parsed) {
        return send404Image(ctx)
    }
    const {colorToken, ext} = splitColorAndExt(textColor)
    return sendImageBuffer({
        ...parsed,
        bgColor: normalizeColor(bgColor, DEFAULT_BG),
        textColor: normalizeColor(colorToken, DEFAULT_FG),
        ext: ext || 'png',
        is404: textColor.includes('.') && !ext,
        text,
    }, ctx)
})

// /600x400/000000/ffffff/png
router.get('/:size/:bgColor/:textColor/:ext', async (ctx) => {
    const {size, bgColor, textColor, ext} = ctx.params
    const {text = ''} = ctx.query
    const parsed = parseSize(size)
    if (!parsed) {
        return send404Image(ctx)
    }
    // path :ext wins; ignore accidental suffixes on the color token
    const {colorToken} = splitColorAndExt(textColor)
    const normalized = normalizeExt(ext)
    return sendImageBuffer({
        ...parsed,
        bgColor: normalizeColor(bgColor, DEFAULT_BG),
        textColor: normalizeColor(colorToken, DEFAULT_FG),
        ext: normalized || ext,
        is404: !normalized,
        text,
    }, ctx)
})

module.exports = router
module.exports.generatePlaceholdImg = generatePlaceholdImg
module.exports.sendImageBuffer = sendImageBuffer
