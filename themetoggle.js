// /components/theme-toggle.js

document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('themeToggle');
    const icon = document.getElementById('themeIcon');

    // Set initial theme from localStorage
    try {
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-mode');
        }
    } catch (e) {
        console.error('Error accessing localStorage', e);
    }

    // Update icon on page load
    const isDark = document.body.classList.contains('dark-mode');
    if (icon) {
        icon.src = isDark ? 'sun.png' : 'moon.png';
        icon.alt = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    }

    // Toggle theme on button click
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.add('theme-transition');

            const dark = document.body.classList.toggle('dark-mode');
            localStorage.setItem('theme', dark ? 'dark' : 'light');

            if (icon) {
                icon.src = dark ? 'sun.png' : 'moon.png';
                icon.alt = dark ? 'Switch to light mode' : 'Switch to dark mode';
            }

            setTimeout(() => {
                document.body.classList.remove('theme-transition');
            }, 300);
        });
    }
});
