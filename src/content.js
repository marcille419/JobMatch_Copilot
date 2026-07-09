const CARD_ID = "jobmatch-copilot-card";
const STYLE_ID = "jobmatch-copilot-style";
const STORAGE_KEYS = ["provider", "apiKey", "baseURL", "model", "resumeText"];

let lastJobHash = "";
let currentJob = null;
let debounceTimer = null;
let activeRequestId = 0;
let isCollapsed = false;

function normalizeJobText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function visibleTextFrom(element) {
  if (!element) {
    return "";
  }
  return normalizeJobText(element.innerText || element.textContent || "");
}

function pickLongestVisible(selectors) {
  const candidates = selectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 80 && rect.height > 80;
    })
    .map((element) => ({
      element,
      text: visibleTextFrom(element)
    }))
    .filter((candidate) => candidate.text.length > 80)
    .sort((a, b) => b.text.length - a.text.length);

  return candidates[0] || null;
}

function extractBossJob() {
  const title = visibleTextFrom(
    document.querySelector(".job-name, .job-banner .name, .job-detail-header .name, .job-title")
  );
  const salary = visibleTextFrom(
    document.querySelector(".salary, .job-salary, .job-banner .salary")
  );
  const meta = Array.from(
    document.querySelectorAll(".job-banner .tag, .job-detail-header .tag, .job-primary .tag, .job-info .tag")
  )
    .map((element) => visibleTextFrom(element))
    .filter(Boolean)
    .join(" / ");

  const detail = pickLongestVisible([
    ".job-detail",
    ".job-detail-container",
    ".detail-content",
    ".job-sec-text",
    ".job-card-body",
    ".job-detail-box",
    ".job-detail-section",
    ".job-description",
    ".job-detail .text",
    ".job-detail .job-sec"
  ]);

  const sections = [
    title && `岗位：${title}`,
    salary && `薪资：${salary}`,
    meta && `基本要求：${meta}`,
    detail && detail.text
  ].filter(Boolean);

  const text = normalizeJobText(sections.join("\n\n"));
  if (text.length < 120) {
    return null;
  }

  return {
    source: "boss-zhipin",
    text,
    length: text.length,
    mountTarget: detail && detail.element
  };
}

function extractGenericJob() {
  const main = pickLongestVisible([
    "main",
    "article",
    "[role='main']",
    ".content",
    ".container",
    ".main",
    "body"
  ]);
  const text = normalizeJobText((main && main.text) || document.body.innerText || "");
  const maxLength = 12000;

  return {
    source: "generic-page",
    text: text.slice(0, maxLength),
    length: Math.min(text.length, maxLength),
    mountTarget: main && main.element
  };
}

function extractCurrentJobDescription() {
  const host = location.hostname;
  if (host.includes("zhipin.com")) {
    const bossResult = extractBossJob();
    if (bossResult) {
      return bossResult;
    }
  }

  return extractGenericJob();
}

function hashText(text) {
  let hash = 0;
  const value = String(text || "");
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return `${value.length}:${hash}`;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${CARD_ID} {
      position: fixed;
      right: 24px;
      top: 220px;
      z-index: 2147483640;
      width: 280px;
      max-height: calc(100vh - 260px);
      overflow: auto;
      margin: 0;
      padding: 14px;
      border: 1px solid #cfe8e5;
      border-radius: 8px;
      background: #f7fffd;
      color: #17202a;
      box-shadow: 0 8px 24px rgba(6, 122, 115, 0.12);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      font-size: 14px;
      line-height: 1.5;
      pointer-events: auto;
    }
    #${CARD_ID} * { box-sizing: border-box; }
    #${CARD_ID}.jm-collapsed {
      width: 176px;
      max-height: none;
      padding: 10px 12px;
      cursor: pointer;
    }
    #${CARD_ID} .jm-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }
    #${CARD_ID}.jm-collapsed .jm-head {
      margin-bottom: 0;
    }
    #${CARD_ID} .jm-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: #12312f;
    }
    #${CARD_ID}.jm-collapsed .jm-title {
      font-size: 13px;
    }
    #${CARD_ID} .jm-score {
      min-width: 76px;
      padding: 8px 10px;
      border-radius: 8px;
      background: #e5f7f4;
      color: #035e58;
      text-align: center;
      font-weight: 800;
    }
    #${CARD_ID} .jm-score strong {
      font-size: 24px;
      line-height: 1;
    }
    #${CARD_ID}.jm-collapsed .jm-score {
      min-width: 58px;
      padding: 5px 8px;
    }
    #${CARD_ID}.jm-collapsed .jm-score strong {
      font-size: 18px;
    }
    #${CARD_ID} .jm-muted {
      margin: 0;
      color: #5f6f7f;
      font-size: 13px;
    }
    #${CARD_ID} .jm-summary,
    #${CARD_ID} .jm-detail {
      margin: 8px 0 0;
      white-space: pre-wrap;
    }
    #${CARD_ID} .jm-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    #${CARD_ID} button {
      min-height: 36px;
      padding: 7px 12px;
      border: 1px solid #b9d8d4;
      border-radius: 8px;
      background: #ffffff;
      color: #035e58;
      cursor: pointer;
      font: inherit;
      font-weight: 700;
    }
    #${CARD_ID} button.jm-primary {
      border-color: #067a73;
      background: #067a73;
      color: #ffffff;
    }
    #${CARD_ID} button.jm-ghost {
      min-height: 28px;
      padding: 3px 8px;
      border-color: transparent;
      background: transparent;
      color: #5f6f7f;
    }
    #${CARD_ID} button:disabled {
      cursor: not-allowed;
      opacity: 0.58;
    }
    #${CARD_ID} .jm-list {
      margin: 8px 0 0;
      padding-left: 18px;
    }
    #${CARD_ID} .jm-section {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #d7ece9;
    }
    #${CARD_ID} .jm-section h4 {
      margin: 0;
      font-size: 13px;
      color: #12312f;
    }
    @media (max-width: 1280px) {
      #${CARD_ID} {
        right: 16px;
        top: auto;
        bottom: 96px;
      }
    }
    @media (max-width: 760px) {
      #${CARD_ID} {
        right: 12px;
        left: 12px;
        bottom: 16px;
        top: auto;
        width: auto;
        max-height: 45vh;
      }
      #${CARD_ID}.jm-collapsed {
        left: auto;
        width: 176px;
      }
    }
  `;
  document.documentElement.appendChild(style);
}

function ensureCard() {
  injectStyle();
  let card = document.getElementById(CARD_ID);
  if (!card) {
    card = document.createElement("section");
    card.id = CARD_ID;
    card.setAttribute("aria-live", "polite");
  }

  if (card.parentElement !== document.body) {
    document.body.appendChild(card);
  }

  return card;
}

function renderCard(state) {
  const card = ensureCard();
  const score = Number.isFinite(state.matchScore) ? state.matchScore : "--";
  const scoreSuffix = Number.isFinite(state.matchScore) ? "/100" : "";
  const disabled = state.busy ? "disabled" : "";
  const detailMarkup = state.detail
    ? renderDetail(state.detail)
    : "";

  card.classList.toggle("jm-collapsed", isCollapsed);
  if (isCollapsed) {
    card.innerHTML = `
      <div class="jm-head">
        <div>
          <h3 class="jm-title">AI 匹配</h3>
          <p class="jm-muted">点击展开</p>
        </div>
        <div class="jm-score"><strong>${escapeHtml(score)}</strong><span>${scoreSuffix}</span></div>
      </div>
    `;
    card.addEventListener("click", expandCard, { once: true });
    return;
  }

  card.innerHTML = `
    <div class="jm-head">
      <div>
        <h3 class="jm-title">AI 岗位匹配</h3>
        <p class="jm-muted">${escapeHtml(state.meta || "当前 JD + 本地简历")}</p>
      </div>
      <div class="jm-score"><strong>${escapeHtml(score)}</strong><span>${scoreSuffix}</span></div>
    </div>
    <p class="jm-summary">${escapeHtml(state.summary || "")}</p>
    ${state.recommendation ? `<p class="jm-muted">${escapeHtml(state.recommendation)}</p>` : ""}
    <div class="jm-actions">
      <button type="button" class="jm-refresh" ${disabled}>重新分析</button>
      <button type="button" class="jm-primary jm-detail-btn" ${disabled}>详细分析</button>
      <button type="button" class="jm-ghost jm-collapse" ${disabled}>收起</button>
    </div>
    ${detailMarkup}
  `;

  card.querySelector(".jm-refresh").addEventListener("click", () => runQuickAnalysis(true));
  card.querySelector(".jm-detail-btn").addEventListener("click", runDetailedAnalysis);
  card.querySelector(".jm-collapse").addEventListener("click", collapseCard);
}

function collapseCard() {
  const scoreText = document.querySelector(`#${CARD_ID} .jm-score strong`)?.textContent;
  isCollapsed = true;
  renderCard({
    matchScore: Number(scoreText),
    meta: "已收起",
    summary: ""
  });
}

function expandCard() {
  isCollapsed = false;
  runQuickAnalysis(true);
}

function renderDetail(detail) {
  const list = (items) => {
    const values = Array.isArray(items) && items.length > 0 ? items : ["暂无明确内容"];
    return `<ul class="jm-list">${values.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  };

  return `
    <div class="jm-section">
      <h4>岗位摘要</h4>
      <p class="jm-detail">${escapeHtml(detail.jobSummary || "暂无摘要")}</p>
    </div>
    <div class="jm-section">
      <h4>优势</h4>
      ${list(detail.strengths)}
    </div>
    <div class="jm-section">
      <h4>不足</h4>
      ${list(detail.weaknesses)}
    </div>
    <div class="jm-section">
      <h4>补充学习建议</h4>
      ${list(detail.learningSuggestions)}
    </div>
    <div class="jm-section">
      <h4>求职沟通话术</h4>
      <p class="jm-detail">${escapeHtml(detail.message || "暂无话术")}</p>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getStoredConfig() {
  return chrome.storage.local.get(STORAGE_KEYS);
}

function buildConfig(stored) {
  return {
    provider: stored.provider || "deepseek",
    apiKey: String(stored.apiKey || "").trim(),
    baseURL: String(stored.baseURL || "").trim(),
    model: String(stored.model || "").trim()
  };
}

function validateReady(stored) {
  if (!stored.apiKey || !stored.baseURL || !stored.model) {
    return "请先打开扩展填写并保存模型配置。";
  }
  if (!stored.resumeText || String(stored.resumeText).trim().length < 40) {
    return "请先打开扩展上传 PDF 简历或粘贴简历文本。";
  }
  return "";
}

async function sendAnalysis(analysisType) {
  const stored = await getStoredConfig();
  const notReady = validateReady(stored);
  if (notReady) {
    throw new Error(notReady);
  }

  const response = await chrome.runtime.sendMessage({
    type: "ANALYZE_JOB_MATCH",
    payload: {
      analysisType,
      config: buildConfig(stored),
      jdText: currentJob.text,
      resumeText: String(stored.resumeText || "").trim()
    }
  });

  if (!response || !response.ok) {
    throw new Error((response && response.error) || "分析失败。");
  }
  return response.result.parsed;
}

async function runQuickAnalysis(force) {
  const requestId = ++activeRequestId;
  try {
    if (!currentJob || currentJob.text.length < 40) {
      return;
    }
    renderCard({
      busy: true,
      meta: currentJob.source === "boss-zhipin" ? "BOSS直聘当前岗位" : "当前页面正文",
      summary: force ? "正在重新分析当前岗位..." : "正在分析当前岗位与本地简历的匹配度..."
    });
    const result = await sendAnalysis("quick");
    if (requestId !== activeRequestId) {
      return;
    }
    renderCard({
      busy: false,
      matchScore: result.matchScore,
      meta: "轻量分析",
      summary: result.summary || "已完成轻量匹配分析。",
      recommendation: result.recommendation
    });
  } catch (error) {
    if (requestId !== activeRequestId) {
      return;
    }
    renderCard({
      busy: false,
      meta: "需要配置",
      summary: error.message || String(error)
    });
  }
}

async function runDetailedAnalysis() {
  const requestId = ++activeRequestId;
  try {
    renderCard({
      busy: true,
      meta: "详细分析",
      summary: "正在生成优势、不足、学习建议和沟通话术..."
    });
    const detail = await sendAnalysis("full");
    if (requestId !== activeRequestId) {
      return;
    }
    renderCard({
      busy: false,
      matchScore: detail.matchScore,
      meta: "详细分析",
      summary: "详细分析已生成。",
      detail
    });
  } catch (error) {
    if (requestId !== activeRequestId) {
      return;
    }
    renderCard({
      busy: false,
      meta: "详细分析失败",
      summary: error.message || String(error)
    });
  }
}

function refreshCurrentJob() {
  const job = extractCurrentJobDescription();
  if (!job || !job.text || job.text.length < 120) {
    return;
  }

  const nextHash = hashText(job.text);
  if (nextHash === lastJobHash) {
    ensureCard(currentJob || job);
    return;
  }

  currentJob = job;
  lastJobHash = nextHash;
  ensureCard(job);
  runQuickAnalysis(false);
}

function scheduleRefresh() {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(refreshCurrentJob, 900);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "EXTRACT_CURRENT_JD") {
    try {
      const result = extractCurrentJobDescription();
      const { mountTarget: _mountTarget, ...serializable } = result;
      sendResponse({ ok: true, result: serializable });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || String(error) });
    }
    return true;
  }

  if (message && message.type === "REFRESH_INLINE_MATCH") {
    scheduleRefresh();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

refreshCurrentJob();

const observer = new MutationObserver(scheduleRefresh);
observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true
});
