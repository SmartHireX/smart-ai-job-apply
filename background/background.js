/**
 * Background Service Worker for Nova Apply Extension
 * 
 * Handles extension lifecycle events and can proxy AI requests if needed.
 */

// Import utility modules
importScripts('../shared/security/StorageVault.js', '../shared/security/EncryptionService.js', '../shared/utils/ai-client.js', '../shared/utils/resume-manager.js');


// console.log('Nova Apply background service worker started');

// Script injection order for lazy loading
const CONTENT_SCRIPTS = [
    // THE BRAIN (Visual Label Extraction) - MUST BE FIRST
    'autofill/services/extraction/form-detector.js',

    // Shared Utils & Security
    'shared/security/StorageVault.js',
    'shared/security/EncryptionService.js',
    'shared/utils/ai-client.js',
    'shared/utils/resume-manager.js',
    'shared/utils/form-extractor.js',
    'shared/utils/form-analyzer.js',
    'autofill/utils/field-utils.js',
    'autofill/utils/key-generator.js',

    // Base Classes & Infrastructure
    'autofill/handlers/handler.js',

    // Shared State
    'shared/state/state-manager.js',
    'shared/state/action-queue.js',

    // Inference Support
    'autofill/domains/inference/feature-extractor.js',
    'autofill/domains/inference/FieldTypes.js',
    'autofill/domains/inference/HeuristicEngine.js',
    'autofill/domains/inference/OptimizedMathKernel.js',
    'autofill/domains/inference/neural-classifier-v8.js',
    'autofill/domains/inference/HybridClassifier.js',
    'autofill/domains/inference/execution-engine.js',
    'autofill/domains/inference/CopilotClient.js',

    // Core Features
    'autofill/domains/memory/GlobalMemory.js',
    'autofill/features/undo-manager.js',
    'autofill/features/self-healing.js',
    'autofill/features/ai-field-regeneration.js',
    'autofill/features/form-observer.js',

    // Infrastructure
    'common/infrastructure/config.js',
    'common/infrastructure/lifecycle.js',

    // Remaining Logic & Services
    'autofill/services/extraction/section-detector.js',
    'autofill/services/extraction/sibling-cluster.js',
    'autofill/domains/heuristics/InteractionLog.js',
    'autofill/domains/heuristics/RuleEngine.js',
    'autofill/domains/profile/EntityStore.js',
    'autofill/services/indexing/field-indexing-service.js',
    'autofill/domains/model/FieldRoutingPatterns.js',

    // Enterprise Core (Phase 1-4)
    'autofill/core/ScanState.js',
    'autofill/core/FieldCandidates.js',
    'autofill/core/FillabilityPolicy.js',
    'autofill/core/ContextFeatureExtractor.js',
    'autofill/core/AutofillScanner.js',

    'autofill/core/PipelineOrchestrator.js',
    'autofill/domains/profile/CompositeFieldManager.js',
    'autofill/services/ai/AIBatchProcessor.js',
    'autofill/domains/inference/prefetch-engine.js',

    // UI
    // UI
    'autofill/ui/animations/form-visuals.js',
    'autofill/ui/sidebar/drag-resize.js',
    'autofill/ui/sidebar/widget-overlay.js',
    'autofill/ui/sidebar/sidebar-components.js',
    'autofill/ui/premium-inputs/premium-input-renderer.js',

    // Workflows & Handlers
    'autofill/workflows/classification-workflow.js',
    'autofill/workflows/instant-fill-workflow.js',
    'autofill/workflows/ai-fill-workflow.js',

    // Infrastructure (LOADED LATE)
    'common/infrastructure/config.js',
    'common/infrastructure/lifecycle.js',

    'autofill/core/form-processor.js',
    'autofill/domains/profile/SectionController.js',
    'autofill/handlers/autofill-message-handler.js',
    'autofill/handlers/undo-handler.js',
    'common/messaging/message-router.js',
    'autofill/core/autofill-orchestrator.js'
];

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

    // Inject scripts for lazy loading
    if (message.type === 'INJECT_SCRIPTS') {
        (async () => {
            try {
                // Get tab ID from sender (message comes from content script)
                const tabId = sender.tab?.id;
                if (!tabId) {
                    throw new Error('No tab ID available');
                }

                // console.log(`📦 Injecting ${CONTENT_SCRIPTS.length} scripts into tab ${tabId}...`);

                // Reset AI state (clear old cooldowns from bad attempts)
                if (typeof resetAIState === 'function') await resetAIState().catch(() => { });

                // Inject scripts sequentially to maintain dependencies
                for (const file of CONTENT_SCRIPTS) {
                    await chrome.scripting.executeScript({
                        target: {
                            tabId: tabId,
                            frameIds: [sender.frameId] // Target only the requesting frame
                        },
                        files: [file]
                    });
                }

                // console.log('✅ All scripts injected successfully');
                sendResponse({ success: true, count: CONTENT_SCRIPTS.length });

            } catch (error) {
                console.error('❌ Script injection failed:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true; // Keep channel open for async response
    }

    // AI Request Proxy (for cases where content script can't make direct calls)
    if (message.type === 'AI_REQUEST') {
        (async () => {
            try {
                const result = await self.AIClient.callAI(
                    message.prompt,
                    message.systemInstruction || '',
                    message.options || {}
                );
                sendResponse(result);
            } catch (error) {
                console.error('AI request error:', error);
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true; // Keep message channel open for async response
    }

    // Check setup status
    if (message.type === 'CHECK_SETUP') {
        (async () => {
            try {
                const status = await self.AIClient.checkSetupStatus();
                sendResponse(status);
            } catch (error) {
                sendResponse({ ready: false, hasApiKey: false, hasResume: false });
            }
        })();
        return true;
    }

    // Get resume data
    if (message.type === 'GET_RESUME') {
        (async () => {
            try {
                const data = await self.ResumeManager.getResumeData();
                sendResponse({ success: true, data });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    // Get flattened resume data
    if (message.type === 'GET_FLAT_RESUME') {
        (async () => {
            try {
                const data = await self.ResumeManager.getFlattenedResumeData();
                sendResponse({ success: true, data });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    // Get resume as text
    if (message.type === 'GET_RESUME_TEXT') {
        (async () => {
            try {
                const text = await self.ResumeManager.getResumeAsText();
                sendResponse({ success: true, text });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    if (message.type === 'SAVE_RESUME_DATA') {
        (async () => {
            try {
                await self.ResumeManager.saveResumeData(message.data);
                sendResponse({ success: true });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }

    if (message.type === 'SCRAPE_LINKEDIN_PROFILE') {
        const url = message.url;
        if (!url) { sendResponse({ success: false, error: 'No URL provided' }); return false; }

        (async () => {
            let tabId = null;
            let keepAlive = null;
            try {
                // Open active so LinkedIn SPA fully renders, then immediately switch
                // focus back to the options tab so user sees the scan panel
                const optionsTabId = sender.tab?.id;
                const tab = await chrome.tabs.create({ url, active: true });
                tabId = tab.id;
                // Switch back to options page right away
                if (optionsTabId) chrome.tabs.update(optionsTabId, { active: true }).catch(() => {});

                // Keep SW alive while waiting
                keepAlive = setInterval(() => chrome.storage.local.get('_nw_sw_ping'), 2000);

                // Wait for page load
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(fn); reject(new Error('Page load timeout')); }, 25000);
                    function fn(id, info) {
                        if (id !== tabId || info.status !== 'complete') return;
                        chrome.tabs.onUpdated.removeListener(fn);
                        clearTimeout(timer);
                        resolve();
                    }
                    chrome.tabs.onUpdated.addListener(fn);
                });

                // Inject scroll script — scrolls full page so LinkedIn lazy-loads all sections,
                // then waits for key sections to appear, then scrapes everything
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: () => new Promise(async (resolve) => {
                        function clean(t) { return (t || '').replace(/\s+/g, ' ').trim(); }

                        // Helper: find section containing an anchor id
                        function getSection(id) {
                            const anchor = document.getElementById(id);
                            if (!anchor) return null;
                            let el = anchor;
                            // Walk up to the nearest section element
                            while (el && el.tagName !== 'SECTION') el = el.parentElement;
                            return el || null;
                        }

                        // Helper: get visible spans in element (aria-hidden ones carry the readable text)
                        function visibleSpans(container) {
                            return [...container.querySelectorAll('span[aria-hidden="true"]')]
                                .map(e => clean(e.innerText)).filter(Boolean);
                        }

                        // Step 1: Scroll through the full page to trigger lazy-load
                        const scrollTo = (y) => new Promise(r => { window.scrollTo(0, y); setTimeout(r, 600); });
                        const h = () => document.body.scrollHeight;
                        await scrollTo(h() * 0.2);
                        await scrollTo(h() * 0.4);
                        await scrollTo(h() * 0.6);
                        await scrollTo(h() * 0.8);
                        await scrollTo(h());
                        await new Promise(r => setTimeout(r, 1000)); // final settle
                        await scrollTo(0); // back to top so top-card is visible

                        // Step 2: Wait until h1 (name) is present — up to 10s
                        await new Promise(r => {
                            let t = 0;
                            const iv = setInterval(() => {
                                t += 500;
                                if (document.querySelector('h1')?.innerText?.trim() || t >= 10000) { clearInterval(iv); r(); }
                            }, 500);
                        });

                        // Step 3: Scrape
                        const linkedinUrl = window.location.href.replace(/\?.*$/, '');

                        // ── Name ──────────────────────────────────────────────────────────
                        let firstName = '', lastName = '';
                        const h1El = document.querySelector('h1');
                        const h1Text = clean(h1El?.innerText || '');
                        if (h1Text) {
                            const p = h1Text.split(/\s+/).filter(Boolean);
                            firstName = p[0] || ''; lastName = p.slice(1).join(' ');
                        } else {
                            const m = document.title.match(/^(.+?)\s*[|–\-]/);
                            if (m) { const p = m[1].trim().split(/\s+/); firstName = p[0]; lastName = p.slice(1).join(' '); }
                        }

                        // ── Headline ──────────────────────────────────────────────────────
                        // LinkedIn puts headline in the div immediately after h1
                        let headline = '';
                        if (h1El) {
                            let next = h1El.nextElementSibling;
                            while (next) {
                                const t = clean(next.innerText || '');
                                if (t.length > 5 && t.length < 200) { headline = t; break; }
                                next = next.nextElementSibling;
                            }
                            // Fallback: look in parent
                            if (!headline) {
                                const parent = h1El.parentElement;
                                if (parent) {
                                    for (const child of parent.children) {
                                        if (child === h1El) continue;
                                        const t = clean(child.innerText || '');
                                        if (t.length > 5 && t.length < 200) { headline = t; break; }
                                    }
                                }
                            }
                        }

                        // ── Location ──────────────────────────────────────────────────────
                        // LinkedIn location is a small span near the top card
                        let location = '';
                        const locCandidates = [
                            document.querySelector('.text-body-small.inline.t-black--light.break-words'),
                            document.querySelector('[data-field="location_text"]'),
                            ...[...document.querySelectorAll('span.text-body-small')].filter(el => {
                                const t = clean(el.innerText || '');
                                return t.length > 3 && t.length < 80 && !/^\d/.test(t);
                            })
                        ].filter(Boolean);
                        for (const el of locCandidates) {
                            const t = clean(el.innerText || '');
                            if (t.length > 3 && t.length < 80) { location = t; break; }
                        }

                        // ── About / Summary ───────────────────────────────────────────────
                        let summary = '';
                        const aboutSec = getSection('about');
                        if (aboutSec) {
                            const clone = aboutSec.cloneNode(true);
                            clone.querySelectorAll('h2,h3,button,svg,.visually-hidden').forEach(e => e.remove());
                            summary = clean(clone.innerText || '').replace(/^about\s*/i, '').slice(0, 2000);
                        }

                        // ── Experience ────────────────────────────────────────────────────
                        const experience = [];
                        const expSec = getSection('experience');
                        if (expSec) {
                            const items = [...expSec.querySelectorAll('li')].slice(0, 15);
                            items.forEach(item => {
                                const spans = visibleSpans(item);
                                // spans[0]=title, [1]=company, [2]=duration/dates, rest=description
                                if (spans[0] && spans[0].length > 1 && spans[0].length < 100) {
                                    experience.push({
                                        id: Math.random().toString(36).slice(2, 9),
                                        title:       spans[0],
                                        company:     spans[1] || '',
                                        period:      spans[2] || '',
                                        description: spans.slice(3).join(' ').slice(0, 400),
                                        current:     /present/i.test(spans[2] || '')
                                    });
                                }
                            });
                        }

                        // ── Education ─────────────────────────────────────────────────────
                        const education = [];
                        const eduSec = getSection('education');
                        if (eduSec) {
                            const items = [...eduSec.querySelectorAll('li')].slice(0, 8);
                            items.forEach(item => {
                                const spans = visibleSpans(item);
                                if (spans[0] && spans[0].length > 1) {
                                    education.push({
                                        id:        Math.random().toString(36).slice(2, 9),
                                        school:    spans[0],
                                        degree:    spans[1] || '',
                                        major:     spans[2] || '',
                                        startDate: '',
                                        endDate:   spans.find(s => /\d{4}/.test(s)) || '',
                                        gpa:       ''
                                    });
                                }
                            });
                        }

                        // ── Skills ────────────────────────────────────────────────────────
                        let skills = [];
                        const skillsSec = getSection('skills');
                        if (skillsSec) {
                            skills = visibleSpans(skillsSec)
                                .filter(s => s.length > 1 && s.length < 60)
                                .slice(0, 40);
                        }

                        // ── Certifications ────────────────────────────────────────────────
                        let certifications = [];
                        const certSec = getSection('licenses_and_certifications') || getSection('certifications');
                        if (certSec) {
                            certifications = visibleSpans(certSec)
                                .filter(s => s.length > 2 && s.length < 100)
                                .slice(0, 10);
                        }

                        const debug = !firstName ? {
                            title: document.title, h1Text,
                            bodySnippet: clean(document.body.innerText).slice(0, 400)
                        } : null;

                        resolve({
                            personal: { firstName, lastName, location, linkedin: linkedinUrl },
                            headline,
                            summary,
                            experience,
                            education,
                            skills: { technical: skills, soft: [], languages: [], certifications },
                            debug
                        });
                    })
                });

                const scraped = result?.result;
                if (!scraped || scraped._error) throw new Error(scraped?._error || 'Could not scrape profile');
                sendResponse({ success: true, data: scraped });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            } finally {
                clearInterval(keepAlive);
                if (tabId) chrome.tabs.remove(tabId).catch(() => {});
            }
        })();

        return true;
    }

    // Re-inject chat widget after navigation (called by bootstrap on pages with Trusted Types CSP)
    if (message.type === 'INJECT_CHAT_WIDGET') {
        (async () => {
            try {
                const tabId = sender.tab?.id;
                if (!tabId) return;
                // Skip if already present
                const [result] = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: () => !!document.getElementById('nova-chat-widget')
                });
                if (result?.result) return;
                await chrome.scripting.executeScript({ target: { tabId }, files: ['shared/utils/nova-chat-core.js'] });
                await chrome.scripting.executeScript({ target: { tabId }, files: ['autofill/ui/chat/chat-widget.js'] });
            } catch (e) {}
        })();
        return false;
    }

    // Open a popup window for the job URL (user sees it load), scrape it, close it,
    // return the text directly. Widget stays alive on the search page the whole time.
    if (message.type === 'SCRAPE_JOB_POPUP') {
        const url = message.url;
        if (!url) { sendResponse({ text: '', error: 'no url' }); return false; }

        (async () => {
            let popupTabId = null;
            try {
                // Hidden background tab — visual is handled by the iframe in the widget
                const tab = await chrome.tabs.create({ url, active: false });
                popupTabId = tab.id;

                if (!popupTabId) throw new Error('no tab created');

                // Wait for the page to finish loading
                await new Promise((resolve, reject) => {
                    const timer = setTimeout(() => {
                        chrome.tabs.onUpdated.removeListener(fn);
                        reject(new Error('timeout'));
                    }, 15000);
                    function fn(tabId, info) {
                        if (tabId !== popupTabId || info.status !== 'complete') return;
                        chrome.tabs.onUpdated.removeListener(fn);
                        clearTimeout(timer);
                        resolve();
                    }
                    chrome.tabs.onUpdated.addListener(fn);
                });

                // Wait up to 8s for JS-rendered content (React/Vue SPAs).
                // Pulse chrome.storage every 2s to keep the MV3 service worker alive —
                // without this, the SW can suspend mid-wait and kill the pending sendResponse.
                await new Promise(r => {
                    let elapsed = 0;
                    const tick = setInterval(() => {
                        elapsed += 2000;
                        chrome.storage.local.get('_nw_sw_ping'); // no-op read keeps SW alive
                        if (elapsed >= 8000) { clearInterval(tick); r(); }
                    }, 2000);
                });

                // Smart scrape: JSON-LD → platform selectors → body fallback
                const [r] = await chrome.scripting.executeScript({
                    target: { tabId: popupTabId },
                    func: () => {
                        function clean(t) { return (t || '').replace(/\s+/g, ' ').trim(); }

                        // TIER 1: JSON-LD structured data
                        for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
                            try {
                                const d  = JSON.parse(s.textContent);
                                const jd = d['@type'] === 'JobPosting' ? d : d.jobPosting;
                                if (jd?.title) {
                                    return clean([
                                        `Title: ${jd.title}`,
                                        `Company: ${jd.hiringOrganization?.name || ''}`,
                                        `Location: ${jd.jobLocation?.address?.addressLocality || ''}`,
                                        `Description: ${clean(jd.description || '').slice(0, 4000)}`
                                    ].join('\n'));
                                }
                            } catch {}
                        }

                        // TIER 2: Platform-specific selectors
                        const h = location.hostname;
                        let titleSel, companySel, descSel;
                        if (h.includes('greenhouse') || h.includes('boards')) {
                            titleSel = '.app-title, h1.app-title'; companySel = '.company-name'; descSel = '#content .section-wrapper';
                        } else if (h.includes('lever')) {
                            titleSel = '.posting-headline h2'; companySel = '.main-header-text-logo'; descSel = '.section-wrapper';
                        } else if (h.includes('myworkday') || h.includes('workday')) {
                            titleSel = 'h2[data-automation-id="jobPostingHeader"], h3.css-12b42k6';
                            companySel = '[data-automation-id="company"]'; descSel = '[data-automation-id="jobPostingDescription"]';
                        } else if (h.includes('linkedin')) {
                            titleSel = 'h1.top-card-layout__title, h1.t-24';
                            companySel = 'a.topcard__org-name-link, .top-card-layout__second-subline';
                            descSel = '.description__text, .show-more-less-html__markup';
                        } else if (h.includes('indeed')) {
                            titleSel = 'h1.jobsearch-JobInfoHeader-title, h1[data-testid="jobsearch-JobInfoHeader-title"]';
                            companySel = '[data-testid="inlineHeader-companyName"]'; descSel = '#jobDescriptionText';
                        }
                        const descEl = descSel && document.querySelector(descSel);
                        if (descEl) {
                            return clean([
                                `Title: ${clean(document.querySelector(titleSel)?.innerText || document.title)}`,
                                `Company: ${clean(document.querySelector(companySel)?.innerText || '')}`,
                                `Description: ${clean(descEl.innerText).slice(0, 4000)}`
                            ].join('\n'));
                        }

                        // TIER 3: Body fallback
                        const clone = document.body.cloneNode(true);
                        clone.querySelectorAll('script,style,nav,footer,header,[role="banner"],[role="navigation"]').forEach(e => e.remove());
                        return clean(clone.innerText || '').slice(0, 5000);
                    }
                });

                sendResponse({ text: r?.result || '' });
            } catch (e) {
                sendResponse({ text: '', error: e.message });
            } finally {
                if (popupTabId) chrome.tabs.remove(popupTabId).catch(() => {});
            }
        })();

        return true; // keep message channel open for async sendResponse
    }

    if (message.type === 'GET_GROQ_CONFIG') {
        (async () => {
            try {
                const cfg = await self.AIClient.getGroqConfig?.();
                sendResponse(cfg ? { key: cfg.key, model: cfg.model } : null);
            } catch {
                sendResponse(null);
            }
        })();
        return true;
    }

    if (message.type === 'SET_REMINDER') {
        const { jobId, jobTitle, delayMinutes } = message;
        const alarmName = `nova_reminder_${jobId}`;
        chrome.alarms.create(alarmName, { delayInMinutes: delayMinutes });
        // Store alarm metadata
        chrome.storage.local.get(['nova_reminders'], r => {
            const reminders = r.nova_reminders || {};
            reminders[alarmName] = { jobTitle, jobId, ts: Date.now() };
            chrome.storage.local.set({ nova_reminders: reminders });
        });
        sendResponse({ success: true });
        return false;
    }

    if (message.type === 'OPEN_OPTIONS') {
        chrome.runtime.openOptionsPage();
        return false;
    }

    // Tab palette: return all open tabs + recent history
    if (message.type === 'GET_TABS_AND_HISTORY') {
        (async () => {
            try {
                const tabs = await chrome.tabs.query({});
                const history = await chrome.history.search({ text: '', maxResults: 30, startTime: Date.now() - 7 * 86400000 });
                // Exclude URLs already open as tabs
                const openUrls = new Set(tabs.map(t => t.url));
                const filteredHistory = history.filter(h => !openUrls.has(h.url));
                sendResponse({ tabs, history: filteredHistory });
            } catch (e) {
                sendResponse({ tabs: [], history: [] });
            }
        })();
        return true;
    }

    // Tab palette: switch to a specific tab
    if (message.type === 'SWITCH_TAB') {
        (async () => {
            try {
                await chrome.tabs.update(message.tabId, { active: true });
                await chrome.windows.update(message.windowId, { focused: true });
                sendResponse({ success: true });
            } catch (e) {
                sendResponse({ success: false });
            }
        })();
        return true;
    }

    // Enable/disable YouTube network-level ad blocking via declarativeNetRequest
    if (message.type === 'TOGGLE_YT_ADBLOCK') {
        (async () => {
            try {
                if (message.enable) {
                    await chrome.declarativeNetRequest.updateEnabledRulesets({
                        enableRulesetIds: ['yt_adblock'],
                        disableRulesetIds: []
                    });
                } else {
                    await chrome.declarativeNetRequest.updateEnabledRulesets({
                        enableRulesetIds: [],
                        disableRulesetIds: ['yt_adblock']
                    });
                }
                sendResponse({ success: true });
            } catch (e) {
                sendResponse({ success: false, error: e.message });
            }
        })();
        return true;
    }

    // Shared cross-origin storage (saved pages, sticky notes, clipboard)
    if (message.type === 'SHARED_STORAGE_GET') {
        chrome.storage.local.get(message.keys, result => {
            sendResponse({ data: result });
        });
        return true;
    }

    if (message.type === 'SHARED_STORAGE_SET') {
        chrome.storage.local.set(message.data, () => {
            sendResponse({ success: true });
        });
        return true;
    }

    if (message.type === 'SHARED_STORAGE_REMOVE') {
        chrome.storage.local.remove(message.keys, () => {
            sendResponse({ success: true });
        });
        return true;
    }

    // Navigate the active tab to a URL (proper MV3 pattern — avoids CSP issues)
    if (message.type === 'NAVIGATE') {
        (async () => {
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab) await chrome.tabs.update(tab.id, { url: message.url });
                sendResponse({ success: true });
            } catch (error) {
                sendResponse({ success: false, error: error.message });
            }
        })();
        return true;
    }
});


// ── Context menu: "Ask Nova about this" on selected text ──────────────────────
function createContextMenu() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: 'nova-ask-selection',
            title: 'Ask Nova: "%s"',
            contexts: ['selection']
        });
    });
}

chrome.runtime.onInstalled.addListener((details) => {
    createContextMenu();
    if (details.reason === 'install') {
        chrome.runtime.openOptionsPage();
    }
});

// Recreate on service worker startup (context menus don't persist across restarts)
chrome.runtime.onStartup.addListener(createContextMenu);

chrome.alarms.onAlarm.addListener(alarm => {
    if (!alarm.name.startsWith('nova_reminder_')) return;
    chrome.storage.local.get(['nova_reminders'], r => {
        const reminder = r.nova_reminders?.[alarm.name];
        const title = reminder?.jobTitle || 'a job';
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Nova Apply — Follow-up Reminder',
            message: `Time to follow up on "${title}". Open Nova to update your tracker.`,
            priority: 1
        });
        // Clean up reminder
        const reminders = r.nova_reminders || {};
        delete reminders[alarm.name];
        chrome.storage.local.set({ nova_reminders: reminders });
    });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'nova-ask-selection') return;
    if (!tab?.id || !info.selectionText) return;

    const selected = info.selectionText.trim().slice(0, 1000);

    try {
        // Inject core first, then widget
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['shared/utils/nova-chat-core.js']
        });
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['autofill/ui/chat/chat-widget.js']
        });

        // Small delay to let the widget initialise, then send the selection
        setTimeout(() => {
            chrome.tabs.sendMessage(tab.id, {
                type: 'NOVA_SELECTION',
                text: selected
            });
        }, 300);
    } catch (e) {
        console.error('Nova context menu error:', e);
    }
});


// Listen for tab updates (for future page-specific behavior)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url) {
        // Could inject setup prompts for job sites here
        // console.log('Page loaded:', tab.url);
    }
});

// Extension icon click — inject widget if needed, then toggle open
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab?.id) return;
    try {
        // Check if widget is already in the page
        const [result] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => !!document.getElementById('nova-chat-widget')
        });

        if (!result?.result) {
            // First time on this page — inject
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['shared/utils/nova-chat-core.js'] });
            await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['autofill/ui/chat/chat-widget.js'] });
            // Widget auto-opens on inject, nothing more to do
        } else {
            // Already injected — toggle visibility
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const w = document.getElementById('nova-chat-widget');
                    if (!w) return;
                    const hidden = w.style.display === 'none' || w.dataset.minimized === 'true';
                    if (hidden) {
                        w.style.display = '';
                        w.dataset.minimized = 'false';
                        // Restore bubble if present
                        const bubble = document.getElementById('nova-mini-bubble');
                        if (bubble) bubble.style.display = 'none';
                    } else {
                        w.style.display = 'none';
                        w.dataset.minimized = 'true';
                    }
                }
            });
        }
    } catch (e) {
        console.error('Nova icon click error:', e);
    }
});
