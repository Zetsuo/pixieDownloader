// run sender: extension executes its toolbar icon is clicked — sends a message to content.js
chrome.action.onClicked.addListener(tab => {
	chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
		if (tabs.length > 0) {
			chrome.tabs.sendMessage(tabs[0].id, { run: 'true' }, {});
		} else {
            console.error("Pixie Downloader: No se encontró una pestaña activa.");
        }
	});
});


// Función para convertir Blob a Data URL (Base64)
// Esto es necesario para pasar los datos binarios del Background al Content Script
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Función Proxy usando FETCH (Compatible con Service Workers)
async function proxyFetchImage(url) {
    try {
        // Hacemos el fetch desde el background (evita CORS gracias a host_permissions)
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const blob = await response.blob();
        
        // Convertimos a DataURL para enviarlo de vuelta al content script
        // (No podemos enviar Blobs directamente a través de mensajes en todas las versiones)
        const dataUrl = await blobToDataURL(blob);
        return dataUrl;
    } catch (error) {
        console.error("PROXY FETCH ERROR:", url, error);
        return null;
    }
}


// RESPONDER A MENSAJE DE content.js
chrome.runtime.onMessage.addListener(
	function(request, sender, sendResponse) {
        
        if (request.action === 'fetchImage') {
            // Acción 1: Content.js pide una imagen
            proxyFetchImage(request.url).then(dataUrl => {
                sendResponse({ dataUrl: dataUrl });
            });
            return true; // Respuesta asíncrona
            
        } else if (request.action === 'startDownload') {
            // Acción 2: Iniciar descarga del ZIP final
            // Usamos la API de descargas. No necesitamos window.URL aquí, pasamos el DataURL directo
			chrome.downloads.download({
				url: request.zipUrl,
				filename: request.zipName + '.zip',
				saveAs: false 
			}, function(downloadId) {
				if (chrome.runtime.lastError) {
					console.error("Download failed:", chrome.runtime.lastError.message);
				}
                // No intentamos revocar URL aquí porque content.js maneja su propio ciclo
			});
			return false; 
		}
	}
);