(function () {
    var STORAGE_KEY = 'omni_theme';
    var mediaQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

    function getPreference() {
        return localStorage.getItem(STORAGE_KEY) || 'dark';
    }

    function resolveTheme(preference) {
        if (preference === 'system') {
            return mediaQuery && mediaQuery.matches ? 'light' : 'dark';
        }
        return preference === 'light' ? 'light' : 'dark';
    }

    function applyTheme(preference, persist) {
        var resolved = resolveTheme(preference);

        document.documentElement.setAttribute('data-theme', resolved);
        document.documentElement.setAttribute('data-theme-preference', preference);

        if (document.body) {
            document.body.setAttribute('data-theme', resolved);
            document.body.setAttribute('data-theme-preference', preference);
        }

        if (persist !== false) {
            localStorage.setItem(STORAGE_KEY, preference);
        }

        var themeSelect = document.getElementById('themeSelect');
        if (themeSelect && themeSelect.value !== preference) {
            themeSelect.value = preference;
        }

        return resolved;
    }

    function bindThemeSelect() {
        var themeSelect = document.getElementById('themeSelect');
        if (!themeSelect) {
            return;
        }

        themeSelect.value = getPreference();
        themeSelect.addEventListener('change', function (event) {
            applyTheme(event.target.value, true);
        });
    }

    function handlePreferenceChange() {
        if (getPreference() === 'system') {
            applyTheme('system', false);
        }
    }

    window.OmniTheme = {
        getThemePreference: getPreference,
        setThemePreference: function (preference) {
            return applyTheme(preference, true);
        },
        getResolvedTheme: function () {
            return resolveTheme(getPreference());
        }
    };

    if (mediaQuery) {
        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handlePreferenceChange);
        } else if (typeof mediaQuery.addListener === 'function') {
            mediaQuery.addListener(handlePreferenceChange);
        }
    }

    window.addEventListener('storage', function (event) {
        if (event.key === STORAGE_KEY) {
            applyTheme(getPreference(), false);
        }
    });

    document.addEventListener('DOMContentLoaded', function () {
        applyTheme(getPreference(), false);
        bindThemeSelect();
    });
})();
