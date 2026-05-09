class Forest {
    
    constructor(gl, attribLocations, uniformLocations) {

        this.gl = gl;
        this.attribLocations = attribLocations; // vertex attribute (position, uv, instanceMatrix).
        this.uniformLocations = uniformLocations; // (view, projection, color, texture, alphaClip, etc).

        this.models = []; // Array di modelli, con renderables raggruppati per materiale.
        
        this.groundTopY = 0; 

        this.fireScale = 1.0;
        this.fireMatrices = null;
        this.fireData = null;
        this.fireModel = null;

        this.mushroomData = [];
        this.spawnedMushrooms = [];
        this.nextMushroomID = 0;
        this.MAX_MUSHROOMS = 6;
        this.RESPAWN_THRESHOLD = 2; 

        this.mouseAnimation = null;
        this.mouseAnimationProgress = 0; // Progresso 0-1
        this.mouseAnimationDuration = 800; // Durata dell'animazione in ms
        this.mouseMatrices = null;
        this.originalMouseMatrices = null; 
        this.mouseModel = null;
    }

    /* ------------------------------------------ */

    _randomMushroomMatrix() {
        const angle = Math.random() * Math.PI * 2;
        const radius = 5 + Math.random() * 5;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const rotY = Math.random() * Math.PI * 2;
        // const scale = 0.7 + Math.random() * 0.6;
        return m4.multiply(
            m4.translation(x, this.groundTopY, z),
            m4.multiply(m4.yRotation(rotY), m4.scaling(1, 1, 1))
        );
    }

    _spawnMushroom() {
        if (this.spawnedMushrooms.length >= this.MAX_MUSHROOMS) return;

        const meshIdx = Math.floor(Math.random() * 3);
        const matrix = this._randomMushroomMatrix();
        this.spawnedMushrooms.push({ 
            id: this.nextMushroomID++, 
            meshIdx, 
            matrix,
            sphere: this.mushroomData[meshIdx].boundingSphere,
            collected: false,
        });
    }

    _initMushroomModels() {
        // Crea un modello per ogni tipo di mesh con MAX_MUSHROOMS istanze placeholder
        // Usiamo matrici di scala zero per "nascondere" le istanze inutilizzate
        const hiddenMatrix = m4.scaling(0, 0, 0);
        const placeholderMatrices = Array(this.MAX_MUSHROOMS).fill(hiddenMatrix);

        for (let i = 0; i < 3; i++) {
            const model = buildModel(this.gl, this.mushroomData[i], placeholderMatrices, this.attribLocations);
            model._isMushroom = true;
            this.mushroomModelsByMesh[i] = model;
            this.models.push(model);
        }

        // Carica le matrici reali iniziali
        this._uploadAllMushroomMatrices();
    }

    _uploadAllMushroomMatrices() {
        const gl = this.gl;
        const hiddenMatrix = m4.scaling(0, 0, 0);

        for (let meshIdx = 0; meshIdx < 3; meshIdx++) {
            const model = this.mushroomModelsByMesh[meshIdx];
            if (!model) continue;

            // Raccoglie le matrici attive per questo tipo di mesh
            const activeMatrices = this.spawnedMushrooms
                .filter(s => !s.collected && s.meshIdx === meshIdx)
                .map(s => s.matrix);

            // Riempie fino a MAX_MUSHROOMS con matrici nascoste
            const flat = new Float32Array(this.MAX_MUSHROOMS * 16);
            for (let i = 0; i < this.MAX_MUSHROOMS; i++) {
                const mat = activeMatrices[i] ?? hiddenMatrix;
                flat.set(mat, i * 16);
            }

            // Aggiorna il buffer senza ricreare il VAO
            for (const renderable of model.renderables) {
                if (!renderable.instanceBuffer) continue;
                gl.bindBuffer(gl.ARRAY_BUFFER, renderable.instanceBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, flat);
            }

            // Aggiorna instanceCount per non disegnare istanze nascoste inutilmente
            const activeCount = Math.max(1, activeMatrices.length);
            for (const renderable of model.renderables) {
                renderable.instanceCount = activeCount;
            }
        }
    }

    collectMushroom(mushroomId) {
        const shroom = this.spawnedMushrooms.find(s => s.id === mushroomId);
        if (!shroom || shroom.collected) return false;
        
        shroom.collected = true;

        const active = this.spawnedMushrooms.filter(s => !s.collected).length;

        if (active <= this.RESPAWN_THRESHOLD) {
            const toSpawn = this.MAX_MUSHROOMS - active;
            for (let i = 0; i < toSpawn; i++) this._spawnMushroom();
        }

        this.spawnedMushrooms = this.spawnedMushrooms.filter(s => !s.collected); // puliamo memoria 
        this._uploadAllMushroomMatrices();
        return shroom.meshIdx;
    }

    raycastMushrooms(rayOrigin, rayDir) {
        for (const shroom of this.spawnedMushrooms) {
            if (shroom.collected) continue;
            
            if (raySphereIntersect(rayOrigin, rayDir, shroom.sphere, shroom.matrix)) {
                return shroom.id;
            }
        }
        return null;
    }

    /* ------------------------------------------ */

    setFireScale(scale) {
        this.fireScale = Math.max(0.1, scale);
        this._uploadFireMatrices();
    }

    _uploadFireMatrices() {
        if (!this.fireModel || !this.fireMatrices) return;
        const flat = new Float32Array(this.fireMatrices.length * 16);
        for (let i = 0; i < this.fireMatrices.length; i++) {
            flat.set(m4.multiply(this.fireMatrices[i], m4.scaling(this.fireScale, this.fireScale, this.fireScale)), i * 16);
        }
        for (const renderable of this.fireModel.renderables) {
            if (renderable.materialName !== 'Fire' || !renderable.instanceBuffer) continue;
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderable.instanceBuffer);
            this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, flat);
        }
    }

    isFireplaceClicked(rayOrigin, rayDir) {
        const fireSphere = this.fireData.boundingSphere;
        const fireMatrix = this.fireMatrices[0];
        return raySphereIntersect(rayOrigin, rayDir, fireSphere, fireMatrix);
    }

    /* ------------------------------------------ */

    setMouseAnimation(type) {
        this.mouseAnimation = type;
        this.mouseAnimationProgress = 0;
    }

    updateMouseAnimation(deltaTime) {
        if (!this.mouseAnimation) return;

        this.mouseAnimationProgress += deltaTime / this.mouseAnimationDuration;
        
        const ended = this.mouseAnimationProgress >= 1.0;
        if (ended) {
            this.mouseAnimation = null;
            this.mouseAnimationProgress = 0;
            this.mouseMatrices = this.originalMouseMatrices.map(m => [...m]);
        } else {
            this.mouseMatrices = this._getAnimatedMouseMatrices();
        }

        // Aggiorna il buffer solo quando necessario
        this._uploadMouseMatrices();
    }

    _uploadMouseMatrices() {
        if (!this.mouseModel) return;
        const flat = new Float32Array(this.mouseMatrices.length * 16);
        for (let i = 0; i < this.mouseMatrices.length; i++) flat.set(this.mouseMatrices[i], i * 16);
        for (const renderable of this.mouseModel.renderables) {
            if (!renderable.instanceBuffer) continue;
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderable.instanceBuffer);
            this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, flat);
        }
    }

    _getAnimatedMouseMatrices() {
        if (!this.mouseAnimation) {
            return this.originalMouseMatrices;
        }

        const t = this.mouseAnimationProgress * Math.PI * 2; // progresso da 0 a 2π per due bounce completi

        if (this.mouseAnimation === 'bounce') { // approvazione
            return this.originalMouseMatrices.map(originalMatrix => {
                const bounceAmount = Math.abs(Math.sin(t)) * 0.5; // due bounce consecutivi usando abs(sin)
                const bounceMatrix = m4.translation(0, bounceAmount, 0);
                return m4.multiply(originalMatrix, bounceMatrix);
            });
        } else if (this.mouseAnimation === 'nod') { // disapprovazione lieve
            return this.originalMouseMatrices.map(originalMatrix => {
                const nodAmount = Math.sin(t * 2) * 0.3; 
                const nodMatrix = m4.yRotation(nodAmount);
                return m4.multiply(originalMatrix, nodMatrix);
            });
        } else if (this.mouseAnimation === 'shake') { // rifiuto
            return this.originalMouseMatrices.map(originalMatrix => {
                const damping = 1 - this.mouseAnimationProgress; // per smorzare verso la fine dell'animazione
                const shakeAmount = Math.sin(t * 4) * 0.4 * damping; 
                const shakeMatrix = m4.translation(0, 0, shakeAmount);
                return m4.multiply(originalMatrix, shakeMatrix);
            });
        }
        return this.originalMouseMatrices;
    }

    // setSoupColor(r, g, b) {
    //     if (!this.fireModel) return;

    //     for (const renderable of this.fireModel.renderables) {
    //         if (renderable.materialName === 'Soup') { 
    //             renderable.color = [r, g, b];
    //         }
    //     }
    // }

    /* ------------------------------------------ */

    async init() {

        const gl = this.gl;

        const groundData = await loadOBJModel(gl, 'assets/models/ground.obj', {
            textureBaseDir: 'assets/textures/ground/',
        });
        this.fireData = await loadOBJModel(gl, 'assets/models/fireplace.obj', {
            textureBaseDir: 'assets/textures/fireplace/',
            computeBoundingSphere: true,
        });
        const bigTreeData = await loadOBJModel(gl, 'assets/models/big-tree.obj', {
            textureBaseDir: 'assets/textures/tree/',
        });
        const smallTreeData = await loadOBJModel(gl, 'assets/models/small-tree.obj', {
            textureBaseDir: 'assets/textures/tree/',
        });
        const bushData = await loadOBJModel(gl, 'assets/models/bush.obj', {
            textureBaseDir: 'assets/textures/tree/',
        });
        const rockData = await loadOBJModel(gl, 'assets/models/rock.obj', {
            textureBaseDir: 'assets/textures/',
        });

        const mouseData = await loadOBJModel(gl, 'assets/models/mouse.obj', {
            textureBaseDir: 'assets/textures/',
        });

        const polaroidData = await loadOBJModel(gl, 'assets/models/polaroid.obj', {
            textureBaseDir: 'assets/textures/',
        });

        for (let i = 1; i <= 3; i++) {
            this.mushroomData[i - 1] = await loadOBJModel(gl, `assets/models/mushrooms${i}.obj`, {
                textureBaseDir: 'assets/textures/mushrooms/',
                computeBoundingSphere: true,
            });
        }

        const groundMatrices = [m4.identity()];

        const fireMatrices = [
            m4.multiply(
                m4.translation(0, this.groundTopY, 0),
                m4.multiply(
                    m4.yRotation(90),
                    m4.scaling(1.0, 1.0, 1.0)
                )
            )
        ];

        const bigTreeMatrices = [
            m4.multiply(m4.translation(5, this.groundTopY, -6), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(7.8, this.groundTopY, -1), m4.multiply(m4.yRotation(30), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(-2.4, this.groundTopY, -8), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(-6, this.groundTopY, -6), m4.multiply(m4.yRotation(0.7), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(2.2, this.groundTopY, 7.7), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
        ];

        const smallTreeMatrices = [
            m4.multiply(m4.translation(6.5, this.groundTopY, -3), m4.multiply(m4.yRotation(15), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(1.2, this.groundTopY, -6), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(6.3, this.groundTopY, 2.8), m4.multiply(m4.yRotation(20), m4.scaling(1.0, 1.0, 1.0))), // bello a sinistra piccolo
            m4.multiply(m4.translation(-6.8, this.groundTopY, -0.5), m4.multiply(m4.yRotation(-1), m4.scaling(1.0, 1.0, 1.0))), 
            m4.multiply(m4.translation(-3.5, this.groundTopY, -4), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
        ];

        const rockMatrices = [
            m4.multiply(m4.translation(7.2, this.groundTopY, -6.7), m4.multiply(m4.yRotation(3.5), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(5.4, this.groundTopY, 6.3), m4.multiply(m4.yRotation(30), m4.scaling(0.6, 0.6, 0.6))),
            m4.multiply(m4.translation(-6.6, this.groundTopY, -3.8), m4.multiply(m4.yRotation(0), m4.scaling(0.6, 0.6, 0.6))),
        ];

        const bushMatrices = [
            m4.multiply(m4.translation(5, this.groundTopY, -5), m4.multiply(m4.yRotation(-0.5), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(5.4, this.groundTopY, 5.2), m4.multiply(m4.yRotation(-3), m4.scaling(1.1, 1.1, 1.1))),
            m4.multiply(m4.translation(-7.2, this.groundTopY, 0), m4.multiply(m4.yRotation(-0.5), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(2.5, this.groundTopY, 7.3), m4.multiply(m4.yRotation(1), m4.scaling(0.9, 0.9, 0.9))),
        ];

        const mouseMatrices = [
            m4.multiply(m4.translation(2, this.groundTopY, 0.3), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(-2.5, this.groundTopY, -1), m4.multiply(m4.yRotation(160), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(2, this.groundTopY, -2), m4.multiply(m4.yRotation(45), m4.scaling(0.8, 0.8, 0.8))),
        ];

        const polaroidMatrices = [
            m4.multiply(m4.translation(5, this.groundTopY, 0), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
        ];

        this.fireMatrices = fireMatrices;
        this.mouseMatrices = mouseMatrices;
        this.originalMouseMatrices = mouseMatrices.map(m => [...m]); // deep copy per le matrici originali

        this.models = [
            buildModel(gl, groundData, groundMatrices, this.attribLocations),
            this.fireModel = buildModel(gl, this.fireData, fireMatrices, this.attribLocations), 
            buildModel(gl, bigTreeData, bigTreeMatrices, this.attribLocations),
            buildModel(gl, smallTreeData, smallTreeMatrices, this.attribLocations),
            buildModel(gl, rockData, rockMatrices, this.attribLocations),
            buildModel(gl, bushData, bushMatrices, this.attribLocations),
            buildModel(gl, polaroidData, polaroidMatrices, this.attribLocations),
            this.mouseModel = buildModel(gl, mouseData, mouseMatrices, this.attribLocations),
        ];

        for (let i = 0; i < this.MAX_MUSHROOMS; i++) {
            this._spawnMushroom();
        }

        this.mushroomModelsByMesh = [null, null, null];
        this._initMushroomModels();
    }

    render(viewMatrix, projectionMatrix) {

        const gl = this.gl;
        const { uniformLocations } = this;
        // Imposta le matrici uniform che vengono usate da TUTTI i vertici
        gl.uniformMatrix4fv(uniformLocations.view, false, viewMatrix);
        gl.uniformMatrix4fv(uniformLocations.projection, false, projectionMatrix);

        for (let modelIdx = 0; modelIdx < this.models.length; modelIdx++) {
        
            const model = this.models[modelIdx];
            for (const renderable of model.renderables) {

                gl.bindVertexArray(renderable.vao);  // Associa il VAO di questo materiale.
                gl.uniform4fv(uniformLocations.color, [...renderable.color, 1.0]); // Imposta il colore base del materiale (RGB + alpha=1).
                gl.uniform1i(uniformLocations.useTexture, renderable.useTexture ? 1 : 0); // Abilita/disabilita il campionamento delle texture.
                gl.uniform1i(uniformLocations.alphaClip, renderable.alphaClip ? 1 : 0); // Abilita/disabilita alpha clipping (per le foglie trasparenti).
                gl.uniform1f(uniformLocations.alphaThreshold, renderable.alphaThreshold ?? 0.5); 

                if (renderable.texture) {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, renderable.texture);
                } else {
                    gl.bindTexture(gl.TEXTURE_2D, null);
                }
                gl.uniform1i(uniformLocations.textureSampler, 0); // Informa il fragment shader su quale sampler leggere la texture.
                gl.drawArraysInstanced(gl.TRIANGLES, 0, renderable.vertexCount, renderable.instanceCount); // Istanced rendering
            }
            gl.bindVertexArray(null); // Pulisci il VAO dopo ogni modello
        }
    }
}