
        const IMAGE_PROXY_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.startsWith('10.'))
                ? `http://${location.hostname}:3000`
                : 'https://karmafinder.onrender.com';
            const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.startsWith('10.'))
                ? `http://${location.hostname}:3000`
                : 'https://karmafinder.site';

        let searchTimeout = null;

        function preloadBookmarks(callback) {
            const authStatus = getAuthStatus();
            if (!authStatus) {
                sessionStorage.removeItem('bookmarks');
                document.querySelectorAll('.bookmark-icon').forEach(icon => {
                    icon.classList.remove('saved');
                });
                document.querySelectorAll('.bookmark-icon-mobile').forEach(icon => {
                    icon.classList.remove('saved');
                });
                if (callback) callback();
                return;
            }
            fetch(`${API_BASE}/api/bookmarks?limit=1000`, {
                credentials: 'include'
            })
                .then(res => res.json())
                .then(data => {
                    const bookmarks = {};
                    data.bookmarks.forEach(post => {
                        bookmarks[post.reddit_post_id] = true;
                    });
                    sessionStorage.setItem('bookmarks', JSON.stringify(bookmarks));

                    // Cache first section id once for desktop bookmark handler
                    fetch(`${API_BASE}/api/sections`, { credentials: 'include' })
                        .then(res => res.json())
                        .then(data => { cachedFirstSectionId = data.sections[0]?.id || null; })
                        .catch(() => {});

                    // Apply bookmarks to desktop icons
                    document.querySelectorAll('.bookmark-icon').forEach(icon => {
                        const postId = icon.dataset.postId;
                        if (bookmarks[postId]) {
                            icon.classList.add('saved');
                        } else {
                            icon.classList.remove('saved');
                        }
                    });

                    // Apply bookmarks to mobile icons
                    document.querySelectorAll('.bookmark-icon-mobile').forEach(icon => {
                        const postId = icon.dataset.postId;
                        if (bookmarks[postId]) {
                            icon.classList.add('saved');
                        } else {
                            icon.classList.remove('saved');
                        }
                    });

                    // PI responds based on bookmark count & bookmark url params
                    const urlParams = new URLSearchParams(window.location.search);
                    if (urlParams.get('page') === 'bookmarks') {
                        const bookmarkCount = data.bookmarks.length;
                        handleBookmarksPI(bookmarkCount);
                    }

                    if (callback) callback();
                })
                .catch(err => {
                    console.error('❌ Failed to preload bookmarks:', err);
                    if (callback) callback();
                });
        }

        // DOM Elements
        const searchInput = document.getElementById('search-input');
        const suggestionsDiv = document.getElementById('suggestions');
        const searchButton = document.getElementById('search-button');
        const sortSelect = document.getElementById('sort-select');
        const timeSelect = document.getElementById('time-select');
        const subredditInput = document.getElementById('subreddit-input');
        const contentSelect = document.getElementById('content-select');
        const subredditSuggestions = document.getElementById('subreddit-suggestions');
        const subredditChipContainer = document.getElementById('subreddit-chip-container');

        // State
        const savedCommentCache = localStorage.getItem('commentCache');
        const commentCache = savedCommentCache ? JSON.parse(savedCommentCache) : {};

        window.cachedMediaByUrl = {};

        let activeQueryToken = 0;
        let cachedPostsById = {};
        let isSearchInProgress = false;
        let bannedSubreddits = [];
        let searchCount = parseInt(localStorage.getItem('searchCount')) || 0;
        let isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
        let currentTab = 'home';
        const tabScrollY = {};
        let lastSearchAreaTab = 'search';
        let lastSubredditState = null;
        let lastSubredditOriginTab = null;
        let lastSubredditBeforeSearch = null;
        let cameFromSearchBack = false;
        let lastSearchState = null;
        let lastHomeState = null;
        const tabState = {
            home:      { after: null, before: null },
            search:    { after: null, before: null },
            subreddit: { after: null, before: null }
        };
        let isRestoringHome = false;
        let lastBookmarksAreaTab = 'bookmarks';
        let navStack = [];
        let lastQuery = "";
        let currentVectorResults = [];
        let currentVectorOffset = 0;
        let hasMoreVectorResults = false;
        let vectorScrollHandler = null;
        let isVectorLoading = false;
        let currentAfter = null;
        let currentBefore = null;
        let isLoading = false;
        let isScrollLoad = false;
        let cachedFirstSectionId = null;

        // ─── Navigation system ─────────────────────────────────────────────────────

        let appState = {
            tab: 'home',
            subreddit: '',
            query: '',
            sort: 'hot',
            time: 'all',
            contentType: 'all',
            pageIndex: 0,
            after: null,
            before: null,
            sectionId: null,
        };

        function stateFromURL() {
            const p = new URLSearchParams(window.location.search);
            const page = p.get('page') || '';
            const sub = p.get('sub') || '';
            let tab = 'home';
            if (page === 'search') tab = 'search';
            else if (page === 'bookmarks') tab = 'bookmarks';
            else if (sub && sub !== 'all' && page !== 'search') tab = 'subreddit';

            return {
                tab,
                subreddit: (sub && sub !== 'all') ? sub : '',
                query: p.get('q') || '',
                sort: p.get('sort') || 'hot',
                time: p.get('time') || 'all',
                contentType: p.get('type') || 'all',
                after: p.get('after') || null,
                before: p.get('before') || null,
                sectionId: parseInt(p.get('section'), 10) || null,
                subredditSort: 'hot',
                subredditTime: 'all',
            };
        }

        function urlFromState(state) {
            const p = new URLSearchParams();
            if (state.tab === 'search') p.set('page', 'search');
            else if (state.tab === 'bookmarks') p.set('page', 'bookmarks');
            if (state.subreddit) p.set('sub', state.subreddit);
            if (state.query) p.set('q', state.query);
            if (state.sort && state.sort !== 'hot') p.set('sort', state.sort);
            if (state.time && state.time !== 'all') p.set('time', state.time);
            if (state.contentType && state.contentType !== 'all') p.set('type', state.contentType);
            if (state.after) p.set('after', state.after);
            if (state.tab === 'bookmarks' && state.sectionId) p.set('section', state.sectionId);
            const str = p.toString();
            return str ? `/?${str}` : '/';
        }

        function navigate(partial) {
            Object.assign(appState, partial);
            activeQueryToken++;
            history.pushState({}, '', urlFromState(appState));
            renderForState(appState, false);
        }

        function navigateReplace(partial) {
            Object.assign(appState, partial);
            activeQueryToken++;
            history.replaceState({}, '', urlFromState(appState));
            renderForState(appState, false);
        }
        window.navigateReplace = navigateReplace;

        function renderForState(state, isBack = true) {

            // Reset content type when leaving search
            if (currentTab === 'search' && state.tab !== 'search') {
                currentFilters.contentType = 'all';
                appState.contentType = 'all';
                const contentSelect = document.getElementById('content-select');
                if (contentSelect) contentSelect.value = 'all';
                document.querySelectorAll('.content-type-tab').forEach(t => t.classList.remove('active'));
                const allTab = document.querySelector('.content-type-tab[data-value="all"]');
                if (allTab) allTab.classList.add('active');
            }

            Object.assign(appState, state);
            currentAfter = state.after;
            currentBefore = state.before;

            // Sync contentSelect to appState
            if (state.tab === 'search') {
                const contentSelect = document.getElementById('content-select');
                if (contentSelect) contentSelect.value = appState.contentType || 'all';
                currentFilters.contentType = appState.contentType || 'all';
            }
            switchTab(state.tab);

            if (window.location.pathname.includes('/share/')) {
                isLoading = false;
                switchTab('bookmarks');
                const shareCode = window.location.pathname.split('/share/')[1];
                loadSharedContent(shareCode);
                return;
            }

            if (state.tab === 'bookmarks') {
                if (isMobile()) {
                    if (state.sectionId) {
                        switchTab('bookmarks');
                        loadSectionContent(state.sectionId);
                    } else {
                        showSectionsAntepage(true);
                    }
                } else {
                    initBookmarks();
                }
                return;
            }



            applyFiltersToUI(state);

            if (state.tab === 'subreddit' && isMobile()) {
                appState.subredditSort = state.sort || 'hot';
                appState.subredditTime = state.time || 'all';
                const sortPill = document.getElementById('subreddit-pill-sort');
                const timePill = document.getElementById('subreddit-pill-time');
                const sortLabels = { hot: 'Hot ', top: 'Top ', new: 'New ', rising: 'Rising ' };
                const timeLabels = { all: 'All time ', year: 'Past year ', month: 'Past month ', week: 'Past week ', day: 'Today ', hour: 'Past hour ' };
                if (sortPill) sortPill.childNodes[0].textContent = sortLabels[state.sort] || 'Hot ';
                if (timePill) timePill.childNodes[0].textContent = timeLabels[state.time] || 'All time ';
            }

            currentFilters.query = state.query;
            currentFilters.subreddit = state.subreddit;
            currentFilters.sort = state.sort;
            currentFilters.time = state.time;
            currentFilters.contentType = state.contentType;

            if (state.tab === 'search' && !state.query) {
                const backButton = document.getElementById('back-button');
                if (backButton) backButton.style.display = 'none';
                const resultsContainer = document.getElementById('search-results');
                const hasResults = resultsContainer && resultsContainer.children.length > 0;
                if (!hasResults && resultsContainer) resultsContainer.innerHTML = '';
                setSubredditChip('');
                initExploreGrid();
                return;
            }

            if (state.tab === 'home') {
                appState.subreddit = ''; appState.query = ''; appState.sort = state.sort || 'hot'; appState.time = 'all'; appState.contentType = 'all';
                setSubredditChip('');
                const searchInput = document.getElementById('search-input');
                if (searchInput) searchInput.value = '';
                const mobileSearchInput = document.getElementById('mobile-search-input');
                if (mobileSearchInput) mobileSearchInput.value = '';
                const subredditInput = document.getElementById('subreddit-input');
                if (subredditInput) subredditInput.value = '';
            }

            if (state.tab === 'home' && !isRestoringHome) {
                lastHomeState = { ...state };
            }

            if (state.tab === 'home' && getAuthStatus()) {
                preloadBookmarks(() => {
                if (!isSearchInProgress) handleSearchRequest(isMobile() ? state.after : null, isMobile() ? state.before : null, isBack);
                });
                return;
            }

            handleSearchRequest(isMobile() ? state.after : null, isMobile() ? state.before : null, isBack);
        }
        // currentFilters is always a live reference to appState — no separate object
        const currentFilters = new Proxy({}, {
            get(_, key) { return appState[key]; },
            set(_, key, value) { appState[key] = value; return true; }
        });

        // Data for html injection
        if (window.preloadedSearchData && window.preloadedQuery !== undefined) {

            // Set the search input
            searchInput.value = window.preloadedQuery;

            // Set the subreddit if one was preloaded
            if (window.preloadedSubreddit) {

                const subredditInput = document.getElementById('subreddit-input');
                if (subredditInput) {
                    subredditInput.value = window.preloadedSubreddit;
                }
            }

            // Process the data the same way performSearch does
            const data = window.preloadedSearchData;
            currentAfter = data.data.after || null;
            currentBefore = data.data.before || null;

            // Trim the data
            const trimmedData = data.data.children.map(post => trimRedditPostData(post));            
            
            displayResults(trimmedData);
            // Only preload bookmarks if there are results
            if (trimmedData.length > 0) {
                preloadBookmarks();
            }
            
            setTimeout(() => {
                if (!filtered.length && !document.querySelector('.results-error')) {
                    noResultsMessage();
                }
            }, 0);

            if (!isMobile()) syncScrollLoader();

            // Clean up
            delete window.preloadedSearchData;
            delete window.preloadedQuery;
            delete window.preloadedSubreddit;
        }

        // Load Blocklist 
        async function loadBlocklist() {
            try {
                const response = await fetch('html/blocklist.json');
                const data = await response.json();
                bannedSubreddits = data.bannedSubreddits;
            } catch (error) {
                console.warn('No blocklist found');
            }
        }

        function isBlockedSubreddit(subreddit) {
            return subreddit && bannedSubreddits.includes(subreddit.toLowerCase());
        }

        function showBlockedSubredditError() {
            showError(`
                <div style="text-align: center;">
                    <img src="https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExOWtmaXgzdmdxdzU0dHJ0dXB5MXV2bWdpb2FqYXZndWc1eGNuZTAwMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Vuw9m5wXviFIQ/giphy.gif" 
                     alt="Rick Astley dancing" 
                     style="width: 300px; border-radius: 8px;">
                </div>
            `);
        }

        function setClownButton(on) {
            const btn = document.getElementById('subreddit-search-btn');
            if (!btn) return;
            if (on) {
                btn.innerHTML = '<img src="/assets/icons8-clown-96.png" alt="clown" style="width:24px;height:24px;">';
                btn.disabled = true;
            } else {
                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="2"/><path d="m15.8 15.8 4.2 4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
                btn.disabled = false;
            }
        }

        function updateSubredditChip(sub) {
            const chipContainer = document.querySelector('.chip-container');
            if (!chipContainer) return;

            chipContainer.innerHTML = '';

            // Only show if it's not "all" or empty
            if (sub && sub !== 'all') {
                const chip = document.createElement('div');
                chip.className = 'chip';
                chip.textContent = sub;
                chipContainer.appendChild(chip);
            }
        }

        function restoreToggleStates() {
            const toggle1 = document.getElementById('toggle1');
            const toggle2 = document.getElementById('toggle2');

            if (!toggle1 || !toggle2) return; 

            const savedToggle1 = sessionStorage.getItem('toggle1State');
            const savedToggle2 = sessionStorage.getItem('toggle2State');
            if (savedToggle1 !== null) toggle1.checked = savedToggle1 === 'true';
            if (savedToggle2 !== null) toggle2.checked = savedToggle2 === 'true';

            // Re-run logic to reflect the change visually
            if (document.getElementById('sort-select')) {
                const toggleManager = new ToggleManager();
                toggleManager.validateState();
                toggleManager.updateSortDropdown();
            }
        }

        function saveSafeSearchState() {
            const safeSearchSelect = document.getElementById('safesearch-select');
            if (safeSearchSelect) {
                localStorage.setItem('safeSearchState', safeSearchSelect.value);
            }
        }

        function restoreSafeSearchState() {
            const safeSearchSelect = document.getElementById('safesearch-select');
            const savedState = localStorage.getItem('safeSearchState');

            if (safeSearchSelect && savedState) {
                safeSearchSelect.value = savedState;

                // Apply the visual state (blur NSFW content if on)
                const enabled = savedState === 'on';
                document.body.classList.toggle('safe-search-enabled', enabled);
            }
        }




        window.addEventListener('popstate', () => {
            Object.assign(appState, stateFromURL());
            if (!isMobile()) {
                appState.after = null;
                appState.before = null;
            }
            activeQueryToken++;
            renderForState(appState, true);
        });

    if (searchButton) {
        // Event Listeners
        searchButton.addEventListener('click', async () => {
            // Pressing button too fast
            if (scrambleYeller()) return;
            isSearchInProgress = true;
            // Reset search button
            setTimeout(() => {
                searchButton.style.backgroundImage = "url(/assets/search-default.png')";
            }, 500);

            const subreddit = subredditInput.value.trim();
            searchButton.style.backgroundImage = "url('/assets/search-pressed.png')";

            // Check blocklist 
            if (subreddit && bannedSubreddits.includes(subreddit.toLowerCase())) {
                hideBookmarksUI();

                showError(`
                <div style="text-align: center;">
                    <img src="https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExOWtmaXgzdmdxdzU0dHJ0dXB5MXV2bWdpb2FqYXZndWc1eGNuZTAwMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Vuw9m5wXviFIQ/giphy.gif" 
                 alt="Rick Astley dancing" 
                 style="width: 300px; border-radius: 8px;">
                </div>
            `);
                // Reset search button
                setTimeout(() => {
                    searchButton.style.backgroundImage = "url('/assets/search-default.png')";
                }, 500);
                return;
            }

            if (currentFilters.sort === 'relevance' && (!searchInput.value || searchInput.value.trim() === '')) {

                showError(`No search terms detected. ${isMobile() ? '' : '🔎'}`);
                // Reset search button
                setTimeout(() => {
                    searchButton.style.backgroundImage = "url('/assets/search-default.png')";
                }, 500);

                handleRandomResponse([
                    "I couldn't find that, kid.",
                    "No dice.",
                    "Sorry, squirt.",
                    "I'm gonna need more than that.",
                    "That's not on my records.",
                    "Shucks.",
                    "Nada.",
                    "I got nothin'.",
                    "That's a dead end.",
                    "Not in my files.",
                    "Zilch.",
                    "Throw me a bone here.",
                    "Don't know where I'd find 'blankity blank blank.'",
                    "No can do."
                ]);
                return;
            }

            if (subreddit && subreddit !== 'undefined' && subreddit !== 'null') {

                setTimeout(() => {
                    searchButton.style.backgroundImage = "url('/assets/search-default.png')";
                }, 500);
                // Check for single character inputs
                if (subreddit.length === 1) {
                    cleanupUI();
                    showError(`Couldn't find a valid subreddit. ${isMobile() ? '' : '🔎'}`);
                    if (subreddit.toUpperCase() === 'F') {
                        handleRandomResponse(["You paying respects?", "Funny.", "Brother..."]);
                    } else {
                        handleRandomResponse([
                            `That's it? Just "${subreddit}"?`,
                            "I'm gonna need more than that."
                        ]);
                    }
                    return;
                }


                // 🌐 Check if the subreddit exists using about.json
                try {
                    const res = await fetch(`${API_BASE}/reddit?url=https://www.reddit.com/r/${subreddit}/about.json`);
                    if (!res.ok) {
                        cleanupUI();
                        showError(`Couldn't find a valid subreddit. ${isMobile() ? '' : '🔎'}`);
                        // Reset search button
                        setTimeout(() => {
                            searchButton.style.backgroundImage = "url('/assets/search-default.png')";
                        }, 500);

                        handleRandomResponse([
                            "I couldn't find that, kid.",
                            "No dice.",
                            "Is that a word?",
                            "Sorry, squirt.",
                            "That's not on my records.",
                            "Shucks.",
                            "Nada.",
                            "I got nothin'.",
                            "Not familiar with that.",
                            "That's a dead end.",
                            "Not in my files.",
                            "Never heard of that place.",
                            "Zilch.",
                            "No can do."
                        ]);
                        return;
                    }

                    const json = await res.json();

                    if (!json || !json.data || json.data.subreddit_type === 'private') {

                        showError("This subreddit is private.");
                        // Reset search button
                        setTimeout(() => {
                            searchButton.style.backgroundImage = "url('/assets/search-default.png')";
                        }, 500);

                        handleRandomResponse([
                            "Sorry, squirt.",
                            "That's classified.",
                            "That's private.",
                            "No can do."
                        ]);
                        return;
                    }

                } catch (err) {
                    cleanupUI();
                    showError(`Couldn't find a valid subreddit. ${isMobile() ? '' : '🔎'}`);
                    setTimeout(() => {
                        searchButton.style.backgroundImage = "url('/assets/search-default.png')";
                    }, 500);
                    return;
                }
            }

            // Store the search suggestion
            const searchTerm = searchInput.value.trim();
            if (searchTerm && searchTerm.length > 3 && searchTerm.length <= 55) {
                try {
                    const searchType = determineSearchType();
                    const isVectorSearch = searchType === 'vector';

                    fetch(`${API_BASE}/api/suggestions/store`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            query: searchTerm,
                            subreddit: (subreddit && subreddit !== 'undefined' && subreddit !== 'null') ? subreddit : null,
                            is_vector_search: isVectorSearch
                        })
                    })
                        .catch(err => {
                            console.error("Failed to store suggestion in background:", err);
                        });
                } catch (err) {
                    console.error("Error setting up suggestion storage:", err);
                }
            }

            handleSearchRequest();

            searchCount++;
            localStorage.setItem('searchCount', searchCount);

            setTimeout(() => {
                searchButton.style.backgroundImage = "url('/assets/search-default.png')";
            }, 500);
            
            isSearchInProgress = false;
        });
    }
    
    if (subredditInput && searchInput) {
        [subredditInput, searchInput].forEach(input => {
            input.addEventListener('keydown', async (e) => {

                // Up and Down Arrows Input  
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    let dropdown, suggestions, currentHighlighted;

                    // Check which dropdown is active (same logic as Tab)
                    dropdown = document.querySelector('#suggestions');
                    if (dropdown && dropdown.style.display !== 'none' && dropdown.querySelectorAll('div').length > 0) {
                        suggestions = dropdown.querySelectorAll('div');
                        currentHighlighted = dropdown.querySelector('.highlighted');
                    } else {
                        dropdown = document.querySelector('.subreddit-suggestions');
                        if (dropdown && dropdown.classList.contains('active')) {
                            suggestions = dropdown.querySelectorAll('.subreddit-suggestion');
                            currentHighlighted = dropdown.querySelector('.highlighted');
                        }
                    }

                    if (suggestions && suggestions.length > 0) {
                        e.preventDefault();

                        // Remove current highlight
                        if (currentHighlighted) {
                            currentHighlighted.classList.remove('highlighted');
                        }

                        let nextIndex;
                        if (e.key === 'ArrowDown') {
                            // Move down
                            if (currentHighlighted) {
                                const currentIndex = Array.from(suggestions).indexOf(currentHighlighted);
                                nextIndex = (currentIndex + 1) % suggestions.length;
                            } else {
                                nextIndex = 0; // Start at first item
                            }
                        } else {
                            // Move up
                            if (currentHighlighted) {
                                const currentIndex = Array.from(suggestions).indexOf(currentHighlighted);
                                nextIndex = currentIndex <= 0 ? suggestions.length - 1 : currentIndex - 1;
                            } else {
                                nextIndex = suggestions.length - 1; // Start at last item
                            }
                        }

                        suggestions[nextIndex].classList.add('highlighted');
                    }
                }

                if (e.key === 'Enter') {
                    // Check both dropdowns
                    let highlighted = document.querySelector('#suggestions .highlighted') ||
                        document.querySelector('.subreddit-suggestions .highlighted');

                    if (highlighted) {
                        e.preventDefault();
                        highlighted.click();
                        highlighted.classList.remove('highlighted');
                        return;
                    }
                    // Pressing button too fast
                    if (scrambleYeller()) return;
                    // Reset search button
                    setTimeout(() => {
                        searchButton.style.backgroundImage = "url('/assets/search-default.png')";
                    }, 500);

                    const subreddit = subredditInput.value.trim();
                    const searchTerm = searchInput.value.trim();

                    searchButton.style.backgroundImage = "url('/assets/search-pressed.png')";

                    // **BLOCKLIST CHECK**
                    if (subreddit && bannedSubreddits.includes(subreddit.toLowerCase())) {
                        hideBookmarksUI();
                        
                        showError(`
                            <div style="text-align: center;">
                                <img src="https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExOWtmaXgzdmdxdzU0dHJ0dXB5MXV2bWdpb2FqYXZndWc1eGNuZTAwMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Vuw9m5wXviFIQ/giphy.gif" 
                            alt="Rick Astley dancing" 
                            style="width: 300px; border-radius: 8px;">
                            </div>
                        `);
                        // Reset search button
                        setTimeout(() => {
                            searchButton.style.backgroundImage = "url('/assets/search-default.png')";
                        }, 500);
                        return;
                    }

                    // **RELEVANCE SEARCH TERM CHECK**
                    if (currentTab === 'search' && currentFilters.sort === 'relevance' && !searchTerm) {

                        showError(`No search terms detected. ${isMobile() ? '' : '🔎'}`);
                        setTimeout(() => {
                            searchButton.style.backgroundImage = "url('/assets/search-default.png')";
                        }, 500);
                        handleRandomResponse([
                            "I couldn't find that, kid.",
                            "No dice.",
                            "Sorry, squirt.",
                            "That's not on my records.",
                            "Shucks.",
                            "Nada.",
                            "I got nothin'.",
                            "That's a dead end.",
                            "Not in my files.",
                            "Zilch.",
                            "Don't know where I'd find 'blankity blank blank.'",
                            "No can do."
                        ]);
                        return;
                    }

                    // **SUBREDDIT VALIDATION**
                    if (subreddit && subreddit !== 'undefined' && subreddit !== 'null') {
                        // Check for single character inputs
                        if (subreddit.length === 1) {
                            cleanupUI();
                            showError(`Couldn't find a valid subreddit. ${isMobile() ? '' : '🔎'}`);
                            setTimeout(() => {
                                searchButton.style.backgroundImage = "url('/assets/search-default.png')";
                            }, 500);
                            if (subreddit.toUpperCase() === 'F') {
                                handleRandomResponse(["You paying respects?", "Funny.", "Brother..."]);
                            } else {
                                handleRandomResponse([
                                    `That's it? Just "${subreddit}"?`,
                                    "I'm gonna need more than that.",
                                    "Brother..."
                                ]);
                            }
                            return;
                        }


                        try {
                            const res = await fetch(`${API_BASE}/reddit?url=https://www.reddit.com/r/${subreddit}/about.json`);
                            if (!res.ok) {
                                cleanupUI();
                                showError(`Couldn't find a valid subreddit. ${isMobile() ? '' : '🔎'}`);
                                setTimeout(() => {
                                    searchButton.style.backgroundImage = "url('/assets/search-default.png')";
                                }, 500);
                                handleRandomResponse([
                                    "I couldn't find that, kid.",
                                    "No dice.",
                                    "Is that a word?",
                                    "Sorry, squirt.",
                                    "That's not on my records.",
                                    "Shucks.",
                                    "Nada.",
                                    "I got nothin'.",
                                    "Not familiar with that.",
                                    "That's a dead end.",
                                    "Not in my files.",
                                    "Never heard of that place.",
                                    "Zilch.",
                                    "No can do."
                                ]);
                                return;
                            }

                            const json = await res.json();

                            if (!json || !json.data || json.data.subreddit_type === 'private') {

                                showError("This subreddit is private.");
                                setTimeout(() => {
                                    searchButton.style.backgroundImage = "url('/assets/search-default.png')";
                                }, 500);
                                handleRandomResponse([
                                    "Sorry, squirt.",
                                    "That's classified.",
                                    "That's private.",
                                    "No can do."
                                ]);
                                return;
                            }

                        } catch (err) {
                            cleanupUI();
                            setTimeout(() => {
                                searchButton.style.backgroundImage = "url('/assets/search-default.png')";
                            }, 500);
                            noResultsMessage("Couldn't find a valid subreddit. 🔎");
                            return;
                        }
                    }

                    // **STORE SEARCH SUGGESTION**
                    if (searchTerm && searchTerm.length > 3 && searchTerm.length <= 55) {
                        try {
                            const searchType = determineSearchType();
                            const isVectorSearch = searchType === 'vector';

                            await fetch(`${API_BASE}/api/suggestions/store`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    query: searchTerm,
                                    subreddit: (subreddit && subreddit !== 'undefined' && subreddit !== 'null') ? subreddit : null,
                                    is_vector_search: isVectorSearch
                                })
                            });
                        } catch (err) {
                            console.error("Failed to store suggestion:", err);
                        }
                    }

                    // **PERFORM SEARCH**
                    handleSearchRequest();

                    searchCount++;
                    localStorage.setItem('searchCount', searchCount);

                    setTimeout(() => {
                        searchButton.style.backgroundImage = "url('/assets/search-default.png')";
                    }, 500);
                }

                // Reset highlight when typing
                if (e.key.length === 1 || e.key === 'Backspace') {
                    highlightedIndex = -1;
                    const dropdown = document.querySelector('.suggestions-dropdown');
                    if (dropdown) {
                        const suggestions = dropdown.querySelectorAll('.suggestion-item');
                        suggestions.forEach(item => item.classList.remove('highlighted'));
                    }
                }
            });

            // Click listener for subreddit input
            if (input === subredditInput) {
                input.addEventListener('click', (e) => {
                    if (e.target.value.trim()) {
                        handleSubredditSuggestions(e.target.value.trim());
                        // Also make sure the dropdown shows
                        const dropdown = document.querySelector('.subreddit-suggestions');
                        if (dropdown) {
                            dropdown.classList.add('active');
                        }
                    }
                });
            }

            // Remove chip if user typed a sub
            if (input === subredditInput) {
                input.addEventListener('input', (e) => {
                    if (e.target.value.trim()) {
                        currentFilters.subreddit = '';
                        setSubredditChip('');
                    }
                });
            }
        });
    }

    if (subredditInput && searchInput) {
        [subredditInput, searchInput].forEach(input => {
                input.addEventListener('blur', () => {
                    setTimeout(() => {
                        const active = document.activeElement;
                        const subredditDropdown = document.querySelector('.subreddit-suggestions');
                        const searchDropdown = document.querySelector('#suggestions');

                        const insideDropdown =
                            subredditDropdown?.contains(active) ||
                            searchDropdown?.contains(active);

                        if (!insideDropdown) {
                            if (subredditDropdown) subredditDropdown.classList.remove('active');
                            if (searchDropdown) searchDropdown.classList.remove('suggestions-visible');
                        }
                    }, 100);
                });
            });
    }
    
    document.querySelector('#subreddit-input')?.addEventListener('focus', (e) => {
            if (!e.target.value.trim()) {
                const popularSubs = [
                    { name: 'AskReddit', icon: null },
                    { name: 'pics', icon: null },
                    { name: 'mildlyinteresting', icon: null },
                    { name: 'funny', icon: null },
                    { name: 'worldnews', icon: null }
                ];

                // Load recent subs
                const recent = JSON.parse(localStorage.getItem('recentSubs')) || [];
                const recentSubs = recent.map(name => ({ name, icon: null, isRecent: true }));

                // Combine with section headers
                const combinedSubs = [
                    ...popularSubs,
                    ...(recentSubs.length > 0 ? [{ name: 'Recently Searched', isHeader: true }] : []),
                    ...recentSubs
                ];

                populateSubredditSuggestions(combinedSubs);
                document.querySelector('.subreddit-suggestions').classList.add('active');
            }
        });

        // Save short subreddit search history
        function saveRecentSubreddit(subreddit) {
            let recent = JSON.parse(localStorage.getItem('recentSubs')) || [];

            // Convert input to lowercase for comparison, but keep original case for storage
            const subredditLower = subreddit.toLowerCase();

            // Remove if already exists (case-insensitive)
            recent = recent.filter(s => s.toLowerCase() !== subredditLower);

            // Add to start (keep original casing)
            recent.unshift(subreddit);

            // Keep only last 2
            recent = recent.slice(0, 2);
            localStorage.setItem('recentSubs', JSON.stringify(recent));
        }

        // Toggle Management System
        class ToggleManager {
            constructor() {
                this.toggle1 = document.getElementById('toggle1');
                this.toggle2 = document.getElementById('toggle2');
                this.sortContainer = document.getElementById('sort-select').parentElement;

                this.init();
            }

            init() {

                // Add single event listeners
                this.toggle1.addEventListener('click', (e) => this.handleToggle1Click(e));
                this.toggle2.addEventListener('click', (e) => this.handleToggle2Click(e));

                // Update sort dropdown based on current state
                this.updateSortDropdown();
            }

            handleToggle1Click(e) {
                if (!isLoggedIn) {
                    // Prevent any change and redirect
                    e.preventDefault();
                    this.toggle1.checked = false;
                    window.open('https://buy.stripe.com/4gM14n5qfeRAdbe4ao5c401', '_blank');
                    return;
                }

                if (this.toggle1.checked) {
                    // Enable enhanced search
                    this.toggle2.checked = false;
                    this.saveState(true, false);
                } else {
                    // Disable enhanced search
                    this.toggle2.checked = true;
                    this.saveState(false, true);
                }

                this.updateSortDropdown();
            }

            handleToggle2Click(e) {
                if (!isLoggedIn) {
                    // Prevent any change and redirect
                    e.preventDefault();
                    this.toggle2.checked = true;
                    window.open('https://buy.stripe.com/4gM14n5qfeRAdbe4ao5c401', '_blank');
                    return;
                }

                if (this.toggle2.checked) {
                    // Enable reddit search
                    this.toggle1.checked = false;
                    this.saveState(false, true);
                } else {
                    // Disable reddit search
                    this.toggle1.checked = true;
                    this.saveState(true, false);
                }

                this.updateSortDropdown();
            }

            saveState(toggle1State, toggle2State) {
                if (isLoggedIn) {
                    sessionStorage.setItem('toggle1State', toggle1State.toString());
                    sessionStorage.setItem('toggle2State', toggle2State.toString());
                }
            }

            validateState() {
                // Ensure exactly one toggle is always on
                if (this.toggle1.checked && this.toggle2.checked) {
                    // Both on - default to reddit search
                    this.toggle1.checked = false;
                    this.toggle2.checked = true;
                } else if (!this.toggle1.checked && !this.toggle2.checked) {
                    // Both off - default to reddit search
                    this.toggle1.checked = false;
                    this.toggle2.checked = true;
                }
            }

            updateSortDropdown() {
                const sortSelect = document.getElementById('sort-select');
                if (sortSelect) sortSelect.disabled = this.toggle1.checked;
            }

 

 
        }

        if (sortSelect) {
            sortSelect.addEventListener('change', () => {
                currentFilters.sort = sortSelect.value;
                handleSearchRequest();
            });
        }

        if (timeSelect) {
            timeSelect.addEventListener('change', () => {
                currentFilters.time = timeSelect.value;
                handleSearchRequest();
            });
        }

 

        document.getElementById('safesearch-select')?.addEventListener('change', function () {
            const enabled = this.value === 'on';
            document.body.classList.toggle('safe-search-enabled', enabled);
            saveSafeSearchState();
        });

        if (contentSelect) {
            contentSelect.addEventListener('change', () => {
                currentFilters.contentType = contentSelect.value;
                handleSearchRequest();
            });
        }

        const comfyToggle = document.getElementById('comfy-toggle');
        const compactToggle = document.getElementById('compact-toggle');

        // Use sessionStorage - resets when tab closes, persists on refresh
        let isComfyActive = sessionStorage.getItem('isComfyActive') === 'true' || false;
        let isCompactActive = sessionStorage.getItem('isCompactActive') === 'true' || false;
        let hasClickedOnce = sessionStorage.getItem('hasClickedOnce') === 'true' || false;

        // Apply saved states on page load
        function applyButtonStates() {
            if (window.innerWidth <= 1024) return;
            if (comfyToggle) {
                if (isComfyActive) {
                    comfyToggle.querySelector('img').src = '/assets/comfy-pressed.png';
                    document.body.classList.add('comfy-mode');
                } else {
                    comfyToggle.querySelector('img').src = '/assets/comfy-default.png';
                    document.body.classList.remove('comfy-mode');
                }
            }
        
            if (compactToggle) {
                if (isCompactActive) {
                    compactToggle.querySelector('img').src = '/assets/compact-pressed.png';
                } else {
                    compactToggle.querySelector('img').src = '/assets/compact-default.png';
                }
            }
        
            if (hasClickedOnce) {
                document.body.classList.add('hasClickedOnce');
            }
        }
        
        applyButtonStates();

        // Save states to sessionStorage
        function saveStates() {
            sessionStorage.setItem('isComfyActive', isComfyActive);
            sessionStorage.setItem('isCompactActive', isCompactActive);
            sessionStorage.setItem('hasClickedOnce', hasClickedOnce);
        }

        function showBottomSheet(title, options) {
            const overlay = document.createElement('div');
            overlay.className = 'section-picker-overlay';

            const sheet = document.createElement('div');
            sheet.className = 'section-more-sheet';

            const header = document.createElement('div');
            header.className = 'section-more-header';
            header.innerHTML = `<span class="section-more-title">${title}</span>`;
            sheet.appendChild(header);

            function closeSheet() {
                sheet.style.transform = 'translateY(100%)';
                overlay.style.opacity = '0';
                setTimeout(() => {
                    overlay.remove();
                    sheet.remove();
                }, 200);
            }

            options.forEach(({ label, callback, active }) => {
                const item = document.createElement('div');
                item.className = 'section-more-item';
                const inner = document.createElement('div');
                inner.className = 'section-more-item-inner';
                inner.style.display = 'flex';
                inner.style.justifyContent = 'space-between';
                inner.style.alignItems = 'center';
                inner.style.color = 'var(--text-color)';
                inner.innerHTML = `<span>${label}</span>${active ? '<span class="sheet-item-check">✓</span>' : ''}`;
                if (active) inner.classList.add('sheet-item-active');
                item.appendChild(inner);
                item.addEventListener('click', () => {
                    closeSheet();
                    callback();
                });
                sheet.appendChild(item);
            });

            overlay.addEventListener('click', closeSheet);

            document.body.appendChild(overlay);
            document.body.appendChild(sheet);

            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                sheet.style.transform = 'translateY(0)';
            });
        }

        function showThemesSheet() {
            const current = localStorage.getItem('selectedTheme') || 'default';
            const activeTheme = current === 'dark' ? 'default' : current;
            showBottomSheet('Themes', [
                { label: 'Default',  callback: () => { localStorage.setItem('previousTheme', 'default'); selectTheme('default'); },  active: activeTheme === 'default' },
                { label: 'Bluebird', callback: () => { localStorage.setItem('previousTheme', 'bluebird'); selectTheme('bluebird'); }, active: activeTheme === 'bluebird' },
                { label: 'Forest',   callback: () => { localStorage.setItem('previousTheme', 'forest'); selectTheme('forest'); },   active: activeTheme === 'forest' }
            ]);
        }

        function showLayoutSheet() {
            const current = localStorage.getItem('mobile-layout') || 'comfy';

            function getAnchor() {
                const viewportMid = window.innerHeight / 2;
                return Array.from(document.querySelectorAll('.result-card')).reduce((closest, card) => {
                    const rect = card.getBoundingClientRect();
                    const cardMid = rect.top + rect.height / 2;
                    const dist = Math.abs(cardMid - viewportMid);
                    return dist < closest.dist ? { card, dist } : closest;
                }, { card: null, dist: Infinity }).card;
            }

            function restoreAnchor(anchor, anchorAbsTop) {
                if (!anchor) return;
                requestAnimationFrame(() => {
                    const newAbsTop = anchor.getBoundingClientRect().top + document.documentElement.scrollTop;
                    document.documentElement.scrollTop += newAbsTop - anchorAbsTop;
                });
            }

            showBottomSheet('Layout', [
                { label: 'Comfy', callback: () => {
                    const anchor = getAnchor();
                    const anchorAbsTop = anchor ? anchor.getBoundingClientRect().top + document.documentElement.scrollTop : 0;
                    document.body.setAttribute('data-layout', 'comfy');
                    localStorage.setItem('mobile-layout', 'comfy');
                    if (typeof turnOffMobileOrganize === 'function') turnOffMobileOrganize();
                    restoreAnchor(anchor, anchorAbsTop);
                }, active: current === 'comfy' },
                { label: 'Compact', callback: () => {
                    const anchor = getAnchor();
                    const anchorViewportBefore = anchor ? anchor.getBoundingClientRect().top : 0;
                    document.body.setAttribute('data-layout', 'compact');
                    localStorage.setItem('mobile-layout', 'compact');
                    if (anchor) {
                        const anchorViewportAfter = anchor.getBoundingClientRect().top;
                        const scrollAfter = document.documentElement.scrollTop;
                        document.documentElement.scrollTop = scrollAfter - (anchorViewportBefore - anchorViewportAfter) - 300;
                    }
                }, active: current === 'compact' }
            ]);
        }

        function toggleSafeSearchPill() {
            const select = document.getElementById('safesearch-select');
            const current = select ? select.value : (localStorage.getItem('safeSearchState') || 'on');
            showBottomSheet('Safe Search', [
                { label: 'On',  callback: () => {
                    if (select) select.value = 'on';
                    localStorage.setItem('safeSearchState', 'on');
                    document.body.classList.add('safe-search-enabled');
                    saveSafeSearchState();
                }, active: current === 'on' },
                { label: 'Off', callback: () => {
                    if (select) select.value = 'off';
                    localStorage.setItem('safeSearchState', 'off');
                    document.body.classList.remove('safe-search-enabled');
                    saveSafeSearchState();
                }, active: current === 'off' },
            ]);
        }
        window.toggleSafeSearchPill = toggleSafeSearchPill;

        function resetSortToHot() {
            currentFilters.sort = 'hot';
            const pillBtn = document.getElementById('pill-sort');
            if (pillBtn) pillBtn.childNodes[0].textContent = 'Hot ';
            const sortSelect = document.getElementById('sort-select');
            if (sortSelect) sortSelect.value = 'hot';
        }

        function openSortSheet() {
            const isSubreddit = currentTab === 'subreddit';
            const select = document.getElementById('sort-select');
            const pillBtn = document.getElementById(isSubreddit ? 'subreddit-pill-sort' : 'pill-sort');
            const pillText = pillBtn ? pillBtn.textContent.trim().toLowerCase() : '';
            let current = isSubreddit ? (appState.subredditSort || 'hot') : (currentFilters.sort || 'hot');
            if (pillText.startsWith('hot')) current = 'hot';
            const setSort = (val, label) => {
                if (isSubreddit) {
                    appState.subredditSort = val;
                    currentFilters.sort = val;
                } else {
                    if (select) select.value = val;
                    currentFilters.sort = val;
                }
                if (pillBtn) pillBtn.childNodes[0].textContent = label + ' ';
            };
            const options = [
                { label: 'Hot', callback: () => { setSort('hot', 'Hot'); handleSearchRequest(); }, active: current === 'hot' },
                { label: 'Top', callback: () => { setSort('top', 'Top'); handleSearchRequest(); }, active: current === 'top' },
                { label: 'New', callback: () => { setSort('new', 'New'); handleSearchRequest(); }, active: current === 'new' },
            ];
            if (!isSubreddit) {
                options.splice(1, 0, { label: 'Relevance', callback: () => { setSort('relevance', 'Relevance'); handleSearchRequest(); }, active: current === 'relevance' });
            }
            showBottomSheet('Sort By', options);
        }
        window.openSortSheet = openSortSheet;

        function openTimeSheet() {
            const isSubreddit = currentTab === 'subreddit';
            const select = document.getElementById('time-select');
            const pillBtn = document.getElementById(isSubreddit ? 'subreddit-pill-time' : 'pill-time');
            const current = isSubreddit ? (appState.subredditTime || 'all') : ((select ? select.value : null) || currentFilters.time || 'all');
            const setTime = (val, label) => {
                if (isSubreddit) {
                    appState.subredditTime = val;
                    currentFilters.time = val;
                } else {
                    if (select) select.value = val;
                    currentFilters.time = val;
                }
                if (pillBtn) pillBtn.childNodes[0].textContent = label + ' ';
                handleSearchRequest();
            };
            showBottomSheet('Filter by time', [
                { label: 'All time',   callback: () => setTime('all',   'All time'),   active: current === 'all'   },
                { label: 'Past year',  callback: () => setTime('year',  'Past year'),  active: current === 'year'  },
                { label: 'Past month', callback: () => setTime('month', 'Past month'), active: current === 'month' },
                { label: 'Past week',  callback: () => setTime('week',  'Past week'),  active: current === 'week'  },
                { label: 'Today',      callback: () => setTime('day',   'Today'),      active: current === 'day'   },
                { label: 'Past hour',  callback: () => setTime('hour',  'Past hour'),  active: current === 'hour'  },
            ]);
        }
        window.openTimeSheet = openTimeSheet;
    
        function recalculateComfyDimensions(resultCard) {
            const imgWrapper = resultCard.querySelector('.image-wrapper');
            const resultImg = resultCard.querySelector('img.result-image');

            if (imgWrapper && resultImg && imgWrapper.useSameSize && document.body.classList.contains('comfy-mode')) {
                // Force a layout recalculation
                resultImg.style.width = '';
                resultImg.style.height = '';

                // Wait for next frame to get accurate dimensions
                requestAnimationFrame(() => {
                    imgWrapper.comfyFirstWidth = resultImg.offsetWidth;
                    imgWrapper.comfyFirstHeight = resultImg.offsetHeight;
                });
            }
        }
        
        if (comfyToggle) {
            comfyToggle.addEventListener('click', () => {
                if (isComfyActive) {
                    if (hasClickedOnce && !isCompactActive) return;
                    isComfyActive = false;
                    comfyToggle.querySelector('img').src = '/assets/comfy-default.png';
                } else {
                    isComfyActive = true;
                    comfyToggle.querySelector('img').src = '/assets/comfy-pressed.png';
                    isCompactActive = false;
                    if (compactToggle) compactToggle.querySelector('img').src = '/assets/compact-default.png';
                }
                hasClickedOnce = true;
                document.body.classList.add('hasClickedOnce');
                if (isComfyActive) {
                    document.body.classList.add('comfy-mode');
                    document.querySelectorAll('.result-card').forEach(card => {
                        recalculateComfyDimensions(card);
                    });
                } else {
                    document.body.classList.remove('comfy-mode');
                }
                saveStates();
            });
        }
        
        if (compactToggle) {
            compactToggle.addEventListener('click', () => {
                hasClickedOnce = true;
                document.body.classList.add('hasClickedOnce');
                compactToggle.querySelector('img').src = '/assets/compact-pressed.png';
                document.body.classList.remove('comfy-mode');
                isComfyActive = false;
                isCompactActive = true;
                if (comfyToggle) comfyToggle.querySelector('img').src = '/assets/comfy-default.png';
                saveStates();
            });
        }
        
        document.addEventListener('click', function (event) {
            if (event.target.closest('#suggestions-back-btn')) return;
            const suggestionsDiv = document.getElementById('suggestions');
            const input = document.getElementById('search-input');
            if (!input) return;
            input.autocomplete = "off";
            if (suggestionsDiv && input) {
                if (!suggestionsDiv.contains(event.target) && event.target !== input) {
                    suggestionsDiv.innerHTML = '';
                    suggestionsDiv.classList.remove('suggestions-visible');
                }
            }
        });
        
        document.querySelector('#search-input')?.addEventListener('focus', function () {
            if (this.value === '') {
                fetch(`${API_BASE}/api/top-searches`)
                    .then(res => res.json())
                    .then(data => {
                        const suggestionsDiv = document.querySelector('#suggestions');
                        displaySuggestions(data, suggestionsDiv);
                    });
            }
        });

        window.searchJustSubmitted = false;

        document.querySelector('#mobile-search-input')?.addEventListener('focus', function () {
            if (window.searchJustSubmitted) { window.searchJustSubmitted = false; return; }
            if (document.body.getAttribute('data-page') === 'search') {
                if (this.value === '') {
                    fetch(`${API_BASE}/api/top-searches`)
                        .then(res => res.json())
                        .then(data => {
                            if (window.searchJustSubmitted) return;
                            const suggestionsDiv = document.querySelector('#mobile-suggestions');
                            displaySuggestions(data, suggestionsDiv);
                        });
                }
            }
        });
        
        document.querySelector('.search-input-container')?.addEventListener('click', function (e) {
            if (!e.target.matches('.search-input') &&
                !e.target.matches('.search-button') &&
                !e.target.matches('#filter-icon') &&
                !e.target.closest('.search-button')) {
                document.querySelector('#search-input')?.focus();
            }
        });

        // Grow comment images
        document.addEventListener('click', function (e) {
            if (e.target.matches('.comment-body img')) {
                let currentWidth = e.target.offsetWidth;
                e.target.style.transition = 'width 0.07s ease';

                if (e.target.style.width) {
                    e.target.style.width = '';
                } else {
                    e.target.style.width = (currentWidth * 1.7) + 'px';
                }
            }
        });
    
        // Remove subreddit filter when clicking X
        if (subredditChipContainer) {
            subredditChipContainer.querySelector('.remove-chip').addEventListener('click', () => {
                currentFilters.subreddit = '';
                setSubredditChip('');
            });
        }
        
        // Handle suggestion selection
        if (subredditSuggestions) {
            subredditSuggestions.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-recent-btn')) {
                    return;
                }
                const suggestion = e.target.closest('.subreddit-suggestion');
                if (suggestion) {
                    const subName = suggestion.getAttribute('data-name');
                    performViewTransition('forward', () => openSubredditView(subName));
                }
            });
        }
        
        // Handle typing in subreddit input
        if (subredditInput) {
            subredditInput.addEventListener('input', () => {
                const query = subredditInput.value.toLowerCase().trim();
                lastQuery = query;
        
                if (query.length > 0) {
                    if (subredditSuggestions && !subredditSuggestions.querySelector('.custom-spinner-wrapper')) {
                        subredditSuggestions.innerHTML = '';
                        subredditSuggestions.appendChild(createCanvasSpinner());
                    }
                    if (subredditSuggestions) subredditSuggestions.classList.add('active');
                } else {
                    if (subredditSuggestions) subredditSuggestions.classList.remove('active');
                }
        
                if (searchTimeout) clearTimeout(searchTimeout);
        
                searchTimeout = setTimeout(() => {
                    handleSubredditSuggestions(query);
                }, 200);
            });
        }

        document.addEventListener('click', function (e) {
            if (e.target.closest('.plan-display-container')) {
                if (isLoggedIn) {
                    // Show spinner immediately
                    const planDisplayElement = document.getElementById('plan-display');
                    const originalContent = planDisplayElement.innerHTML;
                    const spinnerWrapper = createCanvasSpinner();
                    spinnerWrapper.style.transform = 'scale(0.6)';
                    planDisplayElement.innerHTML = '';
                    planDisplayElement.appendChild(spinnerWrapper);

                    fetch(`${API_BASE}/api/create-checkout`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include'
                    })
                        .then(response => response.json())
                        .then(data => {
                            if (data.url) {
                                window.location.href = data.url;
                            } else {
                                // Restore original content if no URL
                                planDisplayElement.innerHTML = originalContent;
                                planDisplayElement.classList.remove('loading');
                            }
                        })
                        .catch(error => {
                            console.error('Error:', error);
                            Swal.fire({
                                title: 'Error',
                                text: 'Could not open billing portal.',
                                icon: 'error',
                                didOpen: () => {
                                    document.activeElement.blur();
                                }
                            });
                            // Restore original content on error
                            planDisplayElement.innerHTML = originalContent;
                            planDisplayElement.classList.remove('loading');
                        });
                }
            }
        });

        // Cubic-bezier easing 
        function cubicBezier(p0, p1, p2, p3) {
            return function (t) {
                const cx = 3 * (p1 - p0);
                const bx = 3 * (p2 - p1) - cx;
                const ax = 1 - cx - bx;

                const cy = 3 * (p1 - p0);
                const by = 3 * (p2 - p1) - cy;
                const ay = 1 - cy - by;

                let x = t, t2 = t;
                for (let i = 0; i < 5; i++) {
                    const f = ax * t2 * t2 * t2 + bx * t2 * t2 + cx * t2 - x;
                    const df = 3 * ax * t2 * t2 + 2 * bx * t2 + cx;
                    t2 = t2 - f / df;
                    t2 = Math.max(0, Math.min(t2, 1));
                }

                return ay * t2 * t2 * t2 + by * t2 * t2 + cy * t2;
            };
        }

        function getThemeColor() {
            const body = document.body;
            if (body.classList.contains('forest-theme')) {
                return 'rgb(87, 165, 146)'; // Green
            } else if (body.classList.contains('bluebird-theme')) {
                return "rgb(135, 197, 255)"; // Blue
            } else if (body.classList.contains('dark-theme')) {
                return '#ffffff'; // White
            }
            return '#C1C0C1'; // Gray
        }

        function startSpinnerAnimation(ctx, color = "#C1C0C1", size = 50) {
            const easeCustom = cubicBezier(0.1, 0.83, 0.37, 1);
            const cycleDuration = 700;
            const scale = size / 50;
            const radius = 18 * scale;
            const center = size / 2;
            const lineWidth = 4 * scale;

            let startTime = null;

        function animate(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const t = (elapsed % cycleDuration) / cycleDuration;
            const ramp = Math.pow(t, 0.8);
            const eased = easeCustom(ramp);
            const angle = (eased * 6.28 + 7.8) % 6.28;
            const shrinkEase = easeCustom(t);
            const sinePhase = Math.sin(shrinkEase * Math.PI);
            const shrinkPhase = easeCustom(sinePhase);
            const shrink = 0.5 + 0.5 * shrinkPhase;
            const arcLength = Math.PI * 0.7 * shrink;

            ctx.clearRect(0, 0, size, size);
            ctx.beginPath();
            const arcStart = angle - arcLength;
            ctx.arc(center, center, radius, arcStart, angle);
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
            requestAnimationFrame(animate);
        }
        requestAnimationFrame(animate);
        }

        function createCanvasSpinner(color = null, size = 50) {
            const wrapper = document.createElement('div');
            wrapper.className = 'custom-spinner-wrapper';
            const canvas = document.createElement('canvas');
            const dpr = window.devicePixelRatio || 1;
            canvas.width = size * dpr;
            canvas.height = size * dpr;
            canvas.style.width = size + 'px';
            canvas.style.height = size + 'px';
            canvas.id = 'main-spinner-placeholder';
            wrapper.appendChild(canvas);
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            const spinnerColor = color || getThemeColor();
            startSpinnerAnimation(ctx, spinnerColor, size);
            return wrapper;
        }

        document.getElementById('content-select')?.addEventListener('change', function () {
            currentFilters.contentType = this.value;
            history.pushState({}, '', urlFromState(appState));
        });

        function moveTabIndicator() {
            const active = document.querySelector('.content-type-tab.active');
            const indicator = document.querySelector('.tab-indicator');
            if (!active || !indicator) return;
            const span = active.querySelector('span');
            const spanWidth = span ? span.offsetWidth + 8 : active.offsetWidth;
            const spanLeft = active.offsetLeft + (active.offsetWidth - spanWidth) / 2;
            indicator.style.width = spanWidth + 'px';
            indicator.style.transform = `translateX(${spanLeft}px)`;
        }

        document.querySelectorAll('.content-type-tab').forEach(tab => {
            tab.addEventListener('click', function () {
                const value = this.dataset.value;
                document.querySelectorAll('.content-type-tab').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                moveTabIndicator();
                appState.contentType = value;
                if (contentSelect) {
                    contentSelect.value = value;
                    contentSelect.dispatchEvent(new Event('change'));
                }
                currentFilters.contentType = value;
                handleSearchRequest(null, null, false, true);
            });
        });

        async function handleSubredditSuggestions(query) {
            if (!query || query.trim() === '') {
                subredditSuggestions.innerHTML = '';
                return;
            }

            const cleanQuery = query.replace(/^r\//, '');
            const queryToken = ++activeQueryToken;

            let timeoutId;

            timeoutId = setTimeout(() => {
                if (queryToken === activeQueryToken) {
                    subredditSuggestions.innerHTML = '<div class="subreddit-suggestion-err">No subreddits found</div>';
                    subredditSuggestions.classList.add('active');
                }
            }, 1600);

            try {
                const res = await fetch(`${API_BASE}/reddit?url=https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(query)}`);
                const data = await res.json();

                if (queryToken !== activeQueryToken) return;

                let matches = [];

                if (data?.data?.children) {
                    const filtered = [];
                    const partialMatches = [];

                    for (const child of data.data.children) {
                        const name = child?.data?.display_name?.toLowerCase();
                        if (!name) continue;

                        const queryLower = cleanQuery.toLowerCase();
                        if (name.startsWith(queryLower) && filtered.length < 6) {
                            filtered.push(child.data.display_name);
                        } else if (name.includes(queryLower) && partialMatches.length < 10) {
                            partialMatches.push(child.data.display_name);
                        }

                        if (filtered.length >= 6 && partialMatches.length >= 10) break;
                    }

                    if (filtered.length < 4) {
                        const needed = 4 - filtered.length;
                        filtered.push(...partialMatches.slice(0, needed));
                    }

                    const finalResults = filtered.slice(0, 4);
                    matches = finalResults.map(name => ({ name, icon: null }));
                }

                if (matches.length > 0) {
                    clearTimeout(timeoutId);
                    populateSubredditSuggestions(matches);
                }
                // else: don't clear timeout — let the 2s fallback run

            } catch (err) {
                console.error("❌ Subreddit suggestion fetch failed:", err);
                clearTimeout(timeoutId);

                if (queryToken === activeQueryToken) {
                    subredditSuggestions.innerHTML = '<div class="subreddit-suggestion-err">No subreddits found</div>';
                    subredditSuggestions.classList.add('active');
                }
            }
        }


        function populateSubredditSuggestions(subreddits) {

            // Sort subreddits by relevance to the search query
            const query = subredditInput.value.toLowerCase().trim();
            if (query.length > 0) {
                // Filter out header items before sorting
                const actualSubs = subreddits.filter(sub => !sub.isHeader);
                actualSubs.sort((a, b) => {
                    const aName = a.name.toLowerCase();
                    const bName = b.name.toLowerCase();

                    // Exact matches first
                    if (aName === query && bName !== query) return -1;
                    if (bName === query && aName !== query) return 1;

                    // Then starts with matches
                    if (aName.startsWith(query) && !bName.startsWith(query)) return -1;
                    if (bName.startsWith(query) && !aName.startsWith(query)) return 1;

                    // Then contains matches (already handled by filtering)
                    // Finally alphabetical
                    return aName.localeCompare(bName);
                });
                subreddits = actualSubs; // Use sorted subs without headers when searching

                // Add recent subreddits that match the query
                const recent = JSON.parse(localStorage.getItem('recentSubs')) || [];
                const matchingRecent = recent.filter(name =>
                    name.toLowerCase().startsWith(query)
                );

                if (matchingRecent.length > 0) {
                    subreddits = [
                        ...subreddits,
                        { name: 'Recently Searched', isHeader: true },
                        ...matchingRecent.map(name => ({ name, icon: null, isRecent: true }))
                    ];
                }
            }

            // If there are results from filtering, add them
            if (subreddits.length > 0) {

                // Wait for all icon fetches to complete
                Promise.all(subreddits.map(sub => Promise.resolve(sub))).then(() => {
                    subredditSuggestions.innerHTML = '';
                    subreddits.forEach(sub => {

                        // Handle header items
                        if (sub.isHeader) {
                            const header = document.createElement('div');
                            header.className = 'subreddit-section-header';
                            header.textContent = sub.name;
                            subredditSuggestions.appendChild(header);
                            return;
                        }

                        // Skip if no name
                        if (!sub.name) {
                            return;
                        }

                        const suggestion = document.createElement('div');
                        suggestion.className = 'subreddit-suggestion';
                        suggestion.setAttribute('data-name', sub.name);
                        const iconEl = document.createElement('div');
                        iconEl.className = 'subreddit-icon';

                        if (sub.icon && sub.icon.startsWith('http')) {
                            const img = document.createElement('img');
                            img.alt = sub.name;
                            img.src = sub.icon;
                            img.onerror = () => {
                                img.remove();
                                const fallback = document.createElement('span');
                                fallback.textContent = sub.name.charAt(0).toUpperCase();
                                iconEl.appendChild(fallback);
                            };
                            iconEl.appendChild(img);
                            // Force a repaint
                            iconEl.offsetHeight;
                        } else {
                            // Fallback if icon is missing or invalid
                            iconEl.textContent = sub.name.charAt(0).toUpperCase();
                        }

                        suggestion.appendChild(iconEl);
                        suggestion.appendChild(document.createTextNode(sub.name));
                        // Add delete button for recent items
                        if (sub.isRecent) {
                            const deleteBtn = document.createElement('span');
                            deleteBtn.className = 'delete-recent-btn';
                            deleteBtn.textContent = '×';
                            deleteBtn.onclick = (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                // Remove from localStorage
                                let recent = JSON.parse(localStorage.getItem('recentSubs')) || [];
                                recent = recent.filter(name => name !== sub.name);
                                localStorage.setItem('recentSubs', JSON.stringify(recent));
                                // Refresh dropdown
                                handleSubredditSuggestions(subredditInput.value);
                            };
                            suggestion.appendChild(deleteBtn);
                        }

                        subredditSuggestions.appendChild(suggestion);

                        if (sub.name) {
                            // Fetch icon async and replace when it loads
                            getSubredditIcon(sub.name).then(iconUrl => {
                                if (iconUrl && iconUrl.startsWith('http')) {
                                    const img = document.createElement('img');
                                    img.alt = sub.name;
                                    img.src = iconUrl;
                                    img.onload = () => {
                                        iconEl.textContent = ''; // Clear the letter
                                        iconEl.appendChild(img);
                                        iconEl.classList.add('icon-loaded');
                                    };
                                }
                            }).catch(err => {
                                console.error("❌ Error fetching icon:", err);
                                // Keep the letter fallback if fetch fails
                            });
                        }
                    });
                    subredditSuggestions.setAttribute('data-has-results', 'true');
                    subredditSuggestions.classList.add('active');
                    subredditSuggestions.classList.add('active')
                })
                    .catch(err => {
                        console.error("❌ Error rendering suggestions:", err);
                        subredditSuggestions.innerHTML = '<div class="subreddit-suggestion-err">Error loading suggestions</div>';
                    });
            }
        }

        function getFiltersFromURL() {
                const params = new URLSearchParams(window.location.search);
                return {
                    pageIndex: parseInt(params.get('page'), 10) || 0,
                    subreddit: params.get('sub') || '',  
                    query: params.get('q') || '',
                    sort: params.get('sort') || (params.get('page') === 'search' ? 'hot' : 'hot'),
                    time: params.get('time') || 'all',
                    contentType: params.get('type') || 'all'
                };
            }


        function applyFiltersToUI(filters) {
            const searchInput = document.querySelector('#search-input');
            const subredditInput = document.querySelector('#subreddit-input');
            const sortSelect = document.querySelector('#sort-select');
            const timeSelect = document.querySelector('#time-select');
            const contentSelect = document.querySelector('#content-select');

            if (searchInput) searchInput.value = filters.query || '';
            const mobileSearchInput = document.querySelector('#mobile-search-input');
            if (mobileSearchInput) mobileSearchInput.value = filters.query || '';
            if (subredditInput) subredditInput.value = (filters.subreddit && filters.subreddit !== 'all') ? filters.subreddit : '';
            const sortInURL = new URLSearchParams(window.location.search).get('sort');
            if (sortSelect) sortSelect.value = sortInURL ? filters.sort : (sortSelect.value || 'hot');
            if (timeSelect) timeSelect.value = filters.time || 'all';
            if (contentSelect) contentSelect.value = filters.contentType || 'all';

            // Sync active content type tab to match
            const activeType = filters.contentType || 'all';
            document.querySelectorAll('.content-type-tab').forEach(t => {
                t.classList.toggle('active', t.dataset.value === activeType);
            });
            requestAnimationFrame(moveTabIndicator);

            // Manage chip UI
            if (subredditChipContainer) {
                setSubredditChip(filters.subreddit);
            }
        }

        function getCurrentFiltersFromUI() {
            // Recheck current search input in case it's the mobile one
            const searchInputElement = document.body.getAttribute('data-page') === 'search'
                ? (document.getElementById('mobile-search-input') || document.querySelector('#search-input'))
                : document.querySelector('#search-input');

            const query = searchInputElement ? searchInputElement.value.trim() : ''; 
            const subredditInput = document.getElementById('subreddit-input');
            const subredditTyped = subredditInput ? subredditInput.value.trim() : '';
            const chipVisible = subredditChipContainer && subredditChipContainer.classList.contains('chip-visible');
            const subreddit = chipVisible
                ? subredditChipContainer.querySelector('.chip-text').textContent.replace('r/', '')
                : subredditTyped;
            const timeSelect = document.getElementById('time-select');
            const sortSelect = document.getElementById('sort-select');
            const contentSelect = document.getElementById('content-select');
            if (sortSelect && currentFilters.sort) sortSelect.value = currentFilters.sort;
            const pillSort = document.getElementById('pill-sort');
            const sort = (pillSort && isMobile())
                ? (currentTab === 'subreddit' ? (appState.subredditSort || 'hot') : (currentFilters.sort || 'hot'))
                : (sortSelect ? sortSelect.value : 'hot');
            const time = (pillSort && isMobile())
                ? (currentTab === 'subreddit' ? (appState.subredditTime || 'all') : (currentFilters.time || 'all'))
                : (timeSelect ? timeSelect.value : 'all');
            return {
                query,
                time,
                sort,
                contentType: contentSelect ? contentSelect.value : 'all',
                subreddit
            };
        }

        function openMobileSuggestions(suggestionsDiv) {
            if (window.innerWidth > 1024) return;
            document.body.classList.add('suggestions-active');
            const topBar = document.querySelector('.mobile-top-bar');
            const topBarHeight = topBar ? topBar.getBoundingClientRect().height : 60;
            suggestionsDiv.style.setProperty('--mobile-suggestions-top', topBarHeight + 'px');
        }

        window.closeMobileSuggestions = () => {
            const suggestionsDiv = document.getElementById('mobile-suggestions');
            if (!suggestionsDiv) return;
            suggestionsDiv.innerHTML = '';
            suggestionsDiv.classList.remove('suggestions-visible');
            document.body.classList.remove('suggestions-active');
        };

        function setupSearchSuggestions(inputId, suggestionsId, dictionary) {
            let timeout;
            let currentController = null;

            const input = document.getElementById(inputId);
            const suggestionsDiv = document.getElementById(suggestionsId);

            window.abortSearchSuggestionsRequest = () => {
                if (currentController) currentController.abort();
                clearTimeout(timeout);
            };

            input.addEventListener('input', function (e) {
                window.searchJustSubmitted = false;
                const query = e.target.value;
                clearTimeout(timeout);

                timeout = setTimeout(() => {
                    if (currentController) currentController.abort();
                    currentController = new AbortController();
                    getSmartSuggestions(query, suggestionsDiv, dictionary, currentController.signal);
                    if (query.trim().length > 1) {
                        appendSubredditSuggestions(query.trim(), suggestionsDiv, currentController.signal);
                    }
                }, 170);
            });

            input.addEventListener('click', function (e) {
                window.searchJustSubmitted = false;
                const query = e.target.value.trim();
                if (query) {
                    if (currentController) currentController.abort();
                    currentController = new AbortController();
                    getSmartSuggestions(query, suggestionsDiv, dictionary, currentController.signal);
                    if (query.length > 1) {
                        appendSubredditSuggestions(query, suggestionsDiv, currentController.signal);
                    }
                }
            });

            suggestionsDiv.addEventListener('mousedown', (e) => {
                const item = e.target.closest('.suggestion-item');
                if (item) {
                    e.preventDefault();
                    if (item.classList.contains('mobile-subreddit-item')) {
                        const name = item.querySelector('span:last-child').textContent.replace('r/', '');
                        if (window.closeMobileSuggestions) window.closeMobileSuggestions();
                        const searchResults = document.getElementById('search-results');
                        const hasResults = searchResults && searchResults.children.length > 0;
                        if (currentTab === 'search' && hasResults) {
                            navStack.push({ screen: 'search-results', filters: { ...appState } });
                        }
                        if (searchResults) searchResults.innerHTML = '';
                        document.body.classList.remove('has-results');
                        performViewTransition('forward', () => openSubredditView(name, true));
                        return;
                    }
                    const word = item.dataset.word;
                    const subreddit = item.dataset.subreddit || null;
                    selectSuggestion(word, inputId, suggestionsId, subreddit);
                }
            });
        };
        
        async function fetchSubredditMatches(query, signal) {
            const cleanQuery = query.replace(/^r\//, '').trim();
            if (!cleanQuery) return [];
            try {
                const res = await fetch(`${API_BASE}/reddit?url=https://www.reddit.com/subreddits/search.json?q=${encodeURIComponent(cleanQuery)}`, { signal });
                const data = await res.json();
                if (!data?.data?.children) return [];
                const filtered = [];
                const partial = [];
                const q = cleanQuery.toLowerCase();
                for (const child of data.data.children) {
                    const name = child?.data?.display_name?.toLowerCase();
                    if (!name) continue;
                    if (name.startsWith(q) && filtered.length < 4) filtered.push(child.data.display_name);
                    else if (name.includes(q) && partial.length < 4) partial.push(child.data.display_name);
                    if (filtered.length >= 4 && partial.length >= 4) break;
                }
                const results = filtered.length >= 3 ? filtered : [...filtered, ...partial].slice(0, 4);
                return results;
            } catch (err) {
                if (err.name === 'AbortError') return [];
                console.error('❌ fetchSubredditMatches error:', err);
                return [];
            }
        }

        async function appendSubredditSuggestions(query, suggestionsDiv, signal) {
            const matches = await fetchSubredditMatches(query, signal);
            if (signal.aborted || matches.length === 0) return;
            if (!suggestionsDiv.classList.contains('suggestions-visible')) return;

            // Remove any previous subreddit section
            const existing = suggestionsDiv.querySelector('.mobile-subreddit-section');
            if (existing) existing.remove();

            const section = document.createElement('div');
            section.className = 'mobile-subreddit-section';

            const divider = document.createElement('div');
            divider.className = 'mobile-subreddit-divider';
            divider.textContent = 'Subreddits';
            section.appendChild(divider);

            matches.forEach(name => {
                const item = document.createElement('div');
                item.className = 'suggestion-item mobile-subreddit-item';

                const icon = document.createElement('span');
                icon.className = 'suggestion-icon subreddit-icon';
                icon.textContent = name.charAt(0).toUpperCase();
                item.appendChild(icon);

                const label = document.createElement('span');
                label.textContent = `r/${name}`;
                item.appendChild(label);

                // Load real icon async
                getSubredditIcon(name).then(iconUrl => {
                    if (signal.aborted) return;
                    if (iconUrl && iconUrl.startsWith('http')) {
                        const img = document.createElement('img');
                        img.src = iconUrl;
                        img.alt = name;
                        img.onload = () => {
                            icon.textContent = '';
                            icon.appendChild(img);
                            icon.classList.add('icon-loaded');
                        };
                    }
                }).catch(() => {});

                section.appendChild(item);
            });

            suggestionsDiv.appendChild(section);
        }

        async function getSmartSuggestions(query, suggestionsDiv, dictionary, signal) {
            let trimmedQuery = query.trim();

            // If empty, show top searches instead
            if (!trimmedQuery) {
                try {
                    const response = await fetch(`${API_BASE}/api/top-searches`, { signal });
                    const data = await response.json();
                    const filteredData = data.filter(item => item.query.length > 2);
                    if (signal.aborted) return;
                    displaySuggestions(filteredData, suggestionsDiv);
                } catch (e) {
                    if (e.name !== 'AbortError') console.error('❌ Top searches error:', e);
                }
                return;
            }

            // Always spell check
            const correctedQuery = correctLastWord(trimmedQuery, dictionary);
            if (correctedQuery !== trimmedQuery) {
                trimmedQuery = correctedQuery;
            }

            // Recalculate words after potential correction
            const words = trimmedQuery.split(' ');
            const lastWord = words[words.length - 1];
            const fuse = getFuse(dictionary, { threshold: 0.4 });

            // Get stored suggestions from database first
            let storedSuggestions = [];
            try {
                const subreddit = subredditInput.value?.trim() || '';
                const url = `${API_BASE}/api/suggestions?q=${encodeURIComponent(query)}`;
                const response = await fetch(url, { signal });
                const data = await response.json();
                storedSuggestions = data
                    .filter(item => item.query.length > 2)
                    .map(item => ({
                        query: item.query,
                        subreddit: item.subreddit,
                        isStored: true
                    }));
            } catch (error) {
                if (error.name === 'AbortError') return;
                console.error("❌ Stored suggestions error:", error);
            }

            // Calculate remaining slots for pattern suggestions
            const remainingSlots = Math.max(0, 6 - storedSuggestions.length);
            let patternSuggestions = [];

            if (remainingSlots > 0) {
                const hasTrailingSpace = query.endsWith(' ');
                const isElonMode = (words.length === 1 && dictionary.includes(trimmedQuery.toLowerCase())) ||
                    (hasTrailingSpace && words.length === 1);
                if (isElonMode) {
                    // Search for next term after first word mode ('elon musk')
                    try {
                        const apiUrl = `https://api.datamuse.com/words?rel_trg=${encodeURIComponent(trimmedQuery)}&max=${remainingSlots}`;
                        const response = await fetch(apiUrl, { signal });
                        const data = await response.json();
                        const apiWords = data.map(item => `${trimmedQuery} ${item.word}`);

                        // If no API results, show the original query as fallback
                        if (apiWords.length === 0) {
                            patternSuggestions = [trimmedQuery];
                        } else {
                            patternSuggestions = [trimmedQuery, ...apiWords].slice(0, remainingSlots);
                        }
                    } catch (error) {
                        if (error.name === 'AbortError') return;
                        patternSuggestions = [trimmedQuery];
                    }
                } else {
                    // Complete the word mid-phrase mode ('grilled chick -> grilled chicken')
                    const results = fuse.search(lastWord).slice(0, remainingSlots - 1);
                    const fullSuggestions = results.map(result => {
                        const newWords = [...words];
                        newWords[newWords.length - 1] = result.item;
                        return newWords.join(' ');
                    });

                    // If no fuzzy results, show the original query as fallback
                    if (fullSuggestions.length === 0) {
                        patternSuggestions = [trimmedQuery];
                    } else {
                        patternSuggestions = [trimmedQuery, ...fullSuggestions].slice(0, remainingSlots);
                    }
                }
            }

            // Only filter out the original query if there are other suggestions
            if (patternSuggestions.length > 1) {
                patternSuggestions = patternSuggestions.filter(suggestion =>
                    suggestion.toLowerCase() !== trimmedQuery.toLowerCase()
                );
            }

            // Remove duplicates, keep stored suggestions first
            const seen = new Set();
            const deduplicated = [];

            storedSuggestions.forEach(suggestion => {
                const key = suggestion.query.toLowerCase().trim();
                if (!seen.has(key)) {
                    seen.add(key);
                    deduplicated.push(suggestion);
                }
            });

            patternSuggestions.forEach(suggestion => {
                const key = suggestion.toLowerCase().trim();
                if (!seen.has(key)) {
                    seen.add(key);
                    deduplicated.push(suggestion);
                }
            });

            if (signal.aborted) return;

            displaySuggestions(deduplicated.slice(0, 3), suggestionsDiv);
        }

        function isIncompleteWord(word, dictionary) {
            return !dictionary.includes(word.toLowerCase());
        }

        function correctLastWord(query, dictionary) {
            const words = query.trim().split(' ');
            const lastWord = words[words.length - 1];

            // ✅ If the word is already in the dictionary, leave it alone
            if (dictionary.includes(lastWord.toLowerCase())) {
                return query;
            }

            const fuse = getFuse(dictionary, {
                threshold: 0.4,
                includeScore: true,
            });

            let results = fuse.search(lastWord);

            if (results.length === 0) {
                return query; // no suggestions
            }

            // ✅ Penalize suggestions that are too long or short
            results = results.map(result => {
                const lenDiff = Math.abs(result.item.length - lastWord.length);
                const penalty = lenDiff * 0.01; // mild penalty
                return {
                    ...result,
                    adjustedScore: result.score + penalty,
                };
            });

            results.sort((a, b) => a.adjustedScore - b.adjustedScore);

            const best = results[0];
            const second = results[1];


            // ✅ Only correct if the match is pretty confident
            if (best.adjustedScore < 0.3) {
                words[words.length - 1] = best.item;
                return words.join(' ');
            }

            return query;
        }

        function displaySuggestions(suggestions, suggestionsDiv) {
            if (window.searchJustSubmitted) return;
            // Fuck 'contrabassoon' in particular, that actually came up in the word completion api

            // GET THEE TO A NUNNERY
            const nsfwPattern = /(contrabassoon|幼女|色情|裸体|性交|做爱|黄色|福利|种子|番号|萝莉|正太|乳房|阴茎|阴道|genitals|undress|genital|fucking|fuck|fucker|tits|titties|milf|loli|fucked|tiddies|nudes|shota|guro|onlyfans|hentai|\bsex|\brape\b|breeder|raped|gonewild|boobs|\bcum\b|\bcock\b|shit|shits|shitted|shat|cocksucker|cocks|cunt|gape|gooning|gooner|goon|pussy|porn)/i;

            // Defend the virtuous words 
            const filteredSuggestions = suggestions.filter(suggestion => {
                const query = typeof suggestion === 'string' ? suggestion : suggestion.query;
                return !nsfwPattern.test(query);
            });

            const suggestionsHtml = filteredSuggestions.map(suggestion => {
                const word = typeof suggestion === 'string' ? suggestion : suggestion.query;
                const suggestionSubreddit = typeof suggestion === 'object' ? suggestion.subreddit : null;

                const iconContent = suggestionSubreddit ?
                    `<span class="suggestion-icon subreddit-icon">${suggestionSubreddit.charAt(0).toUpperCase()}</span>` :
                    '<img src="/assets/search-favicon.png" class="suggestion-favicon" alt="Search">';

                const subredditName = suggestionSubreddit ? `<span class="suggestion-subreddit">• r/${suggestionSubreddit.toLowerCase()}</span>` : '';

                return `<div data-word="${word}" data-subreddit="${suggestionSubreddit || ''}" class="suggestion-item">
            ${iconContent}
            ${word}
            ${subredditName}
        </div>`;
            }).join('');

            const existingSubredditSection = suggestionsDiv.querySelector('.mobile-subreddit-section');
            suggestionsDiv.innerHTML = suggestionsHtml;
            if (existingSubredditSection) suggestionsDiv.appendChild(existingSubredditSection);

            // Prepend subreddit filter banner if chip is active
            if (currentFilters.subreddit) {
                const banner = createSubredditBanner(currentFilters.subreddit);
                suggestionsDiv.prepend(banner);
            }
            suggestionsDiv.classList.add('suggestions-visible');
            openMobileSuggestions(suggestionsDiv);

            // Add real icons for suggestions that have subreddit data
            const suggestionElements = suggestionsDiv.querySelectorAll('[data-subreddit]');
            suggestionElements.forEach(element => {
                const subredditName = element.getAttribute('data-subreddit');
                if (subredditName) {
                    addIconToSuggestion(element, subredditName);
                }
            });
        }

        let fuseInstance = null;
        let fuseDictionary = null;

        function getFuse(dictionary) {
            if (dictionary !== fuseDictionary) {
                fuseDictionary = dictionary;
                fuseInstance = new Fuse(dictionary, { threshold: 0.4 });
            }
            return fuseInstance;
        }

        async function addIconToSuggestion(suggestionElement, subreddit) {
            if (!subreddit) return;

            suggestionElement.querySelector('.suggestion-favicon')?.remove();

            const iconContainer = suggestionElement.querySelector('.suggestion-icon');

            // Start with letter fallback
            iconContainer.textContent = subreddit.charAt(0).toUpperCase();

            const storageKey = `subreddit_icon_${subreddit}`;
            const cachedIcon = sessionStorage.getItem(storageKey);

            // Check sessionStorage first
            if (cachedIcon && cachedIcon !== 'null' && cachedIcon !== '/api/placeholder/20/20') {
                const img = document.createElement('img');
                img.src = cachedIcon;
                img.alt = `Icon for r/${subreddit}`;
                img.className = 'subreddit-icon-img';
                iconContainer.textContent = '';
                iconContainer.appendChild(img);
                setTimeout(() => img.classList.add('fade-in'), 10);
                iconContainer.classList.add('icon-loaded');
            } else if (!cachedIcon || cachedIcon === 'null') {
                // Fetch from API
                getSubredditIcon(subreddit).then(iconUrl => {
                    if (iconUrl && iconUrl !== '/api/placeholder/20/20') {
                        const img = document.createElement('img');
                        img.src = iconUrl;
                        img.alt = `Icon for r/${subreddit}`;
                        img.className = 'subreddit-icon-img';
                        iconContainer.textContent = '';
                        iconContainer.appendChild(img);
                        setTimeout(() => img.classList.add('fade-in'), 10);
                        iconContainer.classList.add('icon-loaded');
                        sessionStorage.setItem(storageKey, iconUrl);
                    }
                });
            }
        }

        function selectSuggestion(word, inputId, suggestionsId, subreddit = null) {
            const inputEl = document.getElementById(inputId);
            inputEl.value = word;
            inputEl.blur();
            if (window.closeMobileSuggestions) window.closeMobileSuggestions();

            // If this suggestion has a subreddit, auto-select it
            if (subreddit) {
                selectSubreddit(subreddit);
            }

            // If coming from subreddit view, sync filters and switch to search tab
            if (currentTab === 'subreddit') {
                navStack.push({ screen: 'subreddit', subreddit: currentFilters.subreddit });
                const f = getCurrentFiltersFromUI();
                currentFilters.query = f.query; currentFilters.subreddit = f.subreddit; currentFilters.sort = f.sort; currentFilters.time = f.time; currentFilters.contentType = f.contentType;
                switchTab('search');
            }

            // Store/increment the suggestion
            if (word) {
                try {
                    const searchType = determineSearchType();
                    const isVectorSearch = searchType === 'vector';

                    fetch(`${API_BASE}/api/suggestions/store`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            query: word,
                            subreddit: (subreddit && subreddit !== 'undefined' && subreddit !== 'null') ? subreddit : null,
                            is_vector_search: isVectorSearch
                        })
                    });
                } catch (err) {
                    console.error("Failed to store suggestion:", err);
                }
            }

            // Reset for new search
            resetSortToHot();
            window.dispatchEvent(new Event('search-started'));
            handleSearchRequest();
        }

        function setSubredditChip(subName) {
            if (!subredditChipContainer) return;
            const show = !!subName && subName.toLowerCase() !== 'all';
            subredditChipContainer.classList.toggle('chip-visible', show);
            subredditChipContainer.querySelector('.chip-text').textContent = show ? `r/${subName}` : '';
        }

        function fadeOutCard(card, currentSectionId) {
            if (!isMobile()) return;
            const bookmarksScreen = document.getElementById('screen-bookmarks');
            if (!bookmarksScreen?.classList.contains('active')) return;
            card.style.transition = 'opacity 0.3s ease';
            card.style.opacity = '0';
            setTimeout(() => {
                card.remove();
                if (sectionOffsets[currentSectionId] > 0) sectionOffsets[currentSectionId]--;
                const remaining = document.querySelectorAll('.result-card');
                if (remaining.length === 0) {
                    if (!hasMoreBookmarks[currentSectionId]) {
                        showError('No bookmarks found. Start saving posts to see them here.');
                    } else {
                        loadSectionContent(currentSectionId, true);
                    }
                }
            }, 300);
        }

        function createSubredditBanner(subreddit, onRemove) {
            const banner = document.createElement('div');
            banner.className = 'suggestions-subreddit-banner';
            banner.innerHTML = `
                <span class="ssb-label">Searching in</span>
                <span class="ssb-chip">r/${subreddit}<button class="ssb-remove" aria-label="Remove subreddit filter">×</button></span>
            `;
            banner.querySelector('.ssb-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                setSubredditChip('');
                currentFilters.subreddit = '';
                const subredditInput = document.getElementById('subreddit-input');
                if (subredditInput) subredditInput.value = '';
                banner.remove();
                if (onRemove) onRemove();
            });
            return banner;
        }

        function selectSubreddit(subName) {
            setSubredditChip(subName);
            subredditInput.value = '';
            subredditSuggestions.classList.remove('active');
        }

        function buildCacheKey(baseToken, filters) {
            const encode = str => encodeURIComponent(str || '');

            const query = encode(filters.query);
            const subreddit = encode((filters.subreddit || 'all').toLowerCase());

            // Force 'ultimate' to be treated as 'hot' in cache key
            const rawSort = filters.sort || 'hot';
            const sort = encode(rawSort === 'ultimate' ? 'hot' : rawSort);

            const time = encode(filters.time || 'all');

            return `${baseToken}__${subreddit}__${sort}__${query}__${time}`;
        }

        function performEnhancedSearch(navigateBack = false) {
            const f = getCurrentFiltersFromUI();
            currentFilters.query = f.query; currentFilters.subreddit = f.subreddit; currentFilters.sort = f.sort; currentFilters.time = f.time; currentFilters.contentType = f.contentType;
            const query = currentFilters.query?.trim() || '';
            const subreddit = currentFilters.subreddit || null;

            // Handle empty cases
            if (!query && !subreddit) {
                showError(`No search terms detected.${isMobile() ? '' : '🔎'}`);
                handleRandomResponse([
                    "Throw me a bone here.",
                    "I'm gonna need more than that.",
                    "That's not on my records.",
                    "Don't know where I'd find 'blankity blank blank.'",
                    "No can do."
                ]);
                return;
            }

            // If no query but has subreddit, fall back to regular search
            if (!query && subreddit) {
                handleSearchRequest(null, null, false);
                return;
            }

            if (subreddit && subreddit !== 'all') {
                saveRecentSubreddit(subreddit);
            }

            document.querySelector('.vector-scroll-loader')?.remove();
            showLoading(getResultsContainer());

            // Only do vector search if there is a query
            fetch(`${API_BASE}/api/vector-search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    query: query,
                    subreddit: subreddit === 'all' ? null : subreddit,
                    limit: 100, // Get 100 results for scrollination
                    timeFilter: currentFilters.time || 'all'
                })
            })
                .then(response => {

                    return response.json();
                })
                .then(vectorData => {
                    // Check for empty results
                    if (!vectorData.data.children || vectorData.data.children.length === 0) {
                        showError("No results found. Try different search terms or filters.");
                        handleRandomResponse([
                            "Nothing in the archives.",
                            "No dice.",
                            "I couldn't find that, kid.",
                            "Sorry, squirt.",
                            "That's not on my records.",
                            "Shucks.",
                            "Nada.",
                            "I got nothin'.",
                            "Not familiar with that.",
                            "That's a dead end.",
                            "Not in my files.",
                            "Zilch.",
                            "No can do."
                        ]);
                        return;
                    }

                    // Store all results for scrollination
                    let allResults = vectorData.data.children.map(trimRedditPostData);

                    // Apply content filter BEFORE slicing
                    const selectedFilter = document.getElementById('content-select').value;
                    if (selectedFilter !== 'all') {
                        allResults = allResults.filter(post => classifyContentType(post) === selectedFilter);
                    }

                    // Only show first 10 initially (after filtering)
                    const initialResults = allResults.slice(0, 10);
                    // Generate pagination token from the last post shown
                    const paginationToken = initialResults.length === 10 ? `t3_${initialResults[9].id}` : null;

                    // Set global tokens
                    currentAfter = paginationToken;
                    currentBefore = null;


                    // Store for scrollination
                    currentVectorResults = allResults;
                    currentVectorOffset = 10;
                    hasMoreVectorResults = allResults.length > 10;                    
                    handleSearchResults(initialResults);
                    if (!navigateBack) {
                        Object.assign(appState, { after: currentAfter, before: currentBefore });
                        history.replaceState({}, '', urlFromState(appState));
                    }
                    // Create vector scroll indicator 
                    if (!document.querySelector('.vector-scroll-loader')) {
                        const indicator = document.createElement('div');
                        indicator.className = 'vector-scroll-loader';
                        indicator.style.display = 'flex';
                        indicator.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>`;
                        document.body.appendChild(indicator);
                    }

                    // Position the indicator
                    positionVectorScrollIndicator();
                    setupVectorScrollListener();
                })
                .catch(error => {
                    console.error("Vector search failed.", error);
                    showError("Vector search failed.");
                });
        }

        function loadMoreVectorResults() {
            if (isVectorLoading || !hasMoreVectorResults) return;

            isVectorLoading = true;

            // Get next 10 results from currentVectorResults
            const nextResults = currentVectorResults.slice(currentVectorOffset, currentVectorOffset + 10);

            if (nextResults.length === 0) {
                hasMoreVectorResults = false;
                positionVectorScrollIndicator();
                isVectorLoading = false;
                return;
            }

            // Transform to the format displayResults expects
            const transformedData = {
                data: {
                    children: nextResults.map(post => ({ data: post }))
                }
            };

            // Display with isLoadMore = true
            displayResults(transformedData, true);

            // Update offset
            currentVectorOffset += 10;

            // Check if we have more
            if (currentVectorOffset >= currentVectorResults.length) {
                hasMoreVectorResults = false;
                // Hide indicator immediately when we've loaded everything
                const indicator = document.querySelector('.vector-scroll-loader');
                if (indicator) {
                    indicator.style.display = 'none';
                }
            }

            // Update indicator position
            positionVectorScrollIndicator();
            isVectorLoading = false;
        }

        function setupVectorScrollListener() {
            vectorScrollHandler = function () {
                // Only run during vector search - check if we have vector results
                if (!currentVectorResults.length || !hasMoreVectorResults || isVectorLoading) return;

                if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
                    loadMoreVectorResults();
                }
            };
            window.addEventListener('scroll', vectorScrollHandler);
        }

        function positionVectorScrollIndicator() {
            const indicator = document.querySelector('.vector-scroll-loader');
            if (!indicator) return;

            const footer = document.querySelector('footer');
            if (footer) {
                footer.appendChild(indicator);
                indicator.style.position = 'relative';
                indicator.style.top = '-210px';
                indicator.style.left = '50%';
                indicator.style.transform = 'translateX(-50%)';

                // ONLY show if we actually have more results
                if (hasMoreVectorResults) {
                    setTimeout(() => {
                        // Double-check hasMoreVectorResults in case it changed
                        if (hasMoreVectorResults) {
                            indicator.style.display = 'flex';
                        } else {
                            indicator.style.display = 'none';
                        }
                    }, 1000);
                } else {
                    // Hide immediately if no more results
                    indicator.style.display = 'none';
                }
            }
        }

        function cleanupUI() {
            const toRemove = ['.button-group', '.tabs-section'];
            const toHide = ['.scroll-container-minimal'];

            toRemove.forEach(selector => {
                const element = document.querySelector(selector);
                if (element) element.remove();
            });

            toHide.forEach(selector => {
                const element = document.querySelector(selector);
                if (element) element.style.display = 'none';
            });

            const grid = document.getElementById('explore-grid');
            if (grid) grid.style.display = 'none';
        }

        function determineSearchType() {
                const filters = getCurrentFiltersFromUI();
                const toggle1 = document.getElementById('toggle1');
                const isEnhancedOn = toggle1 ? toggle1.checked : false;
                const hasQuery = filters.query && filters.query.trim() !== '';
                const hasSubreddit = filters.subreddit && filters.subreddit.trim() !== '';

                // First, housekeeping before search
                cleanupUI();

                // Reset title and meta tags 
                document.title = "KarmaFinder";
                const descMeta = document.querySelector('meta[name="description"]');
                const ogMeta = document.querySelector('meta[property="og:title"]');
                if (descMeta) descMeta.content = "Find exactly what you're looking for on Reddit";
                if (ogMeta) ogMeta.content = "KarmaFinder";

                // Enhanced search with query = vector search
                if (isEnhancedOn && hasQuery) {
                    return 'vector';
                }

                // Enhanced search with only subreddit = regular search  
                if (isEnhancedOn && hasSubreddit && !hasQuery) {
                    return 'regular';
                }

                // Progressive search conditions (ONLY when enhanced is OFF)
                if (!isEnhancedOn) {
                const sort = currentTab === 'subreddit' ? (appState.subredditSort || filters.sort) : filters.sort;
                const time = currentTab === 'subreddit' ? (appState.subredditTime || filters.time) : filters.time;
                const hasTimeFilter = time !== 'all';
                const hasContentFilter = filters.contentType !== 'all';
                const isHotOrNew = sort === 'new' || sort === 'hot';
                const needsProgressive = (isHotOrNew && hasTimeFilter) || hasContentFilter;
                    if (needsProgressive) {
                        return 'progressive';
                    }
                }

                // Default to regular search
                return 'regular';
            }

        function handleSearchRequest(after = null, before = null, navigateBack = false, useCurrentFilters = false) {
            if (!useCurrentFilters && !navigateBack && after === null && before === null && (currentTab === 'search' || currentTab === 'home' || currentTab === 'subreddit' || currentTab === 'bookmarks')) {
                const f = getCurrentFiltersFromUI();
                currentFilters.query = f.query; currentFilters.subreddit = f.subreddit; currentFilters.sort = f.sort; currentFilters.time = f.time; currentFilters.contentType = f.contentType;
                if (currentTab === 'search') document.body.classList.add('has-results');
            }
            // Reset shared content flag and clean up URL when doing normal searches
            if (window.location.pathname.includes('/share/')) {
                window.isViewingSharedContent = false;
                window.history.replaceState({}, '', '/');
            }

            // Blocklist check
            if (isBlockedSubreddit(currentFilters.subreddit) && isMobile()) {
                showBlockedSubredditError();
                setClownButton(true);
                return;
            }

            const searchType = determineSearchType();

            // Remove vector scroll behavior if switching away
            if (searchType !== 'vector' && vectorScrollHandler) {
                window.removeEventListener('scroll', vectorScrollHandler);
                vectorScrollHandler = null;
                const indicator = document.querySelector('.vector-scroll-loader');
                if (indicator) indicator.remove();
            }

            // Reset pagination for any new search (not paginating or navigating back)
            if (!navigateBack && after === null) {
                currentAfter = null;
                currentBefore = null;
            }

            switch (searchType) {
                case 'vector':
                    return performEnhancedSearch(after, before, navigateBack);
                case 'progressive':
                    return performProgressiveSearch(after, before, navigateBack);
                case 'regular':
                default:
                    return performSearch(after, before, navigateBack);
            }
        }




        async function performProgressiveSearch(after = null, before = null, navigateBack = false) {
            if (!isScrollLoad) showLoading(getResultsContainer());

            const filters = currentFilters;
            const query = filters.query?.trim() || '';
            const subreddit = filters.subreddit || '';
            const sort = currentTab === 'subreddit' ? (appState.subredditSort || filters.sort) : filters.sort;
            const time = currentTab === 'subreddit' ? (appState.subredditTime || filters.time) : filters.time;
            const contentType = filters.contentType;

            const limit = 10;
            const MAX_FETCHES = 5;
            let fetchCount = 0;
            let allFilteredPosts = [];
            let currentAfterToken = after || currentAfter;

            while (allFilteredPosts.length < 11 && fetchCount < MAX_FETCHES) {
                fetchCount++;
                try {
                    const finalUrl = buildRedditUrl(query, subreddit, sort, time, limit, currentAfterToken);
                    const response = await fetch(`${API_BASE}/reddit?url=${encodeURIComponent(finalUrl)}`);
                    const batchData = await response.json();

                    if (!batchData.data.children?.length) break;

                    const trimmedData = batchData.data.children.map(post => trimRedditPostData(post));
                    let filteredBatch = filterPostsByTime(trimmedData, time);
                    filteredBatch = filterPostsByContent(filteredBatch, contentType);

                    if (fetchCount === 1 && filteredBatch.length === 0) break;
                    if (trimmedData.length && filteredBatch.length === 0 && time !== 'all') break;

                    allFilteredPosts.push(...filteredBatch);
                    currentAfterToken = batchData.data.after;

                    if (!currentAfterToken) break;

                } catch (err) {
                    console.error('❌ Error during fetch:', err);
                    break;
                }
            }

            const finalResults = allFilteredPosts.slice(0, 10);
            const hasMore = allFilteredPosts.length > 10;
            const paginationToken = hasMore ? `t3_${finalResults[9].id}` : null;

            currentFilters.query = filters.query;
            currentFilters.subreddit = filters.subreddit;
            currentFilters.sort = sort;
            currentFilters.time = time;
            currentFilters.contentType = filters.contentType;
            currentBefore = null;
            currentAfter = paginationToken;
            handleSearchResults(finalResults);
            commitSearchState(navigateBack);
        }

















    function handleSearchResults(filtered) {
        isRestoringHome = false;
        const append = isScrollLoad;
        isScrollLoad = false;
        displayResults(filtered, append);
        if (filtered.length > 0) preloadBookmarks();
    }

    function setupSearchScrollListener() {
        window.addEventListener('scroll', function() {
                if (currentTab !== 'search' && currentTab !== 'subreddit' && currentTab !== 'home') return;
            if (!currentAfter || isLoading) return;
            const distanceFromBottom = document.body.offsetHeight - (window.scrollY + window.innerHeight);
            if (distanceFromBottom <= 100) {
                isLoading = true;
                isScrollLoad = true;
                handleSearchRequest(currentAfter, null, false, true);
            }
        });
    }

    function commitSearchState(navigateBack, isScroll) {
        if (!navigateBack) {
            Object.assign(appState, { tab: currentTab, query: currentFilters.query, subreddit: currentFilters.subreddit, sort: currentFilters.sort, time: currentFilters.time, contentType: currentFilters.contentType, after: currentAfter, before: currentBefore });
            if (isMobile() || isScroll) {
                history.replaceState({}, '', urlFromState(appState));
            } else {
                history.pushState({}, '', urlFromState({ ...appState, after: null, before: null }));
            }
        }
        if (tabState[currentTab]) {
            tabState[currentTab].after = currentAfter;
            tabState[currentTab].before = currentBefore;
        }
        if (currentTab === 'home') lastHomeState = { ...appState };
        if (currentTab === 'search') lastSearchState = { ...appState };
        if (currentTab === 'subreddit') lastSubredditState = { ...appState };
    }

    async function performSearch(after = null, before = null, navigateBack = false) {

        const searchToken = activeQueryToken;

        if (navigateBack) {
            const f = getFiltersFromURL();
            currentFilters.query = f.query; currentFilters.subreddit = f.subreddit; currentFilters.sort = f.sort; currentFilters.time = f.time; currentFilters.contentType = f.contentType;
        }

        const searchInputEl = document.getElementById('search-input');
        const query = searchInputEl?.value?.trim() || currentFilters.query?.trim() || '';
        const subreddit = currentFilters.subreddit || '';
        const sort = currentFilters.sort || 'hot';
        const time = currentFilters.time || 'all';
        currentFilters.query = query;

        if (sort === 'relevance' && !query) {
            showError(`No search terms detected.${isMobile() ? '' : '🔎'}`);
            return;
        }

        const limit = 10;

        // Set tokens
        if (!navigateBack) {
            currentAfter = isScrollLoad ? (after || currentAfter) : after;
            currentBefore = before || currentBefore;
        } else {
            currentAfter = after || null;
            currentBefore = before || null;
        }

        if (subreddit && subreddit !== 'all') {
            saveRecentSubreddit(subreddit);
        }

        const tokenForThisPage = buildCacheKey(after || 'page_1', { ...currentFilters, query, subreddit: subreddit || appState.subreddit, sort, time });
        const finalUrl = buildRedditUrl(query, subreddit, sort, time, limit, currentAfter, currentBefore);

        const params = new URLSearchParams();
        if (subreddit && subreddit !== 'all') params.append('subreddit', subreddit);
        if (query) params.append('query', query);
        if (time !== 'all') params.append('time', time);
        if (sort) params.append('sort', sort);
        if (after) params.append('after', after);
        params.append('limit', limit.toString());

        if (!isScrollLoad) showLoading(getResultsContainer());
        const wasScrollLoad = isScrollLoad;

        try {
            // Attempt DB fetch first
            const dbRes = await fetch(`${API_BASE}/api/db-posts?${params.toString()}`);
            if (!dbRes.ok) throw new Error('DB fetch failed');
            const dbResult = await dbRes.json();

            if (searchToken !== activeQueryToken) return;

            if (dbResult?.data?.children?.length > 0) {
                currentAfter = dbResult.data.after || null;
                currentBefore = dbResult.data.before || null;
                const trimmedData = dbResult.data.children.map(trimRedditPostData);
                const filtered = filterPostsByTime(trimmedData, currentFilters.time);
                handleSearchResults(filtered);
                commitSearchState(navigateBack, wasScrollLoad);
                return;
            }

            // Reddit API fallback
            const redditRes = await fetch(`${API_BASE}/reddit?url=${encodeURIComponent(finalUrl)}`);
            if (redditRes.status === 429) {
                showError("We're being rate limited by Reddit. Please check back in a minute.");
                return;
            }
            if (!redditRes.ok) throw new Error('Reddit API failed');
            const data = await redditRes.json();

            if (searchToken !== activeQueryToken) return;

            if (!data?.data?.children) {
                console.error('[performSearch] Unexpected Reddit response:', data);
                showError("Something went wrong. Please try again.");
                return;
            }

            currentAfter = data.data.after || null;
            currentBefore = data.data.before || null;

            const trimmedData = data.data.children.map(trimRedditPostData);
            const filtered = filterPostsByTime(trimmedData, currentFilters.time);

            if (filtered.length > 0) {
                savePostsToDatabase(filtered.map(p => ({ data: p })), tokenForThisPage);
            }

            handleSearchResults(filtered);
            commitSearchState(navigateBack, wasScrollLoad);

        } catch (err) {
            isLoading = false;
            isScrollLoad = false;
            console.error("Search error:", err);
            showError("Something went wrong. Please try again.");
        }
    }







        

        function buildRedditUrl(query, subreddit, sort, time, limit, after = null, before = null) {
            let finalUrl = '';
            const isQuerying = query && query.length > 0;
            const encodedQuery = encodeURIComponent(query || '');

            // Convert ultimate sort to hot for Reddit API
            const redditSort = (sort === 'ultimate') ? 'hot' : sort;

            if (isQuerying) {
                finalUrl = `https://www.reddit.com${subreddit ? `/r/${subreddit}` : ''}/search.json?q=${encodedQuery}&sort=${redditSort}&restrict_sr=1&limit=${limit}&t=${time}`;
            } else if (subreddit) {
                finalUrl = `https://www.reddit.com/r/${subreddit}/${redditSort}.json?limit=${limit}&t=${time}`;
            } else {
                finalUrl = `https://www.reddit.com/r/all/${redditSort}.json?limit=${limit}&t=${time}`;
            }

            if (after) finalUrl += `&after=${after}`;
            if (before) finalUrl += `&before=${before}`;

            return finalUrl;
        }

        function noResultsMessage(errorText = `No results found. Try different search terms or filters.${isMobile() ? '' : '🔎'}`) {
            showLoading(getResultsContainer());
            showError(errorText);
            handleRandomResponse([
                "I couldn't find that, kid.",
                "No dice.",
                "Sorry, squirt.",
                "That's not on my records.",
                "Shucks.",
                "Nada.",
                "I got nothin'.",
                "Not familiar with that.",
                "That's a dead end.",
                "Not in my files.",
                "Never heard of that.",
                "Zilch.",
                "No can do."
            ]);
        }

        function createPostHeader(post, bookmarkId) {
            const resultHeader = document.createElement('div');
            resultHeader.className = 'result-header';

            // Subreddit link
            const subredditLink = document.createElement('a');
            subredditLink.className = 'result-subreddit';
            subredditLink.href = `/?sub=${post.subreddit}&sort=hot`;
            subredditLink.target = '_blank';
            subredditLink.addEventListener('click', (e) => {
                e.preventDefault();
                const subredditName = post.subreddit;
                if (bannedSubreddits.includes(subredditName.toLowerCase())) {
                    showError(`<div style="text-align: center;"><img src="https://media4.giphy.com/media/v1.Y2lkPTc5MGI3NjExOWtmaXgzdmdxdzU0dHJ0dXB5MXV2bWdpb2FqYXZndWc1eGNuZTAwMSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Vuw9m5wXviFIQ/giphy.gif" alt="Rick Astley dancing" style="width: 300px; border-radius: 8px;"></div>`);
                    return;
                }
                performViewTransition('forward', () => openSubredditView(post.subreddit));
            });

            // Subreddit icon
            const subredditIcon = document.createElement('div');
            subredditIcon.className = 'subreddit-icon';
            subredditIcon.textContent = post.subreddit.charAt(0).toUpperCase();
            const storageKey = `subreddit_icon_${post.subreddit}`;
            const cachedIcon = sessionStorage.getItem(storageKey);
            const fallbackIcon = '/api/placeholder/20/20';
            function tryLoadIcon(url) {
                const img = document.createElement('img');
                img.src = url;
                img.alt = `Icon for r/${post.subreddit}`;
                img.className = 'subreddit-icon-img';
                img.onload = () => {
                    subredditIcon.textContent = '';
                    subredditIcon.appendChild(img);
                    setTimeout(() => img.classList.add('fade-in'), 10);
                    subredditIcon.classList.add('icon-loaded');
                    post.icon_url = url;
                    sessionStorage.setItem(storageKey, url);
                };
                img.onerror = () => console.warn(`⚠️ Icon failed to load for r/${post.subreddit}: ${url}`);
            }
            if (cachedIcon && cachedIcon !== 'null' && cachedIcon !== fallbackIcon) {
                tryLoadIcon(cachedIcon);
            } else if (post.icon_url && post.icon_url !== null && post.icon_url !== fallbackIcon) {
                tryLoadIcon(post.icon_url);
                sessionStorage.setItem(storageKey, post.icon_url);
            } else {
                getSubredditIcon(post.subreddit).then(iconUrl => {
                    tryLoadIcon(iconUrl && iconUrl !== fallbackIcon ? iconUrl : fallbackIcon);
                }).catch(() => tryLoadIcon(fallbackIcon));
            }
            subredditLink.appendChild(subredditIcon);
            subredditLink.appendChild(document.createTextNode('r/' + post.subreddit));

            // Bookmark icon
            const bookmarkContainer = document.createElement('div');
            bookmarkContainer.className = 'bookmark-container';
            const bookmarkIcon = document.createElement('div');
            bookmarkIcon.className = 'bookmark-icon';
            bookmarkIcon.title = 'Save post';
            bookmarkIcon.dataset.postId = bookmarkId;
            bookmarkIcon.setAttribute('tabindex', '0');
            document.addEventListener('keydown', function (e) {
                if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('bookmark-icon')) {
                    e.preventDefault();
                    e.target.click();
                }
            });
            const savedBookmarks = JSON.parse(sessionStorage.getItem('bookmarks') || '{}');
            if (savedBookmarks[bookmarkId]) {
                bookmarkIcon.classList.add('saved');
                fetch(`${API_BASE}/api/bookmarks/${bookmarkId}/score`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ score: post.score })
                }).catch(err => console.error('Score update failed:', err));
            }
            bookmarkContainer.appendChild(bookmarkIcon);

            // Author link
            const authorSpan = document.createElement('span');
            authorSpan.className = 'result-author';
            const postedByLabel = document.createElement('span');
            postedByLabel.className = 'posted-by-label';
            postedByLabel.textContent = 'Posted by ';
            authorSpan.appendChild(postedByLabel);
            authorSpan.appendChild(document.createTextNode('u/' + post.author));
            const authorLink = document.createElement('a');
            authorLink.className = 'result-author';
            authorLink.href = `https://www.reddit.com/user/${post.author}`;
            authorLink.target = '_blank';
            authorLink.setAttribute('aria-label', `Posted by user ${post.author}`);
            authorLink.appendChild(authorSpan);

            // Time 
            const timeSpan = document.createElement('span');
            timeSpan.className = 'result-time';
            timeSpan.textContent = formatTimestamp(post.created_utc);
            timeSpan.tabIndex = 0;
            timeSpan.setAttribute('aria-label', `Posted ${formatTimestamp(post.created_utc)}`);

            const metaRow = document.createElement('div');
            metaRow.className = 'result-meta';
            const metaTextGroup = document.createElement('div');
            metaTextGroup.className = 'result-meta-text-group';
            metaTextGroup.appendChild(subredditLink);
            metaTextGroup.appendChild(authorLink);

            const compactTime = document.createElement('span');
            compactTime.className = 'result-time-compact';
            compactTime.innerHTML = '<span style="font-weight:700">·</span> ' + formatTimestampShort(post.created_utc);
            metaTextGroup.appendChild(compactTime);

            metaTextGroup.appendChild(timeSpan);
            metaRow.appendChild(metaTextGroup);
            if (post.stickied && window.innerWidth <= 1024) {
                const pushpinIcon = document.createElement('div');
                pushpinIcon.className = 'pushpin-icon';
                metaRow.appendChild(pushpinIcon);
            }
            resultHeader.appendChild(metaRow);
            
            return { resultHeader, bookmarkIcon, bookmarkContainer };
        }

        function createVoteSection(post, permalinkUrl, bookmarkId) {
            const voteSection = document.createElement('div');
            voteSection.className = 'vote-section';
        
            if (post.stickied && window.innerWidth > 1024) {
                const pushpinIcon = document.createElement('div');
                pushpinIcon.className = 'pushpin-icon';
                voteSection.appendChild(pushpinIcon);
            }
        
            const { upvoteBtn, voteCount, downvoteBtn } = createVoteButtons(post, permalinkUrl);
            voteSection.appendChild(upvoteBtn);
            voteSection.appendChild(voteCount);
            voteSection.appendChild(downvoteBtn);
        
            const commentIcon = createCommentIcon(post, permalinkUrl);
            const saveIconMobile = document.createElement('div');
            saveIconMobile.className = 'mobile-vote-item bookmark-icon-mobile';
            saveIconMobile.dataset.postId = bookmarkId;
        
            const bookmarksCache = JSON.parse(sessionStorage.getItem('bookmarks') || '{}');
            if (bookmarksCache[bookmarkId]) saveIconMobile.classList.add('saved');
        
            voteSection.appendChild(commentIcon);
            voteSection.appendChild(saveIconMobile);
        
            if (!window.isViewingSharedContent && isMobile()) {
                saveIconMobile.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const authStatus = requireAuth();
                    if (!authStatus) return;
                    const id = saveIconMobile.dataset.postId;
                    const isSaved = saveIconMobile.classList.contains('saved');
                    try {
                        if (isSaved) {
                            updateBookmarkUI(saveIconMobile, id, false);
                            try {
                                await deleteBookmark(id);
                                const activeTab = document.querySelector('.tab.active');
                                const sectionId = activeTab ? activeTab.dataset.tabId : new URLSearchParams(window.location.search).get('section');
                            } catch (err) {
                                updateBookmarkUI(saveIconMobile, id, true); // revert on failure
                                console.error('Failed to toggle bookmark:', err);
                            }
                        } else {
                            const selectedSectionId = await showSectionPickerMenu(post);
                            if (!selectedSectionId) return;
                            await saveBookmarkWithSection(post, id, selectedSectionId);
                            updateBookmarkUI(saveIconMobile, id, true);
                            await reorderBookmarkToTop(id, selectedSectionId);
                            const activeTab = document.querySelector('.tab.active');
                            const currentSectionId = activeTab ? activeTab.dataset.tabId : new URLSearchParams(window.location.search).get('section');
                            if (String(selectedSectionId) !== String(currentSectionId)) {
                                fadeOutCard(saveIconMobile.closest('.result-card'), currentSectionId);
                            }
                        }
                    } catch (err) {
                        console.error('Failed to toggle bookmark:', err);
                    }
                });
                } else if (window.isViewingSharedContent && isMobile()) {
                    saveIconMobile.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const authStatus = requireAuth();
                        if (!authStatus) return;
                        const id = saveIconMobile.dataset.postId;
                        const isSaved = saveIconMobile.classList.contains('saved');
                        try {
                            if (isSaved) {
                                updateBookmarkUI(saveIconMobile, id, false);
                                try {
                                    await deleteBookmark(id);
                                } catch (err) {
                                    updateBookmarkUI(saveIconMobile, id, true);
                                    console.error('Failed to toggle bookmark:', err);
                                }
                            } else {
                                const selectedSectionId = await showSectionPickerMenu(post);
                                if (!selectedSectionId) return;
                                await saveBookmarkWithSection(post, id, selectedSectionId);
                                await reorderBookmarkToTop(id, selectedSectionId);
                                updateBookmarkUI(saveIconMobile, id, true);
                            }
                        } catch (err) {
                            console.error('Failed to toggle bookmark:', err);
                        }
                    });
                }
            
                return { voteSection, saveIconMobile };
        }
            
        function createCommentsSection(post) {
            const commentsSection = document.createElement('div');
            commentsSection.className = 'comments-section';
            const commentsScroll = document.createElement('div');
            commentsScroll.className = 'comments-scroll';
            commentsScroll.innerHTML = '<div class="no-comments">Loading comments...</div>';
            commentsSection.appendChild(commentsScroll);
            fetchComments(post.permalink, commentsScroll);
            return commentsSection;
        }
        
        function createPostSnippet(post) {
            const resultContent = document.createElement('div');
            resultContent.className = 'result-content';
            let snippet = '';
            let isFromCrosspost = false;
        
            if (post.selftext && post.selftext.trim() !== '') {
                const decoded = decodeEntities(post.selftext);
                snippet = decoded.length > 300 ? decoded.substring(0, 300) + '...' : decoded;
            } else if (post.body && post.body.trim() !== '') {
                const decoded = decodeEntities(post.body);
                snippet = decoded.length > 300 ? decoded.substring(0, 300) + '...' : decoded;
            } else if (post.crosspost_parent_list?.[0]?.selftext && post.crosspost_parent_list[0].selftext !== '') {
                isFromCrosspost = true;
                const decoded = decodeEntities(post.crosspost_parent_list[0].selftext);
                snippet = decoded.length > 300 ? decoded.substring(0, 300) + '...' : decoded;
            }
        
            if (snippet.match(/\[[^\]]+\]\([^)]*$/)) {
                snippet = snippet.replace(/\[[^\]]+\]\([^)]*$/, '...');
            }
        
            resultContent.innerHTML = '';
            if (isFromCrosspost) {
                const quoteEl = document.createElement('div');
                quoteEl.className = 'el-quote';
                quoteEl.innerHTML = parseMarkdown(snippet);
                resultContent.appendChild(quoteEl);
            } else {
                resultContent.innerHTML = parseMarkdown(snippet);
            }
        
            return { resultContent, snippet };
        }




        const getResultsContainer = () => {
            if (currentTab === 'search') return document.getElementById('search-results');
            if (currentTab === 'subreddit') return document.getElementById('subreddit-results');
            if (currentTab === 'bookmarks') return document.getElementById('bookmarks-results');
            return document.getElementById('results');
        };
        
        async function displayResults(data, isAppend = false) {
            isLoading = false;
            const renderToken = activeQueryToken;
            const resultsContainer = getResultsContainer();
  
            // Always restore subreddit header if in subreddit view and header is empty
            if (currentTab === 'subreddit' && currentFilters.subreddit) {
                const header = document.getElementById('subreddit-header');
                if (header && header.innerHTML === '') {
                    fetch(`${API_BASE}/reddit/subreddit-info?subreddit=${currentFilters.subreddit}`)
                        .then(res => res.ok ? res.json() : null)
                        .then(info => { if (info) renderSubredditHeader(info); })
                        .catch(() => {});
                }
            }
            // For append mode
            if (!isAppend) {
                resultsContainer.style.opacity = 0;
                resultsContainer.innerHTML = '';

                // Show subreddit filter banner on search screen
                if (currentTab === 'search' && currentFilters.subreddit) {
                    const banner = createSubredditBanner(currentFilters.subreddit, () => {
                        appState.subreddit = '';
                        handleSearchRequest(null, null, false, true);
                    });
                    resultsContainer.appendChild(banner);
                }
            }

            const contentSelect = document.getElementById('content-select');
            const selectedFilter = contentSelect ? contentSelect.value : 'all';
            const isFromCache = Array.isArray(data);
            const posts = isFromCache
                ? data
                : data.data?.children.map(item => item.data) || [];

            if (!isFromCache) {
                currentAfter = data.data?.after || null;
                currentBefore = data.data?.before || null;
            }

            await processBatchedPosts(posts, 3, async (post) => {
                    const bookmarkId = post.id || post.reddit_post_id;

                    let postContentType;

                    // Extract selftext preview image if available
                    const selftextPreview = extractPreviewFromSelftext(post.selftext);
                    if (selftextPreview && post.url && (post.url.includes('/comments/') || post.url.includes('reddit.com'))) {
                        post.url = selftextPreview;
                    }

                    const domain = getDomainFromUrl(post.url);

                    const title = decodeEntities(post.title?.toLowerCase() || '');
                    const isProbablyNSFW = post.over_18 || /\b(tits|titties|rape|raped|tiddies|hentai|nudes|onlyfans|boobs|cum|cock|cocks|cunt|gape|gooning|gooner|goon|pussy)\b/i.test(title);

                    const resultCard = document.createElement('div');
                    resultCard.className = 'result-card';
                    resultCard.dataset.permalink = post.permalink;
                    resultCard.dataset.bookmarkId = bookmarkId;

                    if (isProbablyNSFW) {
                        resultCard.classList.add('nsfw');
                    }

                    const commentsSection = createCommentsSection(post);

                    const permalinkUrl = `https://www.reddit.com${post.permalink}`;
                    const { voteSection } = createVoteSection(post, permalinkUrl, bookmarkId);

                    // Content section
                    const contentSection = document.createElement('div');
                    contentSection.className = 'content-section';

                    const { resultHeader, bookmarkIcon, bookmarkContainer } = createPostHeader(post, bookmarkId);
                    resultCard.appendChild(bookmarkContainer);
                    
                    // Result title
                    const resultTitle = document.createElement('div');
                    resultTitle.className = 'result-title';
                    const titleLink = document.createElement('a');
                    titleLink.href = `https://www.reddit.com${post.permalink}`;
                    titleLink.target = '_blank';
                    titleLink.textContent = decodeEntities(post.title || 'Comment in thread');
                    resultTitle.appendChild(titleLink);
                    
                    const { resultContent, snippet } = createPostSnippet(post);
                    const resultActions = document.createElement('div');
                    resultActions.className = 'result-actions';

                    const redditUrl = `https://www.reddit.com${post.permalink}`;

                    const commentsAction = createActionButton(
                        `${post.num_comments || 0} Comments`,
                        '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
                        redditUrl
                    );
                    commentsAction.setAttribute('aria-label', 'Comments');

                    const saveAction = createActionButton(
                        'Save',
                        '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>',
                        redditUrl
                    );

                    const shareAction = createActionButton(
                        'Share',
                        '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>',
                        redditUrl
                    );

                    resultActions.appendChild(commentsAction);
                    resultActions.appendChild(saveAction);
                    resultActions.appendChild(shareAction);

                    // Add all sections to content area
                    contentSection.appendChild(resultHeader);
                    contentSection.appendChild(resultTitle);

                    if (snippet) {
                        contentSection.appendChild(resultContent);
                    }

                    contentSection.appendChild(resultActions);

                    // Classify media for this post
                    const { thumbnailURL, hasVisualMedia } = classifyPostMedia(post, domain);

                    const imgContainer = document.createElement('div');
                    imgContainer.className = 'img-container';

                    // Append sections
                    resultCard.appendChild(voteSection);
                    const timeSpanBottom = document.createElement('span');
                    timeSpanBottom.className = 'result-time-bottom';
                    timeSpanBottom.textContent = formatTimestamp(post.created_utc);
                    resultCard.appendChild(timeSpanBottom);
                    resultCard.appendChild(contentSection);
                    resultCard.appendChild(commentsSection);

                    // Check database cache before patches
                    if (!window.imageHandler) {
                        window.imageHandler = new ImageHandler();
                    }

                    // Only handle images if there's actually visual media
                    if (hasVisualMedia) {
                        window.imageHandler.handleImageLoad(post, resultCard);
                    }

                    const mediaContainer = createMediaElement(post, thumbnailURL, domain, resultCard);
                    resultCard.appendChild(mediaContainer);

                    if (!mediaContainer.querySelector('img, video')) {
                        resultCard.classList.add('no-media');
                    }
                    addPlayIconIfNeeded(post, resultCard);

                    // Classify content
                    if (selectedFilter !== 'all') {
                        postContentType = classifyContentType(post);
                        if (postContentType !== selectedFilter) {
                            return;
                        }
                    }

                    setTimeout(() => mediaGalleryFirstAid(post, resultCard), 0);
                    resultsContainer.appendChild(resultCard);
                    
                    // Bookmark click handler
                    if (!window.isViewingSharedContent) {
                        bookmarkIcon.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            e.currentTarget.blur();
                            const authStatus = requireAuth();
                            if (!authStatus) return;
                            const id = bookmarkIcon.dataset.postId;
                            const isSaved = bookmarkIcon.classList.contains('saved');
                            try {
                                if (isSaved) {
                                    updateBookmarkUI(bookmarkIcon, id, false);
                                    try {
                                        await deleteBookmark(id);
                                    } catch (err) {
                                        updateBookmarkUI(bookmarkIcon, id, true); // revert on failure
                                        console.error('Failed to toggle bookmark:', err);
                                    }
                                } else {
                                if (cachedFirstSectionId) {
                                        await saveBookmarkWithSection(post, id, cachedFirstSectionId);
                                        updateBookmarkUI(bookmarkIcon, id, true);
                                        await reorderBookmarkToTop(id, cachedFirstSectionId);
                                    }
                                }
                            } catch (err) {
                                console.error('Failed to toggle bookmark:', err);
                            }
                        });
                    } else {
                        bookmarkIcon.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            e.currentTarget.blur();
                            const authStatus = requireAuth();
                            if (!authStatus) return;
                            const id = bookmarkIcon.dataset.postId;
                            const isSaved = bookmarkIcon.classList.contains('saved');
                            try {
                                if (isSaved) {
                                    updateBookmarkUI(bookmarkIcon, id, false);
                                    try {
                                        await deleteBookmark(id);
                                        const activeTab = document.querySelector('.tab.active');
                                        const sectionId = activeTab ? activeTab.dataset.tabId : new URLSearchParams(window.location.search).get('section');
                                    } catch (err) {
                                        updateBookmarkUI(bookmarkIcon, id, true);
                                        console.error('Failed to toggle bookmark:', err);
                                    }
                                } else {
                                if (isMobile()) {
                                        const sectionId = await showSectionPickerMenu(post);
                                        if (!sectionId) return;
                                        await saveBookmarkWithSection(post, id, sectionId);
                                        await reorderBookmarkToTop(id, sectionId);
                                        const activeTab = document.querySelector('.tab.active');
                                        const currentSectionId = activeTab ? activeTab.dataset.tabId : new URLSearchParams(window.location.search).get('section');
                                        if (String(sectionId) !== String(currentSectionId)) {
                                            fadeOutCard(resultCard, currentSectionId);
                                        }
                                    } else {
                                        if (!cachedFirstSectionId) return;
                                        await saveBookmarkWithSection(post, id, cachedFirstSectionId);
                                        await reorderBookmarkToTop(id, cachedFirstSectionId);
                                    }
                                    updateBookmarkUI(bookmarkIcon, id, true);
                                }
                            } catch (err) {
                                console.error('Failed to toggle bookmark:', err);
                            }
                        });
                    }
            }, renderToken);
                    

            applySafeSearchFilter();  
            initializeVideoPlayers();
            applyStaggeredAnimation('.result-card', 'visible', 40, resultsContainer);
            resultsContainer.style.opacity = 1;
            const isBookmarksPage = new URLSearchParams(window.location.search).get('page') === 'bookmarks';
            const hasVisibleResults = resultsContainer.querySelectorAll('.result-card').length > 0;
            if (!isAppend && !isBookmarksPage && sessionStorage.getItem('hasVisited') && hasVisibleResults) setTimeout(() => triggerSearchReaction(currentFilters.subreddit, searchCount, isLoggedIn), 300);
            window.dispatchEvent(new CustomEvent('resultsReady'));
            if (currentTab === 'search') {
                document.body.classList.add('has-results');
                requestAnimationFrame(moveTabIndicator);
            }
            if (!isMobile()) syncScrollLoader();

            const allCards = resultsContainer.querySelectorAll('.result-card');
            const visibleCards = Array.from(allCards).filter(card =>
                window.getComputedStyle(card).display !== 'none'
            );
            if (visibleCards.length === 0 && !isBookmarksPage) {     
                    noResultsMessage();
                return;
            }
        }

        function flattenComments(items) {
            let allComments = [];
            items.forEach(item => {
                if (item.kind === 't1' && item.data && item.data.author && item.data.body) {
                    allComments.push(item);
                }
                if (item.data && item.data.replies && item.data.replies.data && item.data.replies.data.children) {
                    allComments = allComments.concat(flattenComments(item.data.replies.data.children));
                }
            });
            return allComments;
        }

        function staggerComments(commentsContainer) {
            requestAnimationFrame(() => {
                commentsContainer.querySelectorAll('.comment').forEach((el, i) => {
                    el.classList.remove('visible');
                    setTimeout(() => el.classList.add('visible'), i * 60);
                });
            });
        }

        // Function to fetch and cache comments for a post
        async function fetchComments(permalink, commentsContainer, post) {
            const postId = permalink;

            // Validate permalink first
            if (!permalink || typeof permalink !== 'string' || !permalink.startsWith('/r/')) {
                console.error('❌ Invalid permalink provided to fetchComments:', permalink);
                return;
            }

            // Check database for cached comments
            try {
                const cacheResponse = await fetch(`${API_BASE}/api/get-comments${permalink}`);
                const cacheData = await cacheResponse.json();

                if (cacheData.success && cacheData.cached && cacheData.comments.length > 0) {

                    // Keep first 15
                    const dbComments = cacheData.comments.slice(0, 8).map(comment => ({
                        author: comment.author,
                        body: comment.body,
                        score: comment.score,
                        created_utc: comment.created_utc
                    }));


                    renderComments({
                        data: {
                            children: dbComments,
                            totalCount: cacheData.comments.length,
                        }
                    }, commentsContainer, permalink, false, post, cacheData.post_total_comments);

                    staggerComments(commentsContainer);
                    return;
                }
            } catch (error) {
                console.error('Error checking database cache:', error);
            }

            // If no cache, fetch from Reddit
            const fixedPermalink = permalink.endsWith('.json') ? permalink : `${permalink}.json`;
            const commentsUrl = `${API_BASE}/reddit?url=https://www.reddit.com${fixedPermalink}%3Flimit%3D15`;

            try {
                const response = await fetch(commentsUrl);
                if (!response.ok) {
                    console.warn('Failed to fetch comments.');
                    return;
                }

                const data = await response.json();

                // Grab gallery posts while you're at it
                const fullPost = data?.[0]?.data?.children?.[0]?.data;
                // Only patch if it's actually a gallery post with the required data
                if (fullPost && fullPost.is_gallery && fullPost.gallery_data && fullPost.media_metadata) {
                    const resultCard = document.querySelector(`[data-permalink="${permalink}"]`);
                    if (resultCard) {
                        tryGalleryPatch(fullPost, permalink, resultCard);
                    }
                }

                if (!Array.isArray(data) || !data[1]?.data?.children) {
                    console.warn('⚠️ No comments found in response for permalink:', permalink);
                    return;
                }

                const commentsData = data[1].data.children;


                const flattenedComments = flattenComments(commentsData);
                const allComments = flattenedComments
                    .slice(0, 8)
                    .map(c => ({
                        id: c.data.id,
                        author: c.data.author,
                        body: c.data.body,
                        score: c.data.score,
                        created_utc: c.data.created_utc
                    }));

                // Validate post id to avoid empty strings
                if (!postId || postId.trim() === '') {
                    console.error('Invalid postId for comment cache:', postId);
                    return;
                }

                renderComments({
                    data: {
                        children: allComments,
                        totalCount: commentsData.length
                    }
                }, commentsContainer, permalink, fullPost?.locked || false, fullPost, null);

                // Save comments to database
                if (allComments.length > 0) {
                    saveCommentsToDatabase(permalink, allComments, fullPost?.num_comments, fullPost?.stickied);
                }

                staggerComments(commentsContainer);

            } catch (error) {
                console.error('❌ Fetch error for', permalink, error);
            }
        }

        function saveCommentsToDatabase(permalink, comments, totalComments, isStickied) {
            fetch(`${API_BASE}/api/save-comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    permalink: permalink,
                    comments: comments,
                    total_comments: totalComments,
                    is_stickied: isStickied
                })
            })
                .then(res => res.json())
                .catch(err => console.error('Save comments failed:', err));
        }

        function showError(message) {
            const resultsContainer = getResultsContainer();
            resultsContainer.innerHTML = '';

            if (currentTab === 'search' && currentFilters.subreddit) {
                const banner = createSubredditBanner(currentFilters.subreddit, () => {
                    appState.subreddit = '';
                    handleSearchRequest(null, null, false, true);
                });
                resultsContainer.appendChild(banner);
            }

            resultsContainer.insertAdjacentHTML('beforeend', `<div class='results-error'><p>${message}</p></div>`);
            resultsContainer.style.opacity = 0;
            applyStaggeredAnimation('.results-error', 'visible', 60);

            setTimeout(() => {
                resultsContainer.style.transition = 'opacity 0.3s ease';
                resultsContainer.style.opacity = 1;
            }, 10);
        }

        function renderComments(data, commentsContainer, permalink, isPostLocked, post, cachedCommentCount) {

            // Only try gallery patches when we have the actual post data
            if (data?.kind === 'Listing' && data?.data?.children?.[0]?.kind === 't3') {
                // 't3' is the prefix for posts (not comments)
                const fullPost = data?.data?.children?.[0]?.data;
                if (fullPost?.is_gallery && fullPost?.gallery_data && fullPost?.media_metadata) {
                    const resultCard = document.querySelector(`[data-permalink="${permalink}"]`);
                    tryGalleryPatch(fullPost, permalink, resultCard);

                }
            }

            // Parsing data to show if comments locked or no comments found
            const commentsData = data?.data?.children || [];
            const totalCommentsCount = data?.data?.totalCount

            const isLocked = isPostLocked;

            if (commentsData.length === 0) {
                commentsContainer.innerHTML = `
        <div class="no-comments">
            ${isLocked ? 'Comments have been locked.' : 'No comments found.'}
            ${isLocked ? '<div class="lock-icon"></div>' : ''}
        </div>
        `;
                return;
            }

            // Sort comments by score (highest first)
            commentsData.sort((a, b) => (b.score || 0) - (a.score || 0));
            commentsContainer.innerHTML = '';

            const topComments = commentsData.slice(0, 8);
            topComments.forEach(comment => {
                const c = comment;

                const commentEl = document.createElement('div');
                commentEl.className = 'comment';

                const authorEl = document.createElement('div');
                authorEl.className = 'comment-author';
                const authorIconEl = document.createElement('div');
                authorIconEl.className = 'comment-author-icon';
                authorIconEl.textContent = c.author.charAt(0).toUpperCase();
                authorEl.appendChild(authorIconEl);
                authorEl.appendChild(createAuthorLink(c.author));

                const textEl = document.createElement('div');
                textEl.className = 'comment-text';

                textEl.appendChild(renderCommentBody(c.body));

                const metaEl = document.createElement('div');
                metaEl.className = 'comment-meta';
                const scoreEl = document.createElement('span');
                scoreEl.className = 'comment-score';
                scoreEl.textContent = formatNumber(c.score) + ' points';
                const timeEl = document.createElement('span');
                timeEl.className = 'comment-time';
                timeEl.textContent = formatTimestamp(c.created_utc);
                metaEl.appendChild(scoreEl);
                metaEl.appendChild(timeEl);

                commentEl.appendChild(authorEl);
                commentEl.appendChild(textEl);
                commentEl.appendChild(metaEl);
                commentsContainer.appendChild(commentEl);
            });
            // Use comments count from one source
            const actualCommentCount = cachedCommentCount || post?.num_comments || totalCommentsCount;

            const seeMoreEl = document.createElement('div');
                seeMoreEl.className = 'see-more-comments';
                seeMoreEl.textContent = actualCommentCount > 0 ? `See all ${actualCommentCount} comments` : `View on Reddit`;
                seeMoreEl.tabIndex = 0;

                const openLink = () => window.open(`https://www.reddit.com${permalink}`, '_blank');

                seeMoreEl.addEventListener('click', openLink);
                seeMoreEl.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openLink();
                    }
                });

                commentsContainer.appendChild(seeMoreEl);
            const resultCard = document.querySelector(`[data-permalink="${permalink}"]`);
            if (resultCard && actualCommentCount !== undefined) {
                const commentsAction = resultCard.querySelector('.result-action');
                if (commentsAction && commentsAction.innerHTML.includes('Comments')) {
                    const commentText = actualCommentCount === 1 ? 'Comment' : 'Comments';
                    commentsAction.innerHTML = `
                        <svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        ${actualCommentCount} ${commentText}`;
                }
            }
        }

        function trapFocus(modalOverlay) {
            // Get all focusable elements in the modal
            const focusableElements = modalOverlay.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]), .modal-nav-arrow, .image-wrapper, video, img'
            );

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            // Focus the first element when modal opens
            setTimeout(() => firstElement?.focus(), 100);

            // Trap focus within modal
            modalOverlay.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    if (e.shiftKey) {
                        // Shift + Tab (backwards)
                        if (document.activeElement === firstElement) {
                            e.preventDefault();
                            lastElement.focus();
                        }
                    } else {
                        // Tab (forwards)
                        if (document.activeElement === lastElement) {
                            e.preventDefault();
                            firstElement.focus();
                        }
                    }
                }

                // Close modal on Escape
                if (e.key === 'Escape') {
                    closeModal();
                }
            });
        }

        function extractPreviewFromSelftext(selftext) {
            if (!selftext) return null;

            // Look for direct i.redd.it or preview.redd.it URLs
            const mediaRegex = /(https?:\/\/(?:i\.redd\.it|preview\.redd\.it)\/[^\s]+\.(?:gif|jpg|jpeg|png|webp))/i;
            const match = selftext.match(mediaRegex);

            if (match && match[1]) {
                return match[1];
            }
            return null;
        }
        


















        function formatTimestamp(timestamp) {
            const date = new Date(timestamp * 1000);
            const now = new Date();
            const diffSeconds = Math.floor((now - date) / 1000);

            if (diffSeconds < 60) {
                return `${diffSeconds} second${diffSeconds !== 1 ? 's' : ''} ago`;
            }

            const diffMinutes = Math.floor(diffSeconds / 60);
            if (diffMinutes < 60) {
                return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
            }

            const diffHours = Math.floor(diffMinutes / 60);
            if (diffHours < 24) {
                return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
            }

            const diffDays = Math.floor(diffHours / 24);
            if (diffDays < 30) {
                return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
            }

            const diffMonths = Math.floor(diffDays / 30);
            if (diffMonths < 12) {
                return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
            }

            const diffYears = Math.floor(diffMonths / 12);
            return `${diffYears} year${diffYears !== 1 ? 's' : ''} ago`;
        }
        
        function formatTimestampShort(timestamp) {
            const diffSeconds = Math.floor((Date.now() - timestamp * 1000) / 1000);
            if (diffSeconds < 60)                            return `${diffSeconds}s`;
            const diffMinutes = Math.floor(diffSeconds / 60);
            if (diffMinutes < 60)                            return `${diffMinutes}m`;
            const diffHours = Math.floor(diffMinutes / 60);
            if (diffHours < 24)                              return `${diffHours}hr`;
            const diffDays = Math.floor(diffHours / 24);
            if (diffDays < 30)                               return `${diffDays}d`;
            const diffMonths = Math.floor(diffDays / 30);
            if (diffMonths < 12)                             return `${diffMonths}mo`;
            return `${Math.floor(diffMonths / 12)}yr`;
        }

        function toggleThemeMenu() {
        const dropdown = document.getElementById('themeDropdown');
        dropdown.classList.toggle('show');

        if (dropdown.classList.contains('show')) {
            setTimeout(() => {
                // Focus the first tabbable item inside the dropdown
                const firstItem = dropdown.querySelector('[tabindex="0"], button, a');
                if (firstItem) {
                    firstItem.focus();
                } else {
                    // Fallback if no child is focusable
                    dropdown.focus();
                }
                dropdown.classList.add('keyboard-focus');
            }, 50);
        } else {
            dropdown.classList.remove('keyboard-focus');
        }

        updateActiveTheme();
    }


        function selectTheme(themeName) {
            // If choosing a light theme, save it as the previous theme
            if (themeName !== 'dark') {
                localStorage.setItem('previousTheme', themeName);
            }

            applyTheme(themeName);
            document.getElementById('themeDropdown').classList.remove('show');
        }


        function handleThemeKeydown(event, themeName) {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectTheme(themeName);
            }
        }

        const themeDropdown = document.getElementById('themeDropdown');

        themeDropdown.addEventListener('blur', () => {
            setTimeout(() => {
                // If focus moved completely away from the dropdown
                if (!themeDropdown.contains(document.activeElement)) {
                    themeDropdown.classList.remove('show');
                    themeDropdown.classList.remove('keyboard-focus');
                }
            }, 100);
        });


        function updateActiveTheme() {
            // Get current theme from localStorage
            const currentTheme = localStorage.getItem('selectedTheme') || 'default';

            // Remove active class from all options
            const options = document.querySelectorAll('.theme-option');
            options.forEach(option => option.classList.remove('active'));

            // Add active class to current theme
            const activeOption = document.querySelector(`[onclick="selectTheme('${currentTheme}')"]`);
            if (activeOption) {
                activeOption.classList.add('active');
            }
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', function (event) {
            const dropdown = document.getElementById('themeDropdown');
            const themeButton = document.querySelector('.theme-arrow');

            if (dropdown.classList.contains('show') &&
                !dropdown.contains(event.target) &&
                !themeButton.contains(event.target)) {
                dropdown.classList.remove('show');
            }
        });

        // Close on right-click anywhere
        document.addEventListener('contextmenu', function (event) {
            const importMenu = document.getElementById('importMenu');
            if (importMenu) {
                importMenu.style.display = 'none';
            }
            const dropdown = document.getElementById('themeDropdown');
            if (dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
            }
        });

        function formatNumber(num) {
            if (num == null || num === undefined) {
                return '';  
            }
            if (num >= 1000000) {
                return (num / 1000000).toFixed(1) + 'm';
            }
            if (num >= 1000) {
                return (num / 1000).toFixed(1) + 'k';
            }
            return num.toString();
        }

        function getDomainFromUrl(url) {
            try {
                return new URL(url).hostname.replace('www.', '');
            } catch {
                return null;
            }
        }

        // Verification handler
        document.addEventListener('DOMContentLoaded', function () {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            if (token) {
                // This is a magic link verification
                verifyMagicLink(token);
            }
            // Check for payment success
            if (urlParams.get('success') === 'true') {
                const sessionId = urlParams.get('session_id');

                // Check if we already processed this session
                const processedSessions = JSON.parse(localStorage.getItem('processedSessions') || '[]');

                if (sessionId && !processedSessions.includes(sessionId)) {
                    // Auto-login after successful payment
                    fetch(`${API_BASE}/api/auto-login-after-payment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ session_id: sessionId })
                    })
                        .then(response => response.json())
                        .then(data => {
                            if (data.success) {
                                // Set login state
                                isLoggedIn = true;
                                localStorage.setItem('isLoggedIn', 'true');
                                localStorage.setItem('hasSubscription', data.hasSubscription);
                                localStorage.setItem('planType', data.planType);

                                // Mark this session as processed
                                processedSessions.push(sessionId);
                                localStorage.setItem('processedSessions', JSON.stringify(processedSessions));

                                // Show correct message
                                if (data.planType === 'premium') {
                                    Swal.fire({
                                        title: 'Account Created!',
                                        text: 'Your account has been created. Thank you for unlocking Premium!',
                                        confirmButtonText: 'Great!',
                                        didOpen: () => {
                                            document.activeElement.blur();
                                        }
                                    });
                                } else if (data.planType === 'pro') {
                                    Swal.fire({
                                        title: 'Account Created!',
                                        text: 'Your account has been created. Thank you for unlocking Pro!',
                                        confirmButtonText: 'Great!',
                                        didOpen: () => {
                                            document.activeElement.blur();
                                        }
                                    });
                                }
                                
                                // FETTI TIME!
                                moneyShot();
                                updateLoginButton();
                                showSpeechBubble("It's great value, honest.");
                            }

                            // Clean URL 
                            const url = new URL(window.location);
                            url.searchParams.delete('success');
                            url.searchParams.delete('session_id');
                            window.history.replaceState({}, document.title, url.toString());
                        });
                } 
            }
            updatePlanDisplay();
        });

        function moneyShot() {
            // First burst from center
            confetti({
                particleCount: 200,
                spread: 180,
                origin: { x: 0.5, y: 0.5 }
            });

            // Left side burst
            setTimeout(() => {
                confetti({
                    particleCount: 150,
                    spread: 120,
                    origin: { x: 0.1, y: 0.3 }
                });
            }, 200);

            // Right side burst
            setTimeout(() => {
                confetti({
                    particleCount: 150,
                    spread: 120,
                    origin: { x: 0.9, y: 0.3 }
                });
            }, 400);

            // Top corners
            setTimeout(() => {
                confetti({
                    particleCount: 100,
                    spread: 90,
                    origin: { x: 0.2, y: 0.1 }
                });
                confetti({
                    particleCount: 100,
                    spread: 90,
                    origin: { x: 0.8, y: 0.1 }
                });
            }, 600);

            // Final center blast
            setTimeout(() => {
                confetti({
                    particleCount: 300,
                    spread: 200,
                    origin: { x: 0.5, y: 0.6 },
                    colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']
                });
            }, 800);
        }

        function updateLoginButton() {
            const btnText = document.getElementById('loginBtnText');
            const desktopBtn = document.getElementById('loginLogoutBtn');
            const mobileBtn = document.getElementById('mobileLoginBtn');

            if (isLoggedIn) {
                if (btnText) btnText.textContent = 'Log Out';

                const logoutHandler = async () => {
                    const result = await Swal.fire({
                        title: 'Are you sure you want to log out?',
                        showCancelButton: true,
                        confirmButtonText: 'Yes',
                        cancelButtonText: 'No',
                        icon: 'question',
                        didOpen: () => {
                            if (!document.body.classList.contains('user-is-tabbing')) {
                                document.activeElement.blur();
                            }
                        }
                    });
                    if (result.isConfirmed) {
                        isLoggedIn = false;
                        localStorage.setItem('isLoggedIn', 'false');
                        clearUserDataOnLogout();
                        sessionStorage.removeItem('bookmarks');
                        document.querySelectorAll('.bookmark-icon').forEach(icon => {
                            icon.classList.remove('saved');
                        });
                        localStorage.setItem('theme', 'default');
                        applyTheme('default');
                        updateLoginButton();
                        await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
                        window.location.href = '/';
                    }
                };

                if (desktopBtn) desktopBtn.onclick = logoutHandler;
                if (mobileBtn) mobileBtn.onclick = logoutHandler;
            } else {
                if (btnText) btnText.textContent = 'Log In';
                const loginHandler = () => {
                    const currentUrl = encodeURIComponent(window.location.href);
                    window.location.href = `html/login.html?redirect=${currentUrl}`;
                };
                if (desktopBtn) desktopBtn.onclick = loginHandler;
                if (mobileBtn) mobileBtn.onclick = loginHandler;
            }
        }

        function updateThemeToggleVisibility() {
            const themeContainer = document.querySelector('.theme-toggle-container');
            if (isLoggedIn) {
                themeContainer.classList.add('visible');
            } else {
                themeContainer.classList.remove('visible');
            }
        }

        function clearUserDataOnLogout() {
            localStorage.removeItem('hasSubscription');
            localStorage.removeItem('planType');
        }

        async function verifyMagicLink(token) {
                try {
                    const response = await fetch(`${API_BASE}/api/auth/verify/${token}`, {
                        method: 'POST',
                        credentials: 'include'
                    });
                    const data = await response.json();

                    if (response.ok) {
                        isLoggedIn = true;
                        localStorage.setItem('isLoggedIn', 'true');
                        localStorage.setItem('hasSubscription', data.hasSubscription);
                        localStorage.setItem('planType', data.planType);
                        updateLoginButton();

                        await Swal.fire({
                            title: 'Success!',
                            text: 'Successfully logged in!',
                            icon: 'success',
                            timer: 1500,
                            showConfirmButton: false,
                            didOpen: () => {
                                if (!document.body.classList.contains('user-is-tabbing')) {
                                    document.activeElement.blur();
                                }
                            }
                        });

                        // Check if server returned a redirect URL
                        const redirect = data.redirect;
  
                        if (data.redirect) {
                            if (data.redirect === 'bookmarks') {
                                window.location.href = '/?page=bookmarks';
                            } else {
                                window.location.href = decodeURIComponent(data.redirect);
                            }
                            return;
                        } else {
                            initPage();
                        }
                        const url = new URL(window.location);
                        url.searchParams.delete('token');
                        window.history.replaceState({}, document.title, url.toString());
                        
                    } else {
                        console.log('🔴 Response not ok');
                        Swal.fire({
                            title: 'Error',
                            text: 'Invalid or expired login link.',
                            didOpen: () => {
                                document.activeElement.blur();
                            }
                        });
                    }
                } catch (error) {
                    console.log('🔴 Error in verifyMagicLink:', error);
                    Swal.fire({
                        title: 'Error', 
                        text: 'Verification failed. Please try again.',
                        didOpen: () => {
                            document.activeElement.blur();
                        }
                    });
                }
            }

        document.querySelector('.bookmark-link').addEventListener('click', function (e) {
            if (!isLoggedIn) {
                e.preventDefault();
                window.location.href = 'html/login.html?redirect=bookmarks';
            }
        });

        // Mobile bookmarks link handler
        document.querySelector('.mobile-bottom-bar [data-tab="bookmarks"]').addEventListener('click', function (e) {
            if (!isLoggedIn) {
                e.preventDefault();
                window.location.href = 'html/login.html?redirect=bookmarks';
            }
        });

        document.getElementById('createSectionBtn').addEventListener('click', function () {
            if (!isLoggedIn) {
                window.location.href = `html/login.html?redirect=${encodeURIComponent(window.location.href)}`;
                return;
            }
            showCreateSheet();
        });

        document.getElementById('getPremiumContainer').onclick = () => {
            if (isLoggedIn) {
                window.open('/', '_blank');
            } else {
                window.open('https://buy.stripe.com/4gM14n5qfeRAdbe4ao5c401', '_blank');
            }
        };

            let toggleManager = null;
            
            if (document.getElementById('sort-select')) {
                toggleManager = new ToggleManager(); 
            }

            // Keyboard support for toggle sliders
            document.querySelectorAll('.slider').forEach((slider, index) => {
                slider.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        // Click the corresponding checkbox
                        const toggleId = index === 0 ? 'toggle1' : 'toggle2';
                        document.getElementById(toggleId).click();
                    }
                });
            });

            // Keyboard support for toggle labels
            document.querySelectorAll('.toggle-label').forEach((label, index) => {
                label.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        // Click the corresponding checkbox
                        const toggleId = index === 0 ? 'toggle1' : 'toggle2';
                        document.getElementById(toggleId).click();
                    }
                });
            });

            // Set initial toggle states immediately based on actual requirements
            const toggle1 = document.getElementById('toggle1');
            const toggle2 = document.getElementById('toggle2');
            if (typeof isLoggedIn !== 'undefined' && !isLoggedIn) {
                // Logged out: always reddit search
                if (toggle1) toggle1.checked = false;
                if (toggle2) toggle2.checked = true;
            } else if (typeof isLoggedIn !== 'undefined' && isLoggedIn) {
                // Logged in: check sessionStorage
                const savedToggle1 = sessionStorage.getItem('toggle1State') === 'true';
                if (savedToggle1) {
                    if (toggle1) toggle1.checked = true;
                    if (toggle2) toggle2.checked = false;
                } else {
                    if (toggle1) toggle1.checked = false;
                    if (toggle2) toggle2.checked = true;
                }
            } else {
                // Default fallback if isLoggedIn not defined yet
                if (toggle1) toggle1.checked = false;
                if (toggle2) toggle2.checked = true;
            }
            if (toggleManager) {
                toggleManager.updateSortDropdown();
            }

        function updatePlanDisplay() {
            const planDisplayElement = document.getElementById('plan-display');
            if (!planDisplayElement) return;
            const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
            const getPremiumContainer = document.getElementById('getPremiumContainer');

            if (isLoggedIn) {
            
                    fetch(`${API_BASE}/api/subscription/me`, { credentials: 'include' })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            localStorage.setItem('hasSubscription', data.hasSubscription);
                            localStorage.setItem('planType', data.planType);
                            getPremiumContainer.style.display = 'none';

                            if (data.hasSubscription && data.planType) {
                                const planName = data.planType.charAt(0).toUpperCase() + data.planType.slice(1);
                                planDisplayElement.textContent = `Current Plan: ${planName}`;

                                // Add plan-specific class
                                planDisplayElement.className = `plan-display plan-${data.planType}`;
                                planDisplayElement.parentElement.classList.add('visible');
                            }
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching subscription:', error);
                        // Fallback to showing what's in localStorage
                        showFromLocalStorage();
                        getPremiumContainer.style.display = 'none';
                    });
            } else {
                planDisplayElement.parentElement.classList.remove('visible');
                getPremiumContainer.style.display = 'flex';
            }
        }

        function showFromLocalStorage() {
            const planDisplayElement = document.getElementById('plan-display');
            if (!planDisplayElement) return;
            const hasSubscription = localStorage.getItem('hasSubscription') === 'true';
            const planType = localStorage.getItem('planType');

            if (hasSubscription && planType) {
                const planName = planType.charAt(0).toUpperCase() + planType.slice(1);
                planDisplayElement.textContent = `Current Plan: ${planName}`;
                planDisplayElement.parentElement.classList.add('visible');
            } else {
                planDisplayElement.parentElement.classList.remove('visible');
            }
        }

        // Security function to prevent XSS
        function sanitizeHTML(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        async function getSubredditIcon(subreddit) {

            // Validate subreddit parameter
            if (!subreddit || subreddit === 'undefined' || subreddit === 'null' || typeof subreddit !== 'string') {
                console.warn('⚠️ getSubredditIcon called with invalid subreddit:', subreddit);
                return '/api/placeholder/20/20';
            }

            // Clean and validate subreddit name
            const cleanSubreddit = subreddit.trim();
            if (cleanSubreddit.length === 0) {
                console.warn('⚠️ getSubredditIcon called with empty subreddit');
                return '/api/placeholder/20/20';
            }

            const storageKey = `subreddit_icon_${cleanSubreddit}`;

            // Check if icon is in sessionStorage
            const cachedIcon = sessionStorage.getItem(storageKey);
            if (cachedIcon !== null) {
                if (cachedIcon === 'null') {
                    return '/api/placeholder/20/20';
                }
                return cachedIcon;
            }

            try {
                const response = await fetch(`${API_BASE}/reddit/icons?subreddits=${encodeURIComponent(cleanSubreddit)}`);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const data = await response.json();
                const iconUrl = data[cleanSubreddit];
                if (!iconUrl) {
                    sessionStorage.setItem(storageKey, 'null');
                    return '/api/placeholder/20/20';
                }
                // Save to sessionStorage
                sessionStorage.setItem(storageKey, iconUrl);
                return iconUrl;
            } catch (err) {
                console.error(`❌ Failed to fetch icon for r/${cleanSubreddit}:`, err.message);
                // Don't cache on error — let it retry next time
                return '/api/placeholder/20/20';
            }
        }

        function addPlayIconIfNeeded(fPost, resultCard) {
            const imgContainer = resultCard.querySelector('.img-container');
            const mediaElement = resultCard.querySelector('.result-image');
            if (!imgContainer || !mediaElement) return;
            if (imgContainer.querySelector('.play-icon')) return;
            const isActuallyAnimated = fPost.animated === true;
            const isVideo = fPost.is_video ||
                (fPost.domain && fPost.domain.includes('youtu')) ||
                (fPost.url && fPost.url.includes('v.redd.it')) ||
                (fPost.domain && fPost.domain.includes('streamable')) ||
                (fPost.domain && fPost.domain.includes('redgifs.com')) ||
                (fPost.url && fPost.url.endsWith('.gifv'));

            const isImgur = (fPost.url && fPost.url.includes('imgur')) && (fPost.url && fPost.url.endsWith('.gifv')) && isActuallyAnimated;
            // Show play icon only for videos that aren't actually animated (not for gallery GIFs)
            const shouldShowPlayIcon = (isVideo && !isActuallyAnimated);
            if (shouldShowPlayIcon && !isImgur) {
                const playIcon = document.createElement('div');
                playIcon.className = 'play-icon';
                playIcon.innerHTML = '▶';
                imgContainer.appendChild(playIcon);
            }
        }

        

        

        

        const tabInitialized = { home: true, search: false, bookmarks: false };

        const LAYOUT_DEFAULTS = { home: 'comfy', search: 'compact', bookmarks: 'comfy' };

        function applyMobileLayout(tab) {
            if (!isMobile()) return;
            const saved = localStorage.getItem(`layout-${tab}`);
            const layout = saved || LAYOUT_DEFAULTS[tab] || 'comfy';
            document.body.setAttribute('data-mobile-layout', layout);
        }

        function toggleMobileLayout(tab) {
            const current = localStorage.getItem(`layout-${tab}`) || LAYOUT_DEFAULTS[tab] || 'comfy';
            const next = current === 'comfy' ? 'compact' : 'comfy';
            localStorage.setItem(`layout-${tab}`, next);
            applyMobileLayout(tab);
        }



        function renderSubredditHeader(info, container = null, onClick = null) {
            if (!container) container = document.getElementById('subreddit-header');
            if (!container) return;
            container.innerHTML = '';

            // Banner
            const banner = document.createElement('div');
            banner.className = 'subreddit-banner';
            banner.style.opacity = '0';
            banner.style.transition = 'opacity 0.3s ease';
            if (info.banner_url) {
                const img = new Image();
                img.onload = () => { banner.style.opacity = '1'; };
                img.onerror = () => { banner.style.opacity = '1'; };
                img.src = info.banner_url;
                banner.style.backgroundImage = `url(${info.banner_url})`;
            } else {
                // Derive a consistent color from the subreddit name
                let hash = 0;
                for (let i = 0; i < info.subreddit.length; i++) {
                    hash = info.subreddit.charCodeAt(i) + ((hash << 5) - hash);
                }
                const hue = Math.abs(hash) % 360;
                banner.style.backgroundColor = `hsl(${hue}, 70%, 55%)`;
                requestAnimationFrame(() => { banner.style.opacity = '1'; });
            }

            // Icon
            const icon = document.createElement('div');
            icon.className = 'subreddit-icon-large';
            if (info.icon_url) {
                icon.style.backgroundImage = `url(${info.icon_url})`;
            } else {
                icon.textContent = info.subreddit.charAt(0).toUpperCase();
            }

            banner.appendChild(icon);
            container.appendChild(banner);

            // Info row
            const infoRow = document.createElement('div');
            infoRow.className = 'subreddit-info-row';

            const name = document.createElement('div');
            name.className = 'subreddit-name';
            name.textContent = `r/${info.subreddit}`;

            const subscribers = document.createElement('div');
            subscribers.className = 'subreddit-subscribers';
            subscribers.textContent = `${formatNumber(info.subscribers)} members`;

            infoRow.appendChild(name);
            infoRow.appendChild(subscribers);
            container.appendChild(infoRow);

            // Description
            if (info.description) {
                const desc = document.createElement('div');
                desc.className = 'subreddit-description';
                const sanitized = decodeEntities(sanitizeHTML(info.description)).replace(/\n+/g, ' ');
                desc.innerHTML = sanitized.replace(
                    /(https?:\/\/[^\s<>"']+)/g,
                    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
                );
                container.appendChild(desc);
            }

            // Make clickable if onClick provided
            if (onClick) {
                container.style.cursor = 'pointer';
                container.addEventListener('click', onClick);
            }

            const pills = document.getElementById('subreddit-filter-pills');
            if (pills) pills.classList.toggle('hidden', !isMobile());
        }

        const TOP_SUBREDDITS = [
            'AskReddit', 'interestingasfuck', 'whatisit', 'mildlyinfuriating', 'PeterExplainsTheJoke',
            'SipsTea', 'NoStupidQuestions', 'Fauxmoi', 'news', 'pics',
            'worldnews', 'movies', 'popculturechat', 'okbuddycinephile', 'mildlyinteresting',
            'interesting', 'Damnthatsinteresting', 'funny', 'politics', 'todayilearned',
            'Wellthatsucks', 'Unexpected', 'MadeMeSmile', 'TikTokCringe', 'technology',
            'ExplainTheJoke', 'pcmasterrace', 'law', 'nextfuckinglevel', 'wallstreetbets',
            'BeAmazed', 'videos', 'explainlikeimfive', 'Cooking', 'cats',
            'isthisAI', 'nottheonion', 'explainitpeter', 'AITAH', 'AmIOverreacting',
            'meirl', 'whoathatsinteresting', 'shittymoviedetails', 'pokemon', 'AmItheAsshole',
            'theydidthemath', 'Weird', 'TopCharacterTropes', 'AskTheWorld', 'residentevil',
            'LivestreamFail', 'Advice', 'memes', 'television', 'personalfinance',
            'UnderReportedNews', 'TwoXChromosomes', 'oddlysatisfying', 'anime', 'AskMen',
            'nba', 'WatchPeopleDieInside', 'CleaningTips', 'Millennials', 'Whatcouldgowrong',
            'relationship_advice', 'ChatGPT', 'Piracy', 'jobs', 'MapPorn',
            'KidsAreFuckingStupid', 'sports', 'BlackPeopleofReddit', 'entertainment', 'iphone',
            'HistoricalCapsule', 'Music', 'travel', 'geography', 'AskUK',
            'sachintendulkar', 'comedyheaven', 'buildapc', 'me_irl', 'teenagers',
            'tattooadvice', 'AskHistorians', 'formula1', 'europe', 'GuysBeingDudes',
            'KitchenConfidential', 'OldSchoolCool', 'olympics', 'howislivingthere', 'ClaudeAI',
            'BlackPeopleTwitter', 'techsupport', 'Steam', 'whatdoIdo', 'OutOfTheLoop'
        ];

        async function initExploreGrid() {
            const searchResults = document.getElementById('search-results');
            if (!searchResults) return;

            const existing = document.getElementById('explore-grid');
            if (existing) return;

            const grid = document.createElement('div');
            grid.id = 'explore-grid';
            grid.className = 'explore-grid';

            searchResults.parentNode.insertBefore(grid, searchResults);

            const offset = parseInt(localStorage.getItem('kf_explore_offset') || '0', 10);
            const next = (offset + 1) % TOP_SUBREDDITS.length;
            localStorage.setItem('kf_explore_offset', next);

            const subs = [];
            for (let i = 0; i < 30; i++) {
                subs.push(TOP_SUBREDDITS[(offset + i) % TOP_SUBREDDITS.length]);
            }

            let cardIndex = 0;
            for (const sub of subs) {
                const card = document.createElement('div');
                card.className = 'explore-card';

                try {
                    const res = await fetch(`${API_BASE}/reddit/subreddit-info?subreddit=${sub}`);
                    if (res.ok) {
                        const info = await res.json();
                        renderSubredditHeader(info, card, () => performViewTransition('forward', () => openSubredditView(sub)));
                    }
                } catch (err) {
                    console.error(`Failed to load explore card for r/${sub}:`, err);
                }

                grid.appendChild(card);
                const i = cardIndex++;
                setTimeout(() => requestAnimationFrame(() => card.classList.add('visible')), i * 40);
            }
        }

        function performViewTransition(direction, callback) {
            if (!document.startViewTransition) { callback(); return; }
            document.documentElement.classList.add('nav-' + direction);
            const t = document.startViewTransition(callback);
            t.finished.finally(() => document.documentElement.classList.remove('nav-' + direction));
        }

        function openSubredditView(subredditName, silent = false) {
            const originTab = currentTab;
            const targetTab = 'subreddit';
            const targetHeader = 'subreddit-header';

            if (!silent) {
                const hasResults = document.getElementById('search-results')?.children.length > 0;
                if (originTab === 'search' && hasResults) {
                    navStack.push({ screen: 'search-results', filters: { ...appState } });
                } else {
                    navStack.push({ screen: 'explore' });
                }
                if (originTab === 'home') {
                    document.querySelectorAll('.bottom-bar-item').forEach(i => i.classList.remove('active'));
                    const searchItem = document.querySelector('.bottom-bar-item[data-tab="search"]');
                    if (searchItem) searchItem.classList.add('active');
                }
            }

            if (isMobile()) {
                appState.subredditSort = 'hot';
                appState.subredditTime = 'all';
            }
            if (isMobile()) {
                const sortPill = document.getElementById('subreddit-pill-sort');
                const timePill = document.getElementById('subreddit-pill-time');
                if (sortPill) sortPill.childNodes[0].textContent = 'Hot ';
                if (timePill) timePill.childNodes[0].textContent = 'All time ';
            }

            if (silent) {
                navigateReplace({
                    tab: targetTab,
                    subreddit: subredditName,
                    query: '',
                    sort: 'hot',
                    time: 'all',
                    contentType: 'all',
                    pageIndex: 0,
                    after: null,
                    before: null,
                });
            } else {
                navigate({
                    tab: targetTab,
                    subreddit: subredditName,
                    query: '',
                    sort: 'hot',
                    time: 'all',
                    contentType: 'all',
                    pageIndex: 0,
                    after: null,
                    before: null,
                });
            }

            window.scrollTo({ top: 0, behavior: 'smooth' });
            setSubredditChip(subredditName);

            const headerEl = document.getElementById(targetHeader);
            if (headerEl) {
                headerEl.innerHTML = '';
                const placeholder = document.createElement('div');
                placeholder.className = 'subreddit-banner shimmer';
                placeholder.style.position = 'relative';
                placeholder.style.overflow = 'hidden';
                headerEl.appendChild(placeholder);
            }

            fetch(`${API_BASE}/reddit/subreddit-info?subreddit=${subredditName}`)
                .then(res => res.ok ? res.json() : null)
                .then(info => { if (info) renderSubredditHeader(info, document.getElementById(targetHeader)); })
                .catch(err => console.error('Failed to load subreddit info:', err));
        }

        function switchTab(tab) {
            // Save scroll position of current tab
            tabScrollY[currentTab] = window.scrollY;

            // Reset content type filter when leaving search
            if (currentTab === 'search' && tab !== 'search') {
                currentFilters.contentType = 'all';
                appState.contentType = 'all';
                const contentSelect = document.getElementById('content-select');
                if (contentSelect) contentSelect.value = 'all';
                document.querySelectorAll('.content-type-tab').forEach(t => t.classList.remove('active'));
                const allTab = document.querySelector('.content-type-tab[data-value="all"]');
                if (allTab) allTab.classList.add('active');
                requestAnimationFrame(moveTabIndicator);
            }

            // Clean bookmarks URL when leaving bookmarks
            if (currentTab === 'bookmarks' && tab !== 'bookmarks') {
                history.replaceState({}, '', '/');
            }

            // Hide all screens
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

            // Show the right one
            const screen = document.getElementById('screen-' + tab);
            if (screen) {
                screen.classList.remove('active'); // ensure reflow always has something to reset
                void screen.offsetWidth;
                screen.classList.add('active');
            }

            // Manage data-page attribute for search
            if (tab === 'search') {
                document.body.setAttribute('data-page', 'search');
                setSubredditChip(appState.subreddit || '');
                // Sync content type tab indicator
                const activeType = appState.contentType || 'all';
                document.querySelectorAll('.content-type-tab').forEach(t => {
                    t.classList.toggle('active', t.dataset.value === activeType);
                });
                requestAnimationFrame(moveTabIndicator);
                initExploreGrid();
                const grid = document.getElementById('explore-grid');
                const searchResults = document.getElementById('search-results');
                const hasResults = searchResults && searchResults.children.length > 0;
                if (grid) grid.style.display = hasResults ? 'none' : 'flex';
                if (hasResults) document.body.classList.add('has-results');
            } else if (tab === 'subreddit') {
                document.body.setAttribute('data-page', 'subreddit');
            } else {
                document.body.removeAttribute('data-page');
                document.body.classList.remove('has-results');
                if (window.closeMobileSuggestions) window.closeMobileSuggestions();
                setSubredditChip('');
                if (tab === 'home') {
                    currentFilters.sort = 'hot';
                }
            }

            currentTab = tab;
            window.currentTab = tab;
            if (tab !== 'subreddit') setClownButton(false);
            isLoading = false;
            isScrollLoad = false;
            if (tabState[tab]) {
                currentAfter = tabState[tab].after;
                currentBefore = tabState[tab].before;
            }
            if (tab === 'search' || tab === 'subreddit') lastSearchAreaTab = tab;
            if (tab === 'bookmarks') lastBookmarksAreaTab = tab;
            sessionStorage.setItem('kf_current_tab', tab);
            
            // Init tab on first visit
            if (!tabInitialized[tab]) {
                tabInitialized[tab] = true;
                window.dispatchEvent(new Event(tab + '-tab-init'));
            }

            // Update active state on bottom bar
            document.querySelectorAll('.bottom-bar-item').forEach(item => {
                item.classList.remove('active');
            });
            const bottomTab = tab === 'subreddit' ? 'search' : tab;
            const activeItem = document.querySelector(`.bottom-bar-item[data-tab="${bottomTab}"]`);
            if (activeItem) activeItem.classList.add('active');

            // Restore scroll position for new tab
                window.scrollTo(0, tabScrollY[tab] || 0);
        }
        
        function restoreLastHomeArea() {
            const homeResults = document.getElementById('results');
            if (homeResults && homeResults.children.length > 0 && lastHomeState) {
                currentAfter = lastHomeState.after || null;
                currentBefore = lastHomeState.before || null;
                const cleanState = { ...lastHomeState, contentType: 'all' };
                Object.assign(appState, cleanState);
                history.replaceState({}, '', urlFromState(cleanState));
                switchTab('home');
                return;
            }
            isRestoringHome = true;
            if (lastHomeState) {
                navigateReplace({ ...lastHomeState, contentType: 'all' });
            } else if (currentTab === 'subreddit') {
                // Preserve subreddit state before navigating home
                lastSubredditState = { ...appState };
                lastSearchAreaTab = 'subreddit';
                isRestoringHome = false;
                navigateReplace({ tab: 'home', subreddit: '', query: '', sort: 'hot', pageIndex: 0, after: null, before: null, sectionId: null, contentType: 'all' });
            } else {
                navigateReplace({ tab: 'home', subreddit: '', query: '', sort: 'hot', pageIndex: 0, after: null, before: null, sectionId: null, contentType: 'all' });
            }
        }
        window.restoreLastHomeArea = restoreLastHomeArea;

        async function createNewSection() {
            const { value: newName } = await Swal.fire({
                title: 'New Section',
                input: 'text',
                inputPlaceholder: 'Section name',
                showCancelButton: true,
                confirmButtonText: 'Create Section',
                cancelButtonText: 'Cancel'
            });
            if (!newName || !newName.trim()) return null;
            try {
                const response = await fetch(`${API_BASE}/api/sections`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ name: newName.trim() })
                });
                const data = await response.json();
                if (response.ok) {
                    showToast(`Created ${newName.trim()}`, 'success');
                    const newId = data.section.id;
                    if (isMobile() && typeof showSectionsAntepage === 'function') showSectionsAntepage(true);
                    else if (!isMobile() && typeof initBookmarks === 'function') {
                        const url = new URL(window.location);
                        url.searchParams.set('section', newId);
                        window.history.replaceState({}, '', url);
                        initBookmarks();
                    }
                    return newId;
                }
            } catch (err) {
                console.error('❌ Failed to create section:', err);
            }
            return null;
        }
        window.createNewSection = createNewSection;

        function showCreateSheet() {
            showBottomSheet('Create', [
                { label: 'Create New Section', callback: () => createNewSection(), active: false }
            ]);
        }
        window.showCreateSheet = showCreateSheet;

        function restoreSearchResults(filters) {
            Object.assign(currentFilters, filters);
            switchTab('search');
            document.body.classList.add('has-results');
            const mobileSearchInput = document.getElementById('mobile-search-input');
            if (mobileSearchInput) mobileSearchInput.value = filters.query || '';
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.value = filters.query || '';
            const grid = document.getElementById('explore-grid');
            if (grid) grid.style.display = 'none';
            setSubredditChip(filters.subreddit || '');
            handleSearchRequest(null, null, true, true);
        }

        function resetSearchPage() {
            document.body.classList.remove('has-results');
            setSubredditChip('');
            currentFilters.subreddit = '';
            currentFilters.query = '';
            appState.subreddit = '';
            appState.query = '';
            const searchInput = document.getElementById('search-input');
            if (searchInput) searchInput.value = '';
            const mobileSearchInput = document.getElementById('mobile-search-input');
            if (mobileSearchInput) mobileSearchInput.value = '';
            const searchResults = document.getElementById('search-results');
            if (searchResults) searchResults.innerHTML = '';
            const grid = document.getElementById('explore-grid');
            if (grid) grid.style.display = 'flex';
            history.replaceState({}, '', '/?page=search');
        }

        function restoreLastSearchArea() {
            if (currentTab === 'search' || currentTab === 'subreddit') {
                navStack = [];
                resetSearchPage();
                switchTab('search');
                return;
            }

            activeQueryToken++;
            const stateToRestore = lastSearchAreaTab === 'subreddit' ? lastSubredditState : lastSearchState;

            if (stateToRestore) {
                Object.assign(appState, stateToRestore);
                currentFilters.query = stateToRestore.query || '';
                currentFilters.subreddit = stateToRestore.subreddit || '';
                currentFilters.sort = stateToRestore.sort || 'hot';
                currentFilters.time = stateToRestore.time || 'all';
                currentFilters.contentType = stateToRestore.contentType || 'all';
                currentAfter = stateToRestore.after || null;
                currentBefore = stateToRestore.before || null;
                const si = document.getElementById('search-input');
                const msi = document.getElementById('mobile-search-input');
                if (si) si.value = stateToRestore.query || '';
                if (msi) msi.value = stateToRestore.query || '';
            } else {
                currentAfter = null;
                currentBefore = null;
            }
            switchTab(lastSearchAreaTab);
            history.replaceState({}, '', urlFromState(appState));
        }
        window.restoreLastSearchArea = restoreLastSearchArea;

        function handleBackButton() {

            const prev = navStack.pop();

            if (!prev) {
                performViewTransition('back', () => {
                    resetSearchPage();
                    switchTab('search');
                });
                return;
            }

            if (prev.screen === 'subreddit') {
                performViewTransition('back', () => openSubredditView(prev.subreddit, true));
                return;
            }

            if (prev.screen === 'search-results') {
                performViewTransition('back', () => restoreSearchResults(prev.filters));
                return;
            }

            // prev.screen === 'explore' or fallback
            performViewTransition('back', () => {
                resetSearchPage();
                switchTab('search');
            });
        }
        
        window.handleBackButton = handleBackButton;

        function restoreTabOnLoad(urlParams) {
            const page = urlParams.get('page');

            if (page === 'subreddit') {
                const sub = urlParams.get('sub');
                if (sub) {
                    currentFilters.subreddit = sub; currentFilters.sort = urlParams.get('sort') || 'hot'; currentFilters.query = ''; currentFilters.time = urlParams.get('time') || 'all'; currentFilters.contentType = urlParams.get('type') || 'all';
                    currentTab = 'subreddit';
                    sessionStorage.setItem('kf_current_tab', 'subreddit');
                    switchTab('subreddit');
                    return 'subreddit';
                }
            }

            if (page === 'search' || page === 'bookmarks') {
                switchTab(page);
                return page;
            }

            return 'home';
        }

        function restoreUIState(urlParams) {
            applyFiltersToUI(getFiltersFromURL());
            restoreToggleStates();
            document.body.setAttribute('data-layout', localStorage.getItem('mobile-layout') || 'comfy');
        }

        function initDropdowns() {
            const subredditInput = document.querySelector('#subreddit-input');
            const subredditDropdown = document.querySelector('.subreddit-suggestions');
            if (!subredditInput || !subredditDropdown) return;

            document.addEventListener('mousedown', (e) => {
                const clickedOutside = !subredditInput.contains(e.target) &&
                    !subredditDropdown.contains(e.target) &&
                    !e.target.classList.contains('delete-recent-btn');
                if (clickedOutside) subredditDropdown.classList.remove('active');
            });

            subredditDropdown.addEventListener('click', (e) => {
                const clickedSuggestion = e.target.closest('.subreddit-suggestion');
                if (clickedSuggestion) {
                    subredditInput.value = clickedSuggestion.dataset.name || clickedSuggestion.innerText;
                    subredditDropdown.classList.remove('active');
                }
            });
        }

        function initPage() {
            const url = new URL(window.location);
            if (url.searchParams.has('after') || url.searchParams.has('before')) {
                url.searchParams.delete('after');
                url.searchParams.delete('before');
                history.replaceState({}, '', url.toString());
            }
            Object.assign(appState, stateFromURL());
            if (appState.tab === 'search' && !new URLSearchParams(window.location.search).get('sort')) {
                appState.sort = 'hot';
            }
            updateLoginButton();
            updateThemeToggleVisibility();
            restoreUIState();
            initDropdowns();
            loadCachedPosts();
            renderForState(appState, true);
            setupSearchScrollListener();
        }

        // DOM load wrapper
        function onReady(fn) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', fn);
            } else {
                fn();
            }
        }

        onReady(async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            const isShare = window.location.pathname.includes('/share/');

            // Fix iOS tap-through bug
            document.querySelectorAll('.bottom-bar-item').forEach(item => {
                item.addEventListener('touchstart', () => {
                    if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                        document.activeElement.blur();
                    }
                }, { passive: true });
            });

            loadBlocklist();

            if (token) {
                // Magic link — verifyMagicLink handles initPage() after success
                verifyMagicLink(token);
                return;
            }

            // Always verify cookie against server before rendering auth state
            try {
                const res = await fetch('/verify-token', { method: 'POST', credentials: 'include' });
                const data = await res.json();
                if (data.valid) {
                    isLoggedIn = true;
                    localStorage.setItem('isLoggedIn', 'true');
                } else {
                    isLoggedIn = false;
                    localStorage.setItem('isLoggedIn', 'false');
                    clearUserDataOnLogout();
                }
            } catch (e) {
                isLoggedIn = false;
                localStorage.setItem('isLoggedIn', 'false');
            }

            if (isShare) {
                updateLoginButton();
                updateThemeToggleVisibility();
                restoreUIState();
                initDropdowns();
            } else {
                initPage();
            }
        });

        // Show section picker menu (mobile)
        async function showSectionPickerMenu(post) {
            if (!isMobile()) return null;
            return new Promise(async (resolve, reject) => {
                // Create overlay 
                const overlay = document.createElement('div');
                overlay.className = 'section-picker-overlay';
                overlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.3);
                    z-index: 9998;
                    opacity: 0;
                    transition: opacity 0.2s ease;
                `;

                // Create bottom sheet
                const sheet = document.createElement('div');
                sheet.className = 'section-picker-sheet';
                sheet.style.cssText = `
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    background: var(--card-color);
                    border-radius: 16px 16px 0 0;
                    height: 70vh;
                    max-height: 90vh;
                    overflow-y: auto;
                    z-index: 9999;
                    transform: translateY(100%);
                    transition: transform 0.25s ease-in-out;
                    box-shadow: 0 -4px 20px var(--shadow-card);
                `;

                // Header
                const header = document.createElement('div');
                header.style.cssText = `
                    padding: 13px 16px 13px;
                    position: sticky;
                    top: 0;
                    background: var(--card-color);
                    z-index: 1;
                `;
                header.innerHTML = `
                    <div style="width: 56px; height: 4px; background: var(--border-color); border-radius: 2px; margin: 0 auto 4px;"></div>
                    <h3 style="margin: 0; font-size: 1.2rem; color: var(--text-color); font-weight: 600;">Collections</h3>
                `;

                // List container
                const listContainer = document.createElement('div');
                listContainer.style.cssText = `
                    padding: 8px 0;
                `;

                sheet.appendChild(header);
                sheet.appendChild(listContainer);

                // Fetch sections
                let sectionsData;

                try {
                    const sectionsResponse = await fetch(`${API_BASE}/api/sections/with-previews`, {
                        credentials: 'include'
                    });
                    sectionsData = await sectionsResponse.json();

                    // Build section items
                    for (const section of sectionsData.sections) {
                        const item = document.createElement('div');
                        item.className = 'section-picker-item';
                        if (section.over_18) item.classList.add('nsfw');
                        item.setAttribute('data-permalink', section.permalink);

                        // Thumbnail container 
                        const thumbContainer = document.createElement('div');
                        thumbContainer.style.cssText = `
                            width: 55px;
                            height: 55px;
                            border-radius: 13px;
                            overflow: hidden;
                            flex-shrink: 0;
                            margin-right: 9px;
                            background: var(--placeholder-bg);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                        `;

                        // Get thumbnail with cache
                        const isComment = section.permalink && section.permalink.split('/').filter(Boolean).length > 5;
                        if (section.url && !isComment) {
                            const sectionPost = {
                                reddit_post_id: section.reddit_post_id,
                                title: section.title,
                                url: section.url,
                                permalink: section.permalink,
                                subreddit: section.subreddit,
                                score: section.score,
                                is_video: section.is_video,
                                domain: section.domain,
                                author: section.author,
                                created_utc: section.created_utc,
                                num_comments: section.num_comments,
                                over_18: section.over_18,
                                preview: section.preview,
                                selftext: section.selftext,
                                body: section.body,
                                is_gallery: section.is_gallery,
                                gallery_data: section.gallery_data,
                                media_metadata: section.media_metadata,
                                crosspost_parent_list: section.crosspost_parent_list,
                                content_type: section.content_type,
                                icon_url: section.icon_url,
                                locked: section.locked,
                                stickied: section.stickied
                            };

                            const domain = getDomainFromUrl(sectionPost.url);
                            const thumbnailURL = getThumbnailUrl(sectionPost);
                            const cachedUrl = await getCachedSectionImage(section.permalink);
                            const urlToUse = cachedUrl || thumbnailURL;
                            const mediaContainer = createMediaElement(sectionPost, urlToUse, domain, thumbContainer, true);
                            thumbContainer.appendChild(mediaContainer);

                            // Cache if not cached
                            if (!cachedUrl && thumbnailURL) {
                                cacheSectionImage(section.permalink, thumbnailURL);
                            }
                        } else {
                            // Empty section - show news icon fallback
                            const newsIcon = document.createElement('div');
                            newsIcon.className = 'news-icon-fallback';
                            newsIcon.style.cssText = `
                                width: 55px;
                                height: 55px;
                                background-size: 60px 60px;
                                position: relative;
                            `;
                            thumbContainer.appendChild(newsIcon);
                        }

                        // Section info 
                        const info = document.createElement('div');
                        info.style.cssText = `
                            flex: 1;
                            display: flex;
                            align-items: center;
                            gap: 5px;
                        `;
                        const nameSpan = document.createElement('span');
                        nameSpan.style.cssText = 'font-size: 1rem; color: var(--text-color); font-weight: 600;';
                        nameSpan.textContent = section.section_name;
                        info.appendChild(nameSpan);

                        item.appendChild(thumbContainer);
                        item.appendChild(info);

                        // Click handler
                        item.addEventListener('click', () => {
                            closeMenu();
                            resolve(section.section_id);
                            showToast(`Saved to ${section.section_name}`, 'success');
                        });

                        listContainer.appendChild(item);
                    }

                    // Create New Section button
                    const createBtn = document.createElement('div');
                    createBtn.className = 'section-picker-create-btn';
                    createBtn.textContent = 'Create new section';
                    createBtn.addEventListener('click', async () => {
                        const sectionId = await createNewSection();
                        if (sectionId) {
                            closeMenu();
                            resolve(sectionId);
                        }
                    });
                    const footer = document.createElement('div');
                    footer.style.cssText = `
                        position: sticky;
                        bottom: 0;
                        background: var(--card-color);
                        padding-top: 3px;
                        padding-right: 16px;
                        padding-left: 16px;
                        padding-bottom: calc(env(safe-area-inset-bottom) + 1px);
                        margin-bottom: 0px;
                        z-index: 41;
                        border-top: 1px solid var(--border-color);
                    `;
                    footer.appendChild(createBtn);
                    sheet.appendChild(footer);

                } catch (error) {
                    console.error('Failed to load sections:', error);
                    closeMenu();
                    reject(error);
                    return;
                }

                // Patch gallery images
                sectionsData.sections.forEach(section => {
                    if (section.is_gallery && section.gallery_data && section.media_metadata) {
                        const item = listContainer.querySelector(`[data-permalink="${section.permalink}"]`);
                        if (item) {
                            const fullPost = {
                                is_gallery: section.is_gallery,
                                gallery_data: section.gallery_data,
                                media_metadata: section.media_metadata
                            };
                            tryGalleryPatch(fullPost, section.permalink, item, 1, true);
                        }
                    }
                });

                // Close menu function
                function closeMenu() {
                    document.removeEventListener('mousemove', dragging);
                    document.removeEventListener('touchmove', dragging);
                    document.removeEventListener('mouseup', dragStop);
                    document.removeEventListener('touchend', dragStop);
                    sheet.style.transform = 'translateY(100%)';
                    overlay.style.opacity = '0';
                    setTimeout(() => {
                        overlay.remove();
                        sheet.remove();
                    }, 200);
                }

                // Swipe to close or expand
                let isDragging = false;
                let startY = 0;
                let startHeight = 0;

                const dragStart = (e) => {
                    isDragging = true;
                    startY = e.touches?.[0].pageY || e.pageY;
                    startHeight = parseInt(getComputedStyle(sheet).height);
                    sheet.style.transition = 'none';
                };

                const dragging = (e) => {
                    if (!isDragging) return;

                    const currentY = e.touches?.[0].pageY || e.pageY;
                    const delta = startY - currentY; // Positive when dragging up
                    const newHeight = startHeight + delta;

                    // Constrain between 0 and 80vh
                    const maxHeightPx = window.innerHeight * 0.8;
                    const constrainedHeight = Math.max(0, Math.min(newHeight, maxHeightPx));

                    sheet.style.height = `${constrainedHeight}px`;
                    e.preventDefault();
                };

                const dragStop = () => {
                    if (!isDragging) return;
                    isDragging = false;

                    sheet.style.transition = 'height 0.2s ease';

                    const currentHeightPx = parseInt(getComputedStyle(sheet).height);
                    const currentHeightVh = (currentHeightPx / window.innerHeight) * 100;

                    // Snap logic
                    if (currentHeightVh < 25) {
                        // Close if dragged below 25vh
                        closeMenu();
                        resolve(null);
                    } else if (currentHeightVh > 60) {
                        // Snap to 80vh if dragged above 60vh
                        sheet.style.height = '90vh';
                    } else {
                        // Snap back to 70vh
                        sheet.style.height = '70vh';
                    }
                };

                // Add listeners to the header (drag handle area)
                header.addEventListener('mousedown', dragStart);
                header.addEventListener('touchstart', dragStart);

                document.addEventListener('mousemove', dragging);
                document.addEventListener('touchmove', dragging, { passive: false });

                document.addEventListener('mouseup', dragStop);
                document.addEventListener('touchend', dragStop);

                // Close on overlay click
                overlay.addEventListener('click', () => {
                    closeMenu();
                    resolve(null); // User cancelled
                });

                // Append and animate
                document.body.appendChild(overlay);
                document.body.appendChild(sheet);

                // Trigger animations
                requestAnimationFrame(() => {
                    overlay.style.opacity = '1';
                    sheet.style.transform = 'translateY(0)';
                });
            });
        }

         // ============ HELPERS ============

        async function applySafeSearchFilter() {
                const safeSearchSelect = document.getElementById('safesearch-select');
                if (safeSearchSelect?.value === 'on') {
                    document.body.classList.add('safe-search-enabled');
                } else {
                    document.body.classList.remove('safe-search-enabled');
                }
            }

        function initializeVideoPlayers() {
            const players = document.querySelectorAll('.js-player');
            const mobile = isMobile();
            players.forEach(player => {
                if (!player.plyr) {
                    const plyrInstance = new Plyr(player, {
                        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
                        volume: 1,
                        muted: mobile,
                        autoplay: mobile,
                        clickToPlay: true,
                        hideControls: false,
                        seekTime: 10,
                        displayDuration: true,
                        invertTime: false,
                        toggleInvert: true
                    });

                    if (!mobile) {
                        plyrInstance.muted = false;
                        plyrInstance.volume = 1;
                    }
                }
            });
        }

        function createVoteButtons(post, permalinkUrl) {
            const upvoteBtn = document.createElement('a');
            upvoteBtn.href = permalinkUrl;
            upvoteBtn.target = '_blank';
            upvoteBtn.className = 'vote-button-up';

            const voteCount = document.createElement('div');
            voteCount.className = 'vote-count';
            voteCount.textContent = formatNumber(post.score);

            const downvoteBtn = document.createElement('a');
            downvoteBtn.href = permalinkUrl;
            downvoteBtn.target = '_blank';
            downvoteBtn.className = 'vote-button-down';

            return { upvoteBtn, voteCount, downvoteBtn };
        }

        function createCommentIcon(post, permalinkUrl) {
            const commentIcon = document.createElement('a');
            commentIcon.href = permalinkUrl;
            commentIcon.target = '_blank';
            commentIcon.className = 'mobile-vote-item comment-count-mobile';
            const isBluebird = document.body.classList.contains('bluebird-theme');
            const isForest = document.body.classList.contains('forest-theme');
            const commentSrc = isBluebird ? 'assets/icons8-comment_blue.svg' : isForest ? 'assets/icons8-comment-72.png' : 'assets/icons8-comment.svg';
            commentIcon.innerHTML = `
                <img src="${commentSrc}" class="comment-icon-img">
                <span>${formatNumber(post.num_comments || 0)}</span>
        `;
            return commentIcon;
        }

        function savePostsToDatabase(posts, pageGroupParam) {
            if (posts.length < 10) {
                return;
            }

            const pageGroup = pageGroupParam;
            const validPosts = posts.filter(post => post?.data && post.data.id);

            if (validPosts.length < posts.length) {
                console.warn(`⚠️ Dropped ${posts.length - validPosts.length} malformed posts`);
            }

            const cleanPosts = validPosts.map((post, index) => ({
                data: {
                    id: post.data.id,
                    title: post.data.title || '',
                    url: post.data.url || '',
                    permalink: post.data.permalink || '',
                    subreddit: post.data.subreddit || '',
                    score: post.data.score || 0,
                    is_video: Boolean(post.data.is_video),
                    domain: post.data.domain || '',
                    author: post.data.author || '',
                    created_utc: post.data.created_utc || 0,
                    num_comments: post.data.num_comments || 0,
                    over_18: Boolean(post.data.over_18),
                    selftext: post.data.selftext || '',
                    body: post.data.body || '',
                    is_gallery: Boolean(post.data.is_gallery),
                    gallery_data: post.data.gallery_data || null,
                    media_metadata: post.data.media_metadata || null,
                    crosspost_parent_list: post.data.crosspost_parent_list || [],
                    content_type: post.data.content_type || '',
                    icon_url: post.data.icon_url || null,
                    locked: Boolean(post.data.locked),
                    stickied: Boolean(post.data.stickied),
                    preview: post.data.preview || null,
                    position: index
                }
            }));

            // Send to server 
            fetch(`${API_BASE}/api/save-posts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    posts: cleanPosts,
                    page_group: pageGroup
                })
            })
                .then(res => {
                    if (!res.ok) {
                        throw new Error(`Server error: ${res.status}`);
                    }
                    return res.json();
                })
                .catch(err => console.error(`Save failed: ${err.message}`));
        }

        function createAuthorLink(author) {
            const authorLink = document.createElement('a');
            authorLink.className = 'author-link';
            authorLink.href = `https://www.reddit.com/user/${author}`;
            authorLink.target = '_blank';
            authorLink.textContent = `${author}`;
            return authorLink;
        }

        function applyStaggeredAnimation(selector, classToAdd, delayBetween = 30, container = document) {
            const elements = container.querySelectorAll(selector);
            elements.forEach((element, index) => {
                setTimeout(() => {
                    requestAnimationFrame(() => {
                        element.classList.add(classToAdd);
                    });
                }, index * delayBetween);
            });
        }

        function showLoading(targetContainer = getResultsContainer()) {
            isLoading = true;
            const grid = document.getElementById('explore-grid');
            if (grid) grid.style.display = 'none';
            targetContainer.innerHTML = `
        <div class='results-error' id='spinner-box' style="opacity: 0; transition: opacity 0.25s ease;"></div>
        `;
            const spinnerWrapper = createCanvasSpinner();
            const spinnerBox = document.getElementById('spinner-box');
            spinnerBox.appendChild(spinnerWrapper);

            setTimeout(() => {
                requestAnimationFrame(() => {
                    spinnerBox.style.opacity = '1';
                });
            }, 10);


            targetContainer.style.opacity = 1;
        }

        function decodeEntities(input) {
            const txt = document.createElement('textarea');
            txt.innerHTML = input;
            return txt.value;
        }

        function parseMarkdown(text) {

        // Decode common HTML entities before sanitizing
            let processed = text.replace(/&nbsp;/g, ' ');
            processed = sanitizeHTML(processed);

            // Headers (h1-h6)
            processed = processed.replace(/^#{1,6}\s*(.+)$/gm, (match, content) => {
                const level = match.match(/^#+/)[0].length;
                return `<h${level}>${content}</h${level}>`;
            });

            // Bold
            processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            processed = processed.replace(/__(.+?)__/g, '<strong>$1</strong>');

            // Italic - use word boundaries
            processed = processed.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
            processed = processed.replace(/\b_(.+?)_\b/g, '<em>$1</em>');

            // Strikethrough (~~text~~)
            processed = processed.replace(/~~([^~]+)~~/g, '<del>$1</del>');

            // Inline code (`code`)
            processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');

            // Reddit spoilers (>!text!<)
            processed = processed.replace(/>!([^!]+)!</g, '<span class="spoiler">$1</span>');

            // Quotes (lines starting with >)
            processed = processed.replace(/^>\s?(.+)$/gm, '<blockquote>$1</blockquote>');

            // Links with text [text](url)
            processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                // Sanitize URL
                if (url.startsWith('javascript:') || url.startsWith('data:') || url.startsWith('vbscript:')) {
                    return text; // Strip malicious links
                }
                // Ensure it's a valid HTTP/HTTPS URL
                if (!url.match(/^https?:\/\//)) {
                    return text; // Strip non-HTTP links
                }
                return `<a href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
            });

            // Line breaks (Reddit uses two spaces at end of line or double newline)
            if (processed.match(/[\[\(][^\]\)]*$/)) {
                processed = processed.replace(/[\[\(][^\]\)]*$/, '...');
            }

            processed = processed.replace(/  \n/g, '<br>');
            processed = processed.replace(/\n\n/g, '<br><br>');

            return processed;
        }

        function renderCommentBody(rawBody) {

            const wrapper = document.createElement('div');
            wrapper.className = 'comment-body';
            wrapper.tabIndex = 0;
            wrapper.setAttribute('aria-label', 'Comment content');

            // Decode HTML entities
            const txt = document.createElement("textarea");
            txt.innerHTML = rawBody.trim();
            let decoded = txt.value;

            // Check for Reddit images first
            const imageRegex = /(https:\/\/preview\.redd\.it\/[^\s]+?\.(jpeg|jpg|png|gif|webp)(\?[^\s]*)?)/i;
            const imageMatch = decoded.match(imageRegex);

            // Check for different GIF formats
            const giphyRegex = /!\[gif\]\(giphy\|([^|)]+)(?:\|[^)]*)?\)/i;
            const redditGifRegex = /!\[gif\]\(emote\|[^|]*\|([^\)]+)\)/i;
            const directGifRegex = /(https?:\/\/[^\s]+\.gif(\?[^\s]*)?)/i;

            const giphyMatch = decoded.match(giphyRegex);
            const redditGifMatch = decoded.match(redditGifRegex);
            const directGifMatch = decoded.match(directGifRegex);

            if (imageMatch) {
                // Handle Reddit images
                const img = document.createElement('img');
                img.src = imageMatch[1];
                img.alt = 'Image from comment';
                img.style.maxWidth = '100%';
                img.style.borderRadius = '8px';
                wrapper.appendChild(img);
            } else if (giphyMatch) {
                // Handle Giphy GIFs
                const gifId = giphyMatch[1];
                const img = document.createElement('img');
                img.src = `https://media.giphy.com/media/${gifId}/giphy.gif`;
                img.alt = 'GIF from comment';
                img.style.maxWidth = '100%';
                img.style.borderRadius = '8px';
                wrapper.appendChild(img);
            } else if (redditGifMatch) {
                // Handle Reddit native GIFs
                const gifId = redditGifMatch[1];
                const img = document.createElement('img');
                img.src = `https://www.redditstatic.com/desktop2x/img/gold/badges/award-silver-large.png` 
                img.alt = 'Reddit GIF from comment';
                img.style.maxWidth = '100%';
                img.style.borderRadius = '8px';
                wrapper.appendChild(img);
            } else if (directGifMatch) {
                // Handle direct GIF URLs
                const img = document.createElement('img');
                img.src = directGifMatch[1];
                img.alt = 'GIF from comment';
                img.style.maxWidth = '100%';
                img.style.borderRadius = '8px';
                wrapper.appendChild(img);
            } else {
                // Parse markdown ONLY for non-image content
                decoded = parseMarkdown(decoded);
                // Handle text content
                const urlRegex = /(https?:\/\/[^\s<]+)/g;
                const lines = decoded.split('\n');
                lines.forEach(line => {
                    const lineEl = document.createElement('div');
                    if (line.trim().startsWith('>')) {
                        lineEl.className = 'quote';
                        lineEl.textContent = line.replace(/^>\s?/, '');
                    } else {
                        // Process and sanitize URLs
                        if (!line.includes('<a href=')) {
                            line = line.replace(urlRegex, url => {
                                // Block dangerous URLs
                                if (url.toLowerCase().startsWith('javascript:') ||
                                    url.toLowerCase().startsWith('data:')) {
                                    return url; // Just show text
                                }
                                return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
                            });
                        }
                        lineEl.innerHTML = line;
                    }
                    wrapper.appendChild(lineEl);
                });
            }
            return wrapper;
        }

        async function deleteBookmark(bookmarkId) {
            await fetch(`${API_BASE}/api/bookmarks/${bookmarkId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
        }

        async function saveBookmarkWithSection(post, bookmarkId, sectionId) {
            await fetch(`${API_BASE}/api/bookmarks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                        },
                credentials: 'include',
                body: JSON.stringify({
                    postId: bookmarkId,
                    sectionId: sectionId,
                    title: post.title || '',
                    url: post.url || '',
                    permalink: post.permalink || '',
                    subreddit: post.subreddit || '',
                    score: post.score || 0,
                    is_video: Boolean(post.is_video),
                    domain: post.domain || '',
                    author: post.author || '',
                    created_utc: post.created_utc || 0,
                    num_comments: post.num_comments || 0,
                    over_18: Boolean(post.over_18),
                    selftext: post.selftext || '',
                    body: post.body || '',
                    is_gallery: Boolean(post.is_gallery),
                    gallery_data: post.gallery_data || null,
                    media_metadata: post.media_metadata || null,
                    crosspost_parent_list: post.crosspost_parent_list || [],
                    content_type: post.content_type || '',
                    icon_url: post.icon_url || null,
                    locked: Boolean(post.locked),
                    stickied: Boolean(post.stickied),
                    preview: post.preview || null
                }),
            });
        }

        async function reorderBookmarkToTop(bookmarkId, sectionId) {
            const sectionResponse = await fetch(`${API_BASE}/api/bookmarks/section/${sectionId}?offset=0&limit=100`, {
                credentials: 'include'
            });
            const sectionData = await sectionResponse.json();
            const existingIds = sectionData.bookmarks.map(b => b.reddit_post_id).filter(id => id !== bookmarkId);
            const orderedIds = [bookmarkId, ...existingIds];

            await fetch(`${API_BASE}/api/bookmarks/reorder`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    orderedIds,
                    sectionId: sectionId
                })
            });
        }

        function updateBookmarkUI(iconElement, bookmarkId, isSaved) {
            const savedBookmarks = JSON.parse(sessionStorage.getItem('bookmarks') || '{}');

            if (isSaved) {
                iconElement.classList.add('saved');
                savedBookmarks[bookmarkId] = true;
            } else {
                iconElement.classList.remove('saved');
                delete savedBookmarks[bookmarkId];
            }

            sessionStorage.setItem('bookmarks', JSON.stringify(savedBookmarks));
        }

        
        function hideBookmarksUI() {
            const tabsSection = document.querySelector('.tabs-section');
            if (tabsSection) tabsSection.remove();

            const indicator = document.querySelector('.scroll-container-minimal');
            if (indicator) indicator.style.display = 'none';

            const buttonGroup = document.querySelector('.button-group');
            if (buttonGroup) buttonGroup.remove();
        }

        function getAuthStatus() {
            return localStorage.getItem('isLoggedIn') === 'true';
        }

        function requireAuth() {
            const authStatus = getAuthStatus();
            if (!authStatus) {
                window.location.href = '/html/login.html';
                return null;
            }
            return authStatus;
        }

        function filterPostsByContent(posts, contentType) {
                if (contentType === 'all') {
                    return posts;
                }

                return posts.filter(post => {
                    const postContentType = classifyContentType(post);
                    return postContentType === contentType;
                });
            }

        function filterPostsByTime(posts, timeFilter) {
            if (timeFilter === 'all') {
                return posts;
            }

            const now = Math.floor(Date.now() / 1000);
            let timeCutoff = 0;

            switch (timeFilter) {
                case "hour": timeCutoff = now - 7140; break;     // 119 minutes
                case "day": timeCutoff = now - 169200; break;    // 47 hours  
                case "week": timeCutoff = now - 604800; break;   // 7 days
                case "month": timeCutoff = now - 2592000; break; // 30 days
                case "year": timeCutoff = now - 31536000; break; // 365 days
                default: timeCutoff = 0;
            }

            return posts.filter(post => post.created_utc >= timeCutoff);
        }








        function trimRedditPostData(post) {
            return {
                id: post.data.id,
                title: post.data.title,
                url: post.data.url,
                permalink: post.data.permalink,
                subreddit: post.data.subreddit,
                score: post.data.score,
                is_video: post.data.is_video,
                domain: post.data.domain,
                author: post.data.author,
                created_utc: post.data.created_utc,
                num_comments: post.data.num_comments,
                over_18: post.data.over_18,
                preview: post.data.preview,
                selftext: post.data.selftext,
                body: post.data.body,
                is_gallery: post.data.is_gallery,
                gallery_data: post.data.gallery_data,
                media_metadata: post.data.media_metadata,
                crosspost_parent_list: post.data.crosspost_parent_list || [],
                content_type: post.data.content_type || '',
                icon_url: null,
                locked: post.data.locked,
                stickied: post.data.stickied
            };
        }

        function loadCachedPosts() {
            // Initialize global cache objects if they don't exist
            if (typeof window !== 'undefined') {
                if (!window.cachedPostsById) window.cachedPostsById = {};
                if (!window.cachedMediaByUrl) window.cachedMediaByUrl = {};
            }

            return Promise.resolve();
        }

        async function processBatchedPosts(posts, batchSize, processFn, renderToken) {
            for (let i = 0; i < posts.length; i += batchSize) {
                if (renderToken !== undefined && renderToken !== activeQueryToken) return;
                const batch = posts.slice(i, i + batchSize);

                for (const post of batch) {
                    await processFn(post);
                }

                // Yield to event loop between batches
                await new Promise(resolve => setTimeout(resolve, 0));
            }
        }

        function createActionButton(label, iconPath, url) {
            const action = document.createElement('div');
            action.className = 'result-action';
            action.tabIndex = 0;
            action.setAttribute('aria-label', label);
            action.innerHTML = `
<svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    ${iconPath}
</svg>
${label}`;

            action.style.cursor = 'pointer';

            const openUrl = () => window.open(url, '_blank');
            action.addEventListener('click', openUrl);
            action.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') openUrl();
            });

            return action;
        }

    // ============ MOBILE ============
        // Mobile Sidebar
        (function () {
            const hamburger = document.getElementById('mobileHamburger');
            const sidebar = document.getElementById('mobileSidebar');
            const overlay = document.getElementById('sidebarOverlay');
            const closeBtn = document.getElementById('sidebarClose');

            if (!hamburger || !sidebar || !overlay) return;

            function openSidebar() {
                sidebar.classList.add('open');
                overlay.classList.add('active');
                syncMobileDarkToggle();
                syncMobilePlanDisplay();
                syncMobilePaletteVisibility();
            }

            function closeSidebar() {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            }

            hamburger.addEventListener('click', openSidebar);
            closeBtn.addEventListener('click', closeSidebar);
            overlay.addEventListener('click', closeSidebar);

            // Sync dark mode toggle
            const mobileDarkToggle = document.getElementById('mobileDarkToggle');
            const mobileDarkIcon = document.getElementById('mobileDarkIcon');
            const desktopThemeToggle = document.getElementById('themeToggle');

            function syncMobileDarkToggle() {
                const desktopIcon = document.getElementById('themeIcon');
                const mobileToggleText = mobileDarkToggle.querySelector('span');

                if (desktopIcon) {
                    const isDarkMode = desktopIcon.src.includes('sun.png');

                    // Update text
                    if (mobileToggleText) {
                        mobileToggleText.textContent = isDarkMode ? 'Light Mode' : 'Dark Mode';
                    }
                }
            }

            if (mobileDarkToggle && desktopThemeToggle) {
                mobileDarkToggle.addEventListener('click', function () {
                    desktopThemeToggle.click();
                    setTimeout(syncMobileDarkToggle, 100);
                });
            }

            // Sync color palette button
            const mobilePaletteBtn = document.getElementById('mobilePaletteBtn');
            const mobilePaletteItem = document.querySelector('.mobile-palette-item');

            function syncMobilePaletteVisibility() {
                if (mobilePaletteItem) {
                    const authStatus = getAuthStatus();

                    if (authStatus && window.innerWidth < 1024) {
                        mobilePaletteItem.style.display = 'block';
                    } else {
                        mobilePaletteItem.style.display = 'none';
                    }
                }
            }

            if (mobilePaletteBtn) {
                mobilePaletteBtn.addEventListener('click', function () {
                    if (isMobile()) {
                        closeSidebar();
                        showThemesSheet();
                    } else if (window.toggleThemeMenu) {
                        window.toggleThemeMenu();
                        closeSidebar();
                    }
                });
            }

            // Sync plan display
            const mobilePlanDisplay = document.getElementById('mobilePlanDisplay');
            const mobilePlanItem = document.querySelector('.mobile-plan-item');

            function syncMobilePlanDisplay() {
                const desktopPlan = document.getElementById('plan-display');
                const desktopPlanContainer = document.querySelector('.plan-display-container');
                const mobileGetPremiumBtn = document.getElementById('mobileGetPremiumBtn');

                if (desktopPlanContainer && mobilePlanItem) {
                    if (desktopPlanContainer.classList.contains('visible')) {
                        // User is logged in
                        mobilePlanItem.style.display = 'block';

                        // Hide Get Premium button if user has plan
                        if (mobileGetPremiumBtn) {
                            const isPaid = desktopPlan && (desktopPlan.textContent.includes('Pro') || desktopPlan.textContent.includes('Premium'));
                            mobileGetPremiumBtn.parentElement.style.display = isPaid ? 'none' : 'block';
                        }
                    } else {
                        // User is logged out
                        mobilePlanItem.style.display = 'none';
                        // Show Get Premium button
                        if (mobileGetPremiumBtn) {
                            mobileGetPremiumBtn.parentElement.style.display = 'block';
                        }
                    }
                }
            }

            // Plan display click handler
            if (mobilePlanDisplay) {
                mobilePlanDisplay.addEventListener('click', function () {
                    const desktopPlanContainer = document.querySelector('.plan-display-container');
                    if (desktopPlanContainer) {
                        desktopPlanContainer.click();
                    }
                });
            }
        })();

        // Handle view switching
            window.addEventListener('resize', function () {
                const sidebar = document.getElementById('mobileSidebar');
                if (window.innerWidth > 1024) {
                    // Desktop view - close mobile sidebar if open
                    if (sidebar) {
                        sidebar.classList.remove('open');
                    }
                    const overlay = document.getElementById('sidebarOverlay');
                    if (overlay) {
                        overlay.classList.remove('active');
                    }
                }
            });

            let lastScrollY = 0;
            window.addEventListener('scroll', () => {
                const currentScrollY = window.scrollY;
                const topBar = document.querySelector('.mobile-top-bar');
                if (!topBar) return;
                if (currentScrollY > lastScrollY && currentScrollY > 50) {
                    topBar.classList.add('hidden');
                } else {
                    topBar.classList.remove('hidden');
                }
                lastScrollY = currentScrollY;
            });

        // Words words words
            fetch('html/words.json')
                .then(res => res.json())
                .then(words => {
                    window.englishWords = words;
                    setupSearchSuggestions('search-input', 'suggestions', window.englishWords);
                    setupSearchSuggestions('mobile-search-input', 'mobile-suggestions', window.englishWords);
                })
                .catch(err => {
                    console.error("❌ Failed to load word list:", err);
                });

        // ============ KF API ============
        let subredditSearchMode = false;
        let subredditSearchContext = '';

        window.KF = {
            openSubredditSearch(subreddit) {
                subredditSearchMode = true;
                subredditSearchContext = subreddit || '';
                document.body.setAttribute('data-page', 'search');
                setSubredditChip(subreddit || '');
                const input = document.getElementById('mobile-search-input');
                if (input) {
                    input.value = '';
                    input.focus();
                    input.dispatchEvent(new Event('input'));
                }
            },

            closeSubredditSearch() {
                subredditSearchMode = false;
                subredditSearchContext = '';
                if (window.closeMobileSuggestions) window.closeMobileSuggestions();
                document.body.setAttribute('data-page', 'subreddit');
                const input = document.getElementById('mobile-search-input');
                if (input) input.value = '';
            },

            submitSubredditSearch(query) {
                window.searchJustSubmitted = true;
                if (currentTab === 'subreddit') {
                    navStack.push({ screen: 'subreddit', subreddit: currentFilters.subreddit });
                }
                if (window.abortSearchSuggestionsRequest) window.abortSearchSuggestionsRequest();
                currentFilters.query = query;
                currentFilters.subreddit = subredditSearchContext;
                Object.assign(appState, { tab: 'search', query, subreddit: subredditSearchContext, pageIndex: 0, after: null, before: null });
                resetSortToHot();
                KF.closeSubredditSearch();
                switchTab('search');
                const input = document.getElementById('mobile-search-input');
                if (input) input.value = query;
                handleSearchRequest(null, null, false, true);
            },

            isSubredditSearchMode() {
                return subredditSearchMode;
            }
        };