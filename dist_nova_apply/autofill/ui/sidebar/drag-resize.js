/**
 * drag-resize.js
 * Handles the interactivity (dragging and resizing) for UI panels.
 */

/**
 * Setup dragging and resizing for the sidebar
 */
function setupSidebarInteractivity(panel) {
    const header = panel.querySelector('.sh-nova-9x-sidebar-header');
    const handles = panel.querySelectorAll('.sh-nova-9x-resize-handle');

    let isDragging = false;
    let isResizing = false;
    let currentHandle = null;
    let startX, startY, startWidth, startHeight, startLeft, startTop;
    let aspectRatio = 1;

    // Load saved state
    chrome.storage.local.get(['sidebarPos', 'sidebarSize'], (data) => {
        if (data.sidebarPos) {
            panel.style.bottom = 'auto';
            panel.style.left = data.sidebarPos.left + 'px';
            panel.style.top = data.sidebarPos.top + 'px';
        }
        if (data.sidebarSize) {
            panel.style.width = data.sidebarSize.width + 'px';
            if (data.sidebarSize.height) {
                panel.style.height = data.sidebarSize.height + 'px';
            }
        }
    });

    // DRAG LOGIC
    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.sh-nova-9x-header-actions') || e.target.closest('.sh-nova-9x-close-btn-x')) return;

        isDragging = true;
        startX = e.clientX - panel.offsetLeft;
        startY = e.clientY - panel.offsetTop;

        panel.style.transition = 'none';
        panel.style.bottom = 'auto'; // Switch to top/left positioning

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        e.preventDefault();
    });

    // RESIZE LOGIC
    handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            currentHandle = handle.classList[1];
            startX = e.clientX;
            startY = e.clientY;
            startWidth = panel.offsetWidth;
            startHeight = panel.offsetHeight;
            startLeft = panel.offsetLeft;
            startTop = panel.offsetTop;
            aspectRatio = startWidth / startHeight;

            panel.style.transition = 'none';
            panel.style.bottom = 'auto';

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            e.preventDefault();
            e.stopPropagation();
        });
    });

    function handleMouseMove(e) {
        if (isDragging) {
            let newX = e.clientX - startX;
            let newY = e.clientY - startY;

            // Constraints
            newX = Math.max(0, Math.min(newX, window.innerWidth - panel.offsetWidth));
            newY = Math.max(0, Math.min(newY, window.innerHeight - panel.offsetHeight));

            panel.style.left = newX + 'px';
            panel.style.top = newY + 'px';
        }
        else if (isResizing) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;

            const isProportional = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(currentHandle);

            // Calculate new dimensions based on handle
            if (currentHandle.includes('right')) {
                newWidth = startWidth + dx;
            } else if (currentHandle.includes('left')) {
                newWidth = startWidth - dx;
                newLeft = startLeft + dx;
            }

            if (currentHandle.includes('bottom')) {
                newHeight = startHeight + dy;
            } else if (currentHandle.includes('top')) {
                newHeight = startHeight - dy;
                newTop = startTop + dy;
            }

            // Apply Proportional Scaling if corner handle
            if (isProportional) {
                // Determine which dimension changed more and scale relatively
                if (Math.abs(dx) > Math.abs(dy)) {
                    newHeight = newWidth / aspectRatio;
                    if (currentHandle.includes('top')) {
                        newTop = startTop + (startHeight - newHeight);
                    }
                } else {
                    newWidth = newHeight * aspectRatio;
                    if (currentHandle.includes('left')) {
                        newLeft = startLeft + (startWidth - newWidth);
                    }
                }
            }

            // Constraints
            if (newWidth > 280 && newWidth < window.innerWidth * 0.8) {
                panel.style.width = newWidth + 'px';
                panel.style.left = newLeft + 'px';
            }
            if (newHeight > 150 && newHeight < window.innerHeight * 0.9) {
                panel.style.height = newHeight + 'px';
                panel.style.top = newTop + 'px';
            }
        }
    }

    function handleMouseUp() {
        if (isDragging || isResizing) {
            isDragging = false;
            isResizing = false;
            panel.style.transition = '';

            // Save state
            chrome.storage.local.set({
                sidebarPos: { left: panel.offsetLeft, top: panel.offsetTop },
                sidebarSize: { width: panel.offsetWidth, height: panel.offsetHeight }
            });
        }

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }
}
