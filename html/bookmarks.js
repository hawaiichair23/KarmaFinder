let currentOffset = 0;
let hasMoreBookmarks = true;

// Basic initialization function for bookmarks page
function initBookmarks() {
    console.log("Bookmarks initialized!");

    // Create and insert the tabs UI
    insertTabsUI();

    // Set up tab switching behavior
    setupTabEvents();

    // Load initial bookmarked content
    loadBookmarkedContent();
}

// Function to create and insert the tabs UI
function insertTabsUI() {
    // HTML for the tabs
    const tabsHTML = `
    <div class="tabs-section">
      <div class="tab-container">
        <div class="tab active">Bookmarks</div>
        <div class="tab">New Section1</div>
      </div>
      <div class="tab-line"></div>
    </div>
  `;

    // WHERE THE TAB IS BEING INSERTED
    const contentContainer = document.querySelector('.results-container');

    // Insert tabs before the main content
    if (contentContainer) {
        contentContainer.insertAdjacentHTML('beforebegin', tabsHTML);
        
    } else {
        console.error("Couldn't find content container to insert tabs");
    }
}

// Function to set up tab event listeners
function setupTabEvents() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function () {
            // Remove active class from all tabs
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

            // Add active class to clicked tab
            this.classList.add('active');

            // Handle content switching based on tab
            if (this.textContent === 'Bookmarks') {
                loadBookmarkedContent();
            } else if (this.textContent === 'New Section1') {
                loadNewSectionContent();
            }
        });
    });
}

// Function to load bookmarked content
function loadBookmarkedContent() {
    console.log("Loading bookmarked content...");
    // This will be implemented later - for now just a placeholder
}

// Function to load New Section content
function loadNewSectionContent() {
    console.log("Loading New Section content...");
    // This will be implemented later - for now just a placeholder
}

// Check if we're on bookmarks page when document loads
document.addEventListener('DOMContentLoaded', function () {
    // Check for bookmarks parameter in URL
    const urlParams = new URLSearchParams(window.location.search);
    const page = urlParams.get('page');

    if (page === 'bookmarks') {
        console.log("Bookmarks page detected!");
        initBookmarks();
    }
});

// Function to apply staggered animation to elements
function applyStaggeredAnimation(selector, classToAdd, delayBetween = 30) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((element, index) => {
        setTimeout(() => {
            requestAnimationFrame(() => {
                element.classList.add(classToAdd);
            });
        }, index * delayBetween);
    });
}