function tryGalleryPatch(fullPost, permalink, resultCard, attempt = 1, skipNavigation = false) {
    const galleryData = fullPost.gallery_data?.items;
    const mediaMetadata = fullPost.media_metadata;

    // Don't proceed if essential pieces are missing
    if (!galleryData || !mediaMetadata || !resultCard) {
        if (!resultCard && attempt < 5) {
            setTimeout(() => tryGalleryPatch(fullPost, permalink, resultCard, attempt + 1), 100);
        }
        return;
    }

    const imgContainer = resultCard.querySelector('.img-container');
    const imgWrapper = resultCard.querySelector('.image-wrapper');
    if (!imgContainer || !imgWrapper) {
        return;
    }

    // Send gallery data to modal
    imgWrapper.galleryData = galleryData;
    imgWrapper.mediaMetadata = mediaMetadata;
    imgWrapper.currentIndex = 0;

    const { useSameSize: analyzedUseSameSize } = analyzeGalleryAspectRatios(galleryData, mediaMetadata);
    const isMobileGallery = window.innerWidth <= 1024;
    const useSameSize = isMobileGallery ? true : analyzedUseSameSize;
    imgWrapper.useSameSize = useSameSize;

    // Initialize gallery state
    let currentIndex = 0;
    const totalImages = galleryData.length;
    const preloadedImages = {};
    imgWrapper.preloadedImages = preloadedImages;
    let navigationSequence = 0;

    // Add gallery navigation elements
    if (!skipNavigation && !imgWrapper.querySelector('.gallery-nav')) {
        // Make image-wrapper relative for absolute positioning
                imgWrapper.style.position = 'relative';
        imgWrapper.style.touchAction = 'pan-y';

        // Create navigation container
        const navContainer = document.createElement('div');
        navContainer.className = 'gallery-nav';

        // Left arrow
        const leftArrow = document.createElement('button');
        const isMobile = window.innerWidth <= 1024;
        const size = isMobile ? '46px' : '28px';

        leftArrow.className = 'gallery-arrow gallery-arrow-left';
        leftArrow.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none">
        <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
`;
        leftArrow.style.cssText = `
    position: absolute;
    left: 2px;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.5);
    color: white;
    border: none;
    width: ${size};
    height: ${size};
    border-radius: 50%;
    cursor: pointer;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    
`;

        // Right arrow
        const rightArrow = document.createElement('button');
        rightArrow.className = 'gallery-arrow gallery-arrow-right';
        rightArrow.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none">
        <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
`;
        rightArrow.style.cssText = `
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.5);
    color: white;
    border: none;
    width: ${size};
    height: ${size};
    border-radius: 50%;
    cursor: pointer;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
`;

        // Counter
        const counter = document.createElement('div');
        counter.className = 'gallery-counter';
        counter.style.cssText = `
            position: absolute;
            top: 3px;
            right: 3px;
            background: rgba(0, 0, 0, 0.5);
            color: white;
            padding: 4px 8px;
            border-radius: 10px;
            font-size: 0.8rem;
            font-weight: bold;
            z-index: 10;
        `;

        // Update counter function
        const updateCounter = () => {
            counter.textContent = `${currentIndex + 1}/${totalImages}`;
        };

        const preloadNextImage = (index) => {
            if (!preloadedImages[index]) {
                const item = galleryData[index];
                const mediaId = item.media_id;
                const media = mediaMetadata[mediaId];
                const isAnimated = media?.e === 'AnimatedImage';
                const original = isAnimated
                    ? (media?.s?.gif || media?.s?.mp4)?.replace(/&amp;/g, '&')
                    : media?.s?.u?.replace(/&amp;/g, '&');
                const resolutionFallback = media?.p?.[media.p.length - 1]?.u?.replace(/&amp;/g, '&');
                const imageUrl = original || resolutionFallback;

                if (imageUrl) {
                    const proxyUrl = `${IMAGE_PROXY_BASE}/image?url=${encodeURIComponent(imageUrl)}`;
                    preloadedImages[index] = fetch(proxyUrl)
                        .then(r => r.blob())
                        .then(blob => createImageBitmap(blob))
                        .catch(() => null);
                }
            }
        };

        const preloadAllImages = () => {
            // Preload 2 back, current, and 5 forward
            for (let i = -2; i <= 5; i++) {
                const index = (currentIndex + i + totalImages) % totalImages;
                if (!preloadedImages[index]) {
                    const item = galleryData[index];
                    const mediaId = item.media_id;
                    const media = mediaMetadata[mediaId];
                    const isAnimated = media?.e === 'AnimatedImage';
                    const original = isAnimated
                        ? (media?.s?.gif || media?.s?.mp4)?.replace(/&amp;/g, '&')
                        : media?.s?.u?.replace(/&amp;/g, '&');
                    const resolutionFallback = media?.p?.[media.p.length - 1]?.u?.replace(/&amp;/g, '&');
                    const imageUrl = original || resolutionFallback;

                    if (imageUrl) {
                        const proxyUrl = `${IMAGE_PROXY_BASE}/image?url=${encodeURIComponent(imageUrl)}`;
                        preloadedImages[index] = fetch(proxyUrl)
                            .then(r => r.blob())
                            .then(blob => createImageBitmap(blob))
                            .catch(() => null);
                    }
                }
            }
        };

        const navigateGallery = (direction) => {
            navigationSequence++;
            const thisNavigationId = navigationSequence;

            const resultImg = resultCard.querySelector('img.result-image');
            const imgWrapper = resultCard.querySelector('.image-wrapper');

            if (!resultImg || !imgWrapper) {
                return;
            }

            const targetIndex = direction === 'prev'
                ? (currentIndex > 0 ? currentIndex - 1 : totalImages - 1)
                : (currentIndex < totalImages - 1 ? currentIndex + 1 : 0);

            const mediaId = galleryData[targetIndex].media_id;
            const media = mediaMetadata[mediaId];
            const isAnimated = media?.e === 'AnimatedImage';
            const original = isAnimated
                ? (media?.s?.gif || media?.s?.mp4)?.replace(/&amp;/g, '&')
                : media?.s?.u?.replace(/&amp;/g, '&');
            const resolutionFallback = media?.p?.[media.p.length - 1]?.u?.replace(/&amp;/g, '&');
            const imageUrl = original || resolutionFallback;

            if (!imageUrl) {
                return;
            }

            const newImg = new Image();
            newImg.className = 'result-image';
            newImg.navigationId = thisNavigationId;

            const isComfyMode = document.body.classList.contains('comfy-mode');

            if (useSameSize && isComfyMode && imgWrapper.comfyFirstWidth && imgWrapper.comfyFirstHeight) {
                newImg.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: ${imgWrapper.comfyFirstWidth}px !important;
        height: ${imgWrapper.comfyFirstHeight}px !important;
        object-fit: cover;
        transform: ${direction === 'prev' ? 'translateX(-100%)' : 'translateX(100%)'};
        transition: transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.2s ease-in-out;
        opacity: 0;
    `;
            } else {
                newImg.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: auto;
        object-fit: cover;
        transform: ${direction === 'prev' ? 'translateX(-100%)' : 'translateX(100%)'};
        transition: transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.2s ease-in-out;
        opacity: 0;
    `;
            }

            Array.from(imgWrapper.children).forEach(child => {
                if (child.classList.contains('result-image') && child !== resultImg) {
                    child.remove();
                }
            });

            imgWrapper.appendChild(newImg);

            const finalizeImageTransition = () => {
                if (thisNavigationId !== navigationSequence) {
                    newImg.remove();
                    return;
                }

                currentIndex = targetIndex;
                updateCounter();

                newImg.offsetHeight;

                // Start new image's slide-in and fade-in
                newImg.style.transform = 'translateX(0)';
                newImg.style.opacity = '1';

                // Start old image's slide-out and fade-out
                resultImg.style.transform = direction === 'prev' ? 'translateX(100%)' : 'translateX(-100%)';
                resultImg.style.opacity = '0';
                resultImg.style.transition = 'transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.2s ease-in-out';

                // This timeout removes the OLD image after its transition.
                setTimeout(() => {
                    if (thisNavigationId === navigationSequence && resultImg && resultImg.parentNode) {
                        resultImg.remove();
                    }
                }, 450);

                setTimeout(() => {
                    if (thisNavigationId === navigationSequence) {
                        newImg.style.position = '';
                        newImg.style.top = '';
                        newImg.style.left = '';
                        newImg.style.transition = '';

                        const isMobile = window.innerWidth <= 1024;
                        const isCompact = document.body.getAttribute('data-layout') === 'compact';
                        if (!isCompact && useSameSize && isMobile && imgWrapper.comfyFirstWidth && imgWrapper.comfyFirstHeight) {
                            newImg.style.width = imgWrapper.comfyFirstWidth + 'px';
                            newImg.style.height = imgWrapper.comfyFirstHeight + 'px';
                            newImg.style.objectFit = 'cover';
                        }
                    }
                }, 450);
            };

            // Use preloaded bitmap if available, otherwise fall back to network load
            if (preloadedImages[targetIndex]) {
                preloadedImages[targetIndex].then(bitmap => {
                    if (thisNavigationId !== navigationSequence) {
                        newImg.remove();
                        return;
                    }
                    if (bitmap) {
                        const canvas = document.createElement('canvas');
                        canvas.width = bitmap.width;
                        canvas.height = bitmap.height;
                        canvas.getContext('2d').drawImage(bitmap, 0, 0);
                        newImg.src = canvas.toDataURL();
                        canvas.remove();
                    } else {
                        const proxyUrl = `${IMAGE_PROXY_BASE}/image?url=${encodeURIComponent(imageUrl)}`;
                        newImg.src = proxyUrl;
                    }
                    finalizeImageTransition();
                });
            } else {
                // Fallback to loading on-demand
                const proxyUrl = `${IMAGE_PROXY_BASE}/image?url=${encodeURIComponent(imageUrl)}`;

                newImg.onload = () => {
                    if (thisNavigationId !== navigationSequence) {
                        newImg.remove();
                        return;
                    }
                    finalizeImageTransition();
                };
                newImg.onerror = () => {
                    if (thisNavigationId === navigationSequence) {
                        newImg.remove();
                    }
                };
                newImg.src = proxyUrl;
            }

            if (direction === 'next') {
                const preloadIndex = (targetIndex + 6) % totalImages;
                preloadNextImage(preloadIndex);
            } else {
                const preloadIndex = (targetIndex - 3 + totalImages) % totalImages;
                preloadNextImage(preloadIndex);
            }
        };

        // Throttling variables
        let lastNavigationTime = 0;
        const THROTTLE_DELAY = 70; // 70ms delay

        leftArrow.addEventListener('click', (e) => {
            e.stopPropagation();
            const now = Date.now();
            if (now - lastNavigationTime >= THROTTLE_DELAY) {
                lastNavigationTime = now;
                navigateGallery('prev');
            }
        });

        leftArrow.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                const now = Date.now();
                if (now - lastNavigationTime >= THROTTLE_DELAY) {
                    lastNavigationTime = now;
                    navigateGallery('prev');
                }
            }
        });

        rightArrow.addEventListener('click', (e) => {
            e.stopPropagation();
            const now = Date.now();
            if (now - lastNavigationTime >= THROTTLE_DELAY) {
                lastNavigationTime = now;
                navigateGallery('next');
            }
        });

        rightArrow.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                const now = Date.now();
                if (now - lastNavigationTime >= THROTTLE_DELAY) {
                    lastNavigationTime = now;
                    navigateGallery('next');
                }
            }
        });

        let touchStartX = 0;
        let touchStartY = 0;
        let currentTranslate = 0;
        let prevTranslate = 0;
        let isDragging = false;
        let animationID = 0;
        const SWIPE_THRESHOLD = 90;
        
        imgWrapper.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartTime = Date.now();
            isDragging = true;
            animationID = requestAnimationFrame(animation);
            imgWrapper.style.cursor = 'grabbing';
        });
        
        imgWrapper.addEventListener('touchmove', (e) => {
            if (isDragging) {
                const currentX = e.touches[0].clientX;
                const currentY = e.touches[0].clientY;
                const diffX = Math.abs(currentX - touchStartX);
                const diffY = Math.abs(currentY - touchStartY);
        
                // Only prevent scroll if swiping more horizontally than vertically
                if (diffX > diffY) {
                    e.preventDefault();
                    currentTranslate = prevTranslate + currentX - touchStartX;
                } else {
                    // Vertical scroll - cancel drag
                    isDragging = false;
                    cancelAnimationFrame(animationID);
                }
            }
                }, { passive: false });
        
        imgWrapper.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].clientX;
            const swipeDistance = touchEndX - touchStartX;

            cancelAnimationFrame(animationID);
            isDragging = false;

            if (Math.abs(swipeDistance) > SWIPE_THRESHOLD) {
                if (swipeDistance > 0) {
                    navigateGallery('prev');
                } else {
                    navigateGallery('next');
                }
            }

            prevTranslate = currentTranslate = 0;
            imgWrapper.style.cursor = 'grab';
        });

        function animation() {
            setSliderPosition();
            if (isDragging) requestAnimationFrame(animation);
        }

        function setSliderPosition() {
            imgWrapper.style.transform = `translateX(${currentTranslate}px)`;
        }

        // Hide arrows if only one image
        if (totalImages <= 1) {
            leftArrow.style.display = 'none';
            rightArrow.style.display = 'none';
        }

        // Add elements to wrapper
        navContainer.appendChild(leftArrow);
        navContainer.appendChild(rightArrow);
        navContainer.appendChild(counter);
        imgWrapper.appendChild(navContainer);

        // Initialize counter
        updateCounter();
        preloadAllImages();
    }

    const mediaId = galleryData[0]?.media_id;
    const media = mediaMetadata[mediaId];

    // Force container visible if valid
    if (imgContainer.style.visibility === 'hidden') {
        imgContainer.style.visibility = 'visible';
    }

    // Ensure shimmer exists
    let shimmer = resultCard.querySelector('.image-placeholder');
    if (!shimmer) {
        shimmer = document.createElement('div');
        shimmer.className = 'image-placeholder shimmer';
        imgWrapper.prepend(shimmer);
    } else {
        shimmer.style.display = 'block';
    }

    // Gather best available image sources
    const isAnimated = media?.e === 'AnimatedImage';
    const original = isAnimated
        ? (media?.s?.gif || media?.s?.mp4)?.replace(/&amp;/g, '&')
        : media?.s?.u?.replace(/&amp;/g, '&');
    const resolutionFallback = media?.p?.[media.p.length - 1]?.u?.replace(/&amp;/g, '&');
    const fallbacks = [original, resolutionFallback].filter(Boolean);

    const patchImage = (img) => {
        const trySrc = (index = 0) => {
            if (index >= fallbacks.length) {
                img.style.display = 'none';
                showNewsIcon(imgWrapper, shimmer);
                return;
            }
            const fallbackURL = `${IMAGE_PROXY_BASE}/image?url=${encodeURIComponent(fallbacks[index])}`;
            img.onerror = () => {
                trySrc(index + 1);
            };
            img.onload = () => {
                img.classList.add('show');
                img.style.opacity = '1';
                shimmer.style.display = 'none';

                // Capture first thumbnail size for comfy mode fixed sizing
                const isMobile = window.innerWidth <= 1024;
                const isCompact = document.body.getAttribute('data-layout') === 'compact';
                if (!isCompact && useSameSize && !imgWrapper.comfyFirstWidth && (document.body.classList.contains('comfy-mode') || isMobile)) {
                    setTimeout(() => {
                        imgWrapper.comfyFirstWidth = img.offsetWidth;
                        imgWrapper.comfyFirstHeight = img.offsetHeight;
                    }, 50);
                }
            };
            img.src = fallbackURL;
        };
        trySrc();
    };

    const resultImg = resultCard.querySelector('img.result-image');
    if (resultImg) {
        patchImage(resultImg);
    } else if (attempt < 3) {
        setTimeout(() => tryGalleryPatch(fullPost, permalink, resultCard, attempt + 1), 100);
    }
}



function getThumbnailUrl(post) {

    // Handle RedGifs - fetch thumbnail from backend
    if (post.url?.includes('redgifs.com')) {
        const match = post.url.match(/redgifs\.com\/watch\/([a-zA-Z0-9-]+)/);
        if (match) {
            const videoId = match[1];
            // Fetch thumbnail from backend
            fetch(`${API_BASE}/api/redgifs/${videoId}`)
                .then(r => r.json())
                .then(data => {
                    if (data.thumbnail) {
                        // Find the img element for this post and update it
                        const imgs = document.querySelectorAll('.result-image');
                        imgs.forEach(img => {
                            if (img.closest('.result-card')?.querySelector('a')?.href?.includes(post.id)) {
                                img.src = data.thumbnail;
                            }
                        });
                    }
                });
        }
    }

    // For Reddit videos without preview, construct DASH thumbnail URL
    if (post.is_video && post.url && post.url.includes('v.redd.it')) {
        const cleanUrl = post.url.split('?')[0];
        const videoId = cleanUrl.split('/').pop();
        const dashUrl = `https://v.redd.it/${videoId}/DASH_480.mp4`;
        // DON'T proxy video files - return direct URL
        return dashUrl;
    }

    // Check if it's a regular thumbnail
    if (post.thumbnail && !['self', 'default', 'nsfw', 'spoiler', 'image'].includes(post.thumbnail.toLowerCase())) {
        return post.thumbnail;
    }

    // Final fallback: use real_thumbnail if available
    if (post.real_thumbnail && !['self', 'default', 'nsfw', 'spoiler', 'image'].includes(post.real_thumbnail.toLowerCase())) {
        return post.real_thumbnail;
    }

    // Check if the URL is a direct link to media
    if (post.url) {
        const mediaExtensions = [
            '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg',
            '.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v'
        ];

        const mediaHosts = [
            'i.redd.it', 'v.redd.it', 'preview.redd.it',
            'i.imgur.com', 'media.giphy.com', 'gfycat.com',
            'streamable.com'
        ];

        const urlLower = post.url.toLowerCase();
        const isDirectMedia = mediaExtensions.some(ext => urlLower.endsWith(ext)) ||
            mediaHosts.some(host => urlLower.includes(host));

        if (isDirectMedia) {
            return post.url;
        }
    }

    return null;
}

// Media handling
function createMediaElement(post, thumbnailURL, domain, resultCard, skipModal = false) {
    const imgContainer = document.createElement('div');
    const imageWrapper = document.createElement('div');

    imgContainer.className = 'img-container';
    imageWrapper.className = 'image-wrapper';
    imageWrapper.tabIndex = 0;

    imageWrapper.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const existingModal = document.querySelector('.modal-overlay');
            if (existingModal) {
                existingModal.remove();
            } else {
                imageWrapper.click();
            }
        }
    });

    imageWrapper.setAttribute('aria-label', `Image for post: ${post.title}`);

    // Determine media type and sources
    const mediaInfo = analyzeMediaType(post, thumbnailURL, domain);

    if (!mediaInfo.hasVisualMedia && domain && domain !== 'reddit.com' && domain.includes('.')) {
        const imagePlaceholder = document.createElement('div');
        const img = document.createElement('img');
        img.className = 'result-image';
        imagePlaceholder.className = 'image-placeholder shimmer';

        imageWrapper.appendChild(imagePlaceholder);
        imageWrapper.appendChild(img);
        imgContainer.appendChild(imageWrapper);
        window.imageHandler.handleBackendScrapedImage(post, resultCard);
        return imgContainer;
    }

    // Check if we have sources, if not return empty container
    if (!mediaInfo.sources || mediaInfo.sources.length === 0) {
        imgContainer.appendChild(imageWrapper);
        return imgContainer;
    }

    // Only create shimmer if we have sources
    const imagePlaceholder = document.createElement('div');
    imagePlaceholder.className = 'image-placeholder shimmer';

    const videoInfo = identifyVideoTypes(post);
    mediaInfo.videoInfo = videoInfo;
    mediaInfo.post = post;
    const mediaElement = createMediaElementByType(mediaInfo);
    mediaElement.style.opacity = '0';
    mediaElement.style.transition = 'opacity 0.3s ease-in-out';

    setupMediaErrorHandling(mediaElement, mediaInfo);
    setupMediaLoadHandling(mediaElement, imagePlaceholder);
    if (!skipModal) {
        setupImageModal(imageWrapper);
    }
    imageWrapper.appendChild(imagePlaceholder);
    imageWrapper.appendChild(mediaElement);
    imageWrapper.style.cursor = 'pointer';
    imgContainer.appendChild(imageWrapper);
    return imgContainer;
}

function analyzeMediaType(post, thumbnailURL, domain) {
    const originalPost = (post.crosspost_parent_list && post.crosspost_parent_list.length > 0)
        ? post.crosspost_parent_list[0]
        : post;

    // Get all possible image sources in priority order
    const previewImage = originalPost.preview?.images?.[0]?.source?.url?.replace(/&amp;/g, '&');
    const gifVariant = originalPost.preview?.images?.[0]?.variants?.gif?.source?.url;
    const cleanThumbnail = thumbnailURL?.replace(/&amp;/g, '&');

    // Media type detection
    const isVideo = originalPost.is_video || originalPost.url?.includes('v.redd.it');
    const isGif = originalPost.url?.endsWith('.gif') || gifVariant;
    const isMp4 = originalPost.url?.endsWith('.mp4');
    const isYouTube = domain === 'youtube.com' || domain === 'youtu.be';

    const isGallery = originalPost.is_gallery && originalPost.gallery_data && originalPost.media_metadata;

    // Determine if we should show visual media
    const isGarbageThumbnail = !thumbnailURL ||
        ['self', 'default', 'nsfw', 'spoiler', 'image'].includes(thumbnailURL.toLowerCase());

    const hasVisualMedia = (!isGarbageThumbnail ||
        isGallery ||
        isVideo ||
        previewImage) &&
        !(originalPost.domain || '').startsWith('self.');

    // Build source priority list
    const sources = [];

    // For Reddit videos, use the fallback URL as thumbnail
    if (originalPost.media?.reddit_video?.fallback_url) {
        const fallbackUrl = originalPost.media.reddit_video.fallback_url;
        sources.push({
            url: fallbackUrl,
            type: 'video',
            priority: 1
        });
    }

    if (gifVariant) {
        sources.push({ url: gifVariant, type: 'gif', priority: 1 });
    }
    if (originalPost.url?.endsWith('.gif')) {
        sources.push({ url: originalPost.url, type: 'gif', priority: 2 });
    }
    if (isMp4) {
        sources.push({ url: originalPost.url, type: 'video', priority: 3 });
    }
    if (isVideo && cleanThumbnail?.includes('DASH_')) {
        sources.push({ url: cleanThumbnail, type: 'video', priority: 4 });
    }
    if (previewImage) {
        sources.push({
            url: getImageUrl(previewImage),
            type: 'image',
            priority: 3
        });
    }
    if (cleanThumbnail && !cleanThumbnail.includes('DASH_')) {
        sources.push({
            url: getImageUrl(cleanThumbnail),
            type: 'image',
            priority: 2
        });
    }
    // Add fallback for non-self posts (galleries need this)
    if (originalPost.url &&
        !originalPost.is_self &&
        !(originalPost.domain || '').startsWith('self.') &&
        !originalPost.url.includes('/comments/')) {
        sources.push({ url: originalPost.url, type: 'fallback', priority: 7 });
    }

    // Sort by priority
    sources.sort((a, b) => a.priority - b.priority);

    return {
        hasVisualMedia,
        sources,
        isVideo,
        isGif,
        isMp4,
        isYouTube,
        primarySource: sources[0] || null
    };
}

function identifyVideoTypes(post) {
    const originalPost = (post.crosspost_parent_list && post.crosspost_parent_list.length > 0)
        ? post.crosspost_parent_list[0]
        : post;

    const videoInfo = {
        hasVideo: false,
        videoType: null,
        videoSource: null
    };

    // CHECK REDGIFS FIRST (before reddit_video_preview)
    if (originalPost.url?.includes('redgifs.com')) {
        const match = originalPost.url.match(/redgifs\.com\/watch\/([a-zA-Z0-9-]+)/);
        if (match) {
            videoInfo.hasVideo = true;
            videoInfo.videoType = 'redgifs';
            videoInfo.embedId = match[1];
            videoInfo.videoSource = `${API_BASE}/api/redgifs/${match[1]}`;
            return videoInfo; // Return early so it doesn't get overwritten
        }
    }

    // Check media first (most common for cross-posts)
    if (originalPost.media?.reddit_video?.fallback_url) {
        videoInfo.hasVideo = true;
        videoInfo.videoType = 'reddit_native';
        videoInfo.videoSource = originalPost.media.reddit_video.fallback_url;

        // Store dash_url and hls_url
        videoInfo.dashUrl = originalPost.media.reddit_video.dash_url;
        videoInfo.hlsUrl = originalPost.media.reddit_video.hls_url;

        const videoUrl = originalPost.media.reddit_video.fallback_url.split("?")[0];
        const videoId = videoUrl.split('/')[3];
        videoInfo.videoId = videoId;
        videoInfo.audioSource = `https://v.redd.it/${videoId}/DASH_AUDIO_128.mp4`;
    }
    // Check secure_media
    else if (originalPost.secure_media?.reddit_video?.fallback_url) {
        videoInfo.hasVideo = true;
        videoInfo.videoType = 'reddit_native';
        videoInfo.videoSource = originalPost.secure_media.reddit_video.fallback_url;

        // Store dash_url and hls_url
        videoInfo.dashUrl = originalPost.secure_media.reddit_video.dash_url;
        videoInfo.hlsUrl = originalPost.secure_media.reddit_video.hls_url;

        const videoUrl = originalPost.secure_media.reddit_video.fallback_url.split("?")[0];
        const videoId = videoUrl.split('/')[3];
        videoInfo.videoId = videoId;
        videoInfo.audioSource = `https://v.redd.it/${videoId}/DASH_AUDIO_128.mp4`;
    }
    // Check preview for RedGifs
    else if (originalPost.preview?.reddit_video_preview?.fallback_url) {
        videoInfo.hasVideo = true;
        videoInfo.videoType = 'reddit_native';
        videoInfo.videoSource = originalPost.preview.reddit_video_preview.fallback_url;

        const videoUrl = originalPost.preview.reddit_video_preview.fallback_url.split("?")[0];
        const videoId = videoUrl.split('/')[3];
        videoInfo.videoId = videoId;
        videoInfo.audioSource = `https://v.redd.it/${videoId}/DASH_AUDIO_128.mp4`;
    }
    // Check v.redd.it URL
    else if (originalPost.url?.includes('v.redd.it')) {
        videoInfo.hasVideo = true;
        videoInfo.videoType = 'reddit_native';
        const videoId = originalPost.url.split('/').pop();
        videoInfo.videoId = videoId;
        videoInfo.videoSource = null;
    }

    // Streamable detection
    if (!videoInfo.hasVideo && originalPost.url?.includes('streamable.com')) {
        const match = originalPost.url.match(/streamable\.com\/([a-zA-Z0-9]+)/);
        if (match) {
            videoInfo.hasVideo = true;
            videoInfo.videoType = 'streamable';
            videoInfo.embedId = match[1];
            videoInfo.videoSource = `https://streamable.com/e/${match[1]}`;
        }
    }

    detectYoutube(post, originalPost, videoInfo);
    detectRedGifs(post, originalPost, videoInfo);

    return videoInfo;
}

function detectRedGifs(post, originalPost, videoInfo) {
    if (!videoInfo.hasVideo && originalPost.url?.includes('redgifs.com')) {
        const match = originalPost.url.match(/redgifs\.com\/watch\/([a-zA-Z0-9-]+)/);
        if (match) {
            videoInfo.hasVideo = true;
            videoInfo.videoType = 'redgifs';
            videoInfo.embedId = match[1];
            videoInfo.videoSource = `${API_BASE}/api/redgifs/${match[1]}`;
        }
    }
    return videoInfo;
}

function detectYoutube(post, originalPost, videoInfo) {
    if (!videoInfo.hasVideo && (originalPost.url?.includes('youtube.com') || originalPost.url?.includes('youtu.be'))) {
        videoInfo.hasVideo = true;
        videoInfo.videoType = 'youtube';
        videoInfo.videoSource = originalPost.url;

        let videoId = null;
        if (originalPost.url.includes('youtube.com/watch')) {
            const urlParams = new URLSearchParams(originalPost.url.split('?')[1]);
            videoId = urlParams.get('v');
        } else if (originalPost.url.includes('youtu.be/')) {
            videoId = originalPost.url.split('youtu.be/')[1].split('?')[0];
        }

        videoInfo.embedId = videoId;
    }
    return videoInfo;
}

function createMediaElementByType(mediaInfo) {
    if (!mediaInfo.primarySource) {
        return document.createElement('img');
    }

    const source = mediaInfo.primarySource;
    let mediaElement;

    if (source.type === 'video' || mediaInfo.isMp4) {
        mediaElement = document.createElement('video');
        mediaElement.muted = true;
        mediaElement.playsInline = true;
        mediaElement.preload = 'metadata';

        if (mediaInfo.isMp4) {
            mediaElement.autoplay = true;
            mediaElement.loop = true;
        } else {
            mediaElement.currentTime = 0.1; // For preview frame
        }
    } else {
        mediaElement = document.createElement('img');
    }

    // Set standard attributes
    mediaElement.className = 'result-image';
    mediaElement.alt = 'Post thumbnail';
    mediaElement.setAttribute('loading', 'lazy');
    mediaElement.setAttribute('decoding', 'async');
    mediaElement.setAttribute('fetchpriority', 'auto');
    mediaElement.setAttribute('crossorigin', 'anonymous');

    // Store video info for modal detection
    if (mediaInfo.videoInfo && mediaInfo.videoInfo.videoType) {
        mediaElement.dataset.videoType = mediaInfo.videoInfo.videoType;

        if (mediaInfo.videoInfo.videoType === 'reddit_native') {
            mediaElement.dataset.isRedditVideo = 'true';
            mediaElement.classList.add('reddit-video-thumbnail');

            // Extract and store video ID
            const post = mediaInfo.post;
            let videoId = null;
            if (post?.url?.includes('v.redd.it')) {
                videoId = post.url.split('/').pop();
            } else if (mediaInfo.videoInfo.videoSource) {
                const match = mediaInfo.videoInfo.videoSource.match(/v\.redd\.it\/([^\/]+)/);
                if (match) videoId = match[1];
            }

            if (videoId) {
                mediaElement.dataset.videoId = videoId;
                // Store the URLs
                if (mediaInfo.videoInfo.dashUrl) {
                    mediaElement.dataset.dashUrl = mediaInfo.videoInfo.dashUrl;
                }
                if (mediaInfo.videoInfo.hlsUrl) {
                    mediaElement.dataset.hlsUrl = mediaInfo.videoInfo.hlsUrl;
                }
                if (mediaInfo.videoInfo.videoSource) {
                    mediaElement.dataset.fallbackUrl = mediaInfo.videoInfo.videoSource;
                }
            }
        } else if (mediaInfo.videoInfo.videoType === 'streamable') {
            mediaElement.dataset.embedId = mediaInfo.videoInfo.embedId;
            mediaElement.dataset.videoSource = mediaInfo.videoInfo.videoSource;
        } else if (mediaInfo.videoInfo.videoType === 'redgifs') {
            mediaElement.dataset.embedId = mediaInfo.videoInfo.embedId;
            mediaElement.dataset.videoSource = mediaInfo.videoInfo.videoSource;
            mediaElement.dataset.videoType = 'redgifs';
        } else if (mediaInfo.videoInfo.videoType === 'youtube') {
            mediaElement.dataset.embedId = mediaInfo.videoInfo.embedId;
            mediaElement.dataset.videoSource = mediaInfo.videoInfo.videoSource;
        }
    }

    // Set initial source
    mediaElement.src = source.url;

    return mediaElement;
}

async function getCombinedRedditVideo(videoId, fallbackUrl, dashUrl, hlsUrl) {
    try {

        // Build query params
        const params = new URLSearchParams();
        if (fallbackUrl) params.append('fallbackUrl', fallbackUrl);
        if (dashUrl) params.append('dashUrl', dashUrl);
        if (hlsUrl) params.append('hlsUrl', hlsUrl);

        const queryString = params.toString();
        const url = queryString
            ? `${API_BASE}/api/reddit-video/${videoId}?${queryString}`
            : `${API_BASE}/api/reddit-video/${videoId}`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.videoUrl) {
            return `${API_BASE}${data.videoUrl}`;
        } else {
            console.error('❌ Backend error:', data.error);
            return null;
        }

    } catch (error) {
        console.error('❌ Error getting combined video:', error);
        return null;
    }
}

function setupMediaErrorHandling(mediaElement, mediaInfo) {
    let currentSourceIndex = 0;
    let hasTriedRetry = false;

    function tryNextSource() {
        currentSourceIndex++;

        if (currentSourceIndex >= mediaInfo.sources.length) {
            // All sources failed - try once more if we haven't already
            if (!hasTriedRetry) {
                hasTriedRetry = true;
                setTimeout(() => {
                    currentSourceIndex = 0;
                    mediaElement.src = mediaInfo.sources[0].url;
                }, 1000);
                return;
            }

            // All sources failed including retry
            // console.error('🚫 All media sources failed for:', mediaInfo.sources);
            setTimeout(() => {
                const resultCard = mediaElement.closest('.result-card');
                const shimmer = resultCard?.querySelector('.image-placeholder');
                if (shimmer) shimmer.style.display = 'none';

                const imageWrapper = mediaElement.closest('.image-wrapper');
                if (imageWrapper) {
                    showNewsIcon(imageWrapper, shimmer);
                }
            }, 1000);
            return;
        }

        const nextSource = mediaInfo.sources[currentSourceIndex];

        // Update element type if needed
        if (nextSource.type === 'video' && mediaElement.tagName !== 'VIDEO') {
            // Need to replace with video element
            const newElement = document.createElement('video');
            newElement.className = mediaElement.className;
            newElement.alt = mediaElement.alt;

            // Copy attributes
            ['loading', 'decoding', 'fetchpriority', 'crossorigin'].forEach(attr => {
                newElement.setAttribute(attr, mediaElement.getAttribute(attr));
            });

            newElement.muted = true;
            newElement.playsInline = true;
            newElement.preload = 'metadata';

            mediaElement.parentNode.replaceChild(newElement, mediaElement);
            mediaElement = newElement;

        }

        mediaElement.src = nextSource.url;
    }

    mediaElement.addEventListener('error', (e) => {
        // Skip retry for DASH URLs that should work as videos
        if (mediaElement.src.includes('DASH_') && mediaElement.tagName === 'VIDEO') {
            return;
        }
        tryNextSource();
    });
}

function setupMediaLoadHandling(mediaElement, imagePlaceholder) {
    const handleSuccess = () => {

        imagePlaceholder.style.opacity = '0';
        imagePlaceholder.style.transition = 'opacity 0.3s ease-in-out';

        // Fade in media
        mediaElement.style.opacity = '1';

        // Remove shimmer after fade completes
        setTimeout(() => {
            imagePlaceholder.style.display = 'none';
        }, 300);
    };

    if (mediaElement.tagName === 'VIDEO') {
        mediaElement.addEventListener('loadeddata', handleSuccess);
        mediaElement.addEventListener('canplay', handleSuccess);
    } else {
        mediaElement.addEventListener('load', () => {
            if (mediaElement.naturalWidth > 0 && mediaElement.naturalHeight > 0) {
                handleSuccess();
            }
        });
    }
}

function setupImageModal(imageWrapper) {
    const isMobile = window.innerWidth <= 1024;
    imageWrapper.addEventListener('click', async function (event) {
        // Prevent any default behaviors that might cause navigation
        event.preventDefault();
        event.stopPropagation();

        // Store the opener for focus restoration
        window.currentModalOpener = imageWrapper;

        // If transition is in progress, wait until it's done
        if (imageWrapper.isTransitioning) {
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (!imageWrapper.isTransitioning) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 50); // Check every 50ms
            });
        }

        // Remove any existing modals first
        const existingModal = document.querySelector('.modal-overlay');
        if (existingModal) {
            existingModal.remove();
        }

        const modalOverlay = document.createElement('div');
        modalOverlay.className = 'modal-overlay';
        modalOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0,0,0,0);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.1s ease;
            ${isMobile ? 'overflow: hidden;' : ''}
        `;

        // Create modal container that will hold both content and arrows
        const modalContainer = document.createElement('div');
        modalContainer.style.cssText = `
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: 100%;
            max-width: ${isMobile ? '100vw' : '90vw'};
            max-height: ${isMobile ? '100vh' : '90vh'};
        `;

        // Check if this is a Reddit video thumbnail
        const imageElement = imageWrapper.querySelector('img') || imageWrapper.querySelector('video');
        const videoElement = imageWrapper.querySelector('video');

        // Check for cross-posted videos specifically
        const isCrosspostVideo = videoElement && videoElement.dataset.isRedditVideo === 'true' && videoElement.dataset.videoId;

        const isExternalVideo = imageElement && imageElement.dataset.videoType && ['streamable', 'youtube', 'redgifs'].includes(imageElement.dataset.videoType);
        const isRedditVideo = (imageElement && (imageElement.dataset.isRedditVideo === 'true' || imageElement.dataset.videoType === 'redgifs')) || isCrosspostVideo || isExternalVideo;
        const originalVideo = imageWrapper.querySelector('.js-player');
        let modalContent;
        let videoProcessingAborted = false;

        // Handle external embeddable videos (Streamable, YouTube)
        if (isExternalVideo && imageElement.dataset.videoSource) {
            modalContent = document.createElement('div');
            modalContent.style.cssText = `
            width: auto !important;
            height: auto !important;
            max-width: 90vw;
            max-height: 90vh;
            opacity: 0;
            transform: scale(0.8);
            transition: all 0.1s ease;
            border-radius: 25px;
            overflow: hidden;
            background: black;
        `;

            // Create video element instead of iframe (no watermark!)
            const newVideo = document.createElement('video');
            newVideo.className = 'js-player';
            newVideo.setAttribute('controls', '');
            newVideo.setAttribute('crossorigin', 'anonymous');
            newVideo.setAttribute('playsinline', '');
            newVideo.setAttribute('autoplay', '');
            newVideo.muted = false;
            newVideo.style.cssText = `
            width: 70vw !important;
            height: auto !important;
            max-height: 80vh;
            border-radius: 25px;
            object-fit: contain;
        `;

            // Extract video ID and type
            const embedId = imageElement.dataset.embedId;
            const videoType = imageElement.dataset.videoType;

            if (embedId && videoType === 'streamable') {
                // Streamable blocks direct CDN (403), use iframe
                const iframe = document.createElement('iframe');
                iframe.src = `https://streamable.com/e/${embedId}?autoplay=1&muted=0`;
                iframe.style.cssText = `
                width: 70vw;
                height: calc(70vw * 9 / 16);
                max-height: 80vh;
                border: none;
                border-radius: 25px;
            `;
                iframe.setAttribute('allowfullscreen', '');
                iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');

                modalContent.appendChild(iframe);

            } else if (embedId && videoType === 'redgifs') {
                // RedGifs - fetch video URL from backend API
                fetch(`${API_BASE}/api/redgifs/${embedId}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.videoUrl) {
                            newVideo.src = data.videoUrl;
                            modalContent.appendChild(newVideo);
                        } else {
                            console.error('Failed to get RedGifs video URL');
                        }
                    })
                    .catch(err => {
                        console.error('RedGifs fetch error:', err);
                    });

            } else if (embedId && videoType === 'youtube') {
                // YouTube - use iframe embed instead of video
                const iframe = document.createElement('iframe');
                iframe.src = `https://www.youtube.com/embed/${embedId}?autoplay=1`;
                iframe.style.cssText = `
                width: 70vw;
                height: calc(70vw * 9 / 16);
                max-height: 80vh;
                border: none;
                border-radius: 25px;
            `;
                iframe.setAttribute('allowfullscreen', '');
                iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');

                modalContent.appendChild(iframe);
            } else if (videoType !== 'streamable') {
                modalContent.appendChild(newVideo);
            }
                } else if (isRedditVideo) {
            // Create video with poster  
            modalContent = document.createElement('div');
            modalContent.style.cssText = `
                width: ${isMobile ? '100vw' : 'auto'} !important;
                height: ${isMobile ? '100vh' : 'auto'} !important;
                max-width: ${isMobile ? '100vw' : '90vw'};
                max-height: ${isMobile ? '100vh' : '90vh'};
                opacity: 0;
                transform: scale(0.8);
                transition: all 0.1s ease;
                border-radius: ${isMobile ? '0' : '25px'};
                padding: 0;
                background: transparent;
                overflow: hidden;
                position: relative;
            `;

            // Create video element with poster 
            const newVideo = document.createElement('video');
            newVideo.className = 'js-player';
            newVideo.setAttribute('controls', '');
            newVideo.setAttribute('playsinline', '');
            newVideo.setAttribute('poster', imageElement.src);
            newVideo.muted = false;
            newVideo.style.cssText = `
                width: 100% !important;
                height: ${isMobile ? '100vh' : 'auto'} !important;
                max-width: ${isMobile ? '100vw' : '90vw'};
                max-height: ${isMobile ? '100vh' : '90vh'};
                border-radius: ${isMobile ? '0' : '25px'};
                object-fit: ${isMobile ? 'contain' : 'cover'};
            `;

            modalContent.appendChild(newVideo);

            // Initialize Plyr immediately
            try {
                const modalPlyrInstance = new Plyr(newVideo, {
                                        controls: isMobile ? [] : ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip', 'airplay', 'fullscreen'],
                    volume: 1,
                    muted: false,
                    clickToPlay: true,
                    autoplay: true,
                    disableContextMenu: false,
                    fullscreen: {
                        enabled: true,
                        fallback: true,
                        iosNative: false
                    }
                });

                modalPlyrInstance.on('enterfullscreen', () => {
                    const video = newVideo;
                    video.style.marginLeft = 'auto';
                    video.style.marginRight = '0';
                    video.style.transform = 'translateX(-5vw) translateY(5vh) scale(1.2)';
                });

                modalPlyrInstance.on('exitfullscreen', () => {
                    const video = newVideo;
                    video.style.marginLeft = '';
                    video.style.marginRight = '';
                    video.style.transform = '';
                    video.style.width = '';
                });

                modalPlyrInstance.muted = false;
                modalPlyrInstance.volume = 1;
                
                                                                if (isMobile) {
                                    let hasEnteredFullscreen = false;
                                    modalPlyrInstance.on('play', () => {
                                        if (!hasEnteredFullscreen && newVideo.webkitEnterFullscreen) {
                                            hasEnteredFullscreen = true;
                                            newVideo.webkitEnterFullscreen();
                            newVideo.webkitEnterFullscreen();
                        }
                    });
                    newVideo.addEventListener('webkitendfullscreen', () => {
                        closeModal();
                    });
                }

            } catch (error) {
                console.log('❌ Error initializing Plyr:', error);
            }

            // Hide the Plyr play button during loading
            const plyrPlayButton = modalContent.querySelector('.plyr__control--overlaid');
            if (plyrPlayButton) {
                plyrPlayButton.style.display = 'none';
            }

            // Add spinner overlay (positioned to not block close button)
                        const loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            loadingOverlay.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
                pointer-events: none;
            `;

                        const spinnerWrapper = createCanvasSpinner('#ffffff', 75)
            spinnerWrapper.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
            `;

            loadingOverlay.appendChild(spinnerWrapper);
            modalContent.appendChild(loadingOverlay);

            // Get the stored video ID and process in background
            const videoId = videoElement?.dataset?.videoId || imageElement?.dataset?.videoId;
            const fallbackUrl = videoElement?.dataset?.fallbackUrl || imageElement?.dataset?.fallbackUrl;
            const dashUrl = videoElement?.dataset?.dashUrl || imageElement?.dataset?.dashUrl;
            const hlsUrl = videoElement?.dataset?.hlsUrl || imageElement?.dataset?.hlsUrl;

            if (videoId) {
                // Start video processing in background
                (async () => {
                    try {
                        const combinedVideoUrl = await getCombinedRedditVideo(videoId, fallbackUrl, dashUrl, hlsUrl);

                        // Check if modal was closed during processing
                        if (videoProcessingAborted || !document.body.contains(modalOverlay)) {
                            return;
                        }

                                                if (combinedVideoUrl) {
                            newVideo.src = combinedVideoUrl;
                            // Trigger iOS native fullscreen as soon as src is set
                            if (isMobile && newVideo.webkitEnterFullscreen) {
                                newVideo.load();
                                newVideo.webkitEnterFullscreen();
                            }
                            loadingOverlay.remove();
                            // Show the play button again
                            if (plyrPlayButton) {
                                plyrPlayButton.style.display = '';
                            }
                        } else {
                            // Keep spinner, retry after delay
                            setTimeout(async () => {
                                // Check again if modal still exists
                                if (videoProcessingAborted || !document.body.contains(modalOverlay)) {
                                    return;
                                }

                                const retryUrl = await getCombinedRedditVideo(videoId);
                                if (retryUrl && !videoProcessingAborted && document.body.contains(modalOverlay)) {
                                    newVideo.src = retryUrl;
                                    loadingOverlay.remove();
                                    if (plyrPlayButton) {
                                        plyrPlayButton.style.display = '';
                                    }
                                }
                            }, 2000);
                        }
                    } catch (error) {
                        console.error('❌ Error in video processing:', error);
                        if (document.body.contains(modalOverlay)) {
                            loadingOverlay.remove();
                        }
                    }
                })();
            }

        } else if (originalVideo) {
            // Handle non-Reddit videos (existing logic)
            modalContent = document.createElement('div');
            modalContent.style.cssText = `
                width: auto !important;
                height: auto !important;
                max-width: 90vw;
                max-height: 90vh;
                opacity: 0;
                transform: scale(0.8);
                transition: all 0.1s ease;
                border-radius: 25px;
                overflow: hidden;
            `;

            const newVideo = document.createElement('video');
            newVideo.className = 'js-player';
            newVideo.setAttribute('controls', '');
            newVideo.setAttribute('playsinline', '');
            newVideo.src = originalVideo.src || originalVideo.querySelector('source')?.src;
            newVideo.style.cssText = `
                width: 100% !important;
                height: auto !important;
                max-width: 90vw;
                max-height: 90vh;
                border-radius: 25px;
                object-fit: cover;
            `;

            modalContent.appendChild(newVideo);

        } else {
            // Handle regular images (existing logic)
            modalContent = imageWrapper.cloneNode(true);
            // Remove the small thumbnail arrows from modal 
            const thumbnailArrows = modalContent.querySelectorAll('.gallery-arrow');
            thumbnailArrows.forEach(arrow => arrow.remove());

            // Make the counter bigger for modal view
            const galleryCounter = modalContent.querySelector('.gallery-counter');
            if (galleryCounter) {
                galleryCounter.style.cssText = `
                    position: absolute !important;
                    top: ${isMobile ? '200px' : '10px'} !important;
                    right: ${isMobile ? '2px' : '9px'} !important;
                    background: rgba(0, 0, 0, 0.5);
                    color: white;
                    padding: 5px 10px !important;
                    border-radius: 12px;
                    font-size: 1rem !important;
                    font-weight: bold;
                    z-index: 10;
                `;
            }

            modalContent.style.cssText = `
                width: ${isMobile ? '100vw' : 'auto'} !important;
                height: ${isMobile ? '100vh' : 'auto'} !important;
                cursor: pointer;
                max-width: ${isMobile ? '100vw' : '90vw'};
                max-height: ${isMobile ? '100vh' : '90vh'};
                display: ${isMobile ? 'flex' : 'block'} !important;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transform: scale(0.8);
                transition: all 0.1s ease;
                border-radius: ${isMobile ? '0' : '25px'};
            `;

            const imageInside = modalContent.querySelector('img');
            const shimmerPlaceholder = modalContent.querySelector('.image-placeholder');

            if (imageInside) {
                imageInside.style.cssText = `
                    width: ${isMobile ? '100vw' : '100%'} !important;
                    height: ${isMobile ? 'auto' : 'auto'} !important;
                    max-width: ${isMobile ? '100vw' : '90vw'};
                    max-height: ${isMobile ? '100vh' : '90vh'};
                    object-fit: contain;
                    opacity: 1 !important;
                `;
            }

            if (shimmerPlaceholder) {
                shimmerPlaceholder.remove();
            }
        }

        // Add modal content to container
        modalContainer.appendChild(modalContent);

        // Enter on focused image closes modal view
        modalContent.tabIndex = 0;
        modalContent.setAttribute('role', 'button');
        modalContent.setAttribute('aria-label', 'Press Enter to close modal');

        modalContent.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                closeModal();
            }
        });

        // Create left navigation arrow (positioned outside the content)
        const leftArrow = document.createElement('div');
        leftArrow.className = 'modal-nav-arrow modal-nav-left';
        leftArrow.tabIndex = 0;
        leftArrow.setAttribute('role', 'button');
        leftArrow.setAttribute('aria-label', 'Previous image');
        const arrowSize = isMobile ? '40' : '29';
        leftArrow.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${arrowSize}" height="${arrowSize}" viewBox="0 0 24 24" fill="none" style="transform: translateX(-1px);" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-left-icon lucide-chevron-left"><path d="m15 18-6-6 6-6"/></svg>
`;

        leftArrow.style.cssText = `
            position: absolute;
            left: ${isMobile ? '2px' : '320px'};
            top: 50%;
            transform: ${isMobile ? 'translateY(calc(-50% - 5vh))' : 'translateY(-50%)'};
            width: 50px;
            height: 50px;
            background: rgba(0, 0, 0, 0.5);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 10001;
            user-select: none;
        `;

        // Create right navigation arrow (positioned outside the content)
        const rightArrow = document.createElement('div');
        rightArrow.className = 'modal-nav-arrow modal-nav-right';
        rightArrow.tabIndex = 0;
        rightArrow.setAttribute('role', 'button');
        rightArrow.setAttribute('aria-label', 'Next image');

        rightArrow.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${arrowSize}" height="${arrowSize}" viewBox="0 0 24 24" fill="none" style="transform: translateX(1px);" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-right-icon lucide-chevron-right"><path d="m9 18 6-6-6-6"/></svg>
`;
        rightArrow.style.cssText = `
                    position: absolute;
                    right: ${isMobile ? '2px' : '320px'};
                    top: 50%;
                    transform: ${isMobile ? 'translateY(calc(-50% - 5vh))' : 'translateY(-50%)'};
                    width: 50px;
                    height: 50px;
                    background: rgba(0, 0, 0, 0.5);
                    color: white;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    z-index: 10001;
                    user-select: none;
                `;

        // Get gallery data from the original image wrapper
        const galleryData = imageWrapper.galleryData;
        const mediaMetadata = imageWrapper.mediaMetadata;
        // Get current index - fallback chain
        let currentIndex = 0;
        const galleryCounter = imageWrapper.querySelector('.gallery-counter');

        if (galleryCounter) {
            const counterText = galleryCounter.textContent;
            currentIndex = parseInt(counterText.split('/')[0]) - 1;
        } else if (imageWrapper.currentIndex !== undefined) {
            currentIndex = imageWrapper.currentIndex;
        } else {
        }

        const useSameSize = imageWrapper.useSameSize;

        // Add preloaded images storage for modal, share preloaded images from main gallery if available
        const modalPreloadedImages = imageWrapper.preloadedImages;

        let lastModalNavigationTime = 0;
        const MODAL_THROTTLE_DELAY = 70;

        const navigateModalGallery = (direction) => {
            // Throttle rapid clicks
            const now = Date.now();
            if (now - lastModalNavigationTime < MODAL_THROTTLE_DELAY) {
                return;
            }
            lastModalNavigationTime = now;

            if (!galleryData || !mediaMetadata) return;

            const totalImages = galleryData.length;
            let currentImgElement = modalContent.querySelector('img');

            // Calculate target index
            const targetIndex = direction === 'prev'
                ? (currentIndex > 0 ? currentIndex - 1 : totalImages - 1)
                : (currentIndex < totalImages - 1 ? currentIndex + 1 : 0);

            // Get new image URL using targetIndex
            const mediaId = galleryData[targetIndex].media_id;
            const media = mediaMetadata[mediaId];
            const isAnimated = media?.e === 'AnimatedImage';
            const original = isAnimated
                ? (media?.s?.gif || media?.s?.mp4)?.replace(/&amp;/g, '&')
                : media?.s?.u?.replace(/&amp;/g, '&');
            const resolutionFallback = media?.p?.[media.p.length - 1]?.u?.replace(/&amp;/g, '&');
            const imageUrl = original || resolutionFallback;

            if (!imageUrl) return;

            // Create new image element for the incoming image
            const newImg = document.createElement('img');
            newImg.style.borderRadius = '25px';

            // Apply sizing styles and initial off-screen position for slide-in
            if (useSameSize && imageWrapper.modalFirstImageWidth && imageWrapper.modalFirstImageHeight) {
                newImg.style.cssText = `
                            width: ${imageWrapper.modalFirstImageWidth}px !important;
                            height: ${imageWrapper.modalFirstImageHeight}px !important;
                            object-fit: cover;
                            opacity: 1; 
                            transform: ${direction === 'prev' ? 'translateX(-100%)' : 'translateX(100%)'}; /* Off-screen */
                            transition: transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.2s ease-in; /* Slide and fade */
                        `;
            } else {
                newImg.style.cssText = `
                            width: 100% !important;
                            height: auto !important;
                            max-width: 90vw;
                            max-height: 90vh;
                            opacity: 1; 
                            transform: ${direction === 'prev' ? 'translateX(-100%)' : 'translateX(100%)'}; /* Off-screen */
                            transition: transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.2s ease-in; /* Slide and fade */
                        `;
            }

            // This function finalizes the image swap and starts the slide-in animation
            const performImageSwapAndAnimate = () => {
                // Update currentIndex and gallery counter NOW that we're about to show the new image
                currentIndex = targetIndex;
                const galleryCounter = modalContent.querySelector('.gallery-counter');
                if (galleryCounter) {
                    galleryCounter.textContent = `${currentIndex + 1}/${totalImages}`;
                }

                // Cleanly replace the old image with the new one
                if (currentImgElement && currentImgElement.parentNode) {
                    currentImgElement.parentNode.replaceChild(newImg, currentImgElement);
                } else {
                    // If there's no current image (e.g., first load), just append
                    modalContent.appendChild(newImg);
                }
                setTimeout(() => {
                    newImg.style.transform = 'translateX(0)';
                }, 10);

                // Sync back to main gallery wrapper
                imageWrapper.currentIndex = currentIndex;
            };

            // Check if we have a preloaded image
            if (modalPreloadedImages[targetIndex] && modalPreloadedImages[targetIndex].complete) {
                modalPreloadedImages[targetIndex].decode().then(() => {
                    newImg.src = modalPreloadedImages[targetIndex].src;
                    performImageSwapAndAnimate();
                }).catch(() => {
                    //console.error(`❌ Failed to decode preloaded image ${targetIndex + 1}`);
                    return;
                });
            } else {
                // Single fallback: load on-demand
                const proxyUrl = getImageUrl(imageUrl)
                newImg.onload = () => performImageSwapAndAnimate();
                newImg.onerror = () => {
                    console.error(`❌ Failed to load image ${targetIndex + 1}`);
                    return;
                };
                newImg.src = proxyUrl;
            }

            // Let tryGalleryPatch handle preloading by updating its current index
            imageWrapper.currentIndex = targetIndex;
        };

        // Click handlers for navigation arrows
        leftArrow.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateModalGallery('prev');
        });

        leftArrow.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                navigateModalGallery('prev');
            }
        });

        rightArrow.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateModalGallery('next');
        });

        rightArrow.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                navigateModalGallery('next');
            }
        });

                                const hasGallery = galleryData && galleryData.length > 1;
                
                // Swipe down to close on mobile
                if (isMobile) {
                let swipeDownStartX = 0;
                let swipeDownStartY = 0;
                const SWIPE_DOWN_THRESHOLD = 80;
                
                modalOverlay.addEventListener('touchstart', (e) => {
                swipeDownStartX = e.touches[0].clientX;
                swipeDownStartY = e.touches[0].clientY;
                }, { passive: true });
                
                modalOverlay.addEventListener('touchend', (e) => {
                const diffY = e.changedTouches[0].clientY - swipeDownStartY;
                const diffX = Math.abs(e.changedTouches[0].clientX - swipeDownStartX);
                if (diffY > SWIPE_DOWN_THRESHOLD && diffX < diffY) {
                    closeModal();
                }
                });
                }
                
                // Add swipe support for modal gallery on mobile
                if (hasGallery && isMobile) {
            let modalTouchStartX = 0;
            let modalTouchStartY = 0;
            let modalSwipeDirection = null;
            const MODAL_SWIPE_THRESHOLD = 70;
        
            modalOverlay.addEventListener('touchstart', (e) => {
                modalTouchStartX = e.touches[0].clientX;
                modalTouchStartY = e.touches[0].clientY;
                modalSwipeDirection = null;
            }, { passive: true });
        
            modalOverlay.addEventListener('touchmove', (e) => {
                if (modalSwipeDirection === null) {
                    const diffX = Math.abs(e.touches[0].clientX - modalTouchStartX);
                    const diffY = Math.abs(e.touches[0].clientY - modalTouchStartY);
                    if (diffX > 5 || diffY > 5) {
                        modalSwipeDirection = diffX > diffY ? 'horizontal' : 'vertical';
                    }
                }
                if (modalSwipeDirection === 'horizontal') {
                    e.preventDefault();
                }
            }, { passive: false });
        
            modalOverlay.addEventListener('touchend', (e) => {
                const swipeDistance = e.changedTouches[0].clientX - modalTouchStartX;
                if (modalSwipeDirection === 'horizontal' && Math.abs(swipeDistance) > MODAL_SWIPE_THRESHOLD) {
                    navigateModalGallery(swipeDistance > 0 ? 'prev' : 'next');
                }
            });
        }

                // Swipe down to close on mobile
        if (isMobile) {
            let swipeDownStartX = 0;
            let swipeDownStartY = 0;
            const SWIPE_DOWN_THRESHOLD = 80;
        
            modalOverlay.addEventListener('touchstart', (e) => {
                swipeDownStartX = e.touches[0].clientX;
                swipeDownStartY = e.touches[0].clientY;
            }, { passive: true });
        
            modalOverlay.addEventListener('touchend', (e) => {
                const diffY = e.changedTouches[0].clientY - swipeDownStartY;
                const diffX = Math.abs(e.changedTouches[0].clientX - swipeDownStartX);
                if (diffY > SWIPE_DOWN_THRESHOLD && diffX < diffY) {
                    closeModal();
                }
            });
        }
        
        if (hasGallery) {
            // Add arrows to container
            modalContainer.appendChild(leftArrow);
            modalContainer.appendChild(rightArrow);

            // Animate in arrows
            leftArrow.style.opacity = '0';
            rightArrow.style.opacity = '0';
            leftArrow.style.transition = 'opacity 0.1s ease';
            rightArrow.style.transition = 'opacity 0.1s ease';
        }

        // Add container to overlay
        modalOverlay.appendChild(modalContainer);

        document.body.appendChild(modalOverlay);

                document.body.style.overflow = 'hidden';
        
                                                                // Prevent page scroll behind modal on mobile, but allow pinch-to-zoom
                                const preventScroll = (e) => {
                                    if (e.touches.length === 1) e.preventDefault();
                                };
                                if (isMobile) {
                                    modalOverlay.addEventListener('touchmove', preventScroll, { passive: false });
                                }

        // Add scroll-to-zoom functionality
        let currentZoom = 1;
        let zoomOriginX = 50; // Start at center
        let zoomOriginY = 50; // Start at center

        modalOverlay.addEventListener('wheel', function (e) {
            e.preventDefault();
            e.stopPropagation();

            // Get mouse position relative to modalContent
            const rect = modalContent.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Update zoom origin to current mouse position SMOOTHLY
            const percentX = (mouseX / rect.width) * 100;
            const percentY = (mouseY / rect.height) * 100;

            // Gradually shift the origin instead of jumping
            zoomOriginX += (percentX - zoomOriginX) * 0.3;
            zoomOriginY += (percentY - zoomOriginY) * 0.3;

            // Calculate zoom change
            const zoomDelta = e.deltaY > 0 ? -0.12 : 0.12;
            const newZoom = Math.min(Math.max(1, currentZoom + zoomDelta), 5);

            if (newZoom !== currentZoom) {
                currentZoom = newZoom;

                // Apply zoom with smooth origin
                modalContent.style.transformOrigin = `${zoomOriginX}% ${zoomOriginY}%`;
                modalContent.style.transform = `scale(${currentZoom})`;
                modalContent.style.transition = 'transform 0.1s ease';

                if (currentZoom > 1) {
                    modalOverlay.style.overflow = 'hidden';
                } else {
                    modalOverlay.style.overflow = 'hidden';
                }
            }
        }, { passive: false });

        // Reset zoom when modal closes
        const originalCloseModal = closeModal;
        closeModal = function () {
            currentZoom = 1;
            zoomOriginX = 50;
            zoomOriginY = 50;
            originalCloseModal();
        };

        // Keyboard zoom shortcuts
        document.addEventListener('keydown', function (e) {
            // Only if modal is open
            if (!document.body.contains(modalOverlay)) return;

            let zoomChanged = false;
            let newZoom = currentZoom;

            // + or = to zoom in
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                newZoom = Math.min(currentZoom + 0.25, 5);
                zoomChanged = true;
            }
            // - to zoom out
            else if (e.key === '-') {
                e.preventDefault();
                newZoom = Math.max(currentZoom - 0.25, 1);
                zoomChanged = true;
            }
            // 0 to reset zoom
            else if (e.key === '0') {
                e.preventDefault();
                newZoom = 1;
                zoomOriginX = 50;
                zoomOriginY = 50;
                zoomChanged = true;
            }

            // Arrow keys for gallery navigation
            else if (e.key === 'ArrowLeft' && hasGallery) {
                e.preventDefault();
                navigateModalGallery('prev');
            }
            else if (e.key === 'ArrowRight' && hasGallery) {
                e.preventDefault();
                navigateModalGallery('next');
            }

            if (zoomChanged && newZoom !== currentZoom) {
                currentZoom = newZoom;
                modalContent.style.transformOrigin = `${zoomOriginX}% ${zoomOriginY}%`;
                modalContent.style.transform = `scale(${currentZoom})`;
                modalContent.style.transition = 'transform 0.2s ease';

                if (currentZoom > 1) {
                    modalOverlay.style.overflow = 'hidden';
                } else {
                    modalOverlay.style.overflow = 'hidden';
                }
            }
        });

        trapFocus(modalOverlay);

        // Save global ref
        window.currentModalOverlay = modalOverlay;
        
        // Trigger opening animation
        setTimeout(() => {
            const mobileOffset = isMobile ? 'translateY(-5vh)' : 'translateY(0)';
            modalContent.style.transition = 'none';
            modalContent.style.opacity = '0';
            modalContent.style.transform = `scale(0.5) ${mobileOffset}`;

            // Force reflow
            modalContent.getBoundingClientRect();

            modalContent.style.transition = `opacity ${isMobile ? '0.2s' : '0.1s'} ease, transform ${isMobile ? '0.2s' : '0.1s'} ease`;
            modalContent.style.opacity = '1';
            modalContent.style.transform = `scale(1) ${mobileOffset}`;
            modalOverlay.style.backgroundColor = 'rgba(0,0,0,0.8)';
            leftArrow.style.opacity = '1';
            rightArrow.style.opacity = '1';
        }, 10);

        // Capture modal image dimensions after animation
        setTimeout(() => {
            const modalImg = modalContent.querySelector('img');
            if (modalImg) {
                imageWrapper.modalFirstImageWidth = modalImg.offsetWidth;
                imageWrapper.modalFirstImageHeight = modalImg.offsetHeight;
            }
        }, 50);

        // Close modal function
        function closeModal() {
        videoProcessingAborted = true; // Stop any ongoing video processing
            
            // Hard reset to index 0 when modal closes
            imageWrapper.currentIndex = 0;

            // Immediately hide the navigation arrows
            const leftArrow = modalOverlay.querySelector('.modal-nav-left');
            const rightArrow = modalOverlay.querySelector('.modal-nav-right');
            if (leftArrow) leftArrow.style.display = 'none';
            if (rightArrow) rightArrow.style.display = 'none';

            modalOverlay.style.backgroundColor = 'rgba(0,0,0,0)';
            modalContent.style.opacity = '0';
            modalContent.style.transform = 'scale(0.8)';
            setTimeout(() => {
                if (document.body.contains(modalOverlay)) {
                    document.body.removeChild(modalOverlay);
                }
                // Restore focus to the opener
                if (window.currentModalOpener && document.body.contains(window.currentModalOpener)) {
                    window.currentModalOpener.focus();
                    window.currentModalOpener = null;
                }
            }, 300);
        }

        // ESC key handler
        function handleEscKey(event) {
            if (event.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscKey);
            }
        }
        document.addEventListener('keydown', handleEscKey);

                                // Background click handler - updated to not close when clicking arrows
                modalOverlay.addEventListener('click', function (event) {
                    // Don't close if clicking on video controls, video itself, or navigation arrows
                    if (!isMobile && event.target.closest('video, .plyr, .plyr__controls, .js-player, .modal-nav-arrow')) {
                        return;
                    }
                
                    // On mobile, don't close if video is active (has src and loading overlay is gone)
                    if (isMobile && event.target.closest('video, .plyr, .plyr__controls, .js-player')) {
                        const activeVideo = modalOverlay.querySelector('video');
                        const stillLoading = modalOverlay.querySelector('.loading-overlay');
                        if (activeVideo && activeVideo.src && !stillLoading) {
                            return;
                        }
                    }
                
                    // Don't close if clicking on the modal content itself, unless it's the loading overlay
                    if (!isMobile && event.target.closest('.modal-container') && 
                        !event.target.classList.contains('modal-overlay') &&
                        !event.target.closest('.loading-overlay')) {
                        return;
                    }
                
                    closeModal();
                });
    });
}

class ImageHandler {
    constructor() {

        this.knownMediaDomains = [
            "i.redd.it", "v.redd.it", "streamable.com", "imgur.com", "preview.redd.it",
            "reddit.com", "wikipedia.com", "gfycat.com", "redgifs.com", "tenor.com",
            "youtube.com", "youtu.be"
        ];

        this.badThumbs = new Set(['self', 'default', 'nsfw', 'spoiler', 'image', '']);
        this.failureCount = new Map(); // Track failures per post
    }

    // Determine if post needs backend scraping
    shouldUseBackendScraper(post) {
        const domain = post.domain || this.getDomainFromUrl(post.url);
        const isGarbageThumb = this.badThumbs.has((post.thumbnail || '').toLowerCase());
        const isSelfPost = post.is_self || (post.domain || '').startsWith('self.');
        const isLinkPost = !isSelfPost;
        const isBareLink = post.selftext === "";
        const isRedditMedia = this.isRedditMediaUrl(post.url);
        const isKnownMediaDomain = this.knownMediaDomains.includes(domain);

        return (
            isLinkPost &&
            isBareLink &&
            isGarbageThumb &&
            !isRedditMedia &&
            (!isKnownMediaDomain || domain === 'youtube.com')
        );
    }

    // Check if URL is Reddit media
    isRedditMediaUrl(url) {
        if (!url) return false;
        return url.includes('v.redd.it') ||
            url.includes('i.redd.it') ||
            url.includes('gfycat.com') ||
            url.includes('imgur.com') ||
            url.includes('/comments/') ||
            url.includes('redgifs.com') ||
            url.endsWith('.gif') ||
            url.endsWith('.mp4') ||
            url.endsWith('.webm');
    }

    // Extract domain from URL
    getDomainFromUrl(url) {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return '';
        }
    }

    // Helper function to check if URL is a Reddit domain
    isRedditDomain(url) {
        if (!url) return false;
        const redditDomains = ['i.redd.it', 'v.redd.it', 'reddit.com', 'preview.redd.it', 'external-preview.redd.it'];
        return redditDomains.some(domain => url.includes(domain));
    }

    // Handle image loading with retry logic
    async handleImageLoad(post, resultCard) {
        const postId = post.id;

        // Don't handle images for text posts UNLESS they have extracted media
        if ((post.is_self || (post.domain || '').startsWith('self.')) && !post.url.includes('i.redd.it')) {
            return;
        }

        // Skip Reddit image domains entirely
        if (this.isRedditDomain(post.url)) {
            return;
        }

        const shouldScrape = this.shouldUseBackendScraper(post);

        if (shouldScrape) {
            await this.handleBackendScrapedImage(post, resultCard);
        } else {
            await this.handleDirectImage(post, resultCard);
        }
    }

    // Handle backend-scraped images
    async handleBackendScrapedImage(post, resultCard) {
        const postId = post.id;

        try {
            // Try cached first
            const cached = await this.getCachedImage(postId);
            if (cached.success && cached.data.thumbnail) {
                this.updateImageSuccess(resultCard, cached.data.thumbnail);
                this.createLinkPreview(post, resultCard);
                return;
            }

            // Try scraping
            const scraped = await this.scrapeImage(post);
            if (scraped.success && scraped.data?.thumbnail) {
                this.updateImageSuccess(resultCard, scraped.data.thumbnail);
                this.updateCache(postId, scraped);
                this.createLinkPreview(post, resultCard);
                return;
            }

            // Failed - increment counter and maybe show news icon
            this.handleImageFailure(postId, resultCard);

        } catch (error) {
            console.error('❌ Backend image handling failed:', error);
            this.handleImageFailure(postId, resultCard);
        }
    }

    // Handle direct images (non-scraped)
    async handleDirectImage(post, resultCard) {
        // Skip Reddit domains
        if (this.isRedditDomain(post.url)) {
            return;
        }

        // Save to backend for analytics/caching WITHOUT scraping
        try {
            await fetch(`${API_BASE}/api/save-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reddit_post_id: post.id,
                    subreddit: post.subreddit,
                    title: post.title,
                    url: post.url,
                    thumbnail: post.thumbnail
                })
            });
        } catch (error) {
            console.log('⚠️ Backend save failed (non-critical):', error);
        }
    }

    // Handle image failure with retry logic
    handleImageFailure(postId, resultCard) {
        const failures = this.failureCount.get(postId) || 0;
        this.failureCount.set(postId, failures + 1);

        // Show news icon immediately for backend scraping failures
        if (failures >= 2) {
            this.showNewsIcon(resultCard);
        } else {
            this.hideShimmer(resultCard);
        }
    }

    // Update image on success
    updateImageSuccess(resultCard, thumbnailUrl) {
        const image = resultCard.querySelector('img.result-image');
        image.style.opacity = '0';
        image.style.transition = 'opacity 0.3s ease-in-out';
        if (!image) return;

        const proxyUrl = getImageUrl(thumbnailUrl)
        let hasRetried = false;

        const handleLoad = () => {
            // Get shimmer element
            const shimmer = resultCard.querySelector('.image-placeholder');

            // Add styling class
            image.classList.add('show');

            // Make image visible but still transparent
            image.style.display = 'block';

            // Handle fade transitions simultaneously
            if (shimmer) {
                shimmer.style.opacity = '0';
                shimmer.style.transition = 'opacity 0.3s ease-in-out';

                setTimeout(() => {
                    shimmer.style.display = 'none';
                }, 300);
            }

            // Small delay to ensure display:block is applied, then fade in
            setTimeout(() => {
                image.style.opacity = '1';
            }, 10);

            // Make container visible
            const container = resultCard.querySelector('.img-container');
            if (container) container.style.visibility = 'visible';

            // Set up modal for scraped images  
            const imgWrapper = resultCard.querySelector('.image-wrapper');
            if (imgWrapper && !imgWrapper._hasModalSetup) {
                setupImageModal(imgWrapper);
                imgWrapper._hasModalSetup = true;
            }
        };

        const handleError = () => {
            if (!hasRetried) {
                hasRetried = true;
                image.src = thumbnailUrl; // Try raw URL without proxy
            } else {
                this.handleImageFailure(resultCard.dataset.postId, resultCard);
            }
        };

        // Check if image is already cached/loaded
        if (image.complete && image.naturalWidth > 0) {
            handleLoad();
        } else {
            image.addEventListener('load', handleLoad);
            image.addEventListener('error', handleError);
        }

        image.src = proxyUrl; // Start with proxy
    }

    // Show news icon
    showNewsIcon(resultCard) {
        const imgContainer = resultCard.querySelector('.img-container');
        const shimmer = resultCard.querySelector('.image-placeholder');

        if (shimmer) {
            shimmer.classList.add('hide');
            setTimeout(() => shimmer.style.display = 'none', 300);
        }

        if (imgContainer && !imgContainer.querySelector('.news-icon')) {
            showNewsIcon(imgContainer, shimmer); // Your existing function
        }
    }

    // Hide shimmer animation
    hideShimmer(resultCard) {
        const shimmer = resultCard.querySelector('.image-placeholder');
        if (shimmer) {
            shimmer.classList.add('hide');
            setTimeout(() => shimmer.style.display = 'none', 300);
        }
    }

    // API calls
    async getCachedImage(postId) {
        const response = await fetch(`${API_BASE}/api/get-cached-image/${postId}`);
        return await response.json();
    }

    // Updated scrapeImage function
    async scrapeImage(post) {
        // Skip Reddit domains
        if (this.isRedditDomain(post.url)) {
            return { success: false, message: 'Skipped Reddit domain' };
        }

        const response = await fetch(`${API_BASE}/api/save-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                reddit_post_id: post.id,
                subreddit: post.subreddit,
                title: post.title,
                url: post.url,
                thumbnail: post.thumbnail
            })
        });
        const text = await response.text();
        if (response.ok) {
            return JSON.parse(text);
        } else {
            console.error('Error:', text);
            return { success: false, message: 'Failed' };
        }
    }

    // Update cache
    updateCache(postId, data) {
        window.cachedPostsById = window.cachedPostsById || {};
        window.cachedPostsById[postId] = data;
    }

    // Create link preview for scraped posts
    createLinkPreview(post, resultCard) {
        if (resultCard.querySelector('.link-preview-card')) return;

        const domain = this.getDomainFromUrl(post.url);
        const linkPreview = document.createElement('div');
        linkPreview.className = 'link-preview-card';
        linkPreview.style.position = 'absolute';
        linkPreview.style.opacity = '0';
        linkPreview.style.transition = 'opacity 0.2s ease-in-out';
        linkPreview.innerHTML = `
        <div class="link-preview-container">
            <span class="link-domain">${domain}</span>
            <a href="${post.url}" target="_blank" rel="noopener noreferrer" class="link-preview-btn">
                Open
            </a>
        </div>
    `;

        if (window.innerWidth <= 1024) {
            // Mobile — insert overlay badge on the thumbnail
            const mediaContainer = resultCard.querySelector('.img-container');
            if (mediaContainer) {
                mediaContainer.before(linkPreview);
                mediaContainer.style.position = 'relative';
                const overlay = document.createElement('a');
                overlay.className = 'compact-open-overlay';
                overlay.href = post.url;
                overlay.target = '_blank';
                overlay.rel = 'noopener noreferrer';
                overlay.style.pointerEvents = 'auto';
                overlay.innerHTML = '<img src="/assets/icons8-open.svg" style="width:16px;height:16px;display:block;" />';
                mediaContainer.appendChild(overlay);
            }
        } else {
            // Desktop
            const resultAction = resultCard.querySelector('.result-actions');
            if (resultAction) {
                resultAction.after(linkPreview);
            }
        }

        setTimeout(() => {
            linkPreview.style.opacity = '1';
        }, 10);
    }
}

function showNewsIcon(imgWrapper, shimmer) {
    // Hide shimmer if it exists
    if (shimmer) {
        shimmer.style.display = 'none';
    }

    // Also try to find shimmer directly if not passed
    if (!shimmer) {
        const foundShimmer = imgWrapper.querySelector('.image-placeholder');
        if (foundShimmer) {
            foundShimmer.style.display = 'none';
        }
    }

    // Find and remove the existing result-image
    const existingImg = imgWrapper.querySelector('.result-image');
    if (existingImg) {
        existingImg.remove();
    }

    // Create and show news icon
    const newsIcon = document.createElement('div');
    newsIcon.className = 'news-icon-fallback';
    newsIcon.setAttribute('aria-label', 'Article thumbnail');
    newsIcon.style.opacity = '0';
    newsIcon.style.transition = 'opacity 0.3s ease-in-out';
    imgWrapper.appendChild(newsIcon);

    // Fade in news icon
    setTimeout(() => {
        newsIcon.style.opacity = '1';
    }, 10);
}

function tryMediaPatch(fPost, resultCard, attempt = 1) {
    const cacheKey = fPost.url;
    const cached = window.cachedMediaByUrl[cacheKey];

    // 🕗 If cache isn't ready yet, wait for it
    if (!window.cachedMediaByUrl) {
        document.addEventListener('cachedPostsReady', () => {
            tryMediaPatch(fPost, resultCard, attempt);
        }, { once: true });
        return;
    }

    if (!cached) {
        if (attempt < 10) { // Increased retry attempts
            setTimeout(() => tryMediaPatch(fPost, resultCard, attempt + 1), 200); // Longer wait
        } else {
            // console.warn(`⚠️ No cached media found after ${attempt} tries for ${cacheKey}`);
        }
        return;
    }

    // Preserve original URL before overwriting
    if (!fPost.originalUrl) {
        fPost.originalUrl = fPost.url;
    }

    // Patch media fields from cache with safety checks
    fPost.animated = cached.animated !== undefined ? cached.animated : fPost.animated;
    fPost.frame_count = cached.frame_count !== undefined ? cached.frame_count : fPost.frame_count;
    fPost.duration = cached.duration !== undefined ? cached.duration : fPost.duration;
    fPost.url = cached.url || fPost.url;

    const imgContainer = resultCard.querySelector('.img-container');
    const imgWrapper = resultCard.querySelector('.image-wrapper');
    if (!imgContainer || !imgWrapper) return;

    if (imgContainer.style.visibility === 'hidden') {
        imgContainer.style.visibility = 'visible';
    }

    let shimmer = resultCard.querySelector('.image-placeholder');
    if (!shimmer) {
        shimmer = document.createElement('div');
        shimmer.className = 'image-placeholder shimmer';
        imgWrapper.prepend(shimmer);
    } else {
        shimmer.style.display = 'block';
    }

    const fallbackURL = getImageUrl(cached.url)
    const mediaElement = resultCard.querySelector('.result-image');
    if (!mediaElement) {
        console.warn(`❌ No media element found for URL key: ${cacheKey}`);
        return;
    }

    // Check if image-wrapper exists, create if missing
    if (!imgWrapper) {
        // Create the missing wrapper structure
        imgWrapper = document.createElement('div');
        imgWrapper.className = 'image-wrapper';
        imgWrapper.style.cursor = 'pointer';

        // Move the image inside the wrapper
        const parent = mediaElement.parentNode;
        parent.insertBefore(imgWrapper, mediaElement);
        imgWrapper.appendChild(mediaElement);
    }

    mediaElement.onerror = () => {
        mediaElement.src = cached.url;
    };

    mediaElement.onload = () => {
        shimmer.style.display = 'none';
        mediaElement.classList.add('show');
    };

    mediaElement.src = fallbackURL;

    // Detect media types
    const isGif = mediaElement.src?.toLowerCase().includes('gif');
    const isActuallyAnimated = fPost.animated === true;
    const isVideo = fPost.is_video ||
        (fPost.domain && fPost.domain.includes('youtu')) ||
        (fPost.url && fPost.url.includes('v.redd.it')) ||
        (fPost.domain && fPost.domain.includes('streamable')) ||
        (fPost.url && fPost.url.endsWith('.gifv'));
}

function classifyContentType(post) {
    // Text detection first 
    if (post.is_self === true) return 'text';
    if (post.domain && post.domain.startsWith('self.')) return 'text';
    if (post.url && post.url.includes('/comments/')) return 'text';

    // Video detection
    if (post.is_video === true) return 'video';
    const videoDomains = ['youtube.com', 'youtu.be', 'streamable.com', 'twitch.tv', 'vimeo.com', 'gfycat.com', 'v.redd.it', 'redgifs.com'];
    if (post.domain && videoDomains.some(domain => post.domain.includes(domain))) {
        return 'video';
    }

    // Playable/static GIF detection
    const isActuallyAnimated = post.animated === true;
    const isGalleryGif = (
        post.media_metadata &&
        typeof post.media_metadata === 'object' &&
        Object.values(post.media_metadata).some(item => item.e === 'AnimatedImage')
    );
    const isVideo = post.is_video ||
        (post.domain && post.domain.includes('youtu')) ||
        (post.url && post.url.includes('v.redd.it')) ||
        (post.domain && post.domain.includes('streamable')) ||
        (post.domain && post.domain.includes('redgifs.com')) ||
        (post.url && post.url.endsWith('.gifv'));

    // Same condition as play icon: if it would get a play icon, it's "video"
    if (isGalleryGif || (isVideo && !isActuallyAnimated)) {
        return 'video';
    }

    // Picture detection
    if (post.is_gallery === true) return 'image';
    if (post.preview && post.preview.images && post.preview.images.length > 0) return 'image';
    if (post.media_metadata && Object.keys(post.media_metadata).length > 0) return 'image';

    // First check actual image domains
    const imageDomains = ['i.redd.it', 'imgur.com', 'preview.redd.it'];
    if (post.domain && imageDomains.includes(post.domain)) {
        return 'image';
    }

    // URL extension check for direct image links
    if (post.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(post.url)) {
        return 'image';
    }

    // If it's not i.redd.it and not a video domain, it's probably external/news = image
    if (post.domain && post.domain !== 'i.redd.it' && !videoDomains.some(domain => post.domain.includes(domain))) {
        return 'image';
    }

    return 'text';
}

function classifyPostMedia(post, domain) {

    const badThumbs = new Set(['self', 'default', 'nsfw', 'spoiler', 'image', '']);
    const normalizedThumb = (post.thumbnail || '').toLowerCase();
    const isGarbageThumb = badThumbs.has(normalizedThumb);

    const knownMediaDomains = [
        "i.redd.it", "v.redd.it", "streamable.com", "imgur.com", "preview.redd.it", "reddit.com", "wikipedia.com",
        "gfycat.com", "redgifs.com", "tenor.com", "youtube.com", "youtu.be"
    ];

    const isKnownMediaDomain = knownMediaDomains.includes(domain);
    const isSelfPost = post.is_self || (post.domain || '').startsWith('self.');
    const isLinkPost = !isSelfPost;
    const isBareLink = post.selftext === "";
    const isRedditMedia =
        post.url?.includes('v.redd.it') ||
        post.url?.includes('i.redd.it') ||
        post.url?.includes('gfycat.com') ||
        post.url?.includes('imgur.com') ||
        post.url?.includes('redgifs.com') ||
        post.url?.endsWith('.gif') ||
        post.url?.endsWith('.mp4') ||
        post.url?.endsWith('.webm');

    const shouldSaveToBackend = (
        isLinkPost &&
        isBareLink &&
        isGarbageThumb &&
        !isRedditMedia &&
        (!isKnownMediaDomain || domain === 'youtube.com')
    );

    let thumbnailURL = getThumbnailUrl(post);

    // YOUTUBE THUMBNAIL LOGIC 
    if (domain === 'youtube.com' || domain === 'youtu.be') {
        const youtubeThumb = getYouTubeThumbnail(post.url);
        if (youtubeThumb) {
            thumbnailURL = youtubeThumb;
        }
    }

    // Special handling for Reddit videos without preview
    if (!thumbnailURL && post.url && post.url.includes('v.redd.it')) {
        const videoId = post.url.split('/').pop();
        thumbnailURL = `https://v.redd.it/${videoId}/DASH_480.mp4`;
    }

    const hasPreviewImage = post.preview?.images?.[0]?.source?.url;
    const isVideo = post.is_video ||
        (post.domain && post.domain.includes('youtu')) ||
        (post.url && post.url.includes('v.redd.it')) ||
        (post.domain && post.domain.includes('streamable')) ||
        (post.url && post.url.endsWith('.gifv'));
    const isGalleryWithData = post.is_gallery && post.gallery_data && post.media_metadata;

    const isGarbage = !thumbnailURL || ['self', 'default', 'nsfw', 'spoiler', 'image'].includes(thumbnailURL.toLowerCase());
    const hasVisualMedia = (!isGarbage || isGalleryWithData || isVideo || shouldSaveToBackend ||
        hasPreviewImage || !post.is_self || !domain.startsWith('self.'));

    return {
        thumbnailURL,
        hasVisualMedia,
        shouldSaveToBackend
    };
}

function getImageUrl(url) {
    if (url.includes('i.redd.it') || url.includes('preview.redd.it') || url.includes('v.redd.it')) {
        return url;
    }
    return `${IMAGE_PROXY_BASE}/image?url=${encodeURIComponent(url)}&t=${Date.now()}`;
}

function getYouTubeThumbnail(url) {
    // Extract video ID from various YouTube URL formats
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);

    if (match && match[1]) {
        const videoId = match[1];
        return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }

    return null;
}

function analyzeGalleryAspectRatios(galleryData, mediaMetadata) {
    const aspectRatios = [];

    for (const item of galleryData) {
        const media = mediaMetadata[item.media_id];
        if (media?.s?.x && media?.s?.y) {
            aspectRatios.push(media.s.x / media.s.y);
        }
    }

    if (aspectRatios.length < 2) return { useSameSize: false };

    const maxRatio = Math.max(...aspectRatios);
    const minRatio = Math.min(...aspectRatios);
    const variance = (maxRatio - minRatio) / minRatio;

    const useSameSize = variance <= 0.2; // Within 15%

    return { useSameSize };
}

function mediaGalleryFirstAid(post, resultCard) {
    // Patch media on timeout
    tryMediaPatch(post, resultCard);
    setTimeout(() => {
        addPlayIconIfNeeded(post, resultCard);
    }, 100);

    // Gallery post check, trigger gallery patch if needed
    if (post.is_gallery && post.gallery_data && post.media_metadata) {
        setTimeout(() => {
            tryGalleryPatch(post, post.permalink, resultCard);
        }, 0);
    }
}