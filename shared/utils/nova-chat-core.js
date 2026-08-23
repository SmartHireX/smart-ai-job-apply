/**
 * Nova Chat Core — shared logic for chat-widget.js
 * Exposes window.NovaChatCore for use by the chat widget.
 * No chrome.* calls here — pure functions only, callers handle browser APIs.
 */
(function () {
    // ── HTML escape ───────────────────────────────────────────────────────────
    function esc(t) {
        return String(t)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Markdown → HTML formatter ─────────────────────────────────────────────
    // onNavigate(url) — optional callback; caller handles chrome.tabs / sendMessage
    function fmt(text, onNavigate) {
        // Fire NAVIGATE side-effect before any other processing
        const navMatch = text.match(/\[NAVIGATE:\s*(https?:\/\/[^\]]+)\]/i);
        if (navMatch && typeof onNavigate === 'function') {
            setTimeout(() => onNavigate(navMatch[1].trim()), 600);
        }

        // 1. Hoist fenced code blocks before HTML escaping
        const codeBlocks = [];
        let out = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, _lang, code) => {
            const i = codeBlocks.length;
            codeBlocks.push(`<pre><code>${esc(code.trimEnd())}</code></pre>`);
            return `\x00CODE${i}\x00`;
        });

        // 2. Escape
        out = esc(out);

        // 3. Block-level (headings, hr) — before inline so ** inside heading works
        out = out
            .replace(/^### (.+)$/gm, '<div style="font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em;margin:10px 0 4px;">$1</div>')
            .replace(/^## (.+)$/gm,  '<div style="font-size:14px;font-weight:700;color:#111827;margin:10px 0 4px;">$1</div>')
            .replace(/^# (.+)$/gm,   '<div style="font-size:15px;font-weight:800;color:#111827;margin:10px 0 4px;">$1</div>')
            .replace(/^---+$/gm,     '<hr style="border:none;border-top:1px solid #e5e7eb;margin:8px 0;">')
        // 4. Inline
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g,     '<em>$1</em>')
            .replace(/`([^`]+)`/g,     '<code>$1</code>')
            // Markdown links — open in same tab
            .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
                (_, label, url) => `<a href="${url}" style="color:#6366f1;font-weight:500;text-decoration:underline;">${label}</a>`)
            // NAVIGATE tag → button — open in same tab
            .replace(/\[NAVIGATE:\s*(https?:\/\/[^\]]+)\]/gi, (_, url) =>
                `<a href="${esc(url)}" style="display:inline-flex;align-items:center;gap:4px;margin-top:6px;padding:5px 11px;background:#6366f1;color:white;border-radius:7px;font-size:12px;font-weight:600;text-decoration:none;">↗ Opening…</a>`)
            // Bullet lists
            .replace(/^[•\-\*] (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
            // Numbered lists
            .replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>')
            .replace(/(<oli>[\s\S]*?<\/oli>\n?)+/g, m =>
                `<ol>${m.replace(/<\/?oli>/g, t => t.replace('oli', 'li'))}</ol>`)
            .replace(/\n/g, '<br>');

        // 5. Re-inject code blocks
        out = out.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[+i]);
        return out;
    }

    // ── Domain-aware chips ────────────────────────────────────────────────────
    const DOMAIN_CHIPS = [
        {
            match: /linkedin\.com/,
            chips: [
                { label: '🔍 Analyze job fit',  prompt: 'Analyze how well my profile fits this job. List matching skills and gaps.' },
                { label: '✉ Connection note',    prompt: 'Write a short, warm LinkedIn connection request note for this person or role.' },
                { label: '💼 Summarize role',    prompt: 'Summarize this job posting: key responsibilities, required skills, and company info.' },
                { label: '💾 Save job',          prompt: 'save this job' },
            ]
        },
        {
            match: /indeed\.com/,
            chips: [
                { label: '📝 Cover letter',      prompt: 'Write a tailored cover letter for this job posting.' },
                { label: '💰 Salary insights',   prompt: 'What is the typical salary range for this role and location?' },
                { label: '🔍 Analyze job fit',   prompt: 'Analyze how well my background fits this job. List matching skills and gaps.' },
                { label: '💾 Save job',          prompt: 'save this job' },
            ]
        },
        {
            match: /glassdoor\.com/,
            chips: [
                { label: '📝 Cover letter',      prompt: 'Write a tailored cover letter for this job posting.' },
                { label: '💰 Salary insights',   prompt: 'What salary should I expect or negotiate for this role based on this page?' },
                { label: '🔍 Analyze job fit',   prompt: 'Analyze how well my background fits this job. List matching skills and gaps.' },
                { label: '💾 Save job',          prompt: 'save this job' },
            ]
        },
        {
            match: /lever\.co|greenhouse\.io|workday\.com|myworkdayjobs\.com|icims\.com|jobvite\.com|smartrecruiters\.com|taleo\.net|successfactors/,
            chips: [
                { label: '📝 Cover letter',      prompt: 'Write a tailored cover letter for this job posting.' },
                { label: '🔍 Analyze job fit',   prompt: 'Analyze how well my background fits this job. List matching skills and gaps.' },
                { label: '💾 Save job',          prompt: 'save this job' },
                { label: '❓ Common questions',   prompt: 'What interview questions should I prepare for based on this job description?' },
            ]
        },
        {
            match: /wellfound\.com|angel\.co/,
            chips: [
                { label: '🚀 Startup pitch',     prompt: 'Write a short pitch message to this startup explaining why I want to join.' },
                { label: '🔍 Analyze job fit',   prompt: 'Analyze how well my background fits this role. List matching skills and gaps.' },
                { label: '💾 Save job',          prompt: 'save this job' },
                { label: '💰 Salary & equity',   prompt: 'What is a fair salary and equity range for this role at this stage startup?' },
            ]
        },
        {
            match: /github\.com/,
            chips: [
                { label: '📄 Summarize repo',    prompt: 'Summarize what this GitHub repo does, its tech stack, and its purpose.' },
                { label: '⊞ Extract stack',      prompt: 'What technologies, languages, and frameworks does this project use?' },
                { label: '✦ Key points',         prompt: 'What are the most important things to know about this project?' },
                { label: '❓ How to contribute',  prompt: 'How can I contribute to this project? What is the process?' },
            ]
        },
    ];

    const DEFAULT_CHIPS = [
        { label: '📄 Summarize',    prompt: 'Please summarize this page for me.' },
        { label: '✦ Key points',    prompt: 'What are the most important key points on this page?' },
        { label: '⊞ Extract data',  prompt: 'Extract the key data and facts from this page into a structured list.' },
        { label: '🔍 Keyword match', prompt: 'analyze keyword match with my resume' },
        { label: '👤 Profile score', prompt: 'show my profile completeness score' },
        { label: '📋 Daily briefing', prompt: 'show my daily briefing' },
        { label: '🔖 Save page',    prompt: 'save this page' },
    ];

    function getChipsForPage(hostname, href = '') {
        // URL-pattern detection for job detail vs listing pages (runs before hostname lookup)
        if (href) {
            // Job detail page patterns
            if (/\/jobs\/view\/|\/job\/|\/jobs\/|\/posting\/|\/apply\//i.test(href)) {
                return [
                    { label: '⚡ Fill form',       prompt: 'fill this form' },
                    { label: '🎯 Check fit',       prompt: 'How well do I match this job? Analyze my fit.' },
                    { label: '🔍 Keywords',       prompt: 'analyze keyword match with my resume' },
                    { label: '📝 Cover letter',    prompt: 'Write a tailored cover letter for this job posting.' },
                    { label: '💾 Save job',        prompt: 'save this job' },
                ];
            }
            // Job listing page patterns
            if (/\/jobs\/search|\/job-search|\?q=|\/jobs\?|search\?/i.test(href)) {
                return [
                    { label: '🔍 Scan all jobs',   prompt: 'scan jobs on this page' },
                    { label: '🎯 Best matches',    prompt: 'Which jobs on this page best match my profile?' },
                    { label: '📄 Summarize',       prompt: 'Summarize the jobs on this page.' },
                    { label: '🔖 Save page',       prompt: 'save this page' },
                ];
            }
        }
        // Fallback to hostname-based DOMAIN_CHIPS
        const entry = DOMAIN_CHIPS.find(d => d.match.test(hostname));
        return entry ? entry.chips : DEFAULT_CHIPS;
    }

    // ── Known-URL table (instant nav, no AI round-trip) ───────────────────────
    const KNOWN_URLS = [
        { host: /linkedin\.com/, pattern: /\bmy profile\b|\bmy linkedin\b|\bview profile\b|\bopen profile\b/i, url: 'https://www.linkedin.com/in/me',              label: 'My LinkedIn Profile' },
        { host: /linkedin\.com/, pattern: /\bmy jobs\b|\bsaved jobs\b/i,                                       url: 'https://www.linkedin.com/my-items/saved-jobs', label: 'My Saved Jobs' },
        { host: /linkedin\.com/, pattern: /\bmy (feed|home)\b|\blinkedin home\b/i,                             url: 'https://www.linkedin.com/feed',                label: 'LinkedIn Feed' },
        { host: /linkedin\.com/, pattern: /\bmy (network|connections)\b/i,                                     url: 'https://www.linkedin.com/mynetwork',           label: 'My Network' },
        { host: /linkedin\.com/, pattern: /\b(messages?|inbox)\b/i,                                            url: 'https://www.linkedin.com/messaging',           label: 'Messages' },
        { host: /linkedin\.com/, pattern: /\bnotifications?\b/i,                                               url: 'https://www.linkedin.com/notifications',       label: 'Notifications' },
        { host: /linkedin\.com/, pattern: /\bjobs?\b/i,                                                        url: 'https://www.linkedin.com/jobs',                label: 'Jobs' },
        { host: /indeed\.com/,   pattern: /\bmy profile\b|\bmy resume\b/i,                                     url: 'https://profile.indeed.com',                  label: 'My Indeed Profile' },
    ];

    function resolveKnownUrl(text, hostname) {
        for (const entry of KNOWN_URLS) {
            if (!entry.host.test(hostname)) continue;
            if (!entry.pattern.test(text)) continue;
            return { url: entry.url, label: entry.label };
        }
        return null;
    }

    // ── System prompt ─────────────────────────────────────────────────────────
    function buildSystemPrompt(pageTitle, pageUrl) {
        return `You are Nova, a smart AI assistant built into a browser extension for job seekers.
You help users navigate the web, understand pages, write content, and find jobs.
Format your responses clearly: use **bold** for key terms, bullet points for lists, and keep answers concise.
Never give manual step-by-step instructions like "click the Me icon" — Nova CAN navigate directly, so always navigate instead of explaining how.
Never say "I can't open links" or "I can't navigate" — Nova CAN take actions on the browser.
When the prompt includes sections like "--- My Resume / Profile ---", "--- My Notepad Notes ---", "--- My Saved Pages ---", "--- My Saved Clips ---", or "--- My Recent Clipboard ---", treat that data as the user's actual personal information and use it to give specific, personalised answers. Do not say "I don't have access to your data" — you do.
Current page: "${pageTitle}" at ${pageUrl}.`;
    }

    // ── Intent classifier prompt ──────────────────────────────────────────────
    function buildClassifierPrompt(userText, historyLines, pageUrl) {
        const history = historyLines.length ? historyLines.join('\n') : 'none';
        return `You are an intent classifier. Return ONLY a JSON object, nothing else.

Page: ${pageUrl}
History: ${history}
User: "${userText}"

Possible outputs:
{"intent":"navigate","destination":"<plain words, e.g. my LinkedIn profile>"}
{"intent":"search","query":"<terms>","engine":"google|youtube|linkedin|twitter|github"}
{"intent":"summarize"}
{"intent":"explain","topic":"<topic>"}
{"intent":"extract","what":"<what>"}
{"intent":"translate","language":"<lang>"}
{"intent":"write","type":"email|message|post|other","about":"<desc>"}
{"intent":"scroll","direction":"up|down|top|bottom"}
{"intent":"copy","what":"url|title|text"}
{"intent":"fill","fields":"<fields or all>"}
{"intent":"compatibility"}
Use {"intent":"fill"} when the user wants to fill, autofill, complete, apply, or submit a form — e.g. "fill this form", "fill in the fields", "autofill", "complete the application", "apply for me", "help me fill this", "fill out the form", "submit my application".
{"intent":"daily_briefing"}
{"intent":"wiki_search","query":"<search term>"}
{"intent":"list_clips","query":"<optional search term>"}
{"intent":"save_clip"}
{"intent":"compare_jobs"}
{"intent":"export_jobs"}
{"intent":"save_job"}
{"intent":"list_jobs"}
{"intent":"keyword_match"}
{"intent":"profile_score"}
{"intent":"save_page"}
{"intent":"list_pages"}
{"intent":"scan_jobs"}
{"intent":"multi","intents":[<obj>,<obj>]}
{"intent":"chat"}

Use {"intent":"daily_briefing"} when user asks for daily briefing, today's summary, what's on my plate, morning briefing, show today's overview.
Use {"intent":"wiki_search","query":"<term>"} when user says find X, search my saves, search for X, what did I save about X, look up X in my stuff, search my notes, find that article about X.
Use {"intent":"compatibility"} ONLY when the user is asking about a SINGLE job — the one currently open — using words like "this job", "this role", "this position", "am I a good fit", "do I qualify for this". The page must be a single job posting, not a search results list.
Use {"intent":"scan_jobs"} when the user refers to multiple jobs or a list — "jobs" (plural without "this"), "these jobs", "jobs on this page", "all jobs", "check compatibility of jobs", "which jobs match me", "scan jobs", "rank these jobs", "show which jobs I can apply for", "check all jobs", "find best matching jobs". If the page looks like a job search results page (list of jobs), always prefer scan_jobs over compatibility.
Use {"intent":"compare_jobs"} when user says compare jobs, compare my applications, show job comparison, side by side jobs, compare saved jobs.
Use {"intent":"export_jobs"} when user says export jobs, download jobs, export tracker, save jobs to file, export my applications, download my tracker.
Use {"intent":"save_job"} when the user says save this job, bookmark this, add to tracker, remember this job.
Use {"intent":"list_jobs"} when the user says show saved jobs, my job list, tracked jobs, show my applications, job tracker.
Use {"intent":"keyword_match"} when user asks about keyword match, keywords in resume vs job, keyword gap, missing keywords, keyword analysis, how well resume matches, keyword comparison.
Use {"intent":"profile_score"} when user asks about their profile completeness, resume score, what's missing from their profile, or profile strength.
Use {"intent":"save_page"} when the user says save this page, bookmark this page, remember this link, save this link, add to reading list, save this article.
Use {"intent":"list_pages"} when the user says show saved pages, my saved links, my bookmarks, reading list, show my pages.
Use {"intent":"list_clips","query":"<term>"} when user asks to show clips, my saved clips, show my clippings, search clips, find clip about X. Include a query if they mention a topic.
Use {"intent":"save_clip"} when user says clip this, save this text, save selection, clip this paragraph.

JSON:`;
    }

    // ── Job tracker storage ───────────────────────────────────────────────────
    const JT_KEY      = 'nova_job_tracker';
    const JT_STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected'];
    const JT_LABELS   = {
        saved:     '🔖 Saved',
        applied:   '📤 Applied',
        interview: '🗣 Interview',
        offer:     '🎉 Offer',
        rejected:  '✗ Rejected',
    };

    function jtLoad() {
        try { return JSON.parse(localStorage.getItem(JT_KEY) || '[]'); } catch { return []; }
    }

    function jtSave(jobs) {
        try { localStorage.setItem(JT_KEY, JSON.stringify(jobs)); } catch {}
    }

    // ── Shared cross-origin storage via background ────────────────────────────
    // localStorage is per-origin so data saved on linkedin.com is invisible on
    // youtube.com. These helpers route through the background service worker which
    // uses chrome.storage.local — one shared namespace for all origins.

    function sharedGet(keys) {
        return new Promise(resolve => {
            try {
                chrome.runtime.sendMessage({ type: 'SHARED_STORAGE_GET', keys }, res => {
                    if (chrome.runtime.lastError) { resolve({}); return; }
                    resolve(res?.data || {});
                });
            } catch { resolve({}); }
        });
    }

    function sharedSet(data) {
        return new Promise(resolve => {
            try {
                chrome.runtime.sendMessage({ type: 'SHARED_STORAGE_SET', data }, () => resolve());
            } catch { resolve(); }
        });
    }

    function sharedRemove(keys) {
        return new Promise(resolve => {
            try {
                chrome.runtime.sendMessage({ type: 'SHARED_STORAGE_REMOVE', keys }, () => resolve());
            } catch { resolve(); }
        });
    }

    // ── Saved pages storage ───────────────────────────────────────────────────
    const SP_KEY = 'nova_saved_pages';

    async function spLoad() {
        const res = await sharedGet([SP_KEY]);
        return res[SP_KEY] || [];
    }

    async function spSave(pages) {
        await sharedSet({ [SP_KEY]: pages });
    }

    // ── Sticky notes storage ──────────────────────────────────────────────────
    const SN_SHARED_KEY = 'nova_sticky_notes';

    async function snSharedLoad() {
        const res = await sharedGet([SN_SHARED_KEY]);
        return res[SN_SHARED_KEY] || {};
    }

    async function snSharedSave(notes) {
        await sharedSet({ [SN_SHARED_KEY]: notes });
    }

    // ── Expose ────────────────────────────────────────────────────────────────
    window.NovaChatCore = {
        esc,
        fmt,
        DOMAIN_CHIPS,
        DEFAULT_CHIPS,
        getChipsForPage,
        KNOWN_URLS,
        resolveKnownUrl,
        buildSystemPrompt,
        buildClassifierPrompt,
        JT_KEY,
        JT_STATUSES,
        JT_LABELS,
        jtLoad,
        jtSave,
        SP_KEY,
        spLoad,
        spSave,
        SN_SHARED_KEY,
        snSharedLoad,
        snSharedSave,
        sharedGet,
        sharedSet,
        sharedRemove,
    };
})();
