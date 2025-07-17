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
        "--border-color": "rgb(210, 210, 218)",
        "--border-dark":'rgb(121, 121, 121)',
        "--shadow-light": "rgba(0, 0, 0, 0.1)",
        "--shadow-card": "rgba(0, 0, 0, 0.25)",
        "--inset-shadow": "rgba(40, 40, 40, 0.4)",
        "--hover-bg":'rgb(163, 163, 176)',
        "--hover-bg-lite": 'rgb(231, 233, 238)',
        "--button-bg": "#ececf5",
        "--toggle-bg": "#eff1f6;",
        "--disabled-opacity": "0.5",
        "--card-radius": "9px",
        "--input-radius": "6px",
        "--container-max-width": "1200px",
        "--image-width": "160px",
        "--bg-image": "none"
    },

    bluebird: {
        "--primary-color":'rgb(255, 30, 64)',
        "--secondary-color": "#4169e1",
        "--background-color":'rgb(221, 239, 255)',
        "--card-color":'rgb(216, 236, 255)',
        "--card-color-b": "#ddeeff",
        "--input-bg":'rgb(193, 228, 255)',
        "--comments-bg":'rgb(195, 227, 255)',
        "--suggestions-bg":'rgb(214, 235, 255)',
        "--text-color": 'rgb(2, 12, 111)',
        "--text-primary": "#light-gray",
        "--text-secondary": "#light-gray",
        "--light-text": "#4682b4",
        "--meta-text": "#5691c8",
        "--placeholder-bg": "#cce7ff",
        "--footie-color": "#6fa8dc",
        "--border-color": "rgb(135, 197, 255)",
        "--border-dark":'rgb(67, 155, 242)',
        "--shadow-light": "rgba(30, 144, 255, 0.1)",
        "--shadow-card": "rgba(1, 23, 44, 0.25)",
        "--inset-shadow": "rgba(0, 31, 63, 0.4)",
        "--hover-bg-lite":'rgb(189, 222, 255)',
        "--hover-bg": 'rgb(169, 212, 255)',
        "--button-bg":'rgb(189, 224, 255)',
        "--toggle-bg":"rgb(237, 242, 252);",
        "--disabled-opacity": "0.5",
        "--card-radius": "9px",
        "--input-radius": "6px",
        "--container-max-width": "1200px",
        "--image-width": "160px",
        "--bg-image": "none"
    },
    
    forest: {
        "--primary-color":'rgb(192, 18, 44)',
        "--secondary-color": 'rgb(131, 41, 41)',
        "--background-color":'rgb(38, 56, 51)',
        "--card-color": "rgb(11, 31, 27)",
        "--card-color-b": "#1a3d2a",
        "--input-bg":'rgb(27, 33, 32)',
        "--comments-bg": 'rgb(19, 50, 42)',
        "--suggestions-bg": "rgb(24, 46, 37)",
        "--text-color":'rgb(164, 237, 236)',
        "--text-primary": "#ffffff",
        "--text-secondary": "#d4eddb",
        "--light-text": 'rgb(65, 127, 111)',
        "--meta-text": "#8ab998",
        "--placeholder-bg": "#2f5d41",
        "--footie-color": "#688b75",
        "--border-color": "rgb(48, 84, 76)",
        "--border-dark":'rgb(77, 134, 114)',
        "--shadow-light": "rgba(0, 0, 0, 0.3)",
        "--shadow-card": "rgba(0, 0, 0, 0.5)",
        "--inset-shadow": 'var(--border-color)',
        "--hover-bg-lite":'rgba(50, 66, 60, 1)',
        "--button-bg":'rgb(34, 72, 56)',
        "--toggle-bg": "rgb(30, 55, 42)",
        "--disabled-opacity": "0.5",
        "--card-radius": "9px",
        "--input-radius": "6px",
        "--container-max-width": "1200px",
        "--image-width": "160px",

        "--bg-image": "url('../assets/forest.png')",
        "--bg-size": "cover",
        "--bg-position": "center",
        "--bg-repeat": "no-repeat",
        "--github-button svg": "invert(0)"
    }
};

function applyTheme(themeName) {
    const root = document.documentElement;
    Object.entries(themes[themeName]).forEach(([property, value]) => {
        root.style.setProperty(property, value);
    });
    document.body.classList.remove('forest-theme', 'bluebird-theme', 'default');

    if (themeName === 'forest') {
        document.body.classList.add('forest-theme');
        document.body.classList.remove('dark-mode');
    } 

    if (themeName === 'bluebird') {
        document.body.classList.add('bluebird-theme');
        document.body.classList.remove('dark-mode');
    } 

    if (themeName === 'default') {
        document.body.classList.add('default');
    } 

    localStorage.setItem('selectedTheme', themeName);
}

// Apply saved theme on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('selectedTheme');
    applyTheme(savedTheme);
});