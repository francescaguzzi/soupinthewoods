(async function main() {
    // Recupera il canvas dalla pagina.
    const canvas = document.getElementById('canvas');
    if (!canvas) {
        throw new Error('Canvas non trovato.');
    }

    // Inizializza la scena usando il canvas.
    // Nota: il target della camera verrà impostato dopo aver caricato i modelli.
    const camera = new Camera([15, 10, 5], [0, 0, 0], [0, 1, 0]);
    const scene = new Scene(canvas, camera);
    await scene.init();

    // Ora che la foresta è caricata, aggiorna il target della camera al focusPoint dei modelli.
    // const focusPoint = scene.forest.getFocusPoint();
    // camera.target = focusPoint;
    // // Ricalcola gli angoli sferici della camera attorno al nuovo target.
    // const toTarget = m4.subtractVectors(camera.position, focusPoint);
    // camera.distance = Math.sqrt(toTarget[0] * toTarget[0] + toTarget[1] * toTarget[1] + toTarget[2] * toTarget[2]);
    // camera.theta = Math.atan2(toTarget[0], toTarget[2]);
    // camera.phi = Math.acos(toTarget[1] / camera.distance);

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
                // Inverti il delta per zoom intuitivo (pinch out = zoom in)
                camera.zoom(-delta * 10);
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

        // Modifica la scala del focolare con tasti + e -
        if (key === '+' || key === '=') {
            scene.forest.setFireScale(scene.forest.fireScale + 0.1);
            console.log(`Fire scale: ${scene.forest.fireScale.toFixed(2)}`);
        } else if (key === '-' || key === '_') {
            scene.forest.setFireScale(scene.forest.fireScale - 0.1);
            console.log(`Fire scale: ${scene.forest.fireScale.toFixed(2)}`);
        }

        // Reset a scala 1.0 con il tasto 'R'
        if (key === 'r' || key === 'R') {
            scene.forest.setFireScale(1.0);
            console.log('Fire scale reset to 1.0');
        }
    });

    window.addEventListener('resize', () => scene.resize());
    canvas.style.cursor = 'grab';

    // Configurazione animazione del fuoco: scala oscillante e intensità della luce correlata.
    const fireAnim = {
        baseScale: 1.0,
        amplitude: 0.1,
        speed: 1.0,
        baseIntensity: (typeof Light !== 'undefined' ? Light.getFireLight().intensity : 3.0),
    };

    function frame() {
        // Aggiorna animazione del fuoco basata sul tempo.
        const t = performance.now() / 1000;
        const scale = fireAnim.baseScale + Math.cos(t * fireAnim.speed) * fireAnim.amplitude;
        scene.forest.setFireScale(scale);

        // Aggiorna l'intensità della luce del fuoco proporzionalmente alla scala.
        if (typeof Light !== 'undefined') {
            const fireLight = Light.getFireLight();
            if (fireLight) {
                fireLight.intensity = fireAnim.baseIntensity * (scale / fireAnim.baseScale);
            }
        }

        // Render continuo a 60 FPS circa.
        scene.render();
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
})();
