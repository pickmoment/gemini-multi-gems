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
const FRAME_SEND_INTERVAL_DEFAULT_MS = 100;
const FRAME_SEND_INTERVAL_MIN_MS = 50;
const FRAME_SEND_INTERVAL_MAX_MS = 5000;
let mixedViewSendQueue = Promise.resolve();

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

        // Don't load frameConfig - always start with empty frames
        const frameConfig = {};
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
    });
}

// Render the grid
function renderGrid(allItems, frameConfig, grid, layout = '2x2') {
    const [rows, cols] = layout.split('x').map(Number);
    const totalFrames = rows * cols;

    grid.innerHTML = '';

    for (let i = 0; i < totalFrames; i++) {
        const wrapper = createFrameWrapper(i, allItems, frameConfig);
        grid.appendChild(wrapper);
    }
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
        value: frameConfig[index] || '',
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
            }
        }
    });

    const selectElement = customSelect.getElement();
    selectElement._customSelectObject = customSelect;

    // Set saved value (only load if explicitly configured)
    let shouldAutoLoad = false;
    let autoLoadUrl = '';

    if (frameConfig[index]) {
        shouldAutoLoad = true;
        autoLoadUrl = frameConfig[index];
    }
    // Don't auto-load any frame by default

    // Refresh button
    const refreshBtn = document.createElement('button');
    refreshBtn.innerText = '↻';
    refreshBtn.title = 'Reload';
    refreshBtn.onclick = () => {
        const iframe = wrapper.querySelector('iframe');
        if (iframe) {
            iframe.src = iframe.src;
        }
    };

    // URL display
    const urlDisplay = document.createElement('input');
    urlDisplay.type = 'text';
    urlDisplay.className = 'mgem-url-display';
    urlDisplay.readOnly = true;
    urlDisplay.value = 'No AI selected';

    header.appendChild(selectElement);
    header.appendChild(refreshBtn);
    header.appendChild(urlDisplay);

    // Iframe
    const iframe = document.createElement('iframe');
    iframe.id = `gem-frame-${index}`;
    iframe.allow = 'clipboard-read; clipboard-write; microphone; camera';
    // Remove sandbox restrictions to allow ChatGPT to work properly
    // sandbox attribute restricts features - removing it allows full functionality

    if (shouldAutoLoad && autoLoadUrl) {
        iframe.src = autoLoadUrl;
        urlDisplay.value = autoLoadUrl;
    }

    // Handled by customSelect onChange callback

    // URL update listener
    iframe.addEventListener('load', () => {
        try {
            const currentUrl = iframe.contentWindow.location.href;
            urlDisplay.value = currentUrl;
        } catch (e) {
            // Cross-origin restriction
            urlDisplay.value = iframe.src;
        }
    });

    wrapper.appendChild(header);
    wrapper.appendChild(iframe);

    return wrapper;
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
        for (let i = currentCount; i < newTotalFrames; i++) {
            const wrapper = createFrameWrapper(i, allItems, frameConfig);
            grid.appendChild(wrapper);
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

function sanitizeSendInterval(value) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return FRAME_SEND_INTERVAL_DEFAULT_MS;
    return Math.max(FRAME_SEND_INTERVAL_MIN_MS, Math.min(FRAME_SEND_INTERVAL_MAX_MS, parsed));
}

function scheduleSequentialSend(targetIndices, payload, sendIntervalMs = FRAME_SEND_INTERVAL_DEFAULT_MS) {
    if (!Array.isArray(targetIndices) || targetIndices.length === 0) return;

    const uniqueIndices = [...new Set(targetIndices)];

    mixedViewSendQueue = mixedViewSendQueue
        .then(async () => {
            for (let i = 0; i < uniqueIndices.length; i++) {
                postTriggerSendToFrame(uniqueIndices[i], payload);

                if (i < uniqueIndices.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, sendIntervalMs));
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
        const sendIntervalMs = sanitizeSendInterval(message.sendIntervalMs);
        scheduleSequentialSend(targetIndices, payload, sendIntervalMs);
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
