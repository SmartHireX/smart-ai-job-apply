/**
 * StorageVault.js
 * 
 * Centralized Storage Vault for the Nova Apply Extension.
 * 
 * Handles resume data management, API key configuration, and UI interactions.
 * Refined for Enterprise-grade UX (Per-section saving, Transactional isolation).
 */

// Global State Manager
const State = {
    initial: {},    // Snapshot from StorageVault
    current: {},    // Live changes in UI
    status: {
        lastSaved: {
            api: null,
            personal: null,
            experience: null,
            education: null,
            skills: null,
            projects: null,
            custom: null
        },
        vaultReady: true
    }
};

// Map Bucket -> Sections (to track dirty states)
const SECTION_MAP = {
    ai: ['api'],
    identity: ['personal', 'experience', 'education', 'skills', 'projects', 'custom'],
    memory: []
};

// UI Section Config
const SECTIONS = {
    api: { bucket: 'ai', lastSavedEl: 'last-saved-api', dirtyBadgeEl: 'dirty-badge-api' },
    personal: { bucket: 'identity', lastSavedEl: 'last-saved-personal', dirtyBadgeEl: 'dirty-badge-personal' },
    experience: { bucket: 'identity', lastSavedEl: 'last-saved-experience', dirtyBadgeEl: 'dirty-badge-experience' },
    education: { bucket: 'identity', lastSavedEl: 'last-saved-education', dirtyBadgeEl: 'dirty-badge-education' },
    skills: { bucket: 'identity', lastSavedEl: 'last-saved-skills', dirtyBadgeEl: 'dirty-badge-skills' },
    projects: { bucket: 'identity', lastSavedEl: 'last-saved-projects', dirtyBadgeEl: 'dirty-badge-projects' },
    custom: { bucket: 'identity', lastSavedEl: 'last-saved-custom', dirtyBadgeEl: 'dirty-badge-custom' }
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Premium Options page initialized');

    // Initialize State from Vault logic
    await syncStateWithVault();

    initTabs();
    initApiKeySection();
    initPersonalSection();
    initSkillsSection();
    initExperienceSection();
    initEducationSection();
    initProjectsSection();
    initCustomFieldsSection();
    initButtons();
    initAIImport();
    initGlobalStatusHeader();

    await loadAllData();
    updateDataStatus();
});

/**
 * Capture initial values for dirty state tracking
 */
async function syncStateWithVault() {
    const rawData = await globalThis.ResumeManager.getResumeData() || {};
    const apiKeys = await globalThis.AIClient.getApiKeys?.() || [];
    const model = await globalThis.AIClient.getStoredModel() || 'gemini-2.5-flash';

    State.initial = {
        api: { keys: apiKeys, model: model },
        personal: dataToProfileSubset(rawData, 'personal') || {},
        experience: rawData.experience || [],
        education: rawData.education || [],
        skills: dataToProfileSubset(rawData, 'skills') || {},
        projects: rawData.projects || [],
        custom: dataToProfileSubset(rawData, 'customFields') || {}
    };

    // Deep copy to current
    State.current = JSON.parse(JSON.stringify(State.initial));

    // Load last saved timestamps from local storage (non-encrypted metadata)
    const timestamps = await chrome.storage.local.get('options_last_saved');
    if (timestamps.options_last_saved) {
        State.status.lastSaved = { ...State.status.lastSaved, ...timestamps.options_last_saved };
        updateLastSavedLabels();
    }
}

function dataToProfileSubset(data, key) {
    if (!data || !data[key]) return {};
    return data[key];
}

/**
 * Dirty State Logic
 */
function checkDirty(section) {
    const isDirty = JSON.stringify(State.initial[section]) !== JSON.stringify(State.current[section]);
    const badge = document.getElementById(SECTIONS[section].dirtyBadgeEl);
    const saveBtn = document.querySelector(`.section-save-btn[data-bucket="${SECTIONS[section].bucket}"]`);

    if (badge) {
        if (isDirty) badge.classList.add('active');
        else badge.classList.remove('active');
    }

    updateGlobalStatusChip();
}

function updateGlobalStatusChip() {
    const dirtySections = Object.keys(SECTIONS).filter(s =>
        JSON.stringify(State.initial[s]) !== JSON.stringify(State.current[s])
    );

    const chip = document.getElementById('global-status-chip');
    const text = chip.querySelector('.status-text');
    const icon = chip.querySelector('.status-icon');

    if (dirtySections.length > 0) {
        chip.className = 'status-chip unsaved';
        icon.textContent = '🟡';
        text.textContent = `Unsaved changes in ${dirtySections.length} section${dirtySections.length > 1 ? 's' : ''}`;

        // Setup tooltip detail
        const list = dirtySections.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
        chip.title = `Unsaved sections: ${list}`;
    } else {
        chip.className = 'status-chip saved';
        icon.textContent = '✅';
        text.textContent = 'All changes saved';
        chip.title = 'Everything is up to date';
    }
}

function updateLastSavedLabels() {
    Object.entries(SECTIONS).forEach(([name, config]) => {
        const el = document.getElementById(config.lastSavedEl);
        if (el && State.status.lastSaved[name]) {
            const date = new Date(State.status.lastSaved[name]);
            el.textContent = `Last saved to device: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} today`;
        }
    });
}

// ============================================
// TABS
// ============================================

function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');
    const indicator = document.querySelector('.sidebar-indicator');

    function updateIndicator(activeTab) {
        if (!indicator || !activeTab) return;
        const tabRect = activeTab.getBoundingClientRect();
        const navRect = activeTab.parentElement.getBoundingClientRect();
        const top = activeTab.offsetTop + (activeTab.offsetHeight - indicator.offsetHeight) / 2;
        indicator.style.transform = `translateY(${top}px)`;
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-tab');

            // UI updates
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`tab-${target}`).classList.add('active'); // Changed to `tab-${target}` for consistency with HTML

            const titleEl = document.getElementById('current-tab-title');
            if (titleEl) {
                const tabText = tab.querySelector('.tab-text')?.textContent;
                titleEl.textContent = tabText || target;
            }

            updateIndicator(tab);
        });
    });

    // Initial position
    const activeTab = document.querySelector('.tab.active');
    if (activeTab) {
        setTimeout(() => updateIndicator(activeTab), 100);
    }
}

// ============================================
// API KEY SECTION (single + multiple rotation)
// ============================================

const MAX_API_KEYS_UI = 5;

function maskKey(key) {
    if (!key || key.length < 12) return '••••••••';
    return key.slice(0, 6) + '••••••••' + key.slice(-4);
}

function renderApiKeysList(keys) {
    const listEl = document.getElementById('api-keys-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    (keys || []).forEach((key, index) => {
        const row = document.createElement('div');
        row.className = 'api-key-item';
        row.innerHTML = `
            <span class="api-key-mask">${maskKey(key)}</span>
            <div class="api-key-actions">
                <button type="button" class="btn btn-secondary btn-small validate-key-at" data-index="${index}">Validate</button>
                <button type="button" class="btn btn-danger-outline btn-small remove-key-at" data-index="${index}">Remove</button>
            </div>
        `;
        row.querySelector('.validate-key-at').addEventListener('click', async () => {
            const statusEl = document.getElementById('api-keys-status');
            setStatus(statusEl, 'Validating...', 'loading');
            const model = document.getElementById('api-model')?.value?.trim() || 'gemini-2.5-flash';
            const result = await globalThis.AIClient.validateApiKey(key, model);
            if (result.valid) setStatus(statusEl, `✓ Key ${index + 1} is valid`, 'success');
            else setStatus(statusEl, `✗ Key ${index + 1}: ${result.error}`, 'error');
        });
        row.querySelector('.remove-key-at').addEventListener('click', () => {
            State.current.api.keys.splice(index, 1);
            renderApiKeysList(State.current.api.keys);
            checkDirty('api');
        });
        listEl.appendChild(row);
    });
}


function initApiKeySection() {
    const apiModelInput = document.getElementById('api-model');
    const addKeyBtn = document.getElementById('add-api-key-btn');
    const newKeyInput = document.getElementById('api-key-new');

    if (apiModelInput) {
        apiModelInput.addEventListener('change', () => {
            State.current.api.model = apiModelInput.value;
            checkDirty('api');
        });
    }

    if (addKeyBtn && newKeyInput) {
        addKeyBtn.addEventListener('click', async () => {
            const key = newKeyInput.value.trim();
            const statusEl = document.getElementById('api-keys-status');
            if (!key) {
                setStatus(statusEl, 'Enter a key to add', 'error');
                return;
            }

            const keys = State.current.api.keys;
            if (keys.length >= MAX_API_KEYS_UI) {
                setStatus(statusEl, `Maximum ${MAX_API_KEYS_UI} keys allowed`, 'error');
                return;
            }

            setStatus(statusEl, 'Validating...', 'loading');
            const model = apiModelInput?.value?.trim() || 'gemini-2.5-flash';
            const result = await globalThis.AIClient.validateApiKey(key, model);

            if (result.valid) {
                if (!State.current.api.keys.includes(key)) {
                    State.current.api.keys.push(key);
                }
                renderApiKeysList(State.current.api.keys);
                newKeyInput.value = '';
                setStatus(statusEl, `✓ Key added (${State.current.api.keys.length}/${MAX_API_KEYS_UI})`, 'success');
                checkDirty('api');
            } else {
                setStatus(statusEl, result.error || 'Validation failed', 'error');
            }
        });
    }
}

function initGlobalStatusHeader() {
    const chip = document.getElementById('global-status-chip');
    if (chip) {
        chip.addEventListener('click', () => {
            const dirtySections = Object.keys(SECTIONS).filter(s =>
                JSON.stringify(State.initial[s]) !== JSON.stringify(State.current[s])
            );
            if (dirtySections.length > 0) {
                const list = dirtySections.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('\n• ');
                alert(`Unsaved changes in:\n• ${list}`);
            }
        });
    }
}

/**
 * Enhanced Button Initialization
 */
function initButtons() {
    // Per-section Save Buttons
    document.querySelectorAll('.section-save-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const bucket = btn.dataset.bucket;

            // Find which UI sections map to this bucket
            const sections = Object.keys(SECTIONS).filter(s => SECTIONS[s].bucket === bucket);

            await performSectionSave(bucket, sections, btn);
        });
    });

    // Old global save button (optional, can be hidden or keep for legacy)
    const globalSave = document.getElementById('save-btn');
    if (globalSave) {
        globalSave.addEventListener('click', async () => {
            const buckets = ['ai', 'identity'];
            for (const b of buckets) {
                const sections = Object.keys(SECTIONS).filter(s => SECTIONS[s].bucket === b);
                await performSectionSave(b, sections, globalSave);
            }
        });
    }

    // Clear data logic stays similar but we use State.initial for reset
    initClearDataLogic();
}

async function performSectionSave(bucket, sections, buttonEl) {
    const originalText = buttonEl.textContent;

    try {
        buttonEl.disabled = true;
        buttonEl.innerHTML = '<span class="spinner-small"></span> Saving...';

        // Prepare data for the bucket
        let success = false;
        if (bucket === 'ai') {
            await globalThis.AIClient.saveApiKeys(State.current.api.keys, State.current.api.model);
            success = true;
        } else if (bucket === 'identity') {
            const profileData = {
                personal: State.current.personal,
                summary: State.current.personal.summary, // Summary is root level in vault for legacy
                experience: State.current.experience,
                education: State.current.education,
                skills: State.current.skills,
                projects: State.current.projects,
                customFields: State.current.custom
            };
            await globalThis.ResumeManager.saveResumeData(profileData);
            success = true;
        }

        if (success) {
            // Update initial state to match current
            sections.forEach(s => {
                State.initial[s] = JSON.parse(JSON.stringify(State.current[s]));
                State.status.lastSaved[s] = Date.now();
                checkDirty(s);
            });

            // Persist timestamps
            await chrome.storage.local.set({ 'options_last_saved': State.status.lastSaved });
            updateLastSavedLabels();

            // Success state
            buttonEl.innerHTML = '✓ Saved';
            buttonEl.classList.add('btn-success');
            setTimeout(() => {
                buttonEl.textContent = originalText;
                buttonEl.classList.remove('btn-success');
                buttonEl.disabled = false;
            }, 2000);

            showToast('Changes saved to device', 'success');
        }
    } catch (error) {
        console.error(`Save failed for bucket ${bucket}:`, error);
        buttonEl.innerHTML = '❌ Retry';
        buttonEl.disabled = false;
        showToast(`❌ Save failed. Your changes are still safe. (${error.message})`, 'error');
    }
}

// ============================================
// PERSONAL INFO SECTION
// ============================================

function initPersonalSection() {
    const inputs = document.querySelectorAll('#tab-personal input, #tab-personal textarea');

    inputs.forEach(input => {
        input.addEventListener('input', () => {
            const fieldPath = input.dataset.field;
            if (!fieldPath) return;

            const [bucket, key] = fieldPath.includes('.') ? fieldPath.split('.') : ['personal', fieldPath];

            if (bucket === 'personal') {
                State.current.personal[key] = input.value;
            } else {
                State.current.personal[bucket] = input.value;
            }

            checkDirty('personal');
        });
    });
}

// ============================================
// SKILLS SECTION
// ============================================

function initSkillsSection() {
    const skillFields = [
        { id: 'technical-skills', container: 'technical-skills-tags', key: 'technical' },
        { id: 'soft-skills', container: 'soft-skills-tags', key: 'soft' },
        { id: 'languages', container: 'languages-tags', key: 'languages' },
        { id: 'certifications', container: 'certifications-tags', key: 'certifications' }
    ];

    skillFields.forEach(({ id, container, key }) => {
        const inputEl = document.getElementById(id);
        const containerEl = document.getElementById(container);

        if (!inputEl) return;

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const items = addTagFromInput(inputEl, containerEl);
                if (items) {
                    State.current.skills[key] = getTagsFromContainer(container);
                    checkDirty('skills');
                }
            }
        });

        inputEl.addEventListener('blur', () => {
            const items = addTagFromInput(inputEl, containerEl);
            if (items) {
                State.current.skills[key] = getTagsFromContainer(container);
                checkDirty('skills');
            }
        });
    });
}

function addTagFromInput(inputEl, containerEl) {
    const value = inputEl.value.trim().replace(/,+$/, '');
    if (!value) return null;

    const items = value.split(',').map(s => s.trim()).filter(s => s);
    let added = false;

    items.forEach(item => {
        const existing = containerEl.querySelectorAll('.tag');
        const isDuplicate = Array.from(existing).some(tag =>
            tag.textContent.replace('×', '').trim().toLowerCase() === item.toLowerCase()
        );

        if (!isDuplicate) {
            const tag = createTag(item, containerEl);
            containerEl.appendChild(tag);
            added = true;
        }
    });

    inputEl.value = '';
    return added ? items : null;
}

function createTag(text, container) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `
        ${text}
        <button class="tag-remove" title="Remove">×</button>
    `;

    tag.querySelector('.tag-remove').addEventListener('click', () => {
        const containerId = container.id;
        tag.remove();

        // Find which skill key this belongs to
        const skillFields = [
            { container: 'technical-skills-tags', key: 'technical' },
            { container: 'soft-skills-tags', key: 'soft' },
            { container: 'languages-tags', key: 'languages' },
            { container: 'certifications-tags', key: 'certifications' }
        ];
        const field = skillFields.find(f => f.container === containerId);
        if (field) {
            State.current.skills[field.key] = getTagsFromContainer(containerId);
            checkDirty('skills');
        }
    });

    return tag;
}

function getTagsFromContainer(containerId) {
    const container = document.getElementById(containerId);
    const tags = container.querySelectorAll('.tag');
    return Array.from(tags).map(tag => tag.textContent.replace('×', '').trim());
}

function setTagsInContainer(containerId, tags) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    (tags || []).forEach(text => {
        const tag = createTag(text, container);
        container.appendChild(tag);
    });
}

// ============================================
// EXPERIENCE SECTION
// ============================================

let experienceData = [];

function initExperienceSection() {
    document.getElementById('add-experience-btn').addEventListener('click', () => {
        showExperienceModal();
    });

    document.getElementById('experience-list').addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const index = parseInt(btn.dataset.index);

        if (btn.classList.contains('btn-edit')) {
            showExperienceModal(index);
        } else if (btn.classList.contains('btn-delete')) {
            deleteExperience(index);
        }
    });
}

function renderExperienceList() {
    const list = document.getElementById('experience-list');
    const empty = document.getElementById('experience-empty');

    list.innerHTML = '';

    if (experienceData.length === 0) {
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');

    experienceData.forEach((exp, index) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-header">
                <div>
                    <div class="item-title">${exp.title || 'Untitled Position'}</div>
                    <div class="item-subtitle">${exp.company || ''}</div>
                    <div class="item-dates">
                        ${exp.startDate || ''} - ${exp.current ? 'Present' : (exp.endDate || '')}
                        ${exp.location ? ` • ${exp.location}` : ''}
                        ${exp.current ? '<span class="current-badge">Current</span>' : ''}
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-secondary btn-edit" data-index="${index}">Edit</button>
                    <button class="btn btn-danger-outline btn-delete" data-index="${index}">Delete</button>
                </div>
            </div>
            ${exp.description ? `<div class="item-description">${exp.description}</div>` : ''}
        `;
        list.appendChild(card);
    });
}

function showExperienceModal(index = null) {
    const isEdit = index !== null;
    const data = isEdit ? experienceData[index] : {};

    document.getElementById('modal-title').textContent = isEdit ? 'Edit Experience' : 'Add Experience';

    document.getElementById('modal-body').innerHTML = `
        <div class="form-row">
            <div class="form-group">
                <label>Job Title *</label>
                <input type="text" id="modal-title-input" value="${data.title || ''}" placeholder="Software Engineer">
            </div>
            <div class="form-group">
                <label>Company *</label>
                <input type="text" id="modal-company" value="${data.company || ''}" placeholder="Google">
            </div>
        </div>
        <div class="form-group">
            <label>Location</label>
            <input type="text" id="modal-location" value="${data.location || ''}" placeholder="San Francisco, CA">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Start Date</label>
                <input type="month" id="modal-start" value="${data.startDate || ''}">
            </div>
            <div class="form-group">
                <label>End Date</label>
                <input type="month" id="modal-end" value="${data.endDate || ''}" ${data.current ? 'disabled' : ''}>
            </div>
        </div>
        <div class="form-group">
            <label class="radio-label">
                <input type="checkbox" id="modal-current" ${data.current ? 'checked' : ''}>
                I currently work here
            </label>
        </div>
        <div class="form-group">
            <label>Description</label>
            <textarea id="modal-description" rows="4" placeholder="Describe your responsibilities and achievements...">${data.description || ''}</textarea>
        </div>
    `;

    // Handle "current" checkbox
    document.getElementById('modal-current').addEventListener('change', (e) => {
        document.getElementById('modal-end').disabled = e.target.checked;
        if (e.target.checked) {
            document.getElementById('modal-end').value = '';
        }
    });

    showModal();

    // Save handler
    document.getElementById('modal-save').onclick = () => {
        const newData = {
            id: data.id || globalThis.ResumeManager.generateId(),
            title: document.getElementById('modal-title-input').value.trim(),
            company: document.getElementById('modal-company').value.trim(),
            location: document.getElementById('modal-location').value.trim(),
            startDate: document.getElementById('modal-start').value,
            endDate: document.getElementById('modal-end').value,
            current: document.getElementById('modal-current').checked,
            description: document.getElementById('modal-description').value.trim()
        };

        if (!newData.title || !newData.company) {
            showToast('Please fill in required fields', 'error');
            return;
        }

        if (isEdit) {
            experienceData[index] = newData;
        } else {
            experienceData.unshift(newData); // Add to beginning
        }

        renderExperienceList();

        // Sync with state
        State.current.experience = [...experienceData];
        checkDirty('experience');

        hideModal();
        showToast(isEdit ? 'Experience updated' : 'Experience added', 'success');
    };
}

function deleteExperience(index) {
    showConfirmationModal(() => {
        experienceData.splice(index, 1);
        renderExperienceList();

        // Sync with state
        State.current.experience = [...experienceData];
        checkDirty('experience');

        showToast('Experience deleted', 'success');
    });
}

// ============================================
// EDUCATION SECTION
// ============================================

let educationData = [];

function initEducationSection() {
    document.getElementById('add-education-btn').addEventListener('click', () => {
        showEducationModal();
    });

    document.getElementById('education-list').addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const index = parseInt(btn.dataset.index);

        if (btn.classList.contains('btn-edit')) {
            showEducationModal(index);
        } else if (btn.classList.contains('btn-delete')) {
            deleteEducation(index);
        }
    });
}

function renderEducationList() {
    const list = document.getElementById('education-list');
    const empty = document.getElementById('education-empty');

    list.innerHTML = '';

    if (educationData.length === 0) {
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');

    educationData.forEach((edu, index) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-header">
                <div>
                    <div class="item-title">${edu.degree || ''} ${edu.field ? `in ${edu.field}` : ''}</div>
                    <div class="item-subtitle">${edu.school || ''}</div>
                    <div class="item-dates">
                        ${edu.startDate || ''} - ${edu.endDate || ''}
                        ${edu.gpa ? ` • GPA: ${edu.gpa}` : ''}
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-secondary btn-edit" data-index="${index}">Edit</button>
                    <button class="btn btn-danger-outline btn-delete" data-index="${index}">Delete</button>
                </div>
            </div>
        `;
        list.appendChild(card);
    });
}

function showEducationModal(index = null) {
    const isEdit = index !== null;
    const data = isEdit ? educationData[index] : {};

    document.getElementById('modal-title').textContent = isEdit ? 'Edit Education' : 'Add Education';

    document.getElementById('modal-body').innerHTML = `
        <div class="form-group">
            <label>School / University *</label>
            <input type="text" id="modal-school" value="${data.school || ''}" placeholder="Stanford University">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Degree *</label>
                <input type="text" id="modal-degree" value="${data.degree || ''}" placeholder="Bachelor of Science">
            </div>
            <div class="form-group">
                <label>Field of Study</label>
                <input type="text" id="modal-field" value="${data.field || ''}" placeholder="Computer Science">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Start Year</label>
                <input type="text" id="modal-start" value="${data.startDate || ''}" placeholder="2018">
            </div>
            <div class="form-group">
                <label>End Year (or Expected)</label>
                <input type="text" id="modal-end" value="${data.endDate || ''}" placeholder="2022">
            </div>
        </div>
        <div class="form-group">
            <label>GPA (Optional)</label>
            <input type="text" id="modal-gpa" value="${data.gpa || ''}" placeholder="3.8">
        </div>
    `;

    showModal();

    document.getElementById('modal-save').onclick = () => {
        const newData = {
            id: data.id || globalThis.ResumeManager.generateId(),
            school: document.getElementById('modal-school').value.trim(),
            degree: document.getElementById('modal-degree').value.trim(),
            field: document.getElementById('modal-field').value.trim(),
            startDate: document.getElementById('modal-start').value.trim(),
            endDate: document.getElementById('modal-end').value.trim(),
            gpa: document.getElementById('modal-gpa').value.trim()
        };

        if (!newData.school || !newData.degree) {
            showToast('Please fill in required fields', 'error');
            return;
        }

        if (isEdit) {
            educationData[index] = newData;
        } else {
            educationData.unshift(newData);
        }

        renderEducationList();

        // Sync with state
        State.current.education = [...educationData];
        checkDirty('education');

        hideModal();
        showToast(isEdit ? 'Education updated' : 'Education added', 'success');
    };
}

function deleteEducation(index) {
    showConfirmationModal(() => {
        educationData.splice(index, 1);
        renderEducationList();

        // Sync with state
        State.current.education = [...educationData];
        checkDirty('education');

        showToast('Education deleted', 'success');
    });
}

// ============================================
// PROJECTS SECTION
// ============================================

let projectsData = [];

function initProjectsSection() {
    document.getElementById('add-project-btn').addEventListener('click', () => {
        showProjectModal();
    });

    document.getElementById('projects-list').addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const index = parseInt(btn.dataset.index);

        if (btn.classList.contains('btn-edit')) {
            showProjectModal(index);
        } else if (btn.classList.contains('btn-delete')) {
            deleteProject(index);
        }
    });
}

function renderProjectsList() {
    const list = document.getElementById('projects-list');
    const empty = document.getElementById('projects-empty');

    list.innerHTML = '';

    if (projectsData.length === 0) {
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');

    projectsData.forEach((proj, index) => {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <div class="item-header">
                <div>
                    <div class="item-title">${proj.name || 'Untitled Project'}</div>
                    ${proj.technologies && proj.technologies.length > 0
                ? `<div class="item-dates">${proj.technologies.join(', ')}</div>`
                : ''}
                </div>
                <div class="item-actions">
                    <button class="btn btn-secondary btn-edit" data-index="${index}">Edit</button>
                    <button class="btn btn-danger-outline btn-delete" data-index="${index}">Delete</button>
                </div>
            </div>
            ${proj.description ? `<div class="item-description">${proj.description}</div>` : ''}
        `;
        list.appendChild(card);
    });
}

function showProjectModal(index = null) {
    const isEdit = index !== null;
    const data = isEdit ? projectsData[index] : {};

    document.getElementById('modal-title').textContent = isEdit ? 'Edit Project' : 'Add Project';

    document.getElementById('modal-body').innerHTML = `
        <div class="form-group">
            <label>Project Name *</label>
            <input type="text" id="modal-name" value="${data.name || ''}" placeholder="AI Resume Builder">
        </div>
        <div class="form-group">
            <label>Description</label>
            <textarea id="modal-description" rows="3" placeholder="What does this project do?">${data.description || ''}</textarea>
        </div>
        <div class="form-group">
            <label>Technologies Used</label>
            <input type="text" id="modal-tech" value="${(data.technologies || []).join(', ')}" placeholder="React, Node.js, MongoDB">
            <p class="field-hint">Comma-separated list</p>
        </div>
        <div class="form-group">
            <label>Project Link (Optional)</label>
            <input type="url" id="modal-link" value="${data.link || ''}" placeholder="https://github.com/...">
        </div>
    `;

    showModal();

    document.getElementById('modal-save').onclick = () => {
        const techInput = document.getElementById('modal-tech').value;
        const newData = {
            id: data.id || globalThis.ResumeManager.generateId(),
            name: document.getElementById('modal-name').value.trim(),
            description: document.getElementById('modal-description').value.trim(),
            technologies: techInput ? techInput.split(',').map(s => s.trim()).filter(s => s) : [],
            link: document.getElementById('modal-link').value.trim()
        };

        if (!newData.name) {
            showToast('Please enter a project name', 'error');
            return;
        }

        if (isEdit) {
            projectsData[index] = newData;
        } else {
            projectsData.unshift(newData);
        }

        renderProjectsList();

        // Sync with state
        State.current.projects = [...projectsData];
        checkDirty('projects');

        hideModal();
        showToast(isEdit ? 'Project updated' : 'Project added', 'success');
    };
}

function deleteProject(index) {
    showConfirmationModal(() => {
        projectsData.splice(index, 1);
        renderProjectsList();

        // Sync with state
        State.current.projects = [...projectsData];
        checkDirty('projects');

        showToast('Project deleted', 'success');
    });
}

// ============================================
// CUSTOM FIELDS SECTION
// ============================================

function initCustomFieldsSection() {
    const inputs = document.querySelectorAll('#tab-custom input, #tab-custom select');

    inputs.forEach(input => {
        const handler = () => {
            const fieldPath = input.dataset.field;
            if (!fieldPath) return;

            const [bucket, key] = fieldPath.includes('.') ? fieldPath.split('.') : ['custom', fieldPath];

            if (bucket === 'customFields') {
                if (input.type === 'radio') {
                    if (input.checked) {
                        State.current.custom[key] = input.value === 'true';
                    }
                } else {
                    State.current.custom[key] = input.value;
                }
            } else {
                State.current.custom[bucket] = input.value;
            }

            checkDirty('custom');
        };

        input.addEventListener('input', handler);
        if (input.tagName === 'SELECT' || input.type === 'radio') {
            input.addEventListener('change', handler);
        }
    });
}

// ============================================
// BUTTONS & ACTIONS
// ============================================

function initButtons() {
    // Global Save button (Legacy support / Bulk save)
    const globalSave = document.getElementById('save-btn');
    if (globalSave) {
        globalSave.addEventListener('click', async () => {
            const buckets = ['ai', 'identity'];
            for (const b of buckets) {
                const sections = Object.keys(SECTIONS).filter(s => SECTIONS[s].bucket === b);
                await performSectionSave(b, sections, globalSave);
            }
        });
    }

    // Per-section Save Buttons
    document.querySelectorAll('.section-save-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const bucket = btn.dataset.bucket;
            const sections = Object.keys(SECTIONS).filter(s => SECTIONS[s].bucket === bucket);
            await performSectionSave(bucket, sections, btn);
        });
    });

    initClearDataLogic();
}

/**
 * Handle "Clear All Data" logic with confirmation modal
 */
function initClearDataLogic() {
    const clearBtn = document.getElementById('clear-data-btn');
    const modal = document.getElementById('clear-data-modal');
    if (!clearBtn || !modal) return;

    const closeBtns = modal.querySelectorAll('.modal-close');
    const cancelBtn = document.getElementById('modal-cancel-clear');
    const confirmBtn = document.getElementById('modal-confirm-delete');
    const confirmInput = document.getElementById('delete-confirmation-input');

    const closeModal = () => {
        modal.classList.add('hidden');
        if (confirmInput) confirmInput.value = '';
        if (confirmBtn) confirmBtn.disabled = true;
    };

    clearBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        if (confirmInput) confirmInput.focus();
    });

    closeBtns.forEach(btn => btn.addEventListener('click', closeModal));
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (confirmInput) {
        confirmInput.addEventListener('input', () => {
            confirmBtn.disabled = confirmInput.value.toUpperCase() !== 'DELETE';
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Clearing...';

            try {
                // Clear all buckets in StorageVault
                const vault = globalThis.StorageVault;
                if (vault) {
                    await vault.clearAllBuckets();
                }

                showToast('All data has been cleared', 'success');
                setTimeout(() => window.location.reload(), 1000);
            } catch (error) {
                console.error('Clear data failed:', error);
                showToast('Failed to clear data', 'error');
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Delete Everything';
            }
        });
    }
}

// ============================================
// DATA LOADING & SAVING
// ============================================

async function loadAllData() {
    try {
        // Load API keys (round-robin list)
        const apiKeys = await globalThis.AIClient.getApiKeys?.() || [];
        const apiModel = await globalThis.AIClient.getStoredModel();

        if (apiKeys.length > 0) {
            renderApiKeysList(apiKeys);
        }
        if (apiModel) {
            document.getElementById('api-model').value = apiModel;
        }

        // Load resume data
        const data = await globalThis.ResumeManager.getResumeData();

        if (!data) {
            console.log('No existing resume data found');
            return;
        }

        // Personal info
        if (data.personal) {
            Object.entries(data.personal).forEach(([key, value]) => {
                const el = document.querySelector(`[data-field="personal.${key}"]`);
                if (el) el.value = value || '';
            });
        }

        // Summary
        if (data.summary) {
            const summaryEl = document.querySelector('[data-field="summary"]');
            if (summaryEl) summaryEl.value = data.summary;
        }

        // Skills
        if (data.skills) {
            setTagsInContainer('technical-skills-tags', data.skills.technical);
            setTagsInContainer('soft-skills-tags', data.skills.soft);
            setTagsInContainer('languages-tags', data.skills.languages);
            setTagsInContainer('certifications-tags', data.skills.certifications);
        }

        // Experience
        experienceData = data.experience || [];
        renderExperienceList();

        // Education
        educationData = data.education || [];
        renderEducationList();

        // Projects
        projectsData = data.projects || [];
        renderProjectsList();

        // Custom fields
        if (data.customFields) {
            Object.entries(data.customFields).forEach(([key, value]) => {
                const el = document.querySelector(`[data-field="customFields.${key}"]`);
                if (!el) return;

                if (el.type === 'radio') {
                    // Handle radio buttons
                    const radio = document.querySelector(`[name="${key}"][value="${value}"]`);
                    if (radio) radio.checked = true;
                } else {
                    el.value = value || '';
                }
            });
        }

        console.log('Resume data loaded');

    } catch (error) {
        console.error('Error loading data:', error);
        showToast('Error loading saved data', 'error');
    }
}

// Replaced by State-driven per-section saves

async function updateDataStatus() {
    const statusEl = document.getElementById('data-status');
    const apiStatusChip = document.querySelector('.api-status-indicator');
    const apiStatusText = document.getElementById('api-status-text');

    if (!statusEl || !apiStatusChip) return;

    try {
        const setup = await globalThis.AIClient.checkSetupStatus();
        const apiKeys = await globalThis.AIClient.getApiKeys?.() || [];
        const model = await globalThis.AIClient.getStoredModel();

        // 1. Update Global Resume Status (Header)
        const parts = [];
        if (setup.hasResume) parts.push('✓ Resume Profile Loaded');
        else parts.push('✗ No Resume Profile');
        statusEl.textContent = parts.join(' • ');
        statusEl.style.color = setup.hasResume ? 'var(--success-green)' : 'var(--warning-yellow)';

        // 2. Update API Status Indicator (Detailed)
        if (apiKeys.length === 0) {
            updateApiUiState('invalid', 'Missing Key', 'No API keys configured. Autofill is disabled.');
        } else {
            // Validate the first key as a proxy for usability
            const result = await globalThis.AIClient.validateApiKey(apiKeys[0], model);
            if (result.valid) {
                updateApiUiState('usable', 'Usable', 'API key is active and ready for requests.');
            } else if (result.error && result.error.includes('rate limit')) {
                updateApiUiState('limited', 'Rate-limited', 'Quota exceeded. Autofill will degrade temporarily.');
            } else {
                updateApiUiState('invalid', 'Invalid', result.error || 'Key rejected by provider.');
            }
        }
    } catch (error) {
        console.error('Status update failed:', error);
        updateApiUiState('invalid', 'Error', 'Failed to check API status.');
    }
}

function updateApiUiState(state, label, tooltip) {
    const chip = document.querySelector('.api-status-indicator');
    const text = document.getElementById('api-status-text');
    if (!chip || !text) return;

    chip.className = `api-status-indicator status-${state}`;
    text.textContent = label;

    // Update tooltip
    const tooltipEl = chip.querySelector('.api-status-tooltip');
    if (tooltipEl) tooltipEl.textContent = tooltip;
}

/**
 * Read-After-Write Consistency Test
 * Verifies that the UI state matches the StorageVault after a save.
 */
async function runConsistencyTest() {
    console.log('--- Starting Read-After-Write Consistency Test ---');
    const results = [];

    const vaultData = await globalThis.ResumeManager.getResumeData();
    const vaultKeys = await globalThis.AIClient.getApiKeys?.();

    // Check API Keys
    const apiKeysMatch = JSON.stringify(State.initial.api.keys) === JSON.stringify(vaultKeys);
    results.push({ area: 'API Keys', match: apiKeysMatch });

    // Check Personal Info
    const personalMatch = JSON.stringify(State.initial.personal) === JSON.stringify(vaultData.personal);
    results.push({ area: 'Personal', match: personalMatch });

    // Check Experience
    const expMatch = JSON.stringify(State.initial.experience) === JSON.stringify(vaultData.experience);
    results.push({ area: 'Experience', match: expMatch });

    console.table(results);
    const allPass = results.every(r => r.match);
    if (allPass) {
        console.log('✅ Consistency Check: PASSED');
        showToast('System Integrity Verified: All data consistent.', 'success');
    } else {
        console.error('❌ Consistency Check: FAILED');
        showToast('System Integrity Warning: Data mismatch detected!', 'error');
    }
    return allPass;
}

// Attach to window for diagnostic use
window.runConsistencyTest = runConsistencyTest;

// ============================================
// AI IMPORT
// ============================================

function initAIImport() {
    const aiImportBtn = document.getElementById('ai-import-btn');
    const aiImportModal = document.getElementById('ai-import-modal');
    const aiCloseBtn = document.getElementById('ai-import-close');
    const statusEl = document.getElementById('ai-import-status');

    // File Upload Elements
    const fileInput = document.getElementById('ai-resume-file');
    const uploadZone = document.getElementById('resume-upload-zone');
    const selectedFileName = document.getElementById('selected-file-name');

    let selectedFileBase64 = null;

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) handleFileSelection(file);
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type === 'application/pdf') {
            handleFileSelection(file);
        } else {
            setStatus(statusEl, 'Please upload a PDF file.', 'error');
        }
    });

    function setPremiumStatus(message, type) {
        statusEl.innerHTML = '';
        if (!message) return;

        const statusDiv = document.createElement('div');
        statusDiv.className = `status-premium ${type}`;
        statusDiv.innerHTML = `
            <span class="status-icon">${type === 'success' ? '✅' : '⚠️'}</span>
            <span class="status-message">${message}</span>
        `;
        statusEl.appendChild(statusDiv);

        if (type === 'error') {
            document.getElementById('ai-processing-state').classList.add('hidden');
            uploadZone.classList.remove('hidden');
        }
    }

    const hideAIModal = () => {
        aiImportModal.classList.add('hidden');
        fileInput.value = '';
        selectedFileBase64 = null;
        selectedFileName.classList.add('hidden');
        selectedFileName.textContent = '';
        statusEl.innerHTML = '';
        document.getElementById('ai-processing-state').classList.add('hidden');
        document.getElementById('ai-import-note').classList.remove('hidden');
        uploadZone.classList.remove('hidden');
    };

    async function handleFileSelection(file) {
        if (file.size > 5 * 1024 * 1024) {
            setPremiumStatus('File too large (max 5MB).', 'error');
            return;
        }

        selectedFileName.textContent = `📄 ${file.name}`;
        selectedFileName.classList.remove('hidden');
        setPremiumStatus('', '');

        // Convert to Base64 and trigger parsing
        const reader = new FileReader();
        reader.onload = async () => {
            selectedFileBase64 = reader.result.split(',')[1];
            await startAutoParsing();
        };
        reader.readAsDataURL(file);
    }

    async function startAutoParsing() {
        if (!selectedFileBase64) return;

        startLoading();
        try {
            const result = await globalThis.ResumeManager.parseResumeFile(selectedFileBase64);

            if (result && result.success) {
                await distributeParsedData(result.data);
                setPremiumStatus('Success! Profile updated.', 'success');
                showToast('Resume parsed successfully! Please review and save.', 'success');
                setTimeout(hideAIModal, 2000);
            } else {
                setPremiumStatus(result ? `Failed: ${result.error}` : 'Parsing failed.', 'error');
            }
        } catch (error) {
            setPremiumStatus('An unexpected error occurred.', 'error');
            console.error('Auto-parsing error:', error);
        } finally {
            stopLoading();
        }
    }

    function startLoading() {
        document.getElementById('ai-processing-state').classList.remove('hidden');
        document.getElementById('ai-import-note').classList.add('hidden');
        uploadZone.classList.add('hidden');
    }

    function stopLoading() {
        // Keeps processing state visible for feedback
    }

    // Modal Visibility
    aiImportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        aiImportModal.classList.remove('hidden');
    });

    aiCloseBtn.addEventListener('click', hideAIModal);

    // File Handling
    uploadZone.addEventListener('click', () => fileInput.click());
}

/**
 * Distribute parsed resume data into the UI components
 * @param {Object} data - Parsed resume data
 */
async function distributeParsedData(data) {
    if (!data) return;

    // Personal Info
    if (data.personal) {
        Object.entries(data.personal).forEach(([key, value]) => {
            const el = document.querySelector(`[data-field="personal.${key}"]`);
            if (el && value) {
                el.value = value;
                State.current.personal[key] = value;
            }
        });
        checkDirty('personal');
    }

    // Summary
    if (data.summary) {
        const el = document.querySelector('[data-field="summary"]');
        if (el) {
            el.value = data.summary;
            State.current.personal.summary = data.summary;
            checkDirty('personal');
        }
    }

    // Skills
    const skillsData = data.skills || data.skillSet || data.professionalSkills;
    if (skillsData) {
        const technical = skillsData.technical || skillsData.technicalSkills || skillsData.hardSkills || [];
        const soft = skillsData.soft || skillsData.softSkills || [];
        const languages = skillsData.languages || skillsData.spokenLanguages || [];
        const certifications = skillsData.certifications || skillsData.courses || [];

        if (technical.length > 0) {
            const list = Array.isArray(technical) ? technical : [technical];
            setTagsInContainer('technical-skills-tags', list);
            State.current.skills.technical = list;
        }
        if (soft.length > 0) {
            const list = Array.isArray(soft) ? soft : [soft];
            setTagsInContainer('soft-skills-tags', list);
            State.current.skills.soft = list;
        }
        if (languages.length > 0) {
            const list = Array.isArray(languages) ? languages : [languages];
            setTagsInContainer('languages-tags', list);
            State.current.skills.languages = list;
        }
        if (certifications.length > 0) {
            const list = Array.isArray(certifications) ? certifications : [certifications];
            setTagsInContainer('certifications-tags', list);
            State.current.skills.certifications = list;
        }
        checkDirty('skills');
    }

    // Experience
    const expData = data.experience || data.workHistory || data.employment || [];
    if (expData.length > 0) {
        const newExp = Array.isArray(expData) ? expData : [expData];
        experienceData = [...newExp, ...experienceData];
        // Remove duplicates
        experienceData = experienceData.reduce((acc, current) => {
            const x = acc.find(item => item.title === current.title && item.company === current.company);
            if (!x) return acc.concat([current]);
            else return acc;
        }, []);
        renderExperienceList();
        State.current.experience = [...experienceData];
        checkDirty('experience');
    }

    // Education
    const eduData = data.education || data.educationHistory || data.academicBackground || [];
    if (eduData.length > 0) {
        const newEdu = Array.isArray(eduData) ? eduData : [eduData];
        educationData = [...newEdu, ...educationData];
        educationData = educationData.reduce((acc, current) => {
            const x = acc.find(item => item.school === current.school && item.degree === current.degree);
            if (!x) return acc.concat([current]);
            else return acc;
        }, []);
        renderEducationList();
        State.current.education = [...educationData];
        checkDirty('education');
    }

    // Projects
    if (data.projects && data.projects.length > 0) {
        projectsData = [...data.projects, ...projectsData];
        projectsData = projectsData.reduce((acc, current) => {
            const x = acc.find(item => item.name === current.name);
            if (!x) return acc.concat([current]);
            else return acc;
        }, []);
        renderProjectsList();
        State.current.projects = [...projectsData];
        checkDirty('projects');
    }

    // Custom Fields
    if (data.customFields) {
        Object.entries(data.customFields).forEach(([key, value]) => {
            if (value === null || value === undefined) return;

            const elements = document.querySelectorAll(`[data-field="customFields.${key}"]`);
            elements.forEach(el => {
                if (el.type === 'radio') {
                    const val = String(value).toLowerCase();
                    const elVal = String(el.value).toLowerCase();
                    if (val === elVal) {
                        el.checked = true;
                        State.current.custom[key] = value === 'true';
                    }
                } else if (el.tagName === 'SELECT') {
                    el.value = value || '';
                    State.current.custom[key] = value;
                } else {
                    el.value = value || '';
                    State.current.custom[key] = value;
                }
            });
        });
        checkDirty('custom');
    }
}

// ============================================
// MODAL HELPERS
// ============================================

function showModal() {
    document.getElementById('item-modal').classList.remove('hidden');

    // Close on backdrop click
    document.querySelector('.modal-backdrop').onclick = hideModal;
    document.querySelector('.modal-close').onclick = hideModal;
    document.getElementById('modal-cancel').onclick = hideModal;
}

function hideModal() {
    document.getElementById('item-modal').classList.add('hidden');
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function setStatus(el, message, type) {
    el.textContent = message;
    el.className = `input-status ${type}`;
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Icon based on type
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'toastSlideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

function showConfirmationModal(onConfirm) {
    const modal = document.getElementById('generic-delete-modal');
    const confirmBtn = document.getElementById('generic-delete-confirm');
    const cancelBtn = document.getElementById('generic-delete-cancel');
    const closeBtn = modal.querySelector('.modal-close');

    // Remove old listeners to prevent stacking
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    const closeModal = () => {
        modal.classList.add('hidden');
    };

    newConfirmBtn.addEventListener('click', () => {
        onConfirm();
        closeModal();
    });

    cancelBtn.onclick = closeModal;
    closeBtn.onclick = closeModal;

    modal.classList.remove('hidden');
}
