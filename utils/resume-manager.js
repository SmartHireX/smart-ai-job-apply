/**
 * Resume Manager for Smart AI Job Apply Extension
 * 
 * Handles all resume data operations using Chrome local storage.
 * Provides CRUD operations and import/export functionality.
 */

// Storage key for resume data
const RESUME_STORAGE_KEY = 'resumeData';

/**
 * Default resume data structure
 * This schema defines all available fields
 */
const DEFAULT_RESUME_SCHEMA = {
    personal: {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        location: '',          // City, State/Country
        linkedin: '',
        portfolio: '',         // Website/Portfolio URL
        github: ''
    },
    summary: '',               // Professional summary/objective
    experience: [
        // {
        //     id: 'uuid',
        //     company: '',
        //     title: '',
        //     location: '',
        //     startDate: '',      // YYYY-MM format
        //     endDate: '',        // YYYY-MM or 'Present'
        //     current: false,
        //     description: '',
        //     achievements: []    // Array of bullet points
        // }
    ],
    education: [
        // {
        //     id: 'uuid',
        //     school: '',
        //     degree: '',         // e.g., "Bachelor of Science"
        //     field: '',          // e.g., "Computer Science"
        //     location: '',
        //     startDate: '',
        //     endDate: '',
        //     gpa: '',
        //     achievements: []
        // }
    ],
    skills: {
        technical: [],          // Programming languages, frameworks, tools
        soft: [],               // Communication, leadership, etc.
        languages: [],          // Spoken languages with proficiency
        certifications: []      // Professional certifications
    },
    projects: [
        // {
        //     id: 'uuid',
        //     name: '',
        //     description: '',
        //     technologies: [],
        //     link: '',
        //     startDate: '',
        //     endDate: ''
        // }
    ],
    customFields: {
        // Common job application questions
        salaryExpectation: '',
        workAuthorization: '',      // e.g., "US Citizen", "H1B", etc.
        sponsorshipRequired: null,  // true/false/null
        noticePeriod: '',           // e.g., "2 weeks", "Immediate"
        willingToRelocate: null,    // true/false/null
        preferredLocation: '',      // e.g., "New York, Remote"
        veteranStatus: '',
        disabilityStatus: '',
        gender: '',
        ethnicity: '',
        referralSource: ''          // How did you hear about us
    },
    // Metadata
    meta: {
        createdAt: null,
        updatedAt: null,
        version: 1
    }
};

/**
 * Generate a simple UUID
 * @returns {string}
 */
function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Get the complete resume data
 * @returns {Promise<Object>}
 */
async function getResumeData() {
    const result = await chrome.storage.local.get([RESUME_STORAGE_KEY]);
    const data = result[RESUME_STORAGE_KEY];

    if (!data) {
        return null;
    }

    // Merge with default schema to ensure all fields exist
    return deepMerge(JSON.parse(JSON.stringify(DEFAULT_RESUME_SCHEMA)), data);
}

/**
 * Save complete resume data
 * @param {Object} data - Complete resume data object
 * @returns {Promise<void>}
 */
async function saveResumeData(data) {
    // Update metadata
    const now = new Date().toISOString();
    if (!data.meta) {
        data.meta = {};
    }
    if (!data.meta.createdAt) {
        data.meta.createdAt = now;
    }
    data.meta.updatedAt = now;
    data.meta.version = (data.meta.version || 0) + 1;

    await chrome.storage.local.set({ [RESUME_STORAGE_KEY]: data });
    console.log('Resume data saved successfully');
}

/**
 * Update a specific section of the resume
 * @param {string} section - Section name (e.g., 'personal', 'experience')
 * @param {Object|Array} sectionData - The new data for that section
 * @returns {Promise<void>}
 */
async function updateSection(section, sectionData) {
    const currentData = await getResumeData() || JSON.parse(JSON.stringify(DEFAULT_RESUME_SCHEMA));

    if (!(section in currentData)) {
        throw new Error(`Unknown resume section: ${section}`);
    }

    currentData[section] = sectionData;
    await saveResumeData(currentData);
}

/**
 * Add an item to an array section (experience, education, projects)
 * @param {string} section - Section name
 * @param {Object} item - Item to add
 * @returns {Promise<string>} - The ID of the added item
 */
async function addItem(section, item) {
    const currentData = await getResumeData() || JSON.parse(JSON.stringify(DEFAULT_RESUME_SCHEMA));

    if (!Array.isArray(currentData[section])) {
        throw new Error(`Section ${section} is not an array`);
    }

    const id = generateId();
    item.id = id;

    currentData[section].push(item);
    await saveResumeData(currentData);

    return id;
}

/**
 * Update an item in an array section
 * @param {string} section - Section name
 * @param {string} itemId - ID of the item to update
 * @param {Object} updates - Fields to update
 * @returns {Promise<boolean>}
 */
async function updateItem(section, itemId, updates) {
    const currentData = await getResumeData();

    if (!currentData || !Array.isArray(currentData[section])) {
        return false;
    }

    const index = currentData[section].findIndex(item => item.id === itemId);
    if (index === -1) {
        return false;
    }

    currentData[section][index] = { ...currentData[section][index], ...updates };
    await saveResumeData(currentData);

    return true;
}

/**
 * Delete an item from an array section
 * @param {string} section - Section name
 * @param {string} itemId - ID of the item to delete
 * @returns {Promise<boolean>}
 */
async function deleteItem(section, itemId) {
    const currentData = await getResumeData();

    if (!currentData || !Array.isArray(currentData[section])) {
        return false;
    }

    const index = currentData[section].findIndex(item => item.id === itemId);
    if (index === -1) {
        return false;
    }

    currentData[section].splice(index, 1);
    await saveResumeData(currentData);

    return true;
}

/**
 * Export resume data as JSON string
 * @returns {Promise<string>}
 */
async function exportResumeJSON() {
    const data = await getResumeData();
    return JSON.stringify(data, null, 2);
}

/**
 * Import resume data from JSON string
 * @param {string} jsonString - JSON string to import
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function importResumeJSON(jsonString) {
    try {
        const data = JSON.parse(jsonString);

        // Validate basic structure
        if (typeof data !== 'object' || data === null) {
            return { success: false, error: 'Invalid JSON: not an object' };
        }

        // Merge with default schema to ensure compatibility
        const mergedData = deepMerge(JSON.parse(JSON.stringify(DEFAULT_RESUME_SCHEMA)), data);

        await saveResumeData(mergedData);
        return { success: true };

    } catch (error) {
        console.error('Import error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Clear all resume data
 * @returns {Promise<void>}
 */
async function clearResumeData() {
    await chrome.storage.local.remove([RESUME_STORAGE_KEY]);
}

/**
 * Get a flattened version of resume data for form filling
 * This creates a simple key-value map for easy field matching
 * @returns {Promise<Object>}
 */
async function getFlattenedResumeData() {
    const data = await getResumeData();
    if (!data) return {};

    const flat = {};

    // Personal info
    if (data.personal) {
        flat.firstName = data.personal.firstName || '';
        flat.lastName = data.personal.lastName || '';
        flat.fullName = `${data.personal.firstName || ''} ${data.personal.lastName || ''}`.trim();
        flat.email = data.personal.email || '';
        flat.phone = data.personal.phone || '';
        flat.location = data.personal.location || '';
        flat.linkedin = data.personal.linkedin || '';
        flat.portfolio = data.personal.portfolio || '';
        flat.github = data.personal.github || '';
    }

    // Summary
    flat.summary = data.summary || '';
    flat.professionalSummary = data.summary || '';

    // Current/most recent job
    if (data.experience && data.experience.length > 0) {
        const current = data.experience.find(e => e.current) || data.experience[0];
        flat.currentTitle = current.title || '';
        flat.currentCompany = current.company || '';
        flat.currentJobDescription = current.description || '';

        // Total years of experience (rough calculation)
        const oldestJob = data.experience[data.experience.length - 1];
        if (oldestJob && oldestJob.startDate) {
            const startYear = parseInt(oldestJob.startDate.split('-')[0]);
            const currentYear = new Date().getFullYear();
            flat.yearsExperience = currentYear - startYear;
        }
    }

    // Highest education
    if (data.education && data.education.length > 0) {
        const highest = data.education[0];
        flat.degree = highest.degree || '';
        flat.fieldOfStudy = highest.field || '';
        flat.school = highest.school || '';
        flat.graduationYear = highest.endDate ? highest.endDate.split('-')[0] : '';
        flat.gpa = highest.gpa || '';
    }

    // Skills as string
    if (data.skills) {
        flat.technicalSkills = (data.skills.technical || []).join(', ');
        flat.softSkills = (data.skills.soft || []).join(', ');
        flat.allSkills = [
            ...(data.skills.technical || []),
            ...(data.skills.soft || [])
        ].join(', ');
        flat.languages = (data.skills.languages || []).join(', ');
        flat.certifications = (data.skills.certifications || []).join(', ');
    }

    // Custom fields
    if (data.customFields) {
        flat.salaryExpectation = data.customFields.salaryExpectation || '';
        flat.workAuthorization = data.customFields.workAuthorization || '';
        flat.sponsorshipRequired = data.customFields.sponsorshipRequired;
        flat.noticePeriod = data.customFields.noticePeriod || '';
        flat.willingToRelocate = data.customFields.willingToRelocate;
        flat.preferredLocation = data.customFields.preferredLocation || '';
        flat.veteranStatus = data.customFields.veteranStatus || '';
        flat.gender = data.customFields.gender || '';
        flat.ethnicity = data.customFields.ethnicity || '';
    }

    return flat;
}

/**
 * Get resume as formatted text (for AI context)
 * @returns {Promise<string>}
 */
async function getResumeAsText() {
    const data = await getResumeData();
    if (!data) return '';

    let text = '';

    // Personal
    if (data.personal) {
        const p = data.personal;
        text += `# ${p.firstName} ${p.lastName}\n`;
        if (p.email) text += `Email: ${p.email}\n`;
        if (p.phone) text += `Phone: ${p.phone}\n`;
        if (p.location) text += `Location: ${p.location}\n`;
        if (p.linkedin) text += `LinkedIn: ${p.linkedin}\n`;
        if (p.portfolio) text += `Website: ${p.portfolio}\n`;
        text += '\n';
    }

    // Summary
    if (data.summary) {
        text += `## Professional Summary\n${data.summary}\n\n`;
    }

    // Experience
    if (data.experience && data.experience.length > 0) {
        text += '## Experience\n';
        data.experience.forEach(exp => {
            text += `### ${exp.title} at ${exp.company}\n`;
            text += `${exp.startDate} - ${exp.current ? 'Present' : exp.endDate}`;
            if (exp.location) text += ` | ${exp.location}`;
            text += '\n';
            if (exp.description) text += `${exp.description}\n`;
            if (exp.achievements && exp.achievements.length > 0) {
                exp.achievements.forEach(a => text += `- ${a}\n`);
            }
            text += '\n';
        });
    }

    // Education
    if (data.education && data.education.length > 0) {
        text += '## Education\n';
        data.education.forEach(edu => {
            text += `### ${edu.degree} in ${edu.field}\n`;
            text += `${edu.school}`;
            if (edu.endDate) text += ` (${edu.endDate})`;
            if (edu.gpa) text += ` | GPA: ${edu.gpa}`;
            text += '\n\n';
        });
    }

    // Skills
    if (data.skills) {
        text += '## Skills\n';
        if (data.skills.technical && data.skills.technical.length > 0) {
            text += `Technical: ${data.skills.technical.join(', ')}\n`;
        }
        if (data.skills.soft && data.skills.soft.length > 0) {
            text += `Soft Skills: ${data.skills.soft.join(', ')}\n`;
        }
        if (data.skills.languages && data.skills.languages.length > 0) {
            text += `Languages: ${data.skills.languages.join(', ')}\n`;
        }
        if (data.skills.certifications && data.skills.certifications.length > 0) {
            text += `Certifications: ${data.skills.certifications.join(', ')}\n`;
        }
        text += '\n';
    }

    // Projects
    if (data.projects && data.projects.length > 0) {
        text += '## Projects\n';
        data.projects.forEach(proj => {
            text += `### ${proj.name}\n`;
            if (proj.description) text += `${proj.description}\n`;
            if (proj.technologies && proj.technologies.length > 0) {
                text += `Technologies: ${proj.technologies.join(', ')}\n`;
            }
            text += '\n';
        });
    }

    return text.trim();
}

/**
 * Deep merge two objects
 * @param {Object} target 
 * @param {Object} source 
 * @returns {Object}
 */
function deepMerge(target, source) {
    const output = { ...target };

    for (const key in source) {
        if (source.hasOwnProperty(key)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
                    output[key] = deepMerge(target[key], source[key]);
                } else {
                    output[key] = source[key];
                }
            } else {
                output[key] = source[key];
            }
        }
    }

    return output;
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ResumeManager = {
        getResumeData,
        saveResumeData,
        updateSection,
        addItem,
        updateItem,
        deleteItem,
        exportResumeJSON,
        importResumeJSON,
        clearResumeData,
        getFlattenedResumeData,
        getResumeAsText,
        generateId,
        DEFAULT_RESUME_SCHEMA,
        RESUME_STORAGE_KEY
    };
}

if (typeof self !== 'undefined' && typeof self.ResumeManager === 'undefined') {
    self.ResumeManager = {
        getResumeData,
        saveResumeData,
        updateSection,
        addItem,
        updateItem,
        deleteItem,
        exportResumeJSON,
        importResumeJSON,
        clearResumeData,
        getFlattenedResumeData,
        getResumeAsText,
        generateId,
        DEFAULT_RESUME_SCHEMA,
        RESUME_STORAGE_KEY
    };
}
