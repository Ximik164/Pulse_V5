/** Переключение тёмной / светлой темы (localStorage: pulse-settings) */
const Theme = {
    getSettings() {
        try {
            const legacy = localStorage.getItem('quickchat-settings');
            if (legacy && !localStorage.getItem('pulse-settings')) {
                localStorage.setItem('pulse-settings', legacy);
            }
            return JSON.parse(localStorage.getItem('pulse-settings')) || {
                darkTheme: true,
                sounds: false,
                enterSend: true
            };
        } catch {
            return { darkTheme: true, sounds: false, enterSend: true };
        }
    },

    saveSettings(partial) {
        const settings = { ...this.getSettings(), ...partial };
        localStorage.setItem('pulse-settings', JSON.stringify(settings));
        return settings;
    },

    isDark() {
        return this.getSettings().darkTheme !== false;
    },

    apply() {
        document.body.classList.toggle('theme-light', !this.isDark());
        this.updateToggleButtons();
        const checkbox = document.getElementById('setting-dark-theme');
        if (checkbox) checkbox.checked = this.isDark();
    },

    toggle() {
        this.saveSettings({ darkTheme: !this.isDark() });
        this.apply();
    },

    updateToggleButtons() {
        const dark = this.isDark();
        document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = dark ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
            }
            const label = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
            btn.title = label;
            btn.setAttribute('aria-label', label);
        });
    },

    init() {
        this.apply();
        document.getElementById('theme-toggle-auth')?.addEventListener('click', () => this.toggle());
        document.getElementById('theme-toggle-main')?.addEventListener('click', () => this.toggle());
    }
};

window.Theme = Theme;
