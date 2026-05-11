class UI {
    constructor() {
        this.inventory = [];

        this.MUSHROOM_IMAGES = {
            0: 'assets/ui/fungo-rosso.PNG',
            1: 'assets/ui/fungo-viola.PNG',
            2: 'assets/ui/fungo-marrone.PNG',
        };

        this._buildDOM();
        this._bindEvents();
    }

    _buildDOM() {
        // Contenitore principale
        this.container = document.createElement('div');
        this.container.id = 'ui-container';
        this.container.innerHTML = `
            <div id="controls">
                <button id="btn-normal-mapping" title="Attiva/disattiva Normal Mapping (N)">Normal Mapping</button>
            </div>
            <div id="inventory">
                <div id="inventory-slots"></div>
                <button id="btn-clear">Svuota inventario</button>
            </div>
        `;
        document.body.appendChild(this.container);

        this.slotsEl = document.getElementById('inventory-slots');
        this.clearBtn = document.getElementById('btn-clear');
        this.normalMappingBtn = document.getElementById('btn-normal-mapping');
    }

    _bindEvents() {
        this.clearBtn.addEventListener('click', () => {
            this.container.dispatchEvent(new CustomEvent('clear-inventory'));
        });
        
        this.normalMappingBtn.addEventListener('click', () => {
            this.container.dispatchEvent(new CustomEvent('toggle-normal-mapping'));
        });
    }

    addMushroom(meshIdx) {
        this.inventory.push(meshIdx);
        this._render();
    }

    clear() {
        this.inventory = [];
        this._render();
    }

    _render() {
        this.slotsEl.innerHTML = '';
        for (const meshIdx of this.inventory) {
            const img = document.createElement('img');
            img.src = this.MUSHROOM_IMAGES[meshIdx];
            img.className = 'mushroom-slot';
            this.slotsEl.appendChild(img);
        }
        // Disabilita il bottone se l'inventario è vuoto
        this.clearBtn.disabled = this.inventory.length === 0;
    }
}