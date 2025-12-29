// Add this to the end of popup.js

/**
 * Show premium error modal for AI quota exceeded
 */
function showQuotaErrorModal(message) {
    // Hide progress
    hideProgress();

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        padding: 20px;
    `;

    overlay.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 32px;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        ">
            <div style="
                width: 64px;
                height: 64px;
                background: linear-gradient(135deg, #f59e0b, #ef4444);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 20px;
                font-size: 32px;
            ">⚠️</div>
            
            <h2 style="
                font-size: 20px;
                font-weight: 700;
                color: #1e293b;
                margin: 0 0 12px;
            ">AI Quota Exceeded</h2>
            
            <p style="
                font-size: 14px;
                color: #64748b;
                line-height: 1.6;
                margin: 0 0 24px;
            ">${message || 'You\'ve exceeded your AI quota. Please try again in a few minutes.'}</p>
            
            <div style="
                display: flex;
                gap: 12px;
                justify-content: center;
            ">
                <button onclick="this.closest('div').parentElement.remove()" style="
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: transform 0.2s;
                " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
                    Got It
                </button>
                
                <a href="https://ai.google.dev/" target="_blank" style="
                    background: #f1f5f9;
                    color: #475569;
                    border: none;
                    padding: 12px 24px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    text-decoration: none;
                    display: inline-block;
                    transition: background 0.2s;
                " onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">
                    Learn More
                </a>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (overlay.parentNode) {
            overlay.remove();
        }
    }, 10000);
}
