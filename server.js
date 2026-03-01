const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 启用 CORS，允许前端跨域请求
app.use(cors());
// 解析 JSON 请求体
app.use(express.json());
// 托管静态文件 (前端页面)
// 使用绝对路径确保在不同环境下都能正确找到文件
app.use(express.static(__dirname));

// 根路由，明确返回 index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API 配置
// 优先从环境变量获取，如果没有则报错或提示
const API_KEY = process.env.ARK_API_KEY;
if (!API_KEY) {
    console.error("错误: 未找到 ARK_API_KEY 环境变量。请在 .env 文件或 Vercel 环境变量中设置。");
}
const API_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";

// 处理聊天请求的路由
app.post('/api/chat', async (req, res) => {
    const { message, history } = req.body;

    // 构建消息列表，包含系统提示词和历史记录
    const messages = [
        { 
            role: "system", 
            content: "你是一个有智慧的人生教练(Life Coach)，你会通过对话给予建议，帮助用户成长。请用温暖、鼓励且富有洞察力的语气与用户交流。" 
        },
        ...(history || []), // 添加之前的对话历史
        { role: "user", content: message } // 当前用户消息
    ];

    try {
        console.log("正在发送请求到火山方舟 API...");
        
        // 设置响应头，支持流式输出
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 调用火山方舟 DeepSeek R1 API
        const response = await axios.post(
            API_URL,
            {
                model: "deepseek-r1-250528",
                messages: messages,
                stream: true, // 开启流式输出
                temperature: 0.6
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                responseType: 'stream', // 关键：设置响应类型为流
                timeout: 60000 // 60秒超时
            }
        );

        // 将 API 的流式响应直接通过管道转发给前端
        response.data.pipe(res);

        response.data.on('end', () => {
            console.log("流式响应结束");
            res.end();
        });

        response.data.on('error', (err) => {
            console.error("流传输错误:", err);
            res.end();
        });

    } catch (error) {
        console.error("API 请求出错:", error.message);
        if (error.response) {
            console.error("错误详情:", error.response.data);
        }
        // 如果还没有发送响应头，则发送 JSON 错误
        if (!res.headersSent) {
            res.status(500).json({ error: "服务器内部错误，请稍后再试。" });
        } else {
            res.end();
        }
    }
});

// 处理分析请求的路由
app.post('/api/analyze', async (req, res) => {
    const { history } = req.body;

    // 过滤掉系统消息，只保留用户和助手的对话
    const userHistory = history.filter(msg => msg.role !== 'system');
    
    // 如果历史记录太少，直接返回提示
    if (userHistory.length < 4) {
        return res.json({ analysis: "对话记录较少，暂时无法生成深入的分析报告。请多和我聊聊吧！" });
    }

    // 构建分析专用的提示词
    const messages = [
        { 
            role: "system", 
            content: `你是一位资深的心理咨询师和人生教练。请根据以下的对话历史，为用户生成一份简短的"成长分析报告"。
请包含以下内容：
1. **当前状态**：分析用户的情绪状态和主要关注点。
2. **潜在模式**：识别用户思维或行为中重复出现的模式（积极或消极）。
3. **成长建议**：给出3条具体、可执行的建议，帮助用户突破当前局限。
请保持语气专业、温暖且富有洞察力。使用 Markdown 格式输出。` 
        },
        {
            role: "user",
            content: `以下是我们之前的对话记录：\n${JSON.stringify(userHistory)}\n\n请根据以上内容为我生成分析报告。`
        }
    ];

    try {
        const response = await axios.post(
            API_URL,
            {
                model: "deepseek-r1-250528",
                messages: messages,
                stream: false, // 分析报告不需要流式，一次性返回即可
                temperature: 0.7
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                },
                timeout: 60000 
            }
        );

        const analysis = response.data.choices[0].message.content;
        res.json({ analysis });

    } catch (error) {
        console.error("分析请求出错:", error.message);
        res.status(500).json({ error: "无法生成分析报告，请稍后再试。" });
    }
});

// 导出 app 供 Vercel Serverless 使用
module.exports = app;

// 仅在本地运行时启动监听
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`服务器运行在 http://localhost:${PORT}`);
    });
}
