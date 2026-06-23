// WinMouse Frontend State Controller

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
    let isGifImage = false;
    let animationFrameId = null;
    let currentZoom = 1.0;          // Canvas zoom multiplier

    // View Navigation switching
    const navItems = document.querySelectorAll(".nav-item");
    const viewPanels = document.querySelectorAll(".view-panel");
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            navItems.forEach(i => i.classList.remove("active"));
            viewPanels.forEach(p => p.classList.remove("active"));
            
            item.classList.add("active");
            const targetViewId = item.dataset.view;
            document.getElementById(targetViewId).classList.add("active");
        });
    });

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
    
    // Canvas elements
    const editorCanvas = document.getElementById("editor-canvas");
    const ctx = editorCanvas.getContext("2d");
    const drawingCanvas = document.getElementById("drawing-canvas");
    const drawCtx = drawingCanvas.getContext("2d");
    const canvasContainer = document.getElementById("canvas-container");
    const canvasViewport = document.getElementById("canvas-viewport");
    
    // Zoom elements
    const btnZoomIn = document.getElementById("btn-zoom-in");
    const btnZoomOut = document.getElementById("btn-zoom-out");
    const btnZoomReset = document.getElementById("btn-zoom-reset");
    const zoomLevelText = document.getElementById("zoom-level-text");

    // Modal elements
    const configModal = document.getElementById("config-modal");
    const modalTokenInput = document.getElementById("modal-token-input");
    const modalSaveBtn = document.getElementById("modal-save-btn");
    const modalSkipBtn = document.getElementById("modal-skip-btn");

    // Packs DOM Elements
    const packSelector = document.getElementById("pack-selector");
    const btnApplyPack = document.getElementById("btn-apply-pack");
    const btnExportPack = document.getElementById("btn-export-pack");
    const btnDeletePack = document.getElementById("btn-delete-pack");
    const newPackName = document.getElementById("new-pack-name");
    const btnSavePack = document.getElementById("btn-save-pack");
    const packImportInput = document.getElementById("pack-import-input");
    const btnImportPack = document.getElementById("btn-import-pack");
    const packPreviewGrid = document.getElementById("pack-preview-grid");
    const btnUndoPack = document.getElementById("btn-undo-pack");

    // Unified canvas bottom bar meta/action buttons
    const activeCursorDisplayName = document.getElementById("active-cursor-display-name");
    const activeCursorResolutionLabel = document.getElementById("active-cursor-resolution-label");
    const btnSaveCanvas = document.getElementById("btn-save-canvas");

    // Properties sliders & selectors
    const sizeSlider = document.getElementById("cursor-size-slider");
    const sizeVal = document.getElementById("size-val");
    const cursorColorPicker = document.getElementById("cursor-color-picker");
    const cursorColorHex = document.getElementById("cursor-color-hex");
    const cursorOpacitySlider = document.getElementById("cursor-opacity-slider");
    const opacityVal = document.getElementById("opacity-val");
    const cursorTrailSlider = document.getElementById("cursor-trail-slider");
    const trailStyleSelect = document.getElementById("trail-style-select");
    const trailVal = document.getElementById("trail-val");
    const cursorSpeedSlider = document.getElementById("cursor-speed-slider");
    const speedVal = document.getElementById("speed-val");

    // Layer effects checkboxes
    const checkboxGlow = document.getElementById("checkbox-glow");
    const checkboxShadow = document.getElementById("checkbox-shadow");
    const checkboxGradient = document.getElementById("checkbox-gradient");
    const checkboxStroke = document.getElementById("checkbox-stroke");

    // Quick workspace headers controls
    const btnQuickUndo = document.getElementById("btn-quick-undo");
    const btnQuickRedo = document.getElementById("btn-quick-redo");
    const btnQuickDelete = document.getElementById("btn-quick-delete");
    const btnPropUndo = document.getElementById("btn-prop-undo");
    const btnPropRedo = document.getElementById("btn-prop-redo");

    // Cursor roles display names map
    const cursorNameMap = {
        "normal": "Normal Select",
        "help": "Help Select",
        "working": "Working in Background",
        "busy": "Busy",
        "precision": "Precision Select",
        "text": "Text Select",
        "handwriting": "Handwriting",
        "unavailable": "Unavailable",
        "vertical": "Vertical Resize",
        "horizontal": "Horizontal Resize",
        "diagonal_1": "Diagonal Resize 1",
        "diagonal_2": "Diagonal Resize 2",
        "move": "Move",
        "alternate": "Alternate Select",
        "link": "Link Select",
        "location": "Location Select",
        "person": "Person Select"
    };

    // Initialize Toast
    const toast = document.getElementById("toast");
    const toastIcon = document.getElementById("toast-icon");
    const toastMessage = document.getElementById("toast-message");

    function showToast(message, type = "info") {
        toast.className = `toast ${type}`;
        toastMessage.textContent = message;
        
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
    let currentTheme = localStorage.getItem("theme") || "light"; // Default to light theme

    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("theme", theme);
        
        const icon = themeToggleBtn.querySelector("i");
        if (icon) {
            if (theme === "dark") {
                icon.className = "fa-solid fa-sun";
            } else {
                icon.className = "fa-solid fa-moon";
            }
        }
    }

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
                // Update target cursor grid indicators
                for (const [key, value] of Object.entries(data.cursors)) {
                    const statusSpan = document.getElementById(`status-${key}`);
                    if (statusSpan) {
                        const btn = statusSpan.closest(".cursor-type-btn");
                        if (value === "Default") {
                            statusSpan.className = "status-indicator";
                            if (btn) {
                                const baseTitle = btn.getAttribute("title").split(" (")[0];
                                btn.setAttribute("title", `${baseTitle} (Default)`);
                            }
                        } else {
                            statusSpan.className = "status-indicator modified";
                            const parts = value.split(/[\\/]/);
                            const fileName = parts[parts.length - 1];
                            if (btn) {
                                const baseTitle = btn.getAttribute("title").split(" (")[0];
                                btn.setAttribute("title", `${baseTitle} (${fileName})`);
                            }
                        }
                    }
                }
                
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
    loadPacksList();

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
        .then(async res => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Server error (status ${res.status})`);
            }
            return data;
        })
        .then(data => {
            showToast("Token updated successfully", "success");
        })
        .catch(err => {
            console.error("Error setting token:", err);
            showToast(err.message || "Failed to communicate token with server", "error");
        });
    }

    // Source tab switching inside workspace
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            tabBtns.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.classList.add("hidden"));
            
            btn.classList.add("active");
            document.getElementById(btn.dataset.tab).classList.remove("hidden");

            const isDraw = btn.dataset.tab === "tab-draw";
            if (isDraw) {
                editorCanvas.classList.add("hidden");
                drawingCanvas.classList.remove("hidden");
                // Synchronize current drawing image back as the editor original image
                syncDrawingToEditor();
            } else {
                drawingCanvas.classList.add("hidden");
                editorCanvas.classList.remove("hidden");
            }
            drawEditor();
        });
    });

    // Sidebar/shapes & icons Cursor Type selection
    cursorTypeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            cursorTypeBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeCursorType = btn.dataset.type;
            
            // Update display name
            const labelName = cursorNameMap[activeCursorType] || activeCursorType;
            activeCursorDisplayName.textContent = labelName;
            
            showToast(`Target cursor set to: ${labelName}`);
        });
    });

    // Size range slider mapping
    const sizeMap = [32, 48, 64, 128];
    sizeSlider.addEventListener("input", (e) => {
        const index = parseInt(e.target.value);
        const targetSize = sizeMap[index];
        sizeVal.textContent = `${targetSize}px`;
        activeCursorResolutionLabel.textContent = `${targetSize}x${targetSize}px @144dpi`;
        
        // Trigger calculation by looking for the preset button and clicking it
        const presetBtn = document.querySelector(`.preset-btn[data-size="${targetSize}"]`);
        if (presetBtn) {
            presetBtn.click();
        }
    });

    // Custom Color picker hex inputs sync
    cursorColorPicker.addEventListener("input", (e) => {
        const color = e.target.value;
        cursorColorHex.value = color.toUpperCase();
        activeDrawingColor = color;
        drawColorPicker.value = color;
        
        // Dynamically update primary visual variable
        document.documentElement.style.setProperty("--primary", color);
        document.documentElement.style.setProperty("--primary-glow", color + "59");
        
        drawEditor();
    });

    cursorColorHex.addEventListener("input", (e) => {
        const color = e.target.value;
        if (/^#[0-9A-F]{6}$/i.test(color)) {
            cursorColorPicker.value = color;
            activeDrawingColor = color;
            drawColorPicker.value = color;
            
            document.documentElement.style.setProperty("--primary", color);
            document.documentElement.style.setProperty("--primary-glow", color + "59");
            
            drawEditor();
        }
    });

    // Opacity range slider
    cursorOpacitySlider.addEventListener("input", (e) => {
        opacityVal.textContent = `${e.target.value}%`;
        drawEditor();
    });

    // Trail range slider
    cursorTrailSlider.addEventListener("input", (e) => {
        trailVal.textContent = `${e.target.value} m`;
    });

    // Speed range slider
    cursorSpeedSlider.addEventListener("input", (e) => {
        speedVal.textContent = `${e.target.value}ms`;
    });

    // Checkbox effects listeners
    checkboxGlow.addEventListener("change", () => drawEditor());
    checkboxShadow.addEventListener("change", () => drawEditor());
    checkboxGradient.addEventListener("change", () => drawEditor());
    checkboxStroke.addEventListener("change", () => drawEditor());

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
                        ? "GIF loaded successfully. Setting hotspot."
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
        .then(async res => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Server error (status ${res.status})`);
            }
            return data;
        })
        .then(data => {
            btnGenerateAi.disabled = false;
            aiLoading.classList.add("hidden");
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
        })
        .catch(err => {
            btnGenerateAi.disabled = false;
            aiLoading.classList.add("hidden");
            console.error("AI Error:", err);
            showToast(err.message || "API timeout or server error. Check connection.", "error");
        });
    });

    // Hidden preset buttons clicks to retain sizing math
    presetBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            presetBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            const oldSize = currentSize;
            currentSize = parseInt(btn.dataset.size);
            
            hotspotX = Math.min(currentSize - 1, Math.max(0, Math.round((hotspotX / oldSize) * currentSize)));
            hotspotY = Math.min(currentSize - 1, Math.max(0, Math.round((hotspotY / oldSize) * currentSize)));
            
            updateHotspotBadge();
            drawEditor();
        });
    });

    function resetImageState() {
        chromaColor = null;
        colorDisplay.style.backgroundColor = "transparent";
        btnClearChroma.classList.add("hidden");
        hotspotX = 0;
        hotspotY = 0;
        updateHotspotBadge();
    }

    function updateHotspotBadge() {
        hotspotBadge.textContent = `Hotspot: X=${hotspotX}, Y=${hotspotY} (of ${currentSize}x${currentSize})`;
    }

    // Toggle chroma eyedropper pick mode
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

    // Editor canvas hotspot / color picking click
    editorCanvas.addEventListener("click", (e) => {
        if (!originalImage) return;

        const rect = editorCanvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        const scaleX = originalImage.naturalWidth / rect.width;
        const scaleY = originalImage.naturalHeight / rect.height;
        const imgX = Math.min(originalImage.naturalWidth - 1, Math.max(0, Math.floor(clickX * scaleX)));
        const imgY = Math.min(originalImage.naturalHeight - 1, Math.max(0, Math.floor(clickY * scaleY)));

        if (isPickingColor) {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = originalImage.naturalWidth;
            tempCanvas.height = originalImage.naturalHeight;
            const tempCtx = tempCanvas.getContext("2d");
            tempCtx.drawImage(originalImage, 0, 0);
            
            const pixel = tempCtx.getImageData(imgX, imgY, 1, 1).data;
            chromaColor = { r: pixel[0], g: pixel[1], b: pixel[2] };
            
            colorDisplay.style.backgroundColor = `rgb(${chromaColor.r}, ${chromaColor.g}, ${chromaColor.b})`;
            btnClearChroma.classList.remove("hidden");
            
            isPickingColor = false;
            btnColorPicker.classList.remove("active");
            editorCanvas.style.cursor = "crosshair";
            
            drawEditor();
            showToast("Background transparentized. Adjust tolerance to refine.");
        } else {
            hotspotX = Math.min(currentSize - 1, Math.max(0, Math.floor((imgX / originalImage.naturalWidth) * currentSize)));
            hotspotY = Math.min(currentSize - 1, Math.max(0, Math.floor((imgY / originalImage.naturalHeight) * currentSize)));
            
            updateHotspotBadge();
            drawEditor();
        }
    });

    // Floodfill transparent background algorithm
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
                data[pIdx + 3] = 0;
                
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

        processedCanvas = document.createElement("canvas");
        processedCanvas.width = originalImage.naturalWidth;
        processedCanvas.height = originalImage.naturalHeight;
        const procCtx = processedCanvas.getContext("2d");
        procCtx.drawImage(originalImage, 0, 0);

        if (chromaColor) {
            const tolerance = parseInt(chromaTolerance.value);
            const imgData = procCtx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
            const removeMode = document.querySelector('input[name="chroma-mode"]:checked').value;

            if (removeMode === "flood") {
                const width = imgData.width;
                const height = imgData.height;
                const startPoints = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
                floodFillTransparency(imgData, startPoints, chromaColor, tolerance);
            } else {
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
                        data[i + 3] = 0;
                    }
                }
            }
            procCtx.putImageData(imgData, 0, 0);
        }

        editorCanvas.width = originalImage.naturalWidth;
        editorCanvas.height = originalImage.naturalHeight;

        ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
        
        // Apply opacity & real-time visual filter effects on canvas drawing
        ctx.save();
        
        let filterStr = "";
        if (checkboxGlow && checkboxGlow.checked) {
            const glowColor = cursorColorHex.value || "#00FFFF";
            filterStr += ` drop-shadow(0 0 6px ${glowColor})`;
        }
        if (checkboxShadow && checkboxShadow.checked) {
            filterStr += " drop-shadow(2px 2px 3px rgba(0,0,0,0.5))";
        }
        
        if (filterStr) {
            ctx.filter = filterStr.trim();
        }
        
        const opacityValNum = parseInt(cursorOpacitySlider.value) / 100;
        ctx.globalAlpha = opacityValNum;
        
        ctx.drawImage(processedCanvas, 0, 0);
        ctx.restore();

        // Stroke effect (outer border)
        if (checkboxStroke && checkboxStroke.checked) {
            ctx.save();
            ctx.strokeStyle = cursorColorHex.value || "#00FFFF";
            ctx.lineWidth = 1;
            ctx.strokeRect(0, 0, editorCanvas.width, editorCanvas.height);
            ctx.restore();
        }

        // Draw hotspot target overlay
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
        
        // Draw image onto virtual cursor canvas
        cursorCtx.save();
        const opacityValNum = parseInt(cursorOpacitySlider.value) / 100;
        cursorCtx.globalAlpha = opacityValNum;
        cursorCtx.drawImage(processedCanvas, 0, 0, currentSize, currentSize);
        cursorCtx.restore();

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
            cursorCtx.save();
            const opacityValNum = parseInt(cursorOpacitySlider.value) / 100;
            cursorCtx.globalAlpha = opacityValNum;
            cursorCtx.drawImage(processedCanvas, 0, 0, currentSize, currentSize);
            cursorCtx.restore();
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
        .then(async res => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Server error (status ${res.status})`);
            }
            return data;
        })
        .then(data => {
            btnApplySystem.disabled = false;
            btnApplySystem.innerHTML = "Export to Cursor";
            showToast(`Applied cursor successfully for ${activeCursorType}!`, "success");
            loadSystemStatus();
        })
        .catch(err => {
            btnApplySystem.disabled = false;
            btnApplySystem.innerHTML = "Export to Cursor";
            console.error("Apply error:", err);
            showToast(err.message || "Registry application failed. Admin privileges may be required.", "error");
        });
    });

    // Reset Current
    btnRestoreCurrent.addEventListener("click", () => {
        fetch("/api/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: activeCursorType })
        })
        .then(async res => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Server error (status ${res.status})`);
            }
            return data;
        })
        .then(data => {
            showToast(`Restored default for ${activeCursorType}.`, "success");
            loadSystemStatus();
        })
        .catch(err => {
            console.error("Restore current error:", err);
            showToast(err.message || "Failed to restore current cursor default", "error");
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
            .then(async res => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.error || `Server error (status ${res.status})`);
                }
                return data;
            })
            .then(data => {
                showToast("Restored all system cursors back to default.", "success");
                loadSystemStatus();
            })
            .catch(err => {
                console.error("Restore all error:", err);
                showToast(err.message || "Failed to restore all defaults", "error");
            });
        }
    });

    // Save Canvas design to a Pack modal trigger
    btnSaveCanvas.addEventListener("click", () => {
        const pName = prompt("Enter a name to save these custom cursors as a pack:", "CustomPack1");
        if (pName) {
            const cleanedName = pName.replace(/[^a-zA-Z0-9]/g, "");
            if (cleanedName) {
                newPackName.value = cleanedName;
                btnSavePack.click();
            } else {
                showToast("Invalid pack name (alphanumeric only)", "error");
            }
        }
    });

    // --- Cursor Packs Management ---
    const CURSOR_ROLES = [
        { id: "normal", name: "Normal Select" },
        { id: "help", name: "Help Select" },
        { id: "working", name: "Working in Background" },
        { id: "busy", name: "Busy" },
        { id: "precision", name: "Precision Select" },
        { id: "text", name: "Text Select" },
        { id: "handwriting", name: "Handwriting" },
        { id: "unavailable", name: "Unavailable" },
        { id: "vertical", name: "Vertical Resize" },
        { id: "horizontal", name: "Horizontal Resize" },
        { id: "diagonal_1", name: "Diagonal Resize 1" },
        { id: "diagonal_2", name: "Diagonal Resize 2" },
        { id: "move", name: "Move" },
        { id: "alternate", name: "Alternate Select" },
        { id: "link", name: "Link Select" },
        { id: "location", name: "Location Select" },
        { id: "person", name: "Person Select" }
    ];

    function loadPacksList() {
        fetch("/api/packs")
            .then(res => res.json())
            .then(packs => {
                packSelector.innerHTML = '<option value="">-- Select Pack --</option>';
                packs.forEach(pack => {
                    const option = document.createElement("option");
                    option.value = pack.id;
                    option.dataset.type = pack.type;
                    option.textContent = `${pack.name} (${pack.type === 'builtin' ? 'Built-in' : 'User'})`;
                    packSelector.appendChild(option);
                });
                packPreviewGrid.innerHTML = '';
            })
            .catch(err => {
                console.error("Error loading packs:", err);
                showToast("Failed to load packs list", "error");
            });
    }

    function updatePackPreviewGrid() {
        const packId = packSelector.value;
        if (!packId) {
            packPreviewGrid.innerHTML = '';
            return;
        }
        
        packPreviewGrid.innerHTML = '';
        
        CURSOR_ROLES.forEach(role => {
            const gridItem = document.createElement("div");
            gridItem.className = "pack-grid-item";
            
            const title = document.createElement("div");
            title.className = "role-title";
            title.textContent = role.name;
            title.title = role.name;
            
            const previewBox = document.createElement("div");
            previewBox.className = "role-preview-box";
            
            const img = document.createElement("img");
            img.src = `/api/packs/preview/${packId}/${role.id}?t=${Date.now()}`;
            img.alt = role.name;
            
            previewBox.appendChild(img);
            gridItem.appendChild(previewBox);
            gridItem.appendChild(title);
            
            packPreviewGrid.appendChild(gridItem);
        });
    }
    
    packSelector.addEventListener("change", updatePackPreviewGrid);

    btnApplyPack.addEventListener("click", () => {
        const packId = packSelector.value;
        const selectedOption = packSelector.options[packSelector.selectedIndex];
        if (!packId) {
            showToast("Please select a pack first", "error");
            return;
        }
        
        const packType = selectedOption.dataset.type;
        btnApplyPack.disabled = true;
        btnApplyPack.textContent = "Applying...";
        
        fetch("/api/packs/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: packId, type: packType })
        })
        .then(async res => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Server error (status ${res.status})`);
            }
            return data;
        })
        .then(data => {
            btnApplyPack.disabled = false;
            btnApplyPack.innerHTML = `<i class="fa-solid fa-check-double"></i> Apply Pack`;
            showToast(data.message || "Pack applied successfully!", "success");
            loadSystemStatus();
        })
        .catch(err => {
            btnApplyPack.disabled = false;
            btnApplyPack.innerHTML = `<i class="fa-solid fa-check-double"></i> Apply Pack`;
            console.error("Apply pack error:", err);
            showToast(err.message || "Failed to apply pack. Run as Admin if registry writes are blocked.", "error");
        });
    });

    btnExportPack.addEventListener("click", () => {
        const packId = packSelector.value;
        if (!packId) {
            showToast("Please select a pack to export", "error");
            return;
        }
        window.location.href = `/api/packs/export/${packId}`;
    });

    btnDeletePack.addEventListener("click", () => {
        const packId = packSelector.value;
        const selectedOption = packSelector.options[packSelector.selectedIndex];
        if (!packId) {
            showToast("Please select a pack to delete", "error");
            return;
        }
        
        const packType = selectedOption.dataset.type;
        if (packType === "builtin") {
            showToast("Cannot delete built-in packs", "error");
            return;
        }
        
        if (confirm(`Are you sure you want to delete the custom pack '${packId}'?`)) {
            btnDeletePack.disabled = true;
            
            fetch("/api/packs/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: packId })
            })
            .then(async res => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                    throw new Error(data.error || `Server error (status ${res.status})`);
                }
                return data;
            })
            .then(data => {
                btnDeletePack.disabled = false;
                showToast("Pack deleted successfully!", "success");
                loadPacksList();
            })
            .catch(err => {
                btnDeletePack.disabled = false;
                console.error("Delete pack error:", err);
                showToast(err.message || "Failed to delete pack", "error");
            });
        }
    });

    btnSavePack.addEventListener("click", () => {
        const packNameVal = newPackName.value.trim();
        if (!packNameVal) {
            showToast("Please enter a pack name", "error");
            return;
        }
        
        btnSavePack.disabled = true;
        
        fetch("/api/packs/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: packNameVal })
        })
        .then(async res => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Server error (status ${res.status})`);
            }
            return data;
        })
        .then(data => {
            btnSavePack.disabled = false;
            newPackName.value = "";
            showToast(data.message || "Pack saved successfully!", "success");
            loadPacksList();
        })
        .catch(err => {
            btnSavePack.disabled = false;
            console.error("Save pack error:", err);
            showToast(err.message || "Failed to save pack. Make sure you have applied custom cursors first.", "error");
        });
    });

    btnImportPack.addEventListener("click", () => {
        packImportInput.click();
    });
    
    packImportInput.addEventListener("change", (e) => {
        if (!e.target.files.length) return;
        
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append("file", file);
        
        btnImportPack.disabled = true;
        btnImportPack.textContent = "Importing...";
        
        fetch("/api/packs/import", {
            method: "POST",
            body: formData
        })
        .then(async res => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Server error (status ${res.status})`);
            }
            return data;
        })
        .then(data => {
            btnImportPack.disabled = false;
            btnImportPack.innerHTML = `<i class="fa-solid fa-file-import"></i> Import Pack`;
            packImportInput.value = "";
            showToast(data.message || "Pack imported successfully!", "success");
            loadPacksList();
        })
        .catch(err => {
            btnImportPack.disabled = false;
            btnImportPack.innerHTML = `<i class="fa-solid fa-file-import"></i> Import Pack`;
            packImportInput.value = "";
            console.error("Import pack error:", err);
            showToast(err.message || "Failed to import pack", "error");
        });
    });

    btnUndoPack.addEventListener("click", () => {
        btnUndoPack.disabled = true;
        
        fetch("/api/packs/undo", {
            method: "POST"
        })
        .then(async res => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.error || `Server error (status ${res.status})`);
            }
            return data;
        })
        .then(data => {
            btnUndoPack.disabled = false;
            showToast(data.message || "Reverted last applied pack!", "success");
            loadSystemStatus();
        })
        .catch(err => {
            btnUndoPack.disabled = false;
            console.error("Undo pack error:", err);
            showToast(err.message || "Failed to undo last applied pack.", "error");
        });
    });

    // --- Manual Pixel Art Drawing Workspace & Stamp Shapes ---
    let isDrawing = false;
    let activeDrawingTool = "pencil"; // "pencil" or "eraser"
    let activeDrawingColor = "#00FFFF";
    let lastDrawX = -1;
    let lastDrawY = -1;
    
    // Pixel drawing history states stack
    const drawHistory = [];
    let historyIdx = -1;

    function saveHistory() {
        if (historyIdx < drawHistory.length - 1) {
            drawHistory.splice(historyIdx + 1);
        }
        drawHistory.push(drawCtx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height));
        historyIdx++;
    }

    function undoDrawing() {
        if (historyIdx > 0) {
            historyIdx--;
            drawCtx.putImageData(drawHistory[historyIdx], 0, 0);
            syncDrawingToEditor();
            showToast("Undo applied");
        } else {
            showToast("Nothing to undo", "error");
        }
    }

    function redoDrawing() {
        if (historyIdx < drawHistory.length - 1) {
            historyIdx++;
            drawCtx.putImageData(drawHistory[historyIdx], 0, 0);
            syncDrawingToEditor();
            showToast("Redo applied");
        } else {
            showToast("Nothing to redo", "error");
        }
    }

    // Bind undo redo triggers
    btnQuickUndo.addEventListener("click", undoDrawing);
    btnPropUndo.addEventListener("click", undoDrawing);
    btnQuickRedo.addEventListener("click", redoDrawing);
    btnPropRedo.addEventListener("click", redoDrawing);

    // Initialize drawing canvas as transparent
    drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    saveHistory(); // initial blank state
    
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
            
            // Sync with property color swatch
            cursorColorPicker.value = activeDrawingColor;
            cursorColorHex.value = activeDrawingColor.toUpperCase();
            document.documentElement.style.setProperty("--primary", activeDrawingColor);
            
            selectDrawingTool("pencil");
        });
    });

    // Custom Color Picker in Drawing tab
    drawColorPicker.addEventListener("input", (e) => {
        activeDrawingColor = e.target.value;
        cursorColorPicker.value = activeDrawingColor;
        cursorColorHex.value = activeDrawingColor.toUpperCase();
        document.documentElement.style.setProperty("--primary", activeDrawingColor);
        
        swatches.forEach(s => {
            s.classList.remove("active");
            s.style.border = "1px solid rgba(255,255,255,0.2)";
        });
        selectDrawingTool("pencil");
    });

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
    
    function clearDrawingCanvas() {
        drawCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
        saveHistory();
        syncDrawingToEditor();
        showToast("Drawing canvas cleared.");
    }
    btnDrawClear.addEventListener("click", clearDrawingCanvas);
    btnQuickDelete.addEventListener("click", clearDrawingCanvas);

    // Bresenham's line algorithm for continuous drawing
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
                syncDrawingToEditor();
            }
        }
    });

    window.addEventListener("mouseup", () => {
        if (isDrawing) {
            isDrawing = false;
            lastDrawX = -1;
            lastDrawY = -1;
            saveHistory();
            syncDrawingToEditor();
        }
    });

    drawingCanvas.addEventListener("contextmenu", (e) => e.preventDefault());

    function syncDrawingToEditor() {
        const dataUrl = drawingCanvas.toDataURL("image/png");
        const img = new Image();
        img.onload = () => {
            originalImage = img;
            isGifImage = false;
            stopAnimationLoop();
            drawEditor();
        };
        img.src = dataUrl;
    }

    // --- Shape Stamps tool execution ---
    const stampBtns = document.querySelectorAll(".stamp-btn[data-shape]");
    stampBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const shapeType = btn.dataset.shape;
            stampShape(shapeType);
        });
    });

    function stampShape(shapeType) {
        drawCtx.save();
        drawCtx.fillStyle = activeDrawingColor;
        drawCtx.strokeStyle = activeDrawingColor;
        drawCtx.lineWidth = 1.5;
        
        const cx = 16;
        const cy = 16;
        
        if (shapeType === "triangle") {
            drawCtx.beginPath();
            drawCtx.moveTo(4, 4);
            drawCtx.lineTo(24, 14);
            drawCtx.lineTo(15, 16);
            drawCtx.lineTo(21, 25);
            drawCtx.lineTo(18, 27);
            drawCtx.lineTo(12, 18);
            drawCtx.lineTo(7, 21);
            drawCtx.closePath();
            drawCtx.fill();
        } else if (shapeType === "diamond") {
            drawCtx.beginPath();
            drawCtx.moveTo(cx, 8);
            drawCtx.lineTo(cx + 8, cy);
            drawCtx.lineTo(cx, cy + 8);
            drawCtx.lineTo(cx - 8, cy);
            drawCtx.closePath();
            drawCtx.fill();
        } else if (shapeType === "square") {
            drawCtx.fillRect(cx - 6, cy - 6, 12, 12);
        } else if (shapeType === "circle") {
            drawCtx.beginPath();
            drawCtx.arc(cx, cy, 6, 0, 2 * Math.PI);
            drawCtx.fill();
        } else if (shapeType === "rounded-triangle") {
            drawCtx.beginPath();
            drawCtx.moveTo(6, 6);
            drawCtx.lineTo(22, 12);
            drawCtx.quadraticCurveTo(18, 18, 12, 22);
            drawCtx.closePath();
            drawCtx.fill();
        } else if (shapeType === "cross") {
            drawCtx.beginPath();
            drawCtx.moveTo(cx, 4); drawCtx.lineTo(cx, 28);
            drawCtx.moveTo(4, cy); drawCtx.lineTo(28, cy);
            drawCtx.stroke();
        } else if (shapeType === "pin") {
            drawCtx.beginPath();
            drawCtx.arc(cx, cy - 4, 4, 0, 2 * Math.PI);
            drawCtx.fill();
            drawCtx.beginPath();
            drawCtx.moveTo(cx - 4, cy - 4);
            drawCtx.lineTo(cx, cy + 4);
            drawCtx.lineTo(cx + 4, cy - 4);
            drawCtx.closePath();
            drawCtx.fill();
        } else if (shapeType === "compass") {
            drawCtx.beginPath();
            drawCtx.arc(cx, cy, 6, 0, 2 * Math.PI);
            drawCtx.stroke();
            drawCtx.beginPath();
            drawCtx.moveTo(cx, 2); drawCtx.lineTo(cx, 30);
            drawCtx.moveTo(2, cy); drawCtx.lineTo(30, cy);
            drawCtx.stroke();
        } else if (shapeType === "move") {
            drawCtx.beginPath();
            drawCtx.moveTo(cx, 4); drawCtx.lineTo(cx, 28);
            drawCtx.moveTo(4, cy); drawCtx.lineTo(28, cy);
            drawCtx.stroke();
            drawCtx.beginPath();
            drawCtx.moveTo(cx - 3, 7); drawCtx.lineTo(cx, 4); drawCtx.lineTo(cx + 3, 7);
            drawCtx.moveTo(cx - 3, 25); drawCtx.lineTo(cx, 28); drawCtx.lineTo(cx + 3, 25);
            drawCtx.moveTo(7, cy - 3); drawCtx.lineTo(4, cy); drawCtx.lineTo(7, cy + 3);
            drawCtx.moveTo(25, cy - 3); drawCtx.lineTo(28, cy); drawCtx.lineTo(25, cy + 3);
            drawCtx.stroke();
        }
        
        drawCtx.restore();
        saveHistory();
        syncDrawingToEditor();
        showToast(`Stamped ${shapeType} onto pixel canvas!`, "success");
    }

    // --- Tester Area Trail Effect ---
    testerBox.addEventListener("mousemove", (e) => {
        const activeTrail = parseInt(cursorTrailSlider.value);
        if (activeTrail === 0) return;
        
        const rect = testerBox.getBoundingClientRect();
        // mouseX and mouseY track the *hotspot* location
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const trailStyle = trailStyleSelect ? trailStyleSelect.value : "dot";
        const duration = 0.2 + (activeTrail * 0.08); // scale duration based on length
        
        // Spawn trail element
        const trailDot = document.createElement("div");
        trailDot.className = "trail-particle";
        trailDot.style.position = "absolute";
        trailDot.style.pointerEvents = "none";
        
        if (trailStyle === "dot") {
            // Center the dot exactly at the mouse tip
            trailDot.style.left = `${mouseX - 3}px`;
            trailDot.style.top = `${mouseY - 3}px`;
            trailDot.style.width = "6px";
            trailDot.style.height = "6px";
            trailDot.style.backgroundColor = cursorColorHex.value || "#00FFFF";
            trailDot.style.borderRadius = "50%";
            trailDot.style.boxShadow = `0 0 8px ${cursorColorHex.value || "#00FFFF"}`;
            trailDot.style.transition = `transform ${duration}s ease-out, opacity ${duration}s ease-out`;
            
            testerBox.appendChild(trailDot);
            
            setTimeout(() => {
                trailDot.style.transform = "scale(0.1)";
                trailDot.style.opacity = "0";
            }, 10);
            
        } else if (trailStyle === "ghost") {
            // Echo the actual cursor image
            trailDot.style.left = `${mouseX - hotspotX}px`;
            trailDot.style.top = `${mouseY - hotspotY}px`;
            trailDot.style.width = `${currentSize}px`;
            trailDot.style.height = `${currentSize}px`;
            trailDot.style.backgroundImage = `url(${mainCanvas.toDataURL()})`;
            trailDot.style.backgroundSize = "contain";
            trailDot.style.backgroundRepeat = "no-repeat";
            trailDot.style.opacity = "0.5";
            trailDot.style.transition = `transform ${duration}s ease-out, opacity ${duration}s ease-out`;
            
            testerBox.appendChild(trailDot);
            
            setTimeout(() => {
                trailDot.style.transform = "scale(0.3)";
                trailDot.style.opacity = "0";
            }, 10);
            
        } else if (trailStyle === "sparkle") {
            // Emit sparkles
            trailDot.style.left = `${mouseX - 8}px`;
            trailDot.style.top = `${mouseY - 8}px`;
            trailDot.innerText = "✨";
            trailDot.style.fontSize = "16px";
            trailDot.style.transition = `transform ${duration}s ease-out, opacity ${duration}s ease-out`;
            
            testerBox.appendChild(trailDot);
            
            const angle = Math.random() * Math.PI * 2;
            const dist = 10 + Math.random() * 20;
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist + 10;
            
            setTimeout(() => {
                trailDot.style.transform = `translate(${dx}px, ${dy}px) scale(0.5) rotate(${Math.random() * 180}deg)`;
                trailDot.style.opacity = "0";
            }, 10);
            
        } else if (trailStyle === "emoji") {
            // Emits funny emojis
            trailDot.style.left = `${mouseX - 12}px`;
            trailDot.style.top = `${mouseY - 12}px`;
            const emojis = ["😂", "💩", "💦", "🚀", "💥", "👻"];
            trailDot.innerText = emojis[Math.floor(Math.random() * emojis.length)];
            trailDot.style.fontSize = "24px";
            trailDot.style.transition = `transform ${duration}s ease-out, opacity ${duration}s ease-out`;
            
            testerBox.appendChild(trailDot);
            
            const dx = (Math.random() - 0.5) * 60;
            const dy = -20 - Math.random() * 40;
            
            setTimeout(() => {
                trailDot.style.transform = `translate(${dx}px, ${dy}px) scale(1.5) rotate(${(Math.random() - 0.5) * 60}deg)`;
                trailDot.style.opacity = "0";
            }, 10);
            
        } else if (trailStyle === "fire") {
            trailDot.style.left = `${mouseX - 8}px`;
            trailDot.style.top = `${mouseY - 8}px`;
            trailDot.style.width = "16px";
            trailDot.style.height = "16px";
            trailDot.style.borderRadius = "50%";
            const colors = ["#ff3300", "#ff6600", "#ff9900", "#ffcc00"];
            trailDot.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            trailDot.style.boxShadow = `0 0 10px ${trailDot.style.backgroundColor}`;
            trailDot.style.filter = "blur(2px)";
            trailDot.style.transition = `transform ${duration}s ease-in, opacity ${duration}s ease-in`;
            
            testerBox.appendChild(trailDot);
            
            const dx = (Math.random() - 0.5) * 20;
            const dy = -20 - Math.random() * 40;
            
            setTimeout(() => {
                trailDot.style.transform = `translate(${dx}px, ${dy}px) scale(0.1)`;
                trailDot.style.opacity = "0";
            }, 10);
            
        } else if (trailStyle === "snow") {
            trailDot.style.left = `${mouseX - 6}px`;
            trailDot.style.top = `${mouseY - 6}px`;
            trailDot.style.width = `${4 + Math.random() * 6}px`;
            trailDot.style.height = trailDot.style.width;
            trailDot.style.backgroundColor = "#FFFFFF";
            trailDot.style.borderRadius = "50%";
            trailDot.style.boxShadow = "0 0 5px #FFFFFF, 0 0 10px #AADDFF";
            trailDot.style.transition = `transform ${duration * 1.5}s linear, opacity ${duration * 1.5}s ease-in`;
            
            testerBox.appendChild(trailDot);
            
            const dx = (Math.random() - 0.5) * 50;
            const dy = 20 + Math.random() * 50;
            
            setTimeout(() => {
                trailDot.style.transform = `translate(${dx}px, ${dy}px) scale(0.5)`;
                trailDot.style.opacity = "0";
            }, 10);
            
        } else if (trailStyle === "hearts") {
            trailDot.style.left = `${mouseX - 10}px`;
            trailDot.style.top = `${mouseY - 10}px`;
            const hearts = ["💖", "💕", "❤️", "💗"];
            trailDot.innerText = hearts[Math.floor(Math.random() * hearts.length)];
            trailDot.style.fontSize = `${16 + Math.random() * 10}px`;
            trailDot.style.transition = `transform ${duration * 1.2}s ease-out, opacity ${duration * 1.2}s ease-out`;
            
            testerBox.appendChild(trailDot);
            
            const dx = (Math.random() - 0.5) * 40;
            const dy = -30 - Math.random() * 50;
            
            setTimeout(() => {
                trailDot.style.transform = `translate(${dx}px, ${dy}px) scale(1.2) rotate(${(Math.random() - 0.5) * 45}deg)`;
                trailDot.style.opacity = "0";
            }, 10);
            
        } else if (trailStyle === "matrix") {
            trailDot.style.left = `${mouseX - 8}px`;
            trailDot.style.top = `${mouseY - 8}px`;
            trailDot.innerText = Math.random() > 0.5 ? "1" : "0";
            trailDot.style.fontFamily = "monospace";
            trailDot.style.fontSize = "16px";
            trailDot.style.color = "#00FF41";
            trailDot.style.textShadow = "0 0 5px #00FF41";
            trailDot.style.fontWeight = "bold";
            trailDot.style.transition = `transform ${duration}s linear, opacity ${duration}s ease-in`;
            
            testerBox.appendChild(trailDot);
            
            const dy = 30 + Math.random() * 60;
            
            setTimeout(() => {
                trailDot.style.transform = `translate(0px, ${dy}px)`;
                trailDot.style.opacity = "0";
            }, 10);
            
        } else if (trailStyle === "confetti") {
            trailDot.style.left = `${mouseX - 4}px`;
            trailDot.style.top = `${mouseY - 4}px`;
            trailDot.style.width = "8px";
            trailDot.style.height = "8px";
            const colors = ["#fce18a", "#ff726d", "#b48def", "#f4306d", "#00FFFF"];
            trailDot.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            trailDot.style.transition = `transform ${duration}s cubic-bezier(0.25, 1, 0.5, 1), opacity ${duration}s ease-in`;
            
            testerBox.appendChild(trailDot);
            
            const angle = Math.random() * Math.PI * 2;
            const dist = 20 + Math.random() * 50;
            const dx = Math.cos(angle) * dist;
            const dy = Math.sin(angle) * dist + (Math.random() * 20);
            
            setTimeout(() => {
                trailDot.style.transform = `translate(${dx}px, ${dy}px) rotate(${Math.random() * 360}deg) scale(0.5)`;
                trailDot.style.opacity = "0";
            }, 10);
        }
        
        setTimeout(() => {
            if(trailDot.parentNode) trailDot.remove();
        }, duration * 1500 + 50);
    });

    // --- Canvas Zoom & Pan Logic ---
    let panX = 0;
    let panY = 0;
    let isSpacePressed = false;
    let isPanning = false;
    let startPanClientX = 0;
    let startPanClientY = 0;
    let startPanXState = 0;
    let startPanYState = 0;

    const applyTransform = () => {
        canvasContainer.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
    };

    const updateZoom = (newZoom) => {
        currentZoom = Math.max(0.5, Math.min(newZoom, 5.0)); // Clamp 50% to 500%
        zoomLevelText.innerText = `${Math.round(currentZoom * 100)}%`;
        applyTransform();
    };

    btnZoomIn.addEventListener("click", () => updateZoom(currentZoom + 0.25));
    btnZoomOut.addEventListener("click", () => updateZoom(currentZoom - 0.25));
    btnZoomReset.addEventListener("click", () => {
        panX = 0;
        panY = 0;
        updateZoom(1.0);
    });

    // Mouse wheel zoom
    canvasViewport.addEventListener("wheel", (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.15 : 0.15;
            updateZoom(currentZoom + delta);
        }
    }, { passive: false });

    // Panning bindings
    window.addEventListener("keydown", (e) => {
        if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
            e.preventDefault();
            isSpacePressed = true;
            if (!isPanning) canvasViewport.style.cursor = "grab";
        }
    });

    window.addEventListener("keyup", (e) => {
        if (e.code === "Space") {
            isSpacePressed = false;
            if (!isPanning) canvasViewport.style.cursor = "default";
        }
    });

    canvasViewport.addEventListener("mousedown", (e) => {
        if (isSpacePressed || e.button === 1) { // Spacebar or middle click
            e.preventDefault();
            e.stopPropagation(); // Prevent canvas drawing
            isPanning = true;
            canvasViewport.style.cursor = "grabbing";
            startPanClientX = e.clientX;
            startPanClientY = e.clientY;
            startPanXState = panX;
            startPanYState = panY;
        }
    }, true); // Use capture phase to intercept before canvas

    window.addEventListener("mousemove", (e) => {
        if (isPanning) {
            panX = startPanXState + (e.clientX - startPanClientX);
            panY = startPanYState + (e.clientY - startPanClientY);
            applyTransform();
        }
    });

    window.addEventListener("mouseup", (e) => {
        if (isPanning) {
            isPanning = false;
            canvasViewport.style.cursor = isSpacePressed ? "grab" : "default";
            
            // Prevent accidental click firing right after pan
            const blockClick = (clickEvent) => {
                clickEvent.stopPropagation();
                clickEvent.preventDefault();
                canvasViewport.removeEventListener("click", blockClick, true);
            };
            canvasViewport.addEventListener("click", blockClick, true);
            setTimeout(() => canvasViewport.removeEventListener("click", blockClick, true), 50);
        }
    });
});
