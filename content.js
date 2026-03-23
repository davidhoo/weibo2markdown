(() => {
  "use strict";

  if (window.__weibo2markdownInjected) {
    return;
  }

  window.__weibo2markdownInjected = true;

  const STATE = {
    toastTimer: null,
    contextMenuTargetNode: null,
    contextMenuPost: null,
    menuVisible: null
  };

  const COPY_MESSAGE_TYPE = "COPY_MARKDOWN_FROM_PAGE";
  const MENU_VISIBILITY_MESSAGE_TYPE = "SET_CONTEXT_MENU_VISIBILITY";

  // URL patterns for detail pages
  const DETAIL_PATTERNS = {
    userPost: /^\/[^/]+\/[A-Za-z0-9]+$/, // /{uid}/{mid}
    detail: /^\/detail\/[A-Za-z0-9]+$/ // /detail/{mid}
  };

  // DOM selectors — Weibo uses Vue + CSS Modules with hash suffixes
  const SELECTORS = {
    // Post container
    article: "article.woo-panel-main",
    postBody: 'div[class*="_body_m3n8j"]',
    // Author
    authorName: 'a[class*="_name_ygi5b"] > span[title]',
    authorLink: 'header a[href*="/u/"]',
    userCard: "a[usercard]",
    // Time
    time: 'a[class*="_time_1tpft"]',
    // Body text
    originalText: '.wbpro-feed-ogText div[class*="_wbtext_1psp9"]',
    // Images
    image: ".picture img.woo-picture-img",
    // Repost
    repostContainer: 'div.retweet, div[class*="_retweet_m3n8j"]',
    repostAuthor: 'span[class*="_nick_1psp9"]',
    repostText: '.wbpro-feed-reText div[class*="_wbtext_1psp9"]',
    repostTime: 'a[class*="_time_1t79r"]',
    // Expand button
    expandText: '[class*="_expandText"]'
  };

  // ─── Event listeners ───

  document.addEventListener("contextmenu", handleContextMenuEvent, true);

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || message.type !== COPY_MESSAGE_TYPE) {
        return undefined;
      }

      void handleCopyRequest()
        .then(() => {
          sendResponse({ ok: true });
        })
        .catch((error) => {
          const errorMessage = error instanceof Error ? error.message : t("errorCopyFailedGeneric", undefined, "复制失败");
          console.error("[weibo2markdown] 复制失败", error);
          showToast(errorMessage);
          sendResponse({
            ok: false,
            error: errorMessage
          });
        });

      return true;
    });
  }

  // ─── Core copy flow ───

  async function handleCopyRequest() {
    const article = await resolveTargetArticle();
    if (!article) {
      throw new Error(t("errorPostNotFound", undefined, "未找到微博帖子"));
    }

    // Try to expand truncated text
    await tryExpandText(article);

    const payload = extractPostPayload(article);
    const markdown = buildMarkdown(payload);

    await copyToClipboard(markdown);
    showToast(t("toastCopiedAsMarkdown", undefined, "已复制为 Markdown"));
  }

  // ─── Article resolution ───

  async function resolveTargetArticle() {
    const pageType = getDetailPageType(location.pathname);

    if (pageType) {
      // On a detail page — find the main article
      return findDetailPageArticle();
    }

    // On timeline — use the article saved from contextmenu event
    return STATE.contextMenuPost;
  }

  function getDetailPageType(pathname) {
    if (DETAIL_PATTERNS.userPost.test(pathname)) {
      return "userPost";
    }
    if (DETAIL_PATTERNS.detail.test(pathname)) {
      return "detail";
    }
    return null;
  }

  function findDetailPageArticle() {
    // On detail pages, find the main article in the primary content area
    const main = document.querySelector("main") || document.querySelector('[class*="_main_"]');
    const scope = main || document;

    const articles = scope.querySelectorAll(SELECTORS.article);
    if (articles.length > 0) {
      return articles[0];
    }

    // Fallback: look for post body directly
    const body = scope.querySelector(SELECTORS.postBody);
    if (body) {
      return body.closest(SELECTORS.article) || body.parentElement;
    }

    return null;
  }

  function handleContextMenuEvent(event) {
    const pageType = getDetailPageType(location.pathname);
    if (pageType) {
      // On a detail page, always show the menu
      STATE.contextMenuPost = null;
      void syncContextMenuVisibility(true);
      return;
    }

    // On timeline, find the closest article container
    const target = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null;
    if (!target) {
      clearContextMenuTarget();
      void syncContextMenuVisibility(false);
      return;
    }

    const article = target.closest(SELECTORS.article);
    if (article instanceof HTMLElement) {
      STATE.contextMenuTargetNode = target;
      STATE.contextMenuPost = article;
      void syncContextMenuVisibility(true);
      return;
    }

    // Also try matching by post body
    const postBody = target.closest(SELECTORS.postBody);
    if (postBody) {
      const parentArticle = postBody.closest(SELECTORS.article);
      if (parentArticle instanceof HTMLElement) {
        STATE.contextMenuTargetNode = target;
        STATE.contextMenuPost = parentArticle;
        void syncContextMenuVisibility(true);
        return;
      }
    }

    clearContextMenuTarget();
    void syncContextMenuVisibility(false);
  }

  function clearContextMenuTarget() {
    STATE.contextMenuTargetNode = null;
    STATE.contextMenuPost = null;
  }

  // ─── Data extraction ───

  function extractPostPayload(article) {
    const author = extractAuthor(article);
    const time = extractTime(article);
    const url = extractUrl(article, time);
    const body = extractBody(article);
    const images = extractImages(article);
    const repost = extractRepost(article);

    return { author, time, url, body, images, repost };
  }

  function extractAuthor(root) {
    // Try primary selector: named link with title
    const nameSpan = root.querySelector(SELECTORS.authorName);
    const displayName = nameSpan ? nameSpan.getAttribute("title") || nameSpan.textContent.trim() : "";

    // Get author profile link for UID
    const profileLink = root.querySelector(SELECTORS.authorLink);
    let uid = "";
    if (profileLink) {
      const href = profileLink.getAttribute("href") || "";
      const match = href.match(/\/u\/(\d+)/);
      if (match) {
        uid = match[1];
      }
    }

    // Fallback: try usercard attribute
    if (!uid) {
      const userCardEl = root.querySelector(SELECTORS.userCard);
      if (userCardEl) {
        const usercard = userCardEl.getAttribute("usercard") || "";
        const match = usercard.match(/id=(\d+)/);
        if (match) {
          uid = match[1];
        }
      }
    }

    return { displayName, uid };
  }

  function extractTime(root) {
    const timeEl = root.querySelector(SELECTORS.time);
    if (!timeEl) {
      return { text: "", href: "" };
    }

    const text = timeEl.getAttribute("title") || timeEl.textContent.trim();
    const href = timeEl.getAttribute("href") || "";

    return { text, href };
  }

  function extractUrl(root, timeInfo) {
    // Try to build URL from time element's href
    if (timeInfo && timeInfo.href) {
      return toAbsoluteUrl(timeInfo.href);
    }

    // Fallback: look for status links in the article
    const links = root.querySelectorAll("a[href]");
    for (const link of links) {
      const href = link.getAttribute("href") || "";
      if (/\/\d+\/[A-Za-z0-9]+$/.test(href) || /\/detail\/[A-Za-z0-9]+$/.test(href)) {
        return toAbsoluteUrl(href);
      }
    }

    return location.href;
  }

  function extractBody(root) {
    // Find original text container (not inside repost)
    const repostContainer = root.querySelector(SELECTORS.repostContainer);
    const textEl = root.querySelector(SELECTORS.originalText);

    if (textEl) {
      // Make sure this text element is not inside the repost container
      if (!repostContainer || !repostContainer.contains(textEl)) {
        return extractInlineMarkdown(textEl);
      }
    }

    // Fallback: find any wbtext not inside repost
    const allTexts = root.querySelectorAll('div[class*="_wbtext_1psp9"]');
    for (const el of allTexts) {
      if (!repostContainer || !repostContainer.contains(el)) {
        return extractInlineMarkdown(el);
      }
    }

    return "";
  }

  function extractImages(root) {
    const repostContainer = root.querySelector(SELECTORS.repostContainer);
    const imgs = root.querySelectorAll(SELECTORS.image);
    const urls = [];

    for (const img of imgs) {
      // Skip images inside repost
      if (repostContainer && repostContainer.contains(img)) {
        continue;
      }

      const src = img.getAttribute("src") || "";
      if (src) {
        urls.push(toLargeImageUrl(src));
      }
    }

    return urls;
  }

  function extractRepost(root) {
    const repostContainer = root.querySelector(SELECTORS.repostContainer);
    if (!repostContainer) {
      return null;
    }

    // Repost author
    const nickEl = repostContainer.querySelector(SELECTORS.repostAuthor);
    let repostAuthorName = "";
    if (nickEl) {
      repostAuthorName = nickEl.textContent.trim();
      // Remove leading @ if present
      if (repostAuthorName.startsWith("@")) {
        repostAuthorName = repostAuthorName.substring(1);
      }
    }

    // Repost text
    const textEl = repostContainer.querySelector(SELECTORS.repostText);
    const body = textEl ? extractInlineMarkdown(textEl) : "";

    // Repost time
    const timeEl = repostContainer.querySelector(SELECTORS.repostTime);
    let timeText = "";
    let timeHref = "";
    if (timeEl) {
      timeText = timeEl.getAttribute("title") || timeEl.textContent.trim();
      timeHref = timeEl.getAttribute("href") || "";
    }

    const url = timeHref ? toAbsoluteUrl(timeHref) : "";

    // Repost images
    const imgs = repostContainer.querySelectorAll(SELECTORS.image);
    const images = [];
    for (const img of imgs) {
      const src = img.getAttribute("src") || "";
      if (src) {
        images.push(toLargeImageUrl(src));
      }
    }

    return {
      author: repostAuthorName,
      time: timeText,
      url,
      body,
      images
    };
  }

  // ─── Inline Markdown extraction ───

  function extractInlineMarkdown(element) {
    if (!element) return "";

    const parts = [];

    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent || "");
        continue;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }

      const el = node;
      const tagName = el.tagName.toLowerCase();

      if (tagName === "br") {
        parts.push("\n");
        continue;
      }

      if (tagName === "img") {
        // Custom emoji: <img alt="[xxx]"> — use alt text
        const alt = el.getAttribute("alt") || "";
        if (alt) {
          parts.push(alt);
        }
        continue;
      }

      if (tagName === "a") {
        const href = el.getAttribute("href") || "";
        const usercard = el.getAttribute("usercard") || "";
        const text = el.textContent.trim();

        // Topic hashtag: href contains s.weibo.com/weibo?q=
        if (href.includes("s.weibo.com/weibo")) {
          // Keep as #topic# format
          parts.push(text);
          continue;
        }

        // @mention: has usercard attribute
        if (usercard) {
          // Ensure @ prefix
          parts.push(text.startsWith("@") ? text : "@" + text);
          continue;
        }

        // Regular link
        if (href && text) {
          const absoluteHref = toAbsoluteUrl(href);
          parts.push("[" + text + "](" + absoluteHref + ")");
          continue;
        }

        parts.push(text);
        continue;
      }

      // For other elements (span, etc.), recurse
      parts.push(extractInlineMarkdown(el));
    }

    return parts.join("").replace(/[\u200B\u200C\u200D\uFEFF]/g, "");
  }

  // ─── Text expansion ───

  async function tryExpandText(article) {
    const expandBtn = article.querySelector(SELECTORS.expandText);
    if (!expandBtn || !(expandBtn instanceof HTMLElement)) {
      return;
    }

    expandBtn.click();
    await wait(500);
  }

  // ─── Markdown formatting ───

  function buildMarkdown(payload) {
    const lines = [];

    // Author line
    if (payload.author.displayName) {
      let authorLine = "作者: " + payload.author.displayName;
      if (payload.author.uid) {
        authorLine += " (@" + payload.author.uid + ")";
      }
      lines.push(authorLine);
    }

    // Time
    if (payload.time.text) {
      lines.push("时间: " + payload.time.text);
    }

    // URL
    if (payload.url) {
      lines.push("链接: " + payload.url);
    }

    // Body
    if (payload.body) {
      lines.push("");
      lines.push("正文:");
      lines.push(payload.body.trim());
    }

    // Images
    if (payload.images && payload.images.length > 0) {
      lines.push("");
      lines.push("图片:");
      payload.images.forEach((url, i) => {
        lines.push("- [图片 " + (i + 1) + "](" + url + ")");
      });
    }

    // Repost
    if (payload.repost) {
      lines.push("");
      lines.push("转发内容:");

      if (payload.repost.author) {
        lines.push("作者: @" + payload.repost.author);
      }
      if (payload.repost.time) {
        lines.push("时间: " + payload.repost.time);
      }
      if (payload.repost.url) {
        lines.push("链接: " + payload.repost.url);
      }
      if (payload.repost.body) {
        lines.push("正文:");
        // Quote the repost body
        const quotedBody = payload.repost.body
          .trim()
          .split("\n")
          .map((line) => "> " + line)
          .join("\n");
        lines.push(quotedBody);
      }
      if (payload.repost.images && payload.repost.images.length > 0) {
        lines.push("图片:");
        payload.repost.images.forEach((url, i) => {
          lines.push("- [图片 " + (i + 1) + "](" + url + ")");
        });
      }
    }

    return lines.join("\n") + "\n";
  }

  // ─── Clipboard ───

  async function copyToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch (e) {
        // Fall through to fallback
      }
    }

    // Fallback: textarea + execCommand
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(textarea);
    }
  }

  // ─── Toast ───

  function showToast(message) {
    // Remove existing toast
    const existing = document.querySelector(".weibo2md-toast");
    if (existing) {
      existing.remove();
    }

    if (STATE.toastTimer) {
      clearTimeout(STATE.toastTimer);
      STATE.toastTimer = null;
    }

    const toast = document.createElement("div");
    toast.className = "weibo2md-toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger reflow for animation
    void toast.offsetWidth;
    toast.classList.add("weibo2md-toast--visible");

    STATE.toastTimer = setTimeout(() => {
      toast.classList.remove("weibo2md-toast--visible");
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
      STATE.toastTimer = null;
    }, 2500);
  }

  // ─── Context menu visibility sync ───

  async function syncContextMenuVisibility(visible) {
    if (STATE.menuVisible === visible) {
      return;
    }

    STATE.menuVisible = visible;

    try {
      await chrome.runtime.sendMessage({
        type: MENU_VISIBILITY_MESSAGE_TYPE,
        visible
      });
    } catch (error) {
      // Extension context may be invalidated
      console.warn("[weibo2markdown] 同步菜单可见性失败", error);
    }
  }

  // ─── Utilities ───

  function toLargeImageUrl(url) {
    return url.replace(/\/orj\d+\//, "/large/");
  }

  function toAbsoluteUrl(href) {
    if (!href) return "";
    if (href.startsWith("http://") || href.startsWith("https://")) {
      return href;
    }
    if (href.startsWith("//")) {
      return "https:" + href;
    }
    if (href.startsWith("/")) {
      return location.origin + href;
    }
    return href;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function t(messageName, substitutions, fallback = "") {
    const message =
      typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getMessage === "function"
        ? chrome.i18n.getMessage(messageName, substitutions)
        : "";

    return message || fallback || messageName;
  }
})();
