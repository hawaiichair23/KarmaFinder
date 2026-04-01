const style = document.createElement('style');
style.textContent = `
    [data-page="search"] #search-results {
        margin-top: 0px;
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

    /* Hide home content on search page - mobile only */
    @media (max-width: 1024px) {
        [data-page="search"] .search-container,
        [data-page="search"] header,
        [data-page="search"] .mobile-logo-row,
        [data-page="search"] .mobile-hamburger,
        [data-page="search"] #mobileLoginBtn {
            display: none !important;
        }
    }
`;
document.head.appendChild(style);

// Wire up mobile search elements (always present in HTML now)
const mobileSearchInput = document.getElementById('mobile-search-input');

if (mobileSearchInput) {
    // Back button handler - delegated since button is dynamically injected
    document.addEventListener('click', (e) => {
        if (e.target.closest('#suggestions-back-btn')) {
            e.stopPropagation();
            if (window.KF && KF.isSubredditSearchMode()) {
                KF.closeSubredditSearch();
                return;
            }
            if (document.body.classList.contains('suggestions-active')) {
                if (window.closeMobileSuggestions) window.closeMobileSuggestions();
            } else {
                handleBackButton();
            }
        }
    });

    // Handle Enter key to search
    mobileSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = mobileSearchInput.value.trim();
            if (query) {
                if (window.KF && KF.isSubredditSearchMode()) {
                    KF.submitSubredditSearch(query);
                    return;
                }
                window.searchJustSubmitted = true;
                mobileSearchInput.blur();
                if (window.closeMobileSuggestions) window.closeMobileSuggestions();
                if (window.abortSearchSuggestionsRequest) window.abortSearchSuggestionsRequest();
                handleSearchRequest();
            }
        }
    });

    mobileSearchInput.addEventListener('blur', () => {
        if (window.searchJustSubmitted) { window.searchJustSubmitted = false; return; }
        if (window.KF && KF.isSubredditSearchMode()) return;
        if (window.closeMobileSuggestions) window.closeMobileSuggestions();
    });
}

// Wire subreddit search button
const subredditSearchBtn = document.getElementById('subreddit-search-btn');
if (subredditSearchBtn) {
    subredditSearchBtn.addEventListener('click', () => {
        if (window.KF) KF.openSubredditSearch(currentFilters.subreddit);
    });
}

// Handle popstate within search
window.addEventListener('popstate', () => {
    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.get('page') === 'search') {
        const hasQuery = urlParams.has('q');

        if (hasQuery) {
            handleSearchRequest(null, null, true);
        } else {
            const searchResults = document.getElementById('search-results');
            const searchPagination = document.getElementById('search-pagination');

            const swap = () => {
                if (searchResults) searchResults.innerHTML = '';
                if (searchPagination) searchPagination.innerHTML = '';
                if (mobileSearchInput) mobileSearchInput.value = '';
                document.body.classList.remove('has-results');
                initExploreGrid();
                const grid = document.getElementById('explore-grid');
                if (grid) grid.style.display = 'flex';
            };

            if (document.startViewTransition) {
                document.startViewTransition(swap);
            } else {
                swap();
            }
        }
    }
});
