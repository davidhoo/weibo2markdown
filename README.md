# weibo2markdown

Chrome 扩展，在微博 (weibo.com) 页面上右键复制帖子为结构化 Markdown 格式。

灵感来源于 [x2markdown](https://github.com/RuochenLyu/x2markdown)，本项目为个人使用而构建，欢迎 fork，但不保证接受 PR。

## 解决什么问题

- 微博帖子无法直接复制为干净的纯文本，复制出来的内容混杂 HTML 结构和多余符号
- 想把微博内容存档到笔记软件（Obsidian、Notion 等）时，需要手动整理格式
- 转发帖的原文、图片链接、作者信息等分散在 DOM 各处，手工提取费时费力

## 功能范围

- **右键菜单**：在微博帖子上右键，选择「复制为 Markdown」
- **支持的内容**：
  - 作者（昵称 + UID）
  - 发布时间
  - 帖子链接
  - 正文（含表情符号 `[笑cry]`、`#话题#`、`@提及`、超链接）
  - 图片（自动转为大图链接）
  - 转发内容（作者、时间、链接、正文引用、图片）
- **支持的页面**：
  - 帖子详情页 `weibo.com/{uid}/{mid}`
  - 帖子详情页（新版） `weibo.com/detail/{mid}`
  - 用户主页时间线 `weibo.com/{uid}`
  - 首页时间线 `weibo.com/`
- **长文本自动展开**：检测到「展开」按钮时自动点击，获取完整正文
- **零宽字符清理**：自动移除微博 DOM 中的零宽空格等不可见字符

## 非目标

- 不支持微博移动端页面 (m.weibo.com)
- 不支持批量导出
- 不支持评论区内容提取
- 不支持视频内容提取
- 不调用微博 API，纯 DOM 提取

## 安装方式

1. 下载或 `git clone` 本仓库
2. 打开 Chrome，进入 `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」，选择本项目根目录

## 使用方式

1. 在 `weibo.com` 上浏览微博
2. 在想要复制的帖子上**右键**
3. 选择「**复制为 Markdown**」
4. 粘贴到任意编辑器中

## 输出格式

### 普通帖子

```
作者: 人民日报 (@2803301701)
时间: 2026-03-23 16:20
链接: https://weibo.com/2803301701/QxquguJar

正文:
帖子正文内容...

图片:
- [图片 1](https://wx3.sinaimg.cn/large/xxx.jpg)
```

### 转发帖子

```
作者: 用户A (@1234567890)
时间: 2026-03-23 16:20
链接: https://weibo.com/1234567890/QxquiyO1H

正文:
转发评论内容...

转发内容:
作者: @原作者
时间: 2026-03-23 15:47
链接: https://weibo.com/6329528375/QxqgVD16d
正文:
> 原帖正文内容...
```

## 实现思路

- **Manifest V3** — 纯原生 JavaScript，无构建工具，无第三方依赖
- **Service Worker** (`background.js`) — 管理右键菜单生命周期，根据内容脚本反馈动态控制菜单可见性
- **内容脚本** (`content.js`) — DOM 提取 + Markdown 格式化 + 剪贴板写入
- **CSS Modules 选择器** — 微博使用 Vue + CSS Modules，class 名带 hash 后缀，采用 `[class*="prefix"]` 前缀匹配策略
- **剪贴板降级** — 优先使用 `navigator.clipboard.writeText()`，失败时降级为 `textarea` + `execCommand("copy")`
- **内容脚本注入容错** — 如果内容脚本未加载（如扩展更新后），Service Worker 会自动注入后重试

## 目录结构

```
weibo2markdown/
├── manifest.json          # 扩展清单 (Manifest V3)
├── background.js          # Service Worker：右键菜单 + 消息分发
├── content.js             # 内容脚本：DOM 提取 + Markdown 格式化
├── content.css            # Toast 提示样式
├── _locales/
│   ├── zh_CN/messages.json  # 中文（默认）
│   └── en/messages.json     # 英文
├── icons/
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
└── docs/
    └── design.md          # 设计文档
```

## 已知限制

- 微博 DOM 结构更新可能导致选择器失效，需手动更新 `content.js` 中的 `SELECTORS` 常量
- 长文本展开依赖模拟点击 + 500ms 等待，网络慢时可能获取不到完整内容
- 仅支持 PC 版微博 (weibo.com)
- 图片链接转换为大图基于 URL 路径替换（`/orjNNN/` → `/large/`），微博更改 CDN 规则时可能失效

## 文档索引

- [设计文档](docs/design.md) — 架构、选择器策略、维护说明

## 开源说明

本项目以 MIT 协议开源，定位为个人工具与学习项目。

## License

[MIT](LICENSE)
