const router = require('koa-router')()
router.get("/", (ctx) => {
  ctx.body = "Hello World"
})
module.exports = router