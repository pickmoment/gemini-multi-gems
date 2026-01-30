// Check if we are in the top-level frame
const isTopLevel = window.self === window.top;

// Configuration
const DEFAULT_URLS = [
    "https://gemini.google.com/app"
];

if (isTopLevel) {
    console.log("[MGem] Initializing Controller...");

    // Try multiple initialization strategies
    if (document.body) {
        console.log("[MGem] Body already exists, initializing immediately");
        initController();
    } else if (document.readyState === 'loading') {
        console.log("[MGem] Document still loading, waiting for DOMContentLoaded");
        document.addEventListener('DOMContentLoaded', () => {
            console.log("[MGem] DOMContentLoaded fired");
            initController();
        });
    } else {
        console.log("[MGem] Document ready, using MutationObserver");
        const observer = new MutationObserver((mutations, obs) => {
            if (document.body) {
                console.log("[MGem] Body detected via MutationObserver");
                initController();
                obs.disconnect();
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });

        // Fallback timeout
        setTimeout(() => {
            if (document.body && !document.getElementById('mgem-grid-container')) {
                console.log("[MGem] Fallback timeout triggered");
                initController();
            }
        }, 1000);
    }
} else {
    // logic for Child Frames
    console.log("[MGem] Child frame loaded.");
    initChildFrame();
}

function initController() {
    // 1. Hide original content
    const style = document.createElement('style');
    style.textContent = `
    body > *:not(#mgem-grid-container) {
      display: none !important;
    }
    body {
      overflow: hidden !important;
      background: #131314 !important;
    }
  `;
    document.head.appendChild(style);

    // 2. Inject Grid Container
    const grid = document.createElement('div');
    grid.id = 'mgem-grid-container';
    document.body.appendChild(grid);

    // 3. Load Frames
    // Check storage first
    chrome.storage.local.get(['registeredGems', 'frameConfig', 'layout'], (result) => {
        let gems = result.registeredGems || [];
        // Fallback for first run
        if (gems.length === 0) {
            gems = [{ name: "Gemini", url: "https://gemini.google.com/app" }];
        }

        // frameConfig: { 0: "url", 1: "url" }
        const frameConfig = result.frameConfig || {};
        const initialLayout = result.layout || '1x1';

        console.log('[MGem] Loaded config:', { gems, frameConfig, initialLayout });

        renderGrid(gems, frameConfig, grid);
        applyLayout(initialLayout);

        console.log('[MGem] Grid container:', grid);
        console.log('[MGem] Grid children:', grid.children.length);
    });

    // 4. Listen anywhere
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'SET_LAYOUT') {
            applyLayout(message.layout);
        } else if (message.type === 'UPDATE_CONFIG') {
            chrome.tabs.reload(sender.tab ? sender.tab.id : undefined);
        } else if (message.type === 'PARSE_GEM_LIST') {
            console.log('[MGem] Parsing Gem list from page');

            // Check if we're on the gems/view page
            if (!window.location.href.includes('gemini.google.com/gems/view')) {
                sendResponse({ error: 'Not on gems/view page' });
                return true;
            }

            // Parse Gem list from DOM
            const gems = [];
            const gemRows = document.querySelectorAll('bot-list-row');

            gemRows.forEach(row => {
                try {
                    const titleElement = row.querySelector('.title');
                    const linkElement = row.querySelector('a.bot-row');

                    if (titleElement && linkElement) {
                        const name = titleElement.textContent.trim();
                        const href = linkElement.getAttribute('href');

                        if (name && href) {
                            // Convert relative URL to absolute
                            const url = `https://gemini.google.com${href}`;
                            gems.push({ name, url });
                        }
                    }
                } catch (e) {
                    console.error('[MGem] Error parsing gem row:', e);
                }
            });

            console.log('[MGem] Parsed gems:', gems);
            sendResponse({ gems });
            return true;
        } else if (message.type === 'PARSE_GEM_LIST_FROM_FRAME') {
            console.log('[MGem] Parsing Gem list from first frame');

            // Get the first iframe
            const firstIframe = document.querySelector('#gem-frame-0');
            if (!firstIframe) {
                sendResponse({ error: 'First frame not found. Please wait for the page to load.' });
                return true;
            }

            try {
                // Access the iframe's document
                const iframeDoc = firstIframe.contentDocument || firstIframe.contentWindow.document;

                // Check if iframe is on gems/view page
                const iframeUrl = firstIframe.contentWindow.location.href;
                if (!iframeUrl.includes('gemini.google.com/gems/view')) {
                    sendResponse({ error: 'Please navigate the first frame to https://gemini.google.com/gems/view' });
                    return true;
                }

                // Parse Gem list from iframe DOM
                const gems = [];
                const gemRows = iframeDoc.querySelectorAll('bot-list-row');

                gemRows.forEach(row => {
                    try {
                        const titleElement = row.querySelector('.title');
                        const linkElement = row.querySelector('a.bot-row');

                        if (titleElement && linkElement) {
                            const name = titleElement.textContent.trim();
                            const href = linkElement.getAttribute('href');

                            if (name && href) {
                                // Convert relative URL to absolute
                                const url = `https://gemini.google.com${href}`;
                                gems.push({ name, url });
                            }
                        }
                    } catch (e) {
                        console.error('[MGem] Error parsing gem row:', e);
                    }
                });

                console.log('[MGem] Parsed gems from first frame:', gems);
                sendResponse({ gems });
            } catch (e) {
                console.error('[MGem] Error accessing first frame:', e);
                sendResponse({ error: 'Cannot access first frame. Please make sure it has loaded.' });
            }
            return true;
        }
    });

    // 5. Build-in Message Listener for URL updates from children
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || !data.type) return;

        if (data.type === 'URL_UPDATE') {
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach((iframe, index) => {
                if (iframe.contentWindow === event.source) {
                    // Update display
                    const wrapper = iframe.closest('.mgem-frame-wrapper');
                    if (wrapper) {
                        const display = wrapper.querySelector('.mgem-url-display');
                        if (display) display.value = data.url;

                        // Auto-Select Gem Logic
                        getActiveGems((gems, config) => {
                            // Sort gems by URL length desc to match most specific first
                            const sortedGems = [...gems].sort((a, b) => b.url.length - a.url.length);
                            const match = sortedGems.find(g => data.url.includes(g.url));

                            let targetUrl = "https://gemini.google.com/app"; // Default
                            if (match) {
                                targetUrl = match.url;
                            } else {
                                // Fallback to generic "Gemini" if exists, or just keep default
                                const defaultGem = gems.find(g => g.url === "https://gemini.google.com/app");
                                if (defaultGem) targetUrl = defaultGem.url;
                            }

                            const select = wrapper.querySelector('select');
                            if (select && select.value !== targetUrl) {
                                // Only update if different to avoid potential loops or jitter
                                // But wait, if user manually navigated, we WANT to update the select.
                                // What if user just Selected from dropdown? That changes src -> triggers URL update -> triggers Select update.
                                // Safe circularity: Select change -> Iframe Src -> URL Update -> Select value match.
                                // If they match, no change.

                                // What if user clicks link in Iframe? URL Update (new) -> Select value (old) -> Update Select to New? YES.

                                select.value = targetUrl;

                                // Update Storage
                                chrome.storage.local.get(['frameConfig'], (res) => {
                                    const cfg = res.frameConfig || {};
                                    if (cfg[index] !== targetUrl) {
                                        cfg[index] = targetUrl;
                                        chrome.storage.local.set({ frameConfig: cfg });
                                    }
                                });
                            }
                        });
                    }
                }
            });
        }
    });
}

function renderGrid(gems, frameConfig, container) {
    container.innerHTML = '';
    // Used during initial render, but applyLayout will enforce counts.
    // We should just clear here and let applyLayout call ensureFrameCount?
    // Or render 1 initial?
    // Let's render nothing here and let applyLayout trigger ensureFrameCount
    // But applyLayout assumes elements exist? No, my modify created them.
    // So renderGrid is actually not needed if applyLayout handles it all.
    // BUT applyLayout expects to "ensure" count.
    // Let's safe-guard:
}

// Helper to get active Gems
function getActiveGems(callback) {
    chrome.storage.local.get(['registeredGems', 'frameConfig'], (result) => {
        let gems = result.registeredGems || [{ name: "Gemini", url: "https://gemini.google.com/app" }];
        const config = result.frameConfig || {};
        callback(gems, config);
    });
}

function createFrame(index, container, gems, config) {
    const wrapper = document.createElement('div');
    wrapper.className = 'mgem-frame-wrapper';
    wrapper.id = `wrapper-${index}`;

    // Header
    const header = document.createElement('div');
    header.className = 'mgem-frame-header';

    // Dropdown
    const select = document.createElement('select');

    // Populate dropdown with Gems
    gems.forEach(gem => {
        const option = document.createElement('option');
        option.value = gem.url;
        option.text = gem.name;
        select.appendChild(option);
    });

    // Add a placeholder "Select a Gem" option at the beginning
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.text = '-- Select a Gem --';
    placeholderOption.disabled = true;
    select.insertBefore(placeholderOption, select.firstChild);

    // ALWAYS start with placeholder selected (ignore saved config on page load)
    // This prevents simultaneous connections when refreshing the page
    select.value = '';

    // Special case: First frame (index 0) should auto-load default Gemini Gem
    let shouldAutoLoad = false;
    let autoLoadUrl = '';

    if (index === 0) {
        const defaultGem = gems.find(g => g.url === 'https://gemini.google.com/app');
        if (defaultGem) {
            select.value = defaultGem.url;
            shouldAutoLoad = true;
            autoLoadUrl = defaultGem.url;
        }
    }

    // Event Listener for change
    select.addEventListener('change', (e) => {
        const newUrl = e.target.value;
        const iframe = wrapper.querySelector('iframe');
        if (iframe && newUrl) {
            iframe.src = newUrl;
        }

        // Save to frameConfig
        chrome.storage.local.get(['frameConfig'], (res) => {
            const cfg = res.frameConfig || {};
            cfg[index] = newUrl;
            chrome.storage.local.set({ frameConfig: cfg });
        });
    });

    // Refresh Button
    const refreshBtn = document.createElement('button');
    refreshBtn.innerText = '↻';
    refreshBtn.title = 'Reload Gem';
    refreshBtn.style.cssText = "background: transparent; border: none; color: #888; cursor: pointer; font-size: 16px; margin-left: 5px; padding: 2px 5px;";

    refreshBtn.onclick = () => {
        const currentUrl = select.value;
        const iframe = wrapper.querySelector('iframe');
        if (iframe && currentUrl) {
            // Force reload by setting src again
            iframe.src = currentUrl;
        }
    };

    // URL Display
    const urlDisplay = document.createElement('input');
    urlDisplay.type = 'text';
    urlDisplay.className = 'mgem-url-display';
    urlDisplay.readOnly = true;
    urlDisplay.value = 'No Gem selected';

    // Maximize Button
    const maxBtn = document.createElement('button');
    maxBtn.innerText = '⛶'; // Square with corners or similar
    maxBtn.title = 'Maximize';
    maxBtn.style.cssText = "background: transparent; border: none; color: #888; cursor: pointer; font-size: 14px; margin-left: 5px; padding: 2px 5px;";

    maxBtn.onclick = () => {
        const isMax = wrapper.classList.toggle('mgem-maximized');
        maxBtn.innerText = isMax ? '✕' : '⛶'; // Toggle icon
        maxBtn.title = isMax ? 'Restore' : 'Maximize';

        // Ensure others are normal?
        if (isMax) {
            const all = container.querySelectorAll('.mgem-frame-wrapper');
            all.forEach(w => {
                if (w !== wrapper) {
                    w.classList.remove('mgem-maximized');
                    // Reset their buttons if needed? 
                    // Actually, if we only allow one, we should reset buttons.
                    const btn = w.querySelector('button[title="Restore"]');
                    if (btn) {
                        btn.innerText = '⛶';
                        btn.title = 'Maximize';
                    }
                }
            });
        }
    };

    header.appendChild(select);
    header.appendChild(refreshBtn);
    header.appendChild(urlDisplay);
    header.appendChild(maxBtn);
    wrapper.appendChild(header);

    const iframe = document.createElement('iframe');
    // Auto-load first frame with default Gemini Gem, others start blank
    iframe.src = shouldAutoLoad ? autoLoadUrl : 'about:blank';
    iframe.id = `gem-frame-${index}`;
    iframe.allow = "clipboard-read; clipboard-write; microphone";

    wrapper.appendChild(iframe);
    container.appendChild(wrapper);

    // Update URL display for first frame
    if (shouldAutoLoad) {
        urlDisplay.value = 'Loading...';
    }
}

function applyLayout(layoutType) {
    const container = document.getElementById('mgem-grid-container');
    if (!container) {
        console.error('[MGem] Grid container not found!');
        return;
    }

    console.log('[MGem] Applying layout:', layoutType);

    // Parse "RowsxCols" (e.g. 2x1, 3x2)
    const match = layoutType.match(/^(\d+)x(\d+)$/);
    if (match) {
        const rows = parseInt(match[1]);
        const cols = parseInt(match[2]);

        container.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        container.style.gridTemplateRows = `repeat(${rows}, 1fr)`;

        console.log('[MGem] Grid layout set to:', { rows, cols, totalFrames: rows * cols });
        ensureFrameCount(container, rows * cols);
    } else {
        // Fallback or legacy (should vary rarely happen)
        console.warn("[MGem] Unknown layout:", layoutType);
        // Default to 2x1
        container.style.gridTemplateColumns = '1fr 1fr';
        container.style.gridTemplateRows = '1fr';
        ensureFrameCount(container, 2);
    }
}

function ensureFrameCount(container, count) {
    const wrappers = container.querySelectorAll('.mgem-frame-wrapper');
    const currentCount = wrappers.length;

    console.log('[MGem] ensureFrameCount called:', { currentCount, targetCount: count });

    if (currentCount > count) {
        // Remove extra
        for (let i = currentCount - 1; i >= count; i--) {
            wrappers[i].remove();
        }
        console.log('[MGem] Removed', currentCount - count, 'frames');
    } else if (currentCount < count) {
        // Add missing
        console.log('[MGem] Need to add', count - currentCount, 'frames');
        getActiveGems((gems, config) => {
            console.log('[MGem] Creating frames with gems:', gems);
            for (let i = 0; i < count - currentCount; i++) {
                const newIndex = currentCount + i;
                console.log('[MGem] Creating frame', newIndex);
                createFrame(newIndex, container, gems, config);
            }
            console.log('[MGem] Frames created. Total:', container.querySelectorAll('.mgem-frame-wrapper').length);
        });
    }
}

function broadcastMessage(msg) {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage(msg, '*');
        }
    });
}

// --- Child Frame Logic ---

function initChildFrame() {
    // 1. Report URL updates
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            window.parent.postMessage({ type: 'URL_UPDATE', url: lastUrl }, '*');
        }
    }, 1000);
    // Send initial
    window.parent.postMessage({ type: 'URL_UPDATE', url: lastUrl }, '*');

    // 2. Listen for messages from parent
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || !data.type) return;

        if (data.type === 'INPUT_UPDATE') {
            handleInputUpdate(data.text);
        } else if (data.type === 'TRIGGER_SEND') {
            handleTriggerSend(data.text);
        }
    });
}

function getElementByXpath(path) {
    return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

function handleInputUpdate(text) {
    // 1. Try User-Specified XPath first (High Priority)
    const userXpath = '//*[@id="app-root"]/main/side-navigation-v2/mat-sidenav-container/mat-sidenav-content/div/div[2]/chat-window/div/input-container/div/input-area-v2/div/div/div[1]/div/div/rich-textarea/div[1]/p';
    let targetElement = getElementByXpath(userXpath);

    // 2. Fallback to generic contenteditable
    if (!targetElement) {
        targetElement = document.querySelector('div[contenteditable="true"]');
        if (targetElement) {
            const p = targetElement.querySelector('p');
            if (p) targetElement = p;
        }
    }

    if (targetElement) {
        targetElement.focus();

        try {
            const range = document.createRange();
            range.selectNodeContents(targetElement);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            document.execCommand('insertText', false, text);
        } catch (e) {
            console.error("[MGem] execCommand failed:", e);
            targetElement.textContent = text;
        }

        const genericEditor = targetElement.closest('div[contenteditable="true"]') || targetElement;
        const events = ['input', 'change', 'compositionend', 'keydown', 'keyup'];
        events.forEach(eventType => {
            const event = new Event(eventType, { bubbles: true, cancelable: true });
            genericEditor.dispatchEvent(event);
        });
    }
}

function handleTriggerSend(text) {
    if (text) {
        handleInputUpdate(text);
    }

    const sendButtonSelectors = [
        'button[aria-label="Send"]',
        'button[aria-label="Submit"]',
        'button[aria-label*="전송"]',
        'button.send-button',
        'div[role="button"][aria-label="Send"]'
    ];

    let sendButton = null;
    for (const selector of sendButtonSelectors) {
        sendButton = document.querySelector(selector);
        if (sendButton) break;
    }

    if (sendButton) {
        setTimeout(() => {
            sendButton.click();
        }, 100);
    } else {
        console.warn("[MGem-Child] Send button not found. Attempting Enter key.");
        const editor = document.querySelector('div[contenteditable="true"]');
        if (editor) {
            editor.focus();
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
                cancelable: true,
                keyCode: 13,
                which: 13
            });
            editor.dispatchEvent(enterEvent);

            const enterPress = new KeyboardEvent('keypress', {
                key: 'Enter',
                code: 'Enter',
                bubbles: true,
                cancelable: true,
                keyCode: 13,
                which: 13
            });
            editor.dispatchEvent(enterPress);
        }
    }
}
