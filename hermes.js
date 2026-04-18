let isTalking = false;
let mouthTimeout;
let isScrambled = false;
let hermesLineCount = 0;
let animationsEnabled = true;
let isSleeping = false;
let blinkTimer1, blinkTimer2, blinkTimer3;
let sleepTimer;
let hermesEnabled = true;
let currentPriority = 0;
let blinkTimeout;
let clickCount = 0;
let firstClickTime = 0;
let isBlocked = false;

// Single blink (e.g., on mouseover)
function singleBlink() {
    if (isMobile()) return;
    if (!animationsEnabled || isSleeping) return;

    const img = document.querySelector('.hermes-cat');
    if (!img) return;
    img.src = '/assets/hermes-blink.png';
    setTimeout(() => {
        if (!isSleeping) img.src = '/assets/hermes.png';
    }, 150);
}

// Random automatic blinking
function randomBlink() {
    if (isMobile()) return;
    if (!animationsEnabled || isSleeping) return;
    const img = document.querySelector('.hermes-cat');
    if (!img) return; 

    // First blink
    img.src = '/assets/hermes-blink.png';
    setTimeout(() => {
        if (!isSleeping) img.src = '/assets/hermes.png';
    }, 150);
    // Random delay between double blinks (500–2000ms)
    const delayBetween = Math.random() * 1500 + 500;
    blinkTimer1 = setTimeout(() => {
        if (!isSleeping) {
            img.src = '/assets/hermes-blink.png';
            setTimeout(() => {
                if (!isSleeping) img.src = '/assets/hermes.png';
            }, 150);
        }
    }, delayBetween);
    // Random delay until next double blink (5–13 seconds)
    const nextBlink = Math.random() * 8000 + 5000;
    blinkTimer2 = setTimeout(randomBlink, nextBlink);
}
// Start automatic blinking when page loads
if (document.querySelector('.hermes-cat')) {
    randomBlink();
}

// Mouseover triggers a single blink
document.querySelector('.hermes-cat')?.addEventListener('mouseover', singleBlink);

// Sleep timer logic: go to sleep after inactivity
function resetSleepTimer() {
    clearTimeout(sleepTimer);

    if (isSleeping) wakeUp();

    sleepTimer = setTimeout(() => {
        if (!isSleeping) startSleeping();
    }, 60000); // 60 seconds 
}

// Start sleep
function startSleeping() {
    isSleeping = true;
    // Clear all blink timers
    clearTimeout(blinkTimer1);
    clearTimeout(blinkTimer2);
    clearTimeout(blinkTimer3);

    // Start the repeated slow Zzz...
    loopZzz();

    sleepAnimation();
}

function loopZzz() {
    if (!isSleeping) return;

    const bubble = document.getElementById('hermes-speech');
    const textElement = bubble.querySelector('.speech-text');
    bubble.classList.remove('hidden');
    typewriterEffect(textElement, "Zzz...", 600);

    // After it finishes, call again
    setTimeout(loopZzz, "Zzz...".length * 600 + 1000);
}

// Wake up
function wakeUp() {
    if (isMobile()) return;
    isSleeping = false;
    const img = document.querySelector('.hermes-cat');
    img.src = '/assets/hermes.png';

    // Hide speech bubble
    const bubble = document.getElementById('hermes-speech');
    bubble.classList.add('hidden');

    // Restart normal blinking
    randomBlink();
}


function sleepAnimation() {
    if (isMobile()) return;
    if (!animationsEnabled || !isSleeping) return;
    const img = document.querySelector('.hermes-cat');
    if (!img) return;

    img.src = '/assets/hermes-blink.png';

    setTimeout(() => {
        const img = document.querySelector('.hermes-cat');
        if (!img) return;
        img.src = '/assets/hermes-sleep2.png';
    }, 400);

    setTimeout(() => {
        const img = document.querySelector('.hermes-cat');
        if (!img) return;
        img.src = '/assets/hermes-sleep3.png';
    }, 800);

    setTimeout(() => {
        const img = document.querySelector('.hermes-cat');
        if (!img) return;
        img.src = '/assets/hermes-sleep4.png';
    }, 1300);

    setTimeout(() => {
        const img = document.querySelector('.hermes-cat');
        if (!img) return;
        img.src = '/assets/hermes-sleep3.png';
    }, 1900);

    setTimeout(() => {
        const img = document.querySelector('.hermes-cat');
        if (!img) return;
        img.src = '/assets/hermes-sleep2.png';
    }, 2500);

    setTimeout(() => {
        const img = document.querySelector('.hermes-cat');
        if (!img) return;
        img.src = '/assets/hermes-blink.png';
        if (isSleeping) {
            setTimeout(sleepAnimation, 800);
        }
    }, 3200);
}

['mousemove', 'keypress', 'click', 'scroll'].forEach(event =>
    document.addEventListener(event, resetSleepTimer)
);

if (document.querySelector('.hermes-cat')) {
    resetSleepTimer();
}

let currentTypewriterTimeout;

function typewriterEffect(element, text, speed = 30) {
    if (!animationsEnabled) {
        // Just show the text instantly
        element.textContent = text;
        return;
    }
    // Only clear existing typewriter 80% of the time
    if (Math.random() < 0.80) {
        clearTimeout(currentTypewriterTimeout);
    }

    element.textContent = '';
    let i = 0;
    function typeChar() {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            currentTypewriterTimeout = setTimeout(typeChar, speed);
        }
    }
    typeChar();
}

function showSpeechBubble(messages, priority = 1) {
    if (!hermesEnabled) return;
    if (priority < currentPriority) return;
    currentPriority = priority;

    const bubble = document.getElementById('hermes-speech');
    if (!bubble) return;

    const textElement = bubble.querySelector('.speech-text');
    const message = Array.isArray(messages) ?
        messages[Math.floor(Math.random() * messages.length)] : messages;

    if (message.length > 27) {
        let cutPoint = 27;
        while (cutPoint > 0 && message[cutPoint] !== ' ') {
            cutPoint--;
        }
        if (cutPoint === 0) cutPoint = 27;
        const firstPart = message.substring(0, cutPoint);
        const remainingPart = message.substring(cutPoint + 1);

        bubble.classList.remove('hidden');
        startTalking();
        typewriterEffect(textElement, firstPart, 50);

        setTimeout(() => {
            stopTalking();
            hideSpeechBubble();
            showSpeechBubble(remainingPart);
        }, firstPart.length * 50 + 700);
        return;
    }

    bubble.classList.remove('hidden');
    startTalking();
    typewriterEffect(textElement, message, 50);
    setTimeout(() => stopTalking(), message.length * 50 + 700);
}

function startTalking() {
    isTalking = true;
    mouthMovement();
}

function mouthMovement() {
    if (!isTalking || !animationsEnabled) return;
    const img = document.querySelector('.hermes-cat');
    if (!img) return;

    img.src = '/assets/hermes-mouthopen.png';
    const openDuration = Math.random() * 90 + 150;

    setTimeout(() => {
        const img = document.querySelector('.hermes-cat');
        if (!img || !isTalking) return;

        img.src = '/assets/hermes.png';
        const closedDuration = Math.random() * 50 + 60;
        mouthTimeout = setTimeout(mouthMovement, closedDuration);
    }, openDuration);
}

function stopTalking() {
    isTalking = false;
    clearTimeout(mouthTimeout);
    // Make sure mouth is closed
    const img = document.querySelector('.hermes-cat');
    if (!img) return;
    img.src = '/assets/hermes.png';
}

function hideSpeechBubble() {
    const bubble = document.getElementById('hermes-speech');
    if (!bubble) return;
    bubble.classList.add('hidden');
    currentPriority = 0;
}

function scrambleYeller() {
    const now = Date.now();
    if (now - firstClickTime > 2000) {
        clickCount = 0;
        firstClickTime = now;
    }
    clickCount++;
    if (clickCount >= 4) {
        isScrambled = true; // Set blocked state

        showSpeechBubble([
            "YOU KNOW I GET SCRAMBLED!",
            "STOP!",
            "SLOW UP.",
            "GOOD GRIEF!",
            "ONE AT A TIME."
        ], 3);

        setTimeout(() => {
            isScrambled = false; // Unblock after 2.5 seconds
            clickCount = 0;
        }, 2500);

        return true;
    }
    return isScrambled || false;
}

async function fetchRareLine() {
    if (!document.querySelector('.hermes-cat')) return null;
    try {
        const response = await fetch(`${API_BASE}/api/rare-line`);
        const data = await response.json();
        if (data.line && data.line !== 'undefined') return { type: 'single', line: data.line };
        if (data.sequential && data.sequential.every(line => line && line !== 'undefined')) return { type: 'sequential', lines: data.sequential };
        return null;
    } catch (error) {
        console.error('Error fetching rare line:', error);
        return null;
    }
}



document.querySelector('.hermes-cat')?.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    const importMenu = document.getElementById('importMenu');
    if (importMenu) {
        importMenu.style.display = 'none';
    }
    const shareMenu = document.getElementById('shareMenu');
    if (shareMenu) {
        shareMenu.style.display = 'none';
    }

    const menu = document.getElementById('hermesContextMenu');
    menu.style.display = 'block';
    menu.style.left = e.pageX + 'px';
    menu.style.top = e.pageY + 'px';
});

// Hide context menu when clicking elsewhere
document.addEventListener('click', function () {
    document.getElementById('hermesContextMenu').style.display = 'none';
});

// Hide context menu when right-clicking elsewhere
document.addEventListener('contextmenu', function (e) {
    // Only hide if the right-click is NOT on the hermes cat
    if (!e.target.closest('.hermes-cat')) {
        document.getElementById('hermesContextMenu').style.display = 'none';
    }
});

document.addEventListener('DOMContentLoaded', function () {
    // Make sure hermes cat exists
    const hermesCat = document.querySelector('.hermes-cat');
    const hermesMenu = document.getElementById('hermesContextMenu');

    if (!hermesCat || !hermesMenu) {
        return; // Exit if elements don't exist
    }

    // Add keyboard support for Shift+F10 on hermes 
    hermesCat.addEventListener('keydown', function (e) {
        if (e.key === 'F10' && e.shiftKey || e.key === 'ContextMenu') {
            e.preventDefault();
            const rect = this.getBoundingClientRect();

            hermesMenu.style.left = rect.left + 'px';
            hermesMenu.style.top = (rect.bottom + 5) + 'px';

            // Focus the menu and highlight first item
            setTimeout(() => {
                hermesMenu.focus();
                const items = hermesMenu.querySelectorAll('.hermes-context-menu-item');
                if (items.length > 0) {
                    updateHermesHighlight(items, 0);
                }
            }, 10);
        }
    });

    // Add tabindex to make hermes cat focusable
    hermesCat.setAttribute('tabindex', '0');

    // Add tabindex to the menu itself
    hermesMenu.setAttribute('tabindex', '-1');

    // Add keyboard navigation to hermes menu
    hermesMenu.addEventListener('keydown', function (e) {
        const items = Array.from(this.querySelectorAll('.hermes-context-menu-item'));
        let currentIndex = items.findIndex(item => item.classList.contains('highlighted'));

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                currentIndex = (currentIndex + 1) % items.length;
                updateHermesHighlight(items, currentIndex);
                break;
            case 'ArrowUp':
                e.preventDefault();
                currentIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
                updateHermesHighlight(items, currentIndex);
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (currentIndex >= 0) items[currentIndex].click();
                break;
            case 'Escape':
                e.preventDefault();
                this.style.display = 'none';
                hermesCat.focus();
                break;
            case 'Tab':
                e.preventDefault();
                this.style.display = 'none';
                const focusable = Array.from(
                    document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
                ).filter(el => !el.disabled && el.offsetParent !== null);
                const currentIdx = focusable.indexOf(hermesCat);
                const next = focusable[currentIdx + 1] || focusable[0];
                next.focus();
                break;
        }
    });

    function updateHermesHighlight(items, index) {
        items.forEach(item => item.classList.remove('highlighted'));
        if (index >= 0 && index < items.length) {
            items[index].classList.add('highlighted');
        }
    }
});

function handleDropdownKeydown(event) {
    const dropdown = document.getElementById('themeDropdown');
    dropdown.classList.add('keyboard-focus');
    const options = document.querySelectorAll('.theme-option');
    let currentIndex = Array.from(options).findIndex(opt => opt.classList.contains('highlighted'));

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            currentIndex = (currentIndex + 1) % options.length;
            updateHighlight(options, currentIndex);
            break;

        case 'ArrowUp':
            event.preventDefault();
            currentIndex = currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
            updateHighlight(options, currentIndex);
            break;

        case 'Enter':
            event.preventDefault();
            if (currentIndex >= 0) {
                options[currentIndex].click();
            }
            toggleThemeMenu(); // close dropdown
            break;

        case ' ':
        case 'Escape':
            event.preventDefault();
            toggleThemeMenu(); // close dropdown
            break;

        case 'Tab':
            event.preventDefault();
            dropdown.classList.remove('show');
            dropdown.classList.remove('keyboard-focus');

            // move focus to next tabbable element
            const focusable = Array.from(
                document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
            ).filter(el => !el.disabled && el.offsetParent !== null);

            const currentEl = document.activeElement;
            const currentIndexTab = focusable.indexOf(currentEl);
            const next = focusable[currentIndexTab + 1] || focusable[0];
            next.focus();
            break;
    }
}

function handlePlanKeydown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        // Trigger the same code as the click handler
        event.target.click();
    }
}

function updateHighlight(options, index) {
    options.forEach(opt => opt.classList.remove('highlighted'));
    if (index >= 0) options[index].classList.add('highlighted');
}


// Animations toggle with localStorage
document.addEventListener('DOMContentLoaded', function () {
    // Initialize toggle system
    if (document.getElementById('sort-select')) {
        const toggleManager = new ToggleManager();
    }
    restoreSafeSearchState();
    const muteBtn = document.getElementById('muteHermes');
    const animBtn = document.getElementById('toggleAnimations');

    // Load saved settings or use defaults
    hermesEnabled = localStorage.getItem('hermesEnabled') !== 'false';
    animationsEnabled = isMobile() ? false : localStorage.getItem('animationsEnabled') !== 'false';

    // Auto-mute Hermes on mobile
    if (window.innerWidth <= 1024) {
        hermesEnabled = false;
    }

    function playGreeting() {
        if (!hermesEnabled) return;
        setTimeout(() => { showSpeechBubble("Welcome back.", 3); }, 300);
    }

    // Handle first visit greeting
    if (!sessionStorage.getItem('hasVisited')) {
        window.addEventListener('resultsReady', () => {
            sessionStorage.setItem('hasVisited', 'true');
            playGreeting();
        }, { once: true });
    }

    // Apply saved settings on page load
    function applySavedSettings() {
        if (isMobile()) return;
        // Apply hermes/bell setting
        const bellElement = muteBtn.querySelector('.bell, .bell-unmute');
        if (bellElement) {
            bellElement.classList.toggle('bell', !hermesEnabled);
            bellElement.classList.toggle('bell-unmute', hermesEnabled);
        }

        // Apply animations setting
        const checkmark = animBtn.querySelector('.checkmark');
        if (checkmark) {
            checkmark.style.visibility = animationsEnabled ? 'visible' : 'hidden';
        }

        const catImg = document.querySelector('.hermes-cat');
        if (!animationsEnabled) {
            clearTimeout(blinkTimeout);
            clearTimeout(mouthTimeout);
            if (catImg) catImg.src = '/assets/hermes.png';
        } else {
            randomBlink?.();
        }

        if (!hermesEnabled) {
            hideSpeechBubble?.();
            stopTalking?.();
        }
    }

    // Apply settings immediately
    applySavedSettings();

    // Hermes toggle
    muteBtn.addEventListener('click', function () {
        hermesEnabled = !hermesEnabled;
        localStorage.setItem('hermesEnabled', hermesEnabled);

        const bellElement = this.querySelector('.bell, .bell-unmute');
        if (bellElement) {
            bellElement.classList.toggle('bell');
            bellElement.classList.toggle('bell-unmute');
        }
        if (!hermesEnabled) {
            hideSpeechBubble?.();
            stopTalking?.();
        }
    });

    // Animations toggle
    animBtn.addEventListener('click', function () {
        animationsEnabled = !animationsEnabled;
        localStorage.setItem('animationsEnabled', animationsEnabled);

        const checkmark = this.querySelector('.checkmark');
        checkmark.style.visibility = animationsEnabled ? 'visible' : 'hidden';
        const catImg = document.querySelector('.hermes-cat');
        if (!animationsEnabled) {
            clearTimeout(blinkTimeout);
            clearTimeout(mouthTimeout);
            if (catImg) catImg.src = '/assets/hermes.png';
        } else {
            randomBlink?.();
        }
    });
});

function handleRandomResponse(responses, nothingChance = 0.5, dotsChance = 0.08) {
    if (isMobile()) return;
    const randomChance = Math.random();
    const dotsThreshold = nothingChance + dotsChance;
    if (randomChance < nothingChance) {
        // Nothing happens
        hideSpeechBubble();
        stopTalking();
        return true;
    } else if (randomChance < dotsThreshold) {
        // Show dots
        showSpeechBubble("...", 1);
        stopTalking();
        return true;
    } else {
        // Show random message from array
        showSpeechBubble(responses, 1);
        return true;
    }
}

async function triggerSearchReaction(subreddit, searchCount, isLoggedIn) {
    // 1. Rare line — highest priority
    const rare = await fetchRareLine();
    if (rare) {
        if (rare.type === 'single') {
            showSpeechBubble(rare.line, 2);
        } else {
            showSpeechBubble(rare.lines[0], 2);
            setTimeout(() => {
                showSpeechBubble(rare.lines[1], 2);
                setTimeout(() => {
                    showSpeechBubble(rare.lines[2], 2);
                }, 3000);
            }, 31000);
        }
        return;
    }

    // 2. Premium reminders
    if (!isLoggedIn) {
        if (searchCount === 7) { showSpeechBubble("My client told me to inform you that the Bookmarks feature comes with Premium.", 2); return; }
        if (searchCount === 37) { showSpeechBubble("My client told me to inform you that the Enhanced Search feature comes with Premium. 'Search Reddit Like Google', he says.", 2); return; }
        if (searchCount === 77) { showSpeechBubble("My client told me to inform you that the Color Themes feature comes with Premium.", 2); return; }
    }

    // 3. Ambient line
    const ambientLines = [
        "I bet you can't poke my eye.", "You ever just sit there?", "Ads are coming to Reddit. But not to us.", "I had a dream about a parking garage.",
        "Scrollin scrollin scrollin.", "Cold in here."
    ];
    const reaction = subreddit ? getCatReaction(subreddit, true) : null;
    handleRandomResponse(reaction || ambientLines, reaction ? 0.72 : 0.75, 0.05);
}

// Hermes J. Cat
function getCatReaction(input, isSubreddit = false) {
    if (isMobile()) return;
    if (isSubreddit) {
        const reactions = {
            'amitheasshole': ["My cousin ended up on there once.", "I know you are, but what am I?"],
            'gonewild': ["My cousin ended up on there once."],
            'carsfuckingdragons': ["Touch grass.", "Oh.", "Uhh..."],
            'anime_irl': ["Touch grass.", "Uhh...", "Oh."],
            'newjersey': ['The Garden State.'],
            'damnthatsinteresting': ['Damn.', "That's interesting."],
            'interesting': ["That's interesting."],
            'interestingasfuck': ["That's interesting."],
            'npr': ['I think about Car Talk every day.'],
            'grilling': ["You should look up uhh, uh, Bratwurst. On a Weber Ranch.", "Hardwood lump charcoal or don't bother."],
            'traeger': ["I always used a Weber myself."],
            'mac': ["I've never understood the price point on these things."],
            'ipad': ["I've never understood the price point on these things."],
            'ipadpro': ["I've never understood the price point on these things."],
            'booksuggestions': ["Kitchen Confidential.", "I suggest The Maltese Falcon.", "How to Win Friends and Influence People.", "The Gift of Fear. Check it out."],
            'suggestmeabook': ["Kitchen Confidential.", "I suggest The Maltese Falcon.", "How to Win Friends and Influence People.", "The Gift of Fear. Check it out."],
            'electricvehicles': ["Been thinking about an EV myself."],
            'bettercallsaul': ["He defecated through a sunroof!", "Showtime.", "I KNEW IT WAS 1216! ONE AFTER MAGNA CARTA", "I AM NOT CRAZY! I am not crazy! I know he swapped those numbers!"],
            'okbuddychicanery': ["He defecated through a sunroof!", "Showtime.", "I KNEW IT WAS 1216! ONE AFTER MAGNA CARTA", "I AM NOT CRAZY! I am not crazy! I know he swapped those numbers!", "Kid named Finger:"],
            'breakingbadmemes': ["Kid named Finger:"],
            'mensfashion': ["Every man needs a trilby."],
            'classicalmusic': ["Peter and the Wolf, Op. 67.", "Daphnis et Chloe - Ravel.", "You can't go wrong with The Planets Suite."],
            'mario': ["Do you think they took Diddy Kong out of the new game because of... the allegations?"],
            'mariokart': ["Do you think they took Diddy Kong out of the new game because of... the allegations?"],
            'mariokartworld': ["Do you think they took Diddy Kong out of the new game because of... the allegations?"],
            'oneorangebraincell': ["Tell me about it."],
            'moviedetails': ["You know, Viggo really broke his toe when he kicked the helmet.", "The cat in the scene with the Don, it just wandered in the set, I heard."],
            'marvelmemes': ["That just happened.", "He's... right behind me, isn't he?"],
            'marvel': ["Iron Man is the best one. Fight me."],
            'stopsmoking': ["I went back to the old toothpick method myself.", "Apple a day to balance it out, amiright?"],
            'okbuddyarkham': ["Man...", "Officer Boals. I knew him."],
            'batmanarkham': ["Man...", "Officer Boals. I knew him."],
            'historyporn': ["You know, everyone thinks the Berlin Wall was Reagan... I was there. It was a bureaucratic screwup.", "Uh, do you ever listen to Hardcore History. There was a cult in Germany in that town that's named after cheese. Yeah it was a cult."],
            'history': ["You know, everyone thinks the Berlin Wall was Reagan... I was there. It was a bureaucratic screwup.", "Uh, do you ever listen to Hardcore History. There was a cult in Germany in that town that's named after cheese. Yeah it was a cult."],
            'thesopranos': ["How about that prick's face when he saw the gat?", "Gandolfini based Tony on a guy he knew in Jersey. Real guy."],
            'thesopranos_memes': ["How about that prick's face when he saw the gat?"],
            'buyitforlife': ["One word. Air. Fryer. That's two words. I never use my oven now."],
            'lego': ["My kids love those. My wallet, not so much."],
            'educationalgifs': ["Look up the Chernobyl, uh, reactor containment.", "Don't look up MRI of person speaking. That is disgusting."],
            'marvelrivals': ["I don't do those team fighter games. Besides CS 2."],
            'overwatch': ["I don't do those team fighter games. Besides CS 2."],
            'aww': ["Cats > Babies > Dogs."],
            'dogs': ["Cats > Babies > Dogs."],
            'cats': ["Cats > Babies > Dogs."],
            'mademesmile': ["Cats > Babies > Dogs."],
            'nextfuckinglevel': ["I did that yesterday."],
            'peoplefuckingdying': ["That happened to my buddy Eric."],
            'science': ["Who funded that study.", "I've known that for years.", "Better a mouse than me."],
            'todayilearned': ["I've known that for years.", "Yeah I knew all of 'em.", "My cousin mentioned that actually.", "Who funded that study."],
            'steamdeck': ["Good processing power.", "Civ 5 is the best one. They shouldn't even make any more."],
            'memes': ["Some of these are definitely jokes."],
            'dankmemes': ["Some of these are definitely jokes."],
            'mystery': ["Lot more homework than you'd expect."],
            'law': ["Lot more homework than you'd expect.", "Never let the law search your car without a warrant. Ever."],
            'legaladvice': ["Lot more homework than you'd expect.", "Never let the law search your car without a warrant. Ever."],
            'malelivingspace': ["Oh, yeah. This is my place."],
            'mancave': ["Oh, yeah. This is my place."],
            'showerthoughts': ["I do my thinking in the rain."],
            'bmw': ["Good taste."],
            'tifu': ["So, the song. CBAT..? My cousin told me to give it a listen. Something about interpretive dance."],
            'askreddit': ["Have you ever heard of the Swamps of Dagobah?"],
            'starwars': ["Have you ever heard of the Swamps of Dagobah?", "So anyway, I started blasting."],
            'alwayssunnymemes': ["So anyway, I started blasting."],
            'IASIP': ["So anyway, I started blasting."],
            'cars': ["You seen the new GTXi Turbo Plus?", "Exactly.", "You should look up the VIN before buying.", "They need to ditch the damn touchscreens."],
            'tesla': ["Tch."],
            'jokes': ["Updog.", "Why did the chicken cross the road? Well I don't know, but it probably had something to do with me! Hahahaha!"],
            'scams': ["Always do a reverse image search. My client fell for that one.", "Advance fee fraud. My client fell for that one."],
            'floridaman': ["I used to live in Tampa.", "What do you have to do in a Chuck E. costume to get arrested?", "So you should try to look up on Google, look up 'Florida Man' plus your birthday, and you'll find 6 crazy stories, trust me."],
            'florida': ["I used to live in Tampa.", "The Sunshine State."],
            'texas': ["Quality of life. Look it up."],
            'nyc': ["Overpriced? Yeah but I get it.", "Best pizza's not even in Manhattan anymore.", "The Empire State Building tour is worth it, but they do force you to do a picture, so keep that in mind."],
            'disneyworld': ["So overpriced these days.", "I used to live in Tampa.", "You're wondering how I feel about mice."],
            'disney': ["You're wondering how I feel about mice."],
            'helldivers': ["My cousin is into that one."],
            'helldivers2': ["My cousin is into that one."],
            'jazz': ["Try Ella Fitzgerald, Lullaby of the Leaves."],
            'musicsuggestions': ["Les parapluies de cherbourg - Nana Mouskouri.", "Twilight - Electric Light Orchestra.", "Ava Adore - Smashing Pumpkins.", "The Strange Boutique - The Monochrome Set."],
            'musicrecommendations': ["Les parapluies de cherbourg - Nana Mouskouri.", "Twilight - Electric Light Orchestra.", "Ava Adore - Smashing Pumpkins.", "The Strange Boutique - The Monochrome Set."],
            'actionfigures': ["My cousin is into those."],
            'homeimprovement': ["DeWalt. Everything else is toys."],
            'cod': ["My cousin is into that one."],
            'movies': ["I feel like I'm supposed to like Blade Runner. You know, the run time just doesn't do it for me.", "Casablanca.", "They say Citizen Kane is the best film ever made. I wanna argue with it, but I really can't argue with it. That is a damn good movie."],
            'letterboxd': ["I feel like I'm supposed to like Blade Runner. You know, the run time just doesn't do it for me.", "Casablanca.", "They say Citizen Kane is the best film ever made. I wanna argue with it, but I really can't argue with it. That is a damn good movie."],
            'cybertruck': ["Tch.", "*wheeze*"],
            'personalfinance': ["Know when to hold 'em... I bet you don't know that song.", "My cousin has a VTI. You should look into that."],
            'wallstreetbets': ["Know when to hold 'em... I bet you don't know that song.", "My cousin told me about GameStop? I thought they were outta business, honestly."],
            'fire': ["My cousin has a VTI. You should look into that.", "I'm basically retired. Hahaha and then I wake up."],
            'privacy': ["Travel burner phone.", "VPN."],
            'prequelmemes': ["Ehhhh..."],
            'gameofthrones': ["I dropped it after Season 4.", "You can only be disappointed by something that was great."],
            'houseofcards': ["DO NOT continue after Season 2.", "You can only be disappointed by something that was great."],
            'coffee': ["For me, I don't like none of that fancy stuff.", "Now they say you have to aerate the beans like they breathe oxygen.", "Cold brews at these new places are always rancid."],
            'terminator': ["I'll be back..."],
            'saltierthancrait': ["Ehhhh...", "Okay.", "Tch.", "Sure.", "I mean..."],
            'foodporn': ["Have you heard of this Ube stuff. They keep coming out with new foods.", "Always marinade.", "This place makes me think going vegetarian could be survivable."],
            'food': ["Always marinade.", "This place makes me think going vegetarian could be survivable.", "Apparently spaghetti isn't really Italian.", "Have you heard of this Ube stuff. They keep coming out with new foods."],
            'maliciouscompliance': ["That's how you end up on my good list.", "All legal-like."],
            'pettyrevenge': ["That's how you end up on my good list.", "All legal-like."],
            'antiwork': ["My uncle was Teamsters for 30 years.", "That's how you end up on my good list.", "Join. A. Union.", "Document everything.", "Remember, they wouldn't hesitate."],
            'nygiants': ["Every damn year.", "My therapist is booked solid.", "Don't even start."],
            'starbucks': ["I always preferred Dunkin.", "I was born in a Dunkin."],
            'dunkindonuts': ["I always preferred Dunkin.", "I was born in a Dunkin."],
        };

        // Check for specific subreddit first
        if (reactions[input.toLowerCase()]) {
            return reactions[input.toLowerCase()];
        }
    }
    const nsfwPattern = /\b(tits|titties|tiddies|massivecock|nudes|onlyfans|hentai|boobs|cum|cock|cocks|cunt|gape|gooning|gooner|goon|pussy|porn)\b/i;
    if (nsfwPattern.test(input)) {
        return ["Really?", "Okay.", "Interesting.", "Bud...", "The usual suspects.", "For research purposes?"];
    }
    return null;
}

