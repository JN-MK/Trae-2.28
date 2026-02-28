document.addEventListener('DOMContentLoaded', () => {
    const chatContainer = document.getElementById('chat-container');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const loadingIndicator = document.querySelector('.loading-indicator');

    let history = []; // 保存对话历史

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

    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        // 1. 添加用户消息到界面
        appendMessage('user', message);
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
            // 使用相对路径，适配本地和生产环境
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: message,
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

            // 更新历史记录
            history.push({ role: 'user', content: message });
            history.push({ role: 'assistant', content: fullResponse });

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
});
