/**
 * Options Page JavaScript for Smart AI Job Apply Extension
 * 
 * Handles resume data management, API key configuration, and UI interactions.
 */

// Wait for modules to load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Options page loaded');

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

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show corresponding content
            const tabId = tab.dataset.tab;
            tabContents.forEach(content => {
                content.classList.toggle('active', content.id === `tab-${tabId}`);
            });
        });
    });
}

// ============================================
// API KEY SECTION
// ============================================

function initApiKeySection() {
    const apiKeyInput = document.getElementById('api-key');
    const apiModelInput = document.getElementById('api-model');
    const toggleBtn = document.getElementById('toggle-key-visibility');
    const validateBtn = document.getElementById('validate-key-btn');
    const statusEl = document.getElementById('api-key-status');

    // Toggle visibility
    toggleBtn.addEventListener('click', () => {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';
        toggleBtn.querySelector('svg').innerHTML = isPassword
            ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
            : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    });

    // Validate key
    validateBtn.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();
        const model = apiModelInput.value.trim() || 'gemini-2.5-flash';

        if (!key) {
            setStatus(statusEl, 'Please enter an API key', 'error');
            return;
        }

        setStatus(statusEl, 'Validating...', 'loading');
        validateBtn.disabled = true;

        const result = await window.AIClient.validateApiKey(key, model);

        if (result.valid) {
            await window.AIClient.saveApiKey(key, model);
            setStatus(statusEl, '✓ API key is valid and saved!', 'success');
            showToast('API key saved successfully!', 'success');
            updateDataStatus();
        } else {
            setStatus(statusEl, `✗ ${result.error}`, 'error');
        }

        validateBtn.disabled = false;
    });
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
                    <button class="btn btn-secondary" onclick="editExperience(${index})">Edit</button>
                    <button class="btn btn-danger-outline" onclick="deleteExperience(${index})">Delete</button>
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

window.editExperience = (index) => showExperienceModal(index);
window.deleteExperience = (index) => {
    if (confirm('Are you sure you want to delete this experience?')) {
        experienceData.splice(index, 1);
        renderExperienceList();
        showToast('Experience deleted', 'success');
    }
};

// ============================================
// EDUCATION SECTION
// ============================================

let educationData = [];

function initEducationSection() {
    document.getElementById('add-education-btn').addEventListener('click', () => {
        showEducationModal();
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
                    <button class="btn btn-secondary" onclick="editEducation(${index})">Edit</button>
                    <button class="btn btn-danger-outline" onclick="deleteEducation(${index})">Delete</button>
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

window.editEducation = (index) => showEducationModal(index);
window.deleteEducation = (index) => {
    if (confirm('Are you sure you want to delete this education?')) {
        educationData.splice(index, 1);
        renderEducationList();
        showToast('Education deleted', 'success');
    }
};

// ============================================
// PROJECTS SECTION
// ============================================

let projectsData = [];

function initProjectsSection() {
    document.getElementById('add-project-btn').addEventListener('click', () => {
        showProjectModal();
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
                    <button class="btn btn-secondary" onclick="editProject(${index})">Edit</button>
                    <button class="btn btn-danger-outline" onclick="deleteProject(${index})">Delete</button>
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

window.editProject = (index) => showProjectModal(index);
window.deleteProject = (index) => {
    if (confirm('Are you sure you want to delete this project?')) {
        projectsData.splice(index, 1);
        renderProjectsList();
        showToast('Project deleted', 'success');
    }
};

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
    document.getElementById('save-btn').addEventListener('click', saveAllData);

    // Export button
    document.getElementById('export-btn').addEventListener('click', async () => {
        const jsonStr = await window.ResumeManager.exportResumeJSON();
        if (!jsonStr || jsonStr === 'null') {
            showToast('No data to export', 'warning');
            return;
        }

        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `smart-ai-job-apply-resume-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Resume exported successfully!', 'success');
    });

    // Import button
    document.getElementById('import-btn').addEventListener('click', () => {
        document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const result = await window.ResumeManager.importResumeJSON(text);

            if (result.success) {
                await loadAllData();
                showToast('Resume imported successfully!', 'success');
                updateDataStatus();
            } else {
                showToast(`Import failed: ${result.error}`, 'error');
            }
        } catch (error) {
            showToast('Failed to read file', 'error');
        }

        e.target.value = ''; // Reset file input
    });

    // Clear data button
    document.getElementById('clear-data-btn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear ALL data? This cannot be undone.')) {
            await window.ResumeManager.clearResumeData();
            await window.AIClient.removeApiKey();

            // Reset UI
            document.getElementById('api-key').value = '';
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
                document.getElementById(id).innerHTML = '';
            });

            showToast('All data cleared', 'success');
            updateDataStatus();
        }
    });
}

// ============================================
// DATA LOADING & SAVING
// ============================================

async function loadAllData() {
    try {
        // Load API key
        const apiKey = await window.AIClient.getStoredApiKey();
        const apiModel = await window.AIClient.getStoredModel();

        if (apiKey) {
            document.getElementById('api-key').value = apiKey;
            setStatus(document.getElementById('api-key-status'), '✓ API key configured', 'success');
        }

        if (apiModel) {
            document.getElementById('api-model').value = apiModel;
        }

        // Load resume data
        const data = await window.ResumeManager.getResumeData();

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

        // Save API key if entered
        const apiKey = document.getElementById('api-key').value.trim();
        const apiModel = document.getElementById('api-model').value.trim() || 'gemini-2.5-flash';

        if (apiKey) {
            await window.AIClient.saveApiKey(apiKey, apiModel);
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
