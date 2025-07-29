document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('themeToggle');
    const icon = document.getElementById('themeIcon');

    // Function to update icon based on current theme
    function updateIcon() {
        try {
            const theme = localStorage.getItem('theme');
            const isDark = theme === 'dark' || document.body.classList.contains('dark-mode');

            if (icon) {
                icon.src = isDark ? '../assets/sun.png' : '../assets/moon.png';
                icon.alt = isDark ? 'Switch to light mode' : 'Switch to dark mode';
            }
        } catch (e) {
            // Fallback if localStorage isn't available
            if (icon) {
                icon.src = '../assets/moon.png';
                icon.alt = 'Switch to dark mode';
            }
        }
    }

    // Set initial icon
    updateIcon();

    // Toggle theme when button is clicked
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = document.body.classList.toggle('dark-mode');

            try {
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
            } catch (e) {
                // Handle localStorage errors silently
            }

            // Update icon immediately after toggle
            updateIcon();
        });
    }

    // Listen for storage changes from other pages
    window.addEventListener('storage', (e) => {
        if (e.key === 'theme') {
            const isDark = e.newValue === 'dark';
            document.body.classList.toggle('dark-mode', isDark);
            updateIcon();
        }
    });
});