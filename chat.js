class ChatManager {
    constructor() {
        this.currentChat = null;
        this.chats = [];
        this.currentFilter = 'all';
        this.apiBase = window.Api?.getBase() || window.location.origin;
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 8;
        this.currentMessages = [];
        this.typingTimeout = null;
        this.typingHideTimeout = null;
        this.lastTypingSent = 0;
        this.connectionMonitor = null;
        this.init();
    }

    init() {
        this.bindEvents();
    }

    setServerHintVisible(visible) {
        const hint = document.getElementById('server-hint');
        if (hint) hint.hidden = !visible;
    }

    async isServerReachable() {
        return window.Api?.checkHealth() ?? false;
    }

    startConnectionMonitor() {
        if (this.connectionMonitor) clearInterval(this.connectionMonitor);
        this.syncConnection();
        this.connectionMonitor = setInterval(() => this.syncConnection(), 5000);
    }

    stopConnectionMonitor() {
        if (this.connectionMonitor) {
            clearInterval(this.connectionMonitor);
            this.connectionMonitor = null;
        }
    }

    async syncConnection() {
        if (!auth.getCurrentUser()) return;

        const serverOk = await this.isServerReachable();
        this.setServerHintVisible(!serverOk);

        if (!serverOk) {
            this.updateWebSocketStatus(false, 'server');
            return;
        }

        if (!this.socket) {
            this.connectWebSocket();
            return;
        }

        const state = this.socket.readyState;
        if (state === WebSocket.OPEN) {
            this.updateWebSocketStatus(true);
        } else if (state === WebSocket.CONNECTING) {
            this.updateWebSocketStatus(false, 'connecting');
        } else {
            this.connectWebSocket();
        }
    }

    bindEvents() {
        document.getElementById('back-to-chats').addEventListener('click', () => this.showChatList());
        document.getElementById('back-from-profile').addEventListener('click', () => this.showChatList());
        document.getElementById('back-from-contacts').addEventListener('click', () => this.showChatList());
        document.getElementById('back-from-settings').addEventListener('click', () => this.showChatList());

        document.getElementById('send-message').addEventListener('click', () => this.sendMessage());

        const messageInput = document.getElementById('message-input');
        messageInput.addEventListener('keydown', (e) => this.handleMessageKeydown(e));
        messageInput.addEventListener('input', () => this.handleTyping());

        document.getElementById('search-toggle').addEventListener('click', () => this.toggleSearch());
        document.getElementById('chat-search').addEventListener('input', (e) => this.searchChats(e.target.value));

        document.getElementById('chat-search-toggle').addEventListener('click', () => this.toggleMessageSearch());
        document.getElementById('message-search-input').addEventListener('input', (e) => {
            this.filterMessagesInChat(e.target.value);
        });

        document.querySelectorAll('.chat-list-tab').forEach((tab) => {
            tab.addEventListener('click', (e) => this.filterChats(e.target.dataset.tab));
        });

        document.getElementById('attach-image').addEventListener('click', () => {
            document.getElementById('chat-image-input').click();
        });
        document.getElementById('chat-image-input').addEventListener('change', (e) => {
            if (e.target.files[0]) this.sendImageFile(e.target.files[0]);
            e.target.value = '';
        });

        document.getElementById('view-group-members')?.addEventListener('click', () => {
            this.showGroupMembersModal();
        });

        const chatHeaderInfo = document.querySelector('#screen-chat .chat-header-info');
        chatHeaderInfo?.addEventListener('click', () => {
            if (this.currentChat?.type === 'group') this.showGroupMembersModal();
        });
        if (chatHeaderInfo) chatHeaderInfo.style.cursor = 'pointer';
    }

    static compressImageFile(file, maxWidth = 1024, quality = 0.82) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    const scale = Math.min(1, maxWidth / img.width);
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(img.width * scale);
                    canvas.height = Math.round(img.height * scale);
                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = reject;
                img.src = reader.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async sendImageFile(file) {
        if (!this.currentChat) {
            this.showErrorMessage('Сначала откройте чат');
            return;
        }
        try {
            const image = await ChatManager.compressImageFile(file);
            const tempMessage = {
                id: 'temp-' + Date.now(),
                text: '📷 Фото',
                chatId: this.currentChat.id,
                senderId: auth.getCurrentUser().id,
                timestamp: new Date().toISOString(),
                messageType: 'image',
                imageUrl: image,
                sender: {
                    id: auth.getCurrentUser().id,
                    username: auth.getCurrentUser().username,
                    fullname: auth.getCurrentUser().fullname
                }
            };
            this.addMessageToChat(tempMessage, 'sending');

            if (this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({
                    type: 'send_message',
                    chatId: this.currentChat.id,
                    messageType: 'image',
                    image
                }));
            } else {
                const response = await fetch(`${this.apiBase}/api/chats/${this.currentChat.id}/messages`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${auth.getToken()}`
                    },
                    body: JSON.stringify({ messageType: 'image', image })
                });
                if (!response.ok) throw new Error('upload failed');
                const message = await response.json();
                this.replaceTempMessage(message);
            }
            this.loadChats();
        } catch (error) {
            console.error('Image send error:', error);
            this.showErrorMessage('Не удалось отправить фото');
        }
    }

    markChatAsRead() {
        if (!this.currentChat || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
        this.socket.send(JSON.stringify({
            type: 'mark_read',
            chatId: this.currentChat.id
        }));
    }

    setMessageStatus(messageId, status) {
        const el = document.querySelector(`[data-message-id="${messageId}"] .msg-status`);
        if (!el) return;
        el.dataset.status = status;
        if (status === 'sending') el.textContent = '…';
        if (status === 'sent') el.textContent = '✓';
        if (status === 'delivered') el.textContent = '✓✓';
        if (status === 'read') {
            el.textContent = '✓✓';
            el.classList.add('read');
        }
    }

    handleMessageKeydown(e) {
        const enterSend = window.app?.getSettings()?.enterSend !== false;
        if (e.key === 'Enter' && enterSend && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
        }
    }

    handleTyping() {
        if (!this.currentChat || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;

        const now = Date.now();
        if (now - this.lastTypingSent < 2000) return;
        this.lastTypingSent = now;

        this.socket.send(JSON.stringify({
            type: 'typing',
            chatId: this.currentChat.id
        }));
    }

    showTypingIndicator(fullname) {
        const el = document.getElementById('typing-indicator');
        if (!el) return;
        el.textContent = `${fullname} печатает…`;
        el.style.display = 'block';

        if (this.typingHideTimeout) clearTimeout(this.typingHideTimeout);
        this.typingHideTimeout = setTimeout(() => {
            el.textContent = '';
            el.style.display = 'none';
        }, 3000);
    }

    async connectWebSocket() {
        if (!auth.getCurrentUser() || !auth.getToken()) return;

        const serverOk = await this.isServerReachable();
        if (!serverOk) {
            this.setServerHintVisible(true);
            this.updateWebSocketStatus(false, 'server');
            return;
        }

        if (this.socket) {
            this.socket.close();
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.Api?.wsHost() || window.location.host;
        const wsUrl = `${protocol}//${wsHost}/ws`;

        this.updateWebSocketStatus(false, 'connecting');
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            this.reconnectAttempts = 0;
            this.updateWebSocketStatus(false, 'connecting');
            this.socket.send(JSON.stringify({
                type: 'authenticate',
                token: auth.getToken()
            }));
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (error) {
                console.error('WebSocket parse error:', error);
            }
        };

        this.socket.onclose = () => {
            this.updateWebSocketStatus(false, 'ws');
            if (auth.getCurrentUser() && this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
                setTimeout(() => {
                    this.reconnectAttempts++;
                    this.connectWebSocket();
                }, delay);
            }
        };

        this.socket.onerror = () => this.updateWebSocketStatus(false, 'ws');

        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
            if (this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ type: 'ping' }));
            }
        }, 20000);
    }

    disconnectWebSocket() {
        this.stopConnectionMonitor();
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.updateWebSocketStatus(false, 'ws');
    }

    updateWebSocketStatus(connected, mode = '') {
        const dot = document.getElementById('connection-dot');
        if (!dot) return;

        const isConnecting = mode === 'connecting';
        dot.classList.toggle('online', connected);
        dot.classList.toggle('offline', !connected && !isConnecting);
        dot.classList.toggle('connecting', isConnecting);

        if (connected) {
            dot.title = 'Подключено — сообщения в реальном времени';
        } else if (mode === 'server') {
            dot.title = 'Сервер не запущен. Запустите npm start и откройте http://localhost:3000';
        } else if (mode === 'connecting') {
            dot.title = 'Подключение...';
        } else if (mode === 'ws') {
            dot.title = 'Real-time переподключается. Чаты работают через HTTP';
        } else {
            dot.title = 'Нет real-time соединения';
        }
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'authenticated':
                this.updateWebSocketStatus(true);
                this.setServerHintVisible(false);
                this.loadChats();
                break;
            case 'message_sent':
                this.replaceTempMessage(data.message);
                this.setMessageStatus(data.message.id, 'sent');
                this.loadChats();
                break;
            case 'new_message':
                this.handleNewMessage(data.message);
                break;
            case 'chat_messages':
                if (this.currentChat?.id === data.chatId) {
                    this.renderMessages(data.messages);
                    this.markChatAsRead();
                }
                break;
            case 'user_online':
            case 'user_offline':
                this.updateUserStatus(data.userId, data.type === 'user_online');
                break;
            case 'user_typing':
                if (this.currentChat?.id === data.chatId && data.userId !== auth.getCurrentUser()?.id) {
                    this.showTypingIndicator(data.fullname || 'Собеседник');
                }
                break;
            case 'message_delivered':
                if (this.currentChat?.id === data.chatId) {
                    this.setMessageStatus(data.messageId, 'delivered');
                }
                break;
            case 'messages_read':
                if (this.currentChat?.id === data.chatId) {
                    (data.messageIds || []).forEach((id) => this.setMessageStatus(id, 'read'));
                }
                break;
            case 'error':
                this.updateWebSocketStatus(false, 'ws');
                if (data.message?.includes('токен') || data.message?.includes('Токен')) {
                    window.app?.showToast('Сессия устарела — выйдите и войдите снова', 'error');
                } else {
                    this.showErrorMessage(data.message || 'Ошибка WebSocket');
                }
                break;
            default:
                break;
        }
    }

    async loadChats() {
        try {
            const response = await fetch(`${this.apiBase}/api/chats`, {
                headers: { Authorization: `Bearer ${auth.getToken()}` }
            });

            if (response.ok) {
                this.chats = await response.json();
                this.renderChats();
            }
        } catch (error) {
            console.error('Error loading chats:', error);
        }
    }

    getFilteredChats() {
        if (this.currentFilter === 'personal') {
            return this.chats.filter((c) => c.type === 'private');
        }
        if (this.currentFilter === 'groups') {
            return this.chats.filter((c) => c.type === 'group');
        }
        return this.chats;
    }

    renderChats() {
        const chatList = document.getElementById('chat-list');
        const filtered = this.getFilteredChats();
        chatList.innerHTML = '';

        if (filtered.length === 0) {
            chatList.innerHTML = '<li class="empty-state">Чатов в этой категории нет</li>';
            return;
        }

        filtered.forEach((chat) => {
            const lastMessage = chat.lastMessage || { text: 'Нет сообщений', timestamp: new Date().toISOString() };
            const time = this.formatTime(lastMessage.timestamp);
            const avatarUser = chat.type === 'private' && chat.peerUser
                ? chat.peerUser
                : { fullname: chat.name, username: chat.name };

            const chatItem = document.createElement('li');
            chatItem.className = 'chat-item';
            if (this.currentChat?.id === chat.id) {
                chatItem.classList.add('active');
            }

            const photo = Avatar.createElement(
                avatarUser,
                chat.type === 'group' ? 'chat-item-photo group-photo' : 'chat-item-photo'
            );
            chatItem.appendChild(photo);

            const info = document.createElement('div');
            info.className = 'chat-item-info';
            info.innerHTML = `
                <div class="chat-item-header">
                    <span class="name">${this.escapeHtml(chat.name)}</span>
                    <span class="time">${time}</span>
                </div>
                <div class="chat-item-message">
                    <p>${this.escapeHtml(lastMessage.text)}</p>
                </div>
            `;
            chatItem.appendChild(info);

            chatItem.addEventListener('click', () => this.openChat(chat));
            chatList.appendChild(chatItem);
        });
    }

    async openChat(chat) {
        this.currentChat = chat;
        document.getElementById('chat-with-name').textContent = chat.name;
        const memberCount = chat.participants?.length || 0;
        document.getElementById('chat-status').textContent =
            chat.type === 'group' ? `группа · ${memberCount} уч.` : 'личный чат';
        document.getElementById('chat-status').className = 'status-online';

        const isGroup = chat.type === 'group';
        const inviteBtn = document.getElementById('invite-to-group');
        const membersBtn = document.getElementById('view-group-members');
        if (inviteBtn) inviteBtn.style.display = isGroup ? 'block' : 'none';
        if (membersBtn) membersBtn.style.display = isGroup ? 'block' : 'none';

        const headerInfo = document.querySelector('#screen-chat .chat-header-info');
        if (headerInfo) {
            headerInfo.style.cursor = isGroup ? 'pointer' : 'default';
            headerInfo.title = isGroup ? 'Нажмите, чтобы открыть участников' : '';
        }

        const typingEl = document.getElementById('typing-indicator');
        if (typingEl) {
            typingEl.textContent = '';
            typingEl.style.display = 'none';
        }

        const msgSearch = document.getElementById('chat-message-search');
        const msgSearchInput = document.getElementById('message-search-input');
        if (msgSearch) msgSearch.style.display = 'none';
        if (msgSearchInput) msgSearchInput.value = '';

        window.app?.showScreen('screen-chat');

        const loading = document.getElementById('loading-messages');
        if (loading) loading.style.display = 'flex';

        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'request_messages',
                chatId: chat.id
            }));
        } else {
            await this.loadMessages(chat.id);
        }

        document.getElementById('message-input').focus();
        this.renderChats();
        setTimeout(() => this.markChatAsRead(), 500);
    }

    async loadMessages(chatId) {
        try {
            const response = await fetch(`${this.apiBase}/api/chats/${chatId}/messages`, {
                headers: { Authorization: `Bearer ${auth.getToken()}` }
            });

            if (response.ok) {
                this.renderMessages(await response.json());
                this.markChatAsRead();
            } else {
                this.showErrorMessage('Ошибка загрузки сообщений');
            }
        } catch (error) {
            console.error('Error loading messages:', error);
            this.showErrorMessage('Ошибка соединения');
        }
    }

    renderMessages(messages) {
        this.currentMessages = messages;
        const chatMessages = document.getElementById('chat-messages');
        const loadingIndicator = document.getElementById('loading-messages');

        if (loadingIndicator) loadingIndicator.style.display = 'none';

        chatMessages.innerHTML = '';

        if (!messages.length) {
            chatMessages.innerHTML = '<div class="empty-state">Нет сообщений. Напишите первым!</div>';
            return;
        }

        messages.forEach((message) => {
            chatMessages.appendChild(this.createMessageElement(message));
        });

        chatMessages.scrollTop = chatMessages.scrollHeight;

        const query = document.getElementById('message-search-input')?.value;
        if (query) this.filterMessagesInChat(query);
    }

    mediaUrl(path) {
        if (!path) return '';
        const token = auth.getToken();
        const sep = path.includes('?') ? '&' : '?';
        return `${this.apiBase}${path}${token ? `${sep}token=${encodeURIComponent(token)}` : ''}`;
    }

    renderMessageBody(message) {
        if (message.messageType === 'image' && message.imageUrl) {
            const src = message.imageUrl.startsWith('data:')
                ? message.imageUrl
                : this.mediaUrl(message.imageUrl);
            return `<img src="${src}" class="chat-image" alt="Фото">`;
        }
        return this.escapeHtml(message.text || '');
    }

    createMessageElement(message, statusOverride) {
        const container = document.createElement('div');
        const currentUser = auth.getCurrentUser();
        const isSent = message.senderId === currentUser?.id;

        container.className = `chat-message-container ${isSent ? 'sent' : 'received'}`;
        container.setAttribute('data-message-id', message.id);

        const time = this.formatTime(message.timestamp);
        const senderName = message.sender?.fullname || message.sender?.username || 'Система';
        const body = this.renderMessageBody(message);

        if (isSent) {
            const status = statusOverride || (String(message.id).startsWith('temp-') ? 'sending' : 'sent');
            const statusIcon = status === 'sending' ? '…' : status === 'delivered' ? '✓✓' : status === 'read' ? '✓✓' : '✓';
            const readClass = status === 'read' ? ' read' : '';
            container.innerHTML = `
                <div class="chat-message-bubble">${body}</div>
                <div class="chat-message-meta">
                    <span class="chat-message-time">${time}</span>
                    <span class="msg-status${readClass}" data-status="${status}">${statusIcon}</span>
                </div>
            `;
        } else {
            const avatarEl = Avatar.createElement(message.sender || { fullname: senderName }, 'message-avatar');
            const wrap = document.createElement('div');
            wrap.className = 'message-sender-info';
            wrap.appendChild(avatarEl);
            const content = document.createElement('div');
            content.className = 'message-content';
            content.innerHTML = `
                <div class="sender-name">${this.escapeHtml(senderName)}</div>
                <div class="chat-message-bubble">${body}</div>
                <div class="chat-message-time">${time}</div>
            `;
            wrap.appendChild(content);
            container.appendChild(wrap);
        }

        return container;
    }

    async showGroupMembersModal() {
        if (!this.currentChat || this.currentChat.type !== 'group') return;

        window.app?.openModal('<p class="empty-state">Загрузка участников...</p>');

        try {
            const response = await fetch(`${this.apiBase}/api/chats/${this.currentChat.id}/members`, {
                headers: { Authorization: `Bearer ${auth.getToken()}` }
            });

            if (!response.ok) throw new Error('load failed');

            const members = await response.json();
            const currentId = auth.getCurrentUser()?.id;

            const rows = members.map((user) => {
                const isSelf = user.id === currentId;
                const status = user.isOnline ? 'в сети' : 'офлайн';
                const statusClass = user.isOnline ? 'online' : 'offline';
                return `
                    <li class="member-item" data-user-id="${user.id}">
                        <div class="member-avatar-slot"></div>
                        <div class="member-info">
                            <strong>${this.escapeHtml(user.fullname || user.username)}${isSelf ? ' <span class="contact-you">(вы)</span>' : ''}</strong>
                            <p>@${this.escapeHtml(user.username)}</p>
                            <span class="contact-status ${statusClass}">${status}</span>
                        </div>
                        ${!isSelf ? '<button type="button" class="btn-small member-msg-btn">Написать</button>' : ''}
                    </li>
                `;
            }).join('');

            window.app?.openModal(`
                <h3>Участники · ${this.escapeHtml(this.currentChat.name)}</h3>
                <p class="modal-hint">${members.length} ${members.length === 1 ? 'участник' : members.length < 5 ? 'участника' : 'участников'}</p>
                <ul class="member-list">${rows}</ul>
                <div class="modal-actions">
                    <button type="button" class="btn-secondary" id="modal-close-members">Закрыть</button>
                </div>
            `);

            document.querySelectorAll('.member-item').forEach((row, i) => {
                const slot = row.querySelector('.member-avatar-slot');
                const photo = Avatar.createElement(members[i], 'member-avatar');
                slot.replaceWith(photo);

                const msgBtn = row.querySelector('.member-msg-btn');
                if (msgBtn) {
                    msgBtn.addEventListener('click', () => {
                        window.app?.closeModal();
                        this.startPrivateChat(members[i].id);
                    });
                }
            });

            document.getElementById('modal-close-members')?.addEventListener('click', () => window.app?.closeModal());
        } catch (error) {
            console.error('Members load error:', error);
            window.app?.openModal('<p class="empty-state">Не удалось загрузить участников</p>');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    addMessageToChat(message, statusOverride) {
        const existing = document.querySelector(`[data-message-id="${message.id}"]`);
        if (existing) return;

        const el = this.createMessageElement(message, statusOverride);
        document.getElementById('chat-messages').appendChild(el);
        const box = document.getElementById('chat-messages');
        box.scrollTop = box.scrollHeight;
    }

    replaceTempMessage(message) {
        const temp = document.querySelector('[data-message-id^="temp-"]');
        if (temp) temp.remove();
        if (this.currentChat?.id === message.chatId) {
            this.addMessageToChat(message, 'sent');
        }
    }

    async sendMessage() {
        const input = document.getElementById('message-input');
        const sendButton = document.getElementById('send-message');
        const text = input.value.trim();

        if (!text || !this.currentChat) return;

        input.disabled = true;
        sendButton.disabled = true;

        try {
            input.value = '';

            const tempMessage = {
                id: 'temp-' + Date.now(),
                text,
                chatId: this.currentChat.id,
                senderId: auth.getCurrentUser().id,
                timestamp: new Date().toISOString(),
                sender: {
                    id: auth.getCurrentUser().id,
                    username: auth.getCurrentUser().username,
                    fullname: auth.getCurrentUser().fullname
                }
            };
            this.addMessageToChat(tempMessage, 'sending');

            if (this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({
                    type: 'send_message',
                    chatId: this.currentChat.id,
                    text
                }));
            } else {
                const message = await this.sendMessageViaHTTP(text);
                this.replaceTempMessage(message);
                this.loadChats();
            }
        } catch (error) {
            console.error('Send error:', error);
            input.value = text;
            this.showErrorMessage('Не удалось отправить сообщение');
        } finally {
            input.disabled = false;
            sendButton.disabled = false;
            input.focus();
        }
    }

    async sendMessageViaHTTP(text) {
        const response = await fetch(`${this.apiBase}/api/chats/${this.currentChat.id}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${auth.getToken()}`
            },
            body: JSON.stringify({ text })
        });

        if (!response.ok) throw new Error('HTTP send failed');
        return response.json();
    }

    handleNewMessage(message) {
        if (this.currentChat?.id === message.chatId) {
            const temp = document.querySelector('[data-message-id^="temp-"]');
            if (temp && message.senderId === auth.getCurrentUser()?.id) {
                this.replaceTempMessage(message);
            } else {
                this.addMessageToChat(message);
            }
            this.currentMessages.push(message);
        } else if (message.senderId !== auth.getCurrentUser()?.id) {
            this.playNotificationSound();
        }
        this.loadChats();
    }

    playNotificationSound() {
        window.NotificationSound?.play();
    }

    toggleMessageSearch() {
        const box = document.getElementById('chat-message-search');
        const visible = box.style.display === 'block';
        box.style.display = visible ? 'none' : 'block';
        if (!visible) {
            document.getElementById('message-search-input').focus();
        } else {
            document.getElementById('message-search-input').value = '';
            this.filterMessagesInChat('');
        }
    }

    filterMessagesInChat(query) {
        const term = query.trim().toLowerCase();
        document.querySelectorAll('.chat-message-container').forEach((el) => {
            const text = el.querySelector('.chat-message-bubble')?.textContent.toLowerCase() || '';
            el.style.display = !term || text.includes(term) ? '' : 'none';
        });
    }

    showChatList() {
        window.app?.showScreen('screen-main');
        this.currentChat = null;
        const inviteBtn = document.getElementById('invite-to-group');
        if (inviteBtn) inviteBtn.style.display = 'none';
        this.loadChats();
    }

    toggleSearch() {
        const searchContainer = document.getElementById('search-container');
        const isVisible = searchContainer.style.display === 'block';
        searchContainer.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) document.getElementById('chat-search').focus();
    }

    searchChats(query) {
        const searchTerm = query.toLowerCase();
        document.querySelectorAll('.chat-item').forEach((item) => {
            const name = item.querySelector('.name')?.textContent.toLowerCase() || '';
            const message = item.querySelector('.chat-item-message p')?.textContent.toLowerCase() || '';
            item.style.display = (name.includes(searchTerm) || message.includes(searchTerm)) ? 'flex' : 'none';
        });
    }

    filterChats(filter) {
        this.currentFilter = filter;
        document.querySelectorAll('.chat-list-tab').forEach((tab) => {
            tab.classList.toggle('active', tab.dataset.tab === filter);
        });
        this.renderChats();
    }

    updateUserStatus(userId, isOnline) {
        if (this.currentChat?.participants?.includes(userId)) {
            const statusElement = document.getElementById('chat-status');
            statusElement.textContent = isOnline ? 'в сети' : 'не в сети';
            statusElement.className = isOnline ? 'status-online' : 'status-offline';
        }
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 24 * 60 * 60 * 1000) {
            return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
        if (diff < 48 * 60 * 60 * 1000) {
            return `вчера в ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
        }
        return date.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    showToast(text, type = 'error') {
        const div = document.createElement('div');
        div.className = type === 'success' ? 'toast-success' : 'toast-error';
        div.textContent = text;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 3000);
    }

    showErrorMessage(text) {
        this.showToast(text, 'error');
    }

    async startPrivateChat(targetUserId) {
        try {
            const response = await fetch(`${this.apiBase}/api/chats/private`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${auth.getToken()}`
                },
                body: JSON.stringify({ targetUserId })
            });

            if (response.ok) {
                const chat = await response.json();
                await this.loadChats();
                this.openChat(chat);
                window.app?.showScreen('screen-chat');
            } else {
                const err = await response.json();
                this.showErrorMessage(err.error || 'Ошибка создания чата');
            }
        } catch (error) {
            console.error('Private chat error:', error);
            this.showErrorMessage('Ошибка соединения');
        }
    }
}
