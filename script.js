document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const loadingIndicator = document.querySelector('.loading-indicator');
    
    // New Elements
    const moodBtns = document.querySelectorAll('.mood-btn');
    const currentMoodDisplay = document.getElementById('current-mood-display');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const analyzeBtn = document.getElementById('analyze-btn');
    const analysisModal = document.getElementById('analysis-modal');
    const closeModal = document.querySelector('.close-modal');
    const analysisResult = document.getElementById('analysis-result');

    let history = []; // 保存对话历史
    let currentMood = ''; // 当前心情

    // 1. 初始化：加载历史记录
    loadHistory();

    // 自动调整输入框高度
    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = userInput.scrollHeight + 'px';
    });

    // 发送消息事件
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 2. 心情选择逻辑
    moodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 移除其他按钮的选中状态
            moodBtns.forEach(b => b.classList.remove('selected'));
            // 选中当前按钮
            btn.classList.add('selected');
            currentMood = btn.dataset.mood;
            currentMoodDisplay.textContent = `已选: ${currentMood}`;
        });
    });

    // 3. 清除历史记录逻辑
    clearHistoryBtn.addEventListener('click', () => {
        if (confirm('确定要清除所有聊天记录吗？此操作无法撤销。')) {
            localStorage.removeItem('chatHistory');
            history = [];
            // 清空界面，只保留系统欢迎语
            const systemMsg = chatContainer.querySelector('.system-message');
            chatContainer.innerHTML = '';
            if (systemMsg) chatContainer.appendChild(systemMsg);
        }
    });

    // 4. 分析报告逻辑
    analyzeBtn.addEventListener('click', async () => {
        analysisModal.style.display = 'block';
        analysisResult.textContent = '正在深入分析您的对话记录，请稍候...';
        
        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ history: history })
            });
            
            const data = await response.json();
            if (data.error) {
                analysisResult.textContent = '分析失败: ' + data.error;
            } else {
                // 简单的 Markdown 渲染 (粗体和换行)
                let html = formatMessage(data.analysis);
                // 增强 Markdown 渲染: 处理 **加粗**
                html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                analysisResult.innerHTML = html;
            }
        } catch (error) {
            analysisResult.textContent = '网络请求出错，无法生成报告。';
        }
    });

    // 关闭模态框
    closeModal.addEventListener('click', () => {
        analysisModal.style.display = 'none';
    });
    window.addEventListener('click', (e) => {
        if (e.target == analysisModal) {
            analysisModal.style.display = 'none';
        }
    });


    async function sendMessage() {
        const text = userInput.value.trim();
        if (!text) return;

        // 如果选择了心情，附加到消息中（但在界面上只显示文本）
        let messageToSend = text;
        if (currentMood) {
            messageToSend = `[用户当前心情: ${currentMood}] ${text}`;
            // 发送后重置心情选择，或者保留？通常保留比较好，或者让用户每次选。
            // 这里我们选择不重置，除非用户自己改。
        }

        // 1. 添加用户消息到界面 (只显示文本，不显示心情标签，保持界面整洁)
        appendMessage('user', text); // 界面显示原始文本
        
        userInput.value = '';
        userInput.style.height = 'auto';
        sendBtn.disabled = true;
        loadingIndicator.style.display = 'block';

        // 2. 创建一个空的 AI 消息框，用于流式显示
        const aiMessageDiv = appendMessage('ai', ''); 
        const aiContentDiv = aiMessageDiv.querySelector('.content');
        
        // 创建思考过程和正式回复的容器
        const reasoningDiv = document.createElement('div');
        reasoningDiv.className = 'reasoning';
        reasoningDiv.style.display = 'none'; // 初始隐藏，有内容时显示
        
        const responseDiv = document.createElement('div');
        responseDiv.className = 'response-text';
        
        aiContentDiv.innerHTML = '';
        aiContentDiv.appendChild(reasoningDiv);
        aiContentDiv.appendChild(responseDiv);

        let fullResponse = "";
        let fullReasoning = "";

        try {
            // 3. 发送请求到后端
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: messageToSend, // 发送带心情的消息
                    history: history
                })
            });

            if (!response.ok) {
                throw new Error('网络请求失败');
            }

            // 4. 处理流式响应
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                const lines = buffer.split('\n');
                buffer = lines.pop(); 

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.trim() === 'data: [DONE]') continue; 

                    if (line.startsWith('data: ')) {
                        try {
                            const jsonStr = line.replace('data: ', '');
                            const data = JSON.parse(jsonStr);
                            
                            // 处理思考过程 (Reasoning Content)
                            const reasoning = data.choices?.[0]?.delta?.reasoning_content;
                            if (reasoning) {
                                fullReasoning += reasoning;
                                reasoningDiv.style.display = 'block';
                                reasoningDiv.innerHTML = formatMessage(fullReasoning);
                                chatContainer.scrollTop = chatContainer.scrollHeight;
                            }

                            // 处理正式回复 (Content)
                            const content = data.choices?.[0]?.delta?.content || data.choices?.[0]?.message?.content || '';
                            if (content) {
                                fullResponse += content;
                                responseDiv.innerHTML = formatMessage(fullResponse);
                                chatContainer.scrollTop = chatContainer.scrollHeight;
                            }

                        } catch (e) {
                            console.warn('解析 SSE 数据失败:', e);
                        }
                    }
                }
            }

            // 更新历史记录 (保存带心情的完整上下文吗？还是只保存文本？)
            // 为了让 AI 记住上下文，我们保存实际发送的内容 messageToSend
            history.push({ role: 'user', content: messageToSend });
            history.push({ role: 'assistant', content: fullResponse });
            
            // 5. 保存到本地存储
            saveHistory();

        } catch (error) {
            console.error('发送消息出错:', error);
            responseDiv.innerHTML += '<br>[出错了，请检查网络或稍后再试]';
        } finally {
            sendBtn.disabled = false;
            loadingIndicator.style.display = 'none';
        }
    }

    function appendMessage(role, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        avatar.textContent = role === 'user' ? '👤' : '🤖';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'content';
        contentDiv.innerHTML = formatMessage(text);
        
        if (role === 'user') {
            messageDiv.appendChild(contentDiv);
            messageDiv.appendChild(avatar);
        } else {
            messageDiv.appendChild(avatar);
            messageDiv.appendChild(contentDiv);
        }
        
        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        return messageDiv; // 返回整个消息 div
    }

    function formatMessage(text) {
        let safeText = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        return safeText.replace(/\n/g, '<br>');
    }

    // --- History Management ---

    function saveHistory() {
        localStorage.setItem('chatHistory', JSON.stringify(history));
    }

    function loadHistory() {
        const savedHistory = localStorage.getItem('chatHistory');
        if (savedHistory) {
            try {
                history = JSON.parse(savedHistory);
                // 恢复界面显示
                history.forEach(msg => {
                    // 对于用户消息，如果包含心情前缀，可以选择去除前缀显示，或者直接显示
                    // 为了美观，我们尝试去除 [用户当前心情: xxx] 前缀
                    let displayText = msg.content;
                    if (msg.role === 'user') {
                        displayText = displayText.replace(/^\[用户当前心情: .*?\] /, '');
                    }
                    
                    // 只有非系统消息才显示（虽然 history 里目前没存 system，但以防万一）
                    if (msg.role !== 'system') {
                        // 对于 AI 消息，我们需要区分 reasoning 和 content
                        // 但是目前的 history 结构只存了最终 content，丢失了 reasoning
                        // 如果想恢复 reasoning，需要修改 history 结构。
                        // 目前简化处理，只恢复最终回复。
                        appendMessage(msg.role === 'assistant' ? 'ai' : 'user', displayText);
                    }
                });
            } catch (e) {
                console.error("加载历史记录失败", e);
                history = [];
            }
        }
    }
});
