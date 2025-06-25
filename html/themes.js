const themes = {
    default: {
        "--primary-color": "#ff4500",
        "--secondary-color": "#0079d3",
        "--background-color": "#f6f6fbf8",
        "--card-color": "#f9fafe",
        "--card-color-b": "#f5f5fa",
        "--input-bg": "#eeedf3",
        "--comments-bg": "#f1f1f6",
        "--suggestions-bg": "#f2f1f7",
        "--text-color": "#1a1a1b",
        "--text-primary": "#15121c",
        "--text-secondary": "#29213b",
        "--light-text": "#787c7e",
        "--meta-text": "#606065",
        "--placeholder-bg": "#f1f1f6",
        "--footie-color": "#a1a1a1",
        "--border-color": "rgb(210, 210, 213)",
        "--border-dark": "#d6d6d6",
        "--shadow-light": "rgba(0, 0, 0, 0.1)",
        "--shadow-card": "rgba(0, 0, 0, 0.25)",
        "--inset-shadow": "rgba(40, 40, 40, 0.4)",
        "--hover-bg": "#dfdfe9",
        "--button-bg": "#ececf5",
        "--toggle-bg": "#eff1f6;",
        "--disabled-opacity": "0.5",
        "--card-radius": "9px",
        "--input-radius": "6px",
        "--container-max-width": "1200px",
        "--image-width": "160px"
    },

    ocean: {
        "--primary-color":'rgb(255, 30, 64)',
        "--secondary-color": "#4169e1",
        "--background-color":'rgb(234, 245, 255)',
        "--card-color":'rgb(226, 241, 255)',
        "--card-color-b": "#ddeeff",
        "--input-bg": "#d6ebff",
        "--comments-bg": '#cce7ff',
        "--suggestions-bg":'rgb(214, 235, 255)',
        "--text-color": "#003366",
        "--text-primary": "#001a33",
        "--text-secondary": "#002244",
        "--light-text": "#4682b4",
        "--meta-text": "#5691c8",
        "--placeholder-bg": "#cce7ff",
        "--footie-color": "#6fa8dc",
        "--border-color": "rgb(173, 216, 255)",
        "--border-dark": "#99ccff",
        "--shadow-light": "rgba(30, 144, 255, 0.1)",
        "--shadow-card": "rgba(1, 23, 44, 0.25)",
        "--inset-shadow": "rgba(0, 31, 63, 0.4)",
        "--hover-bg": "#b3d9ff",
        "--button-bg": "#cce7ff",
        "--toggle-bg":"rgb(237, 242, 252);",
        "--disabled-opacity": "0.5",
        "--card-radius": "9px",
        "--input-radius": "6px",
        "--container-max-width": "1200px",
        "--image-width": "160px"
    },
    
    forest: {
        "--primary-color": "#8B2635",
        "--secondary-color": "#177548",
        "--background-color": "#1B4332",
        "--card-color": "rgb(26, 81, 58)",
        "--card-color-b": "#1a3d2a",
        "--input-bg": "#285a37",
        "--comments-bg": "#2f5d41",
        "--suggestions-bg": "rgb(25, 50, 37)",
        "--text-color": "#e8f5ea",
        "--text-primary": "#ffffff",
        "--text-secondary": "#d4eddb",
        "--light-text": "#9fc9ac",
        "--meta-text": "#8ab998",
        "--placeholder-bg": "#2f5d41",
        "--footie-color": "#688b75",
        "--border-color": "rgb(55, 80, 67)",
        "--border-dark": "#456b54",
        "--shadow-light": "rgba(0, 0, 0, 0.3)",
        "--shadow-card": "rgba(0, 0, 0, 0.5)",
        "--inset-shadow": "rgba(0, 0, 0, 0.6)",
        "--hover-bg": "#356047",
        "--button-bg": "#285a37",
        "--toggle-bg": "rgb(30, 55, 42)",
        "--disabled-opacity": "0.5",
        "--card-radius": "9px",
        "--input-radius": "6px",
        "--container-max-width": "1200px",
        "--image-width": "160px"
    }
};

function applyTheme(themeName) {
    const root = document.documentElement;
    Object.entries(themes[themeName]).forEach(([property, value]) => {
        root.style.setProperty(property, value);
    });
    localStorage.setItem('selectedTheme', themeName);
}

// Apply saved theme on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('selectedTheme') || 'default';
    applyTheme(savedTheme);
});