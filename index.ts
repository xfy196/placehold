import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import sharp, { type AvailableFormatInfo, type FormatEnum } from "sharp";
import mime from "mime";
const app = new Hono();
interface ImageInfo {
  width?: number;
  height?: number;
  textColor?: string;
  bgColor?: string;
  ext?: string;
  type?: keyof FormatEnum | AvailableFormatInfo;
  is404?: boolean;
}
app.get("/:param", async (c: Context) => {
  const { param } = c.req.param();
  let match = null;
  // 判断 param是否为数字
  match = param.match(/^(\d+)\.(\w+)?$/);
  if (match) {
    const [, width, ext = "png"] = match;
    return await sendImageBuffer(
      {
        width: Number(width),
        height: Number(width),
        ext,
      },
      c
    );
  }
  // // 不是数字判断分割符号是否存在
  match = param.match(/^(\d+)x(\d+)(\.\w+)?$/);
  if (match) {
    const [, width, height, ext = "png"] = match;
    return await sendImageBuffer(
      {
        width: Number(width),
        height: Number(height),
        ext,
      },
      c
    );
  }
  return await sendImageBuffer(
    {
      is404: true,
    },
    c
  );
});

app.get("/:size/:ext", async (c: Context) => {
  const { size, ext = 'png' } = c.req.param();
  let match = null;
  // 判断 size
  match = size.match(/^(\d+)$/);
  if (match) {
    const [, width] = match;
    return await sendImageBuffer(
      {
        width: Number(width),
        height: Number(width),
        ext,
      },
      c
    );
  }
   // // 不是数字判断分割符号是否存在
   match = size.match(/^(\d+)x(\d+)(\.\w+)?$/);
   if (match) {
     const [, width, height] = match;
     return await sendImageBuffer(
       {
         width: Number(width),
         height: Number(height),
         ext,
       },
       c
     );
   }
});

const port = 3000;
console.log(`Server is running on port ${port}`);

async function generatePlaceholdImg({
  width = 600,
  height = 400,
  textColor = "#999999",
  bgColor = "#dddddd",
  type = "png",
  is404 = false,
}: ImageInfo): Promise<Buffer> {
  const image = sharp({
    create: {
      width: width,
      height: height,
      channels: 3,
      background: bgColor,
    },
  });
  // 使用SVG叠加文字
  const fontSize = Math.min(width, height) / 6;
  const svgText = `
    <svg width="${width}" height="${height}">
      <text x="50%" y="50%" dy=".3em" text-anchor="middle" font-size="${fontSize}" font-family="Arial" fill="${
    is404 ? "#32343b" : textColor
  }">
         ${is404 ? "4 0 4" : width + " x " + height}
      </text>
    </svg>
  `;
  const buffer = await image
    .composite([{ input: Buffer.from(svgText), gravity: "center" }])
    .toFormat(type)
    .toBuffer();
  return buffer;
}
async function sendImageBuffer(
  {
    width = 600,
    height = 400,
    textColor = "#999999",
    bgColor = "#dddddd",
    ext = "png",
    is404 = false,
  }: ImageInfo,
  c: Context
): Promise<Response> {
  let newWidth = Number(width) > 4000 ? 4000 : Number(width);
  let newHeight = Number(height) > 4000 ? 4000 : Number(height);
  const mimeType = mime.getType(ext);
  console.log("🚀 ~ mimeType:", mimeType);
  const buffer = await generatePlaceholdImg({
    width: newWidth,
    height: newHeight,
    textColor,
    bgColor,
    type: !mimeType
      ? "png"
      : (ext.replace(".", "") as keyof FormatEnum | AvailableFormatInfo),
    is404: is404 || !mimeType,
  });
  c.header("Content-Type", mimeType || "image/png");
  return c.body(buffer);
}

serve({
  fetch: app.fetch,
  port,
});
