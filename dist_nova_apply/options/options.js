/**
 * Options Page JavaScript for Nova Apply Extension
 * 
 * Handles resume data management, API key configuration, and UI interactions.
 */

// Wait for modules to load
document.addEventListener('DOMContentLoaded', async () => {
    // // console.log('Nova Apply options page loaded');

    // Initialize tabs
    initTabs();

    // Initialize API key section
    initApiKeySection();

    // Initialize all form sections
    initPersonalSection();
    initSkillsSection();
    initExperienceSection();
    initEducationSection();
    initProjectsSection();
    initCustomFieldsSection();

    // Initialize buttons
    initButtons();

    // Initialize AI Import
    initAIImport();

    // Load existing data
    await loadAllData();

    // Update status
    updateDataStatus();
});

// ============================================
// TABS
// ============================================

function initTabs() {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    // Tab switching
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');
            const targetSection = document.getElementById(`tab-${targetTab}`);
            const tabTitle = document.getElementById('current-tab-title');

            if (targetSection) {
                // Update tabs
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update sections
                tabContents.forEach(content => content.classList.remove('active'));
                targetSection.classList.add('active');

                // Update header title
                if (tabTitle) {
                    tabTitle.textContent = tab.querySelector('.tab-text') ?
                        tab.querySelector('.tab-text').textContent :
                        tab.textContent.replace(/[^\w\s]/g, '').trim();
                }
            }
        });
    });
}

// ============================================
// API KEY SECTION (single + multiple rotation)
// ============================================

const MAX_API_KEYS_UI = 5;

function maskKey(key) {
    if (!key || key.length < 12) return '••••••••';
    return key.slice(0, 6) + '••••••••' + key.slice(-4);
}

function getModelValue() {
    return document.getElementById('api-model')?.value?.trim() || 'gemini-2.5-flash';
}

function renderApiKeysList(keys) {
    const listEl = document.getElementById('api-keys-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    (keys || []).forEach((key, index) => {
        const row = document.createElement('div');
        row.className = 'api-key-row';
        row.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px; padding: 8px; background: var(--bg-secondary, #f1f5f9); border-radius: 8px;';
        row.innerHTML = `
            <span class="api-key-mask" style="flex: 1; font-family: monospace; font-size: 13px;">${maskKey(key)}</span>
            <button type="button" class="btn btn-secondary btn-small validate-key-at" data-index="${index}">Validate</button>
            <button type="button" class="btn btn-danger-outline btn-small remove-key-at" data-index="${index}">Remove</button>
        `;
        row.querySelector('.validate-key-at').addEventListener('click', async () => {
            const statusEl = document.getElementById('api-keys-status');
            setStatus(statusEl, 'Validating...', 'loading');
            const model = getModelValue();
            const result = await window.AIClient.validateApiKey(key, model);
            if (result.valid) setStatus(statusEl, `✓ Key ${index + 1} is valid`, 'success');
            else setStatus(statusEl, `✗ Key ${index + 1}: ${result.error}`, 'error');
        });
        row.querySelector('.remove-key-at').addEventListener('click', () => {
            const updated = keys.filter((_, i) => i !== index);
            saveApiKeysToStorage(updated);
            renderApiKeysList(updated);
            updateDataStatus();
        });
        listEl.appendChild(row);
    });
}

async function saveApiKeysToStorage(keys) {
    const model = getModelValue();
    if (window.AIClient?.saveApiKeys) {
        await window.AIClient.saveApiKeys(keys, model);
    } else if (keys.length > 0) {
        await window.AIClient.saveApiKey(keys[0], model);
    }
}

function initApiKeySection() {
    const apiModelInput = document.getElementById('api-model');
    const addKeyBtn = document.getElementById('add-api-key-btn');
    const newKeyInput = document.getElementById('api-key-new');

    if (addKeyBtn && newKeyInput) {
        addKeyBtn.addEventListener('click', async () => {
            const key = newKeyInput.value.trim();
            const statusEl = document.getElementById('api-keys-status');
            if (!key) {
                setStatus(statusEl, 'Enter a key to add', 'error');
                return;
            }
            const keys = await window.AIClient.getApiKeys?.() || [];
            if (keys.length >= MAX_API_KEYS_UI) {
                setStatus(statusEl, `Maximum ${MAX_API_KEYS_UI} keys allowed`, 'error');
                return;
            }
            setStatus(statusEl, 'Validating...', 'loading');
            const model = getModelValue();
            const result = await window.AIClient.validateApiKey(key, model);
            if (result.valid) {
                let newKeys = keys.filter(k => k !== key);
                newKeys.push(key);
                newKeys = newKeys.slice(0, MAX_API_KEYS_UI);
                await window.AIClient.saveApiKeys(newKeys, model);
                renderApiKeysList(newKeys);
                newKeyInput.value = '';
                setStatus(statusEl, `✓ Key added (${newKeys.length}/${MAX_API_KEYS_UI})`, 'success');
                updateDataStatus();
            } else {
                setStatus(statusEl, result.error || 'Validation failed', 'error');
            }
        });
    }
}

// ============================================
// PERSONAL INFO SECTION
// ============================================

function initPersonalSection() {
    // All inputs with data-field attribute auto-save on change
    const inputs = document.querySelectorAll('#tab-personal input, #tab-personal textarea');

    inputs.forEach(input => {
        input.addEventListener('change', () => {
            // Auto-save handled by saveAllData on explicit save button
        });
    });
}

// ============================================
// SKILLS SECTION
// ============================================

function initSkillsSection() {
    const skillFields = [
        { input: 'technical-skills', container: 'technical-skills-tags', field: 'skills.technical' },
        { input: 'soft-skills', container: 'soft-skills-tags', field: 'skills.soft' },
        { input: 'languages', container: 'languages-tags', field: 'skills.languages' },
        { input: 'certifications', container: 'certifications-tags', field: 'skills.certifications' }
    ];

    skillFields.forEach(({ input, container }) => {
        const inputEl = document.getElementById(input);
        const containerEl = document.getElementById(container);

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTagFromInput(inputEl, containerEl);
            }
        });

        inputEl.addEventListener('blur', () => {
            addTagFromInput(inputEl, containerEl);
        });
    });
}

function addTagFromInput(inputEl, containerEl) {
    const value = inputEl.value.trim().replace(/,+$/, '');
    if (!value) return;

    // Split by comma for multiple entries
    const items = value.split(',').map(s => s.trim()).filter(s => s);

    items.forEach(item => {
        // Check for duplicates
        const existing = containerEl.querySelectorAll('.tag');
        const isDuplicate = Array.from(existing).some(tag =>
            tag.textContent.replace('×', '').trim().toLowerCase() === item.toLowerCase()
        );

        if (!isDuplicate) {
            const tag = createTag(item, containerEl);
            containerEl.appendChild(tag);
        }
    });

    inputEl.value = '';
}

function createTag(text, container) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.innerHTML = `
        ${text}
        <button class="tag-remove" title="Remove">×</button>
    `;

    tag.querySelector('.tag-remove').addEventListener('click', () => {
        tag.remove();
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
            id: data.id || window.ResumeManager.generateId(),
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
        hideModal();
        showToast(isEdit ? 'Experience updated' : 'Experience added', 'success');
    };
}




function deleteExperience(index) {
    showConfirmationModal(() => {
        experienceData.splice(index, 1);
        renderExperienceList();
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
            id: data.id || window.ResumeManager.generateId(),
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
        hideModal();
        showToast(isEdit ? 'Education updated' : 'Education added', 'success');
    };
}



function deleteEducation(index) {
    showConfirmationModal(() => {
        educationData.splice(index, 1);
        renderEducationList();
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
            id: data.id || window.ResumeManager.generateId(),
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
        hideModal();
        showToast(isEdit ? 'Project updated' : 'Project added', 'success');
    };
}



function deleteProject(index) {
    showConfirmationModal(() => {
        projectsData.splice(index, 1);
        renderProjectsList();
        showToast('Project deleted', 'success');
    });
}

// ============================================
// CUSTOM FIELDS SECTION
// ============================================

function initCustomFieldsSection() {
    // Handle radio buttons for boolean fields
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', () => {
            // Auto-save handled by saveAllData
        });
    });
}

// ============================================
// BUTTONS & ACTIONS
// ============================================

function initButtons() {
    // Save button
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', saveAllData);
    }

    // Wire up per-tab save buttons
    document.querySelectorAll('.save-tab-btn').forEach(btn => {
        btn.addEventListener('click', saveAllData);
    });

    // Clear data button initialization
    const clearDataBtn = document.getElementById('clear-data-btn');
    const clearDataModal = document.getElementById('clear-data-modal');
    const clearDataCloseBtn = clearDataModal.querySelector('.modal-close');
    const deleteConfirmInput = document.getElementById('delete-confirmation-input');
    const confirmDeleteBtn = document.getElementById('modal-confirm-delete');
    const cancelClearBtn = document.getElementById('modal-cancel-clear');

    if (clearDataBtn) {
        clearDataBtn.addEventListener('click', () => {
            clearDataModal.classList.remove('hidden');
            deleteConfirmInput.value = '';
            confirmDeleteBtn.disabled = true;
        });
    }

    const hideClearDataModal = () => {
        clearDataModal.classList.add('hidden');
        deleteConfirmInput.value = '';
    };

    if (clearDataCloseBtn) clearDataCloseBtn.addEventListener('click', hideClearDataModal);
    if (cancelClearBtn) cancelClearBtn.addEventListener('click', hideClearDataModal);

    if (deleteConfirmInput) {
        deleteConfirmInput.addEventListener('input', (e) => {
            confirmDeleteBtn.disabled = e.target.value !== 'DELETE';
        });
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', async () => {
            if (deleteConfirmInput.value === 'DELETE') {
                await window.ResumeManager.clearResumeData();
                await window.AIClient.removeApiKey();

                // Reset UI
                const newKeyEl = document.getElementById('api-key-new');
                if (newKeyEl) newKeyEl.value = '';
                renderApiKeysList([]);
                document.querySelectorAll('input[data-field], textarea[data-field], select[data-field]').forEach(el => {
                    if (el.type === 'radio' || el.type === 'checkbox') {
                        el.checked = false;
                    } else {
                        el.value = '';
                    }
                });
                experienceData = [];
                educationData = [];
                projectsData = [];
                renderExperienceList();
                renderEducationList();
                renderProjectsList();
                ['technical-skills-tags', 'soft-skills-tags', 'languages-tags', 'certifications-tags'].forEach(id => {
                    const container = document.getElementById(id);
                    if (container) container.innerHTML = '';
                });

                clearDataModal.classList.add('hidden');
                showToast('All data has been cleared', 'success');
                updateDataStatus();
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
        const apiKeys = await window.AIClient.getApiKeys?.() || [];
        const apiModel = await window.AIClient.getStoredModel();

        if (apiKeys.length > 0) {
            renderApiKeysList(apiKeys);
        }
        const modelInput = document.getElementById('api-model');
        if (modelInput) {
            modelInput.value = apiModel || 'gemini-2.5-flash';
        }

        // Load resume data
        const data = await window.ResumeManager.getResumeData();

        if (!data) {
            // // console.log('No existing resume data found');
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

        // // console.log('Resume data loaded');

    } catch (error) {
        console.error('Error loading data:', error);
        showToast('Error loading saved data', 'error');
    }
}

async function saveAllData() {
    try {
        const saveBtn = document.getElementById('save-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="loading-spinner"></span> Saving...';

        // Collect all data
        const resumeData = {
            personal: {
                firstName: document.getElementById('firstName')?.value.trim() || '',
                lastName: document.getElementById('lastName')?.value.trim() || '',
                email: document.getElementById('email')?.value.trim() || '',
                phone: document.getElementById('phone')?.value.trim() || '',
                location: document.getElementById('location')?.value.trim() || '',
                linkedin: document.getElementById('linkedin')?.value.trim() || '',
                github: document.getElementById('github')?.value.trim() || '',
                portfolio: document.getElementById('portfolio')?.value.trim() || ''
            },
            summary: document.getElementById('summary')?.value.trim() || '',
            experience: experienceData,
            education: educationData,
            skills: {
                technical: getTagsFromContainer('technical-skills-tags'),
                soft: getTagsFromContainer('soft-skills-tags'),
                languages: getTagsFromContainer('languages-tags'),
                certifications: getTagsFromContainer('certifications-tags')
            },
            projects: projectsData,
            customFields: {
                salaryExpectation: document.getElementById('salaryExpectation')?.value.trim() || '',
                noticePeriod: document.getElementById('noticePeriod')?.value.trim() || '',
                workAuthorization: document.getElementById('workAuthorization')?.value || '',
                sponsorshipRequired: getRadioValue('sponsorshipRequired'),
                willingToRelocate: getRadioValue('willingToRelocate'),
                preferredLocation: document.getElementById('preferredLocation')?.value.trim() || '',
                veteranStatus: document.getElementById('veteranStatus')?.value || '',

                disabilityStatus: document.getElementById('disabilityStatus')?.value || '',
                gender: document.getElementById('gender')?.value || '',
                ethnicity: document.getElementById('ethnicity')?.value || '',
                referralSource: document.getElementById('referralSource')?.value.trim() || ''
            }
        };

        // Save to storage
        await window.ResumeManager.saveResumeData(resumeData);

        // Save API keys and model
        const apiModel = getModelValue();
        const apiKeys = await window.AIClient.getApiKeys?.() || [];

        // Always save model even if keys are empty (for future use or custom config)
        if (window.AIClient?.saveApiKeys) {
            await window.AIClient.saveApiKeys(apiKeys, apiModel);
        } else if (apiKeys.length > 0) {
            await window.AIClient.saveApiKey(apiKeys[0], apiModel);
        }

        showToast('All changes saved!', 'success');
        updateDataStatus();

        // Show save status
        const statusEl = document.getElementById('save-status');
        statusEl.textContent = 'Saved!';
        statusEl.classList.add('visible');
        setTimeout(() => statusEl.classList.remove('visible'), 3000);

    } catch (error) {
        console.error('Error saving data:', error);
        showToast('Error saving data: ' + error.message, 'error');
    } finally {
        const saveBtn = document.getElementById('save-btn');
        saveBtn.disabled = false;
        saveBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            Save All Changes
        `;
    }
}

function getRadioValue(name) {
    const checked = document.querySelector(`input[name="${name}"]:checked`);
    if (!checked) return null;
    return checked.value === 'true';
}

async function updateDataStatus() {
    const status = await window.AIClient.checkSetupStatus();
    const statusEl = document.getElementById('data-status');

    const parts = [];
    if (status.hasApiKey) parts.push('✓ API Key');
    else parts.push('✗ No API Key');

    if (status.hasResume) parts.push('✓ Resume Data');
    else parts.push('✗ No Resume');

    statusEl.textContent = parts.join(' • ');
    statusEl.style.color = status.ready ? 'var(--success)' : 'var(--warning)';
}

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
            const result = await window.ResumeManager.parseResumeFile(selectedFileBase64);

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
            if (el && value) el.value = value;
        });
    }

    // Summary
    if (data.summary) {
        const el = document.querySelector('[data-field="summary"]');
        if (el) el.value = data.summary;
    }

    // Skills
    const skillsData = data.skills || data.skillSet || data.professionalSkills;
    if (skillsData) {
        const technical = skillsData.technical || skillsData.technicalSkills || skillsData.hardSkills || [];
        const soft = skillsData.soft || skillsData.softSkills || [];
        const languages = skillsData.languages || skillsData.spokenLanguages || [];
        const certifications = skillsData.certifications || skillsData.courses || [];

        if (technical.length > 0) setTagsInContainer('technical-skills-tags', Array.isArray(technical) ? technical : [technical]);
        if (soft.length > 0) setTagsInContainer('soft-skills-tags', Array.isArray(soft) ? soft : [soft]);
        if (languages.length > 0) setTagsInContainer('languages-tags', Array.isArray(languages) ? languages : [languages]);
        if (certifications.length > 0) setTagsInContainer('certifications-tags', Array.isArray(certifications) ? certifications : [certifications]);
    }

    // Experience
    const expData = data.experience || data.workHistory || data.employment || [];
    if (expData.length > 0) {
        const newExp = Array.isArray(expData) ? expData : [expData];
        experienceData = [...newExp, ...experienceData];
        // Remove duplicates based on title and company
        experienceData = experienceData.reduce((acc, current) => {
            const x = acc.find(item => item.title === current.title && item.company === current.company);
            if (!x) return acc.concat([current]);
            else return acc;
        }, []);
        renderExperienceList();
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
    }

    // Custom Fields
    if (data.customFields) {
        Object.entries(data.customFields).forEach(([key, value]) => {
            if (value === null || value === undefined) return;

            // Find all matching elements (could be a single input or a group of radios)
            const elements = document.querySelectorAll(`[data-field="customFields.${key}"]`);

            elements.forEach(el => {
                if (el.type === 'radio') {
                    // For radios, check if the value matches (handling both string and boolean)
                    const val = String(value).toLowerCase();
                    const elVal = String(el.value).toLowerCase();
                    if (val === elVal) el.checked = true;
                } else if (el.tagName === 'SELECT') {
                    // For selects, find the matching option
                    el.value = value || '';
                } else {
                    // Default for text, tel, email, textarea
                    el.value = value || '';
                }
            });
        });
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

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || ''}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close">&times;</button>
    `;

    toast.querySelector('.toast-close').onclick = () => toast.remove();

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
