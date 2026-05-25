class Camera {
    
    constructor(position = [0, 0, 0], target = [0, 0, 0], up = [0, 1, 0]) {
        
        this.groundY = 0; // to prevent the camera from going under the ground
        this.minDistance = 2;   
        this.maxDistance = 25; 

        this.target = target;
        const toTarget = m4.subtractVectors(position, target);
        this.distance = Math.sqrt(toTarget[0] * toTarget[0] + toTarget[1] * toTarget[1] + toTarget[2] * toTarget[2]);

        this.theta = Math.atan2(toTarget[0], toTarget[2]);
        this.phi = Math.acos(toTarget[1] / this.distance);

        this.upAxis = up; // global up vector, used to maintain a consistent "up" direction for the camera

        this.position = position;
        this.forward = m4.normalize(m4.subtractVectors(target, position));
        this.right = m4.normalize(m4.cross(this.forward, up));
        this.up = m4.normalize(m4.cross(this.right, this.forward));
    }

    getPosition() {
        return this.position;
    }

    getViewMatrix() {
        const cameraMatrix = m4.lookAt(this.position, this.target, this.upAxis);
        return m4.inverse(cameraMatrix);
    }

    orbit(deltaX, deltaY) {
    
        this.theta -= deltaX * 0.01;
        this.phi += deltaY * 0.01;

        // prevent the camera from going under the ground or flipping over the top
        const minPhi = 0.1;
        const maxPhiFromGround = Math.acos(Math.max(-1, Math.min(1, (this.groundY - this.target[1]) / this.distance)));
        const maxPhi = Math.max(minPhi, Math.min(Math.PI - 0.1, maxPhiFromGround - 0.001));
        this.phi = Math.max(minPhi, Math.min(maxPhi, this.phi));

        const sinPhi = Math.sin(this.phi);
        const cosPhi = Math.cos(this.phi);
        const sinTheta = Math.sin(this.theta);
        const cosTheta = Math.cos(this.theta);

        this.position = [
            this.target[0] + this.distance * sinPhi * sinTheta,
            this.target[1] + this.distance * cosPhi,
            this.target[2] + this.distance * sinPhi * cosTheta,
        ];

        this.forward = m4.normalize(m4.subtractVectors(this.target, this.position));
        this.right = m4.normalize(m4.cross(this.forward, this.upAxis));
        this.up = m4.normalize(m4.cross(this.right, this.forward));
    }

    zoom(deltaY) {
        
        const amount = deltaY * 0.01;
        const direction = m4.normalize(this.forward);

        const displacement = [
            direction[0] * amount,
            direction[1] * amount,
            direction[2] * amount
        ];
        this.position = m4.addVectors(this.position, displacement);

        if (this.position[1] < this.groundY) {
            this.position[1] = this.groundY;
        }
    
        const toTarget = m4.subtractVectors(this.position, this.target);
        this.distance = Math.sqrt(toTarget[0] * toTarget[0] + toTarget[1] * toTarget[1] + toTarget[2] * toTarget[2]);
 
        if (this.distance < this.minDistance || this.distance > this.maxDistance) { // to prevent zooming too close or too far

            this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance));
            const normalized = m4.normalize(toTarget);
            this.position = [
                this.target[0] + normalized[0] * this.distance,
                this.target[1] + normalized[1] * this.distance,
                this.target[2] + normalized[2] * this.distance,
            ];
        }
        
        this.theta = Math.atan2(toTarget[0], toTarget[2]);
        this.phi = Math.acos(Math.max(-1, Math.min(1, toTarget[1] / this.distance)));
        this.forward = m4.normalize(m4.subtractVectors(this.target, this.position));
        this.right = m4.normalize(m4.cross(this.forward, this.upAxis));
        this.up = m4.normalize(m4.cross(this.right, this.forward));
    }
}
