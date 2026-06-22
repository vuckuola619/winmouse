// Molten Cursor Frontend State Controller

document.addEventListener("DOMContentLoaded", () => {
    // State Variables
    let originalImage = null;       // Image object of uploaded/generated picture
    let processedCanvas = null;     // Canvas containing chroma-key transparency
    let hotspotX = 0;               // X coordinate on output size (e.g. 0-31)
    let hotspotY = 0;               // Y coordinate on output size (e.g. 0-31)
    let currentSize = 32;           // Output size (32, 48, 64, 128)
    let activeCursorType = "normal"; // Target Windows cursor registry key
    let chromaColor = null;         // {r, g, b} color selected to make transparent
    let isPickingColor = false;     // True when color picker tool is active
    let hfToken = "";

    // DOM Elements
    const hfTokenInput = document.getElementById("hf-token-input");
    const saveTokenBtn = document.getElementById("save-token-btn");
    const cursorTypeBtns = document.querySelectorAll(".cursor-type-btn");
    const btnRestoreCurrent = document.getElementById("btn-restore-current");
    const btnRestoreAll = document.getElementById("btn-restore-all");
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");
    const aiPrompt = document.getElementById("ai-prompt");
    const btnGenerateAi = document.getElementById("btn-generate-ai");
    const aiLoading = document.getElementById("ai-loading");
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("file-input");
    const testerBox = document.getElementById("tester-box");
    const hotspotBadge = document.getElementById("hotspot-badge");
    const presetBtns = document.querySelectorAll(".preset-btn[data-size]");
    const btnColorPicker = document.getElementById("btn-color-picker");
    const colorDisplay = document.getElementById("color-display");
    const chromaTolerance = document.getElementById("chroma-tolerance");
    const toleranceVal = document.getElementById("tolerance-val");
    const btnClearChroma = document.getElementById("btn-clear-chroma");
    const hotspotTl = document.getElementById("hotspot-tl");
    const hotspotCenter = document.getElementById("hotspot-center");
    const btnApplySystem = document.getElementById("btn-apply-system");
    const editorCanvas = document.getElementById("editor-canvas");
    const ctx = editorCanvas.getContext("2d");

    // Modal elements
    const configModal = document.getElementById("config-modal");
    const modalTokenInput = document.getElementById("modal-token-input");
    const modalSaveBtn = document.getElementById("modal-save-btn");
    const modalSkipBtn = document.getElementById("modal-skip-btn");

    // Initialize Toast
    const toast = document.getElementById("toast");
    const toastIcon = document.getElementById("toast-icon");
    const toastMessage = document.getElementById("toast-message");

    function showToast(message, type = "info") {
        toast.className = `toast ${type}`;
        toastMessage.textContent = message;
        
        // Icon matching
        if (type === "success") {
            toastIcon.className = "fa-solid fa-circle-check";
        } else if (type === "error") {
            toastIcon.className = "fa-solid fa-circle-exclamation";
        } else {
            toastIcon.className = "fa-solid fa-circle-info";
        }
        
        toast.classList.remove("hidden");
        setTimeout(() => {
            toast.classList.add("hidden");
        }, 4000);
    }

    // Theme Management
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    let currentTheme = localStorage.getItem("theme") || "light";

    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
        
        // Update toggle icon
        const icon = themeToggleBtn.querySelector("i");
        if (icon) {
            if (theme === "dark") {
                icon.className = "fa-solid fa-sun";
            } else {
                icon.className = "fa-solid fa-moon";
            }
        }
    }

    // Apply the theme on startup
    applyTheme(currentTheme);

    themeToggleBtn.addEventListener("click", () => {
        currentTheme = currentTheme === "light" ? "dark" : "light";
        applyTheme(currentTheme);
        showToast(`Switched to ${currentTheme} theme`, "info");
    });

    // Load active status on startup
    function loadSystemStatus() {
        fetch("/api/status")
            .then(res => res.json())
            .then(data => {
                // Update sidebar badges
                for (const [key, value] of Object.entries(data.cursors)) {
                    const statusSpan = document.getElementById(`status-${key}`);
                    if (statusSpan) {
                        if (value === "Default") {
                            statusSpan.textContent = "Default System Theme";
                            statusSpan.style.color = "var(--text-muted)";
                        } else {
                            // Extract file name
                            const parts = value.split(/[\\/]/);
                            statusSpan.textContent = parts[parts.length - 1];
                            statusSpan.style.color = "var(--primary)";
                        }
                    }
                }
                
                // If HF token is not configured in env, pop up modal
                if (!data.has_hf_token && !localStorage.getItem("hf_token_skipped")) {
                    configModal.classList.remove("hidden");
                }
            })
            .catch(err => {
                console.error("Failed to load status:", err);
                showToast("Failed to connect to backend", "error");
            });
    }

    loadSystemStatus();

    // HF Token Setup
    saveTokenBtn.addEventListener("click", () => {
        const token = hfTokenInput.value.trim();
        if (token) {
            saveHFToken(token);
        } else {
            showToast("Please enter a valid token", "error");
        }
    });

    modalSaveBtn.addEventListener("click", () => {
        const token = modalTokenInput.value.trim();
        if (token) {
            saveHFToken(token);
            configModal.classList.add("hidden");
        } else {
            showToast("Please enter a valid token", "error");
        }
    });

    modalSkipBtn.addEventListener("click", () => {
        localStorage.setItem("hf_token_skipped", "true");
        configModal.classList.add("hidden");
        showToast("AI generation will be disabled until token is configured", "info");
    });

    function saveHFToken(token) {
        hfToken = token;
        hfTokenInput.value = token;
        fetch("/api/config", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hf_token: token })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast("Token updated successfully", "success");
            } else {
                showToast(data.error || "Failed to save token", "error");
            }
        })
        .catch(err => {
            console.error("Error setting token:", err);
            showToast("Failed to communicate token with server", "error");
        });
    }

    // Tabs Controller
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.classList.add("hidden"));
            
            btn.classList.add("active");
            document.getElementById(btn.dataset.tab).classList.remove("hidden");
        });
    });

    // Sidebar Cursor Type selection
    cursorTypeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            cursorTypeBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeCursorType = btn.dataset.type;
            showToast(`Target cursor set to: ${btn.querySelector('.title').textContent}`);
        });
    });

    // File Drag & Drop
    dropZone.addEventListener("click", () => fileInput.click());
    
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });
    
    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("dragover");
    });
    
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files.length) {
            loadImageFile(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length) {
            loadImageFile(e.target.files[0]);
        }
    });

    let isGifImage = false;
    let animationFrameId = null;

    function startAnimationLoop() {
        stopAnimationLoop();
        function tick() {
            if (originalImage && isGifImage) {
                drawEditor();
                animationFrameId = requestAnimationFrame(tick);
            }
        }
        animationFrameId = requestAnimationFrame(tick);
    }

    function stopAnimationLoop() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }

    function loadImageFile(file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                isGifImage = file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");
                
                if (!isGifImage && (img.naturalWidth > 512 || img.naturalHeight > 512)) {
                    // Downscale large static images for fluid real-time edits
                    const maxDim = 512;
                    const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight);
                    const tempCanvas = document.createElement("canvas");
                    tempCanvas.width = Math.round(img.naturalWidth * scale);
                    tempCanvas.height = Math.round(img.naturalHeight * scale);
                    const tempCtx = tempCanvas.getContext("2d");
                    tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
                    
                    const resizedImg = new Image();
                    resizedImg.onload = () => {
                        originalImage = resizedImg;
                        finishLoadingImage();
                    };
                    resizedImg.src = tempCanvas.toDataURL("image/png");
                } else {
                    originalImage = img;
                    finishLoadingImage();
                }

                function finishLoadingImage() {
                    resetImageState();
                    if (isGifImage) {
                        startAnimationLoop();
                    } else {
                        stopAnimationLoop();
                    }
                    drawEditor();
                    showToast(isGifImage 
                        ? "GIF loaded successfully. Setting hotspot. Note: It will animate on Windows!"
                        : "Image loaded successfully. Left-click canvas to set hotspot."
                    );
                }
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }

    // AI Generation
    btnGenerateAi.addEventListener("click", () => {
        const prompt = aiPrompt.value.trim();
        if (!prompt) {
            showToast("Please enter a description for the cursor", "error");
            return;
        }

        btnGenerateAi.disabled = true;
        aiLoading.classList.remove("hidden");

        fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: prompt, hf_token: hfToken })
        })
        .then(res => res.json())
        .then(data => {
            btnGenerateAi.disabled = false;
            aiLoading.classList.add("hidden");
            if (data.success) {
                const img = new Image();
                img.onload = () => {
                    isGifImage = false;
                    stopAnimationLoop();
                    
                    if (img.naturalWidth > 512 || img.naturalHeight > 512) {
                        const maxDim = 512;
                        const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight);
                        const tempCanvas = document.createElement("canvas");
                        tempCanvas.width = Math.round(img.naturalWidth * scale);
                        tempCanvas.height = Math.round(img.naturalHeight * scale);
                        const tempCtx = tempCanvas.getContext("2d");
                        tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);
                        
                        const resizedImg = new Image();
                        resizedImg.onload = () => {
                            originalImage = resizedImg;
                            resetImageState();
                            drawEditor();
                            showToast("AI image generated. Left-click to set hotspot.", "success");
                        };
                        resizedImg.src = tempCanvas.toDataURL("image/png");
                    } else {
                        originalImage = img;
                        resetImageState();
                        drawEditor();
                        showToast("AI image generated. Left-click to set hotspot.", "success");
                    }
                };
                img.src = data.image;
            } else {
                showToast(data.error || "Generation failed", "error");
            }
        })
        .catch(err => {
            btnGenerateAi.disabled = false;
            aiLoading.classList.add("hidden");
            console.error("AI Error:", err);
            showToast("API timeout or server error. Check connection.", "error");
        });
    });

    // Preset Sizes (32, 48, 64, 128)
    presetBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            presetBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            // Recompute hotspot relative coordinates to the new size preset
            const oldSize = currentSize;
            currentSize = parseInt(btn.dataset.size);
            
            hotspotX = Math.min(currentSize - 1, Math.max(0, Math.round((hotspotX / oldSize) * currentSize)));
            hotspotY = Math.min(currentSize - 1, Math.max(0, Math.round((hotspotY / oldSize) * currentSize)));
            
            updateHotspotBadge();
            drawEditor();
        });
    });

    // Reset editor parameters
    function resetImageState() {
        chromaColor = null;
        colorDisplay.style.backgroundColor = "transparent";
        btnClearChroma.classList.add("hidden");
        // Default hotspot is top-left
        hotspotX = 0;
        hotspotY = 0;
        updateHotspotBadge();
    }

    function updateHotspotBadge() {
        hotspotBadge.textContent = `Hotspot: X=${hotspotX}, Y=${hotspotY} (of ${currentSize}x${currentSize})`;
    }

    // Toggle color-picker mode
    btnColorPicker.addEventListener("click", () => {
        isPickingColor = !isPickingColor;
        if (isPickingColor) {
            btnColorPicker.classList.add("active");
            editorCanvas.style.cursor = "eyedropper";
            showToast("Click a pixel on the canvas to make that color transparent.");
        } else {
            btnColorPicker.classList.remove("active");
            editorCanvas.style.cursor = "crosshair";
        }
    });

    // Slider for chroma key tolerance
    chromaTolerance.addEventListener("input", (e) => {
        toleranceVal.textContent = e.target.value;
        if (chromaColor) {
            drawEditor();
        }
    });

    btnClearChroma.addEventListener("click", () => {
        chromaColor = null;
        colorDisplay.style.backgroundColor = "transparent";
        btnClearChroma.classList.add("hidden");
        drawEditor();
        showToast("Original background restored.");
    });

    // Quick Hotspot Presets
    hotspotTl.addEventListener("click", () => {
        hotspotX = 0;
        hotspotY = 0;
        updateHotspotBadge();
        drawEditor();
    });

    hotspotCenter.addEventListener("click", () => {
        hotspotX = Math.floor(currentSize / 2);
        hotspotY = Math.floor(currentSize / 2);
        updateHotspotBadge();
        drawEditor();
    });

    // Canvas click listener (handles hotspot setting or color picking)
    editorCanvas.addEventListener("click", (e) => {
        if (!originalImage) return;

        // Get relative click coordinate inside canvas
        const rect = editorCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Map canvas coordinates to original image coordinates (clamped to prevent out-of-bounds errors)
        const scaleX = originalImage.naturalWidth / rect.width;
        const scaleY = originalImage.naturalHeight / rect.height;
        const imgX = Math.min(originalImage.naturalWidth - 1, Math.max(0, Math.floor(clickX * scaleX)));
        const imgY = Math.min(originalImage.naturalHeight - 1, Math.max(0, Math.floor(clickY * scaleY)));

        if (isPickingColor) {
            // Get pixel color from original image using temporary context
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = originalImage.naturalWidth;
            tempCanvas.height = originalImage.naturalHeight;
            const tempCtx = tempCanvas.getContext("2d");
            tempCtx.drawImage(originalImage, 0, 0);
            
            const pixel = tempCtx.getImageData(imgX, imgY, 1, 1).data;
            chromaColor = { r: pixel[0], g: pixel[1], b: pixel[2] };
            
            colorDisplay.style.backgroundColor = `rgb(${chromaColor.r}, ${chromaColor.g}, ${chromaColor.b})`;
            btnClearChroma.classList.remove("hidden");
            
            // Turn off picking mode
            isPickingColor = false;
            btnColorPicker.classList.remove("active");
            editorCanvas.style.cursor = "crosshair";
            
            drawEditor();
            showToast("Background transparentized. Adjust tolerance slider to refine.");
        } else {
            // Set hotspot relative to the target resized grid size (currentSize x currentSize)
            hotspotX = Math.min(currentSize - 1, Math.max(0, Math.floor((imgX / originalImage.naturalWidth) * currentSize)));
            hotspotY = Math.min(currentSize - 1, Math.max(0, Math.floor((imgY / originalImage.naturalHeight) * currentSize)));
            
            updateHotspotBadge();
            drawEditor();
        }
    });

    // BFS Flood-fill background transparentizer algorithm
    function floodFillTransparency(imgData, startPoints, targetColor, tolerance) {
        const data = imgData.data;
        const width = imgData.width;
        const height = imgData.height;
        const visited = new Uint8Array(width * height);
        const queue = [];

        for (const [x, y] of startPoints) {
            const idx = y * width + x;
            queue.push([x, y]);
            visited[idx] = 1;
        }

        while (queue.length > 0) {
            const [cx, cy] = queue.shift();
            const pIdx = (cy * width + cx) * 4;
            const r = data[pIdx];
            const g = data[pIdx + 1];
            const b = data[pIdx + 2];
            const a = data[pIdx + 3];

            if (a === 0) continue;

            const dist = Math.sqrt(
                Math.pow(r - targetColor.r, 2) +
                Math.pow(g - targetColor.g, 2) +
                Math.pow(b - targetColor.b, 2)
            );

            if (dist <= tolerance) {
                data[pIdx + 3] = 0; // Set alpha to 0
                
                const neighbors = [
                    [cx + 1, cy],
                    [cx - 1, cy],
                    [cx, cy + 1],
                    [cx, cy - 1]
                ];

                for (const [nx, ny] of neighbors) {
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nIdx = ny * width + nx;
                        if (visited[nIdx] === 0) {
                            visited[nIdx] = 1;
                            queue.push([nx, ny]);
                        }
                    }
                }
            }
        }
    }

    // Core Drawing & Processing Logic
    function drawEditor() {
        if (!originalImage) {
            ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
            return;
        }

        // 1. Process transparency if chromaColor is set
        processedCanvas = document.createElement("canvas");
        processedCanvas.width = originalImage.naturalWidth;
        processedCanvas.height = originalImage.naturalHeight;
        const procCtx = processedCanvas.getContext("2d");
        procCtx.drawImage(originalImage, 0, 0);

        if (chromaColor) {
            const tolerance = parseInt(chromaTolerance.value);
            const imgData = procCtx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
            
            // Get selected background removal mode (flood fill or global chroma key)
            const removeMode = document.querySelector('input[name="chroma-mode"]:checked').value;

            if (removeMode === "flood") {
                const width = imgData.width;
                const height = imgData.height;
                const startPoints = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
                floodFillTransparency(imgData, startPoints, chromaColor, tolerance);
            } else {
                // Global Chroma Key
                const data = imgData.data;
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const dist = Math.sqrt(
                        Math.pow(r - chromaColor.r, 2) +
                        Math.pow(g - chromaColor.g, 2) +
                        Math.pow(b - chromaColor.b, 2)
                    );
                    if (dist <= tolerance) {
                        data[i + 3] = 0; // Transparent
                    }
                }
            }
            procCtx.putImageData(imgData, 0, 0);
        }

        // 2. Set editor canvas dimensions to fit original image aspect ratio
        editorCanvas.width = originalImage.naturalWidth;
        editorCanvas.height = originalImage.naturalHeight;

        // 3. Clear and draw the transparent image
        ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
        ctx.drawImage(processedCanvas, 0, 0);

        // Center the crosshair overlay inside the pixel cell instead of the top-left corner
        const displayHotspotX = ((hotspotX + 0.5) / currentSize) * editorCanvas.width;
        const displayHotspotY = ((hotspotY + 0.5) / currentSize) * editorCanvas.height;

        ctx.strokeStyle = "rgba(255, 0, 0, 0.85)";
        ctx.lineWidth = Math.max(2, Math.round(editorCanvas.width / 100));
        
        ctx.beginPath();
        ctx.moveTo(displayHotspotX - 15, displayHotspotY);
        ctx.lineTo(displayHotspotX + 15, displayHotspotY);
        ctx.moveTo(displayHotspotX, displayHotspotY - 15);
        ctx.lineTo(displayHotspotX, displayHotspotY + 15);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(displayHotspotX, displayHotspotY, 6, 0, 2 * Math.PI);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#000";
        ctx.stroke();

        updateLivePreview();
    }

    function updateLivePreview() {
        if (!processedCanvas) return;

        const cursorCanvas = document.createElement("canvas");
        cursorCanvas.width = currentSize;
        cursorCanvas.height = currentSize;
        const cursorCtx = cursorCanvas.getContext("2d");
        cursorCtx.imageSmoothingEnabled = true;
        cursorCtx.imageSmoothingQuality = "high";
        cursorCtx.drawImage(processedCanvas, 0, 0, currentSize, currentSize);

        const dataUrl = cursorCanvas.toDataURL("image/png");
        testerBox.style.cursor = `url(${dataUrl}) ${hotspotX} ${hotspotY}, auto`;
    }

    // Apply globally
    btnApplySystem.addEventListener("click", () => {
        if (!originalImage) {
            showToast("Please generate or upload an image first", "error");
            return;
        }

        btnApplySystem.disabled = true;
        btnApplySystem.textContent = "Applying...";

        // If it's a GIF, send the original GIF dataURL (so backend can parse frames)
        // Otherwise, send the locally processed static PNG dataURL
        let dataUrl;
        if (isGifImage) {
            dataUrl = originalImage.src;
        } else {
            const cursorCanvas = document.createElement("canvas");
            cursorCanvas.width = currentSize;
            cursorCanvas.height = currentSize;
            const cursorCtx = cursorCanvas.getContext("2d");
            cursorCtx.imageSmoothingEnabled = true;
            cursorCtx.imageSmoothingQuality = "high";
            cursorCtx.drawImage(processedCanvas, 0, 0, currentSize, currentSize);
            dataUrl = cursorCanvas.toDataURL("image/png");
        }

        const removeMode = document.querySelector('input[name="chroma-mode"]:checked').value;
        const tolerance = parseInt(chromaTolerance.value);

        fetch("/api/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                image: dataUrl,
                type: activeCursorType,
                x: hotspotX,
                y: hotspotY,
                size: currentSize,
                chromaColor: chromaColor,
                tolerance: tolerance,
                removeMode: removeMode
            })
        })
        .then(res => res.json())
        .then(data => {
            btnApplySystem.disabled = false;
            btnApplySystem.innerHTML = `<i class="fa-solid fa-check-double"></i> Set Windows Cursor Globally`;
            
            if (data.success) {
                showToast(`Applied cursor successfully for ${activeCursorType}!`, "success");
                loadSystemStatus();
            } else {
                showToast(data.error || "Failed to apply cursor", "error");
            }
        })
        .catch(err => {
            btnApplySystem.disabled = false;
            btnApplySystem.innerHTML = `<i class="fa-solid fa-check-double"></i> Set Windows Cursor Globally`;
            console.error("Apply error:", err);
            showToast("Registry application failed. Admin privileges may be required.", "error");
        });
    });


    // Reset Current
    btnRestoreCurrent.addEventListener("click", () => {
        fetch("/api/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: activeCursorType })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast(`Restored default for ${activeCursorType}.`, "success");
                loadSystemStatus();
            } else {
                showToast(data.error || "Failed to restore defaults", "error");
            }
        })
        .catch(err => {
            console.error("Restore current error:", err);
            showToast("Failed to restore current cursor default", "error");
        });
    });

    // Reset All
    btnRestoreAll.addEventListener("click", () => {
        if (confirm("Are you sure you want to restore all mouse cursors back to the default Windows theme?")) {
            fetch("/api/restore", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "all" })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showToast("Restored all system cursors back to default.", "success");
                    loadSystemStatus();
                } else {
                    showToast(data.error || "Failed to restore all defaults", "error");
                }
            })
            .catch(err => {
                console.error("Restore all error:", err);
                showToast("Failed to restore all defaults", "error");
            });
        }
    });

    // --- Manual Pixel Art Drawing Workspace (Skill Design) ---
    const drawingCanvas = document.getElementById("drawing-canvas");
    const drawCtx = drawingCanvas.getContext("2d");
    let isDrawing = false;
    let activeDrawingTool = "pencil"; // "pencil" or "eraser"
    let activeDrawingColor = "#00f0ff";
    let lastDrawX = -1;
    let lastDrawY = -1;
    
    // Initialize drawing canvas as transparent
    drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    
    // DOM Elements for Drawing
    const btnDrawPencil = document.getElementById("btn-draw-pencil");
    const btnDrawEraser = document.getElementById("btn-draw-eraser");
    const btnDrawClear = document.getElementById("btn-draw-clear");
    const drawColorPicker = document.getElementById("draw-color-picker");
    const swatches = document.querySelectorAll(".swatch");

    // Color Swatches Selection
    swatches.forEach(swatch => {
        swatch.addEventListener("click", () => {
            swatches.forEach(s => {
                s.classList.remove("active");
                s.style.border = "1px solid rgba(255,255,255,0.2)";
            });
            swatch.classList.add("active");
            swatch.style.border = "2px solid #fff";
            
            activeDrawingColor = swatch.dataset.color;
            drawColorPicker.value = activeDrawingColor;
            
            // Switch back to pencil
            selectDrawingTool("pencil");
        });
    });

    // Custom Color Picker
    drawColorPicker.addEventListener("input", (e) => {
        activeDrawingColor = e.target.value;
        // Deactivate pre-selected swatches
        swatches.forEach(s => {
            s.classList.remove("active");
            s.style.border = "1px solid rgba(255,255,255,0.2)";
        });
        selectDrawingTool("pencil");
    });

    // Select Tool helper
    function selectDrawingTool(tool) {
        activeDrawingTool = tool;
        if (tool === "pencil") {
            btnDrawPencil.classList.add("active");
            btnDrawEraser.classList.remove("active");
        } else {
            btnDrawEraser.classList.add("active");
            btnDrawPencil.classList.remove("active");
        }
    }

    btnDrawPencil.addEventListener("click", () => selectDrawingTool("pencil"));
    btnDrawEraser.addEventListener("click", () => selectDrawingTool("eraser"));
    
    btnDrawClear.addEventListener("click", () => {
        if (confirm("Are you sure you want to clear your drawing?")) {
            drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
            syncDrawingToEditor();
            showToast("Drawing canvas cleared.");
        }
    });

    // Bresenham's line algorithm for continuous pixel-perfect drawing
    function drawLine(x0, y0, x1, y1) {
        const dx = Math.abs(x1 - x0);
        const dy = Math.abs(y1 - y0);
        const sx = (x0 < x1) ? 1 : -1;
        const sy = (y0 < y1) ? 1 : -1;
        let err = dx - dy;

        while (true) {
            if (activeDrawingTool === "pencil") {
                drawCtx.fillStyle = activeDrawingColor;
                drawCtx.fillRect(x0, y0, 1, 1);
            } else {
                drawCtx.clearRect(x0, y0, 1, 1);
            }

            if (x0 === x1 && y0 === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x0 += sx;
            }
            if (e2 < dx) {
                err += dx;
                y0 += sy;
            }
        }
    }

    drawingCanvas.addEventListener("mousedown", (e) => {
        // Only draw if left mouse button is pressed
        if (e.button === 0) {
            isDrawing = true;
            const rect = drawingCanvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const x = Math.floor((clickX / rect.width) * drawingCanvas.width);
            const y = Math.floor((clickY / rect.height) * drawingCanvas.height);
            
            if (x >= 0 && x < drawingCanvas.width && y >= 0 && y < drawingCanvas.height) {
                lastDrawX = x;
                lastDrawY = y;
                if (activeDrawingTool === "pencil") {
                    drawCtx.fillStyle = activeDrawingColor;
                    drawCtx.fillRect(x, y, 1, 1);
                } else {
                    drawCtx.clearRect(x, y, 1, 1);
                }
                syncDrawingToEditor();
            }
        }
    });

    window.addEventListener("mousemove", (e) => {
        if (isDrawing && lastDrawX !== -1 && lastDrawY !== -1) {
            const rect = drawingCanvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const x = Math.floor((clickX / rect.width) * drawingCanvas.width);
            const y = Math.floor((clickY / rect.height) * drawingCanvas.height);
            
            if (x >= 0 && x < drawingCanvas.width && y >= 0 && y < drawingCanvas.height) {
                drawLine(lastDrawX, lastDrawY, x, y);
                lastDrawX = x;
                lastDrawY = y;
            }
        }
    });

    window.addEventListener("mouseup", () => {
        if (isDrawing) {
            isDrawing = false;
            lastDrawX = -1;
            lastDrawY = -1;
            syncDrawingToEditor();
        }
    });

    // Prevent right-click menu on drawing canvas
    drawingCanvas.addEventListener("contextmenu", (e) => e.preventDefault());

    // Synchronize drawing-canvas to main editor canvas
    function syncDrawingToEditor() {
        const dataUrl = drawingCanvas.toDataURL("image/png");
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            isGifImage = false;
            stopAnimationLoop();
            
            // Only update editor view, preserve hotspot and chroma picker configurations
            drawEditor();
        };
        img.src = dataUrl;
    }
});
