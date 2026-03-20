console.log("[Mixed View] Initializing...");

// Service configuration
const SERVICE_CONFIG = {
    gemini: {
        defaultUrl: 'https://gemini.google.com/app',
        storageKey: 'registeredGems',
        serviceName: 'Gemini',
        itemName: 'Gem'
    },
    chatgpt: {
        defaultUrl: 'https://chatgpt.com/',
        storageKey: 'registeredGPTs',
        serviceName: 'ChatGPT',
        itemName: 'GPT'
    }
};

// Mixed view storage keys
const MIXED_VIEW_LAYOUT_KEY = 'mixedViewLayout';
const MIXED_VIEW_FRAME_CONFIG_KEY = 'mixedViewFrameConfig';
const FRAME_RESTORE_INTERVAL_MS = 250;
const FRAME_SEND_INTERVAL_FIXED_MS = 250;
let mixedViewSendQueue = Promise.resolve();
let mixedViewRestoreQueue = Promise.resolve();

function normalizeStoredUrl(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : '';
}

function persistFrameUrl(index, url) {
    const normalizedUrl = normalizeStoredUrl(url);
    if (!normalizedUrl) return;

    if (!window.mixedViewData) {
        window.mixedViewData = { allItems: [], frameConfig: {} };
    }

    const frameConfig = window.mixedViewData.frameConfig || {};
    if (frameConfig[index] === normalizedUrl) return;

    frameConfig[index] = normalizedUrl;
    window.mixedViewData.frameConfig = frameConfig;
    chrome.storage.local.set({ [MIXED_VIEW_FRAME_CONFIG_KEY]: frameConfig });
}

function scheduleFrameRestore(tasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) return;

    mixedViewRestoreQueue = mixedViewRestoreQueue
        .then(async () => {
            for (let i = 0; i < tasks.length; i++) {
                const task = tasks[i];
                if (!task || !task.wrapper || !task.url) continue;

                const iframe = task.wrapper.querySelector('iframe');
                if (!iframe) continue;

                iframe.src = task.url;

                const urlDisplay = task.wrapper.querySelector('.mgem-url-display');
                if (urlDisplay) {
                    urlDisplay.value = task.url;
                }

                if (i < tasks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, FRAME_RESTORE_INTERVAL_MS));
                }
            }
        })
        .catch((error) => {
            console.error('[Mixed View] Frame restore queue error:', error);
        });
}

function findBestMatchingItemUrl(currentUrl, allItems) {
    const normalizedUrl = normalizeStoredUrl(currentUrl);
    if (!normalizedUrl || !Array.isArray(allItems)) return '';

    const sortedItems = [...allItems].sort((a, b) => (b.url || '').length - (a.url || '').length);
    const matchedItem = sortedItems.find(item => normalizedUrl.includes(item.url));
    return matchedItem ? matchedItem.url : '';
}

function bindMixedViewFrameStateSync() {
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || data.type !== 'URL_UPDATE' || !data.url) return;

        const iframes = document.querySelectorAll('iframe[id^="gem-frame-"]');
        iframes.forEach((iframe) => {
            if (iframe.contentWindow !== event.source) return;

            const index = parseInt(iframe.id.replace('gem-frame-', ''), 10);
            if (Number.isNaN(index)) return;

            const wrapper = iframe.closest('.mgem-frame-wrapper');
            if (!wrapper) return;

            const normalizedUrl = normalizeStoredUrl(data.url);
            if (!normalizedUrl) return;

            const urlDisplay = wrapper.querySelector('.mgem-url-display');
            if (urlDisplay) {
                urlDisplay.value = normalizedUrl;
            }

            const customSelectNode = wrapper.querySelector('.mgem-custom-select');
            const customSelect = customSelectNode && customSelectNode._customSelectObject
                ? customSelectNode._customSelectObject
                : null;
            const allItems = window.mixedViewData && Array.isArray(window.mixedViewData.allItems)
                ? window.mixedViewData.allItems
                : [];
            const matchedItemUrl = findBestMatchingItemUrl(normalizedUrl, allItems);
            if (customSelect && matchedItemUrl && customSelect.getValue() !== matchedItemUrl) {
                customSelect.setValue(matchedItemUrl);
            }

            persistFrameUrl(index, normalizedUrl);
        });
    });
}

// Initialize the mixed view
function initMixedView() {
    const grid = document.getElementById('mgem-grid-container');
    const rowsInput = document.getElementById('layout-rows');
    const colsInput = document.getElementById('layout-cols');

    // Load all services' configurations
    chrome.storage.local.get([
        SERVICE_CONFIG.gemini.storageKey,
        SERVICE_CONFIG.chatgpt.storageKey,
        MIXED_VIEW_LAYOUT_KEY,
        MIXED_VIEW_FRAME_CONFIG_KEY
    ], (result) => {
        // Get Gemini Gems
        let geminiGems = result[SERVICE_CONFIG.gemini.storageKey] || [];
        if (geminiGems.length === 0) {
            geminiGems = [{ name: 'Gemini', url: SERVICE_CONFIG.gemini.defaultUrl }];
        }

        // Get ChatGPT GPTs
        let chatgptGPTs = result[SERVICE_CONFIG.chatgpt.storageKey] || [];
        if (chatgptGPTs.length === 0) {
            chatgptGPTs = [{ name: 'ChatGPT', url: SERVICE_CONFIG.chatgpt.defaultUrl }];
        }

        // Combine all items with service label
        const allItems = [
            ...geminiGems.map(g => ({ ...g, service: 'gemini' })),
            ...chatgptGPTs.map(g => ({ ...g, service: 'chatgpt' }))
        ];

        const frameConfig = result[MIXED_VIEW_FRAME_CONFIG_KEY] || {};
        const initialLayout = result[MIXED_VIEW_LAYOUT_KEY] || '2x2';

        console.log('[Mixed View] Loaded config:', { allItems, initialLayout });

        // Set layout inputs
        const [rows, cols] = initialLayout.split('x').map(Number);
        rowsInput.value = rows;
        colsInput.value = cols;

        renderGrid(allItems, frameConfig, grid, initialLayout);
        applyLayout(initialLayout);

        // Store allItems for later use
        window.mixedViewData = { allItems, frameConfig };

        bindMixedViewFrameStateSync();
    });
}

// Render the grid
function renderGrid(allItems, frameConfig, grid, layout = '2x2') {
    const [rows, cols] = layout.split('x').map(Number);
    const totalFrames = rows * cols;

    grid.innerHTML = '';
    const restoreTasks = [];

    for (let i = 0; i < totalFrames; i++) {
        const frameData = createFrameWrapper(i, allItems, frameConfig);
        grid.appendChild(frameData.wrapper);

        if (frameData.restoreUrl) {
            restoreTasks.push({
                wrapper: frameData.wrapper,
                url: frameData.restoreUrl
            });
        }
    }

    scheduleFrameRestore(restoreTasks);
}

// Create a single frame wrapper
function createFrameWrapper(index, allItems, frameConfig) {
    const wrapper = document.createElement('div');
    wrapper.className = 'mgem-frame-wrapper';
    wrapper.id = `gem-frame-wrapper-${index}`;

    // Header
    const header = document.createElement('div');
    header.className = 'mgem-frame-header';

    // Group by service for CustomSearchSelect
    const geminiOptions = allItems.filter(item => item.service === 'gemini').map(g => ({ value: g.url, text: g.name }));
    const chatgptOptions = allItems.filter(item => item.service === 'chatgpt').map(g => ({ value: g.url, text: g.name }));

    const items = [
        { label: 'Gemini Gems', options: geminiOptions },
        { label: 'ChatGPT GPTs', options: chatgptOptions }
    ];

    const customSelect = new CustomSearchSelect({
        items: items,
        placeholder: '-- Select AI --',
        value: '',
        isGrouped: true,
        onChange: (e) => {
            const newUrl = e.target.value;
            const iframe = wrapper.querySelector('iframe');
            if (iframe && newUrl) {
                iframe.src = newUrl;
                const urlDisplay = wrapper.querySelector('.mgem-url-display');
                if (urlDisplay) {
                    urlDisplay.value = newUrl;
                }
                persistFrameUrl(index, newUrl);
            }
        }
    });

    const selectElement = customSelect.getElement();
    selectElement._customSelectObject = customSelect;

    // Restore last visited URL for each frame (loaded sequentially by queue)
    const restoreUrl = normalizeStoredUrl(frameConfig[index]);
    const matchedItemUrl = findBestMatchingItemUrl(restoreUrl, allItems);
    if (matchedItemUrl) {
        customSelect.setValue(matchedItemUrl);
    }

    // Refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.innerText = '↻';
    refreshBtn.title = 'Reload';
    refreshBtn.onclick = () => {
        const iframe = wrapper.querySelector('iframe');
        if (!iframe) return;

        const selectedUrl = normalizeStoredUrl(customSelect.getValue());
        if (!selectedUrl) return;

        iframe.src = selectedUrl;
        persistFrameUrl(index, selectedUrl);

        const urlDisplay = wrapper.querySelector('.mgem-url-display');
        if (urlDisplay) {
            urlDisplay.value = selectedUrl;
        }
    };

    // URL display
    const urlDisplay = document.createElement('input');
    urlDisplay.type = 'text';
    urlDisplay.className = 'mgem-url-display';
    urlDisplay.readOnly = true;
    urlDisplay.value = restoreUrl || 'No AI selected';

    header.appendChild(selectElement);
    header.appendChild(refreshBtn);
    header.appendChild(urlDisplay);

    // Iframe
    const iframe = document.createElement('iframe');
    iframe.id = `gem-frame-${index}`;
    iframe.allow = 'clipboard-read; clipboard-write; microphone; camera';
    // Remove sandbox restrictions to allow ChatGPT to work properly
    // sandbox attribute restricts features - removing it allows full functionality
    iframe.src = 'about:blank';

    // Handled by customSelect onChange callback

    // URL update listener
    iframe.addEventListener('load', () => {
        let currentUrl = '';
        try {
            currentUrl = iframe.contentWindow.location.href;
            urlDisplay.value = currentUrl;
        } catch (e) {
            // Cross-origin restriction
            currentUrl = iframe.src;
            urlDisplay.value = currentUrl;
        }

        const normalizedCurrentUrl = normalizeStoredUrl(currentUrl);
        if (normalizedCurrentUrl && normalizedCurrentUrl !== 'about:blank') {
            persistFrameUrl(index, normalizedCurrentUrl);
        }
    });

    wrapper.appendChild(header);
    wrapper.appendChild(iframe);

    return { wrapper, restoreUrl };
}

// Apply layout
function applyLayout(layout) {
    const grid = document.getElementById('mgem-grid-container');
    const [rows, cols] = layout.split('x').map(Number);

    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    console.log(`[Mixed View] Applied layout: ${layout}`);
}

// Get current layout
function getCurrentLayout() {
    let layout = '2x2';
    chrome.storage.local.get([MIXED_VIEW_LAYOUT_KEY], (result) => {
        if (result[MIXED_VIEW_LAYOUT_KEY]) {
            layout = result[MIXED_VIEW_LAYOUT_KEY];
        }
    });
    return layout;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMixedView);
} else {
    initMixedView();
}

// Update select options in existing frames
function updateFrameSelects(allItems) {
    const grid = document.getElementById('mgem-grid-container');
    const currentFrames = grid.querySelectorAll('.mgem-frame-wrapper');

    currentFrames.forEach((wrapper, index) => {
        const customSelectNode = wrapper.querySelector('.mgem-custom-select');
        if (!customSelectNode || !customSelectNode._customSelectObject) return;

        const customSelect = customSelectNode._customSelectObject;

        const geminiOptions = allItems.filter(item => item.service === 'gemini').map(g => ({ value: g.url, text: g.name }));
        const chatgptOptions = allItems.filter(item => item.service === 'chatgpt').map(g => ({ value: g.url, text: g.name }));

        const items = [
            { label: 'Gemini Gems', options: geminiOptions },
            { label: 'ChatGPT GPTs', options: chatgptOptions }
        ];

        customSelect.updateOptions(items);
    });
}

// Adjust frame count without losing content
function adjustFrameCount(newLayout, allItems) {
    const grid = document.getElementById('mgem-grid-container');
    const [newRows, newCols] = newLayout.split('x').map(Number);
    const newTotalFrames = newRows * newCols;
    const currentFrames = grid.querySelectorAll('.mgem-frame-wrapper');
    const currentCount = currentFrames.length;

    console.log(`[Mixed View] Adjusting frames: ${currentCount} -> ${newTotalFrames}`);

    if (newTotalFrames > currentCount) {
        // Add new frames
        const { frameConfig } = window.mixedViewData || { frameConfig: {} };
        const restoreTasks = [];
        for (let i = currentCount; i < newTotalFrames; i++) {
            const frameData = createFrameWrapper(i, allItems, frameConfig);
            grid.appendChild(frameData.wrapper);
            if (frameData.restoreUrl) {
                restoreTasks.push({
                    wrapper: frameData.wrapper,
                    url: frameData.restoreUrl
                });
            }
        }

        if (restoreTasks.length > 0) {
            scheduleFrameRestore(restoreTasks);
        }
    } else if (newTotalFrames < currentCount) {
        // Remove excess frames
        for (let i = currentCount - 1; i >= newTotalFrames; i--) {
            const wrapper = grid.querySelector(`#gem-frame-wrapper-${i}`);
            if (wrapper) {
                wrapper.remove();
            }
        }
    }

    // Update all frame selects with latest items
    updateFrameSelects(allItems);

    // Apply new layout
    applyLayout(newLayout);
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

function scheduleSequentialSend(targetIndices, payload) {
    if (!Array.isArray(targetIndices) || targetIndices.length === 0) return;

    const uniqueIndices = [...new Set(targetIndices)];

    mixedViewSendQueue = mixedViewSendQueue
        .then(async () => {
            for (let i = 0; i < uniqueIndices.length; i++) {
                postTriggerSendToFrame(uniqueIndices[i], payload);

                if (i < uniqueIndices.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, FRAME_SEND_INTERVAL_FIXED_MS));
                }
            }
        })
        .catch((error) => {
            console.error('[Mixed View] Sequential send queue error:', error);
        });
}

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_MIXED_VIEW') {
        console.log('[Mixed View] Reloading...');
        window.location.reload();
    } else if (message.type === 'GLOBAL_TRIGGER_SEND') {
        const payload = { type: 'TRIGGER_SEND', text: message.text };
        const targetIndices = resolveTargetFrameIndices(message.target);
        scheduleSequentialSend(targetIndices, payload);
        sendResponse({ success: true });
    } else if (message.type === 'UPDATE_LAYOUT') {
        console.log('[Mixed View] Updating layout to:', message.layout);

        // Reload items from storage to get latest Gems/GPTs
        chrome.storage.local.get([
            SERVICE_CONFIG.gemini.storageKey,
            SERVICE_CONFIG.chatgpt.storageKey
        ], (result) => {
            // Get Gemini Gems
            let geminiGems = result[SERVICE_CONFIG.gemini.storageKey] || [];
            if (geminiGems.length === 0) {
                geminiGems = [{ name: 'Gemini', url: SERVICE_CONFIG.gemini.defaultUrl }];
            }

            // Get ChatGPT GPTs
            let chatgptGPTs = result[SERVICE_CONFIG.chatgpt.storageKey] || [];
            if (chatgptGPTs.length === 0) {
                chatgptGPTs = [{ name: 'ChatGPT', url: SERVICE_CONFIG.chatgpt.defaultUrl }];
            }

            // Combine all items with service label
            const allItems = [
                ...geminiGems.map(g => ({ ...g, service: 'gemini' })),
                ...chatgptGPTs.map(g => ({ ...g, service: 'chatgpt' }))
            ];

            // Update stored data
            if (window.mixedViewData) {
                window.mixedViewData.allItems = allItems;
            }

            // Update layout without refresh
            adjustFrameCount(message.layout, allItems);

            // Save layout
            chrome.storage.local.set({ [MIXED_VIEW_LAYOUT_KEY]: message.layout }, () => {
                console.log('[Mixed View] Layout saved:', message.layout);
            });
        });
    }
    return true;
});
