import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import sharp, { type AvailableFormatInfo, type FormatEnum } from "sharp";
import mime from "mime"
const app = new Hono().basePath("/api");

app.get("/:param", async (c: Context) => {
  const { param } = c.req.param();
  let match = null;
  // 判断 param是否为数字
  match = param.match(/^(\d+)(\.png)?$/);
  if (match) {
    const [, width, ext = ".png"] = match;
    let newWidth = Number(width) > 4000 ? 4000 : Number(width);
    const buffer = await generatePlaceholdImg({
      width: newWidth,
      height: newWidth,
      type: ext.replace(".", "") as keyof FormatEnum | AvailableFormatInfo,
    })
    const mimeType = mime.getType(ext)
    if(!mimeType){
      return 
    }
    c.header("Content-Type", mimeType)
    return c.body(buffer)
  }
  // // 不是数字判断分割符号是否存在
  match = param.match(/^(\d+)x(\d+)(?:\.png)$/);
  if (match) {
    const [, width, height, ext] = match;
    return c.text(`${width}px x ${height}px`);
  }
  return c.text("Hello Hono!");
});

const port = 3000;
console.log(`Server is running on port ${port}`);

async function generatePlaceholdImg({
  width,
  height,
  textColor = "#999999",
  bgColor = "#dddddd",
  type = "png",
}: {
  width: number;
  height: number;
  textColor?: string;
  bgColor?: string;
  type?: keyof FormatEnum | AvailableFormatInfo;
}): Promise<Buffer> {
  const image = sharp({
    create: {
      width: width,
      height: height,
      channels: 3,
      background: bgColor
    }
  })
  // 使用SVG叠加文字
  const fontSize = Math.min(width, height) / 6
  const svgText = `
    <svg width="${width}" height="${height}">
      <text x="50%" y="50%" dy=".3em" text-anchor="middle" font-size="${fontSize}" font-family="Arial" fill="${textColor}">
        ${width}x${height}
      </text>
    </svg>
  `
  const buffer = await image
  .composite([{ input: Buffer.from(svgText), gravity: 'center' }])
  .toFormat(type)
  .toBuffer()
  return buffer;
}

serve({
  fetch: app.fetch,
  port,
});
