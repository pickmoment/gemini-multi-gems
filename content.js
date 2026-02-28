// Check if we are in the top-level frame
const isTopLevel = window.self === window.top;

// Detect current service
const SERVICE_TYPE = (() => {
    const hostname = window.location.hostname;
    if (hostname.includes('gemini.google.com')) return 'gemini';
    if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) return 'chatgpt';
    return 'unknown';
})();

// Service-specific configuration
const SERVICE_CONFIG = {
    gemini: {
        defaultUrl: 'https://gemini.google.com/app',
        gemsViewUrl: 'https://gemini.google.com/gems/view',
        storageKey: 'registeredGems',
        layoutKey: 'geminiLayout',
        frameConfigKey: 'geminiFrameConfig',
        enabledKey: 'geminiEnabled',
        serviceName: 'Gemini',
        itemName: 'Gem'
    },
    chatgpt: {
        defaultUrl: 'https://chatgpt.com/',
        gemsViewUrl: 'https://chatgpt.com/gpts/mine',
        storageKey: 'registeredGPTs',
        layoutKey: 'chatgptLayout',
        frameConfigKey: 'chatgptFrameConfig',
        enabledKey: 'chatgptEnabled',
        serviceName: 'ChatGPT',
        itemName: 'GPT'
    }
};

const CURRENT_CONFIG = SERVICE_CONFIG[SERVICE_TYPE] || SERVICE_CONFIG.gemini;

if (isTopLevel) {
    console.log(`[${CURRENT_CONFIG.serviceName}] Checking if multi-view is enabled...`);

    // Check if multi-view is enabled for this service
    chrome.storage.local.get([CURRENT_CONFIG.enabledKey], (result) => {
        const isEnabled = result[CURRENT_CONFIG.enabledKey] !== false; // default to true

        if (!isEnabled) {
            console.log(`[${CURRENT_CONFIG.serviceName}] Multi-view is disabled. Using normal page.`);
            return; // Don't initialize the grid
        }

        console.log(`[${CURRENT_CONFIG.serviceName}] Multi-view is enabled. Initializing Controller...`);

        // Try multiple initialization strategies
        if (document.body) {
            console.log(`[${CURRENT_CONFIG.serviceName}] Body already exists, initializing immediately`);
            initController();
        } else if (document.readyState === 'loading') {
            console.log(`[${CURRENT_CONFIG.serviceName}] Document still loading, waiting for DOMContentLoaded`);
            document.addEventListener('DOMContentLoaded', () => {
                console.log(`[${CURRENT_CONFIG.serviceName}] DOMContentLoaded fired`);
                initController();
            });
        } else {
            console.log(`[${CURRENT_CONFIG.serviceName}] Document ready, using MutationObserver`);
            const observer = new MutationObserver((mutations, obs) => {
                if (document.body) {
                    console.log(`[${CURRENT_CONFIG.serviceName}] Body detected via MutationObserver`);
                    initController();
                    obs.disconnect();
                }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });

            // Fallback timeout
            setTimeout(() => {
                if (document.body && !document.getElementById('mgem-grid-container')) {
                    console.log(`[${CURRENT_CONFIG.serviceName}] Fallback timeout triggered`);
                    initController();
                }
            }, 1000);
        }
    });
    injectGeminiInputToggle();
} else {
    // logic for Child Frames
    console.log(`[${CURRENT_CONFIG.serviceName}] Child frame loaded.`);
    initChildFrame();
    injectGeminiInputToggle();
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
    // Check storage first (use service-specific keys)
    chrome.storage.local.get([CURRENT_CONFIG.storageKey, CURRENT_CONFIG.frameConfigKey, CURRENT_CONFIG.layoutKey], (result) => {
        let gems = result[CURRENT_CONFIG.storageKey] || [];
        // Fallback for first run
        if (gems.length === 0) {
            gems = [{ name: CURRENT_CONFIG.serviceName, url: CURRENT_CONFIG.defaultUrl }];
        }

        // frameConfig: { 0: "url", 1: "url" }
        const frameConfig = result[CURRENT_CONFIG.frameConfigKey] || {};
        const initialLayout = result[CURRENT_CONFIG.layoutKey] || '1x1';

        console.log(`[${CURRENT_CONFIG.serviceName}] Loaded config:`, { gems, frameConfig, initialLayout });

        renderGrid(gems, frameConfig, grid);
        applyLayout(initialLayout);

        console.log(`[${CURRENT_CONFIG.serviceName}] Grid container:`, grid);
        console.log(`[${CURRENT_CONFIG.serviceName}] Grid children:`, grid.children.length);
    });

    // 4. Listen anywhere
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'GLOBAL_TOGGLE_UI') {
            broadcastMessage({ type: 'TOGGLE_UI', hide: message.hide });
            sendResponse({ success: true });
        } else if (message.type === 'GLOBAL_TRIGGER_SEND') {
            const payload = { type: 'TRIGGER_SEND', text: message.text };
            if (Array.isArray(message.target)) {
                message.target.forEach(targetIndex => {
                    const targetIframe = document.getElementById(`gem-frame-${targetIndex}`);
                    if (targetIframe && targetIframe.contentWindow) {
                        targetIframe.contentWindow.postMessage(payload, '*');
                    }
                });
            } else if (message.target === 'all') {
                broadcastMessage(payload);
            } else {
                const targetIndex = parseInt(message.target, 10);
                const targetIframe = document.getElementById(`gem-frame-${targetIndex}`);
                if (targetIframe && targetIframe.contentWindow) {
                    targetIframe.contentWindow.postMessage(payload, '*');
                }
            }
            sendResponse({ success: true });
        } else if (message.type === 'SET_LAYOUT') {
            // Reload gems from storage to get latest list
            chrome.storage.local.get([CURRENT_CONFIG.storageKey], (result) => {
                let gems = result[CURRENT_CONFIG.storageKey] || [{ name: CURRENT_CONFIG.serviceName, url: CURRENT_CONFIG.defaultUrl }];

                // Update all existing frame selects with latest gems
                updateAllFrameSelects(gems);

                // Apply layout
                applyLayout(message.layout);
            });
        } else if (message.type === 'UPDATE_CONFIG') {
            chrome.tabs.reload(sender.tab ? sender.tab.id : undefined);
        } else if (message.type === 'NAVIGATE_FIRST_FRAME') {
            // Navigate the first frame to the gems/GPTs view page
            const firstIframe = document.querySelector('#gem-frame-0');
            if (firstIframe) {
                firstIframe.src = message.url;
                sendResponse({ success: true, message: 'Navigating to ' + message.url });
            } else {
                sendResponse({ success: false, error: 'First frame not found' });
            }
            return true;
        } else if (message.type === 'PARSE_GEM_LIST') {
            console.log(`[${CURRENT_CONFIG.serviceName}] Parsing ${CURRENT_CONFIG.itemName} list from page`);

            if (SERVICE_TYPE === 'gemini') {
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
                        console.error(`[${CURRENT_CONFIG.serviceName}] Error parsing gem row:`, e);
                    }
                });

                console.log(`[${CURRENT_CONFIG.serviceName}] Parsed gems:`, gems);
                sendResponse({ gems });
            } else if (SERVICE_TYPE === 'chatgpt') {
                // Check if we're on the GPTs page
                if (!window.location.href.includes('/gpts/mine')) {
                    sendResponse({ error: 'Not on GPTs page. Please navigate to https://chatgpt.com/gpts/mine' });
                    return true;
                }

                // Parse GPT list from DOM
                const gems = [];
                // Find main element first
                const mainElement = document.querySelector('main');
                if (mainElement) {
                    // Get all links within main that contain /g/
                    const gptLinks = mainElement.querySelectorAll('a[href*="/g/"]');

                    gptLinks.forEach(link => {
                        try {
                            const href = link.getAttribute('href');
                            // Skip editor creation link and extract name from font-semibold span
                            if (href && !href.includes('/gpts/editor') && href.includes('/g/g-')) {
                                const nameElement = link.querySelector('.font-semibold') || link.querySelector('span[class*="font-semibold"]');
                                const name = nameElement ? nameElement.textContent.trim() : 'GPT';

                                if (name && name !== 'GPT 만들기' && name !== 'Create a GPT') {
                                    // Convert relative URL to absolute
                                    const url = href.startsWith('http') ? href : `https://chatgpt.com${href}`;
                                    // Avoid duplicates
                                    if (!gems.find(g => g.url === url)) {
                                        gems.push({ name, url });
                                    }
                                }
                            }
                        } catch (e) {
                            console.error(`[${CURRENT_CONFIG.serviceName}] Error parsing GPT link:`, e);
                        }
                    });
                }

                console.log(`[${CURRENT_CONFIG.serviceName}] Parsed GPTs:`, gems);
                sendResponse({ gems });
            }
            return true;
        } else if (message.type === 'PARSE_GEM_LIST_FROM_FRAME') {
            console.log(`[${CURRENT_CONFIG.serviceName}] Parsing ${CURRENT_CONFIG.itemName} list from first frame`);

            // Get the first iframe
            const firstIframe = document.querySelector('#gem-frame-0');
            if (!firstIframe) {
                sendResponse({ error: 'First frame not found. Please wait for the page to load.' });
                return true;
            }

            try {
                // Access the iframe's document
                const iframeDoc = firstIframe.contentDocument || firstIframe.contentWindow.document;
                const iframeUrl = firstIframe.contentWindow.location.href;

                if (SERVICE_TYPE === 'gemini') {
                    // Check if iframe is on gems/view page
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
                            console.error(`[${CURRENT_CONFIG.serviceName}] Error parsing gem row:`, e);
                        }
                    });

                    console.log(`[${CURRENT_CONFIG.serviceName}] Parsed gems from first frame:`, gems);
                    sendResponse({ gems });
                } else if (SERVICE_TYPE === 'chatgpt') {
                    // Check if iframe is on GPTs page
                    if (!iframeUrl.includes('/gpts/mine')) {
                        sendResponse({ error: 'Please navigate the first frame to https://chatgpt.com/gpts/mine' });
                        return true;
                    }

                    // Parse GPT list from iframe DOM
                    const gems = [];
                    // Find main element first
                    const mainElement = iframeDoc.querySelector('main');
                    if (mainElement) {
                        // Get all links within main that contain /g/
                        const gptLinks = mainElement.querySelectorAll('a[href*="/g/"]');

                        gptLinks.forEach(link => {
                            try {
                                const href = link.getAttribute('href');
                                // Skip editor creation link and extract name from font-semibold span
                                if (href && !href.includes('/gpts/editor') && href.includes('/g/g-')) {
                                    const nameElement = link.querySelector('.font-semibold') || link.querySelector('span[class*="font-semibold"]');
                                    const name = nameElement ? nameElement.textContent.trim() : 'GPT';

                                    if (name && name !== 'GPT 만들기' && name !== 'Create a GPT') {
                                        // Convert relative URL to absolute
                                        const url = href.startsWith('http') ? href : `https://chatgpt.com${href}`;
                                        // Avoid duplicates
                                        if (!gems.find(g => g.url === url)) {
                                            gems.push({ name, url });
                                        }
                                    }
                                }
                            } catch (e) {
                                console.error(`[${CURRENT_CONFIG.serviceName}] Error parsing GPT link:`, e);
                            }
                        });
                    }

                    console.log(`[${CURRENT_CONFIG.serviceName}] Parsed GPTs from first frame:`, gems);
                    sendResponse({ gems });
                }
            } catch (e) {
                console.error(`[${CURRENT_CONFIG.serviceName}] Error accessing first frame:`, e);
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

                            let targetUrl = CURRENT_CONFIG.defaultUrl; // Default
                            if (match) {
                                targetUrl = match.url;
                            } else {
                                // Fallback to default if exists
                                const defaultGem = gems.find(g => g.url === CURRENT_CONFIG.defaultUrl);
                                if (defaultGem) targetUrl = defaultGem.url;
                            }

                            const customSelectNode = wrapper.querySelector('.mgem-custom-select');
                            if (customSelectNode && customSelectNode._customSelectObject) {
                                const select = customSelectNode._customSelectObject;
                                if (select.getValue() !== targetUrl) {
                                    select.setValue(targetUrl);

                                    // Update Storage (use service-specific key)
                                    chrome.storage.local.get([CURRENT_CONFIG.frameConfigKey], (res) => {
                                        const cfg = res[CURRENT_CONFIG.frameConfigKey] || {};
                                        if (cfg[index] !== targetUrl) {
                                            cfg[index] = targetUrl;
                                            chrome.storage.local.set({ [CURRENT_CONFIG.frameConfigKey]: cfg });
                                        }
                                    });
                                }
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
    chrome.storage.local.get([CURRENT_CONFIG.storageKey, CURRENT_CONFIG.frameConfigKey], (result) => {
        let gems = result[CURRENT_CONFIG.storageKey] || [{ name: CURRENT_CONFIG.serviceName, url: CURRENT_CONFIG.defaultUrl }];
        const config = result[CURRENT_CONFIG.frameConfigKey] || {};
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

    // Format gems for CustomSearchSelect
    const selectItems = gems.map(g => ({ value: g.url, text: g.name }));

    // Dropdown
    const customSelect = new CustomSearchSelect({
        items: selectItems,
        placeholder: `-- Select a ${CURRENT_CONFIG.itemName} --`,
        value: '', // ALWAYS start with placeholder selected
        onChange: (e) => {
            const newUrl = e.target.value;
            const iframe = wrapper.querySelector('iframe');
            if (iframe && newUrl) {
                iframe.src = newUrl;
            }

            // Save to frameConfig (use service-specific key)
            chrome.storage.local.get([CURRENT_CONFIG.frameConfigKey], (res) => {
                const cfg = res[CURRENT_CONFIG.frameConfigKey] || {};
                cfg[index] = newUrl;
                chrome.storage.local.set({ [CURRENT_CONFIG.frameConfigKey]: cfg });
            });
        }
    });

    const selectElement = customSelect.getElement();
    // Cache the object instance on the element for easy access later
    selectElement._customSelectObject = customSelect;

    // Special case: First frame (index 0) should auto-load default Gemini Gem
    let shouldAutoLoad = false;
    let autoLoadUrl = '';

    if (index === 0) {
        const defaultGem = gems.find(g => g.url === CURRENT_CONFIG.defaultUrl);
        if (defaultGem) {
            customSelect.setValue(defaultGem.url);
            shouldAutoLoad = true;
            autoLoadUrl = defaultGem.url;
        }
    }

    // Refresh Button
    const refreshBtn = document.createElement('button');
    refreshBtn.innerText = '↻';
    refreshBtn.title = `Reload ${CURRENT_CONFIG.itemName}`;
    refreshBtn.style.cssText = "background: transparent; border: none; color: #888; cursor: pointer; font-size: 16px; margin-left: 5px; padding: 2px 5px;";

    refreshBtn.onclick = () => {
        const currentUrl = customSelect.getValue();
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
    urlDisplay.value = `No ${CURRENT_CONFIG.itemName} selected`;

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

    header.appendChild(selectElement);
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

function updateAllFrameSelects(gems) {
    const container = document.getElementById('mgem-grid-container');
    if (!container) return;

    const wrappers = container.querySelectorAll('.mgem-frame-wrapper');
    wrappers.forEach((wrapper) => {
        const customSelectNode = wrapper.querySelector('.mgem-custom-select');
        if (!customSelectNode || !customSelectNode._customSelectObject) return;

        const customSelect = customSelectNode._customSelectObject;

        // Format new items
        const newItems = gems.map(g => ({ value: g.url, text: g.name }));

        customSelect.updateOptions(newItems);

        console.log(`[${CURRENT_CONFIG.serviceName}] Updated select options for frame`);
    });
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
        } else if (data.type === 'TOGGLE_UI') {
            handleToggleUI(data.hide);
        }
    });
}

function handleToggleUI(shouldHide) {
    if (SERVICE_TYPE === 'gemini') {
        const currentInputArea = document.querySelector('fieldset.input-area-container') || document.querySelector('input-area-v2');
        if (currentInputArea) {
            currentInputArea.classList.toggle('mgem-element-hidden', shouldHide);
        }

        const googleBar = document.querySelector('.boqOnegoogleliteOgbOneGoogleBar');
        if (googleBar) {
            googleBar.classList.toggle('mgem-element-hidden', shouldHide);
        }

        const greetingArea = document.querySelector('.greeting-container') || document.querySelector('.greeting');
        if (greetingArea) {
            greetingArea.classList.toggle('mgem-element-hidden', shouldHide);
        }

        const suggestionsContainer = document.querySelector('.input-area-suggestions') || document.querySelector('suggestion-chips');
        if (suggestionsContainer) {
            suggestionsContainer.classList.toggle('mgem-element-hidden', shouldHide);
        }
    }
}

function getElementByXpath(path) {
    return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}

function handleInputUpdate(text) {
    let targetElement = null;

    if (SERVICE_TYPE === 'gemini') {
        // 1. New specific css selector from user
        const newSelector = 'rich-textarea > div.ql-editor.textarea.new-input-ui > p';
        targetElement = document.querySelector(newSelector);

        // 2. Previous XPath fallback
        if (!targetElement) {
            const userXpath = '//*[@id="app-root"]/main/side-navigation-v2/mat-sidenav-container/mat-sidenav-content/div/div[2]/chat-window/div/input-container/div/input-area-v2/div/div/div[1]/div/div/rich-textarea/div[1]/p';
            targetElement = getElementByXpath(userXpath);
        }

        // 3. Generic fallback
        if (!targetElement) {
            targetElement = document.querySelector('div[contenteditable="true"]');
            if (targetElement) {
                const p = targetElement.querySelector('p');
                if (p) targetElement = p;
            }
        }
    } else if (SERVICE_TYPE === 'chatgpt') {
        // ChatGPT-specific selectors
        targetElement = document.querySelector('#prompt-textarea') ||
            document.querySelector('textarea[data-id="root"]') ||
            document.querySelector('div[contenteditable="true"]');
    }

    if (targetElement) {
        targetElement.focus();

        try {
            if (targetElement.tagName === 'TEXTAREA') {
                // For textarea elements (ChatGPT)
                targetElement.value = text;
                targetElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                targetElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            } else {
                // For contenteditable elements
                const range = document.createRange();
                range.selectNodeContents(targetElement);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);

                document.execCommand('insertText', false, text);
            }
        } catch (e) {
            console.error(`[${CURRENT_CONFIG.serviceName}] execCommand failed:`, e);
            if (targetElement.tagName === 'TEXTAREA') {
                targetElement.value = text;
            } else {
                targetElement.textContent = text;
            }
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

    let sendButtonSelectors = [];

    if (SERVICE_TYPE === 'gemini') {
        sendButtonSelectors = [
            'button[aria-label="Send"]',
            'button[aria-label="Submit"]',
            'button[aria-label*="전송"]',
            'button.send-button',
            'div[role="button"][aria-label="Send"]'
        ];
    } else if (SERVICE_TYPE === 'chatgpt') {
        sendButtonSelectors = [
            'button[data-testid="send-button"]',
            'button[aria-label="Send message"]',
            'button[aria-label="Send prompt"]',
            'button[type="submit"]',
            'button svg.icon-send'
        ];
    }

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
        console.warn(`[${CURRENT_CONFIG.serviceName}-Child] Send button not found. Attempting Enter key.`);
        const editor = document.querySelector('div[contenteditable="true"]') ||
            document.querySelector('#prompt-textarea') ||
            document.querySelector('textarea[data-id="root"]');
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

function injectGeminiInputToggle() {
    if (SERVICE_TYPE !== 'gemini') return;

    // Use MutationObserver to wait for the input area to appear
    const observer = new MutationObserver(() => {
        // Select the input area container.
        const inputArea = document.querySelector('fieldset.input-area-container') || document.querySelector('input-area-v2');
        if (inputArea && !document.getElementById('mgem-input-toggle-btn')) {
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'mgem-input-toggle-btn';
            toggleBtn.className = 'mgem-input-toggle';
            toggleBtn.innerHTML = '▼';
            toggleBtn.title = '입력 영역 및 상단바 숨기기 / 보이기'; // "Hide / Show input area & top bar"

            // Append floating button directly to body
            document.body.appendChild(toggleBtn);

            toggleBtn.addEventListener('click', (e) => {
                e.preventDefault();

                const isCurrentlyShowing = toggleBtn.innerHTML === '▼';
                const shouldHide = isCurrentlyShowing;

                // Re-query the input area because Angular might have replaced the DOM node (e.g. going to zero-state)
                const currentInputArea = document.querySelector('fieldset.input-area-container') || document.querySelector('input-area-v2');
                if (currentInputArea) {
                    currentInputArea.classList.toggle('mgem-element-hidden', shouldHide);
                }

                // Select and toggle Google Bar
                const googleBar = document.querySelector('.boqOnegoogleliteOgbOneGoogleBar');
                if (googleBar) {
                    googleBar.classList.toggle('mgem-element-hidden', shouldHide);
                }

                // Also hide the zero-state welcome screen if it exists
                const zeroStateArea = document.querySelector('modular-zero-state') || document.querySelector('.modular-zero-state-container');
                if (zeroStateArea) {
                    zeroStateArea.classList.toggle('mgem-element-hidden', shouldHide);
                }

                toggleBtn.innerHTML = shouldHide ? '▲' : '▼';
            });
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

