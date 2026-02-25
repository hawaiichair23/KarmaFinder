const style = document.createElement('style');
style.textContent = `
    [data-page="search"] #search-results {
        margin-top: 35px;
    }

    .search-back-button {
        background: none;
        border: none;
        padding-right: 12px;
        padding-left: 1px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-primary);
    }

    .search-back-button:active {
        opacity: 0.6;
    }

    /* Hide home content on search page */
    [data-page="search"] .search-container,
    [data-page="search"] header,
    [data-page="search"] .mobile-logo-row,
    [data-page="search"] #mobileLoginBtn {
        display: none !important;
    }
`;
document.head.appendChild(style);

// Search page handler
if (window.location.search.includes('page=search')) {
    document.body.setAttribute('data-page', 'search');

    // Ensure URL is set for initial state
    if (!window.location.search.includes('q=')) {
        const params = new URLSearchParams();
        params.set('page', 'search');
        history.replaceState({}, '', `?${params.toString()}`);
    }

    const mobileTopBar = document.querySelector('.mobile-top-bar');
    const searchRow = mobileTopBar?.querySelector('.mobile-search-row');

    if (searchRow) {
        const urlParams = new URLSearchParams(window.location.search);
        const hasQuery = urlParams.has('q');

        searchRow.innerHTML = `
            <button id="back-button" class="search-back-button" style="display: ${hasQuery ? 'flex' : 'none'};">
                <svg width="27" height="27" viewBox="0 0 24 24" fill="none">
                    <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
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

        // Back button handler
        document.getElementById('back-button').addEventListener('click', () => {
            window.history.back();
        });

        const backButton = document.getElementById('back-button');
        const searchForm = searchRow.querySelector('#search-form');
        const searchInput = searchRow.querySelector('#search-input');

        // Handle search submission
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const query = searchInput.value.trim();
            if (query) {
                backButton.style.display = 'flex';
                const suggestionsDiv = document.getElementById('suggestions');
                if (suggestionsDiv) suggestionsDiv.style.display = 'none';
                handleSearchRequest();
            }
        });

        if (searchInput) {
            searchInput.addEventListener('blur', () => {
                const suggestionsDiv = document.getElementById('suggestions');
                if (suggestionsDiv) {
                    suggestionsDiv.style.display = 'none';
                }
            });
        }

        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.id = 'suggestions';
        mobileTopBar.appendChild(suggestionsDiv);
    }

    if (typeof window.englishWords !== 'undefined') {
        setupSearchSuggestions('search-input', 'suggestions', window.englishWords);
    }

    window.addEventListener('popstate', () => {
        const urlParams = new URLSearchParams(window.location.search);

        if (urlParams.get('page') === 'search') {
            const hasQuery = urlParams.has('q');

            if (hasQuery) {
                const backButton = document.getElementById('back-button');
                if (backButton) backButton.style.display = 'flex';
                handleSearchRequest();
            } else {
                const backButton = document.getElementById('back-button');
                if (backButton) backButton.style.display = 'none';
                const resultsContainer = document.querySelector('.results-container');
                if (resultsContainer) resultsContainer.innerHTML = '';
            }
        }
    });
}
