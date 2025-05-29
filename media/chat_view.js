(function() {
    const vscode = acquireVsCodeApi();
    let session = null;
    let isInHistoryView = false;
    let historySessions = [];
    
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            vscode.postMessage({ type: 'ready' });
            let retryCount = 0;
            const checkReadyInterval = setInterval(() => {
                if (window.__WEBVIEW_READY__ || retryCount > 5) {
                    clearInterval(checkReadyInterval);
                    return;
                }
                vscode.postMessage({ type: 'ready' });
                retryCount++;
            }, 300);
        }, 500);
    });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'update':
                session = message.session;
                isInHistoryView = message.isInHistoryView;
                historySessions = message.historySessions || [];
                render();
                break;
            case 'addReference':
                addReferenceToUI(message.reference);
                break;
        }
    });

    function render() {
        const app = document.getElementById('app');
        app.innerHTML = '';
        if (isInHistoryView) {
            renderHistoryView(app);
        } else if (session) {
            renderChatView(app);
        } else {
            renderWelcomeView(app);
        }
    }

    function renderWelcomeView(container) {
        const welcomeDiv = document.createElement('div');
        welcomeDiv.className = 'welcome-view';
        
        const title = document.createElement('h1');
        title.textContent = 'AI 聊天助手';
        welcomeDiv.appendChild(title);
        
        const description = document.createElement('p');
        description.textContent = '开始一个新的会话来与AI助手交流';
        welcomeDiv.appendChild(description);
        
        const newSessionBtn = document.createElement('button');
        newSessionBtn.className = 'primary-button';
        newSessionBtn.textContent = '创建新会话';
        newSessionBtn.onclick = () => vscode.postMessage({ type: 'createNewSession' });
        welcomeDiv.appendChild(newSessionBtn);
        
        container.appendChild(welcomeDiv);
    }

    function renderChatView(container) {
        const chatContainer = document.createElement('div');
        chatContainer.className = 'chat-container';
        
        // 标题栏
        const titleBar = document.createElement('div');
        titleBar.className = 'title-bar';
        
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = session.title;
        titleInput.className = 'session-title';
        titleInput.placeholder = '会话标题';
        titleInput.onchange = (e) => vscode.postMessage({ 
            type: 'updateTitle', 
            title: e.target.value 
        });
        titleBar.appendChild(titleInput);
        
        const modelBtn = document.createElement('button');
        modelBtn.className = 'icon-button';
        modelBtn.innerHTML = '<i class="codicon codicon-server"></i>';
        modelBtn.title = '选择模型';
        modelBtn.onclick = () => vscode.postMessage({ type: 'selectModel' });
        titleBar.appendChild(modelBtn);
        
        const historyBtn = document.createElement('button');
        historyBtn.className = 'icon-button';
        historyBtn.innerHTML = '<i class="codicon codicon-history"></i>';
        historyBtn.title = '历史会话';
        historyBtn.onclick = () => vscode.postMessage({ type: 'showHistory' });
        titleBar.appendChild(historyBtn);
        
        chatContainer.appendChild(titleBar);
        
        // 引用栏
        const referencesBar = document.createElement('div');
        referencesBar.className = 'references-bar';
        referencesBar.id = 'references-bar';
        chatContainer.appendChild(referencesBar);
        
        // 消息容器
        const messagesContainer = document.createElement('div');
        messagesContainer.className = 'messages-container';
        messagesContainer.id = 'messages-container';
        
        // 渲染消息
        if (session.messages.length > 0) {
            session.messages.forEach(message => {
                messagesContainer.appendChild(createMessageElement(message));
            });
            // 滚动到底部
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        
        chatContainer.appendChild(messagesContainer);
        
        // 输入区域
        const inputContainer = document.createElement('div');
        inputContainer.className = 'input-container';
        
        const addRefBtn = document.createElement('button');
        addRefBtn.className = 'icon-button';
        addRefBtn.innerHTML = '<i class="codicon codicon-link"></i>';
        addRefBtn.title = '添加引用';
        addRefBtn.onclick = () => vscode.postMessage({ type: 'addReference' });
        inputContainer.appendChild(addRefBtn);
        
        const textarea = document.createElement('textarea');
        textarea.placeholder = '输入消息...';
        textarea.id = 'message-input';
        textarea.rows = 3;
        inputContainer.appendChild(textarea);
        
        const sendBtn = document.createElement('button');
        sendBtn.className = 'icon-button primary';
        sendBtn.innerHTML = '<i class="codicon codicon-send"></i>';
        sendBtn.title = '发送消息';
        sendBtn.onclick = sendMessage;
        inputContainer.appendChild(sendBtn);
        
        // 支持按Enter发送，Shift+Enter换行
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        chatContainer.appendChild(inputContainer);
        container.appendChild(chatContainer);
    }

    // 渲染历史视图
    function renderHistoryView(container) {
        const historyContainer = document.createElement('div');
        historyContainer.className = 'history-container';
        
        // 标题栏
        const titleBar = document.createElement('div');
        titleBar.className = 'title-bar';
        
        const backBtn = document.createElement('button');
        backBtn.className = 'icon-button';
        backBtn.innerHTML = '<i class="codicon codicon-arrow-left"></i>';
        backBtn.onclick = () => vscode.postMessage({ type: 'backToChat' });
        titleBar.appendChild(backBtn);
        
        const title = document.createElement('h2');
        title.textContent = '历史会话';
        titleBar.appendChild(title);
        
        historyContainer.appendChild(titleBar);
        
        // 按日期分组
        const groupedSessions = groupSessionsByDate(historySessions);
        
        Object.keys(groupedSessions).forEach(date => {
            const dateSection = document.createElement('div');
            dateSection.className = 'date-section';
            
            const dateHeader = document.createElement('div');
            dateHeader.className = 'date-header';
            dateHeader.textContent = date;
            dateSection.appendChild(dateHeader);
            
            const sessionsList = document.createElement('div');
            sessionsList.className = 'sessions-list';
            
            groupedSessions[date].forEach(session => {
                const sessionItem = document.createElement('div');
                sessionItem.className = 'session-item';
                
                const sessionIcon = document.createElement('i');
                sessionIcon.className = 'codicon codicon-comment';
                sessionItem.appendChild(sessionIcon);
                
                const sessionInfo = document.createElement('div');
                sessionInfo.className = 'session-info';
                
                const sessionTitle = document.createElement('div');
                sessionTitle.className = 'session-title';
                sessionTitle.textContent = session.title;
                sessionInfo.appendChild(sessionTitle);
                
                const sessionTime = document.createElement('div');
                sessionTime.className = 'session-time';
                sessionTime.textContent = new Date(session.lastActive).toLocaleTimeString();
                sessionInfo.appendChild(sessionTime);
                
                sessionItem.appendChild(sessionInfo);
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'icon-button delete-button';
                deleteBtn.innerHTML = '<i class="codicon codicon-trash"></i>';
                deleteBtn.title = '删除会话';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    vscode.postMessage({ type: 'deleteSession', sessionId: session.id });
                };
                sessionItem.appendChild(deleteBtn);
                
                sessionItem.onclick = () => vscode.postMessage({ 
                    type: 'loadSession', 
                    sessionId: session.id 
                });
                
                sessionsList.appendChild(sessionItem);
            });
            
            dateSection.appendChild(sessionsList);
            historyContainer.appendChild(dateSection);
        });
        
        container.appendChild(historyContainer);
    }

    // 创建消息元素
    function createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.role}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'avatar';
        if (message.role === 'user') {
            avatar.innerHTML = '<i class="codicon codicon-person"></i>';
        } else {
            avatar.innerHTML = '<i class="codicon codicon-server"></i>';
        }
        messageDiv.appendChild(avatar);
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'content';
        
        const textDiv = document.createElement('div');
        textDiv.className = 'text';
        textDiv.textContent = message.content;
        contentDiv.appendChild(textDiv);
        
        // 显示引用
        if (message.references && message.references.length > 0) {
            const referencesDiv = document.createElement('div');
            referencesDiv.className = 'references';
            
            message.references.forEach((ref, index) => {
                const refDiv = document.createElement('div');
                refDiv.className = 'reference';
                
                const icon = document.createElement('i');
                icon.className = `codicon ${ref.type === 'code' ? 'codicon-symbol-method' : 
                                 ref.type === 'file' ? 'codicon-file' : 
                                 'codicon-folder'}`;
                refDiv.appendChild(icon);
                
                const nameSpan = document.createElement('span');
                nameSpan.textContent = ref.name;
                refDiv.appendChild(nameSpan);
                
                referencesDiv.appendChild(refDiv);
            });
            
            contentDiv.appendChild(referencesDiv);
        }
        
        messageDiv.appendChild(contentDiv);
        return messageDiv;
    }

    // 添加引用到UI
    function addReferenceToUI(reference) {
        const referencesBar = document.getElementById('references-bar');
        if (!referencesBar) return;
        
        const refTag = document.createElement('div');
        refTag.className = 'reference-tag';
        
        const icon = document.createElement('i');
        icon.className = `codicon ${reference.type === 'code' ? 'codicon-symbol-method' : 
                             reference.type === 'file' ? 'codicon-file' : 
                             'codicon-folder'}`;
        refTag.appendChild(icon);
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = reference.name;
        refTag.appendChild(nameSpan);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-reference';
        deleteBtn.innerHTML = '<i class="codicon codicon-close"></i>';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            refTag.remove();
        };
        refTag.appendChild(deleteBtn);
        
        referencesBar.appendChild(refTag);
    }

    // 发送消息
    function sendMessage() {
        const input = document.getElementById('message-input');
        if (!input || !input.value.trim()) return;
        
        const references = [];
        const refTags = document.querySelectorAll('.reference-tag');
        refTags.forEach(tag => {
            const name = tag.querySelector('span').textContent;
            references.push({
                name: name,
                type: tag.querySelector('.codicon-symbol-method') ? 'code' : 
                      tag.querySelector('.codicon-file') ? 'file' : 'folder'
            });
        });
        
        vscode.postMessage({
            type: 'sendMessage',
            content: input.value,
            references: references
        });
        
        input.value = '';
        
        // 清空引用栏
        const referencesBar = document.getElementById('references-bar');
        if (referencesBar) referencesBar.innerHTML = '';
    }

    // 按日期分组会话
    function groupSessionsByDate(sessions) {
        const grouped = {};
        
        sessions.forEach(session => {
            const date = new Date(session.lastActive).toLocaleDateString();
            if (!grouped[date]) {
                grouped[date] = [];
            }
            grouped[date].push(session);
        });
        
        return grouped;
    }
    render();
})();