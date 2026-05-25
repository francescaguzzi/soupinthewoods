class Forest {
    
    constructor(gl, attribLocations, uniformLocations) {

        this.gl = gl;
        this.attribLocations = attribLocations; // vertex attribute (position, uv, instanceMatrix).
        this.uniformLocations = uniformLocations; // (view, projection, color, texture, alphaClip, etc)

        this.models = []; // models array with renderable grouped by material
        
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
        this.mouseAnimationProgress = 0; // 0-1 progress for current animation
        this.mouseAnimationDuration = 800; // ms
        this.mouseMatrices = null;
        this.originalMouseMatrices = null; 
        this.mouseModel = null;

        this.bumpMappingEnabled = true;
        this.bumpMapStrength = 3.5; 
        this.specularMappingEnabled = true; 
        this.alphaClippingEnabled = true;
        this.alphaThreshold = 0.9;
    }

    toggleBumpMapping() {
        this.bumpMappingEnabled = !this.bumpMappingEnabled;
        return this.bumpMappingEnabled;
    }

    setBumpMapStrength(strength) {
        this.bumpMapStrength = strength;
    }

    toggleSpecularMapping() {
        this.specularMappingEnabled = !this.specularMappingEnabled;
        return this.specularMappingEnabled;
    }

    toggleAlphaClipping() {
        this.alphaClippingEnabled = !this.alphaClippingEnabled;
        return this.alphaClippingEnabled;
    }

    setAlphaThreshold(threshold) {
        this.alphaThreshold = threshold;
    }

    /* ------------------------------------------ */

    _randomMushroomMatrix() {
        const angle = Math.random() * Math.PI * 2;
        const radius = 5 + Math.random() * 5;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const rotY = Math.random() * Math.PI * 2;

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

    // placeholder matrixes are used to avoid creating/destroying VAO everytime
    // when a mushroom is collected, we mark it as collected and respawn if needed, 
    // but we only update the instance buffer with new matrixes, without changing 
    // the VAO or instance count (we just set instance count to MAX_MUSHROOMS and 
    // use a hidden matrix for collected mushrooms)
    _initMushroomModels() {
        const hiddenMatrix = m4.scaling(0, 0, 0); 
        const placeholderMatrices = Array(this.MAX_MUSHROOMS).fill(hiddenMatrix); 

        for (let i = 0; i < 3; i++) {
            const model = buildModel(this.gl, this.mushroomData[i], placeholderMatrices, this.attribLocations);
            model._isMushroom = true;
            this.mushroomModelsByMesh[i] = model;
            this.models.push(model);
        }
        this._uploadAllMushroomMatrices();
    }

    _uploadAllMushroomMatrices() {
        const gl = this.gl;
        const hiddenMatrix = m4.scaling(0, 0, 0);

        for (let meshIdx = 0; meshIdx < 3; meshIdx++) { // random meshes for mushrooms (3 types)
            const model = this.mushroomModelsByMesh[meshIdx];
            if (!model) continue;

            const activeMatrices = this.spawnedMushrooms
                .filter(s => !s.collected && s.meshIdx === meshIdx)
                .map(s => s.matrix);

            const flat = new Float32Array(this.MAX_MUSHROOMS * 16);
            for (let i = 0; i < this.MAX_MUSHROOMS; i++) {
                const mat = activeMatrices[i] ?? hiddenMatrix;
                flat.set(mat, i * 16);
            }
            // updates the instance buffer without changing VAO
            for (const renderable of model.renderables) { 
                if (!renderable.instanceBuffer) continue;
                gl.bindBuffer(gl.ARRAY_BUFFER, renderable.instanceBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, flat);
            }
            // updates instance count to avoid rendering empty buffer, but at least 1 to keep VAO valid
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

        this.spawnedMushrooms = this.spawnedMushrooms.filter(s => !s.collected);
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

    // Uploads fire instance matrices to GPU buffer with applied scale transformation
    // it multiplies each fire matrix by the current fireScale to dynamically resize all fire instances
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
            this.mouseMatrices = this.originalMouseMatrices.map(m => [...m]); // reset to original matrices
        } else {
            // get current animated matrices based on progress and animation type
            this.mouseMatrices = this._getAnimatedMouseMatrices(); 
        }
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
        // progress mapped to 0-2PI for smooth looping
        const t = this.mouseAnimationProgress * Math.PI * 2; 

        if (this.mouseAnimation === 'bounce') { // approval
            return this.originalMouseMatrices.map(originalMatrix => {
                const bounceAmount = Math.abs(Math.sin(t)) * 0.5; // abs(sin) for two bounces per cycle
                const bounceMatrix = m4.translation(0, bounceAmount, 0);
                return m4.multiply(originalMatrix, bounceMatrix);
            });
        } else if (this.mouseAnimation === 'nod') { // disapproval
            return this.originalMouseMatrices.map(originalMatrix => {
                const nodAmount = Math.sin(t * 2) * 0.3; 
                const nodMatrix = m4.yRotation(nodAmount);
                return m4.multiply(originalMatrix, nodMatrix);
            });
        } else if (this.mouseAnimation === 'shake') { // disgust
            return this.originalMouseMatrices.map(originalMatrix => {
                const damping = 1 - this.mouseAnimationProgress; // damping effect to gradually reduce shake
                const shakeAmount = Math.sin(t * 4) * 0.4 * damping; 
                const shakeMatrix = m4.translation(0, 0, shakeAmount);
                return m4.multiply(originalMatrix, shakeMatrix);
            });
        }
        return this.originalMouseMatrices;
    }

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
                    m4.yRotation(0),
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
            m4.multiply(m4.translation(6.3, this.groundTopY, 2.8), m4.multiply(m4.yRotation(20), m4.scaling(1.0, 1.0, 1.0))), 
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
            m4.multiply(
                m4.translation(-3.25, 1.4, -3.85),  // X, Z, -Y di Blender
                m4.multiply(m4.xRotation(degToRad(20)),
                    m4.multiply(m4.zRotation(degToRad(-80)), // Y di Blender -> Z di WebGL
                                m4.yRotation(degToRad(150)))))   // Z di Blender -> Y di WebGL
        ];

        this.fireMatrices = fireMatrices;
        this.mouseMatrices = mouseMatrices;
        this.originalMouseMatrices = mouseMatrices.map(m => [...m]); // deep copy for animation reset

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

        this.mushroomModelsByMesh = [null, null, null]; // placeholder for mushroom models indexed by mesh type
        this._initMushroomModels();
    }

    render(viewMatrix, projectionMatrix) {

        const gl = this.gl;
        const { uniformLocations } = this;
        // uniform matrices used by all models, so we set them once per frame here before rendering any model
        gl.uniformMatrix4fv(uniformLocations.view, false, viewMatrix);
        gl.uniformMatrix4fv(uniformLocations.projection, false, projectionMatrix);

        for (let modelIdx = 0; modelIdx < this.models.length; modelIdx++) {
        
            const model = this.models[modelIdx];
            for (const renderable of model.renderables) {

                gl.bindVertexArray(renderable.vao);  
                gl.uniform4fv(uniformLocations.color, [...renderable.color, 1.0]); // base material color
                gl.uniform3fv(uniformLocations.specularColor, renderable.specularColor || [0.5, 0.5, 0.5]); 
                gl.uniform1i(uniformLocations.useTexture, renderable.useTexture ? 1 : 0); 
                gl.uniform1i(uniformLocations.useBumpMap, (renderable.useBumpMap && this.bumpMappingEnabled) ? 1 : 0); 
                gl.uniform1i(uniformLocations.useSpecularMap, (renderable.useSpecularMap && this.specularMappingEnabled) ? 1 : 0); 
                gl.uniform1i(uniformLocations.alphaClip, this.alphaClippingEnabled ? 1 : 0); 
                gl.uniform1f(uniformLocations.alphaThreshold, this.alphaThreshold); 

                if (renderable.texture) {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, renderable.texture);
                } else {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, null);
                }

                // Bind bump map on TEXTURE2 and specular map on TEXTURE1 to avoid conflicts (diffuse is on 0)
                if (renderable.bumpTexture && renderable.useBumpMap && this.bumpMappingEnabled) {
                    gl.activeTexture(gl.TEXTURE2);
                    gl.bindTexture(gl.TEXTURE_2D, renderable.bumpTexture);
                    gl.uniform1i(uniformLocations.bumpMapSampler, 2);
                    gl.uniform2fv(uniformLocations.bumpMapSize, renderable.bumpMapSize);
                    gl.uniform1f(uniformLocations.bumpMapStrength, this.bumpMapStrength);
                } else {
                    gl.activeTexture(gl.TEXTURE2);
                    gl.bindTexture(gl.TEXTURE_2D, null);
                }

                if (renderable.specularTexture && renderable.useSpecularMap && this.specularMappingEnabled) {
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, renderable.specularTexture);
                    gl.uniform1i(uniformLocations.specularMapSampler, 1);
                } else {
                    gl.activeTexture(gl.TEXTURE1);
                    gl.bindTexture(gl.TEXTURE_2D, null);
                }
                
                gl.uniform1i(uniformLocations.textureSampler, 0); // diffuse texture always on slot 0
                gl.drawArraysInstanced(gl.TRIANGLES, 0, renderable.vertexCount, renderable.instanceCount); // Istanced rendering
            }
            gl.bindVertexArray(null); // Pulisci il VAO dopo ogni modello
        }
    }
}