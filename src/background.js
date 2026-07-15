const PROVIDER_DEFAULTS = {
  deepseek: {
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    model: "deepseek-v4-flash"
  },
  qwen: {
    label: "通义千问",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus"
  },
  openai: {
    label: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-5.4-mini"
  },
  custom: {
    label: "自定义",
    baseURL: "",
    model: ""
  }
};

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function buildChatCompletionsURL(baseURL) {
  const cleanBase = trimTrailingSlash(baseURL);
  if (!cleanBase) {
    throw new Error("请填写 baseURL。");
  }
  if (cleanBase.endsWith("/chat/completions")) {
    return cleanBase;
  }
  return `${cleanBase}/chat/completions`;
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw new Error("模型返回为空。");
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error("模型没有返回可解析的 JSON。");
  }
}

function normalizeDetailedAnalysisResult(value) {
  const result = value || {};
  return {
    matchScore: Math.max(0, Math.min(100, Number(result.matchScore) || 0)),
    jobSummary: String(result.jobSummary || "").trim(),
    strengths: Array.isArray(result.strengths) ? result.strengths.map(String).filter(Boolean) : [],
    weaknesses: Array.isArray(result.weaknesses) ? result.weaknesses.map(String).filter(Boolean) : [],
    learningSuggestions: Array.isArray(result.learningSuggestions)
      ? result.learningSuggestions.map(String).filter(Boolean)
      : [],
    message: String(result.message || "").trim()
  };
}

function normalizeQuickAnalysisResult(value) {
  const result = value || {};
  return {
    matchScore: Math.max(0, Math.min(100, Number(result.matchScore) || 0)),
    summary: String(result.summary || result.jobSummary || "").trim(),
    recommendation: String(result.recommendation || "").trim()
  };
}

function buildMessages(jdText, resumeText, analysisType) {
  const isQuick = analysisType === "quick";
  const schema = isQuick
    ? [
        "{",
        "  \"matchScore\": 0,",
        "  \"summary\": \"一句话说明当前岗位和简历的匹配判断\",",
        "  \"recommendation\": \"一句话建议是否值得详细了解\"",
        "}"
      ]
    : [
        "{",
        "  \"matchScore\": 0,",
        "  \"jobSummary\": \"岗位要求摘要，中文字符串\",",
        "  \"strengths\": [\"优势1\", \"优势2\"],",
        "  \"weaknesses\": [\"不足1\", \"不足2\"],",
        "  \"learningSuggestions\": [\"建议1\", \"建议2\"],",
        "  \"message\": \"一段适合发给招聘者的中文求职沟通话术\"",
        "}"
      ];

  return [
    {
      role: "system",
      content: [
        "你是一个严谨的中文求职顾问，只分析用户提供的当前 JD 和当前简历。",
        "不得引用历史记录，不得假设简历中没有出现的信息，不得分析其他岗位。",
        "只返回 JSON，不要使用 Markdown，不要输出解释性前后缀。"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        isQuick
          ? "请基于以下当前 JD 和当前简历，输出轻量岗位匹配判断。"
          : "请基于以下当前 JD 和当前简历，输出详细岗位匹配分析。",
        "JSON schema:",
        ...schema,
        "",
        isQuick
          ? "评分要求：matchScore 是 0-100 的整数；summary 和 recommendation 都控制在 40 个中文字符以内。"
          : "评分要求：matchScore 是 0-100 的整数；优势、不足和建议都要具体对应 JD 和简历。",
        "",
        "当前 JD：",
        jdText,
        "",
        "当前简历：",
        resumeText
      ].join("\n")
    }
  ];
}

function getPreferredTokenParam(config) {
  const provider = String(config.provider || "").toLowerCase();
  const baseURL = String(config.baseURL || "").toLowerCase();
  if (provider === "openai" || baseURL.includes("api.openai.com")) {
    return "max_completion_tokens";
  }
  return "max_tokens";
}

function getAlternateTokenParam(tokenParam) {
  return tokenParam === "max_completion_tokens" ? "max_tokens" : "max_completion_tokens";
}

function shouldRetryWithAlternateTokenParam(error) {
  const message = String(error && error.message ? error.message : error).toLowerCase();
  return message.includes("max_tokens") || message.includes("max_completion_tokens");
}

function updateActionState(enabled) {
  chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: "#637083" });
  chrome.action.setTitle({
    title: enabled ? "AI 岗位匹配" : "AI 岗位匹配（已暂停）"
  });
}

async function callChatCompletions(config, jdText, resumeText, analysisType, useResponseFormat, tokenParam) {
  const url = buildChatCompletionsURL(config.baseURL);
  const body = {
    model: config.model,
    messages: buildMessages(jdText, resumeText, analysisType),
    temperature: 0.2
  };
  body[tokenParam] = 1400;

  if (useResponseFormat) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify(body)
  });

  const responseText = await response.text();
  let payload = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch (_error) {
    payload = null;
  }

  if (!response.ok) {
    const message = payload && payload.error && (payload.error.message || payload.error.code);
    throw new Error(message || `AI 请求失败：HTTP ${response.status} ${response.statusText}`);
  }

  const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message
    ? payload.choices[0].message.content
    : "";

  return {
    raw: content || responseText,
    parsed: analysisType === "quick"
      ? normalizeQuickAnalysisResult(extractJsonObject(content || responseText))
      : normalizeDetailedAnalysisResult(extractJsonObject(content || responseText))
  };
}

async function analyzeJob(payload) {
  const stored = await chrome.storage.local.get(["extensionEnabled"]);
  if (stored.extensionEnabled === false) {
    throw new Error("插件已暂停，请在扩展弹窗中启用后再分析。");
  }

  const config = payload.config || {};
  const jdText = String(payload.jdText || "").trim();
  const resumeText = String(payload.resumeText || "").trim();
  const analysisType = payload.analysisType === "quick" ? "quick" : "full";

  if (!config.apiKey) {
    throw new Error("请先填写 API Key。");
  }
  if (!config.baseURL) {
    throw new Error("请先填写 baseURL。");
  }
  if (!config.model) {
    throw new Error("请先填写模型名。");
  }
  if (jdText.length < 40) {
    throw new Error("当前 JD 内容过短，请重新读取或手动粘贴完整 JD。");
  }
  if (resumeText.length < 40) {
    throw new Error("简历内容过短，请粘贴并保存完整简历文本。");
  }

  let tokenParam = getPreferredTokenParam(config);

  for (const useResponseFormat of [true, false]) {
    try {
      return await callChatCompletions(config, jdText, resumeText, analysisType, useResponseFormat, tokenParam);
    } catch (error) {
      if (shouldRetryWithAlternateTokenParam(error)) {
        tokenParam = getAlternateTokenParam(tokenParam);
        try {
          return await callChatCompletions(config, jdText, resumeText, analysisType, useResponseFormat, tokenParam);
        } catch (retryError) {
          const retryMessage = String(retryError.message || retryError);
          if (retryMessage.includes("response_format") || retryMessage.includes("json_object")) {
            continue;
          }
          throw retryError;
        }
      }

      const message = String(error.message || error);
      if (message.includes("response_format") || message.includes("json_object")) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("AI 请求失败：当前模型不支持插件使用的 JSON 输出参数。");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "ANALYZE_JOB_MATCH") {
    return false;
  }

  analyzeJob(message.payload)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));

  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["extensionEnabled", "provider", "baseURL", "model"], (stored) => {
    if (stored.extensionEnabled === undefined) {
      chrome.storage.local.set({ extensionEnabled: true });
    }
    updateActionState(stored.extensionEnabled !== false);

    if (!stored.provider && !stored.baseURL && !stored.model) {
      chrome.storage.local.set({
        provider: "deepseek",
        baseURL: PROVIDER_DEFAULTS.deepseek.baseURL,
        model: PROVIDER_DEFAULTS.deepseek.model
      });
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(["extensionEnabled"], (stored) => {
    updateActionState(stored.extensionEnabled !== false);
  });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.extensionEnabled) {
    updateActionState(changes.extensionEnabled.newValue !== false);
  }
});

chrome.storage.local.get(["extensionEnabled"], (stored) => {
  updateActionState(stored.extensionEnabled !== false);
});
