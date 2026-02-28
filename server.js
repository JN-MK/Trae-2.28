const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 3001;

// 启用 CORS，允许前端跨域请求
app.use(cors());
// 解析 JSON 请求体
app.use(express.json());
// 托管静态文件 (前端页面)
app.use(express.static(path.join(__dirname, '.')));

// API 配置
const API_KEY = "f2519d58-27dc-44a4-8dae-c5a8c04850b5";
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

// 启动服务器
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});
