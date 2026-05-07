class Game {

    constructor(scene, forest, camera) {
        this.scene = scene;
        this.forest = forest;
        this.camera = camera;
        this.inventory = [];       // funghi raccolti
    }   

    static mushroomTypes = ['red', 'purple', 'brown']; // 1 rosso, 2 viola, 3 marrone

    getRayFromScreen(screenX, screenY, canvas) {
        // Normalizza le coordinate dello schermo a [-1, 1]
        const rect = canvas.getBoundingClientRect();
        const localX = screenX - rect.left;
        const localY = screenY - rect.top;
        const ndcX = (localX / canvas.width) * 2 - 1;
        const ndcY = -(localY / canvas.height) * 2 + 1;

        // FOV e aspect ratio
        const aspect = canvas.width / canvas.height;
        const vFOV = Math.PI / 3; // 60 gradi
        const tanHalfFOV = Math.tan(vFOV / 2);

        // Calcola la direzione del ray direttamente dai vettori della camera
        const rayDir = [
            this.camera.forward[0] + this.camera.right[0] * ndcX * aspect * tanHalfFOV + this.camera.up[0] * ndcY * tanHalfFOV,
            this.camera.forward[1] + this.camera.right[1] * ndcX * aspect * tanHalfFOV + this.camera.up[1] * ndcY * tanHalfFOV,
            this.camera.forward[2] + this.camera.right[2] * ndcX * aspect * tanHalfFOV + this.camera.up[2] * ndcY * tanHalfFOV,
        ];

        // Normalizza la direzione
        const rayDirNorm = m4.normalize(rayDir);

        return { origin: this.camera.position, direction: rayDirNorm };
    }

    onCanvasClick(screenX, screenY, canvas) {

        const ray = this.getRayFromScreen(screenX, screenY, canvas);
        const hitMushroomId = this.forest.raycastMushrooms(ray.origin, ray.direction);

        if (hitMushroomId !== null) {
            
            const mushType = this.forest.collectMushroom(hitMushroomId);
            if (mushType) {
                this.inventory.push({ type: mushType });
                console.log(`Fungo raccolto! ID: ${hitMushroomId}, Tipo: ${this.constructor.mushroomTypes[mushType]}, Inventario: ${this.inventory.length}`);
            }
        }
        if (this.forest.isFireplaceClicked(ray.origin, ray.direction) && this.inventory.length >= 4) {
            this.cookSoup();
        }
    }

    cookSoup() {
        // combinazioni possibili, ai topi può piacere o no:
        // 1 rosso + 1 viola = zuppa rosa -> no
        // 1 rosso + 1 marrone = zuppa arancione -> si
        // 1 viola + 1 marrone = zuppa viola -> no
        // 2 rossi = zuppa rossa -> no
        // 2 viola = zuppa blu -> si
        // 2 marroni = zuppa marrone  -> si
        console.log("Cucinando la zuppa...");


        const counts = { red: 0, purple: 0, brown: 0 };
        for (const item of this.inventory) {
            if (item.type === 0) counts.red++;
            else if (item.type === 1) counts.purple++;
            else if (item.type === 2) counts.brown++;
        }

        this.forest.setMouseAnimation("bounce");
    }

}