let currentOffset = 0;
let hasMoreBookmarks = true;
window.loadBookmarkedContent = loadBookmarkedContent;

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('page') === 'bookmarks') {
    document.title = "Bookmarks";
    document.querySelector('meta[name="description"]').content = "Your saved Reddit posts";
    document.querySelector('meta[property="og:title"]').content = "Bookmarks - KarmaFinder";
}
// Basic initialization function for bookmarks page
function initBookmarks() {

        console.log("🔖 Loading bookmarks...");

    // Create and insert the tabs UI
    insertTabsUI();

    // Set up tab switching behavior
    setupTabEvents();
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

function loadBookmarkedContent() {
    const resultsContainer = document.querySelector('.results-container');
    resultsContainer.textContent = '';
    const userId = window.stripeCustomerId;

    if (!userId) {
        resultsContainer.innerHTML = '<div class="no-bookmarks">Please log in to view bookmarks</div>';
        return;
    }

    // Show loading state
    resultsContainer.innerHTML = '<div class="loading">Loading bookmarks...</div>';

    // Fetch bookmarks with all post data
    fetch(`http://localhost:3000/api/bookmarks/${userId}`)
        .then(response => response.text()) // Get as text first
        .then(rawText => {
 
            // Try to parse
            const data = JSON.parse(rawText);
            // console.log('Parsed successfully:', data);
            
            resultsContainer.textContent = ''; // Clear loading

            if (data.bookmarks && data.bookmarks.length > 0) {
                // Transform bookmarks to match Reddit API format for displayResults
                const transformedData = {
                    data: {
                        children: data.bookmarks.map(bookmark => ({
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

                // Use your existing displayResults function!
                displayResults(transformedData);

            } else {
                resultsContainer.innerHTML = '<div class="no-bookmarks">No bookmarks found. Start bookmarking posts to see them here!</div>';
            }
        })
        .catch(error => {
            console.error('Error loading bookmarks:', error);
            resultsContainer.innerHTML = showError("Error loading bookmarks. Please try again.");
        });
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