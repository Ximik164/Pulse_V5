class StoriesManager {
    constructor() {
        this.apiBase = window.Api?.getBase() || window.location.origin;
        this.pendingStoryImage = null;
        this.bindEvents();
    }

    bindEvents() {
        document.getElementById('add-story-btn')?.addEventListener('click', () => this.showCreateStoryModal());
        document.getElementById('story-modal-close')?.addEventListener('click', () => this.closeModal());
        document.getElementById('story-modal-overlay')?.addEventListener('click', () => this.closeModal());
        document.getElementById('story-image-input')?.addEventListener('change', (e) => {
            this.pendingStoryImage = e.target.files[0] || null;
            const label = document.getElementById('story-image-label');
            if (label) {
                label.textContent = this.pendingStoryImage
                    ? `Фото: ${this.pendingStoryImage.name}`
                    : 'Фото не выбрано';
            }
        });
    }

    async loadStories() {
        const container = document.getElementById('stories-list');
        if (!container) return;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(`${this.apiBase}/api/stories`, {
                headers: { Authorization: `Bearer ${auth.getToken()}` },
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (!response.ok) return;

            const stories = await response.json();
            const byUser = new Map();
            stories.forEach((story) => {
                if (!byUser.has(story.userId)) byUser.set(story.userId, story);
            });

            container.querySelectorAll('.story-item-dynamic').forEach((el) => el.remove());

            byUser.forEach((story) => {
                const el = document.createElement('div');
                el.className = 'story-item story-item-dynamic';
                const name = story.author?.fullname || story.author?.username || 'User';
                const avatar = story.author?.avatarUrl
                    ? `<img src="${this.apiBase}${story.author.avatarUrl}" alt="">`
                    : name.substring(0, 1).toUpperCase();

                el.innerHTML = `
                    <div class="story-ring viewed">
                        <div class="story-avatar">${avatar}</div>
                    </div>
                    <span class="story-name">${this.escape(name.split(' ')[0])}</span>
                `;
                el.addEventListener('click', () => this.openStory(story));
                container.appendChild(el);
            });
        } catch (error) {
            console.error('Stories load error:', error);
            if (error.name === 'AbortError') {
                app?.showToast('Истории: таймаут. Проверьте интернет.', 'error');
            }
        }
    }

    showCreateStoryModal() {
        this.pendingStoryImage = null;
        window.app?.openModal(`
            <h3>Новая история (24 ч)</h3>
            <p class="modal-hint">Работает без WebSocket — только HTTP. На слабом интернете используйте короткий текст.</p>
            <textarea id="story-text-input" class="modal-input" rows="3" placeholder="Текст истории"></textarea>
            <button type="button" class="btn-secondary modal-file-btn" id="story-pick-image">Выбрать фото</button>
            <p class="modal-hint" id="story-image-label">Фото не выбрано (необязательно)</p>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" id="story-cancel">Отмена</button>
                <button type="button" class="btn-primary" id="story-publish">Опубликовать</button>
            </div>
        `);

        document.getElementById('story-cancel').onclick = () => window.app?.closeModal();
        document.getElementById('story-pick-image').onclick = () => {
            document.getElementById('story-image-input').click();
        };
        document.getElementById('story-publish').onclick = () => this.publishStory();
    }

    async publishStory() {
        const text = document.getElementById('story-text-input')?.value?.trim() || '';
        let imageBase64 = null;

        const publishBtn = document.getElementById('story-publish');
        if (publishBtn) {
            publishBtn.disabled = true;
            publishBtn.textContent = 'Загрузка…';
        }

        try {
            if (this.pendingStoryImage) {
                imageBase64 = await ChatManager.compressImageFile(this.pendingStoryImage, 720, 0.7);
            }

            if (!text && !imageBase64) {
                window.app?.showToast('Добавьте текст или фото', 'error');
                return;
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000);

            const response = await fetch(`${this.apiBase}/api/stories`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${auth.getToken()}`
                },
                body: JSON.stringify({ text, image: imageBase64 }),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (response.ok) {
                window.app?.closeModal();
                window.app?.showToast('История опубликована');
                this.loadStories();
            } else {
                const err = await response.json();
                window.app?.showToast(err.error || 'Ошибка публикации', 'error');
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                window.app?.showToast('Таймаут. Слабое соединение — попробуйте только текст.', 'error');
            } else {
                window.app?.showToast('Ошибка соединения', 'error');
            }
        } finally {
            if (publishBtn) {
                publishBtn.disabled = false;
                publishBtn.textContent = 'Опубликовать';
            }
        }
    }

    openStory(story) {
        const modal = document.getElementById('story-modal');
        const body = document.getElementById('story-modal-body');
        const author = story.author?.fullname || story.author?.username || 'Пользователь';

        let html = `<p class="story-author">${this.escape(author)}</p>`;
        if (story.imageUrl) {
            const token = auth.getToken();
            const src = `${this.apiBase}${story.imageUrl}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
            html += `<img src="${src}" class="story-view-image" alt="История" loading="lazy">`;
        }
        if (story.text) {
            html += `<p class="story-view-text">${this.escape(story.text)}</p>`;
        }

        body.innerHTML = html;
        modal.classList.add('active');
    }

    closeModal() {
        document.getElementById('story-modal')?.classList.remove('active');
    }

    escape(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }
}
