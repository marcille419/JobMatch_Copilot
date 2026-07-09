import * as pdfjsLib from "../vendor/pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("vendor/pdfjs/pdf.worker.min.mjs");

const PROVIDER_DEFAULTS = {
  deepseek: {
    baseURL: "https://api.deepseek.com",
    model: "deepseek-v4-flash"
  },
  qwen: {
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus"
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    model: "gpt-5.4-mini"
  },
  custom: {
    baseURL: "",
    model: ""
  }
};

const STORAGE_KEYS = [
  "provider",
  "apiKey",
  "baseURL",
  "model",
  "resumeText",
  "resumeFileName",
  "resumeSavedAt"
];

const els = {
  statusBadge: document.getElementById("statusBadge"),
  provider: document.getElementById("provider"),
  apiKey: document.getElementById("apiKey"),
  baseURL: document.getElementById("baseURL"),
  model: document.getElementById("model"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  resumePdf: document.getElementById("resumePdf"),
  resumeText: document.getElementById("resumeText"),
  resumeMeta: document.getElementById("resumeMeta"),
  saveResumeBtn: document.getElementById("saveResumeBtn"),
  clearResumeBtn: document.getElementById("clearResumeBtn"),
  refreshPageBtn: document.getElementById("refreshPageBtn"),
  errorPanel: document.getElementById("errorPanel")
};

function setStatus(text) {
  els.statusBadge.textContent = text;
}

function showError(message) {
  els.errorPanel.textContent = message;
  els.errorPanel.classList.remove("hidden");
}

function clearError() {
  els.errorPanel.textContent = "";
  els.errorPanel.classList.add("hidden");
}

function setBusy(isBusy) {
  [
    els.saveConfigBtn,
    els.saveResumeBtn,
    els.clearResumeBtn,
    els.refreshPageBtn,
    els.resumePdf
  ].forEach((element) => {
    element.disabled = isBusy;
  });
}

function storageGet(keys) {
  return chrome.storage.local.get(keys);
}

function storageSet(values) {
  return chrome.storage.local.set(values);
}

function storageRemove(keys) {
  return chrome.storage.local.remove(keys);
}

function countText(text) {
  return String(text || "").trim().length;
}

function formatTime(timestamp) {
  if (!timestamp) {
    return "";
  }
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function updateResumeMeta(fileName, savedAt) {
  const length = countText(els.resumeText.value);
  if (!length) {
    els.resumeMeta.textContent = "未保存";
    return;
  }
  const name = fileName ? ` · ${fileName}` : "";
  const time = savedAt ? ` · ${formatTime(savedAt)}` : "";
  els.resumeMeta.textContent = `${length} 字${name}${time}`;
}

function getConfig() {
  return {
    provider: els.provider.value,
    apiKey: els.apiKey.value.trim(),
    baseURL: els.baseURL.value.trim(),
    model: els.model.value.trim()
  };
}

function applyProviderDefaults(provider) {
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.custom;
  els.baseURL.value = defaults.baseURL;
  els.model.value = defaults.model;
}

async function loadInitialState() {
  const stored = await storageGet(STORAGE_KEYS);
  const provider = stored.provider || "deepseek";
  const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.deepseek;

  els.provider.value = provider;
  els.apiKey.value = stored.apiKey || "";
  els.baseURL.value = stored.baseURL || defaults.baseURL;
  els.model.value = stored.model || defaults.model;
  els.resumeText.value = stored.resumeText || "";

  updateResumeMeta(stored.resumeFileName, stored.resumeSavedAt);
}

async function saveConfig() {
  clearError();
  const config = getConfig();
  if (!config.apiKey || !config.baseURL || !config.model) {
    showError("请填写 API Key、baseURL 和模型名。");
    return;
  }
  await storageSet(config);
  setStatus("配置已保存");
}

async function extractPdfText(file) {
  if (!file) {
    return "";
  }
  if (file.type && file.type !== "application/pdf") {
    throw new Error("请选择 PDF 文件。");
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => item.str)
      .filter(Boolean)
      .join(" ");
    pages.push(text);
  }

  return pages
    .join("\n\n")
    .replace(/\s+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function handlePdfUpload(event) {
  clearError();
  const file = event.target.files && event.target.files[0];
  if (!file) {
    return;
  }

  setBusy(true);
  setStatus("解析 PDF");
  try {
    const text = await extractPdfText(file);
    if (text.length < 40) {
      throw new Error("PDF 未提取到足够文本，可能是扫描件或图片简历。请粘贴文本版简历。");
    }
    els.resumeText.value = text;
    await saveResume(file.name);
    setStatus("PDF 已保存");
  } catch (error) {
    showError(error.message || String(error));
    setStatus("失败");
  } finally {
    setBusy(false);
  }
}

async function saveResume(fileName) {
  clearError();
  const resumeText = els.resumeText.value.trim();
  if (resumeText.length < 40) {
    showError("简历内容过短，请上传 PDF 或粘贴更完整的简历文本。");
    return;
  }
  const savedAt = Date.now();
  const existing = await storageGet(["resumeFileName"]);
  await storageSet({
    resumeText,
    resumeFileName: fileName || existing.resumeFileName || "",
    resumeSavedAt: savedAt
  });
  els.resumeText.value = resumeText;
  updateResumeMeta(fileName || existing.resumeFileName || "", savedAt);
  setStatus("简历已保存");
}

async function clearResume() {
  clearError();
  await storageRemove(["resumeText", "resumeFileName", "resumeSavedAt"]);
  els.resumeText.value = "";
  els.resumePdf.value = "";
  updateResumeMeta();
  setStatus("已清空");
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0] || !tabs[0].id) {
    throw new Error("没有找到当前活动标签页。");
  }
  return tabs[0];
}

async function refreshPageCard() {
  clearError();
  setStatus("刷新中");
  try {
    const tab = await getActiveTab();
    await chrome.tabs.sendMessage(tab.id, { type: "REFRESH_INLINE_MATCH" });
    setStatus("已刷新");
  } catch (_error) {
    showError("当前页面还没有加载内容脚本。请刷新招聘页面后再试。");
    setStatus("失败");
  }
}

els.provider.addEventListener("change", () => {
  applyProviderDefaults(els.provider.value);
});

els.saveConfigBtn.addEventListener("click", () => {
  saveConfig().catch((error) => showError(error.message || String(error)));
});

els.resumePdf.addEventListener("change", handlePdfUpload);
els.saveResumeBtn.addEventListener("click", () => {
  saveResume().catch((error) => showError(error.message || String(error)));
});
els.clearResumeBtn.addEventListener("click", () => {
  clearResume().catch((error) => showError(error.message || String(error)));
});
els.refreshPageBtn.addEventListener("click", () => {
  refreshPageCard().catch((error) => showError(error.message || String(error)));
});
els.resumeText.addEventListener("input", () => updateResumeMeta());

loadInitialState().catch((error) => {
  showError(error.message || String(error));
});
