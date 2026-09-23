(function () {
    try {
        var preference = localStorage.getItem('omni_theme') || 'dark';
        var resolved = preference;

        if (preference === 'system') {
            resolved = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
                ? 'light'
                : 'dark';
        }

        document.documentElement.setAttribute('data-theme', resolved);
        document.documentElement.setAttribute('data-theme-preference', preference);
    } catch (error) {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.setAttribute('data-theme-preference', 'dark');
    }
})();
