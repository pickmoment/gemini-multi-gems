class CustomSearchSelect {
    /**
     * @param {Object} options
     * @param {Array} options.items - Array of items: { value: '...', text: '...' } or groups: { label: '...', options: [...] }
     * @param {string} options.placeholder - Placeholder text
     * @param {string} options.value - Initial value
     * @param {Function} options.onChange - Callback when selection changes
     * @param {boolean} options.isGrouped - Whether items are grouped
     */
    constructor(options) {
        this.items = options.items || [];
        this.placeholder = options.placeholder || 'Select an option';
        this.value = options.value || '';
        this.onChange = options.onChange || (() => { });
        this.isGrouped = options.isGrouped || false;

        this.isOpen = false;

        this._buildDOM();
        this._bindEvents();

        this.renderedOptions = [];
        this.highlightedIndex = -1;

        this._renderOptions();
        this._updateDisplay();
    }

    _buildDOM() {
        this.container = document.createElement('div');
        this.container.className = 'mgem-custom-select';

        this.selectedDisplay = document.createElement('div');
        this.selectedDisplay.className = 'mgem-select-selected';

        this.selectedText = document.createElement('span');
        this.selectedText.className = 'mgem-select-text';

        this.arrowIcon = document.createElement('span');
        this.arrowIcon.className = 'mgem-select-arrow';
        this.arrowIcon.innerHTML = '▼';

        this.selectedDisplay.appendChild(this.selectedText);
        this.selectedDisplay.appendChild(this.arrowIcon);

        this.dropdown = document.createElement('div');
        this.dropdown.className = 'mgem-select-dropdown';
        this.dropdown.style.display = 'none';

        this.searchInputWrapper = document.createElement('div');
        this.searchInputWrapper.className = 'mgem-select-search-wrapper';

        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.className = 'mgem-select-search';
        this.searchInput.placeholder = 'Search...';

        this.searchInputWrapper.appendChild(this.searchInput);

        this.optionsList = document.createElement('div');
        this.optionsList.className = 'mgem-select-options';

        this.dropdown.appendChild(this.searchInputWrapper);
        this.dropdown.appendChild(this.optionsList);

        this.container.appendChild(this.selectedDisplay);
        this.container.appendChild(this.dropdown);
    }

    _bindEvents() {
        this.selectedDisplay.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });

        this.searchInput.addEventListener('input', () => {
            this._renderOptions(this.searchInput.value.toLowerCase());
        });

        this.searchInput.addEventListener('keydown', (e) => {
            if (!this.isOpen) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                    this.openDropdown();
                    e.preventDefault();
                }
                return;
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this._moveHighlight(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this._moveHighlight(-1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (this.highlightedIndex >= 0 && this.highlightedIndex < this.renderedOptions.length) {
                    const selectedOpt = this.renderedOptions[this.highlightedIndex];
                    this.setValue(selectedOpt.value);
                    this.closeDropdown();
                    this.onChange({ target: { value: selectedOpt.value } });
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.closeDropdown();
            }
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.container.contains(e.target)) {
                this.closeDropdown();
            }
        });

        // Prevent closing when clicking inside dropdown
        this.dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    toggleDropdown() {
        if (this.isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    openDropdown() {
        this.isOpen = true;
        this.dropdown.style.display = 'block';
        this.selectedDisplay.classList.add('mgem-select-open');
        this.searchInput.value = ''; // Clear previous search
        this._renderOptions(); // Render all
        this.searchInput.focus();

        // Close other custom selects loosely based on simple event dispatching or similar
        // Or let document click handle it since stopping prop is done.

        // Find if this is close to bottom of screen to position dropdown above
        const rect = this.selectedDisplay.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const dropdownHeight = this.dropdown.offsetHeight || 300; // rough estimate

        if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
            this.dropdown.classList.add('mgem-select-dropdown-up');
        } else {
            this.dropdown.classList.remove('mgem-select-dropdown-up');
        }
    }

    closeDropdown() {
        this.isOpen = false;
        this.dropdown.style.display = 'none';
        this.selectedDisplay.classList.remove('mgem-select-open');
    }

    _renderOptions(filterText = '') {
        this.optionsList.innerHTML = '';
        this.renderedOptions = [];
        this.highlightedIndex = -1;
        let hasMatches = false;

        if (this.isGrouped) {
            this.items.forEach(group => {
                const filteredOptions = group.options.filter(opt =>
                    opt.text.toLowerCase().includes(filterText)
                );

                if (filteredOptions.length > 0) {
                    hasMatches = true;

                    const groupLabel = document.createElement('div');
                    groupLabel.className = 'mgem-select-group-label';
                    groupLabel.textContent = group.label;
                    this.optionsList.appendChild(groupLabel);

                    filteredOptions.forEach(opt => {
                        const optionEl = this._createOptionElement(opt);
                        this.optionsList.appendChild(optionEl);
                        this.renderedOptions.push({ el: optionEl, value: opt.value });
                    });
                }
            });
        } else {
            const filteredOptions = this.items.filter(opt =>
                opt.text.toLowerCase().includes(filterText)
            );

            if (filteredOptions.length > 0) {
                hasMatches = true;
                filteredOptions.forEach(opt => {
                    const optionEl = this._createOptionElement(opt);
                    this.optionsList.appendChild(optionEl);
                    this.renderedOptions.push({ el: optionEl, value: opt.value });
                });
            }
        }

        if (!hasMatches) {
            const noResults = document.createElement('div');
            noResults.className = 'mgem-select-no-results';
            noResults.textContent = 'No matches found';
            this.optionsList.appendChild(noResults);
        }
    }

    _createOptionElement(opt) {
        const optionEl = document.createElement('div');
        optionEl.className = 'mgem-select-option';
        optionEl.textContent = opt.text;

        if (opt.value === this.value) {
            optionEl.classList.add('mgem-select-option-selected');
        }

        optionEl.addEventListener('click', () => {
            this.setValue(opt.value);
            this.closeDropdown();
            this.onChange({ target: { value: opt.value } }); // Simulate event object
        });

        return optionEl;
    }

    _moveHighlight(direction) {
        if (this.renderedOptions.length === 0) return;

        if (this.highlightedIndex >= 0 && this.highlightedIndex < this.renderedOptions.length) {
            this.renderedOptions[this.highlightedIndex].el.classList.remove('mgem-select-option-highlighted');
        }

        this.highlightedIndex += direction;

        if (this.highlightedIndex < 0) {
            this.highlightedIndex = this.renderedOptions.length - 1;
        } else if (this.highlightedIndex >= this.renderedOptions.length) {
            this.highlightedIndex = 0;
        }

        const newHighlightedEl = this.renderedOptions[this.highlightedIndex].el;
        newHighlightedEl.classList.add('mgem-select-option-highlighted');
        newHighlightedEl.scrollIntoView({ block: 'nearest' });
    }

    _updateDisplay() {
        let selectedText = this.placeholder;

        if (this.value) {
            if (this.isGrouped) {
                for (const group of this.items) {
                    const match = group.options.find(opt => opt.value === this.value);
                    if (match) {
                        selectedText = match.text;
                        break;
                    }
                }
            } else {
                const match = this.items.find(opt => opt.value === this.value);
                if (match) {
                    selectedText = match.text;
                }
            }
        }

        this.selectedText.textContent = selectedText;
    }

    /**
     * Programmatically set the value
     * @param {string} val 
     */
    setValue(val) {
        this.value = val;
        this._updateDisplay();

        // Re-render internally might not be needed unless open, but good to keep state clean
        if (this.isOpen) {
            this._renderOptions(this.searchInput.value.toLowerCase());
        }
    }

    /**
     * Get current value
     * @returns {string}
     */
    getValue() {
        return this.value;
    }

    /**
     * Update options list completely
     * @param {Array} newItems 
     */
    updateOptions(newItems) {
        this.items = newItems;
        this._updateDisplay();
        if (this.isOpen) {
            this._renderOptions(this.searchInput.value.toLowerCase());
        }
    }

    /**
     * Returns the base DOM element to append
     * @returns {HTMLElement}
     */
    getElement() {
        return this.container;
    }
}

// Make it available globally
window.CustomSearchSelect = CustomSearchSelect;
