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
// Auth is handled via HttpOnly cookie
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
        descriptionMeta.content = "Organize your saved Reddit posts with Pinterest-style saving. Drag-and-drop organization, custom categories, and emoji tags.";
    }

    // Update OG title
    const ogTitleMeta = document.querySelector('meta[property="og:title"]');
    if (ogTitleMeta) {
        ogTitleMeta.content = "Reddit Bookmarks Manager - KarmaFinder";
    }

    // Update OG description  
    const ogDescMeta = document.querySelector('meta[property="og:description"]');
    if (ogDescMeta) {
        ogDescMeta.content = "Save and organize Reddit content with drag-and-drop saving, custom categories, and visual organization.";
    }
    
    if (!isSharePage) {
        setTimeout(() => {
            setInterval(() => {
                if (!isLoggedIn) {
                    window.location.href = 'index.html';
                }
            }, 1000);
        }, 3000);
    }
}

// Initialize IndexedDB
function openImageCache() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('RedditBookmarksDB', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('sectionImages')) {
                db.createObjectStore('sectionImages', { keyPath: 'permalink' });
            }
        };
    });
}

// Store image in cache
async function cacheSectionImage(permalink, imageUrl) {
    try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();

        const db = await openImageCache();
        const transaction = db.transaction(['sectionImages'], 'readwrite');
        const store = transaction.objectStore('sectionImages');

        await store.put({
            permalink: permalink,
            imageBlob: blob,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('Failed to cache image:', error);
    }
}

// Get image from cache
async function getCachedSectionImage(permalink) {
    try {
        const db = await openImageCache();
        const transaction = db.transaction(['sectionImages'], 'readonly');
        const store = transaction.objectStore('sectionImages');

        return new Promise((resolve, reject) => {
            const request = store.get(permalink);
            request.onsuccess = () => {
                if (request.result) {
                    const objectURL = URL.createObjectURL(request.result.imageBlob);
                    resolve(objectURL);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Failed to get cached image:', error);
        return null;
    }
}

function isMobile() {
    return window.innerWidth <= 1024;
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

// Basic initialization function for bookmarks page
async function initBookmarks() {
    if (window.location.pathname.includes('/share/')) return;
    preloadBookmarks();
    createContextMenu();
    setupContextMenuHandlers();
    handleRedditAuthParams();
    setupBookmarksScrollListener();

    // Show bookmarks landing page on mobile, load first section on desktop
    if (isMobile()) {
        const urlParams = new URLSearchParams(window.location.search);
        const sectionIdFromUrl = urlParams.get('section');

        if (sectionIdFromUrl) {
            // Load the specific section if URL has it
            initializeTabs();
            loadSectionContent(parseInt(sectionIdFromUrl));
        } else {
            // Otherwise show landing page
            showSectionsAntepage();
        }
    } else {
        await initializeTabs();
    }
}

function handleRedditAuthParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const redditAuth = urlParams.get('reddit_auth');
    const autoImport = urlParams.get('auto_import');

    if (redditAuth === 'success' && autoImport === 'true') {
        // Show import dialog immediately with loading state
        setTimeout(() => {
            if (isMobile()) {
                showMobileImportDialog();
            } else {
                showRedditImportDialog();
            }
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
                confirmButtonText: 'OK',
                didOpen: () => {
                    document.activeElement.blur();
                }
            });
        } else {
            Swal.fire({
                title: 'Connection Failed',
                text: 'Reddit connection failed.',
                icon: 'error',
                confirmButtonText: 'OK',
                didOpen: () => {
                    document.activeElement.blur();
                }
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
        const responses = ["Quite the collection.", "This is what they call a body of work.", "Beautiful bookmarks.", "You're a connoisseur, eh?", "Getting serious about organization, I see.", ...generalResponses];
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
    const contentContainer = document.getElementById('bookmarks-results');

    if (!tabContainer) {
        const tabsSectionHTML = `
    <div class="tabs-section">
        <div class="tab-container"></div>
    </div>
`;

        if (contentContainer) {
            // insert tabs above results
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
        
        tabContainer.appendChild(newTabElement);
    });

    tabContainer.classList.toggle('multirow', tabsData.length > 8);
        
    // Only add the + button if we have less than 8 tabs
    if (tabsData.length < 16) {
        const addSectionBtn = document.createElement('button');
        addSectionBtn.className = 'add-section-btn';
        addSectionBtn.title = 'Add New Section';
        addSectionBtn.innerHTML = '<span class="plus-sign">+</span>';
        tabContainer.appendChild(addSectionBtn);

        addSectionBtn.removeEventListener('click', createNewSection);
        addSectionBtn.addEventListener('click', createNewSection);
    

    }
    setupTabEvents();
}

async function initializeTabs() {
    if (isMobile()) return;
    try {
        const response = await fetch(`${API_BASE}/api/sections`, {
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (!data.sections) {
            console.error('No sections data received');
            return;
        }

        if (data.sections.length === 0) {
            await fetch(`${API_BASE}/api/sections`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ name: 'Bookmarks' })
            });
            const newResponse = await fetch(`${API_BASE}/api/sections`, {
                credentials: 'include'
            });
            const newData = await newResponse.json();
            data.sections = newData.sections;
        }

        const urlParams = new URLSearchParams(window.location.search);
        if (!urlParams.get('section')) {
            const url = new URL(window.location);
            url.searchParams.set('section', data.sections[0].id);
            window.history.replaceState({}, '', url);
            loadSectionContent(data.sections[0].id);
        } else {
            loadSectionContent(parseInt(urlParams.get('section')));
        }

        await insertTabsUI(data.sections);

    } catch (error) {
        console.error('Failed to load sections:', error);
    }
}

// Create New Section button
async function createNewSection() {
    try {
        const response = await fetch(`${API_BASE}/api/sections`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
                name: 'New Section'
            })
        });

        if (response.ok) {
            const urlParams = new URLSearchParams(window.location.search);
            const sectionParam = urlParams.get('section');

            if (isMobile() && !sectionParam) {
                showSectionsAntepage(true);
            } else {
                initializeTabs();
                loadSectionContent(parseInt(sectionParam));
            }
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
                Math.random() < 0.5 ? handleTabSpecificPI(tabName) : handleBookmarksPI();
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

async function renameSectionById(sectionId, currentName, tabIndex = null) {
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

    if (!newName || newName.trim() === '') return;

    try {
        const response = await fetch(`${API_BASE}/api/sections/${sectionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name: newName })
        });

        const data = await response.json();
        if (data.success) {
            // Update desktop tab if present
            const tab = document.querySelector(`[data-tab-id="${sectionId}"]`);
            if (tab) {
                const titleSpan = tab.querySelector('.tab-title');
                if (titleSpan) titleSpan.textContent = newName;
                else tab.textContent = newName;

                if (tabIndex !== null) {
                    sessionStorage.setItem('focusTabAfterRefresh', tabIndex);
                }

                await initializeTabs();

                const storedIndex = sessionStorage.getItem('focusTabAfterRefresh');
                if (storedIndex !== null) {
                    const tabs = document.querySelectorAll('.tab');
                    const targetTab = tabs[parseInt(storedIndex)];
                    if (targetTab) targetTab.focus();
                    sessionStorage.removeItem('focusTabAfterRefresh');
                }
            }

            // Update mobile section header if present
            const mobileTitle = document.querySelector('.mobile-section-title');
            if (mobileTitle) mobileTitle.textContent = newName;

        } else {
            Swal.fire({
                title: 'Error',
                text: 'Failed to rename section: ' + (data.error || 'Unknown error'),
                icon: 'error',
                didOpen: () => document.activeElement.blur()
            });
        }
    } catch (error) {
        console.error('Error renaming section:', error);
        Swal.fire({
            title: 'Error',
            text: 'Failed to rename section',
            didOpen: () => document.activeElement.blur()
        });
    }
}

async function deleteSectionById(sectionId, sectionName) {
    const result = await Swal.fire({
        title: `Delete Section?`,
        text: `This will permanently delete '${sectionName}' and all its saves.`,
        showCancelButton: true,
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#ef4444',
        didOpen: () => {
            if (!document.body.classList.contains('user-is-tabbing')) {
                document.activeElement.blur();
            }
        }
    });

    if (!result.isConfirmed) return;

    try {
        await fetch(`${API_BASE}/api/sections/${sectionId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (isMobile()) {
            showSectionsAntepage();
            showToast(`Deleted ${sectionName}`, 'error');
        } else {
            showToast(`Deleted ${sectionName}`, 'error');
            const url = new URL(window.location);
            url.searchParams.delete('section');
            window.history.replaceState({}, '', url);
            await initializeTabs();
        }

    } catch (err) {
        console.error('❌ Error deleting section:', err);
    }
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
                const sectionId = contextMenu.dataset.currentSectionId;
                const tabIndex = parseInt(contextMenu.dataset.currentTabIndex);
                await renameSectionById(sectionId, currentName, tabIndex);

            } else if (action === 'delete') {
                const sectionName = contextMenu.dataset.currentTabText;
                const sectionId = contextMenu.dataset.currentSectionId;
                await deleteSectionById(sectionId, sectionName);
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
            let sectionId;

            if (isMobile()) {
                sectionId = urlParams.get('section');
            } else {
                const activeTab = document.querySelector('.tab.active');
                if (!activeTab) return;
                const allTabs = document.querySelectorAll('.tab');
                const activeTabIndex = Array.from(allTabs).indexOf(activeTab);
                const tabs = document.querySelectorAll('.tab');
                sectionId = tabs[activeTabIndex]?.dataset.tabId;
            }

            if (!sectionId || !hasMoreBookmarks[sectionId] || isLoading) return;

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
    if (window.location.pathname.includes('/share/')) {
        const shareCode = window.location.pathname.split('/share/')[1];
        if (window.switchTab) switchTab('bookmarks');
        loadSharedContent(shareCode);
        setupBookmarksScrollListener();
    }
    updateLoginButton();

    // Close import menu on outside clicks — registered once
    document.addEventListener('click', function (e) {
        const menu = document.getElementById('importMenu');
        if (menu && !menu.contains(e.target) && !e.target.closest('.import-button')) {
            menu.style.display = 'none';
        }
    });
});

function insertSharedTabUI(sectionData) {
    if (isMobile()) return;
    let tabContainer = document.querySelector('.tab-container');
    const contentContainer = document.getElementById('bookmarks-results');

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

function makeBookmarksDraggable(sectionId) {
    const bookmarkCards = document.querySelectorAll('.result-card');

    bookmarkCards.forEach((card) => {
        card.draggable = true;
        card.dataset.sectionId = sectionId;
        card.style.cursor = 'grab';

        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragover', handleDragOver);
        card.addEventListener('drop', handleDrop);
        card.addEventListener('dragend', handleDragEnd);
    });
}

let draggedElement = null;
let draggedBookmarkId = null;
let draggedSectionId = null;
let dragAfterBookmarkId = undefined;

function handleDragStart(e) {
    draggedElement = this;
    draggedBookmarkId = this.dataset.bookmarkId;
    draggedSectionId = parseInt(this.dataset.sectionId);
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

    const sectionId = draggedSectionId;
    const arr = sectionBookmarks[sectionId];
    const fromIndex = arr.findIndex(b => b.reddit_post_id === draggedBookmarkId);
    if (fromIndex === -1) return;

    const item = arr.splice(fromIndex, 1)[0];
    const toIndex = dragAfterBookmarkId === null
        ? arr.length
        : arr.findIndex(b => b.reddit_post_id === dragAfterBookmarkId);
    arr.splice(toIndex === -1 ? arr.length : toIndex, 0, item);

    updateBookmarkOrder(sectionId, arr.map(b => b.reddit_post_id));
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
function updateBookmarkOrder(sectionId, orderedIds) {
    fetch(`${API_BASE}/api/bookmarks/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orderedIds, sectionId })
    })
    .catch(error => {
        console.error(`❌ Error updating bookmark order for section ${sectionId}:`, error);
    });
}

async function addSectionDropdowns(excludeSectionId = null) {
    if (isMobile()) return;
    
    const isSharedPage = window.location.pathname.includes('/share/');
    let userSections = [];

    // Only fetch sections if authenticated
        if (getAuthStatus()) {
        try {
            const response = await fetch(`${API_BASE}/api/sections`, {
                credentials: 'include'
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
        currentSectionId = activeTab
            ? activeTab.dataset.tabId
            : new URLSearchParams(window.location.search).get('section');
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
        if (!getAuthStatus() && isSharedPage) {
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
                ${userSections.length < 16 && !excludeSectionId ? `
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

            if (!getAuthStatus()) {
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
            const currentSectionId = activeTab
                ? activeTab.dataset.tabId
                : new URLSearchParams(window.location.search).get('section');
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
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: body
            })
                .then(response => response.json())
                .then(data => {
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
                                credentials: 'include'
                            })
                                .then(response => response.json())
                                .then(sectionData => {
                                    const allIds = sectionData.bookmarks.map(b => b.reddit_post_id);
                                    const filteredIds = allIds.filter(id => id !== bookmarkId);
                                    const orderedIds = [bookmarkId, ...filteredIds];

                                    return fetch(`${API_BASE}/api/bookmarks/reorder`, {
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
                                    showError("No bookmarks found. Start saving posts to see them here.");
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
    picker.addEventListener('click', async (e) => {
        if (e.target.classList.contains('emoji-option')) {
            const selectedEmoji = e.target.dataset.emoji;

                // Get the section ID from the parent tab
                const tab = currentEmojiTarget.closest('.tab');
                                const sectionId = tab.dataset.tabId;
                
                // Save to backend
                try {
                    const response = await fetch(`${API_BASE}/api/sections/${sectionId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        credentials: 'include',
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
    menu.addEventListener('click', async (e) => {
        const option = e.target.closest('.share-option');
        if (option) {
            const action = option.dataset.action;
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
                        
                        const response = await fetch(`${API_BASE}/api/sections/${sectionId}/share`, {
                            method: 'POST'
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
                    
                    const response = await fetch(`${API_BASE}/api/sections/${sectionId}/share`, {
                        method: 'POST'
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
                    
                    const response = await fetch(`${API_BASE}/api/sections/${sectionId}/share`, {
                        method: 'POST'
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
                    
                    const response = await fetch(`${API_BASE}/api/sections/${sectionId}/share`, {
                        method: 'POST'
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
                    
                    const response = await fetch(`${API_BASE}/api/sections/${sectionId}/share`, {
                        method: 'POST'
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        const messengerUrl = `https://www.messenger.com/new?message=${encodeURIComponent('Check out this curated Reddit collection on KarmaFinder! ' + data.shareUrl)}`;
                        window.open(messengerUrl, 'messenger-share', 'width=626,height=436,toolbar=no,menubar=no,scrollbars=no,resizable=yes');
                    }
                }
                menu.style.display = 'none';
            }
        }
    });

    // Hide menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!menu.contains(e.target) && !e.target.closest('.share-button')) {
            menu.style.display = 'none';
        }
    });
    setupShareMenuKeyboardNav();
}

async function showMobileShareSheet() {
    const isSharedPage = window.location.pathname.includes('/share/');
    let shareUrl;

    if (isSharedPage) {
        shareUrl = window.location.href;
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        const sectionId = urlParams.get('section');
        try {
            const response = await fetch(`${API_BASE}/api/sections/${sectionId}/share`, { method: 'POST' });
            if (!response.ok) return;
            const data = await response.json();
            shareUrl = data.shareUrl;
        } catch (err) {
            console.error('Failed to get share URL:', err);
            return;
        }
    }

    const text = 'Check out this curated Reddit collection on KarmaFinder!';

    const overlay = document.createElement('div');
    overlay.className = 'section-picker-overlay';

    const sheet = document.createElement('div');
    sheet.className = 'section-more-sheet';

    const header = document.createElement('div');
    header.className = 'section-more-header';
    header.innerHTML = `<div style="width: 56px; height: 4px; background: var(--border-color); border-radius: 2px; margin: 0 auto 4px;"></div><span class="section-more-title">Share</span>`;
    sheet.appendChild(header);

    function closeSheet() {
        sheet.style.transform = 'translateY(100%)';
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.remove(); sheet.remove(); }, 200);
    }

    const options = [
        { label: 'Copy link', iconClass: 'share-option-icon--copylink', iconOverlay: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`, action: async () => {
            try { await navigator.clipboard.writeText(shareUrl); } catch(e) { console.error('clipboard error:', e); }
            showToast('Link copied!');
        } },
        { label: 'Instagram', iconClass: 'share-option-icon--instagram', iconSrc: '../assets/instagradient.png', iconOverlay: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none"/></svg>`, action: () => window.open(`instagram://share?url=${encodeURIComponent(shareUrl)}`, '_blank') },
        { label: 'Messages', iconClass: 'messages', iconSrc: '../assets/bubble.png', iconImgClass: 'messages-bubble-img', action: () => window.open(`sms:&body=${encodeURIComponent(text + ' ' + shareUrl)}`, '_blank') },
        { label: 'WhatsApp', iconClass: 'whatsapp', iconOverlay: `<i class="fab fa-whatsapp" style="font-size:31px;color:white;"></i>`, action: () => window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + shareUrl)}`, '_blank') },
        { label: 'More apps', iconClass: 'more-apps', iconOverlay: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" width="22" height="22"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`, action: () => {
            if (!navigator.share) return;
            navigator.share({ title: 'KarmaFinder', text, url: shareUrl })
                .catch(err => console.error('share error:', err));
        }},
    ];

    options.forEach(({ label, iconClass, iconSrc, iconImgClass, iconOverlay, action }) => {
        const item = document.createElement('div');
        item.className = 'section-more-item';
        const inner = document.createElement('div');
        inner.className = 'section-more-item-inner';
        const icon = document.createElement('div');
        icon.className = 'share-option-icon' + (iconClass ? ' ' + iconClass : '');
        if (iconSrc) {
            const img = document.createElement('img');
            img.src = iconSrc;
            img.className = 'share-option-icon-img' + (iconImgClass ? ' ' + iconImgClass : '');
            icon.appendChild(img);
        }
        if (iconOverlay) {
            const overlayEl = document.createElement('div');
            overlayEl.className = 'share-option-icon-overlay';
            overlayEl.innerHTML = iconOverlay;
            icon.appendChild(overlayEl);
        }
        const labelSpan = document.createElement('span');
        labelSpan.textContent = label;
        inner.appendChild(icon);
        inner.appendChild(labelSpan);
        item.appendChild(inner);
        item.addEventListener('click', () => { action(); closeSheet(); });
        sheet.appendChild(item);
    });

    overlay.addEventListener('click', closeSheet);

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
        const delta = startY - currentY;
        const newHeight = startHeight + delta;
        const maxHeightPx = window.innerHeight * 0.8;
        sheet.style.height = `${Math.max(0, Math.min(newHeight, maxHeightPx))}px`;
        e.preventDefault();
    };

    const dragStop = () => {
        if (!isDragging) return;
        isDragging = false;
        sheet.style.transition = 'height 0.2s ease';
        const currentHeightVh = (parseInt(getComputedStyle(sheet).height) / window.innerHeight) * 100;
        if (currentHeightVh < 20) {
            closeSheet();
        } else {
            sheet.style.height = 'auto';
        }
    };

    header.addEventListener('mousedown', dragStart);
    header.addEventListener('touchstart', dragStart);
    document.addEventListener('mousemove', dragging);
    document.addEventListener('touchmove', dragging, { passive: false });
    document.addEventListener('mouseup', dragStop);
    document.addEventListener('touchend', dragStop);

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        sheet.style.transform = 'translateY(0)';
    });

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
    let userSections = [];

    try {
        const response = await fetch(`${API_BASE}/api/sections`, { credentials: 'include' });
        const data = await response.json();
        userSections = data.sections || [];
    } catch (error) {
        console.error('Error fetching sections:', error);
        userSections = [];
    }

    const isLoading = !username && !uniqueCount;

    const dropdownHtml = `
      <div class="reddit-import-container">
          <div class="import-stats">
              <div class="import-stat-row">
                  <span class="import-stat-label">Reddit User</span>
                  <span class="import-stat-value" id="user-info">${isLoading ? '' : username}</span>
              </div>
              <div class="import-stat-row">
                  <span class="import-stat-label">Posts</span>
                  <span class="import-stat-value" id="count-info">${isLoading ? '' : `${uniqueCount} unique ${uniqueCount === 1 ? 'post' : 'posts'} to import`}</span>
              </div>
          </div>
          <label class="import-select-label">Import to section:</label>
          <select id="sectionSelect">
              <option value="" hidden>Select section...</option>
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
        customClass: { title: 'section-info-topbar-title' },
        didOpen: () => {
            if (isLoading) {
                const userSpinner = createCanvasSpinner(null, 18);
                const countSpinner = createCanvasSpinner(null, 18);

                document.getElementById('user-info').appendChild(userSpinner);
                document.getElementById('count-info').appendChild(countSpinner);

                fetch('/api/reddit/saved-count', { credentials: 'include' })
                    .then(response => {
                        if (response.status === 404 || response.status === 500) {
                            Swal.close();
                            initiateRedditLogin();
                            return;
                        }
                        if (response.ok) return response.json();
                    })
                    .then(data => {
                        if (data) {
                            document.getElementById('user-info').innerHTML = `<span class="import-checkmark">✓</span> ${data.username}`;
                            document.getElementById('count-info').innerHTML = `<span class="import-checkmark">✓</span> ${data.uniqueCount} unique ${data.uniqueCount === 1 ? 'post' : 'posts'} to import`;
                        }
                    })
                    .catch(() => Swal.close());
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
                'Content-Type': 'application/json'
            },
            credentials: 'include',
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
                confirmButtonText: 'OK',
                didOpen: () => {
                    document.activeElement.blur();
                }
            });
        }
    } catch (error) {
        console.error('Import error:', error);
        await Swal.fire({
            title: 'Import Failed',
            text: 'Network error occurred during import',
            icon: 'error',
            confirmButtonText: 'OK',
            didOpen: () => {
                document.activeElement.blur();
            }
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

        if (targetElement) {
            const rect = targetElement.getBoundingClientRect();
            menu.style.position = 'absolute';
            menu.style.left = rect.left + 'px';
            menu.style.top = (rect.bottom + window.scrollY + 5) + 'px';
        } else {
            menu.style.position = 'fixed';
            menu.style.left = '50%';
            menu.style.top = '50%';
            menu.style.transform = 'translate(-50%, -50%)';
        }
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
                if (isMobile()) {
                    showMobileImportDialog();
                } else {
                    showRedditImportDialog();
                }
                        } else if (action === 'switch-reddit') {
            
                try {
                    const response = await fetch('/api/reddit/disconnect', {
                        method: 'DELETE',
                        credentials: 'include'
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
                        confirmButtonText: 'OK',
                        didOpen: () => {
                            document.activeElement.blur();
                        }
                    });
                }
            } else if (action === 'section-info') {
                showSectionInfo();
            }
            
            document.getElementById('importMenu').style.display = 'none';
        });
    });

}

async function showSectionInfo() {
    if (document.querySelector('.section-info-sheet')) return;
    const isSharedPage = window.location.pathname.includes('/share/');
    let bookmarkCount = 0;
    let topSubreddit = 'None';
    let createdDate = 'Unknown';
    let description = 'No description';
    let sectionName = 'Unknown';
    let lastModified = 'Unknown';

    if (isSharedPage) {
        // For shared pages, get info from the share code
        const shareCode = window.location.pathname.split('/share/')[1];

        try {
            const response = await fetch(`${API_BASE}/api/share/${shareCode}`);
            const data = await response.json();
            sectionName = data.section.name || 'Unknown';
            bookmarkCount = data.total_count;
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
        const activeTab = document.querySelector('.tab.active');
        const sectionId = activeTab
            ? activeTab.dataset.tabId
            : new URLSearchParams(window.location.search).get('section');

                try {
            const response = await fetch(`${API_BASE}/api/bookmarks/section/${sectionId}?offset=0&limit=1`, {
                credentials: 'include'
            });
            const data = await response.json();
            sectionName = data.section_name || data.name || 'Unknown';
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
    <div class="section-info-wrap">
        <div class="section-info-header">
            <span class="section-info-title">${sectionName.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
<span class="section-info-saves">${bookmarkCount} ${bookmarkCount === 1 ? 'Save' : 'Saves'}</span>
        </div>
        <div class="section-info-stats">
            <div class="section-stat-card">
                <span class="section-stat-value">${createdDate}</span>
                <span class="section-stat-label">Created</span>
            </div>
            <div class="section-stat-card">
                <span class="section-stat-value">${topSubreddit}</span>
                <span class="section-stat-label">Top Subreddit</span>
            </div>
        </div>
        <div class="section-info-modified">Last modified: ${lastModified}</div>
        ${!isSharedPage ? `
        <div class="section-info-description">
            <label class="section-desc-label">Description</label>
            <textarea id="sectionDescription" maxlength="500" placeholder="Add a description">${description === 'No description' ? '' : description.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
            <div class="section-desc-footer">
                <span class="description-counter" id="descriptionCounter">0/500</span>
            </div>
        </div>` : description !== 'No description' ? `
        <div class="section-info-description">
            <label class="section-desc-label">Description</label>
            <p class="section-desc-readonly">${description.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </div>` : ''}
    </div>
`;

    const overlay = document.createElement('div');
    overlay.className = 'section-info-overlay';

    const sheet = document.createElement('div');
    sheet.className = 'section-info-sheet';
    sheet.innerHTML = `
        <div class="section-info-topbar">
            <span class="section-info-topbar-title">Section Info</span>
        </div>
        ${sectionInfoHtml}
        <div class="section-info-done-wrap">
            <button class="section-info-done-btn">Done</button>
        </div>
    `;

    function closeSheet() {
        if (!isSharedPage) {
            const textarea = sheet.querySelector('#sectionDescription');
            const originalDescription = description === 'No description' ? '' : description;
            if (textarea && textarea.value.trim() !== originalDescription.trim()) {
                const newDescription = textarea.value.trim();
                const activeTab = document.querySelector('.tab.active');
                const sectionId = activeTab
                    ? activeTab.dataset.tabId
                    : new URLSearchParams(window.location.search).get('section');
                fetch(`${API_BASE}/api/sections/${sectionId}/description`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ description: newDescription })
                }).catch(err => console.error('Failed to save description:', err));
            }
        }
        if (window.innerWidth > 1024) {
            sheet.style.transform = 'translate(-50%, -50%) scale(0.95)';
            sheet.style.opacity = '0';
        } else {
            sheet.style.transform = 'translateY(100%)';
        }
        overlay.style.opacity = '0';
        document.body.style.overflow = '';
        document.body.style.pointerEvents = '';
        setTimeout(() => { overlay.remove(); sheet.remove(); }, 300);
        if (currentMenuOpener) { currentMenuOpener.focus(); currentMenuOpener = null; }
    }

    sheet.querySelector('.section-info-done-btn').addEventListener('click', closeSheet);
    overlay.addEventListener('click', closeSheet);

    if (!isSharedPage) {
        const textarea = sheet.querySelector('#sectionDescription');
        const counter = sheet.querySelector('#descriptionCounter');
        if (textarea && counter) {
            counter.textContent = `${textarea.value.length}/500`;
            if (textarea.value.length > 450) counter.classList.add('warning');
            textarea.addEventListener('input', function () {
                counter.textContent = `${this.value.length}/500`;
                if (this.value.length > 450) counter.classList.add('warning');
                else counter.classList.remove('warning');
            });
        }
    }

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);
    document.body.style.overflow = 'hidden';
    document.body.style.pointerEvents = 'none';
    sheet.style.pointerEvents = 'all';

    // On desktop reset transform so scale animation works cleanly
    if (window.innerWidth > 1024) {
        sheet.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
        sheet.style.transform = 'translate(-50%, -50%) scale(0.95)';
        sheet.style.opacity = '0';
    }

    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        if (window.innerWidth > 1024) {
            requestAnimationFrame(() => {
                sheet.style.transform = 'translate(-50%, -50%) scale(1)';
                sheet.style.opacity = '1';
            });
        } else {
            sheet.style.transform = 'translateY(0)';
        }
    });
}

async function showImportSectionPicker() {
    return new Promise(async (resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.3);
            z-index: 10002;
            opacity: 0;
            transition: opacity 0.2s ease;
        `;

        const sheet = document.createElement('div');
        sheet.className = 'import-picker-sheet';
        sheet.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            border-radius: 16px 16px 0 0;
            overflow-y: auto;
            z-index: 10003;
            transform: translateY(100%);
            transition: transform 0.25s ease-in-out;
            box-shadow: 0 -4px 20px var(--shadow-card);
        `;

        const header = document.createElement('div');
        header.className = 'header-picker-sheet';
        header.style.cssText = `
            padding: 13px 16px 13px;
            position: sticky;
            top: 0;
            z-index: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        `;
        header.innerHTML = `
            <button id="import-picker-close" style="position: absolute; left: 12px; top: 48%; transform: translateY(-50%); font-weight: 300; background: none; border: none; font-size: 2.2rem; color: var(--text-color); cursor: pointer; line-height: 1;">×</button>
            <h3 style="margin: 0; font-size: 1.2rem; color: var(--text-color); font-weight: 600;">Save to</h3>
        `;

        const listContainer = document.createElement('div');
        listContainer.style.cssText = `padding: 8px 0;`;

        sheet.appendChild(header);
        sheet.appendChild(listContainer);

        function closeMenu() {
            sheet.style.transform = 'translateY(100%)';
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.remove(); sheet.remove(); }, 200);
        }

        header.querySelector('#import-picker-close').addEventListener('click', () => { closeMenu(); resolve(null); });

        try {
            const res = await fetch(`${API_BASE}/api/sections/with-previews`, { credentials: 'include' });
            const sectionsData = await res.json();

            for (const section of sectionsData.sections) {
                const item = document.createElement('div');
                item.className = 'section-picker-item';
                if (section.over_18) item.classList.add('nsfw');
                item.setAttribute('data-permalink', section.permalink);

                const thumbContainer = document.createElement('div');
                thumbContainer.className = 'section-picker-thumb';

                if (section.url) {
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
                    if (!cachedUrl && thumbnailURL) cacheSectionImage(section.permalink, thumbnailURL);
                } else {
                    const newsIcon = document.createElement('div');
                    newsIcon.className = 'news-icon-fallback';
                    newsIcon.style.cssText = `width: 55px; height: 55px; background-size: 60px 60px; position: relative;`;
                    thumbContainer.appendChild(newsIcon);
                }

                const info = document.createElement('div');
                info.className = 'section-picker-info';
                info.innerHTML = `<span>${section.section_name}</span>`;

                item.appendChild(thumbContainer);
                item.appendChild(info);

                item.addEventListener('click', () => {
                    closeMenu();
                    resolve({ id: section.section_id, name: section.section_name });
                });

                listContainer.appendChild(item);
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
        } catch (err) {
            console.error('Failed to load sections for import picker:', err);
            closeMenu();
            resolve(null);
            return;
        }

        overlay.addEventListener('click', () => { closeMenu(); resolve(null); });

        document.body.appendChild(overlay);
        document.body.appendChild(sheet);

        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            sheet.style.transform = 'translateY(0)';
        });
    });
}

async function showMobileImportDialog() {
    const overlay = document.createElement('div');
    overlay.className = 'mobile-import-overlay';

    const sheet = document.createElement('div');
    sheet.className = 'mobile-import-sheet';

    const handle = document.createElement('div');
    handle.className = 'mobile-import-handle';

    const title = document.createElement('div');
    title.className = 'mobile-import-title';
    title.textContent = 'Import Reddit Saves';

    const body = document.createElement('div');
    body.className = 'mobile-import-body';

    const stats = document.createElement('div');
    stats.className = 'mobile-import-stats';
    stats.innerHTML = `
        <div class="mobile-import-stat-row">
            <span class="mobile-import-stat-label">Reddit User</span>
            <span class="mobile-import-stat-value" id="mob-reddit-user"></span>
        </div>
        <div class="mobile-import-stat-row">
            <span class="mobile-import-stat-label">Posts</span>
            <span class="mobile-import-stat-value" id="mob-reddit-count"></span>
        </div>
    `;

    // Fetch real data
    fetch('/api/reddit/saved-count', { credentials: 'include' })
        .then(res => {
            if (res.status === 404 || res.status === 500) {
                closeSheet();
                initiateRedditLogin();
                return;
            }
            return res.json();
        })
        .then(data => {
            if (data) {
                document.getElementById('mob-reddit-user').innerHTML = `<span class="mobile-import-checkmark">✓</span> ${data.username}`;
                document.getElementById('mob-reddit-count').innerHTML = `<span class="mobile-import-checkmark">✓</span> ${data.uniqueCount} unique ${data.uniqueCount === 1 ? 'post' : 'posts'} to import`;
            }
        })
        .catch(() => closeSheet());

    const selectLabel = document.createElement('span');
    selectLabel.className = 'mobile-import-select-label';
    selectLabel.textContent = 'Import to section';

    let selectedSectionId = null;

    const selectRow = document.createElement('div');
    selectRow.className = 'mobile-import-select-row';
    selectRow.innerHTML = '<span id="mob-section-label">Select section</span><img class="chevron">';
    selectRow.addEventListener('click', async () => {
        const result = await showImportSectionPicker();
        if (result) {
            selectedSectionId = result.id;
            document.getElementById('mob-section-label').textContent = result.name;
        }
    });

    body.appendChild(stats);
    body.appendChild(selectLabel);
    body.appendChild(selectRow);

    const footer = document.createElement('div');
    footer.className = 'mobile-import-footer';

    const importBtn = document.createElement('button');
    importBtn.className = 'mobile-import-btn mobile-import-btn-confirm';
    importBtn.textContent = 'Import';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'mobile-import-btn mobile-import-btn-cancel';
    cancelBtn.textContent = 'Cancel';

    footer.appendChild(importBtn);
    footer.appendChild(cancelBtn);

    sheet.appendChild(handle);
    sheet.appendChild(title);
    sheet.appendChild(body);
    sheet.appendChild(footer);

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        requestAnimationFrame(() => {
            sheet.classList.add('open');
        });
    });

    function closeSheet() {
        sheet.classList.remove('open');
        overlay.style.opacity = '0';
        document.body.style.overflow = '';
        setTimeout(() => { sheet.remove(); overlay.remove(); }, 300);
    }
    overlay.addEventListener('click', closeSheet);
    cancelBtn.addEventListener('click', closeSheet);
    importBtn.addEventListener('click', () => {
        if (!selectedSectionId) {
            showToast('Please select a section', 'error');
            return;
        }
        closeSheet();
        importRedditBookmarks(selectedSectionId);
    });
}

function showToast(message, type = 'success') {
    const icons = {
        success: '✓',
        error: '✕',
        info: 'ⓘ',
        warning: '⚠'
    };

    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = icons[type] || icons.info;

    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = message;

    toast.appendChild(icon);
    toast.appendChild(text);
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('toast--visible'), 10);

    setTimeout(() => {
        toast.classList.remove('toast--visible');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

function initiateRedditLogin() {
    window.location.href = `/auth/reddit/start`;
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
    const resultsContainer = document.getElementById('bookmarks-results');

    dragAfterBookmarkId = afterElement ? afterElement.dataset.bookmarkId : null;

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

    draggedElement = null;
    draggedBookmarkId = null;
    draggedSectionId = null;
    dragAfterBookmarkId = undefined;
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
    draggedBookmarkId = null;
    draggedSectionId = null;
    dragAfterBookmarkId = undefined;
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
        rootMargin: '800px', 
        threshold: 0
    });

    // Observe all result cards
    document.querySelectorAll('.result-card').forEach(card => {
        mediaObserver.observe(card);
    });
}

function showErrorWithHeader(message, sectionId, sectionName) {
    const resultsContainer = document.getElementById('bookmarks-results');
    resultsContainer.innerHTML = '';

    // Build header
    const header = document.createElement('div');
    header.className = 'mobile-section-header';
    header.innerHTML = `
        <div class="mobile-section-header-top">
            <div class="mobile-section-header-left">
                <div class="mobile-section-title">${sectionName}</div>
                <div class="mobile-section-count">0 Saves</div>
            </div>
            <div class="mobile-section-header-right">
                <button class="mobile-section-more-btn" title="More">...</button>
                <button class="mobile-section-share-btn" title="Share">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                        <polyline points="16 6 12 2 8 6"/>
                        <line x1="12" y1="2" x2="12" y2="15"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
    resultsContainer.appendChild(header);

    header.querySelector('.mobile-section-more-btn').addEventListener('click', async () => {
        const result = await showSectionMoreMenu(sectionId, sectionName);
        if (!result) return;
        if (result.action === 'rename') await renameSectionById(result.sectionId, result.sectionName);
        else if (result.action === 'delete') await deleteSectionById(result.sectionId, result.sectionName);
    });
    header.querySelector('.mobile-section-share-btn').addEventListener('click', () => showMobileShareSheet());

    // Append error message below header
    const errorDiv = document.createElement('div');
    errorDiv.className = 'results-error';
    errorDiv.innerHTML = `<p>${message}</p>`;
    resultsContainer.appendChild(errorDiv);
    applyStaggeredAnimation('.results-error', 'visible', 60);
}

function showSectionMoreMenu(sectionId, sectionName) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'section-picker-overlay';

        const sheet = document.createElement('div');
        sheet.className = 'section-more-sheet';

        const menuHeader = document.createElement('div');
        menuHeader.className = 'section-more-header';
        menuHeader.innerHTML = `<span class="section-more-title">Section options</span>`;
        sheet.appendChild(menuHeader);

        function closeMenu() {
            sheet.style.transform = 'translateY(100%)';
            overlay.style.opacity = '0';
            setTimeout(() => {
                overlay.remove();
                sheet.remove();
            }, 200);
        }

        const options = [
            { label: 'Rename Section', value: 'rename' },
            { label: 'Delete Section', value: 'delete' },
        ];

        options.forEach(({ label, value }) => {
            const item = document.createElement('div');
            item.className = `section-more-item${value === 'delete' ? ' section-more-item--delete' : ''}`;
            const inner = document.createElement('div');
            inner.className = 'section-more-item-inner';
            inner.textContent = label;
            item.appendChild(inner);
            item.addEventListener('click', () => {
                closeMenu();
                resolve({ action: value, sectionId, sectionName });
            });
            sheet.appendChild(item);
        });

        overlay.addEventListener('click', () => {
            closeMenu();
            resolve(null);
        });

        document.body.appendChild(overlay);
        document.body.appendChild(sheet);

        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            sheet.style.transform = 'translateY(0)';
        });
    });
}

async function showSectionsAntepage(skipHistoryPush = false) {
    showLoading(document.getElementById('bookmarks-results'));

    if (!skipHistoryPush) {
        const url = new URL(window.location);
        url.searchParams.delete('section');
        window.history.pushState({}, '', url);
    }

        const sectionsResponse = await fetch(`${API_BASE}/api/sections/with-previews`, {
        credentials: 'include'
    });
    const sectionsData = await sectionsResponse.json();

    // Build the grid first
    const grid = document.createElement('div');
    grid.className = 'sections-grid';

    for (const section of sectionsData.sections) {
        const card = document.createElement('div');
        card.className = 'section-card section-card-hidden';
        if (section.over_18) card.classList.add('nsfw');
        card.onclick = () => loadSectionContent(section.section_id);
        card.setAttribute('data-permalink', section.permalink);

        if (section.url) {
            const post = {
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
            const domain = getDomainFromUrl(post.url);

            if (post.domain && post.domain.startsWith('self.') && !post.preview) {
                // Text post with no image - show news icon fallback
                const imgWrapper = document.createElement('div');
                imgWrapper.className = 'image-wrapper';

                const newsIcon = document.createElement('div');
                newsIcon.className = 'news-icon-fallback';
                newsIcon.setAttribute('aria-label', 'Text post');
                newsIcon.style.opacity = '0';
                newsIcon.style.transition = 'opacity 0.3s ease-in-out';

                imgWrapper.appendChild(newsIcon);
                card.appendChild(imgWrapper);

                setTimeout(() => {
                    newsIcon.style.opacity = '1';
                }, 10);
            } else {
                const thumbnailURL = getThumbnailUrl(post);

                // Check IndexedDB cache first
                const cachedUrl = await getCachedSectionImage(section.permalink);
                const urlToUse = cachedUrl || thumbnailURL;
                const mediaContainer = createMediaElement(post, urlToUse, domain, card, true);
                card.appendChild(mediaContainer);

                // If not cached, cache it now for next time
                if (!cachedUrl && thumbnailURL) {
                    cacheSectionImage(section.permalink, thumbnailURL);
                }
            }
        } else {
            // Empty section - show news icon fallback
            const imgWrapper = document.createElement('div');
            imgWrapper.className = 'image-wrapper';

            const newsIcon = document.createElement('div');
            newsIcon.className = 'news-icon-fallback';
            newsIcon.setAttribute('aria-label', 'Empty section');
            newsIcon.style.opacity = '0';
            newsIcon.style.transition = 'opacity 0.3s ease-in-out';

            imgWrapper.appendChild(newsIcon);
            card.appendChild(imgWrapper);

            // Fade in news icon
            setTimeout(() => {
                newsIcon.style.opacity = '1';
            }, 10);
        }

        const info = document.createElement('div');
        info.className = 'section-info';
        info.innerHTML = `
    <span class="section-name">${section.section_name}</span>
    <span class="section-save-count">${section.bookmark_count} ${section.bookmark_count == 1 ? 'Save' : 'Saves'}</span>
`;
        card.appendChild(info);
        grid.appendChild(card);
    }

        // Replace loading animation with content
        const resultsContainer = document.getElementById('bookmarks-results');

        resultsContainer.innerHTML = '';
        resultsContainer.appendChild(grid);

    // Set loading to false so interactions work
    isLoading = false;

    // Patch gallery previews
    sectionsData.sections.forEach(section => {
        if (section.is_gallery && section.gallery_data && section.media_metadata) {
            const card = grid.querySelector(`[data-permalink="${section.permalink}"]`);
            if (card) {
                const fullPost = {
                    is_gallery: section.is_gallery,
                    gallery_data: section.gallery_data,
                    media_metadata: section.media_metadata
                };
                tryGalleryPatch(fullPost, section.permalink, card, 1, true);
            }
        }
    });

    // Apply staggered slide-down animation
    applyStaggeredAnimation('.section-card', 'section-card-visible', 50);
}

// Shared content loader
async function loadSharedContent(shareCode, isLoadMore = false) {
    if (isLoading) return;

    const resultsContainer = document.getElementById('bookmarks-results');

    // If not loading more, reset everything
    if (!isLoadMore) {
        currentShareCode = shareCode;
        sharedContentOffset = 0;
        hasMoreSharedContent = false;
        resultsContainer.textContent = '';
        showLoading(document.getElementById('bookmarks-results'));
    }
    isLoading = true;

    try {
        const response = await fetch(`${API_BASE}/api/share/${shareCode}?offset=${sharedContentOffset}&limit=${BOOKMARKS_PER_PAGE}`);
        const data = await response.json();

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
        await displayResults(transformedData, isLoadMore);
        preloadBookmarks();

        if (!isLoadMore && isMobile()) {
buildSharedMobileHeader({ ...data.section, bookmark_count: data.total_count }, resultsContainer);
        }

        // Check if more content exists
        if (data.bookmarks.length < 11) {
            hasMoreSharedContent = false;
        } else {
            sharedContentOffset += 10;
            hasMoreSharedContent = true;
        }

        syncScrollLoader(data.section);

        isLoading = false;

        setTimeout(() => {
            if (!isMobile()) {
                addSectionDropdowns(data.section.id).then(() => {
                    setupDropdownEvents();
                });
            }
            setupMediaVisibilityOptimization();
        }, 150);

    } catch (error) {
        console.error('Shared content fetch failed:', error);
        isLoading = false;
        showError("No bookmarks found in this shared collection.");
    }
}

// Unified loading function for all sections
let mobileSortable = null;
let mobileOrganizeActive = false;

function turnOffMobileOrganize() {
    if (!mobileOrganizeActive) return;
    mobileOrganizeActive = false;
    const btn = document.getElementById('mobileOrganizeBtn');
    if (btn) {
        btn.classList.remove('active');
        const icon = btn.querySelector('.organize-icon');
        if (icon) icon.src = '../assets/icons8-paint-96.png';
    }
    const sectionParam = new URLSearchParams(window.location.search).get('section');
    if (sectionParam) disableMobileOrganize(parseInt(sectionParam));
}

function enableMobileOrganize(sectionId) {
    document.body.setAttribute('data-layout', 'compact');
    localStorage.setItem('mobile-layout', 'compact');

    document.querySelectorAll('.result-card').forEach(card => {
        const handle = document.createElement('div');
        handle.className = 'mobile-drag-handle';
        handle.innerHTML = `<span></span><span></span>`;
        card.classList.add('organize-mode');
        card.prepend(handle);

        handle.addEventListener('touchstart', (e) => mobileDragStart(e, card, sectionId), { passive: false });
    });
}

function disableMobileOrganize(sectionId) {
    document.querySelectorAll('.mobile-drag-handle').forEach(h => h.remove());
    document.querySelectorAll('.result-card').forEach(card => {
        card.classList.remove('organize-mode');
        card.style.transform = '';
        card.style.zIndex = '';
        card.style.position = '';
    });
}

function mobileDragStart(e, card, sectionId) {
    e.preventDefault();

    const touch = e.touches[0];
    const rect = card.getBoundingClientRect();
    const offsetY = touch.clientY - rect.top;

    // Take card out of flow, pin it to screen
    card.style.position = 'fixed';
    card.style.top = `${rect.top}px`;
    card.style.left = `${rect.left}px`;
    card.style.width = `${rect.width}px`;
    card.style.zIndex = '1000';
    card.style.transition = 'none';
    card.style.margin = '0';

    // Insert a placeholder to hold the space
    const placeholder = document.createElement('div');
    placeholder.className = 'mobile-drag-placeholder';
    placeholder.style.height = `${rect.height}px`;
    card.parentNode.insertBefore(placeholder, card);

    let scrollInterval = null;
    let touchInsertBeforeId = undefined;

    function onTouchMove(ev) {
        ev.preventDefault();
        const t = ev.touches[0];
        card.style.top = `${t.clientY - offsetY}px`;

        // Auto-scroll near edges
        const scrollZone = 125;
        const scrollSpeed = 6;
        clearInterval(scrollInterval);
        if (t.clientY < scrollZone) {
            scrollInterval = setInterval(() => window.scrollBy(0, -scrollSpeed), 16);
        } else if (t.clientY > window.innerHeight - scrollZone) {
            scrollInterval = setInterval(() => window.scrollBy(0, scrollSpeed), 16);
        }

        const cards = Array.from(document.querySelectorAll('.result-card'));
        const target = cards.find(c => {
            if (c === card) return false;
            const r = c.getBoundingClientRect();
            return t.clientY >= r.top && t.clientY <= r.bottom;
        });

        if (target) {
            const r = target.getBoundingClientRect();
            if (t.clientY < r.top + r.height / 2) {
                target.parentNode.insertBefore(placeholder, target);
                touchInsertBeforeId = target.dataset.bookmarkId;
            } else {
                target.parentNode.insertBefore(placeholder, target.nextSibling);
                let next = target.nextElementSibling;
                while (next && next.classList.contains('mobile-drag-placeholder')) next = next.nextElementSibling;
                touchInsertBeforeId = next ? next.dataset.bookmarkId : null;
            }
        }
    }

    function cleanup() {
        clearInterval(scrollInterval);
        placeholder.remove();

        card.style.position = '';
        card.style.top = '';
        card.style.left = '';
        card.style.width = '';
        card.style.zIndex = '';
        card.style.transition = '';
        card.style.margin = '';

        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('touchcancel', onTouchCancel);
    }

    function onTouchEnd() {
        placeholder.parentNode.insertBefore(card, placeholder);
        cleanup();

        if (touchInsertBeforeId === undefined) return;

        const arr = sectionBookmarks[sectionId];
        const fromIndex = arr.findIndex(b => b.reddit_post_id === card.dataset.bookmarkId);
        if (fromIndex === -1) return;

        const item = arr.splice(fromIndex, 1)[0];
        const toIndex = touchInsertBeforeId === null
            ? arr.length
            : arr.findIndex(b => b.reddit_post_id === touchInsertBeforeId);
        arr.splice(toIndex === -1 ? arr.length : toIndex, 0, item);

        updateBookmarkOrder(sectionId, arr.map(b => b.reddit_post_id));
    }

    function onTouchCancel() {
        placeholder.parentNode.insertBefore(card, placeholder);
        cleanup();
    }

    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchCancel);
}

function buildMobileSectionHeader(sectionId, name, totalCount, resultsContainer) {
    const existingHeader = document.querySelector('.mobile-section-header');
    if (existingHeader) existingHeader.remove();

    const header = document.createElement('div');
    header.className = 'mobile-section-header';
    header.innerHTML = `
        <div class="mobile-section-header-top">
            <div class="mobile-section-header-left">
                <div class="mobile-section-title">${name}</div>
                <div class="mobile-section-count">${totalCount} ${totalCount === 1 ? 'Save' : 'Saves'}</div>
            </div>
            <div class="mobile-section-header-right">
                <button class="mobile-section-more-btn" title="More">...</button>
                <button class="mobile-section-share-btn" title="Share">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                        <polyline points="16 6 12 2 8 6"/>
                        <line x1="12" y1="2" x2="12" y2="15"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="mobile-section-actions">
            <button class="mobile-section-action-btn" id="mobileOrganizeBtn">
                <img src="../assets/icons8-paint-96.png" class="organize-icon">
                Organize
            </button>
            <button class="mobile-section-action-btn" id="mobileImportBtn">
                <svg viewBox="0 0 24 26" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 13 7 8"/>
                    <line x1="12" y1="1" x2="12" y2="13"/>
                </svg>
                Import
            </button>
            <button class="mobile-section-action-btn" id="mobileSectionInfoBtn">
                <img src="../assets/icons8-tag-96.png" class="info-icon">
                Info
            </button>
        </div>
    `;

    resultsContainer.prepend(header);

    header.querySelector('.mobile-section-share-btn').addEventListener('click', () => showMobileShareSheet());
    mobileOrganizeActive = false;
    const organizeBtn = header.querySelector('#mobileOrganizeBtn');
    organizeBtn.addEventListener('click', () => {
        mobileOrganizeActive = !mobileOrganizeActive;
        organizeBtn.classList.toggle('active', mobileOrganizeActive);
        const organizeIcon = organizeBtn.querySelector('.organize-icon');
        if (organizeIcon) organizeIcon.src = mobileOrganizeActive ? '../assets/icons8-paint-96_white.png' : '../assets/icons8-paint-96.png';
        if (mobileOrganizeActive) {
            enableMobileOrganize(sectionId);
        } else {
            disableMobileOrganize(sectionId);
        }
    });
    header.querySelector('#mobileImportBtn').addEventListener('click', () => showMobileImportDialog());
    header.querySelector('#mobileSectionInfoBtn').addEventListener('click', () => showSectionInfo());
    header.querySelector('.mobile-section-more-btn').addEventListener('click', async () => {
        const result = await showSectionMoreMenu(sectionId, name);
        if (!result) return;
        if (result.action === 'rename') await renameSectionById(result.sectionId, result.sectionName);
        else if (result.action === 'delete') await deleteSectionById(result.sectionId, result.sectionName);
    });
}

async function fetchSectionData(sectionId, offset) {
    const response = await fetch(
        `${API_BASE}/api/bookmarks/section/${sectionId}?offset=${offset}&limit=${BOOKMARKS_PER_PAGE}`,
        { credentials: 'include' }
    );
    const rawText = await response.text();
    return JSON.parse(rawText);
}

function normalizeBookmark(bookmark) {
    return {
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
    };
}

async function renderSectionContent(sectionId, bookmarksToRender, sectionMeta, isLoadMore) {
    const resultsContainer = document.getElementById('bookmarks-results');
    const { mobileSectionName, totalCount } = sectionMeta;

    const transformedData = {
        data: {
            children: bookmarksToRender.map(b => ({ data: normalizeBookmark(b) }))
        }
    };

    await displayResults(transformedData, isLoadMore);

    // Scroll to top on fresh load (all devices)
    if (!isLoadMore) window.scrollTo(0, 0);

    // Mobile: section header
    if (!isLoadMore && isMobile()) {
        window.scrollTo(0, 0);
        buildMobileSectionHeader(sectionId, mobileSectionName, totalCount, resultsContainer);
    }

    // Mobile organize mode: attach drag handles to any newly rendered cards
    if (mobileOrganizeActive) {
        setTimeout(() => {
            document.querySelectorAll('.result-card:not(.organize-mode)').forEach(card => {
                const handle = document.createElement('div');
                handle.className = 'mobile-drag-handle';
                handle.innerHTML = `<span></span><span></span>`;
                card.classList.add('organize-mode');
                card.prepend(handle);
                handle.addEventListener('touchstart', (e) => mobileDragStart(e, card, sectionId), { passive: false });
            });
        }, 300);
    }

    // Sync saved bookmark icon states from session
    const existingBookmarks = JSON.parse(sessionStorage.getItem('bookmarks') || '{}');
    document.querySelectorAll('.bookmark-icon').forEach(icon => {
        const postId = icon.dataset.postId;
        icon.classList.toggle('saved', !!existingBookmarks[postId]);
    });
}

// 4. After-render: desktop wiring + scroll indicator. Runs after DOM has settled.
function afterSectionRender(sectionId) {
    if (!isMobile()) {
        setTimeout(() => {
            makeBookmarksDraggable(sectionId);
            addSectionDropdowns().then(() => {
                setupDropdownEvents();
            });
            setupMediaVisibilityOptimization();
        }, 150);
    }

}

function syncScrollLoader(sectionId) {
    let indicator = document.querySelector('.scroll-container-minimal');
    if (!indicator) {
        const resultsContainer = document.getElementById('bookmarks-results');
        if (!resultsContainer) return;
        resultsContainer.insertAdjacentHTML('afterend', `
            <div class="scroll-container-minimal" style="display:none;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>
        `);
        indicator = document.querySelector('.scroll-container-minimal');
    }
    if (hasMoreBookmarks[sectionId] || hasMoreSharedContent) {
        if (!isMobile()) indicator.style.display = 'flex';
    } else {
        indicator.style.display = 'none';
    }
}

async function loadSectionContent(sectionId, isLoadMore = false, fromPopstate = false) {
    if (isLoading) return;

    const resultsContainer = document.getElementById('bookmarks-results');

    if (!isLoadMore) {
        sectionOffsets[sectionId] = 0;
        hasMoreBookmarks[sectionId] = false;
        resultsContainer.textContent = '';
        const scrollIndicator = document.querySelector('.scroll-container-minimal');
        if (scrollIndicator) scrollIndicator.style.display = 'none';
        showLoading(resultsContainer);
    }

    isLoading = true;

    try {
        const data = await fetchSectionData(sectionId, sectionOffsets[sectionId]);

        // Update URL
        if (!isLoadMore && !fromPopstate) {
            const url = new URL(window.location);
            url.searchParams.set('section', sectionId);
            window.history.pushState({}, '', url);
        }

        const mobileSectionName = data.name || 'Bookmarks';
        const totalCount = data.total_count || 0;

        // Empty section
        if (!data.bookmarks || data.bookmarks.length === 0) {
            hasMoreBookmarks[sectionId] = false;
            if (!isLoadMore) {
                if (isMobile()) {
                    showErrorWithHeader(
                        "No bookmarks found. Start saving posts or import from Reddit to see them here.",
                        sectionId,
                        mobileSectionName
                    );
                    buildMobileSectionHeader(sectionId, mobileSectionName, totalCount, resultsContainer);
                    window.scrollTo(0, 0);
                } else {
                    showError("No bookmarks found. Start saving posts or import from Reddit to see them here.");
                }
            }
            isLoading = false;
            return;
        }

        let bookmarksToRender;
        if (isLoadMore && sectionBookmarks[sectionId]) {
            const existingIds = new Set(sectionBookmarks[sectionId].map(b => b.reddit_post_id));
            const newBookmarks = data.bookmarks.filter(b => !existingIds.has(b.reddit_post_id));
            sectionBookmarks[sectionId] = sectionBookmarks[sectionId].concat(newBookmarks);
            bookmarksToRender = newBookmarks.slice(0, 10);
        } else {
            sectionBookmarks[sectionId] = data.bookmarks;
            bookmarksToRender = sectionBookmarks[sectionId].slice(0, Math.min(sectionBookmarks[sectionId].length, 10));
        }

        await renderSectionContent(sectionId, bookmarksToRender, { mobileSectionName, totalCount }, isLoadMore);
        afterSectionRender(sectionId);

        // Update pagination state
        if (data.bookmarks.length < 11) {
            hasMoreBookmarks[sectionId] = false;
        } else {
            sectionOffsets[sectionId] += 10;
            hasMoreBookmarks[sectionId] = true;
        }

        syncScrollLoader(sectionId);

        isLoading = false;
    } catch (error) {
        console.error('Bookmark fetch failed:', error);
        isLoading = false;
        showError("Failed to load bookmarks");
    }
}

function buildSharedMobileHeader(sectionData, resultsContainer) {
    const existingHeader = document.querySelector('.mobile-section-header');
    if (existingHeader) existingHeader.remove();

    const header = document.createElement('div');
    header.className = 'mobile-section-header';
    header.innerHTML = `
        <div class="mobile-section-header-top">
            <div class="mobile-section-header-left">
                <div class="mobile-section-title">${sectionData.name}</div>
                <div class="mobile-section-count">${sectionData.bookmark_count} ${sectionData.bookmark_count === 1 ? 'Save' : 'Saves'}</div>
            </div>
            <div class="mobile-section-header-right">
                <button class="mobile-section-action-btn" id="sharedInfoBtn">
                    <img src="../assets/icons8-tag-96.png" class="info-icon">
                    Info
                </button>
                <button class="mobile-section-share-btn" title="Share">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                        <polyline points="16 6 12 2 8 6"/>
                        <line x1="12" y1="2" x2="12" y2="15"/>
                    </svg>
                </button>
            </div>
        </div>
    `;

    resultsContainer.prepend(header);

    header.querySelector('#sharedInfoBtn').addEventListener('click', () => showSectionInfo());
    header.querySelector('.mobile-section-share-btn').addEventListener('click', () => showMobileShareSheet());
}

// Initialize when switching to bookmarks tab on mobile
window.addEventListener('bookmarks-tab-init', () => {
    if (isMobile()) initBookmarks();
});