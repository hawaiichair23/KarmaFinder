const style = document.createElement('style');
style.textContent = `
    [data-page="search"] .results-container {
        margin-top: 35px;
    }

    .search-back-button {
        background: none;
        border: none;
        padding-right: 9px;
        padding-left: 0px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-primary);
    }

    .search-back-button:active {
        opacity: 0.6;
    }

    #search-tab-ui {
        display: none;
        flex: 1;
        align-items: center;
    }

    [data-page="search"] #search-tab-ui {
        display: flex;
    }

    [data-page="search"] .mobile-hamburger,
    [data-page="search"] .mobile-logo-row,
    [data-page="search"] #mobileLoginBtn {
        display: none !important;
    }
`;
document.head.appendChild(style);

function initSearchTab() {
    const mobileTopBar = document.querySelector('.mobile-top-bar');
    const searchRow = mobileTopBar?.querySelector('.mobile-search-row');

    if (!searchRow) return;

    // Only build the UI once
    if (document.getElementById('search-tab-ui')) return;

    const urlParams = new URLSearchParams(window.location.search);
    const hasQuery = urlParams.has('q');

    const searchUI = document.createElement('div');
    searchUI.id = 'search-tab-ui';
    searchUI.innerHTML = `
        <button id="back-button" class="search-back-button" style="display: ${hasQuery ? 'flex' : 'none'};">
            <svg width="33" height="33" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button>
        <form id="search-form" style="flex: 1; display: contents;">
            <div class="search-input-container">
                <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="2"/>
                    <path d="m15.8 15.8 4.2 4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <input type="text" id="search-input" class="search-input" placeholder="Search Reddit">
            </div>
        </form>
    `;

    searchRow.appendChild(searchUI);

    const backButton = searchUI.querySelector('#back-button');
    const searchForm = searchUI.querySelector('#search-form');
    const searchInput = searchUI.querySelector('#search-input');

    backButton.addEventListener('click', () => {
        window.history.back();
    });

    window.addEventListener('search-started', () => {
        backButton.style.display = 'flex';
    });

    searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = searchInput.value.trim();
        if (query) {
            backButton.style.display = 'flex';
            handleSearchRequest();
            if (window.abortSearchSuggestions) window.abortSearchSuggestions();
        }
    });

    searchInput.addEventListener('blur', () => {
        const suggestionsDiv = document.getElementById('suggestions');
        if (suggestionsDiv) suggestionsDiv.style.display = 'none';
    });

    if (!document.getElementById('suggestions')) {
        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.id = 'suggestions';
        mobileTopBar.appendChild(suggestionsDiv);
    }
}

// Run on initial page load if arriving directly via URL
if (window.location.search.includes('page=search')) {
    document.body.setAttribute('data-page', 'search');
    initSearchTab();
}

// Run when switching to search tab
window.addEventListener('search-tab-init', () => {
    initSearchTab();
});
