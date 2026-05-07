(async function main() {
    // Recupera il canvas dalla pagina.
    const canvas = document.getElementById('canvas');
    if (!canvas) {
        throw new Error('Canvas non trovato.');
    }

    // Inizializza la scena usando il canvas.
    // Nota: il target della camera verrà impostato dopo aver caricato i modelli.
    const camera = new Camera([-10, 15, 15], [0, 2, 0], [0, 1, 0]);
    const scene = new Scene(canvas, camera);
    await scene.init();

    // Abilita profondità e blending per le parti trasparenti.
    const gl = scene.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // Blending standard per trasparenza
    gl.disable(gl.CULL_FACE); // Disabilita culling per vedere le foglie da entrambi i lati

    // Stato input per orbit della camera.
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastTouchDistance = 0;

    // MOUSE EVENTS
    canvas.addEventListener('mousedown', (event) => {
        // Usa il tasto sinistro del mouse per ruotare la camera.
        if (event.button !== 0) return;
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
        // Quando rilasci il mouse, fermiamo la rotazione.
        dragging = false;
        canvas.style.cursor = 'grab';
    });

    window.addEventListener('mousemove', (event) => {
        // Se non stiamo trascinando, ignoriamo il movimento.
        if (!dragging) return;

        // Calcola lo spostamento del mouse rispetto al frame precedente.
        const deltaX = event.clientX - lastX;
        const deltaY = event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;

        // Ruota la camera secondo il drag del mouse (orbita attorno al target).
        camera.orbit(deltaX, deltaY);
    });

    // TOUCH EVENTS
    canvas.addEventListener('touchstart', (event) => {
        if (event.touches.length === 1) {
            // Un dito: drag per ruotare la camera
            dragging = true;
            lastX = event.touches[0].clientX;
            lastY = event.touches[0].clientY;
        } else if (event.touches.length === 2) {
            // Due dita: pinch per lo zoom
            dragging = false;
            const dx = event.touches[0].clientX - event.touches[1].clientX;
            const dy = event.touches[0].clientY - event.touches[1].clientY;
            lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
        }
    }, { passive: true });

    canvas.addEventListener('touchmove', (event) => {
        if (event.touches.length === 1 && dragging) {
            // Un dito in movimento: ruota la camera
            const deltaX = event.touches[0].clientX - lastX;
            const deltaY = event.touches[0].clientY - lastY;
            lastX = event.touches[0].clientX;
            lastY = event.touches[0].clientY;

            camera.orbit(deltaX, deltaY);
        } else if (event.touches.length === 2) {
            // Due dita in movimento: pinch zoom
            const dx = event.touches[0].clientX - event.touches[1].clientX;
            const dy = event.touches[0].clientY - event.touches[1].clientY;
            const currentDistance = Math.sqrt(dx * dx + dy * dy);
            
            if (lastTouchDistance > 0) {
                const delta = currentDistance - lastTouchDistance;
                camera.zoom(delta * 10);
            }
            lastTouchDistance = currentDistance;
        }
    }, { passive: true });

    canvas.addEventListener('touchend', (event) => {
        if (event.touches.length < 2) {
            lastTouchDistance = 0;
        }
        if (event.touches.length === 0) {
            dragging = false;
        }
    }, { passive: true });

    canvas.addEventListener('wheel', (event) => {
        // Evita lo scroll della pagina e usa la rotella per lo zoom.
        event.preventDefault();
        camera.zoom(event.deltaY);
    }, { passive: false });

    window.addEventListener('keydown', (event) => {

        const key = event.key;
        
    });

    window.addEventListener('resize', () => scene.resize());
    canvas.style.cursor = 'grab';

    const fireAnim = {
        baseScale: 1.0,
        amplitude: 0.12,
        speed: 2.0,
        baseIntensity: (typeof Light !== 'undefined' ? Light.getFireLight().intensity : 3.0),
    };

    function frame() {
        
        // Animazione del fuoco
        // Oscillazione di base (sin) fluida, combinata con noise per imitare il crepitio del fuoco
        /* ------------------------------------------ */
        
        const t = performance.now() / 1000;
        
        const baseSin = Math.sin(t * fireAnim.speed);
        const highFreq = Math.sin(t * fireAnim.speed * 4.3) * 0.15;
        const noise = Math.sin((t * 3.7) * 100) * 0.08 +
                      Math.sin((t * 5.3) * 80) * 0.05;
        
        const scale = fireAnim.baseScale + 
                      (baseSin + highFreq + noise) * fireAnim.amplitude;
        scene.forest.setFireScale(Math.max(0.1, scale));

        if (typeof Light !== 'undefined' && Light.setFireIntensity) {
            // Intensità proporzionale alla scala del fuoco
            const scaleVariation = scale - fireAnim.baseScale;
            const intensity = fireAnim.baseIntensity * (1 + scaleVariation);
            Light.setFireIntensity(intensity);
        }

        /* ------------------------------------------ */

        scene.render();
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
})();
