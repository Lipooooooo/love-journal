# 拾光小屋 · Love Pixel Journal

一个原创的「柔和莫兰迪色 + 像素生活模拟」恋爱记录网站。

## 技术栈

- React + Vite
- Supabase Auth / Postgres / Storage
- Lucide React
- CSS 像素 UI，无需商业字体

## 本地运行

1. 安装 Node.js 20+
2. `npm install`
3. 复制 `.env.example` 为 `.env.local`
4. 填入 Supabase Project URL 和 Publishable Key
5. 在 Supabase SQL Editor 执行 `supabase/schema.sql`
6. 创建 Storage bucket：`love-media`，并执行 schema.sql 里的 Storage policies
7. `npm run dev`

## 数据设计

- `entries`：动态、留言、事件、约会邀请
- `photos`：相册图片
- `trash`：软删除回收站
- `site_settings`：颜色、背景、站点名称等自定义配置

所有“删除”都是软删除：记录会进入 `trash`，可以恢复或永久删除。

## 开放上传

应用使用 Supabase Anonymous Auth。访客第一次打开网站会自动创建匿名身份，因此不需要注册即可发布。

如果希望把网站限制为指定的人，可以关闭 Anonymous Sign-ins，再改为邮箱/OAuth 登录。

## 安全

不要把 Supabase service_role key 放进前端。前端只使用 publishable/anon key，并依靠 RLS 控制权限。"# love-journal" 
