let currentEmojiTarget = null;
let currentShareTarget = null;
let sharedContentOffset = 0;
let hasMoreSharedContent = false;
let currentShareCode = null;
let currentMenuOpener = null;
const hasMoreBookmarks = {};
let sectionBookmarks = {
    1: [], // Main bookmarks section
    2: []  // New section
};
// Ask for 11 to confirm if there are any more after current group of 10
const BOOKMARKS_PER_PAGE = 11;
window.authToken = localStorage.getItem('authToken');
// Use a separate offset for each section so scrolling works for both tabs
const sectionOffsets = {};

const urlParams = new URLSearchParams(window.location.search);
const isBookmarksPage = urlParams.get('page') === 'bookmarks';
const isSharePage = window.location.pathname.includes('/share/');

if (isBookmarksPage || isSharePage) {
    document.title = "Bookmarks";
    document.querySelector('meta[name="description"]').content = "Your saved Reddit posts";
    document.querySelector('meta[property="og:title"]').content = "Bookmarks - KarmaFinder";

    // Update description meta tag
    const descriptionMeta = document.querySelector('meta[name="description"]');
    if (descriptionMeta) {
        descriptionMeta.content = "Organize your saved Reddit posts with Pinterest-style bookmarking. Drag-and-drop organization, custom categories, and emoji tags.";
    }

    // Update OG title
    const ogTitleMeta = document.querySelector('meta[property="og:title"]');
    if (ogTitleMeta) {
        ogTitleMeta.content = "Reddit Bookmarks Manager - KarmaFinder";
    }

    // Update OG description  
    const ogDescMeta = document.querySelector('meta[property="og:description"]');
    if (ogDescMeta) {
        ogDescMeta.content = "Save and organize Reddit content with drag-and-drop bookmarking, custom categories, and visual organization.";
    }
    
    // Kick you out if auth token is cleared
    if (!isSharePage) {
        setInterval(() => {
            const authToken = localStorage.getItem('authToken');
            if (!authToken) {
                window.location.href = 'index.html';
            }
        }, 1000);
    }
}

// Create context menu HTML dynamically
function createContextMenu() {
    // Check if it already exists
    if (document.getElementById('contextMenu')) return;

    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.id = 'contextMenu';
    contextMenu.setAttribute('role', 'menu'); 
    contextMenu.setAttribute('aria-label', 'Section options');
    contextMenu.setAttribute('tabindex', '-1');

    contextMenu.innerHTML = `
        <div class="context-menu-item" data-action="rename">
            <span class="pengcil"></span>
            <span>Rename Section</span>
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" data-action="delete">
            <span>❌</span>
            <span>Delete Section</span>
        </div>
    `;

    document.body.appendChild(contextMenu);
}

function getAuthToken() {
    return window.authToken || localStorage.getItem('authToken');
}

// Basic initialization function for bookmarks page
function initBookmarks() {
    preloadBookmarks();
    createContextMenu();
    setupContextMenuHandlers();
    handleBookmarksPI();
    initializeTabs();
    handleRedditAuthParams();
    setupBookmarksScrollListener();
}

function handleRedditAuthParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const redditAuth = urlParams.get('reddit_auth');
    const autoImport = urlParams.get('auto_import');

    if (redditAuth === 'success' && autoImport === 'true') {
        // Show import dialog immediately with loading state
        setTimeout(() => {
            showRedditImportDialog();
        }, 200);

        // Clean up URL
        urlParams.delete('reddit_auth');
        urlParams.delete('auto_import');
        window.history.replaceState({}, '', '?' + urlParams.toString());

    } else if (redditAuth === 'error') {
        const errorType = urlParams.get('error_type');

        if (errorType === 'access_denied') {
            Swal.fire({
                title: 'Connection Cancelled',
                text: 'Reddit login was declined.',
                icon: 'info',
                confirmButtonText: 'OK'
            });
        } else {
            Swal.fire({
                title: 'Connection Failed',
                text: 'Reddit connection failed.',
                icon: 'error',
                confirmButtonText: 'OK'
            });
        }

        // Clean up URL
        urlParams.delete('reddit_auth');
        urlParams.delete('error_type');
        window.history.replaceState({}, '', '?' + urlParams.toString());
    }
}

function handleBookmarksPI(bookmarkCount) {

    // Only 72% chance of any speech event occurring
    if (Math.random() > 0.72) {
        return;
    }

    const generalResponses = [
        "Great choices.",
        "Hittin' the books.",
        "I'm pulling up your files.",
        "I like your taste.",
        "How goes it.",
        "It's a rainy Tuesday.",
        "Keeping tabs, I see.",
        "Books Marked."
        //"We could have called it the Dog Ears. Instead, it's called Bookmarks. That wasn't political or anything."
    ];

    if (bookmarkCount < 20) {
        // Mix empty response with general ones
        const responses = ["Kinda empty. Are you watching your digital footprint?", "You have no bookmarks. You should go to r/bmw maybe.", "It's kinda empty in here. Are you depressed?", ...generalResponses];
        handleRandomResponse(responses);
    } else if (bookmarkCount >= 150) {
        // 120+ bookmarks - impressive collection
        const responses = [
            "My client told me you have the most bookmarks he's ever seen.",
            "This is an... impressive digital library.",
            "You've been busy collecting, hah?",
            "We only have so much space, you know.",
            "Someone's been clicking.",
            "This collection rivals the Library of Congress.",
            "I have met a digital hoarder.",
            ...generalResponses
        ];
        handleRandomResponse(responses);
    } else if (bookmarkCount >= 20) {
        // 20-99 bookmarks - decent collection
        const responses = ["Quite the collection you have here.", "This is what they call a body of work.", "Beautiful bookmarks.", "You're a connoisseur, eh?", "Getting serious about organization, I see.", ...generalResponses];
        handleRandomResponse(responses);
    }
}

function handleTabSpecificPI(tabName) {

    // Only 40% chance of any speech event occurring
    if (Math.random() > 0.40) {
        return;
    }

    const normalizedTab = tabName.toLowerCase();

    // nuke pattern - what is wrong with u
    const nukePattern = /\b(rape|raped|raping|rapist|shota|guro|abuse|abused|abusing|violence|violent|illegal|underage|minor|child|children|kid|kids|teen|teenager|kill|murder|death|suicide|harm|hurt|torture)\b/i;
    if (nukePattern.test(tabName)) {
        return; 
    }

    if (normalizedTab === "food") {
        handleRandomResponse([`'${tabName}', makes me hungry.`]);
        return;
    }

    if (normalizedTab === "bookmarks") {
        handleRandomResponse([`'${tabName}'? Real imaginative.`]);
        return;
    }

    if (normalizedTab === "new section") {
        return;
    }

    const positiveResponses = [
        `'${tabName}'? I wanna see.`,
        `'${tabName}'? Good choice.`,
        `'${tabName}', that's good organization.`,
        `'${tabName}', I like it.`,
        `'${tabName}'? Smart.`,
        `'${tabName}', makes sense.`,
        `'${tabName}', interesting.`
    ];
    const negativeResponses = [
        `'${tabName}'. Interesting.`,
        `'${tabName}'? Uhh.`,
        `Whatever floats your boat.`,
        `'${tabName}', that's creative.`,
        `Heh.`,
        `For research purposes?`,
        `'${tabName}'?`,
        "Really?",
        "Okay.",
        "Bud...",
        "Same case, different day.",
        "The usual suspects."
    ];
    const nsfwPattern = /\b(tits|titties|tiddies|nudes|onlyfans|hentai|boobs|cum|cock|cocks|cunt|gape|gooning|gooner|goon|pussy|porn|nsfw|xxx|adult|sexy|dirty)\b/i;
    const isNSFW = nsfwPattern.test(tabName);
    const responses = isNSFW ? negativeResponses : positiveResponses;
    handleRandomResponse(responses, 0.7, 0.05); // 70% silence, 5% dots, 25% speech
}

// Function to create and insert the tabs UI
async function insertTabsUI(tabsData) {
    let tabContainer = document.querySelector('.tab-container');
    const contentContainer = document.querySelector('.results-container');

    if (!tabContainer) {
        const tabsSectionHTML = `
    <div class="tabs-section">
        <div class="tab-container"></div>
    </div>
`;

        if (contentContainer) {
            // insert tabs above results
            contentContainer.insertAdjacentHTML('beforebegin', tabsSectionHTML);

            // insert scroll indicator AFTER results container
            contentContainer.insertAdjacentHTML('afterend', `
        <div class="scroll-container-minimal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        </div>
    `);

            tabContainer = document.querySelector('.tab-container');
        } else {
            return;
        }

    } else {
        tabContainer.innerHTML = '';
    }

    tabsData.forEach((tab, index) => {
        const newTabElement = document.createElement('div');
        newTabElement.classList.add('tab');
        newTabElement.setAttribute('tabindex', '0');
        if (index === 0) {
            newTabElement.classList.add('active');
        }
        newTabElement.dataset.tabId = tab.id;
        newTabElement.dataset.sortOrder = tab.sort_order;

        // Create emoji span
        const emojiSpan = document.createElement('span');
        emojiSpan.classList.add('tab-emoji');
        emojiSpan.textContent = tab.emoji || '📌';
        newTabElement.appendChild(emojiSpan);

        // Create title span
        const titleSpan = document.createElement('span');
        titleSpan.classList.add('tab-title');
        titleSpan.textContent = tab.name;
        newTabElement.appendChild(titleSpan);

        // Click listener for the emoji
        emojiSpan.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent tab switch

            // Close ALL menus FIRST before any other logic
            const contextMenu = document.getElementById('contextMenu');
            if (contextMenu) {
                contextMenu.style.display = 'none';
            }
            const hermesContextMenu = document.getElementById('hermesContextMenu');
            if (hermesContextMenu) {
                hermesContextMenu.style.display = 'none';
            }
            const importMenu = document.getElementById('importMenu');
            if (importMenu) {
                importMenu.style.display = 'none';
            }
            const shareMenu = document.getElementById('shareMenu');
            if (shareMenu) {
                shareMenu.style.display = 'none';
            }

            const picker = document.getElementById('emojiPicker');
            // If picker is open and we clicked the same emoji, close it
            if (picker && picker.style.display === 'block' && currentEmojiTarget === emojiSpan) {
                picker.style.display = 'none';
                currentEmojiTarget = null;
                return;
            }

            showEmojiPicker(emojiSpan);
        });
        
        document.addEventListener('contextmenu', () => {
            const picker = document.getElementById('emojiPicker');
            if (picker && picker.style.display === 'block') {
                picker.style.display = 'none';
                currentEmojiTarget = null;
            }
        });

        document.addEventListener('click', function (e) {
            if (e.target.closest('.section-selector')) {
                const contextMenu = document.getElementById('contextMenu');
                if (contextMenu) {
                    contextMenu.style.display = 'none';
                }
            }
        });

        tabContainer.appendChild(newTabElement);
    });
        
    // Only add the + button if we have less than 8 tabs
    if (tabsData.length < 8) {
        const addSectionBtn = document.createElement('button');
        addSectionBtn.className = 'add-section-btn';
        addSectionBtn.title = 'Add New Section';
        addSectionBtn.innerHTML = '<span class="plus-sign">+</span>';
        tabContainer.appendChild(addSectionBtn);

        addSectionBtn.removeEventListener('click', createNewSection);
        addSectionBtn.addEventListener('click', createNewSection);
    

    if (addSectionBtn) {
        addSectionBtn.removeEventListener('click', createNewSection);
        addSectionBtn.addEventListener('click', createNewSection);
    }
    }
    setupTabEvents();
}

async function initializeTabs() {
    try {
        const authToken = getAuthToken();
        const response = await fetch(`${API_BASE}/api/sections`, {
            headers: {
                'Authorization': authToken
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (!data.sections) {
            console.error('No sections data received');
            return;
        }

        // If user has no sections, create a default "Bookmarks" section
        if (data.sections.length === 0) {
            await fetch(`${API_BASE}/api/sections`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authToken
                },
                body: JSON.stringify({ name: 'Bookmarks' })
            });
            // Fetch sections again to get the newly created one
            const newResponse = await fetch(`${API_BASE}/api/sections`, {
                headers: {
                    'Authorization': authToken
                }
            });
            const newData = await newResponse.json();
            data.sections = newData.sections; 
        }

        // Check if URL has section parameter, if not add the first section
        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.get('section')) {
            const url = new URL(window.location);
            url.searchParams.set('section', data.sections[0].id);
            window.history.replaceState({}, '', url);
            loadSectionContent(data.sections[0].id);
        }

        await insertTabsUI(data.sections);

    } catch (error) {
        console.error('Failed to load sections:', error);
    }
}

// Create New Section button
async function createNewSection() {
    try {
        const authToken = getAuthToken();
        const response = await fetch(`${API_BASE}/api/sections`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authToken
            },
            body: JSON.stringify({
                name: 'New Section'
            })
        });

        if (response.ok) {
            const data = await response.json();
            //console.log('New section created:', data.section);

            const urlParams = new URLSearchParams(window.location.search);
            const sectionParam = urlParams.get('section');

            initializeTabs();
            loadSectionContent(parseInt(sectionParam));
        } else {
            console.error('Failed to create section');
        }
    } catch (error) {
        console.error('Error creating section:', error);
    }
}

// Function to set up tab event listeners
function setupTabEvents() {
    document.querySelectorAll('.tab').forEach((tab, index) => {
        // Left-click listener for tab switching
        tab.addEventListener('click', function () {

            cleanupEventListeners();
            // Don't reload if this tab is already active
            if (this.classList.contains('active')) {
                return;
            }

            // Remove active class from all tabs
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            this.classList.add('active');

            // PI responds to the tab name when switching
            const tabNameElement = this.querySelector('.tab-title');
            if (tabNameElement) {
                const tabName = tabNameElement.textContent;
                handleTabSpecificPI(tabName);
            }

            // Hide scroll indicator when switching tabs
            const indicator = document.querySelector('.scroll-container-minimal');
            if (indicator) {
                indicator.style.display = 'none';
            }

            // Clean up old dropdown listeners
            document.querySelectorAll('.section-selector').forEach(button => {
                button.replaceWith(button.cloneNode(true));
            });

            // Close any open dropdowns when switching tabs
            document.querySelectorAll('.section-dropdown').forEach(dropdown => {
                dropdown.style.display = 'none';
                const card = dropdown.closest('.result-card');
                if (card) card.style.zIndex = '';
            });

            // Handle content switching based on tab position
            const sectionId = parseInt(this.dataset.tabId);
            //console.log(`🔢 Switching to section ${sortOrder}...`);
            loadSectionContent(sectionId);
        });

        // Keyboard trigger for context menu (Shift+F10 or Context Menu key)
        tab.addEventListener('keydown', function (e) {
            if (e.key === 'F10' && e.shiftKey || e.key === 'ContextMenu') {
                e.preventDefault();
                const contextMenu = document.getElementById('contextMenu');
                if (!contextMenu) return;

                // Get tab position for menu placement
                const rect = this.getBoundingClientRect();

                contextMenu.dataset.currentTabIndex = index;
                const titleSpan = this.querySelector('.tab-title');
                contextMenu.dataset.currentTabText = titleSpan ? titleSpan.textContent.trim() : this.textContent.trim();
                contextMenu.dataset.currentSectionId = this.dataset.tabId;

                // Position below the tab
                contextMenu.style.left = rect.left + 'px';
                contextMenu.style.top = (rect.bottom + window.scrollY + 5) + 'px';
                contextMenu.style.display = 'block';

                // Focus the menu container and highlight first item
                setTimeout(() => {
                    contextMenu.focus();
                    const items = contextMenu.querySelectorAll('.context-menu-item');
                    if (items.length > 0) {
                        updateContextMenuHighlight(items, 0);
                    }
                }, 10);

                // Keep menu within viewport
                const menuRect = contextMenu.getBoundingClientRect();
                if (menuRect.right > window.innerWidth) {
                    contextMenu.style.left = (rect.right - menuRect.width) + 'px';
                }
            }
        });

        // Right-click listener for context menu
        tab.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            // Close share menu
            const shareMenu = document.getElementById('shareMenu');
            if (shareMenu) {
                shareMenu.style.display = 'none';
            }
            const contextMenu = document.getElementById('contextMenu');
            if (!contextMenu) return;

            contextMenu.dataset.currentTabIndex = index;
            const titleSpan = this.querySelector('.tab-title');
            contextMenu.dataset.currentTabText = titleSpan ? titleSpan.textContent.trim() : this.textContent.trim();
            contextMenu.dataset.currentSectionId = this.dataset.tabId;
            contextMenu.style.left = e.clientX + 'px';
            contextMenu.style.top = (e.pageY + 5) + 'px';  
            contextMenu.style.display = 'block';
        
            // Keep menu within viewport
            const rect = contextMenu.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                contextMenu.style.left = (e.clientX - rect.width) + 'px';
            }
            if (rect.bottom > window.innerHeight) {
                contextMenu.style.top = (e.pageY - rect.height - 5) + 'px';  
            }
        });

        // Enter key listener
        tab.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.click(); 
            }
        });

        const urlParams = new URLSearchParams(window.location.search);
        const sectionParam = urlParams.get('section');
        if (sectionParam) {
            const targetTab = document.querySelector(`[data-tab-id="${sectionParam}"]`);
            if (targetTab) {
                // Remove active from all tabs
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                // Activate the target tab
                targetTab.classList.add('active');
                // Load its content
                loadSectionContent(parseInt(sectionParam));
            }
        }
    });
}

function setupContextMenuHandlers() {
    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) return;

    // Handle menu item clicks
    document.querySelectorAll('.context-menu-item').forEach(item => {
        item.addEventListener('click', async function () {
            const action = this.dataset.action;

            if (action === 'rename') {
                const currentName = contextMenu.dataset.currentTabText;
                const { value: newName } = await Swal.fire({
                    title: 'Rename Section',
                    input: 'text',
                    inputLabel: 'Enter new section name:',
                    inputValue: currentName,
                    inputPlaceholder: 'Section name',
                    showCancelButton: true,
                    confirmButtonText: 'Rename',
                    cancelButtonText: 'Cancel'
                });

                if (newName && newName.trim() !== '') {
                    const sectionId = contextMenu.dataset.currentSectionId;
                    const tabIndex = parseInt(contextMenu.dataset.currentTabIndex);
                    const authToken = getAuthToken();

                    try {
                        const response = await fetch(`${API_BASE}/api/sections/${sectionId}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': authToken
                            },
                            body: JSON.stringify({ name: newName })
                        });

                        const data = await response.json();
                        if (data.success) {
                            // Update the tab name in the UI
                            const tab = document.querySelector(`[data-tab-id="${sectionId}"]`);
                            if (tab) {
                                const titleSpan = tab.querySelector('.tab-title');
                                if (titleSpan) {
                                    titleSpan.textContent = newName;
                                } else {
                                    tab.textContent = newName;
                                }

                                // Store which tab to focus after refresh
                                sessionStorage.setItem('focusTabAfterRefresh', tabIndex);

                                // Refresh tabs and dropdowns to reflect the new name
                                initializeTabs().then(() => {
                                    // Restore focus to the correct tab
                                    const storedIndex = sessionStorage.getItem('focusTabAfterRefresh');
                                    if (storedIndex !== null) {
                                        const tabs = document.querySelectorAll('.tab');
                                        const targetTab = tabs[parseInt(storedIndex)];
                                        if (targetTab) {
                                            targetTab.focus();
                                        }
                                        sessionStorage.removeItem('focusTabAfterRefresh');
                                    }
                                });
                            }
                        } else {
                            Swal.fire('Error', 'Failed to rename section: ' + (data.error || 'Unknown error'));
                        }
                    } catch (error) {
                        console.error('Error renaming section:', error);
                        Swal.fire('Error', 'Failed to rename section');
                    }
                }
            } else if (action === 'delete') {
                const sectionName = contextMenu.dataset.currentTabText;
                const result = await Swal.fire({
                    title: `Delete Section?`,
                    text: `This will permanently delete '${sectionName}' and all its bookmarks.`,
                    showCancelButton: true,
                    confirmButtonText: 'Delete',
                    cancelButtonText: 'Cancel',
                    confirmButtonColor: '#ef4444'
                });

                if (result.isConfirmed) {
                    const sectionId = contextMenu.dataset.currentSectionId;
                    const authToken = getAuthToken();

                    fetch(`${API_BASE}/api/sections/${sectionId}`, {
                        method: 'DELETE',
                        headers: {
                            'Authorization': authToken
                        }
                    })
                        .then(res => res.json())
                        .then(data => {
                            initializeTabs().then(() => {
                                fetch(`${API_BASE}/api/sections`, {
                                    headers: {
                                        'Authorization': authToken
                                    }
                                })
                                    .then(response => response.json())
                                    .then(data => {
                                        const activeTab = document.querySelector('.tab.active');
                                        const allTabs = document.querySelectorAll('.tab');
                                        const activeTabIndex = Array.from(allTabs).indexOf(activeTab);
                                        const tabs = document.querySelectorAll('.tab');
                                        const sectionId = tabs[activeTabIndex]?.dataset.tabId;
                                        loadSectionContent(sectionId, false);
                                    });
                            });
                        })
                        .catch(err => {
                            console.error('❌ Error deleting section:', err);
                        });
                }
            }

            contextMenu.style.display = 'none';

            // Focus next element after menu action completes
            const tabs = document.querySelectorAll('.tab');
            const tabIndex = parseInt(contextMenu.dataset.currentTabIndex);
            const openingTab = tabs[tabIndex];

            const focusable = Array.from(
                document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
            ).filter(el => !el.disabled && el.offsetParent !== null);

            const currentIdx = focusable.indexOf(openingTab);
            const next = focusable[currentIdx + 1] || focusable[0];
            next.focus();
        });
    });

    // Hide on outside click
    document.addEventListener('click', function (e) {
        if (!contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });
    // Hide context menu when right-clicking elsewhere
    document.addEventListener('contextmenu', function (e) {
        if (!e.target.closest('.tab-container')) {
            contextMenu.style.display = 'none';
        }
    });
    setupContextMenuKeyboardNav();
}

function setupContextMenuKeyboardNav() {
    const contextMenu = document.getElementById('contextMenu');
    if (!contextMenu) return;

    contextMenu.addEventListener('keydown', function (e) {
        const items = Array.from(this.querySelectorAll('.context-menu-item'));
        let currentIndex = items.findIndex(item => item.classList.contains('highlighted'));
    
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                currentIndex = (currentIndex + 1) % items.length;
                updateContextMenuHighlight(items, currentIndex);
                break;
            case 'ArrowUp':
                e.preventDefault();
                currentIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
                updateContextMenuHighlight(items, currentIndex);
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (currentIndex >= 0) items[currentIndex].click();
                break;
            case 'Tab':
                e.preventDefault();
                this.style.display = 'none';

                // Find the tab that opened this menu
                const openingTab = document.querySelector('.tab.active');

                const focusable = Array.from(
                    document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
                ).filter(el => !el.disabled && el.offsetParent !== null);

                const currentIdx = focusable.indexOf(openingTab);
                const next = focusable[currentIdx + 1] || focusable[0];
                next.focus();
                break;
            case 'Escape':
                e.preventDefault();
                this.style.display = 'none';
                // Return focus to tab that opened it
                break;
        }
    });
}

function updateContextMenuHighlight(items, index) {
    items.forEach(item => item.classList.remove('highlighted'));
    if (index >= 0 && index < items.length) {
        items[index].classList.add('highlighted');
    }
}

// Add scroll listener for bookmarks page only
function setupBookmarksScrollListener() {
    function handleScroll() {
        const urlParams = new URLSearchParams(window.location.search);
        const isSharedPage = window.location.pathname.includes('/share/');
        
        // Handle regular bookmarks page
        if (urlParams.get('page') === 'bookmarks') {
            const activeTab = document.querySelector('.tab.active');
            if (!activeTab) return;
            const allTabs = document.querySelectorAll('.tab');
            const activeTabIndex = Array.from(allTabs).indexOf(activeTab);
            const tabs = document.querySelectorAll('.tab');
            const sectionId = tabs[activeTabIndex]?.dataset.tabId;

            if (!hasMoreBookmarks[sectionId] || isLoading) return;

            const distanceFromBottom = document.body.offsetHeight - (window.scrollY + window.innerHeight);
            if (distanceFromBottom <= 100) {
                loadSectionContent(sectionId, true);
            }
        }
        
        // Handle shared pages
        if (isSharedPage) {
            if (!hasMoreSharedContent || isLoading) return;
            
            const distanceFromBottom = document.body.offsetHeight - (window.scrollY + window.innerHeight);
            if (distanceFromBottom <= 100) {
                loadSharedContent(currentShareCode, true);
            }
        }
    }
    window.addEventListener('scroll', handleScroll);
}
// Initialize scroll listener when bookmarks page loads
document.addEventListener('DOMContentLoaded', function () {
    const isSharedPage = window.location.pathname.includes('/share/');
    if (isSharedPage) {
        document.body.classList.add('is-shared-page');
    }
    const urlParams = new URLSearchParams(window.location.search);
    const page = urlParams.get('page');
    

    if (page === 'bookmarks') {
        initBookmarks();
    } else if (window.location.pathname.includes('/share/')) {
        const shareCode = window.location.pathname.split('/share/')[1];
        loadSharedContent(shareCode);
        setupBookmarksScrollListener();
    }
    updateLoginButton()
});

function insertSharedTabUI(sectionData) {
    let tabContainer = document.querySelector('.tab-container');
    const contentContainer = document.querySelector('.results-container');

    if (!tabContainer) {
        const tabsSectionHTML = `
            <div class="tabs-section">
                <div class="tab-container"></div>
            </div>
        `;
        contentContainer.insertAdjacentHTML('beforebegin', tabsSectionHTML);

        // Add scroll indicator for shared pages
        contentContainer.insertAdjacentHTML('afterend', `
            <div class="scroll-container-minimal">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>
        `);

        tabContainer = document.querySelector('.tab-container');
    } else {
        tabContainer.innerHTML = '';
    }

    // Create a single tab for the shared section
    const tabElement = document.createElement('div');
    tabElement.classList.add('tab', 'active');

    const emojiSpan = document.createElement('span');
    emojiSpan.classList.add('tab-emoji');
    emojiSpan.textContent = sectionData.emoji || '📌';

    const titleSpan = document.createElement('span');
    titleSpan.classList.add('tab-title');
    titleSpan.textContent = sectionData.name;

    tabElement.appendChild(emojiSpan);
    tabElement.appendChild(titleSpan);
    tabContainer.appendChild(tabElement);
}

function positionScrollIndicator() {
    const indicator = document.querySelector('.scroll-container-minimal');
    if (!indicator) return;

    const resultCards = document.querySelectorAll('.result-card');
    if (resultCards.length === 0) {
        indicator.style.display = 'none';
        indicator.style.opacity = '0';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const isSharedPage = window.location.pathname.includes('/share/');

    // Show indicator for regular bookmarks pages
    if (urlParams.get('page') === 'bookmarks') {
        const activeTab = document.querySelector('.tab.active');
        if (!activeTab) {
            indicator.style.display = 'none';
            indicator.style.opacity = '0';
            return;
        }
        const sectionId = activeTab.dataset.tabId;

        if (hasMoreBookmarks[sectionId]) {
            setTimeout(() => {
                indicator.style.display = 'flex';
                indicator.style.opacity = '1';
                indicator.style.position = 'absolute';
            }, 1000);
        } else {
            indicator.style.display = 'none';
            indicator.style.opacity = '0';
        }
    }
    // Show indicator for shared pages
    else if (isSharedPage && hasMoreSharedContent) {
        setTimeout(() => {
            indicator.style.display = 'flex';
            indicator.style.opacity = '1';
            indicator.style.position = 'absolute';
        }, 1000);
    } else {
        indicator.style.display = 'none';
        indicator.style.opacity = '0';
    }
}

function preloadBookmarks(callback) {
    const authToken = getAuthToken();

    if (!authToken) {
        sessionStorage.removeItem('bookmarks');
        document.querySelectorAll('.bookmark-icon').forEach(icon => {
            icon.classList.remove('saved');
        });
        if (callback) callback();
        return;
    }

    fetch(`${API_BASE}/api/bookmarks?limit=1000`, {
        headers: {
            'Authorization': authToken
        }
    })
        .then(res => res.json())
        .then(data => {
            const bookmarks = {};
            data.bookmarks.forEach(post => {
                bookmarks[post.reddit_post_id] = true;
            });

            sessionStorage.setItem('bookmarks', JSON.stringify(bookmarks));

            // Apply bookmarks to any currently rendered icons
            document.querySelectorAll('.bookmark-icon').forEach(icon => {
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

function makeBookmarksDraggable(sectionId) {
    const bookmarkCards = document.querySelectorAll('.result-card');

    bookmarkCards.forEach((card, index) => {
        card.draggable = true;
        card.dataset.originalIndex = index;
        card.dataset.sectionId = sectionId;
        card.style.cursor = 'grab';

        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('drop', handleDrop);
        card.addEventListener('dragend', handleDragEnd);
    });
}

let draggedElement = null;
let draggedIndex = null;

function handleDragStart(e) {
    draggedElement = this;
    draggedIndex = parseInt(this.dataset.originalIndex);
    this.style.opacity = '0.5';
    this.style.cursor = 'grabbing !important';
    this.classList.add('dragging');
    document.body.classList.add('dragging-active');

    // Visual feedback
    this.style.transform = 'rotate(2deg)';
    this.style.zIndex = '1000';
}

function handleDrop(e) {
    e.preventDefault();

    if (!draggedElement) return;

    const sectionId = parseInt(draggedElement.dataset.sectionId);

    // Get the current DOM order - this is what the user sees
    const allCards = Array.from(document.querySelectorAll('.result-card'));
    const orderedIds = allCards.map(card => card.dataset.bookmarkId);

    // Update the sectionBookmarks array to match DOM order
    sectionBookmarks[sectionId] = orderedIds.map(id =>
        sectionBookmarks[sectionId].find(bookmark => bookmark.reddit_post_id === id)
    );

    // Save to backend
    updateBookmarkOrder(sectionId);
}

function getDragAfterElement(y) {
    const draggableElements = [...document.querySelectorAll('.result-card:not(.dragging)')];

    for (let i = 0; i < draggableElements.length; i++) {
        const element = draggableElements[i];
        const box = element.getBoundingClientRect();

        // If mouse Y is above the center of this element, insert before it
        if (y < box.top + box.height / 2) {
            return element;
        }
    }

    // If we're past all elements, return null (append to end)
    return null;
}

// Function to update bookmark order in backend
function updateBookmarkOrder(sectionId) {
    const authToken = getAuthToken();
    const orderedIds = sectionBookmarks[sectionId].map(bookmark => bookmark.reddit_post_id);

    fetch(`${API_BASE}/api/bookmarks/reorder`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authToken
        },
        body: JSON.stringify({
            orderedIds,
            sectionId: sectionId
        })
    })
        .then(response => response.json())
        .catch(error => {
            console.error(`❌ Error updating bookmark order for section ${sectionId}:`, error);
        });
}

async function addSectionDropdowns(excludeSectionId = null) {
    const authToken = getAuthToken();
    const isSharedPage = window.location.pathname.includes('/share/');
    let userSections = [];

    // Only fetch sections if authenticated
    if (authToken) {
        try {
            const response = await fetch(`${API_BASE}/api/sections`, {
                headers: {
                    'Authorization': authToken
                }
            });
            const data = await response.json();
            userSections = data.sections || [];
        } catch (error) {
            console.error('Error fetching sections:', error);
            userSections = [];
        }
    }

    // Get the currently active tab's section ID
    let currentSectionId = excludeSectionId;
    if (!currentSectionId) {
        const activeTab = document.querySelector('.tab.active');
        currentSectionId = activeTab ? activeTab.dataset.tabId : null;
    }

    const bookmarkCards = document.querySelectorAll('.result-card');
    bookmarkCards.forEach(card => {
        // Check if dropdown already exists
        if (card.querySelector('.bookmark-section-dropdown')) return;

        const dropdown = document.createElement('div');
        dropdown.className = 'bookmark-section-dropdown';

        // Build section options dynamically with emojis, excluding the current section
        const sectionOptions = userSections
            .filter(section => section.id != currentSectionId)
            .map(section =>
                `<div class="section-option" data-section-id="${section.id}">
                    <span class="section-emoji">${section.emoji || '📌'}</span>
                    <span class="section-name"> ${section.name.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>
                </div>`
            ).join('');

        let dropdownContent;
        if (!authToken && isSharedPage) {
            dropdownContent = `
        <button class="section-selector">
            Bookmarks <svg width="20" height="20" viewBox="0 0 25 25" fill="none" stroke="currentColor" stroke-width="1.5">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        </button>
        <div class="section-dropdown" tabindex="0" onkeydown="handleSectionDropdownKeydown(event)">
            <div class="section-option" data-section-id="login">
                <span class="section-emoji">🔐</span>
                <span class="section-name">Log in to save</span>
            </div>
        </div>
    `;
        } else {
            dropdownContent = `
            <button class="section-selector" tabindex="0">
                Bookmarks <svg width="20" height="20" viewBox="0 0 25 25" fill="none" stroke="currentColor" stroke-width="1.5">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>
            <div class="section-dropdown" tabindex="0" onkeydown="handleSectionDropdownKeydown(event)">
                ${sectionOptions}
                ${userSections.length < 13 && !excludeSectionId ? `
                <div class="section-option create-new" data-section-id="create">
                    <span class="section-emoji">+</span>
                    <span class="section-name">Create New Section</span>
                </div>
                ` : ''}
            </div>
            `;
        } 
        dropdown.innerHTML = dropdownContent;

        card.style.position = 'relative';
        card.appendChild(dropdown);
    });
}

function handleSectionDropdownKeydown(event) {
    const options = event.target.querySelectorAll('.section-option');
    let currentIndex = Array.from(options).findIndex(opt => opt.classList.contains('highlighted'));

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            currentIndex = (currentIndex + 1) % options.length;
            updateSectionHighlight(options, currentIndex);
            break;
        case 'ArrowUp':
            event.preventDefault();
            currentIndex = currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
            updateSectionHighlight(options, currentIndex);
            break;
        case 'Enter':
            event.preventDefault();
            if (currentIndex >= 0) {
                options[currentIndex].click();
            }
            break;
        case ' ':
        case 'Tab':
            event.preventDefault();
            closeSectionDropdown(event.target);

            // Find next focusable element
            const focusable = Array.from(
                document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
            ).filter(el => !el.disabled && el.offsetParent !== null);

            const selectorButton = event.target.closest('.bookmark-section-dropdown')?.querySelector('.section-selector');
            const currentIdx = focusable.indexOf(selectorButton);
            const next = focusable[currentIdx + 1] || focusable[0];
            next.focus();
            break;
        case 'Escape':
            event.preventDefault();
            // Close the dropdown
            document.querySelector('.section-dropdown').style.display = 'none';
            break;
    }
}

function closeSectionDropdown(dropdown) {
    dropdown.style.display = 'none';
    const card = dropdown.closest('.result-card');
    if (card) card.style.zIndex = '';
}

function updateSectionHighlight(options, index) {
    options.forEach(opt => opt.classList.remove('highlighted'));
    if (index >= 0) options[index].classList.add('highlighted');
}

document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('section-selector')) {
        e.preventDefault();
        e.target.click(); 
    }
});

function setupDropdownEvents() {

    // Only attach events to buttons that don't already have them
    const selectors = document.querySelectorAll('.section-selector');
    selectors.forEach(button => {
        // Skip if already has event listener
        if (button.hasAttribute('data-events-setup')) return;
        button.setAttribute('data-events-setup', 'true');
        button.addEventListener('click', function (e) {
            e.stopPropagation();

            // Close emoji picker when opening dropdown
            const picker = document.getElementById('emojiPicker');
            if (picker) {
                picker.style.display = 'none';
                currentEmojiTarget = null;
            }

            // Close import menu when opening dropdown
            const importMenu = document.getElementById('importMenu');
            if (importMenu) {
                importMenu.style.display = 'none';
            }

            const dropdown = this.nextElementSibling;
            if (!dropdown) return;
            const parentCard = this.closest('.result-card');
            const isCurrentlyOpen = dropdown.style.display === 'block';

            const wasKeyboard = e.detail === 0;

            // Close all other dropdowns first
            document.querySelectorAll('.section-dropdown').forEach(d => {
                if (d !== dropdown) {
                    d.style.display = 'none';
                    const card = d.closest('.result-card');
                    if (card) card.style.zIndex = '';
                }
            });

            // Toggle this dropdown
            if (!isCurrentlyOpen) {
                dropdown.style.display = 'block';
                parentCard.style.zIndex = '1000';

                if (wasKeyboard) {
                    setTimeout(() => {
                        dropdown.focus();
                        const options = dropdown.querySelectorAll('.section-option');
                        if (options.length > 0) {
                            updateSectionHighlight(options, 0);
                        }
                    }, 50);
                }
            } else {
                dropdown.style.display = 'none';
                parentCard.style.zIndex = '';
            }

            // Close context menu AFTER dropdown logic
            const contextMenu = document.getElementById('contextMenu');
            if (contextMenu) {
                contextMenu.style.display = 'none';
            }

            const hermesContextMenu = document.getElementById('hermesContextMenu');
            if (hermesContextMenu) {
                hermesContextMenu.style.display = 'none';
            }
        });
    });

    // Handle dropdown item clicks
    const dropdownItems = document.querySelectorAll('.section-option');

    dropdownItems.forEach(item => {
        if (item.hasAttribute('data-events-setup')) return;
        item.setAttribute('data-events-setup', 'true');

        item.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const authToken = getAuthToken();
            if (!authToken) {
                const currentSharedUrl = window.location.href;
                window.location.href = `/html/login.html?redirect=${encodeURIComponent(currentSharedUrl)}`;
                return;
            }

            const sectionId = this.getAttribute('data-section-id');

            if (sectionId === 'create') {
                createNewSection();
                // Hide the dropdown
                const dropdown = this.closest('.section-dropdown');
                dropdown.style.display = 'none';
                return;
            }

            const card = this.closest('.result-card');
            const bookmarkId = card.dataset.bookmarkId;

            // Get current tab to see if we're moving TO a different section
            const activeTab = document.querySelector('.tab.active');
            const currentSectionId = activeTab.dataset.tabId;
            const isMovingToADifferentSection = currentSectionId !== sectionId;

            const isSharedPage = window.location.pathname.includes('/share/');
            const endpoint = isSharedPage ? '/api/bookmarks/copy' : `/api/bookmarks/${bookmarkId}/section`;
            const method = isSharedPage ? 'POST' : 'PUT';
            const body = isSharedPage ?
                JSON.stringify({ redditPostId: bookmarkId, sectionId: sectionId }) :
                JSON.stringify({ sectionId: sectionId });

            fetch(`${API_BASE}${endpoint}`, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authToken
                },
                body: body
            })
                .then(response => response.json())
                .then(data => {
                    //console.log('Bookmark moved:', data);
                    // Checkmark feedback
                    const button = this.closest('.bookmark-section-dropdown').querySelector('.section-selector');
                    const originalHTML = button.innerHTML;

                    button.innerHTML = `Bookmarks <svg class="checkmark" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <polyline points="20,6 9,17 4,12"></polyline>
    </svg>`;

                    // Revert back after 2 seconds
                    setTimeout(() => {
                        button.innerHTML = originalHTML;
                    }, 2000);

                    const isSharedPage = window.location.pathname.includes('/share/');
                    if (isMovingToADifferentSection) {
                        // Reorder
                        setTimeout(() => {
                            fetch(`${API_BASE}/api/bookmarks/section/${sectionId}?offset=0&limit=100`, {
                                headers: {
                                    'Authorization': authToken
                                }
                            })
                                .then(response => response.json())
                                .then(sectionData => {
                                    const allIds = sectionData.bookmarks.map(b => b.reddit_post_id);
                                    const filteredIds = allIds.filter(id => id !== bookmarkId);
                                    const orderedIds = [bookmarkId, ...filteredIds];

                                    return fetch(`${API_BASE}/api/bookmarks/reorder`, {
                                        method: 'POST',
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Authorization': authToken
                                        },
                                        body: JSON.stringify({
                                            orderedIds,
                                            sectionId: sectionId
                                        })
                                    });
                                })
                                .then(response => response.json())
                                .catch(error => {
                                    console.error('Error in reorder process:', error);
                                });
                        }, 100);
                    }

                    // Only animate out for regular bookmark moves 
                    if (isMovingToADifferentSection && !isSharedPage) {
                        // Animate out
                        card.style.transition = 'opacity 0.3s ease';
                        card.style.opacity = '0';
                        setTimeout(() => {
                            card.remove();

                            // Decrease offset since we removed an item from current section
                            if (sectionOffsets[currentSectionId] > 0) {
                                sectionOffsets[currentSectionId]--;
                            }

                            const remainingCards = document.querySelectorAll('.result-card');
                            if (remainingCards.length === 0) {
                                // Only show error if there are truly no more bookmarks to load
                                if (!hasMoreBookmarks[currentSectionId]) {
                                    showError("No bookmarks found. Start bookmarking posts to see them here.");
                                } else {
                                    // There are more to load, so trigger loading
                                    loadSectionContent(currentSectionId, true);
                                }
                            }
                        }, 200);
                    }
                })
                .catch(error => {
                    console.error('Error moving bookmark:', error);
                });

            const dropdown = this.closest('.section-dropdown');
            dropdown.style.display = 'none';
            card.style.zIndex = '';
        });
    });

    // Document click listener to close all dropdowns
    document.addEventListener('click', function () {
        document.querySelectorAll('.section-dropdown').forEach(d => {
            d.style.display = 'none';
            const card = d.closest('.result-card');
            if (card) card.style.zIndex = '';
        });
    });
}

function showLoading() {

    isLoading = true;
    resultsContainer.innerHTML = '';
    resultsContainer.innerHTML = `
    <div class='results-error' id='spinner-box' style="opacity: 0; transition: opacity 0.25s ease;"></div>
`;
    const spinnerWrapper = createCanvasSpinner();
    const spinnerBox = document.getElementById('spinner-box');
    spinnerBox.appendChild(spinnerWrapper);

    // Trigger the fade-in animation
    setTimeout(() => {
        requestAnimationFrame(() => {
            spinnerBox.style.opacity = '1';
        });
    }, 10);

    paginationContainer.innerHTML = '';
    resultsContainer.style.opacity = 1;
}

function createEmojiPicker() {
    // Remove existing picker if it exists
    const existingPicker = document.getElementById('emojiPicker');
    if (existingPicker) {
        existingPicker.remove();
    }

    const emojiPickerHTML = `
        <div class="emoji-picker" id="emojiPicker" style="display: none;">
            <div class="emoji-grid">
                <span class="emoji-option" data-emoji="📌">📌</span>
                <span class="emoji-option" data-emoji="🔥">🔥</span>
                <span class="emoji-option" data-emoji="⭐">⭐</span>
                <span class="emoji-option" data-emoji="❤️">❤️</span>
                <span class="emoji-option" data-emoji="🧸">🧸</span>
                <span class="emoji-option" data-emoji="💻">💻</span>
                <span class="emoji-option" data-emoji="🎮">🎮</span>
                <span class="emoji-option" data-emoji="🌈">🌈</span>
                <span class="emoji-option" data-emoji="🥦">🥦</span>
                <span class="emoji-option" data-emoji="🍓">🍓</span>
                <span class="emoji-option" data-emoji="🏆">🏆</span>
                <span class="emoji-option" data-emoji="🎂">🎂</span>
                <span class="emoji-option" data-emoji="🍲">🍲</span>
                <span class="emoji-option" data-emoji="📖">📖</span>
                <span class="emoji-option" data-emoji="☕">☕</span>
                <span class="emoji-option" data-emoji="🌿">🌿</span>
                <span class="emoji-option" data-emoji="⏰">⏰</span>
                <span class="emoji-option" data-emoji="🌍">🌍</span>
                <span class="emoji-option" data-emoji="🤖">🤖</span>
                <span class="emoji-option" data-emoji="🖌️">🖌️</span>
                <span class="emoji-option" data-emoji="✈️">✈️</span>
                <span class="emoji-option" data-emoji="🐱">🐱</span>
                <span class="emoji-option" data-emoji="🐶">🐶</span>
                <span class="emoji-option" data-emoji="💡">💡</span>
            </div>
        </div>
    `;

    // Inject into page
    document.body.insertAdjacentHTML('beforeend', emojiPickerHTML);

    // Add event listeners
    setupEmojiPickerEvents();
}
function setupEmojiPickerEvents() {
    const picker = document.getElementById('emojiPicker');
    document.querySelectorAll('.emoji-option').forEach(option => {
        option.addEventListener('click', async (e) => {
            const selectedEmoji = e.target.dataset.emoji;
            if (currentEmojiTarget) {
                // Update UI immediately
                currentEmojiTarget.textContent = selectedEmoji;

                // Get the section ID from the parent tab
                const tab = currentEmojiTarget.closest('.tab');
                const sectionId = tab.dataset.tabId;
                const authToken = getAuthToken();

                // Save to backend
                try {
                    const response = await fetch(`${API_BASE}/api/sections/${sectionId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': authToken
                        },
                        body: JSON.stringify({ emoji: selectedEmoji })
                    });

                    if (!response.ok) {
                        throw new Error('Failed to save emoji');
                    }
                    // Update emoji for the dropdowns
                    initializeTabs();
                } catch (error) {
                    console.error('❌ Failed to save emoji:', error);
                    // Revert UI on failure
                    currentEmojiTarget.textContent = '📌';
                }
            }
            picker.style.display = 'none';
        });
    });

    // Hide picker when clicking outside
    document.addEventListener('click', (e) => {
        if (!picker.contains(e.target) && !e.target.closest('.bookmark-section')) {
            picker.style.display = 'none';
        }
    });
}


function showEmojiPicker(targetElement) {
    currentEmojiTarget = targetElement;

    let picker = document.getElementById('emojiPicker');
    if (!picker) {
        createEmojiPicker();
        picker = document.getElementById('emojiPicker');
    }

    // Get the position of the clicked emoji
    const rect = targetElement.getBoundingClientRect();

    // Check if this is the first tab
    const tab = targetElement.closest('.tab');
    const allTabs = document.querySelectorAll('.tab');
    const isFirstTab = tab === allTabs[0];

    picker.style.position = 'absolute';

    if (isFirstTab) {
        // Position to the right for first tab
        picker.style.left = (rect.right - 180) + 'px';
    } else {
        // Position to the left for all other tabs
        picker.style.left = (rect.left - 215) + 'px';
    }
    picker.style.top = (rect.top + window.scrollY - 328) + 'px';
    picker.style.display = 'block';

    // Keep picker within viewport
    const pickerRect = picker.getBoundingClientRect();

    // If picker goes off left edge, move it to the right instead
    if (pickerRect.left < 0) {
        picker.style.left = (rect.right + 10) + 'px';
    }

    // If picker goes off bottom edge, adjust upward
    if (pickerRect.bottom > window.innerHeight) {
        picker.style.top = (window.innerHeight - pickerRect.height - 10) + 'px';
    }
}

function createShareMenu() {
    // Remove existing menu if it exists
    const existingMenu = document.getElementById('shareMenu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const shareMenuHTML = `
    <div class="share-menu" id="shareMenu" style="display: none;" tabindex="-1">
        <div class="share-header">Share</div>
        <div class="share-grid">
            <div class="share-option" data-action="copy-link" tabindex="0">
                <div class="share-icon-wrapper">
                    <i class="fas fa-link" style="font-size: 19px;"></i>
                </div>
                <span class="share-label">Copy link</span>
            </div>
            <div class="share-option" data-action="whatsapp" tabindex="0">
                <div class="share-icon-wrapper whatsapp">
                    <i class="fab fa-whatsapp"></i>
                </div>
                <span class="share-label">WhatsApp</span>
            </div>
            <div class="share-option" data-action="messenger" tabindex="0">
                <div class="share-icon-wrapper messenger">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/b/be/Facebook_Messenger_logo_2020.svg" width="20" height="20">
                </div>
                <span class="share-label">Messenger</span>
            </div>
            <div class="share-option" data-action="facebook" tabindex="0">
                <div class="share-icon-wrapper facebook">
                    <i class="fab fa-facebook-f"></i>
                </div>
                <span class="share-label">Facebook</span>
            </div>
            <div class="share-option" data-action="twitter" tabindex="0">
                <div class="share-icon-wrapper twitter">
                    <i class="fab fa-x-twitter"></i>
                </div>
                <span class="share-label">X</span>
            </div>
        </div>
    </div>
`;

    // Inject into page
    document.body.insertAdjacentHTML('beforeend', shareMenuHTML);

    // Add event listeners
    setupShareMenuEvents();
}

function setupShareMenuEvents() {
    const menu = document.getElementById('shareMenu');
    document.querySelectorAll('.share-option').forEach(option => {
        option.addEventListener('click', async (e) => {
            const action = e.currentTarget.dataset.action;
            if (action === 'copy-link' && currentShareTarget) {
                const copyOption = e.currentTarget; // Store reference before async
                try {
                    const isSharedPage = window.location.pathname.includes('/share/');

                    if (isSharedPage) {
                        // For shared pages, just copy the current URL
                        await navigator.clipboard.writeText(window.location.href);

                        // Update button text
                        const labelElement = copyOption.querySelector('.share-label');
                        if (labelElement) {
                            labelElement.textContent = 'Link copied!';
                            setTimeout(() => {
                                labelElement.textContent = 'Copy link';
                            }, 2000);
                        }
                    } else {
                        // Original logic for owned sections
                        const urlParams = new URLSearchParams(window.location.search);
                        const sectionId = urlParams.get('section');
                        const authToken = getAuthToken();

                        const response = await fetch(`${API_BASE}/api/sections/${sectionId}/share`, {
                            method: 'POST',
                            headers: {
                                'Authorization': authToken
                            }
                        });

                        if (response.ok) {
                            const data = await response.json();
                            await navigator.clipboard.writeText(data.shareUrl);

                            // Update button text
                            const labelElement = copyOption.querySelector('.share-label');
                            if (labelElement) {
                                labelElement.textContent = 'Link copied!';

                                setTimeout(() => {
                                    labelElement.textContent = 'Copy link';
                                }, 2000);
                            }

                            console.log('Copied:', data.shareUrl);
                        }
                    }
                } catch (error) {
                    console.error('Failed to copy link:', error);
                }
            } else if (action === 'facebook') {
                const isSharedPage = window.location.pathname.includes('/share/');

                if (isSharedPage) {
                    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`;
                    window.open(facebookUrl, 'facebook-share', 'width=626,height=436,toolbar=no,menubar=no,scrollbars=no,resizable=yes');
                } else {
                    const urlParams = new URLSearchParams(window.location.search);
                    const sectionId = urlParams.get('section');
                    const authToken = getAuthToken();

                    const response = await fetch(`${API_BASE}/api/sections/${sectionId}/share`, {
                        method: 'POST',
                        headers: {
                            'Authorization': authToken
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(data.shareUrl)}`;
                        window.open(facebookUrl, 'facebook-share', 'width=626,height=436,toolbar=no,menubar=no,scrollbars=no,resizable=yes');
                    }
                }
                menu.style.display = 'none';
            } else if (action === 'twitter') {
                const isSharedPage = window.location.pathname.includes('/share/');

                if (isSharedPage) {
                    const twitterText = 'Check out this curated Reddit collection on KarmaFinder!';
                    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}&url=${encodeURIComponent(window.location.href)}`;
                    window.open(twitterUrl, 'twitter-share', 'width=550,height=420,toolbar=no,menubar=no,scrollbars=no,resizable=yes');
                } else {
                    const urlParams = new URLSearchParams(window.location.search);
                    const sectionId = urlParams.get('section');
                    const authToken = getAuthToken();

                    const response = await fetch(`${API_BASE}/api/sections/${sectionId}/share`, {
                        method: 'POST',
                        headers: {
                            'Authorization': authToken
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const twitterText = 'Check out this curated Reddit collection on KarmaFinder!';
                        const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(twitterText)}&url=${encodeURIComponent(data.shareUrl)}`;
                        window.open(twitterUrl, 'twitter-share', 'width=550,height=420,toolbar=no,menubar=no,scrollbars=no,resizable=yes');
                    }
                }
                menu.style.display = 'none';
            } else if (action === 'whatsapp') {
                const isSharedPage = window.location.pathname.includes('/share/');

                if (isSharedPage) {
                    const whatsappText = `Check out this curated Reddit collection on KarmaFinder! ${window.location.href}`;
                    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
                    window.open(whatsappUrl, '_blank');
                } else {
                    const urlParams = new URLSearchParams(window.location.search);
                    const sectionId = urlParams.get('section');
                    const authToken = getAuthToken();

                    const response = await fetch(`${API_BASE}/api/sections/${sectionId}/share`, {
                        method: 'POST',
                        headers: {
                            'Authorization': authToken
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const whatsappText = `Check out this curated Reddit collection on KarmaFinder! ${data.shareUrl}`;
                        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;
                        window.open(whatsappUrl, '_blank');
                    }
                }
                menu.style.display = 'none';
            } else if (action === 'messenger') {
                const isSharedPage = window.location.pathname.includes('/share/');

                if (isSharedPage) {
                    const messengerUrl = `https://www.messenger.com/new?message=${encodeURIComponent('Check out this curated Reddit collection on KarmaFinder! ' + window.location.href)}`;
                    window.open(messengerUrl, 'messenger-share', 'width=626,height=436,toolbar=no,menubar=no,scrollbars=no,resizable=yes');
                } else {
                    const urlParams = new URLSearchParams(window.location.search);
                    const sectionId = urlParams.get('section');
                    const authToken = getAuthToken();

                    const response = await fetch(`${API_BASE}/api/sections/${sectionId}/share`, {
                        method: 'POST',
                        headers: {
                            'Authorization': authToken
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const messengerUrl = `https://www.messenger.com/new?message=${encodeURIComponent('Check out this curated Reddit collection on KarmaFinder! ' + data.shareUrl)}`;
                        window.open(messengerUrl, 'messenger-share', 'width=626,height=436,toolbar=no,menubar=no,scrollbars=no,resizable=yes');
                    }
                }
                menu.style.display = 'none';
            }
            
        });
    });
    // Hide menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !e.target.closest('.share-button')) {
            menu.style.display = 'none';
        }
    });
    setupShareMenuKeyboardNav();
}

function setupShareMenuKeyboardNav() {
    const menu = document.getElementById('shareMenu');
    const options = Array.from(menu.querySelectorAll('.share-option'));

    menu.addEventListener('keydown', (e) => {
        const currentIndex = options.indexOf(document.activeElement);
        if (currentIndex === -1) return;

        let nextIndex = currentIndex;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                nextIndex = (currentIndex + 1) % options.length;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                nextIndex = (currentIndex - 1 + options.length) % options.length;
                break;
            case 'Escape':
                e.preventDefault();
                menu.style.display = 'none';
                if (currentShareTarget) currentShareTarget.focus();
                return;
            case 'Enter':
                e.preventDefault();
                options[currentIndex].click();
                return;
            case 'Tab':
                e.preventDefault();
                menu.style.display = 'none';

                // Find the share button that opened this menu 
                const shareButton = document.querySelector('.share-button');

                const focusable = Array.from(
                    document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
                ).filter(el => !el.disabled && el.offsetParent !== null);

                const currentIndexTab = focusable.indexOf(shareButton);
                const next = focusable[currentIndexTab + 1] || focusable[0];
                next.focus();
                break;
            case ' ':
                e.preventDefault();
                options[currentIndex].click();
                return;
        }

        options[nextIndex].focus();
    });
}

function formatRelativeTime(timestamp) {
    if (!timestamp) return 'Unknown';

    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 5) return 'Just now';
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) === 1 ? '' : 's'} ago`;
    return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) === 1 ? '' : 's'} ago`;
}

async function showRedditImportDialog(username, uniqueCount) {
    // Fetch real sections first
    const authToken = getAuthToken();
    let userSections = [];

    try {
        const response = await fetch(`${API_BASE}/api/sections`, {
            headers: { 'Authorization': authToken }
        });
        const data = await response.json();
        userSections = data.sections || [];
    } catch (error) {
        console.error('Error fetching sections:', error);
        userSections = [];
    }

    const isLoading = !username && !uniqueCount;

    const dropdownHtml = `
      <div class="reddit-import-container">
          <div class="reddit-import-info">
              <p><strong>Reddit User:</strong> <span id="user-info">${isLoading ? '' : username}</span></p>
              <p><strong>Posts:</strong> <span id="count-info">${isLoading ? '' : `${uniqueCount} unique ${uniqueCount === 1 ? 'post' : 'posts'} to import`}</span></p>
          </div>
          <label class="reddit-import-label">Import to section:</label>
          <select id="sectionSelect">
              <option value="">Select section...</option>
              ${userSections.map(section =>
    `<option value="${section.id}">${section.emoji || '📌'} ${section.name.replace(/</g, '&lt;').replace(/>/g,
                      '&gt;')}</option>`
    ).join('')}
          </select>
      </div>
   `;
   
    const result = await Swal.fire({
        title: 'Import Reddit Saves',
        html: dropdownHtml,
        showCancelButton: true,
        confirmButtonText: 'Import',
        cancelButtonText: 'Cancel',
        focusConfirm: false,
        didOpen: () => {
            if (isLoading) {
                // Add spinners to the empty spans
                const userSpinner = createCanvasSpinner(null, 18);
                const countSpinner = createCanvasSpinner(null, 18);

                document.getElementById('user-info').appendChild(userSpinner);
                document.getElementById('count-info').appendChild(countSpinner);

                // Fetch the data and replace spinners
                fetch('/api/reddit/saved-count', {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                })
                    .then(response => {
                        if (response.status === 404) {
                            Swal.close();
                            initiateRedditLogin();
                            return;
                        }
                        if (response.status === 500) {
                            Swal.close();
                            initiateRedditLogin();
                            return;
                        }
                        if (response.ok) {
                            return response.json();
                        }
                    })
                    .then(data => {
                        if (data) {
                            document.getElementById('user-info').innerHTML = '<span class="checkmark2">✓</span> ' + data.username;
                            document.getElementById('count-info').innerHTML = `<span class="checkmark2">✓</span> ${data.uniqueCount} unique ${data.uniqueCount === 1 ? 'post' : 'posts'} to import`;                   
                        }
                    })
                    .catch(error => {
                        console.error('Error fetching Reddit data:', error);
                        Swal.close();
                    });
            }

            window.selectedImportSectionId = null;
            const select = document.getElementById('sectionSelect');
            select.addEventListener('change', function () {
                window.selectedImportSectionId = this.value;
            });
        },
        preConfirm: () => {
            const selectedSectionId = window.selectedImportSectionId;
            if (!selectedSectionId) {
                Swal.showValidationMessage('Please select a section');
                return false;
            }
            return selectedSectionId;
        }
    });

    if (result.isConfirmed) {
        const selectedSectionId = result.value;
        importRedditBookmarks(selectedSectionId);
    }
}

async function importRedditBookmarks(sectionId) {
    const authToken = getAuthToken();

    try {
        // Show loading state
        Swal.fire({
            title: 'Importing...',
            text: 'Importing your Reddit bookmarks',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const response = await fetch('/api/reddit/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authToken
            },
            body: JSON.stringify({ sectionId: parseInt(sectionId) })
        });

        const data = await response.json();

        if (response.ok) {
            // Build the message
            const count = data.imported;
            const plural = count === 1 ? 'bookmark' : 'bookmarks';
            let message = `Successfully imported ${count} ${plural}.`;
            
            // Add "Nice." for special numbers
            if (count === 67 || count === 69) {
                message += ' Nice.';
            }

            // Success
            await Swal.fire({
                title: 'Import Complete!',
                text: message,
                icon: 'success',
                confirmButtonText: 'OK',
                didClose: () => {
                    if (currentMenuOpener) {
                        // Find next focusable element
                        const focusable = Array.from(
                            document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
                        ).filter(el => !el.disabled && el.offsetParent !== null);

                        const currentIdx = focusable.indexOf(currentMenuOpener);
                        const next = focusable[currentIdx + 1] || focusable[0];
                        next.focus();
                        currentMenuOpener = null;
                    }
                }
            });

            initializeTabs();
            preloadBookmarks();
        } else {
            // Error from server
            await Swal.fire({
                title: 'Import Failed',
                text: data.error || 'Server error. Failed to import bookmarks. Please try again later.',
                icon: 'error',
                confirmButtonText: 'OK'
            });
        }
    } catch (error) {
        console.error('Import error:', error);
        await Swal.fire({
            title: 'Import Failed',
            text: 'Network error occurred during import',
            icon: 'error',
            confirmButtonText: 'OK'
        });
    }
}

function showImportMenu(targetElement, event) {
    currentMenuOpener = targetElement;
    let menu = document.getElementById('importMenu');
    if (!menu) {
        createImportMenu();
        menu = document.getElementById('importMenu');
    }

    // Check if menu is currently visible
    if (menu.style.display === 'block') {
        menu.style.display = 'none';
        return;
    }

    const rect = targetElement.getBoundingClientRect();
    menu.style.position = 'absolute';
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + window.scrollY + 5) + 'px';
    menu.style.display = 'block';

    // Check if this was triggered by keyboard
    const wasKeyboard = event && event.detail === 0;

    // Only auto-focus if opened via keyboard
    if (wasKeyboard) {
        setTimeout(() => {
            menu.focus();
            const options = menu.querySelectorAll('.import-menu-item');
            if (options.length > 0) {
                updateImportHighlight(options, 0);
            }
        }, 50);
    }
}

function createImportMenu() {
    const existingMenu = document.getElementById('importMenu');
    if (existingMenu) {
        existingMenu.remove();
    }

    const isSharedPage = window.location.pathname.includes('/share/');
    const importMenuHTML = `
    <div class="import-menu" id="importMenu" style="display: none;" tabindex="0" onkeydown="handleImportMenuKeydown(event)">
        ${!isSharedPage ? `
        <div class="import-menu-item" data-action="reddit-import">
            <span>Import from Reddit</span>
        </div>
        <div class="import-menu-item" data-action="switch-reddit">
            <span>Log in with Reddit</span>
        </div>
        ` : ''}
        <div class="import-menu-item" data-action="section-info">
            <span>Section Info</span>
        </div>
    </div>
`;
    document.body.insertAdjacentHTML('beforeend', importMenuHTML);
    setupImportMenuEvents();
}

function handleImportMenuKeydown(event) {
    const options = event.target.querySelectorAll('.import-menu-item');
    let currentIndex = Array.from(options).findIndex(opt => opt.classList.contains('highlighted'));

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            currentIndex = (currentIndex + 1) % options.length;
            updateImportHighlight(options, currentIndex);
            break;
        case 'ArrowUp':
            event.preventDefault();
            currentIndex = currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
            updateImportHighlight(options, currentIndex);
            break;
        case 'Enter':
            event.preventDefault();
            if (currentIndex >= 0) {
                options[currentIndex].click();
            }
            break;
        case 'Escape':
            event.preventDefault();
            document.getElementById('importMenu').style.display = 'none';
            break;
        case 'Tab':
            event.preventDefault();
            const menu = document.getElementById('importMenu');
            menu.style.display = 'none';

            // Find the button that opened this menu 
            const importButton = document.querySelector('.import-button');

            const focusable = Array.from(
                document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
            ).filter(el => !el.disabled && el.offsetParent !== null);

            const currentIndexTab = focusable.indexOf(importButton);
            const next = focusable[currentIndexTab + 1] || focusable[0];
            next.focus();
            break;
    }
}

function updateImportHighlight(options, index) {
    options.forEach(opt => opt.classList.remove('highlighted'));
    if (index >= 0) options[index].classList.add('highlighted');
}

function setupImportMenuEvents() {
    document.querySelectorAll('.import-menu-item').forEach(item => {
        item.addEventListener('click', async function () {
            const action = this.dataset.action;
            if (action === 'reddit-import') {
                showRedditImportDialog();
            } else if (action === 'switch-reddit') {
                const authToken = getAuthToken();

                try {
                    const response = await fetch('/api/reddit/disconnect', {
                        method: 'DELETE',
                        headers: { 'Authorization': authToken }
                    });

                    const data = await response.json();
                    if (data.success) {
                        initiateRedditLogin();
                    }
                } catch (error) {
                    Swal.fire({
                        title: 'Connection Error',
                        text: 'Failed to disconnect Reddit account.',
                        icon: 'error',
                        confirmButtonText: 'OK'
                    });
                }
            } else if (action === 'section-info') {
                showSectionInfo();
            }
            
            document.getElementById('importMenu').style.display = 'none';
        });
    });

    // Close menu on outside clicks
    document.addEventListener('click', function (e) {
        const menu = document.getElementById('importMenu');
        if (menu && !menu.contains(e.target) && !e.target.closest('.import-button')) {
            menu.style.display = 'none';
        }
    });
}

async function showSectionInfo() {
    const isSharedPage = window.location.pathname.includes('/share/');
    let bookmarkCount = 0;
    let topSubreddit = 'None';
    let createdDate = 'Unknown';
    let description = 'No description';
    let sectionName = 'Unknown';

    if (isSharedPage) {
        // For shared pages, get info from the share code
        const shareCode = window.location.pathname.split('/share/')[1];

        try {
            const response = await fetch(`${API_BASE}/api/share/${shareCode}`);
            const data = await response.json();
            sectionName = (data.section.emoji ? `${data.section.emoji} ` : '') + (data.section.name || 'Unknown');
            bookmarkCount = data.bookmarks.length;
            topSubreddit = data.top_subreddit ? `r/${data.top_subreddit}` : 'None';
            createdDate = data.created_at ? new Date(data.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) : 'Unknown';
            description = data.section.description || 'No description';
            lastModified = data.last_modified ? formatRelativeTime(data.last_modified) : 'Unknown';
        } catch (error) {
            bookmarkCount = 0;
        }
    } else {
        // Original logic for owned sections
        const activeTab = document.querySelector('.tab.active');
        const sectionId = activeTab?.dataset.tabId;

        try {
            const authToken = getAuthToken();
            const response = await fetch(`${API_BASE}/api/bookmarks/section/${sectionId}?offset=0&limit=1`, {
                headers: { 'Authorization': authToken }
            });
            const data = await response.json();
            sectionName = (data.emoji ? `${data.emoji} ` : '') + (data.section_name || data.name || 'Unknown');
            bookmarkCount = data.total_count || 0;
            topSubreddit = data.top_subreddit ? `r/${data.top_subreddit}` : 'None';
            createdDate = data.created_at ? new Date(data.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }) : 'Unknown';
            description = data.description || 'No description';
            lastModified = data.last_modified ? formatRelativeTime(data.last_modified) : 'Unknown';
        } catch (error) {
            bookmarkCount = 0;
        }
    }

    const sectionInfoHtml = `
    <div class="reddit-import-container">
        <div class="reddit-import-info">
            <p><strong>Section Name:</strong> <span>${sectionName.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></p>
            <p><strong>Creation Date:</strong> <span>${createdDate}</span></p>
            <p><strong>Bookmarks:</strong> <span>${bookmarkCount}</span></p>
            <p><strong>Top Subreddit:</strong> <span>${topSubreddit}</span></p>
            <p><strong>Last Modified:</strong> <span>${lastModified}</span></p>
            <p><strong>Description:</strong> ${isSharedPage ?
            `<span>${description.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>` :
            `<textarea id="sectionDescription" maxlength="500">${description === 'No description' ? '' : description.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
        <div class="description-counter" id="descriptionCounter">0/500</div>`
        }</p>
    ${!isSharedPage ? `<button id="saveDescription">Save Description</button>` : ''}
    </div>
</div>
`;

    await Swal.fire({
        title: 'Section Information',
        html: sectionInfoHtml,
        confirmButtonText: 'Close',
        didOpen: () => {
            if (!isSharedPage) {
                const saveBtn = document.getElementById('saveDescription');
                const textarea = document.getElementById('sectionDescription');
                const counter = document.getElementById('descriptionCounter');

                if (saveBtn && textarea && counter) {
                    // Update counter on page load
                    const currentLength = textarea.value.length;
                    counter.textContent = `${currentLength}/500`;
                    if (currentLength > 450) {
                        counter.classList.add('warning');
                    }

                    // Update counter on input
                    textarea.addEventListener('input', function () {
                        const length = this.value.length;
                        counter.textContent = `${length}/500`;

                        if (length > 450) {
                            counter.classList.add('warning');
                        } else {
                            counter.classList.remove('warning');
                        }
                    });
                    saveBtn.addEventListener('click', async () => {
                        const newDescription = textarea.value.trim();
                        const activeTab = document.querySelector('.tab.active');
                        const sectionId = activeTab?.dataset.tabId;

                        //console.log('Saving description:', newDescription, 'for section:', sectionId);

                        try {
                            const authToken = getAuthToken();
                            const response = await fetch(`${API_BASE}/api/sections/${sectionId}/description`, {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': authToken
                                },
                                body: JSON.stringify({ description: newDescription })
                            });

                            if (response.ok) {
                                saveBtn.textContent = 'Saved!';
                                setTimeout(() => {
                                    saveBtn.textContent = 'Save Description';
                                }, 2000);
                            }
                        } catch (error) {
                            console.error('Failed to save description:', error);
                        }
                    });
                }
            }
        },
        didClose: () => {
            if (currentMenuOpener) {
                currentMenuOpener.focus();
                currentMenuOpener = null;
            }
        }
    });
}

function initiateRedditLogin() {
    const authToken = getAuthToken();
    if (!authToken) {
        console.error('No auth token found');
        return;
    }

    window.location.href = `/auth/reddit/start?auth_token=${encodeURIComponent(authToken)}`;
}

function showShareMenu(targetElement) {
    currentShareTarget = targetElement;

    let menu = document.getElementById('shareMenu');
    if (!menu) {
        createShareMenu();
        menu = document.getElementById('shareMenu');
    }
    if (menu.style.display === 'block') {
        menu.style.display = 'none';
        return;
    }
    // Get the position of the clicked share button
    const rect = targetElement.getBoundingClientRect();

    // Check if this is the first tab (same logic as emoji picker)
    const tab = targetElement.closest('.tab');
    const allTabs = document.querySelectorAll('.tab');

    menu.style.position = 'absolute';
    menu.style.left = rect.right;

    menu.style.top = (rect.top + window.scrollY - 240) + 'px';
    menu.style.display = 'block';

    // Focus first option for keyboard navigation
    setTimeout(() => {
        const firstOption = menu.querySelector('.share-option');
        if (firstOption) firstOption.focus();
    }, 50);

    // Keep menu within viewport
    const menuRect = menu.getBoundingClientRect();

    // If menu goes off left edge, move it to the right instead
    if (menuRect.left < 0) {
        menu.style.left = (rect.right + 10) + 'px';
    }

    // If menu goes off bottom edge, adjust upward
    if (menuRect.bottom > window.innerHeight) {
        menu.style.top = (window.innerHeight - menuRect.height - 10) + 'px';
    }
}

let autoScrollInterval = null;

function handleDragOver(e) {
    e.preventDefault();

    // Auto-scroll logic
    const scrollThreshold = 90; // pixels from edge
    const scrollSpeed = 10;
    
    if (e.clientY < scrollThreshold) {
        // Scroll up
        if (!autoScrollInterval) {
            autoScrollInterval = setInterval(() => {
                window.scrollBy(0, -scrollSpeed);
            }, 16);
        }
    } else if (e.clientY > window.innerHeight - scrollThreshold) {
        // Scroll down
        if (!autoScrollInterval) {
            autoScrollInterval = setInterval(() => {
                window.scrollBy(0, scrollSpeed);
            }, 16);
        }
    } else {
        // Stop scrolling
        if (autoScrollInterval) {
            clearInterval(autoScrollInterval);
            autoScrollInterval = null;
        }
    }

    const afterElement = getDragAfterElement(e.clientY);
    const dragging = document.querySelector('.dragging');
    const resultsContainer = document.querySelector('.results-container');

    if (afterElement == null) {
        resultsContainer.appendChild(dragging);
    } else {
        resultsContainer.insertBefore(dragging, afterElement);
    }
}

function handleDragEnd(e) {
    // Clear auto-scroll
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
    }
    
    // Your existing dragend code
    this.style.opacity = '';
    this.style.cursor = 'grab';
    this.style.transform = '';
    this.style.boxShadow = '';
    this.style.zIndex = '';
    this.classList.remove('dragging');

    document.querySelectorAll('.result-card').forEach((card, index) => {
        card.dataset.originalIndex = index;
    });

    draggedElement = null;
    draggedIndex = null;
}

function cleanupEventListeners() {
    // Disconnect media observer
    if (mediaObserver) {
        mediaObserver.disconnect();
        mediaObserver = null;
    }
    // Clear any auto-scroll intervals
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
    }

    // Reset drag state
    draggedElement = null;
    draggedIndex = null;
    currentEmojiTarget = null;

    // Hide any open UI elements
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
        contextMenu.style.display = 'none';
    }

    const emojiPicker = document.getElementById('emojiPicker');
    if (emojiPicker) {
        emojiPicker.style.display = 'none';
    }

    // Close all dropdowns and reset z-index
    document.querySelectorAll('.section-dropdown').forEach(dropdown => {
        dropdown.style.display = 'none';
        const card = dropdown.closest('.result-card');
        if (card) card.style.zIndex = '';
    });

    // Remove dragging classes from any elements that might still have them
    document.querySelectorAll('.dragging').forEach(el => {
        el.classList.remove('dragging');
        el.style.opacity = '';
        el.style.transform = '';
        el.style.zIndex = '';
        el.style.cursor = 'grab'; // Reset cursor
    });

    document.body.classList.remove('dragging-active');
}

// Function to apply staggered animation to elements
function applyStaggeredAnimation(selector, classToAdd, delayBetween = 10) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((element, index) => {
        setTimeout(() => {
            requestAnimationFrame(() => {
                element.classList.add(classToAdd);
            });
        }, index * delayBetween);
    });
}

// Intersection Observer for hiding off-screen media
let mediaObserver = null;

function setupMediaVisibilityOptimization() {
    // Clean up existing observer if it exists
    if (mediaObserver) {
        mediaObserver.disconnect();
    }

    mediaObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const card = entry.target;

            // Find all media elements in this card
            const mediaElements = card.querySelectorAll('img, video, .image-wrapper');

            if (!entry.isIntersecting) {
                // Card is off-screen - hide media
                mediaElements.forEach(media => {
                    media.classList.add('media-hidden');
                    setTimeout(() => {
                        media.style.display = 'none';
                    }, 200); // Wait for fade
                });

            } else {
                // Card is on-screen - show media
                mediaElements.forEach(media => {
                    media.style.display = '';
                    requestAnimationFrame(() => {
                        media.classList.remove('media-hidden');
                    });
                });
            }
        });
    }, {
        rootMargin: '800px', // Start loading 800px before visible
        threshold: 0
    });

    // Observe all result cards
    document.querySelectorAll('.result-card').forEach(card => {
        mediaObserver.observe(card);
    });
}

// Shared content loader
function loadSharedContent(shareCode, isLoadMore = false) {
    if (isLoading) return;

    const resultsContainer = document.querySelector('.results-container');

    // If not loading more, reset everything
    if (!isLoadMore) {
        currentShareCode = shareCode;
        sharedContentOffset = 0;
        hasMoreSharedContent = false;
        resultsContainer.textContent = '';
        showLoading();
    }
    isLoading = true;

    // Fetch shared content with pagination
    fetch(`${API_BASE}/api/share/${shareCode}?offset=${sharedContentOffset}&limit=${BOOKMARKS_PER_PAGE}`)
        .then(response => response.json())
        .then(data => {
            // Only insert tab UI on first load
            if (!isLoadMore) {
                insertSharedTabUI(data.section);
                window.history.replaceState({}, '', window.location.pathname);
            }

            if (!data.bookmarks || data.bookmarks.length === 0) {
                hasMoreSharedContent = false;
                if (!isLoadMore) {
                    showError("No bookmarks found in this shared collection.");
                }
                isLoading = false;
                return;
            }

            // Only show first 10 bookmarks to user (same logic as loadSectionContent)
            const bookmarksToShow = data.bookmarks.slice(0, 10);

            const transformedData = {
                data: {
                    children: bookmarksToShow.map(bookmark => ({
                        data: {
                            id: bookmark.reddit_post_id,
                            title: bookmark.title,
                            url: bookmark.url,
                            permalink: bookmark.permalink,
                            subreddit: bookmark.subreddit,
                            score: bookmark.score,
                            is_video: bookmark.is_video,
                            domain: bookmark.domain,
                            author: bookmark.author,
                            created_utc: bookmark.created_utc,
                            num_comments: bookmark.num_comments,
                            over_18: bookmark.over_18,
                            selftext: bookmark.selftext,
                            body: bookmark.body,
                            is_gallery: bookmark.is_gallery,
                            gallery_data: bookmark.gallery_data,
                            media_metadata: bookmark.media_metadata,
                            crosspost_parent_list: bookmark.crosspost_parent_list || [],
                            content_type: bookmark.content_type,
                            icon_url: bookmark.icon_url,
                            locked: bookmark.locked,
                            stickied: bookmark.stickied,
                            preview: bookmark.preview
                        }
                    }))
                }
            };

            window.isViewingSharedContent = true;
            displayResults(transformedData, isLoadMore);

            // Make bookmark icons permanently saved and non-interactive
            document.querySelectorAll('.bookmark-icon').forEach(icon => {
                icon.classList.add('saved');
                icon.style.pointerEvents = 'none';
            });

            // Check if more content exists
            if (data.bookmarks.length < 11) {
                hasMoreSharedContent = false;
            } else {
                sharedContentOffset += 10;
                hasMoreSharedContent = true;
            }

            isLoading = false;

            setTimeout(() => {
                addSectionDropdowns(data.section.id).then(() => {
                    setupDropdownEvents();
                });
                setupMediaVisibilityOptimization();
                positionScrollIndicator();
            }, 150);

        })
        .catch(error => {
            console.error('Shared content fetch failed:', error);
            isLoading = false;
            showError("No bookmarks found in this shared collection.");
        });
}

// Unified loading function for all sections
function loadSectionContent(sectionId, isLoadMore = false, fromPopstate = false, numToLoad = 10) {
    
    if (isLoading) return;
    const resultsContainer = document.querySelector('.results-container');
    const authToken = getAuthToken();

    // If not loading more, reset the offset for this section
    if (!isLoadMore) {
        sectionOffsets[sectionId] = 0;
        hasMoreBookmarks[sectionId] = false;
        resultsContainer.textContent = '';
        showLoading();
        
    }

    isLoading = true;

    // Fetch bookmarks with pagination using the correct offset for this section
    fetch(`${API_BASE}/api/bookmarks/section/${sectionId}?offset=${sectionOffsets[sectionId]}&limit=${BOOKMARKS_PER_PAGE}`, {
        headers: {
            'Authorization': authToken
        }
    })
        .then(response => response.text())
        .then(rawText => {
            const data = JSON.parse(rawText);

            // Update URL
            if (!isLoadMore && !fromPopstate) {
                const url = new URL(window.location);
                url.searchParams.set('section', sectionId);
                window.history.pushState({}, '', url);
            }

            if (!data.bookmarks || data.bookmarks.length === 0) {
                hasMoreBookmarks[sectionId] = false;
                if (!isLoadMore) {
                    showError("No bookmarks found. Start bookmarking posts or import from Reddit to see them here.");
                }
                isLoading = false;
                return;
            }

            if (data.bookmarks && data.bookmarks.length > 0) {
                // Add to our section-specific array
                if (isLoadMore && sectionBookmarks[sectionId]) {
                    sectionBookmarks[sectionId] = sectionBookmarks[sectionId].concat(data.bookmarks);
                } else {
                    sectionBookmarks[sectionId] = data.bookmarks;
                }

                // Only show first 10 bookmarks to user
                const bookmarksToShow = isLoadMore ? data.bookmarks.slice(0, 10) : sectionBookmarks[sectionId].slice(0, Math.min(sectionBookmarks[sectionId].length, 10));

                const transformedData = {
                    data: {
                        children: bookmarksToShow.map(bookmark => ({
                            data: {
                                id: bookmark.reddit_post_id,
                                title: bookmark.title,
                                url: bookmark.url,
                                permalink: bookmark.permalink,
                                subreddit: bookmark.subreddit,
                                score: bookmark.score,
                                is_video: bookmark.is_video,
                                domain: bookmark.domain,
                                author: bookmark.author,
                                created_utc: bookmark.created_utc,
                                num_comments: bookmark.num_comments,
                                over_18: bookmark.over_18,
                                selftext: bookmark.selftext,
                                body: bookmark.body,
                                is_gallery: bookmark.is_gallery,
                                gallery_data: bookmark.gallery_data,
                                media_metadata: bookmark.media_metadata,
                                crosspost_parent_list: bookmark.crosspost_parent_list || [],
                                content_type: bookmark.content_type,
                                icon_url: bookmark.icon_url,
                                locked: bookmark.locked,
                                stickied: bookmark.stickied,
                                preview: bookmark.preview
                            }
                        }))
                    }
                };

                displayResults(transformedData, isLoadMore);

                setTimeout(() => {
                    makeBookmarksDraggable(sectionId);
                    addSectionDropdowns().then(() => {
                        setupDropdownEvents();
                    });
                    setupMediaVisibilityOptimization();
                }, 150);

                // Apply bookmarks to newly rendered posts
                const existingBookmarks = JSON.parse(sessionStorage.getItem('bookmarks') || '{}');
                document.querySelectorAll('.bookmark-icon').forEach(icon => {
                    const postId = icon.dataset.postId;
                    if (existingBookmarks[postId]) {
                        icon.classList.add('saved');
                    } else {
                        icon.classList.remove('saved');
                    }
                });

                if (data.bookmarks.length < 11) {
                    hasMoreBookmarks[sectionId] = false;
                } else {
                    sectionOffsets[sectionId] += 10;
                    hasMoreBookmarks[sectionId] = true;
                }
                setTimeout(() => {
                    positionScrollIndicator();
                }, 150);

            } else if (!isLoadMore) {
                showError("No bookmarks found. Start bookmarking posts to see them here.")
            }

            isLoading = false;
        })
        .catch(error => {
            console.error('Bookmark fetch failed:', error);
            isLoading = false;
            showError("Failed to load bookmarks");
        });
}