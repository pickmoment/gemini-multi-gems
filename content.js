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
const FRAME_SEND_INTERVAL_FIXED_MS = 250;
const FRAME_RESTORE_INTERVAL_MS = 250;
const CHATGPT_SEND_BUTTON_RETRY_COUNT = 4;
const CHATGPT_SEND_BUTTON_RETRY_INTERVAL_MS = 80;
const sequentialSendQueueByService = {
    gemini: Promise.resolve(),
    chatgpt: Promise.resolve()
};
const frameRestoreQueueByService = {
    gemini: Promise.resolve(),
    chatgpt: Promise.resolve()
};

function normalizeStoredUrl(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : '';
}

function persistFrameUrl(index, url) {
    const normalizedUrl = normalizeStoredUrl(url);
    if (!normalizedUrl || normalizedUrl === 'about:blank') return;

    chrome.storage.local.get([CURRENT_CONFIG.frameConfigKey], (res) => {
        const cfg = res[CURRENT_CONFIG.frameConfigKey] || {};
        if (cfg[index] === normalizedUrl) return;
        cfg[index] = normalizedUrl;
        chrome.storage.local.set({ [CURRENT_CONFIG.frameConfigKey]: cfg });
    });
}

function findBestMatchingGemUrlByCurrentUrl(currentUrl, gems) {
    const normalizedUrl = normalizeStoredUrl(currentUrl);
    if (!normalizedUrl || !Array.isArray(gems)) return '';

    const sortedGems = [...gems].sort((a, b) => (b.url || '').length - (a.url || '').length);
    const match = sortedGems.find(g => normalizedUrl.includes(g.url));
    return match ? match.url : '';
}

function scheduleSequentialFrameRestore(serviceType, tasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) return;
    if (!frameRestoreQueueByService[serviceType]) return;

    frameRestoreQueueByService[serviceType] = frameRestoreQueueByService[serviceType]
        .then(async () => {
            for (let i = 0; i < tasks.length; i++) {
                const task = tasks[i];
                if (!task || !task.iframe || !task.url) continue;

                task.iframe.src = task.url;
                if (task.urlDisplay) {
                    task.urlDisplay.value = task.url;
                }

                if (i < tasks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, FRAME_RESTORE_INTERVAL_MS));
                }
            }
        })
        .catch((error) => {
            console.error(`[${serviceType}] Sequential frame restore queue error:`, error);
        });
}

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

            if (SERVICE_TYPE === 'gemini' || SERVICE_TYPE === 'chatgpt') {
                const targetIndices = resolveTargetFrameIndices(message.target);
                scheduleSequentialSend(SERVICE_TYPE, targetIndices, payload);
            } else {
                if (Array.isArray(message.target)) {
                    message.target.forEach(targetIndex => {
                        postTriggerSendToFrame(targetIndex, payload);
                    });
                } else if (message.target === 'all') {
                    broadcastMessage(payload);
                } else {
                    postTriggerSendToFrame(message.target, payload);
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
                        const normalizedFrameUrl = normalizeStoredUrl(data.url);
                        const display = wrapper.querySelector('.mgem-url-display');
                        if (display && normalizedFrameUrl) display.value = normalizedFrameUrl;

                        // Auto-Select Gem Logic
                        getActiveGems((gems) => {
                            // Sort gems by URL length desc to match most specific first
                            const sortedGems = [...gems].sort((a, b) => (b.url || '').length - (a.url || '').length);
                            const match = sortedGems.find(g => normalizedFrameUrl.includes(g.url));

                            let targetUrl = CURRENT_CONFIG.defaultUrl; // Default
                            if (match) {
                                targetUrl = match.url;
                            } else if (SERVICE_TYPE === 'chatgpt' && data.activeGptName) {
                                // For ChatGPT conversations, URL alone often cannot identify the active GPT.
                                // Fallback to matching the visible GPT name shown in the header menu.
                                const normalizedActiveName = normalizeNameForMatch(data.activeGptName);
                                const nameMatch = gems.find(g => {
                                    const normalizedGemName = normalizeNameForMatch(g.name);
                                    return normalizedGemName === normalizedActiveName ||
                                        normalizedGemName.includes(normalizedActiveName) ||
                                        normalizedActiveName.includes(normalizedGemName);
                                });
                                if (nameMatch) {
                                    targetUrl = nameMatch.url;
                                }
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
                                }
                            }

                            if (normalizedFrameUrl) {
                                persistFrameUrl(index, normalizedFrameUrl);
                            }
                        });
                    }
                }
            });
        }
    });
}

function normalizeNameForMatch(name) {
    return (name || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
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

    const savedUrl = normalizeStoredUrl(config[index]);
    const matchedGemUrl = findBestMatchingGemUrlByCurrentUrl(savedUrl, gems);

    // Header
    const header = document.createElement('div');
    header.className = 'mgem-frame-header';

    // Format gems for CustomSearchSelect
    const selectItems = gems.map(g => ({ value: g.url, text: g.name }));

    // Dropdown
    const customSelect = new CustomSearchSelect({
        items: selectItems,
        placeholder: `-- Select a ${CURRENT_CONFIG.itemName} --`,
        value: matchedGemUrl || '',
        onChange: (e) => {
            const newUrl = e.target.value;
            const iframe = wrapper.querySelector('iframe');
            if (iframe && newUrl) {
                iframe.src = newUrl;
            }

            // Save selected URL immediately for refresh/new tab restore
            persistFrameUrl(index, newUrl);
        }
    });

    const selectElement = customSelect.getElement();
    // Cache the object instance on the element for easy access later
    selectElement._customSelectObject = customSelect;

    // Restore saved URL first. If missing, keep first-frame default behavior.
    let autoLoadUrl = savedUrl;
    if (!autoLoadUrl && index === 0) {
        const defaultGem = gems.find(g => g.url === CURRENT_CONFIG.defaultUrl);
        if (defaultGem) {
            customSelect.setValue(defaultGem.url);
            autoLoadUrl = defaultGem.url;
        }
    }

    // Refresh Button
    const refreshBtn = document.createElement('button');
    refreshBtn.innerText = '↻';
    refreshBtn.title = `Reload ${CURRENT_CONFIG.itemName}`;
    refreshBtn.style.cssText = "background: transparent; border: none; color: #888; cursor: pointer; font-size: 16px; margin-left: 5px; padding: 2px 5px;";

    refreshBtn.onclick = () => {
        const iframe = wrapper.querySelector('iframe');
        if (!iframe) return;

        const selectedGemUrl = normalizeStoredUrl(customSelect.getValue());
        if (!selectedGemUrl) return;

        iframe.src = selectedGemUrl;
        persistFrameUrl(index, selectedGemUrl);
    };

    // URL Display
    const urlDisplay = document.createElement('input');
    urlDisplay.type = 'text';
    urlDisplay.className = 'mgem-url-display';
    urlDisplay.readOnly = true;
    urlDisplay.value = autoLoadUrl || `No ${CURRENT_CONFIG.itemName} selected`;

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
    iframe.src = 'about:blank';
    iframe.id = `gem-frame-${index}`;
    iframe.allow = "clipboard-read; clipboard-write; microphone";

    wrapper.appendChild(iframe);
    container.appendChild(wrapper);

    return { iframe, url: autoLoadUrl, urlDisplay };
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
            const restoreTasks = [];
            for (let i = 0; i < count - currentCount; i++) {
                const newIndex = currentCount + i;
                console.log('[MGem] Creating frame', newIndex);
                const frameData = createFrame(newIndex, container, gems, config);
                if (frameData.url) {
                    restoreTasks.push(frameData);
                }
            }

            if (restoreTasks.length > 0) {
                scheduleSequentialFrameRestore(SERVICE_TYPE, restoreTasks);
            }

            console.log('[MGem] Frames created. Total:', container.querySelectorAll('.mgem-frame-wrapper').length);
        });
    }
}

function postTriggerSendToFrame(targetIndex, payload) {
    const parsedIndex = parseInt(targetIndex, 10);
    if (Number.isNaN(parsedIndex)) return;

    const targetIframe = document.getElementById(`gem-frame-${parsedIndex}`);
    if (targetIframe && targetIframe.contentWindow) {
        targetIframe.contentWindow.postMessage(payload, '*');
    }
}

function getAllFrameIndices() {
    const frameNodes = document.querySelectorAll('iframe[id^="gem-frame-"]');
    return Array.from(frameNodes)
        .map(frame => parseInt(frame.id.replace('gem-frame-', ''), 10))
        .filter(index => !Number.isNaN(index));
}

function resolveTargetFrameIndices(target) {
    if (Array.isArray(target)) {
        return target
            .map(index => parseInt(index, 10))
            .filter(index => !Number.isNaN(index));
    }

    if (target === 'all') {
        return getAllFrameIndices();
    }

    const single = parseInt(target, 10);
    return Number.isNaN(single) ? [] : [single];
}

function scheduleSequentialSend(serviceType, targetIndices, payload) {
    if (!Array.isArray(targetIndices) || targetIndices.length === 0) return;
    if (!sequentialSendQueueByService[serviceType]) return;

    const uniqueIndices = [...new Set(targetIndices)];

    sequentialSendQueueByService[serviceType] = sequentialSendQueueByService[serviceType]
        .then(async () => {
            for (let i = 0; i < uniqueIndices.length; i++) {
                postTriggerSendToFrame(uniqueIndices[i], payload);

                if (i < uniqueIndices.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, FRAME_SEND_INTERVAL_FIXED_MS));
                }
            }
        })
        .catch((error) => {
            console.error(`[${serviceType}] Sequential send queue error:`, error);
        });
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
    // 1. Report URL / active GPT name updates
    let lastUrl = location.href;
    let lastActiveGptName = '';

    const postFrameState = () => {
        const activeGptName = getActiveChatGPTName();
        window.parent.postMessage({
            type: 'URL_UPDATE',
            url: location.href,
            activeGptName
        }, '*');
        return activeGptName;
    };

    setInterval(() => {
        const currentUrl = location.href;
        const activeGptName = getActiveChatGPTName();

        if (currentUrl !== lastUrl || activeGptName !== lastActiveGptName) {
            lastUrl = currentUrl;
            lastActiveGptName = postFrameState();
        }
    }, 1000);
    // Send initial
    lastActiveGptName = postFrameState();

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

function getActiveChatGPTName() {
    if (SERVICE_TYPE !== 'chatgpt') return '';

    // User-provided XPath fallback (id can be dynamic depending on session)
    const xpathElement = getElementByXpath('//*[@id="radix-_r_cp_"]') || getElementByXpath('//*[@id="radix-_r_ch_"]');
    if (xpathElement) {
        const fromXpath = extractPrimaryText(xpathElement);
        if (fromXpath) return fromXpath;
    }

    // Robust fallback selectors for ChatGPT header GPT switcher
    // Prefer candidates that include the "Auto" indicator shown in the same header block.
    const candidates = document.querySelectorAll('[id^="radix-"][aria-haspopup="menu"]');
    for (const candidate of candidates) {
        const candidateText = (candidate.textContent || '').replace(/\s+/g, ' ').trim();
        const hasAutoBadge = /\bauto\b/i.test(candidateText);
        if (!hasAutoBadge) continue;

        const label = extractPrimaryText(candidate);
        if (label && label !== 'ChatGPT') {
            return label;
        }
    }

    // Final fallback: if Auto badge is not present due UI variation, use generic radix menu candidates.
    for (const candidate of candidates) {
        const label = extractPrimaryText(candidate);
        if (label && label !== 'ChatGPT') {
            return label;
        }
    }

    return '';
}

function extractPrimaryText(element) {
    if (!element) return '';

    // Prefer the direct text node (before "Auto" and icon nodes)
    for (const node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            if (text) return text;
        }
    }

    // Fallback: derive from full text content and remove common suffix
    const rawText = (element.textContent || '').replace(/\s+/g, ' ').trim();
    if (!rawText) return '';

    return rawText
        .replace(/\bAuto\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
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
        targetElement = document.querySelector('form[data-type="unified-composer"] #prompt-textarea[contenteditable="true"]') ||
            document.querySelector('#prompt-textarea[contenteditable="true"]') ||
            document.querySelector('#prompt-textarea') ||
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
    let wasHidden = false;
    if (SERVICE_TYPE === 'gemini') {
        const currentInputArea = document.querySelector('fieldset.input-area-container') || document.querySelector('input-area-v2');
        wasHidden = currentInputArea && currentInputArea.classList.contains('mgem-element-hidden');
        if (wasHidden) {
            handleToggleUI(false); // Temporarily show UI to ensure input and send work
        }
    }

    if (text) {
        handleInputUpdate(text);
    }

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const getChatGPTComposerSendButton = () => {
        const composerForm = document.querySelector('form[data-type="unified-composer"]');
        if (!composerForm) return null;
        return composerForm.querySelector(
            '#composer-submit-button, button[data-testid="send-button"], button[aria-label*="프롬프트 보내기"], button[aria-label*="보내기"], button[aria-label*="Send"]'
        );
    };

    const getSendButton = () => {
        let candidate = null;

        if (SERVICE_TYPE === 'chatgpt') {
            candidate = getChatGPTComposerSendButton();
        }

        if (!candidate) {
            const sendButtonSelectors = SERVICE_TYPE === 'gemini'
                ? [
                    'button[aria-label="Send"]',
                    'button[aria-label="Submit"]',
                    'button[aria-label*="전송"]',
                    'button.send-button',
                    'div[role="button"][aria-label="Send"]'
                ]
                : [
                    'form[data-type="unified-composer"] #composer-submit-button',
                    'form[data-type="unified-composer"] button[data-testid="send-button"]',
                    'button#composer-submit-button',
                    'button[data-testid="send-button"]',
                    'button[aria-label="Send message"]',
                    'button[aria-label="Send prompt"]',
                    'button[aria-label*="프롬프트 보내기"]',
                    'button[type="submit"]'
                ];

            for (const selector of sendButtonSelectors) {
                candidate = document.querySelector(selector);
                if (candidate) break;
            }
        }

        if (candidate && candidate.tagName !== 'BUTTON') {
            candidate = candidate.closest('button');
        }

        return candidate;
    };

    const isButtonClickable = (button) => {
        return !!button && !button.disabled && button.getAttribute('aria-disabled') !== 'true';
    };

    const fallbackWithEnter = () => {
        console.warn(`[${CURRENT_CONFIG.serviceName}-Child] Send button not found. Attempting Enter key.`);
        const editor = document.querySelector('form[data-type="unified-composer"] #prompt-textarea[contenteditable="true"]') ||
            document.querySelector('#prompt-textarea[contenteditable="true"]') ||
            document.querySelector('div[contenteditable="true"]') ||
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
    };

    (async () => {
        const maxAttempts = SERVICE_TYPE === 'chatgpt' ? CHATGPT_SEND_BUTTON_RETRY_COUNT : 1;
        const retryDelay = CHATGPT_SEND_BUTTON_RETRY_INTERVAL_MS;
        let clicked = false;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const sendButton = getSendButton();
            if (isButtonClickable(sendButton)) {
                setTimeout(() => sendButton.click(), 100);
                clicked = true;
                break;
            }

            if (attempt < maxAttempts - 1) {
                await sleep(retryDelay);
            }
        }

        if (!clicked) {
            fallbackWithEnter();
        }

        if (wasHidden) {
            setTimeout(() => handleToggleUI(true), 500); // Re-hide after small delay
        }
    })().catch((error) => {
        console.error(`[${CURRENT_CONFIG.serviceName}-Child] Trigger send failed:`, error);
        fallbackWithEnter();
        if (wasHidden) {
            setTimeout(() => handleToggleUI(true), 500);
        }
    });
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
