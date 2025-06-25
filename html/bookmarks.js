let currentOffset = 0;
const hasMoreBookmarks = {};
let sectionBookmarks = {
    1: [], // Main bookmarks section
    2: []  // New section
};
const BOOKMARKS_PER_PAGE = 10;
window.stripeCustomerId = "cus_ABC123";

// Use a separate offset for each section so scrolling works for both tabs
const sectionOffsets = {};

window.addEventListener('load', function () {
    window.scrollTo(0, 0);
});

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('page') === 'bookmarks') {
    document.title = "Bookmarks";
    document.querySelector('meta[name="description"]').content = "Your saved Reddit posts";
    document.querySelector('meta[property="og:title"]').content = "Bookmarks - KarmaFinder";
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

function getCurrentUserId() {
    return window.stripeCustomerId;
}

// Basic initialization function for bookmarks page
function initBookmarks() {
    console.log("🔖 Loading bookmarks...");

    createContextMenu();
    setupContextMenuHandlers();
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
        newTabElement.textContent = tab.name;
        newTabElement.dataset.tabId = tab.id;
        newTabElement.dataset.sortOrder = tab.sort_order;
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
        const response = await fetch(`http://localhost:3000/api/sections/${stripeCustomerId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        await insertTabsUI(data.sections);
    } catch (error) {
        console.error('Failed to load sections:', error);
    }
}

// Create New Section button
async function createNewSection() {
    try {
        const stripeCustomerId = getCurrentUserId(); 

        const response = await fetch(`http://localhost:3000/api/sections/${stripeCustomerId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: 'New Section'
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('New section created:', data.section);

            // Create new tab element
            const newTab = document.createElement('div');
            newTab.className = 'tab';
            newTab.textContent = 'New Section';

            // Insert before the + button
            const addButton = document.querySelector('.add-section-btn');
            addButton.parentNode.insertBefore(newTab, addButton);
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
            // Don't reload if this tab is already active
            if (this.classList.contains('active')) {
                return;
            }

            // Remove active class from all tabs
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            this.classList.add('active');

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
            const sortOrder = parseInt(this.dataset.sortOrder);
            console.log(`🔢 Switching to section ${sortOrder}...`);
            loadSectionContent(sectionId);

            // URL update
            const url = new URL(window.location);
            url.searchParams.set('section', sectionId);
            window.history.pushState({}, '', url);
        });

        // Double-click listener
        tab.addEventListener('dblclick', function (e) {
            e.preventDefault();
            handleRename(index, this.textContent.trim());
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
                const newName = prompt('Enter new section name:');
                if (newName && newName.trim() !== '') {
                    const sectionId = contextMenu.dataset.currentSectionId;
                    const userId = getCurrentUserId(); 

                    try {
                        const response = await fetch(`http://localhost:3000/api/sections/${userId}/${sectionId}`, {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ name: newName })
                        });

                        const data = await response.json();
                        if (data.success) {
                            // Update the tab name in the UI
                            const tab = document.querySelector(`[data-tab-id="${sectionId}"]`);
                            if (tab) {
                                tab.textContent = newName;
                                console.log(`Renamed section to: ${newName}`);
                            }
    
                        } else {
                            alert('Failed to rename section: ' + (data.error || 'Unknown error'));
                        }
                    } catch (error) {
                        console.error('Error renaming section:', error);
                        alert('Failed to rename section');
                    }
                }
            } else if (action === 'delete') {
                if (confirm('Delete this section? This will permanently delete the section bookmarks.')) {
                    const sectionId = contextMenu.dataset.currentSectionId;
                    const userId = getCurrentUserId(); 

                    fetch(`http://localhost:3000/api/sections/${userId}/${sectionId}`, {
                        method: 'DELETE'
                    })
                        .then(res => res.json())
                        .then(data => {
                            console.log('✅ Deleted:', data);
                            initializeTabs(); 
                            loadSectionContent(1, false);
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

// Rename function that handles double-click and context menu
async function handleRename(tabIndex) {
    const tabs = document.querySelectorAll('.tab');
    const tab = tabs[tabIndex];
    if (!tab) return;

    // Store original text in case user cancels
    const originalText = tab.textContent.trim();

    // Make tab editable
    tab.contentEditable = true;
    tab.focus();

    // Select all text
    const range = document.createRange();
    range.selectNodeContents(tab);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // Add editing class for subtle highlight
    tab.classList.add('editing');

    // Handle when user finishes editing
    async function finishEditing() {
        tab.contentEditable = false;
        tab.classList.remove('editing');

        const newText = tab.textContent.trim();

        if (newText === '' || newText === originalText) {
            // Restore original text if empty or unchanged
            tab.textContent = originalText;
            return;
        }

        // Update with new name and make API call
        console.log(`Renamed section to: ${newText}`);

        const sectionId = tab.dataset.tabId;
        const userId = getCurrentUserId();

        try {
            const response = await fetch(`http://localhost:3000/api/sections/${userId}/${sectionId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: newText })
            });

            const data = await response.json();

            if (data.success) {
                // Success - keep the new name
                tab.textContent = newText;

                // Clear sections cache if you have one
                if (typeof invalidateSectionsCache === 'function') {
                    invalidateSectionsCache();
                }
            } else {
                // Revert on failure
                tab.textContent = originalText;
                alert('Failed to rename section: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error renaming section:', error);
            tab.textContent = originalText;
            alert('Failed to rename section');
        }
    }

    // Listen for Enter key or blur (click away)
    function handleKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            tab.blur();
        } else if (e.key === 'Escape') {
            tab.textContent = originalText;
            tab.blur();
        }
    }

    tab.addEventListener('blur', finishEditing, { once: true });
    tab.addEventListener('keydown', handleKeydown);

    // Remove keydown listener when done
    tab.addEventListener('blur', () => {
        tab.removeEventListener('keydown', handleKeydown);
    }, { once: true });
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
        initializeTabs();
    }
});

function positionScrollIndicator() {
    const indicator = document.querySelector('.scroll-container-minimal');
    if (!indicator) return;

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
    indicator.style.top = (documentHeight - 300) + 'px';
    indicator.style.left = '50%';
    indicator.style.transform = 'translateX(-50%)';
    
    // Get active section
    const activeTab = document.querySelector('.tab.active');
    if (!activeTab) {
        indicator.style.display = 'none';
        return;
    }
    const sectionId = activeTab.dataset.tabId;

    // Check section-specific hasMoreBookmarks
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('page') === 'bookmarks' && hasMoreBookmarks[sectionId]) {
        indicator.style.display = 'flex';
    } else {
        indicator.style.display = 'none';
    }
}

// Add this function after your existing functions
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

    // Get the new position and section ID
    const allCards = Array.from(document.querySelectorAll('.result-card'));
    const newIndex = allCards.indexOf(draggedElement);
    const sectionId = parseInt(draggedElement.dataset.sectionId);

    // Find the current index in the sectionBookmarks array by matching the bookmark ID
    const draggedBookmarkId = draggedElement.dataset.bookmarkId;
    const currentIndex = sectionBookmarks[sectionId].findIndex(bookmark =>
        bookmark.reddit_post_id === draggedBookmarkId
    );

    // Reorder the section-specific bookmarks array
    const draggedBookmark = sectionBookmarks[sectionId].splice(currentIndex, 1)[0];
    sectionBookmarks[sectionId].splice(newIndex, 0, draggedBookmark);

    // Update the backend with new order
    updateBookmarkOrder(sectionId);

    console.log(`Moved bookmark from position ${currentIndex} to ${newIndex} in section ${sectionId}`);
}

function getDragAfterElement(y) {
    const draggableElements = [...document.querySelectorAll('.result-card:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Function to update bookmark order in backend
function updateBookmarkOrder(sectionId) {
    const userId = window.stripeCustomerId;
    const orderedIds = sectionBookmarks[sectionId].map(bookmark => bookmark.reddit_post_id);

    fetch(`http://localhost:3000/api/bookmarks/${userId}/reorder`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            orderedIds,
            sectionId: sectionId 
        })
    })
        .then(response => response.json())
        .then(data => {
            console.log(`✅ Bookmark order updated successfully for section ${sectionId}`);
        })
        .catch(error => {
            console.error(`❌ Error updating bookmark order for section ${sectionId}:`, error);
        });
}

async function addSectionDropdowns() {
    const stripeCustomerId = window.stripeCustomerId;
    let userSections = [];
    try {
        const response = await fetch(`http://localhost:3000/api/sections/${stripeCustomerId}`);
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

        // Build section options dynamically, excluding the current section
        const sectionOptions = userSections
            .filter(section => section.id != currentSectionId)
            .map(section =>
                `<div class="section-option" data-section-id="${section.id}">${section.name}</div>`
            ).join('');

        dropdown.innerHTML = `
            <button class="section-selector">
                Bookmarks <svg width="20" height="20" viewBox="0 0 25 25" fill="none" stroke="currentColor" stroke-width="1.5">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </button>
            <div class="section-dropdown">
                ${sectionOptions}
                <div class="section-option create-new" data-section-id="create">+ Create New Section</div>
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

            fetch(`http://localhost:3000/api/bookmarks/${bookmarkId}/section`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sectionId: sectionId })
            })
                .then(response => response.json())
                .then(data => {
                    console.log('Bookmark moved:', data);
                    if (isMovingToADifferentSection) {
            
                        // Wait a bit for the section move to complete, then reorder
                        setTimeout(() => {
                            const userId = window.stripeCustomerId;
                            fetch(`http://localhost:3000/api/bookmarks/${userId}/section/${sectionId}?offset=0&limit=100`)
                                .then(response => response.json())
                                .then(sectionData => {
                                    const allIds = sectionData.bookmarks.map(b => b.reddit_post_id);
                                    const filteredIds = allIds.filter(id => id !== bookmarkId);
                                    const orderedIds = [bookmarkId, ...filteredIds];
                                    console.log('Moving bookmark:', bookmarkId);
                                    console.log('Existing IDs:', allIds);
                                    console.log('Final ordered IDs:', orderedIds);

                                    return fetch(`http://localhost:3000/api/bookmarks/${userId}/reorder`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                            orderedIds,
                                            sectionId: sectionId
                                        })
                                    });
                                })
                                .then(response => response.json()) // <- Add this
                                .then(reorderResult => {           // <- And this
                                    console.log('Reorder result:', reorderResult);
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

let autoScrollInterval = null;

function handleDragOver(e) {
    e.preventDefault();

    // Auto-scroll logic
    const scrollThreshold = 100; // pixels from edge
    const scrollSpeed = 20;
    
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

// Unified loading function for both sections
function loadSectionContent(sectionId, isLoadMore = false) {

    if (isLoading) return;
    const resultsContainer = document.querySelector('.results-container');
    const userId = window.stripeCustomerId;

    // If not loading more, reset the offset for this section
    if (!isLoadMore) {
        sectionOffsets[sectionId] = 0;
        hasMoreBookmarks[sectionId] = true;
        resultsContainer.textContent = '';
        showError("Loading bookmarks...");
    }

    isLoading = true;

    // Fetch bookmarks with pagination using the correct offset for this section
    fetch(`http://localhost:3000/api/bookmarks/${userId}/section/${sectionId}?offset=${sectionOffsets[sectionId]}&limit=${BOOKMARKS_PER_PAGE}`)
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

                // Always show all loaded bookmarks for the section
                const bookmarksToTransform = isLoadMore ? data.bookmarks : sectionBookmarks[sectionId]; // Only new ones when loading more
                const transformedData = {
                    data: {
                        children: bookmarksToTransform.map(bookmark => ({
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
                    positionScrollIndicator();
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

                // Increase the offset for this section by 10
                if (data.bookmarks.length < 10) {
                    hasMoreBookmarks[sectionId] = false;
                } else {
                    sectionOffsets[sectionId] += 10;
                    hasMoreBookmarks[sectionId] = true;
                }

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