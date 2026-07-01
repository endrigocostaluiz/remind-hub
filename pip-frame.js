const params = new URLSearchParams(window.location.search);
const targetUrl = params.get('url');
const frame = document.getElementById('targetFrame');
const errorOverlay = document.getElementById('errorOverlay');
const btnOpenTab = document.getElementById('btnOpenTab');

if (targetUrl) {
    frame.src = targetUrl;

    // Detecta falha de carregamento via timeout
    let loaded = false;
    frame.addEventListener('load', () => { loaded = true; });

    setTimeout(() => {
        if (!loaded) {
            errorOverlay.classList.add('active');
        }
    }, 8000);
} else {
    errorOverlay.classList.add('active');
    document.getElementById('errorMsg').textContent = 'Nenhuma URL especificada.';
}

btnOpenTab.addEventListener('click', () => {
    if (targetUrl) window.open(targetUrl, '_blank');
});
