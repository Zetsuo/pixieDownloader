(function() {
    'use strict';
    
    let running = false;
    let autoScrolling = true;
    let albumZip;
    
    // UI Elements
    let uiContainer = null;
    let uiProgressBar = null;
    let uiStatusText = null;
    let uiCountText = null;

    // --- UI FUNCTIONS ---

    function createUI() {
        if (document.getElementById('pixie-ui-container')) return;

        uiContainer = document.createElement('div');
        uiContainer.id = 'pixie-ui-container';
        uiContainer.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; width: 320px;
            background: #ffffff; border-radius: 12px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.3); padding: 20px;
            z-index: 2147483647; font-family: sans-serif;
            border: 1px solid #f0f0f0; transition: all 0.3s ease;
        `;

        // Title
        const title = document.createElement('div');
        title.innerText = 'Pixie Downloader';
        title.style.cssText = 'font-weight: 800; margin-bottom: 12px; color: #1a1a1a; font-size: 16px;';
        uiContainer.appendChild(title);

        // Status
        uiStatusText = document.createElement('div');
        uiStatusText.id = 'pixie-status';
        uiStatusText.innerText = 'Iniciando...';
        uiStatusText.style.cssText = 'font-size: 13px; color: #444; margin-bottom: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
        uiContainer.appendChild(uiStatusText);

        // Bar Container
        const barContainer = document.createElement('div');
        barContainer.id = 'pixie-bar-container';
        barContainer.style.cssText = 'width: 100%; height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden; margin-bottom: 8px;';
        
        // Progress Bar
        uiProgressBar = document.createElement('div');
        uiProgressBar.style.cssText = 'width: 0%; height: 100%; background: #2563eb; transition: width 0.3s ease;';
        barContainer.appendChild(uiProgressBar);
        uiContainer.appendChild(barContainer);

        // Counter
        uiCountText = document.createElement('div');
        uiCountText.id = 'pixie-counter';
        uiCountText.innerText = '0 / 0';
        uiCountText.style.cssText = 'font-size: 11px; color: #888; text-align: right;';
        uiContainer.appendChild(uiCountText);

        document.body.appendChild(uiContainer);
    }

    function updateUI(progress, total, text) {
        if (!uiContainer) createUI();
        const percent = total > 0 ? Math.round((progress / total) * 100) : 0;
        if (uiProgressBar) uiProgressBar.style.width = `${percent}%`;
        if (uiCountText) uiCountText.innerText = `${progress} / ${total}`;
        if (text && uiStatusText) uiStatusText.innerText = text;
    }

    function showSaveUI(defaultName, blob) {
        if (!uiContainer) createUI();
        
        const bar = document.getElementById('pixie-bar-container');
        const counter = document.getElementById('pixie-counter');
        if(bar) bar.style.display = 'none';
        if(counter) counter.style.display = 'none';

        uiStatusText.innerText = "¡Listo para guardar!";
        uiStatusText.style.color = "#2563eb";
        uiStatusText.style.fontWeight = "bold";

        const formContainer = document.createElement('div');
        formContainer.style.marginTop = "15px";

        const label = document.createElement('div');
        label.innerText = "Nombre del archivo:";
        label.style.fontSize = "12px";
        label.style.marginBottom = "5px";
        formContainer.appendChild(label);

        const input = document.createElement('input');
        input.type = "text";
        input.value = defaultName;
        input.style.cssText = "width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 6px; box-sizing: border-box; margin-bottom: 10px;";
        formContainer.appendChild(input);

        const btnRow = document.createElement('div');
        btnRow.style.display = "flex";
        btnRow.style.gap = "10px";

        const saveBtn = document.createElement('button');
        saveBtn.innerText = "Descargar ZIP";
        saveBtn.style.cssText = "flex: 1; padding: 10px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;";
        
        const cancelBtn = document.createElement('button');
        cancelBtn.innerText = "Cancelar";
        cancelBtn.style.cssText = "flex: 1; padding: 10px; background: #f3f4f6; color: #333; border: 1px solid #ccc; border-radius: 6px; cursor: pointer;";

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(saveBtn);
        formContainer.appendChild(btnRow);
        uiContainer.appendChild(formContainer);

        saveBtn.onclick = () => {
            const finalName = input.value || defaultName;
            formContainer.remove();
            finalizeDownload(blob, finalName);
        };

        cancelBtn.onclick = () => {
            removeUI();
            running = false;
        };
    }

    function removeUI() {
        if (uiContainer && uiContainer.parentNode) {
            uiContainer.parentNode.removeChild(uiContainer);
            uiContainer = null;
        }
    }

    // --- MAIN LOGIC ---

    chrome.runtime.onMessage.addListener(
        function(request, sender, sendResponse) {
            if (request.run == 'true') {
                if (running) {
                    alert('Ya hay una descarga en proceso.');
                } else {
                    running = true;
                    createUI();
                    init();
                }
            }
        }
    );

    function init() {
        const metaTag = document.getElementById('meta_og_site_name');
        const compatCheck = (metaTag && metaTag.content.toUpperCase() == 'PIXIESET');

        if (!compatCheck) {
            updateUI(0, 0, "Error: No es un sitio Pixieset");
            setTimeout(() => { removeUI(); running = false; }, 3000);
        } else {
            if (autoScrolling) {
                let lastScrollHeight = 0;
                function autoScroll() {
                    let scrollHeight = document.documentElement.scrollHeight;
                    if (scrollHeight != lastScrollHeight) {
                        lastScrollHeight = scrollHeight;
                        document.documentElement.scrollTop = scrollHeight;
                    }
                }
                window.setInterval(autoScroll, 50);
            }

            albumZip = new JSZip();
            updateUI(0, 0, "Escaneando galería...");
            setTimeout(() => { zip() }, 2000);
        }
    }

    function sendMessageAsync(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, resolve);
        });
    }

    async function processQueue(items, concurrency, processItemFn, onProgress) {
        let index = 0;
        let activeThreads = 0;
        let results = [];
        
        return new Promise((resolve) => {
            const next = () => {
                if (index >= items.length && activeThreads === 0) {
                    resolve(results);
                    return;
                }
                while (activeThreads < concurrency && index < items.length) {
                    const item = items[index++];
                    activeThreads++;
                    processItemFn(item).then(() => {
                        activeThreads--;
                        onProgress(index);
                        next();
                    }).catch(() => {
                        activeThreads--;
                        onProgress(index);
                        next();
                    });
                }
            };
            next();
        });
    }

    async function zip() {
        const container = document.getElementById('gamma-container');
        if (!container) {
            updateUI(0, 0, "Error: Contenedor no encontrado");
            return;
        }
        
        const imgElements = container.getElementsByTagName('img');
        const re_imgUrl = /(.*images.pixieset.*-)(.*)(.jpg)/;

        let targets = [];
        for (let img of imgElements) {
            if (img.currentSrc && img.currentSrc.match(re_imgUrl)) {
                targets.push(img);
            }
        }

        const totalImages = targets.length;
        if (totalImages === 0) {
            updateUI(0, 0, "No se encontraron imágenes JPG.");
            setTimeout(() => { removeUI(); running = false; }, 3000);
            return;
        }

        updateUI(0, totalImages, "Iniciando descarga (con proxy)...");

        const processImage = async (imgElement) => {
            const currSrc = imgElement.currentSrc;
            const newUrl = currSrc.replace(re_imgUrl, '$1xxlarge$3');
            const origName = imgElement.alt || `image_${Math.random().toString(36).substr(2, 5)}.jpg`;

            try {
                // Solicitar imagen al background (Proxy Fetch)
                const response = await sendMessageAsync({ action: 'fetchImage', url: newUrl });
                
                if (response && response.dataUrl) {
                    const blob = await (await fetch(response.dataUrl)).blob();
                    albumZip.file(origName, blob);
                } else {
                    console.warn("Fallo proxy:", origName);
                }
            } catch (error) {
                console.error("Error procesando:", origName, error);
            }
        };

        // COLA DE 3 HILOS SIMULTÁNEOS
        await processQueue(targets, 3, processImage, (processedCount) => {
            updateUI(processedCount, totalImages, `Descargando... ${Math.round((processedCount/totalImages)*100)}%`);
        });

        updateUI(totalImages, totalImages, "Comprimiendo ZIP (Esto puede tardar)...");
        
        let pathParts = window.location.pathname.split('/');
        let albumName = pathParts.pop() || pathParts.pop();
        let zipName = (document.title || 'Album') + ' - ' + (albumName || 'Download');

        download(albumZip, zipName);
    }

    function download(zip, defaultName) {
        zip.generateAsync({ type:'blob' }, (metadata) => {
            if(metadata.percent) {
                 updateUI(Math.floor(metadata.percent), 100, "Generando ZIP...");
            }
        }).then(blob => {
            showSaveUI(defaultName, blob);
        });
    }

    function finalizeDownload(blob, filename) {
        updateUI(100, 100, "Guardando archivo...");
        
        // --- CAMBIO CLAVE: Descarga Directa en el Navegador ---
        // Esto evita enviar el archivo al background script, eliminando el límite de 64MB.
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        // Aseguramos que tenga extensión .zip
        a.download = filename.endsWith('.zip') ? filename : filename + '.zip';
        
        document.body.appendChild(a);
        a.click();
        
        // Limpieza después de iniciar la descarga
        setTimeout(() => {
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            updateUI(100, 100, "¡Descarga completada!");
            running = false;
            setTimeout(removeUI, 4000);
        }, 1000);
    }

})();