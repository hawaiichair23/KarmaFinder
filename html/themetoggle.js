
document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');

    if (themeIcon) {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        const isDark = savedTheme === 'dark';
        themeIcon.src = isDark ? '../assets/sun.png' : '../assets/moon.png';
        themeIcon.alt = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.add('theme-transition');

            const dark = document.body.classList.toggle('dark-mode');
            localStorage.setItem('theme', dark ? 'dark' : 'light');

            if (themeIcon) {
                themeIcon.src = dark ? '../assets/sun.png' : '../assets/moon.png';
                themeIcon.alt = dark ? 'Switch to light mode' : 'Switch to dark mode';
            }

            setTimeout(() => {
                document.body.classList.remove('theme-transition');
            }, 300);
        });
    }

    window.addEventListener('load', () => {
        document.body.classList.add('is-loaded');
    });

    setTimeout(() => {
        document.body.classList.add('is-loaded');
    }, 500);
});
