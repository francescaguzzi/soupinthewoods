class Camera {
    
    constructor(position = [0, 0, 0], target = [0, 0, 0], up = [0, 1, 0]) {
        
        this.minY = 0; // per evitare che la camera vada sotto il terreno
        this.target = target;

        // Calcola la distanza dalla camera al target (raggio dell'orbita).
        const toTarget = m4.subtractVectors(position, target);
        this.distance = Math.sqrt(toTarget[0] * toTarget[0] + toTarget[1] * toTarget[1] + toTarget[2] * toTarget[2]);

        this.theta = Math.atan2(toTarget[0], toTarget[2]);
        this.phi = Math.acos(toTarget[1] / this.distance);

        // Memorizza l'asse up globale per mantenere coerenza.
        this.upAxis = up;

        // Inizializza posizione, forward, right, up.
        this.position = position;
        this.forward = m4.normalize(m4.subtractVectors(target, position));
        this.right = m4.normalize(m4.cross(this.forward, up));
        this.up = m4.normalize(m4.cross(this.right, this.forward));
    }

    getPosition() {
        // Restituisce la posizione attuale della camera.
        return this.position;
    }

    getViewMatrix() {
        // Il punto verso cui stiamo guardando è il target.
        const cameraMatrix = m4.lookAt(this.position, this.target, this.upAxis);
        return m4.inverse(cameraMatrix);
    }

    orbit(deltaX, deltaY) {
        // Aggiorna gli angoli sferici in base al drag del mouse.
        this.theta -= deltaX * 0.01;
        this.phi += deltaY * 0.01;

        // Limita phi per evitare gimbal lock, rovesciamento e camera sotto il ground.
        const minPhi = 0.1;
        const maxPhiFromGround = Math.acos(Math.max(-1, Math.min(1, (this.minY - this.target[1]) / this.distance)));
        const maxPhi = Math.max(minPhi, Math.min(Math.PI - 0.1, maxPhiFromGround - 0.001));
        this.phi = Math.max(minPhi, Math.min(maxPhi, this.phi));

        // Calcola la nuova posizione sulla sfera attorno al target.
        const sinPhi = Math.sin(this.phi);
        const cosPhi = Math.cos(this.phi);
        const sinTheta = Math.sin(this.theta);
        const cosTheta = Math.cos(this.theta);

        this.position = [
            this.target[0] + this.distance * sinPhi * sinTheta,
            this.target[1] + this.distance * cosPhi,
            this.target[2] + this.distance * sinPhi * cosTheta,
        ];

        // Ricalcola i vettori locali della camera.
        this.forward = m4.normalize(m4.subtractVectors(this.target, this.position));
        this.right = m4.normalize(m4.cross(this.forward, this.upAxis));
        this.up = m4.normalize(m4.cross(this.right, this.forward));
    }

    zoom(deltaY) {
        // Sposta la camera lungo il forward: delta positivo = zoom out, negativo = zoom in.
        const amount = deltaY * 0.01;
        const direction = m4.normalize(this.forward);
        // Moltiplicazione manuale: moltiplica ogni componente del vettore per lo scalare.
        const displacement = [
            direction[0] * amount,
            direction[1] * amount,
            direction[2] * amount
        ];
        this.position = m4.addVectors(this.position, displacement);

        // Impedisce alla camera di andare sotto Y = 0.
        if (this.position[1] < this.minY) {
            this.position[1] = this.minY;
        }
        
        // Ricalcola la distanza dal target per mantenere il corretto zoom durante l'orbiting.
        const toTarget = m4.subtractVectors(this.position, this.target);
        this.distance = Math.sqrt(toTarget[0] * toTarget[0] + toTarget[1] * toTarget[1] + toTarget[2] * toTarget[2]);

        // Ricalcola anche gli angoli sferici e i vettori locali dal nuovo punto.
        this.theta = Math.atan2(toTarget[0], toTarget[2]);
        this.phi = Math.acos(Math.max(-1, Math.min(1, toTarget[1] / this.distance)));
        this.forward = m4.normalize(m4.subtractVectors(this.target, this.position));
        this.right = m4.normalize(m4.cross(this.forward, this.upAxis));
        this.up = m4.normalize(m4.cross(this.right, this.forward));
    }
}
