class UI {
    constructor() {
        this.inventory = [];

        this.MUSHROOM_IMAGES = {
            0: 'assets/ui/2x_11.png', // fungo rosso
            1: 'assets/ui/2x_17.png', // fungo viola
            2: 'assets/ui/2x_16.png', // fungo marrone
        };

        this.container = document.getElementById('ui-container');
        this.slotsEl = document.getElementById('inventory-slots');
        this.clearBtn = document.getElementById('btn-clear');
        this.fpsCounter = document.getElementById('fps-counter');

        this.overlay = document.getElementById('howto-overlay');
        this.btnHelp   = document.getElementById('btn-help');
        this.btnClose  = document.getElementById('btn-close-howto');
        this.btnStart  = document.getElementById('btn-start');

        this._bindEvents();
        this._setupGraphicsGUI();
    }

    addMushroom(meshIdx) {
        this.inventory.push(meshIdx);
        this._render();
    }

    clear() {
        this.inventory = [];
        this._render();
    }

    closeOverlay() {
        this.overlay.classList.add('hidden');
    }

    openOverlay() {
        this.overlay.classList.remove('hidden');
    }

    _bindEvents() {
        
        this.clearBtn.addEventListener('click', () => {
            this.container.dispatchEvent(new CustomEvent('clear-inventory'));
        });
        this.btnHelp.addEventListener('click', () => { this.openOverlay(); });
        this.btnClose.addEventListener('click', () => { this.closeOverlay(); });
        this.btnStart.addEventListener('click', () => { this.closeOverlay(); });    
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.closeOverlay();
            }
        });
    }

    _render() {
        this.slotsEl.innerHTML = '';
        for (const meshIdx of this.inventory) {
            const img = document.createElement('img');
            img.src = this.MUSHROOM_IMAGES[meshIdx];
            img.className = 'mushroom-slot';
            this.slotsEl.appendChild(img);
        }

        this.clearBtn.disabled = this.inventory.length === 0;
    }

    updateFPS(fps) {
        if (this.fpsCounter) {
            this.fpsCounter.textContent = `FPS: ${fps}`;
        }
    }

    setFpsVisibility(visible) {
        if (this.fpsCounter) {
            this.fpsCounter.style.display = visible ? 'block' : 'none';
        }
    }

    _setupGraphicsGUI() {

        if (typeof dat === 'undefined' || !dat.GUI) {
            console.warn('dat.GUI non disponibile');
            return;
        }

        this.graphicsParams = {
            bumpMapping: true,
            alphaClipping: true,
            specularMapping: true,
            alphaThreshold: 0.9,
            bumpMapStrength: 3.5,
            showFPS: false,
        };

        const gui = new dat.GUI();
        const graphicsFolder = gui.addFolder('Graphics');

        graphicsFolder.add(this.graphicsParams, 'bumpMapping').name('Bump Mapping').onChange(() => {
                this.container.dispatchEvent(new CustomEvent('toggle-bump-mapping'));
        });

        graphicsFolder.add(this.graphicsParams, 'specularMapping').name('Specular Mapping').onChange(() => {
                this.container.dispatchEvent(new CustomEvent('toggle-specular-mapping'));
        });

        graphicsFolder.add(this.graphicsParams, 'alphaClipping').name('Alpha Clipping').onChange(() => {
                this.container.dispatchEvent(new CustomEvent('toggle-alpha-clipping'));
        });

        graphicsFolder.add(this.graphicsParams, 'alphaThreshold')
            .min(0)
            .max(1)
            .step(0.01)
            .name('Alpha Threshold')
            .onChange((value) => {
                this.container.dispatchEvent(new CustomEvent('set-alpha-threshold', { detail: { value } }));
            });

        graphicsFolder.add(this.graphicsParams, 'bumpMapStrength')
            .min(0)
            .max(8)
            .step(0.1)
            .name('Bump Strength')
            .onChange((value) => {
                this.container.dispatchEvent(new CustomEvent('set-bump-strength', { detail: { value } }));
            });

        graphicsFolder.add(this.graphicsParams, 'showFPS')
            .name('Show FPS')
            .onChange((value) => {
                this.container.dispatchEvent(new CustomEvent('set-fps-visibility', { detail: { visible: value } }));
            });

        graphicsFolder.close();
    }
}