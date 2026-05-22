/** Звук уведомлений: стандартный или свой (localStorage) */
const NotificationSound = {
    STORAGE_KEY: 'pulse-custom-sound',
    NAME_KEY: 'pulse-custom-sound-name',
    MAX_BYTES: 1024 * 1024,

    DEFAULT_SRC: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onp6WjH+BhYqFbF1fdH2Onp6WjH+BhYqFbF1fdH2Onp6WjA==',

    hasCustom() {
        return Boolean(localStorage.getItem(this.STORAGE_KEY));
    },

    getCustomSrc() {
        return localStorage.getItem(this.STORAGE_KEY);
    },

    getName() {
        return localStorage.getItem(this.NAME_KEY) || 'Стандартный короткий сигнал';
    },

    getSrc() {
        return this.getCustomSrc() || this.DEFAULT_SRC;
    },

    async loadFile(file) {
        if (!file) throw new Error('Файл не выбран');
        if (!file.type.startsWith('audio/')) {
            throw new Error('Нужен аудиофайл (MP3, WAV, OGG)');
        }
        if (file.size > this.MAX_BYTES) {
            throw new Error('Файл слишком большой. Максимум 1 МБ — обрежьте звук или сожмите MP3.');
        }

        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
            reader.readAsDataURL(file);
        });

        return { dataUrl, name: file.name };
    },

    save(dataUrl, name) {
        localStorage.setItem(this.STORAGE_KEY, dataUrl);
        localStorage.setItem(this.NAME_KEY, name);
    },

    clear() {
        localStorage.removeItem(this.STORAGE_KEY);
        localStorage.removeItem(this.NAME_KEY);
    },

    play(force = false) {
        if (!force && !window.app?.getSettings()?.sounds) return;
        try {
            const audio = new Audio(this.getSrc());
            audio.volume = 0.55;
            audio.play().catch(() => {});
        } catch {
            /* ignore */
        }
    },

    updateSettingsUi() {
        const nameEl = document.getElementById('custom-sound-name');
        if (nameEl) {
            nameEl.textContent = this.hasCustom()
                ? `Свой: ${this.getName()}`
                : 'Сейчас: стандартный сигнал';
        }
    }
};

window.NotificationSound = NotificationSound;
