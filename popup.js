document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('url-container');
    const addBtn = document.getElementById('add-url');
    const saveBtn = document.getElementById('save-btn');

    // Load saved Gems and Layout
    chrome.storage.local.get(['gemUrls', 'registeredGems', 'layout'], (result) => {
        let gems = result.registeredGems || [];

        // Migration: If we have old URLs but no registeredGems
        if (gems.length === 0 && result.gemUrls && result.gemUrls.length > 0) {
            gems = result.gemUrls.map((url, i) => ({
                name: `Gem ${i + 1}`,
                url: url
            }));
        }

        // Default if empty
        if (gems.length === 0) {
            gems = [
                { name: "Gemini", url: "https://gemini.google.com/app" }
            ];
        }

        const savedLayout = result.layout || '1x1';

        gems.forEach(gem => addGemInput(gem.name, gem.url));
        updateLayoutButtons(savedLayout);
    });

    addBtn.addEventListener('click', () => {
        addGemInput('', '');
        // Auto-save when adding a new Gem
        saveGems();
    });

    // Import Gems button
    const importBtn = document.getElementById('import-gems-btn');
    if (importBtn) {
        importBtn.addEventListener('click', () => {
            // Send message to content script to parse Gem list from first frame
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { type: 'PARSE_GEM_LIST_FROM_FRAME' }, (response) => {
                        if (chrome.runtime.lastError) {
                            alert('Error: ' + chrome.runtime.lastError.message);
                            return;
                        }

                        if (response && response.gems && response.gems.length > 0) {
                            // Get existing gems
                            chrome.storage.local.get(['registeredGems'], (result) => {
                                const existingGems = result.registeredGems || [];
                                const existingUrls = new Set(existingGems.map(g => g.url));

                                // Add new gems (avoid duplicates)
                                let addedCount = 0;
                                response.gems.forEach(gem => {
                                    if (!existingUrls.has(gem.url)) {
                                        addGemInput(gem.name, gem.url);
                                        addedCount++;
                                    }
                                });

                                // Auto-save
                                saveGems();

                                alert(`Imported ${addedCount} new Gem(s)!`);
                            });
                        } else if (response && response.error) {
                            alert(response.error);
                        } else {
                            alert('No Gems found');
                        }
                    });
                }
            });
        });
    }

    // Helper function to save current Gems to storage
    function saveGems() {
        const items = container.querySelectorAll('.url-item');
        const gems = [];

        items.forEach(item => {
            const inputs = item.querySelectorAll('input');
            const name = inputs[0].value.trim();
            const url = inputs[1].value.trim();
            if (url || name) {  // Save even if only name or URL is filled
                gems.push({ name: name || 'Gem', url: url });
            }
        });

        chrome.storage.local.set({ registeredGems: gems }, () => {
            console.log('[MGem Popup] Auto-saved gems:', gems);
        });
    }

    // Layout Configuration
    let currentLayout = '1x1';

    // Custom Layout
    const rowsInput = document.getElementById('custom-rows');
    const colsInput = document.getElementById('custom-cols');
    const applyCustomBtn = document.getElementById('layout-custom-apply');

    console.log('[MGem Popup] Custom grid elements:', { rowsInput, colsInput, applyCustomBtn });

    if (applyCustomBtn && rowsInput && colsInput) {
        applyCustomBtn.addEventListener('click', () => {
            console.log('[MGem Popup] Apply clicked');
            const r = parseInt(rowsInput.value) || 1;
            const c = parseInt(colsInput.value) || 1;
            const finalR = Math.max(1, Math.min(5, r));
            const finalC = Math.max(1, Math.min(5, c));

            console.log('[MGem Popup] Setting layout to:', `${finalR}x${finalC}`);

            rowsInput.value = finalR;
            colsInput.value = finalC;

            currentLayout = `${finalR}x${finalC}`;
            updateLayoutButtons(currentLayout);
        });
    } else {
        console.error('[MGem Popup] Custom grid elements not found!');
    }

    function updateLayoutButtons(layout) {
        currentLayout = layout;
        if (layout && layout.includes('x')) {
            const parts = layout.split('x');
            if (parts.length === 2) {
                rowsInput.value = parts[0];
                colsInput.value = parts[1];
            }
        }
    }

    saveBtn.addEventListener('click', () => {
        const items = container.querySelectorAll('.url-item');
        const gems = [];

        items.forEach(item => {
            const inputs = item.querySelectorAll('input');
            const name = inputs[0].value.trim();
            const url = inputs[1].value.trim();
            if (url) {
                gems.push({ name: name || 'Gem', url: url });
            }
        });

        chrome.storage.local.set({ registeredGems: gems, layout: currentLayout }, () => {
            // Notify content script
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                if (tabs[0]) {
                    // Send update message
                    chrome.tabs.sendMessage(tabs[0].id, { type: 'UPDATE_CONFIG', registeredGems: gems, layout: currentLayout });
                    chrome.tabs.reload(tabs[0].id);
                }
            });
            window.close();
        });
    });

    function addGemInput(nameValue, urlValue) {
        const div = document.createElement('div');
        div.className = 'url-item';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = nameValue;
        nameInput.placeholder = "Name (e.g. Coding)";
        nameInput.style.width = "90px";
        nameInput.style.flex = "none";

        // Auto-save on name change
        nameInput.addEventListener('input', () => {
            saveGems();
        });

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.value = urlValue;
        urlInput.placeholder = "URL (https://...)";
        urlInput.style.flex = "1";

        // Auto-save on URL change
        urlInput.addEventListener('input', () => {
            saveGems();
        });

        const btnStyle = "width: 24px; min-width: 24px; height: 24px; margin-left: 2px; cursor: pointer; padding: 0; background: #333; color: #e3e3e3; border: 1px solid #555; border-radius: 4px; display: flex; justify-content: center; align-items: center; font-size: 14px;";

        const upBtn = document.createElement('button');
        upBtn.innerText = '↑';
        upBtn.title = 'Move Up';
        upBtn.style.cssText = btnStyle;
        upBtn.onclick = () => {
            if (div.previousElementSibling) {
                container.insertBefore(div, div.previousElementSibling);
                saveGems();  // Auto-save after reordering
            }
        };

        const downBtn = document.createElement('button');
        downBtn.innerText = '↓';
        downBtn.title = 'Move Down';
        downBtn.style.cssText = btnStyle;
        downBtn.onclick = () => {
            if (div.nextElementSibling) {
                container.insertBefore(div.nextElementSibling, div);
                saveGems();  // Auto-save after reordering
            }
        };

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove';
        removeBtn.innerText = 'X';
        removeBtn.title = 'Remove';
        removeBtn.style.cssText = btnStyle;
        removeBtn.onclick = () => {
            div.remove();
            saveGems();  // Auto-save after removing
        };

        // Check if this is the default Gemini Gem - if so, hide remove button
        const isDefaultGemini = urlValue === 'https://gemini.google.com/app' && nameValue === 'Gemini';
        if (isDefaultGemini) {
            removeBtn.style.display = 'none';
            removeBtn.title = 'Cannot remove default Gemini Gem';
        }

        div.appendChild(nameInput);
        div.appendChild(urlInput);
        div.appendChild(upBtn);
        div.appendChild(downBtn);
        div.appendChild(removeBtn);
        container.appendChild(div);
    }
});
