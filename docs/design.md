# weibo2markdown 设计文档

## 概述

weibo2markdown 是一个 Chrome 扩展，允许用户在微博 (weibo.com) 页面上右键点击帖子，将其内容复制为结构化 Markdown 格式。

## 架构

参考 [x2markdown](https://github.com/RuochenLyu/x2markdown) 的架构设计：

- **Manifest V3** — 纯原生 JS，无构建工具，无依赖
- **background.js** — Service Worker，负责右键菜单创建和消息分发
- **content.js** — 内容脚本，负责 DOM 提取、Markdown 格式化和剪贴板操作
- **content.css** — Toast 提示样式

## 支持的页面

| URL 模式 | 说明 |
|----------|------|
| `https://weibo.com/{uid}/{mid}` | 帖子详情页 |
| `https://weibo.com/detail/{mid}` | 帖子详情页（新版） |
| `https://weibo.com/{uid}` | 用户主页时间线 |
| `https://weibo.com/` | 首页时间线 |

## Markdown 输出格式

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

## DOM 选择器策略

微博 PC 版基于 Vue + CSS Modules，class 名带 hash 后缀，使用 `[class*="prefix"]` 前缀匹配。

详细选择器见 `content.js` 中的 `SELECTORS` 常量。

## 维护说明

如果微博更新 DOM 结构导致选择器失效，需要：

1. 在浏览器 DevTools 中检查实际的 class 名
2. 更新 `content.js` 中的 `SELECTORS` 常量
3. 重新加载扩展测试
