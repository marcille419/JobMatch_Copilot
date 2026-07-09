# AI Job Match Copilot

Chrome/Edge Manifest V3 插件，用于在招聘页面当前 JD 旁边直接展示 AI 岗位匹配结果。

## 功能

- 优先适配 BOSS 直聘 `www.zhipin.com` 当前岗位详情页。
- 页面内自动展示轻量分析卡片：匹配分数、简短判断、是否值得详细了解。
- 点击页面内“详细分析”后，再生成优势、不足、补充学习建议和求职沟通话术。
- 弹窗只作为设置页：配置 AI API、上传或粘贴简历。
- 支持上传 PDF 简历，本地解析成文本后长期保存到 `chrome.storage.local`。
- 支持 DeepSeek、通义千问、OpenAI、自定义 OpenAI-compatible 接口。

## 加载方式

1. 打开 Chrome 或 Edge 扩展管理页面。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展”。
4. 选择本目录：`E:\personproject\JobMatch_Copilot`。

## 使用流程

1. 打开扩展弹窗。
2. 填写并保存模型配置。
3. 上传 PDF 简历，或粘贴文本简历并保存。
4. 打开 BOSS 直聘岗位详情页。
5. 插件会在当前 JD 旁边展示轻量匹配分析。
6. 对岗位感兴趣时，点击“详细分析”查看完整建议。

## 默认模型

模型名和 `baseURL` 都可以在插件中编辑。当前默认值：

- DeepSeek：`https://api.deepseek.com`，`deepseek-v4-flash`
- 通义千问：`https://dashscope.aliyuncs.com/compatible-mode/v1`，`qwen-plus`
- OpenAI：`https://api.openai.com/v1`，`gpt-5.4-mini`

如果厂商更新模型名，直接在插件里修改模型名并保存即可。

## PDF 支持

PDF 文本提取使用本地打包的 `pdfjs-dist`，文件位于 `vendor/pdfjs/`，许可证见 `vendor/pdfjs/LICENSE`。

注意：扫描件或图片型 PDF 可能无法提取文本，需要用户粘贴文本版简历。

## 隐私边界

- API Key、模型配置和简历文本只保存到浏览器本地。
- 插件不提供后端，不云端保存简历或分析结果。
- 页面内轻量分析和详细分析都会把当前 JD 与本地简历发送给用户选择的 AI 服务商。

## 注意

`manifest.json` 使用了 `<all_urls>` host permission，用于读取当前招聘页和调用用户自定义 AI 接口。若后续准备上架应用商店，应把权限拆成更严格的站点权限和可选接口权限，并补充隐私政策。
