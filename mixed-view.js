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

        // Layout change handlers
        function updateLayout() {
            const r = parseInt(rowsInput.value) || 2;
            const c = parseInt(colsInput.value) || 2;
            const finalR = Math.max(1, Math.min(5, r));
            const finalC = Math.max(1, Math.min(5, c));

            rowsInput.value = finalR;
            colsInput.value = finalC;

            const newLayout = `${finalR}x${finalC}`;

            // Save layout
            chrome.storage.local.set({ [MIXED_VIEW_LAYOUT_KEY]: newLayout }, () => {
                console.log('[Mixed View] Layout saved:', newLayout);
            });

            // Re-render grid with new layout
            renderGrid(allItems, frameConfig, grid, newLayout);
            applyLayout(newLayout);
        }

        rowsInput.addEventListener('change', updateLayout);
        colsInput.addEventListener('change', updateLayout);
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

    // Service/Item selector
    const select = document.createElement('select');
    select.id = `gem-select-${index}`;

    // Add placeholder option first
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.text = '-- Select AI --';
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    select.appendChild(placeholderOption);

    // Group by service
    const geminiOptgroup = document.createElement('optgroup');
    geminiOptgroup.label = 'Gemini Gems';

    const chatgptOptgroup = document.createElement('optgroup');
    chatgptOptgroup.label = 'ChatGPT GPTs';

    allItems.forEach(item => {
        const option = document.createElement('option');
        option.value = item.url;
        option.text = item.name;

        if (item.service === 'gemini') {
            geminiOptgroup.appendChild(option);
        } else {
            chatgptOptgroup.appendChild(option);
        }
    });

    select.appendChild(geminiOptgroup);
    select.appendChild(chatgptOptgroup);

    // Set saved value (only load if explicitly configured)
    let shouldAutoLoad = false;
    let autoLoadUrl = '';

    if (frameConfig[index]) {
        select.value = frameConfig[index];
        shouldAutoLoad = true;
        autoLoadUrl = frameConfig[index];
    } else {
        // Explicitly set placeholder as selected when no config
        select.value = '';
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

    header.appendChild(select);
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

    // Event listener for select change
    select.addEventListener('change', (e) => {
        const newUrl = e.target.value;
        if (iframe && newUrl) {
            iframe.src = newUrl;
            urlDisplay.value = newUrl;
        }
        // Don't save frame config - Mixed View always starts fresh
    });

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

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_MIXED_VIEW') {
        console.log('[Mixed View] Reloading...');
        window.location.reload();
    } else if (message.type === 'UPDATE_LAYOUT') {
        console.log('[Mixed View] Updating layout to:', message.layout);
        const rowsInput = document.getElementById('layout-rows');
        const colsInput = document.getElementById('layout-cols');

        const [rows, cols] = message.layout.split('x').map(Number);
        rowsInput.value = rows;
        colsInput.value = cols;

        // Reload to apply new layout
        window.location.reload();
    }
    return true;
});
