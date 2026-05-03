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


    function frame() {
        // Render continuo a 60 FPS circa.
        scene.render();
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
})();
