// ============ FIELD REGENERATION WITH AI ============

/**
 * Show modal for custom regeneration instructions
 */
async function showRegenerateModal(selector, label) {
    // Remove existing  modal
    const existing = document.getElementById('smarthirex-regenerate-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'smarthirex-regenerate-modal';
    modal.innerHTML = `
        <div class="modal-overlay"></div>
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                    </svg>
                    <span>Regenerate Field</span>
                </div>
                <button class="modal-close-btn" id="regen-close">×</button>
            </div>
            <div class="modal-body">
                <div class="field-preview">
                    <label>Field:</label>
                    <div class="field-name">${label}</div>
                </div>
                <div class="instruction-input">
                    <label for="regen-instruction">Custom Instructions (Optional)</label>
                    <textarea 
                        id="regen-instruction" 
                        placeholder="e.g., 'Make it more professional' or 'Focus on teamwork skills'"
                        rows="3"
                    ></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" id="regen-cancel">Cancel</button>
                <button class="btn-primary" id="regen-submit">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
                    </svg>
                    Regenerate
                </button>
            </div>
        </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        #smarthirex-regenerate-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 999999;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        #smarthirex-regenerate-modal .modal-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
        }

        #smarthirex-regenerate-modal .modal-content {
            position: relative;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            width: 90%;
            max-width: 500px;
            animation: modalSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes modalSlideIn {
            from {
                opacity: 0;
                transform: translateY(-20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        #smarthirex-regenerate-modal .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px 24px;
            border-bottom: 1px solid #e5e7eb;
        }

        #smarthirex-regenerate-modal .modal-title {
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 18px;
            font-weight: 600;
            color: #111827;
        }

        #smarthirex-regenerate-modal .modal-title svg {
            color: #8b5cf6;
        }

        #smarthirex-regenerate-modal .modal-close-btn {
            width: 32px;
            height: 32px;
            border-radius: 6px;
            border: none;
            background: #f3f4f6;
            color: #6b7280;
            font-size: 24px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        #smarthirex-regenerate-modal .modal-close-btn:hover {
            background: #e5e7eb;
            color: #111827;
        }

        #smarthirex-regenerate-modal .modal-body {
            padding: 24px;
        }

        #smarthirex-regenerate-modal .field-preview {
            margin-bottom: 20px;
            padding: 12px;
            background: #f9fafb;
            border-radius: 8px;
            border-left: 3px solid #8b5cf6;
        }

        #smarthirex-regenerate-modal .field-preview label {
            display: block;
            font-size: 12px;
            font-weight: 600;
            color: #6b7280;
            margin-bottom: 4px;
        }

        #smarthirex-regenerate-modal .field-name {
            font-size: 14px;
            font-weight: 500;
            color: #111827;
        }

        #smarthirex-regenerate-modal .instruction-input label {
            display: block;
            font-size: 14px;
            font-weight: 600;
            color: #111827;
            margin-bottom: 8px;
        }

        #smarthirex-regenerate-modal textarea {
            width: 100%;
            padding: 12px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-family: inherit;
            font-size: 14px;
            resize: vertical;
            transition: all 0.2s;
        }

        #smarthirex-regenerate-modal textarea:focus {
            outline: none;
            border-color: #8b5cf6;
            box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
        }

        #smarthirex-regenerate-modal .modal-footer {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            padding: 16px 24px;
            border-top: 1px solid #e5e7eb;
            background: #f9fafb;
            border-bottom-left-radius: 12px;
            border-bottom-right-radius: 12px;
        }

        #smarthirex-regenerate-modal .btn-secondary,
        #smarthirex-regenerate-modal .btn-primary {
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        #smarthirex-regenerate-modal .btn-secondary {
            background: white;
            color: #6b7280;
            border: 2px solid #e5e7eb;
        }

        #smarthirex-regenerate-modal .btn-secondary:hover {
            background: #f9fafb;
            border-color: #d1d5db;
        }

        #smarthirex-regenerate-modal .btn-primary {
            background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
            color: white;
            box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
        }

        #smarthirex-regenerate-modal .btn-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
        }

        #smarthirex-regenerate-modal .btn-primary:active {
            transform: translateY(0);
        }
    `;

    modal.appendChild(style);
    document.body.appendChild(modal);

    // Event handlers
    const close = () => modal.remove();

    modal.querySelector('#regen-close').addEventListener('click', close);
    modal.querySelector('#regen-cancel').addEventListener('click', close);
    modal.querySelector('.modal-overlay').addEventListener('click', close);

    modal.querySelector('#regen-submit').addEventListener('click', async () => {
        const instruction = modal.querySelector('#regen-instruction').value.trim();
        close();
        await regenerateFieldWithAI(selector, label, instruction);
    });
}

/**
 * Regenerate field value using AI
 */
async function regenerateFieldWithAI(selector, label, customInstruction = '') {
    const element = document.querySelector(selector);
    if (!element) {
        showErrorToast('Field not found');
        return;
    }

    showProcessingWidget('AI Generating...', 1);

    try {
        // Get job context
        const jobContext = getJobContext ? getJobContext() : 'No context available';

        // Build prompt
        let prompt = `You are filling a job application form field.

Field Label: "${label}"
Job Context: ${jobContext.substring(0, 500)}

Generate an appropriate, professional answer for this field.`;

        if (customInstruction) {
            prompt += `\n\nCustom Instructions: ${customInstruction}`;
        }

        prompt += `\n\nProvide ONLY the answer text, nothing else. Keep it concise and professional.`;

        // Call AI
        const result = await window.AIClient.callAI(prompt, '', {
            maxTokens: 500,
            temperature: 0.7
        });

        if (!result || !result.success || !result.text) {
            throw new Error(result?.error || 'AI generation failed');
        }

        const newValue = result.text.trim();

        // Update field
        setNativeValue(element, newValue);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        // Update Smart Memory
        const key = normalizeSmartMemoryKey(label);
        updateSmartMemoryCache({
            [key]: {
                answer: newValue,
                timestamp: Date.now()
            }
        });

        // Visual feedback
        element.classList.add('smarthirex-typing');
        setTimeout(() => element.classList.remove('smarthirex-typing'), 1000);

        showSuccessToast('Field regenerated! 🎉');
        hideProcessingWidget();

    } catch (error) {
        console.error('Regeneration error:', error);
        showErrorToast(`Regeneration failed: ${error.message}`);
        hideProcessingWidget();
    }
}
