let currentOffset = 0;
let currentEmojiTarget = null;
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
if (urlParams.get('page') === 'bookmarks') {
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
    setInterval(() => {
        const authToken = localStorage.getItem('authToken');
        // If auth token is gone, treat as logged out
        if (!authToken) {
            window.location.href = 'karmafinder.html';
        }
    }, 1000);
}

// Create context menu HTML dynamically
function createContextMenu() {
    // Check if it already exists
    if (document.getElementById('contextMenu')) return;

    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.id = 'contextMenu';

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
        "Books Marked.",
        "We could have called it the Dog Ears. Instead, it's called Bookmarks. That wasn't political or anything."
    ];

    if (bookmarkCount < 20) {
        // Mix empty response with general ones
        const responses = ["Kinda empty. Are you watching your digital footprint?", "You have no bookmarks. You should go to r/bmw maybe.", "It's kinda empty in here. Are you depressed?", ...generalResponses];
        handleRandomResponse(responses);
    } else if (bookmarkCount >= 120) {
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

    // Skip generic default names
    if (tabName === "New Section") {
        return;
    }

    if (tabName === "Bookmarks") {
        handleRandomResponse(["Bookmarks? Real imaginative."]);
        return;
    }

    const positiveResponses = [
        `${tabName}? I wanna see.`,
        `${tabName}? Good choice.`,
        `${tabName}, that's good organization.`,
        `${tabName}, I like it.`,
        `${tabName}? Smart.`,
        `${tabName}, makes sense.`,
        `${tabName}, interesting.`
    ];
    const negativeResponses = [
        `${tabName}. Interesting.`,
        `${tabName}? Uhh.`,
        `Whatever floats your boat.`,
        `${tabName}, that's creative.`,
        `Heh.`,
        `For research purposes?`,
        `${tabName}?`,
        "Really?",
        "Okay.",
        "Bud...",
        "The usual suspects."
    ];
    const nsfwPattern = /\b(tits|titties|rape|raped|tiddies|nudes|onlyfans|hentai|boobs|cum|cock|cocks|cunt|gape|gooning|gooner|goon|pussy|porn|nsfw|xxx|adult|sexy|hot|wild|dirty)\b/i;
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
                <div class="tab-container">
                </div>
                <div class="scroll-container-minimal">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
            </div>
        `;
        if (contentContainer) {
            contentContainer.insertAdjacentHTML('beforebegin', tabsSectionHTML);
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

            const picker = document.getElementById('emojiPicker');

            // If picker is open and we clicked the same emoji, close it
            if (picker && picker.style.display === 'block' && currentEmojiTarget === emojiSpan) {
                picker.style.display = 'none';
                currentEmojiTarget = null;
                return;
            }

            // CLOSE CONTEXT MENU
            const contextMenu = document.getElementById('contextMenu'); 
            if (contextMenu) {
                contextMenu.style.display = 'none';
            }

            showEmojiPicker(emojiSpan); // pass clicked emoji span
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

        // Right-click listener for context menu
        tab.addEventListener('contextmenu', function (e) {
            e.preventDefault();

            const contextMenu = document.getElementById('contextMenu');
            if (!contextMenu) return;

            contextMenu.dataset.currentTabIndex = index;
            contextMenu.dataset.currentTabText = this.textContent.trim();
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
                const { value: newName } = await Swal.fire({
                    title: 'Rename Section',
                    input: 'text',
                    inputLabel: 'Enter new section name:',
                    inputPlaceholder: 'Section name',
                    showCancelButton: true,
                    confirmButtonText: 'Rename',
                    cancelButtonText: 'Cancel'
                });

                if (newName && newName.trim() !== '') {
                    const sectionId = contextMenu.dataset.currentSectionId;
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
                                    tab.textContent = newName; // fallback
                                }
                                // Refresh tabs and dropdowns to reflect the new name
                                initializeTabs();
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
                const result = await Swal.fire({
                    title: 'Delete Section?',
                    text: 'This will permanently delete the section and all its bookmarks.',
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
}

// Add scroll listener for bookmarks page only
function setupBookmarksScrollListener() {
    function handleScroll() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('page') !== 'bookmarks') return;

        // Get sectionId before checking hasMoreBookmarks
        const activeTab = document.querySelector('.tab.active');
        if (!activeTab) return;
        const allTabs = document.querySelectorAll('.tab');
        const activeTabIndex = Array.from(allTabs).indexOf(activeTab);
        const tabs = document.querySelectorAll('.tab');
        const sectionId = tabs[activeTabIndex]?.dataset.tabId;

        // Check the section-specific hasMoreBookmarks
        if (!hasMoreBookmarks[sectionId] || isLoading) return;

        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
            loadSectionContent(sectionId, true);
        }
    }
    window.addEventListener('scroll', handleScroll);
}

// Initialize scroll listener when bookmarks page loads
document.addEventListener('DOMContentLoaded', function () {
    const urlParams = new URLSearchParams(window.location.search);
    const page = urlParams.get('page');

    if (page === 'bookmarks') {
        initBookmarks();
        setupBookmarksScrollListener();
    }
});

function positionScrollIndicator() {
    const indicator = document.querySelector('.scroll-container-minimal');
    if (!indicator) {
        return;
    }

    const resultCards = document.querySelectorAll('.result-card');

    // Hide indicator if no bookmark cards are present
    if (resultCards.length === 0) {
        indicator.style.display = 'none';
        indicator.style.opacity = '0';
        return;
    }

    const body = document.body;
    const html = document.documentElement;
    // Get the actual height of all content
    const documentHeight = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight
    );
    // Position it near the bottom of content
    indicator.style.position = 'absolute';
    indicator.style.top = (documentHeight + 1005) + 'px';
    indicator.style.left = '50%';
    indicator.style.transform = 'translateX(-50%)';

    // Get active section
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) {
        indicator.style.display = 'none';
        indicator.style.opacity = '0';
        return;
    }
    const sectionId = activeTab.dataset.tabId;

    // Check section-specific hasMoreBookmarks
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('page') === 'bookmarks' && hasMoreBookmarks[sectionId]) {
        setTimeout(() => {
            indicator.style.display = 'flex';
            indicator.style.opacity = '1';
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

async function addSectionDropdowns() {
    const authToken = getAuthToken();
    let userSections = [];

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

    // Get the currently active tab's section ID
    const activeTab = document.querySelector('.tab.active');
    const currentSectionId = activeTab ? activeTab.dataset.tabId : null;

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
                    <span class="section-name">${section.name}</span>
                </div>`
            ).join('');

        dropdown.innerHTML = `
            <button class="section-selector">
                Bookmarks <svg width="20" height="20" viewBox="0 0 25 25" fill="none" stroke="currentColor" stroke-width="1.5">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>
            <div class="section-dropdown">
                ${sectionOptions}
                <div class="section-option create-new" data-section-id="create">
                    <span class="section-emoji">+</span>
                    <span class="section-name">Create New Section</span>
                </div>
            </div>
        `;

        card.style.position = 'relative';
        card.appendChild(dropdown);
    });
}

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

            const dropdown = this.nextElementSibling;
            if (!dropdown) return;
            const parentCard = this.closest('.result-card');
            const isCurrentlyOpen = dropdown.style.display === 'block';

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
            const authToken = getAuthToken();

            fetch(`${API_BASE}/api/bookmarks/${bookmarkId}/section`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': authToken
                },
                body: JSON.stringify({ sectionId: sectionId })
            })
                .then(response => response.json())
                .then(data => {
                    //console.log('Bookmark moved:', data);
                    if (isMovingToADifferentSection) {

                        // Wait a bit for the section move to complete, then reorder
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
                                .then(reorderResult => {
                                    //console.log('Reorder result:', reorderResult);
                                })
                                .catch(error => {
                                    console.error('Error in reorder process:', error);
                                });
                        }, 100);

                        // Animate out
                        card.style.transition = 'opacity 0.3s ease';
                        card.style.opacity = '0';
                        setTimeout(() => {
                            card.remove();

                            // Check if this was the last bookmark in the current section
                            const remainingCards = document.querySelectorAll('.result-card');
                            if (remainingCards.length === 0) {
                                showError("No bookmarks found. Start bookmarking posts to see them here.");
                            }
                        }, 300);
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
    picker.style.top = (rect.top + window.scrollY - 325) + 'px';
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

// Unified loading function for all sections
function loadSectionContent(sectionId, isLoadMore = false, fromPopstate = false) {
    
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

            if (!data.bookmarks || data.bookmarks.length === 0) {
                hasMoreBookmarks[sectionId] = false;
                if (!isLoadMore) {
                    showError("No bookmarks found. Start bookmarking posts to see them here.");
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

                // In loadSectionContent, right after the successful pushState:
                if (!isLoadMore && !fromPopstate) {
                    const url = new URL(window.location);
                    url.searchParams.set('section', sectionId);
                    window.history.pushState({}, '', url);
                }

                setTimeout(() => {
                    makeBookmarksDraggable(sectionId);
                    addSectionDropdowns().then(() => {
                        setupDropdownEvents();
                    });
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
                positionScrollIndicator();

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