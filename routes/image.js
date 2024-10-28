const router = require('koa-router')()
const path = require("path")
const sharp = require("sharp")
const TextToSVG = require('text-to-svg')
const {isValidHexColor} = require("../utils/color.js")
const mime = require("mime-types");
router.get('/:param', async (ctx, next) => {
  const { param } = ctx.params;
  const { text = "" } = ctx.query;
  let match = null;
  // 判断 param是否为数字
  match = param.match(/^(\d+)(\.\w+)?$/);
  if (match) {
      const [, width, ext = "png"] = match;
      return await sendImageBuffer({
          width: Number(width),
          height: Number(width),
          ext,
          text,
      }, ctx);
  }
  // // 不是数字判断分割符号是否存在
  match = param.match(/^(\d+)x(\d+)(\.\w+)?$/);
  if (match) {
      const [, width, height, ext = "png"] = match;
      return await sendImageBuffer({
          width: Number(width),
          height: Number(height),
          ext,
          text,
      }, ctx);
  }
  return await sendImageBuffer({
      is404: true,
  }, ctx);
})

router.get('//:size/:ext', async (ctx, next) => {
  const { size, ext = "png" } = ctx.params;
    const { text = "" } = ctx.query;
    let match = null;
    // 判断 size
    match = size.match(/^(\d+)$/);
    if (match) {
        const [, width] = match;
        return await sendImageBuffer({
            width: Number(width),
            height: Number(width),
            ext,
            text,
        }, ctx);
    }
    // // 不是数字判断分割符号是否存在
    match = size.match(/^(\d+)x(\d+)(\.\w+)?$/);
    if (match) {
        const [, width, height] = match;
        return await sendImageBuffer({
            width: Number(width),
            height: Number(height),
            ext,
            text,
        }, ctx);
    }
});
router.get("/:size/:bgColor/:textColor", async (ctx) => {
    const { size, textColor, bgColor } = ctx.params;
    const { text = "" } = ctx.query;
    let match = null;
    match = size.match(/^(\d+)$/);
    if (match) {
        const [, width, ext = "png"] = match;
        return await sendImageBuffer({
            width: Number(width),
            height: Number(width),
            textColor: isValidHexColor(textColor) ? "#" + textColor : textColor,
            bgColor: isValidHexColor(bgColor) ? "#" + bgColor : bgColor,
            ext,
            text,
        }, ctx);
    }
    // 不是数字判断分割符号是否存在
    match = size.match(/^(\d+)x(\d+)$/);
    if (match) {
        const [, width, height] = match;
        const match2 = textColor.match(/^(.*?)(\.\w+)?$/);
        if (match2) {
            const [, tColor, ext = "png"] = match2;
            return await sendImageBuffer({
                width: Number(width),
                height: Number(height),
                textColor: isValidHexColor(tColor) ? "#" + tColor : tColor,
                bgColor: isValidHexColor(bgColor) ? "#" + bgColor : bgColor,
                ext: ext.replace(".", ""),
                text,
            }, ctx);
        }
    }
    return await sendImageBuffer({}, ctx);
})

async function generatePlaceholdImg({ width = 600, height = 400, textColor = "#999999", bgColor = "#dddddd", type = "png", is404 = false, text, }) {
  const image = sharp({
      create: {
          width: width,
          height: height,
          channels: 3,
          background: bgColor,
      },
  });
  // 使用SVG叠加文字
  let fontSize = Math.min(width, height) / 6;
  const textToSVG = TextToSVG.loadSync(path.join(__dirname, "../public/fonts/小米MiSans-Medium.ttf"));
  const newText = is404 ? "4 0 4" : text ? text : width + " x " + height;
  const options = {
      fontSize,
      x: 0,
      y: 0,
      anchor: "top",
      attributes: {
          fill: is404 ? "#32343b" : textColor,
      },
  };
  let lines = newText.split("\\n");
  let lineHeight; // 行高设置
  let totalHeight;
  // 自动调整字体大小以适应图像宽度
  while (true) {
      lineHeight = fontSize * 1.1; // 根据当前 fontSize 设置行高
      totalHeight = lines.length * lineHeight; // 计算总高度
      // 检查每行宽度是否超出
      const exceedsWidth = lines.some((line) => textToSVG.getMetrics(line, { fontSize }).width > width * 0.8);
      if (exceedsWidth) {
          fontSize *= 0.9; // 减小字体
      }
      else {
          break; // 如果没有超出宽度，则退出循环
      }
  }
  const svgPaths = lines
      .map((line, index) => {
      const metrics = textToSVG.getMetrics(line, { fontSize });
      const x = (width - metrics.width) / 2; // 水平居中
      const y = height / 2 - totalHeight / 2 + index * lineHeight + fontSize; // 垂直居中
      const pathData = textToSVG.getD(line, {
          x,
          y,
          fontSize,
          attributes: options.attributes,
      });
      return `<path d="${pathData}" fill="${options?.attributes?.fill}" />`;
  })
      .join("");
  const svgText = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${svgPaths}
    </svg>
  `;
  const buffer = await image
      .composite([{ input: Buffer.from(svgText), gravity: "center" }])
      .toFormat(type)
      .toBuffer();
  return buffer;
}
async function sendImageBuffer({ width = 600, height = 400, textColor = "#999999", bgColor = "#dddddd", ext = "png", is404 = false, text, }, ctx) {
  let newWidth = Math.max(Math.min(Number(width), 4000), 10);
  let newHeight = Math.max(Math.min(Number(height), 4000), 10);
  const mimeType = mime.lookup(ext);
  const buffer = await generatePlaceholdImg({
      width: newWidth,
      height: newHeight,
      textColor,
      bgColor,
      type: !mimeType
          ? "png"
          : ext.replace(".", ""),
      is404: is404 || !mimeType,
      text,
  });
  ctx.set("Content-Type", mimeType || "image/png");
  return ctx.body = buffer;
}

module.exports = router