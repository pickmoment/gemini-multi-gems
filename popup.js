// Service configuration
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

let currentService = null;

document.addEventListener('DOMContentLoaded', () => {
    // Detect current service from active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            const url = tabs[0].url;
            if (url.includes('mixed-view.html')) {
                // Mixed View page
                showMixedViewSettings();
            } else if (url.includes('gemini.google.com')) {
                currentService = 'gemini';
                showServiceSettings('gemini');
                initServiceSettings('gemini');
            } else if (url.includes('chat.openai.com') || url.includes('chatgpt.com')) {
                currentService = 'chatgpt';
                showServiceSettings('chatgpt');
                initServiceSettings('chatgpt');
            } else {
                showServiceSelector();
            }
        } else {
            showServiceSelector();
        }
    });
});

function showServiceSelector() {
    document.getElementById('service-selector').style.display = 'block';
    document.getElementById('gemini-settings').style.display = 'none';
    document.getElementById('chatgpt-settings').style.display = 'none';

    document.getElementById('goto-gemini-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://gemini.google.com/app' });
        window.close();
    });

    document.getElementById('goto-chatgpt-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://chatgpt.com/' });
        window.close();
    });

    document.getElementById('goto-mixed-view-btn').addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('mixed-view.html') });
        window.close();
    });
}

function showMixedViewSettings() {
    document.getElementById('service-selector').style.display = 'none';
    document.getElementById('gemini-settings').style.display = 'none';
    document.getElementById('chatgpt-settings').style.display = 'none';
    document.getElementById('mixed-view-settings').style.display = 'block';

    // Initialize Mixed View settings
    const MIXED_VIEW_LAYOUT_KEY = 'mixedViewLayout';
    const MIXED_VIEW_FRAME_CONFIG_KEY = 'mixedViewFrameConfig';

    const rowsInput = document.getElementById('mixed-custom-rows');
    const colsInput = document.getElementById('mixed-custom-cols');
    const clearAllBtn = document.getElementById('mixed-clear-all-btn');
    const refreshBtn = document.getElementById('mixed-refresh-btn');

    // Load saved layout
    chrome.storage.local.get([MIXED_VIEW_LAYOUT_KEY], (result) => {
        const savedLayout = result[MIXED_VIEW_LAYOUT_KEY] || '2x2';
        const [rows, cols] = savedLayout.split('x').map(Number);
        rowsInput.value = rows;
        colsInput.value = cols;
    });

    // Layout change handlers
    function applyLayoutChange() {
        const r = parseInt(rowsInput.value) || 2;
        const c = parseInt(colsInput.value) || 2;
        const finalR = Math.max(1, Math.min(5, r));
        const finalC = Math.max(1, Math.min(5, c));

        rowsInput.value = finalR;
        colsInput.value = finalC;

        const currentLayout = `${finalR}x${finalC}`;

        chrome.storage.local.set({ [MIXED_VIEW_LAYOUT_KEY]: currentLayout }, () => {
            // Send message to update Mixed View
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_LAYOUT', layout: currentLayout });
                }
            });
        });
    }

    rowsInput.addEventListener('change', applyLayoutChange);
    colsInput.addEventListener('change', applyLayoutChange);

    // Clear all frames
    clearAllBtn.addEventListener('click', () => {
        if (confirm('Clear all frame selections? This will reset all frames to empty.')) {
            chrome.storage.local.set({ [MIXED_VIEW_FRAME_CONFIG_KEY]: {} }, () => {
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs[0]) {
                        chrome.tabs.reload(tabs[0].id);
                    }
                });
                window.close();
            });
        }
    });

    // Refresh page
    refreshBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.reload(tabs[0].id);
            }
        });
        window.close();
    });
}

function showServiceSettings(service) {
    document.getElementById('service-selector').style.display = 'none';
    document.getElementById('mixed-view-settings').style.display = 'none';
    if (service === 'gemini') {
        document.getElementById('gemini-settings').style.display = 'block';
        document.getElementById('chatgpt-settings').style.display = 'none';
    } else if (service === 'chatgpt') {
        document.getElementById('gemini-settings').style.display = 'none';
        document.getElementById('chatgpt-settings').style.display = 'block';
    }
}

function initServiceSettings(service) {
    const config = SERVICE_CONFIG[service];
    const prefix = service; // 'gemini' or 'chatgpt'

    const container = document.getElementById(`${prefix}-url-container`);
    const addBtn = document.getElementById(`${prefix}-add-url`);
    const saveBtn = document.getElementById(`${prefix}-save-btn`);
    const rowsInput = document.getElementById(`${prefix}-custom-rows`);
    const colsInput = document.getElementById(`${prefix}-custom-cols`);
    const enabledToggle = document.getElementById(`${prefix}-enabled-toggle`);
    const configPanel = document.getElementById(`${prefix}-config-panel`);

    // Load saved settings
    chrome.storage.local.get([config.storageKey, config.layoutKey, config.enabledKey], (result) => {
        let gems = result[config.storageKey] || [];

        // Default if empty
        if (gems.length === 0) {
            gems = [{ name: config.serviceName, url: config.defaultUrl }];
        }

        const savedLayout = result[config.layoutKey] || '1x1';
        const isEnabled = result[config.enabledKey] !== false; // default to true

        // Set toggle state
        enabledToggle.checked = isEnabled;

        // Show/hide config panel based on enabled state
        configPanel.style.display = isEnabled ? 'block' : 'none';

        gems.forEach(gem => addGemInput(gem.name, gem.url, prefix, container, config));
        updateLayoutButtons(savedLayout, rowsInput, colsInput);
    });

    // Toggle change handler
    enabledToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;

        // Show/hide config panel
        configPanel.style.display = isEnabled ? 'block' : 'none';

        // Save enabled state
        chrome.storage.local.set({ [config.enabledKey]: isEnabled }, () => {
            // Reload the page to apply changes
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.reload(tabs[0].id);
                }
            });
        });
    });

    addBtn.addEventListener('click', () => {
        addGemInput('', '', prefix, container, config);
        saveGems(prefix, container, config);
    });

    // Import button
    const importBtn = document.getElementById(service === 'gemini' ? 'import-gems-btn' : 'import-gpts-btn');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { type: 'PARSE_GEM_LIST_FROM_FRAME' }, (response) => {
                        if (chrome.runtime.lastError) {
                            alert('Error: ' + chrome.runtime.lastError.message);
                            return;
                        }

                        if (response && response.gems && response.gems.length > 0) {
                            chrome.storage.local.get([config.storageKey], (result) => {
                                const existingGems = result[config.storageKey] || [];
                                const existingUrls = new Set(existingGems.map(g => g.url));

                                let addedCount = 0;
                                response.gems.forEach(gem => {
                                    if (!existingUrls.has(gem.url)) {
                                        addGemInput(gem.name, gem.url, prefix, container, config);
                                        addedCount++;
                                    }
                                });

                                saveGems(prefix, container, config);
                                alert(`Imported ${addedCount} new ${config.itemName}(s)!`);
                            });
                        } else if (response && response.error) {
                            // If error message indicates wrong page, navigate to correct page
                            if (response.error.includes('navigate')) {
                                const confirmed = confirm(`The first frame needs to be on ${config.gemsViewUrl}\n\nThe page will be navigated automatically.\nAfter the page fully loads, please click Import again.`);
                                if (confirmed) {
                                    // Navigate the first frame to the correct page
                                    chrome.tabs.sendMessage(tabs[0].id, {
                                        type: 'NAVIGATE_FIRST_FRAME',
                                        url: config.gemsViewUrl
                                    }, (navResponse) => {
                                        if (navResponse && navResponse.error) {
                                            alert(navResponse.error);
                                        }
                                        // Silently close popup on success
                                        window.close();
                                    });
                                }
                            } else {
                                alert(response.error);
                            }
                        } else {
                            alert(`No ${config.itemName}s found`);
                        }
                    });
                }
            });
        });
    }

    // Layout auto-apply
    function applyLayoutChange() {
        const r = parseInt(rowsInput.value) || 1;
        const c = parseInt(colsInput.value) || 1;
        const finalR = Math.max(1, Math.min(5, r));
        const finalC = Math.max(1, Math.min(5, c));

        rowsInput.value = finalR;
        colsInput.value = finalC;

        const currentLayout = `${finalR}x${finalC}`;
        updateLayoutButtons(currentLayout, rowsInput, colsInput);

        chrome.storage.local.set({ [config.layoutKey]: currentLayout });
    }

    if (rowsInput && colsInput) {
        rowsInput.addEventListener('change', applyLayoutChange);
        colsInput.addEventListener('change', applyLayoutChange);
    }

    // Refresh button (settings are auto-saved, just reload the page)
    saveBtn.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            if (tabs[0]) {
                chrome.tabs.reload(tabs[0].id);
            }
        });
        window.close();
    });

    // Mixed View button
    const mixedViewBtn = document.getElementById(`${prefix}-mixed-view-btn`);
    if (mixedViewBtn) {
        mixedViewBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('mixed-view.html') });
            window.close();
        });
    }
}

function saveGems(prefix, container, config) {
    const items = container.querySelectorAll('.url-item');
    const gems = [];

    items.forEach(item => {
        const inputs = item.querySelectorAll('input');
        const name = inputs[0].value.trim();
        const url = inputs[1].value.trim();
        if (url || name) {
            gems.push({ name: name || config.itemName, url: url });
        }
    });

    chrome.storage.local.set({ [config.storageKey]: gems });
}

function updateLayoutButtons(layout, rowsInput, colsInput) {
    if (layout && layout.includes('x')) {
        const parts = layout.split('x');
        if (parts.length === 2) {
            rowsInput.value = parts[0];
            colsInput.value = parts[1];
        }
    }
}

function addGemInput(nameValue, urlValue, prefix, container, config) {
    const div = document.createElement('div');
    div.className = 'url-item';
    div.draggable = true;

    // Drag and Drop Event Handlers
    div.addEventListener('dragstart', (e) => {
        div.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', div.innerHTML);
    });

    div.addEventListener('dragend', (e) => {
        div.classList.remove('dragging');
        container.querySelectorAll('.url-item').forEach(item => {
            item.classList.remove('drag-over');
        });
    });

    div.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const draggingItem = container.querySelector('.dragging');
        if (draggingItem && draggingItem !== div) {
            div.classList.add('drag-over');
        }
    });

    div.addEventListener('dragleave', (e) => {
        div.classList.remove('drag-over');
    });

    div.addEventListener('drop', (e) => {
        e.preventDefault();
        div.classList.remove('drag-over');

        const draggingItem = container.querySelector('.dragging');
        if (draggingItem && draggingItem !== div) {
            const rect = div.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            if (e.clientY < midpoint) {
                container.insertBefore(draggingItem, div);
            } else {
                container.insertBefore(draggingItem, div.nextSibling);
            }

            saveGems(prefix, container, config);
        }
    });

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = nameValue;
    nameInput.placeholder = `Name (e.g. ${config.itemName})`;
    nameInput.style.width = "90px";
    nameInput.style.flex = "none";

    nameInput.addEventListener('input', () => {
        saveGems(prefix, container, config);
    });

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.value = urlValue;
    urlInput.placeholder = "URL (https://...)";
    urlInput.style.flex = "1";

    urlInput.addEventListener('input', () => {
        saveGems(prefix, container, config);
    });

    const btnStyle = "width: 24px; min-width: 24px; height: 24px; margin-left: 2px; cursor: pointer; padding: 0; background: #333; color: #e3e3e3; border: 1px solid #555; border-radius: 4px; display: flex; justify-content: center; align-items: center; font-size: 14px;";

    const upBtn = document.createElement('button');
    upBtn.innerText = '↑';
    upBtn.title = 'Move Up';
    upBtn.style.cssText = btnStyle;
    upBtn.onclick = () => {
        if (div.previousElementSibling) {
            container.insertBefore(div, div.previousElementSibling);
            saveGems(prefix, container, config);
        }
    };

    const downBtn = document.createElement('button');
    downBtn.innerText = '↓';
    downBtn.title = 'Move Down';
    downBtn.style.cssText = btnStyle;
    downBtn.onclick = () => {
        if (div.nextElementSibling) {
            container.insertBefore(div.nextElementSibling, div);
            saveGems(prefix, container, config);
        }
    };

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove';
    removeBtn.innerText = 'X';
    removeBtn.title = 'Remove';
    removeBtn.style.cssText = btnStyle;
    removeBtn.onclick = () => {
        div.remove();
        saveGems(prefix, container, config);
    };

    // Check if this is the default item
    const isDefault = urlValue === config.defaultUrl && nameValue === config.serviceName;
    if (isDefault) {
        removeBtn.style.display = 'none';
        removeBtn.title = `Cannot remove default ${config.itemName}`;
    }

    div.appendChild(nameInput);
    div.appendChild(urlInput);
    div.appendChild(upBtn);
    div.appendChild(downBtn);
    div.appendChild(removeBtn);
    container.appendChild(div);
}
