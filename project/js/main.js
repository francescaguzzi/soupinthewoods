(async function main() {

    const canvas = document.getElementById('canvas');
    if (!canvas) {
        throw new Error('Canvas not found.');
    }

    setLoadingProgress(10, 'Initializing...');

    const camera = new Camera([-10, 15, 15], [0, 2, 0], [0, 1, 0]);
    const scene = new Scene(canvas, camera);

    setLoadingProgress(30, 'Loading models...');

    await scene.init();

    setLoadingProgress(100, 'Building interface...');

    const ui = new UI();
    const game = new Game(scene, scene.forest, camera, ui);

    hideLoadingScreen();

    // Enable depth and blending for transparent parts
    const gl = scene.gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // Standard blending for transparency
    gl.disable(gl.CULL_FACE); // Disable culling to see leaves from both sides

    // Input state for camera orbiting
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastTouchDistance = 0;
    let dragStartX = 0;
    let dragStartY = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    const dragThreshold = 5; // pixels

    // FPS Counter
    let frameCount = 0;
    let lastFpsUpdateTime = performance.now();
    let currentFps = 0;

    /* EVENT LISTENERS FOR UI */

    ui.container.addEventListener('clear-inventory', () => {
        game.emptyInventory();
        ui.clear();
    });
    ui.container.addEventListener('toggle-bump-mapping', () => { scene.toggleBumpMapping(); });
    ui.container.addEventListener('toggle-specular-mapping', () => { scene.toggleSpecularMapping(); });
    ui.container.addEventListener('toggle-alpha-clipping', () => { 
        const enabled = scene.toggleAlphaClipping();
        scene.setBlending(enabled); 
    });
    ui.container.addEventListener('set-alpha-threshold', (e) => { scene.setAlphaThreshold(e.detail.value); });
    ui.container.addEventListener('set-bump-strength', (e) => { scene.setBumpMapStrength(e.detail.value); });
    ui.container.addEventListener('set-fps-visibility', (e) => { ui.setFpsVisibility(e.detail.visible); });

    /* ---------------------- */

    // MOUSE EVENTS
    canvas.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
    });

    window.addEventListener('mouseup', (event) => {
        if (dragging) {
            const dragDistance = Math.sqrt(
                Math.pow(event.clientX - dragStartX, 2) + 
                Math.pow(event.clientY - dragStartY, 2)
            );
            dragging = false;

            if (dragDistance < dragThreshold && event.button === 0) {
                game.onCanvasClick(event.clientX, event.clientY, canvas);
            }
        }
    });

    window.addEventListener('mousemove', (event) => {
        if (!dragging) return;

        const deltaX = event.clientX - lastX;
        const deltaY = event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;

        camera.orbit(deltaX, deltaY);
    });

    // TOUCH EVENTS
    canvas.addEventListener('touchstart', (event) => {
        if (event.touches.length === 1) { // one finger: orbit
            dragging = true;
            lastX = event.touches[0].clientX;
            lastY = event.touches[0].clientY;
            touchStartX = event.touches[0].clientX;
            touchStartY = event.touches[0].clientY;
        } else if (event.touches.length === 2) { // two fingers: zoom
            dragging = false;
            const dx = event.touches[0].clientX - event.touches[1].clientX;
            const dy = event.touches[0].clientY - event.touches[1].clientY;
            lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
        }
    }, { passive: true });

    canvas.addEventListener('touchmove', (event) => {
        if (event.touches.length === 1 && dragging) { 
            const deltaX = event.touches[0].clientX - lastX;
            const deltaY = event.touches[0].clientY - lastY;
            lastX = event.touches[0].clientX;
            lastY = event.touches[0].clientY;

            camera.orbit(deltaX, deltaY);
        } else if (event.touches.length === 2) { 
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

            if (dragging) {
                const dragDistance = Math.sqrt(
                    Math.pow(event.changedTouches[0].clientX - touchStartX, 2) + 
                    Math.pow(event.changedTouches[0].clientY - touchStartY, 2)
                );
                if (dragDistance < dragThreshold) {
                    game.onCanvasClick(event.changedTouches[0].clientX, event.changedTouches[0].clientY, canvas);
                }
            }
            dragging = false;
        }
    }, { passive: true });

    canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
        camera.zoom(event.deltaY);
    }, { passive: false });

    window.addEventListener('resize', () => scene.resize());

    /* ----------------------- */

    const fireAnim = { // Parameters for fire animation
        baseScale: 1.0,
        amplitude: 0.12,
        speed: 2.0,
        baseIntensity: (typeof Light !== 'undefined' ? Light.getFireLight().intensity : 3.0),
    };

    let lastFrameTime = 0;

    function frame(currentTime) {
        
        const deltaTime = lastFrameTime ? currentTime - lastFrameTime : 0;
        lastFrameTime = currentTime;
        
        scene.forest.updateMouseAnimation(deltaTime);

        // Fire animation
        // Fluid base oscillation (sin), combined with noise to mimic fire crackling
        /* ------------------------------------------ */
        
        const t = currentTime/ 1000;
        
        const baseSin = Math.sin(t * fireAnim.speed);
        const highFreq = Math.sin(t * fireAnim.speed * 4.3) * 0.15;
        // Multiple noise frequencies for more natural effect
        const noise = Math.sin((t * 3.7) * 100) * 0.08 + Math.sin((t * 5.3) * 80) * 0.05; 
    
        const scale = fireAnim.baseScale + (baseSin + highFreq + noise) * fireAnim.amplitude;
        scene.forest.setFireScale(Math.max(0.1, scale));

        // modulate fire intensity and ambient with the scale variation to enhance the effect
        if (typeof Light !== 'undefined' && Light.setFireIntensity) {
            const scaleVariation = scale - fireAnim.baseScale; 
            const intensity = fireAnim.baseIntensity * (1 + scaleVariation);
            Light.setFireIntensity(intensity);
        }

        /* ------------------------------------------ */

        scene.render();

        frameCount++; // FPS calculation
        const now = performance.now();
        if (now - lastFpsUpdateTime >= 500) {
            currentFps = Math.round((frameCount * 1000) / (now - lastFpsUpdateTime));
            ui.updateFPS(currentFps);
            frameCount = 0;
            lastFpsUpdateTime = now;
        }

        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
})();

function setLoadingProgress(percent, message) {
    const bar = document.getElementById('loading-bar');
    const msg = document.getElementById('loading-msg');
    if (bar) bar.style.width = `${percent}%`;
    if (msg) msg.textContent = message;
}

function hideLoadingScreen() {
    const screen = document.getElementById('loading-screen');
    if (!screen) return;
    screen.classList.add('fade-out');
    screen.addEventListener('transitionend', () => screen.remove(), { once: true }); // Remove from DOM after transition
}
