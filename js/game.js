class Game {

    constructor(scene, forest, camera, ui) {
        this.scene = scene;
        this.forest = forest;
        this.camera = camera;
        this.ui = ui;
        this.inventory = []; 
    }   

    static MUSHROOM_TYPES = {
        0: 'red',
        1: 'purple',
        2: 'brown',
    };

    static SOUP_PREFERENCES = {
        red:    -2,  
        purple:  +1,  
        brown: +2,  
    };

    static COMBO_BONUSES = [
        { requires: ['red', 'brown', 'purple'], score: -3, label: 'disgusting' },
        { requires: ['brown', 'brown'],           score: +2, label: 'perfect' },
    ];

    getRayFromScreen(screenX, screenY, canvas) {

        const rect = canvas.getBoundingClientRect(); // Normalizza le coordinate dello schermo a [-1, 1]
        const localX = screenX - rect.left;
        const localY = screenY - rect.top;
        const ndcX = (localX / canvas.width) * 2 - 1;
        const ndcY = -(localY / canvas.height) * 2 + 1;

        const aspect = canvas.width / canvas.height;
        const vFOV = Math.PI / 3; // 60 gradi
        const tanHalfFOV = Math.tan(vFOV / 2);

        const rayDir = [
            this.camera.forward[0] + this.camera.right[0] * ndcX * aspect * tanHalfFOV + this.camera.up[0] * ndcY * tanHalfFOV,
            this.camera.forward[1] + this.camera.right[1] * ndcX * aspect * tanHalfFOV + this.camera.up[1] * ndcY * tanHalfFOV,
            this.camera.forward[2] + this.camera.right[2] * ndcX * aspect * tanHalfFOV + this.camera.up[2] * ndcY * tanHalfFOV,
        ];
        const rayDirNorm = m4.normalize(rayDir);

        return { origin: this.camera.position, direction: rayDirNorm };
    }

    onCanvasClick(screenX, screenY, canvas) {

        const ray = this.getRayFromScreen(screenX, screenY, canvas);
        const hitMushroomId = this.forest.raycastMushrooms(ray.origin, ray.direction);

        if (hitMushroomId !== null) {
            
            const mushType = this.forest.collectMushroom(hitMushroomId);
            if (mushType !== false) {
                this.inventory.push({ type: this.constructor.MUSHROOM_TYPES[mushType] });
                this.ui.addMushroom(mushType);
                console.log(`Fungo raccolto! ID: ${hitMushroomId}, Tipo: ${this.constructor.MUSHROOM_TYPES[mushType]}, Inventario: ${this.inventory.length}`);
            }
        }
        if (this.forest.isFireplaceClicked(ray.origin, ray.direction) && this.inventory.length >= 3) {

            const reaction = this.cookSoup();
            if (reaction)
                this.forest.setMouseAnimation(reaction);
            this.emptyInventory();
        }
    }

    emptyInventory() {
        this.inventory = [];
        this.ui.clear();
    }

    cookSoup() {
        console.log("Cucinando la zuppa...");

        let score = this.inventory.reduce((acc, item) => {
            const pref = this.constructor.SOUP_PREFERENCES[item.type] ?? 0;
            return acc + pref;
        }, 0);

        const types = new Set(this.inventory.map(item => item.type));
        for (const combo of this.constructor.COMBO_BONUSES) {
            if (combo.requires.every(t => types.has(t))) score += combo.score;
        }

        console.log(`Punteggio totale della zuppa: ${score}`);
        if (score >= 3)  return 'bounce';   
        if (score >= 0)  return 'nod';      
        return 'shake';    
    }

}