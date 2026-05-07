class Forest {
    // Costruttore della classe Forest: gestisce il caricamento, costruzione e rendering di tutti i modelli di scena.
    constructor(gl, attribLocations, uniformLocations) {
        // Contesto WebGL2 per operazioni di rendering.
        this.gl = gl;
        // Locazioni dei vertex attribute (position, uv, instanceMatrix).
        this.attribLocations = attribLocations;
        // Locazioni delle uniform (view, projection, color, texture, alphaClip, etc).
        this.uniformLocations = uniformLocations;

        // Array di modelli, con renderables raggruppati per materiale.
        this.models = [];
        this.focusPoint = [0, 0, 0];
        
        this.fireScale = 1.0;
        this.fireMatrices = null;
    }

    async init() {

        const gl = this.gl;

        const groundData = await loadOBJModel(gl, 'assets/models/ground.obj', {
            textureBaseDir: 'assets/textures/ground/',
        });
        const fireData = await loadOBJModel(gl, 'assets/models/fireplace.obj', {
            textureBaseDir: 'assets/textures/fireplace/',
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

        // for (let i = 1; i <= 3; i++) {
        //     const mushroomData = await loadOBJModel(gl, `assets/models/mushrooms${i}.obj`, {
        //         textureBaseDir: 'assets/textures/mushrooms/',
        //     });
        // }

        const groundTopY = 0 // groundData.boundingBox.max[1];
        // this.focusPoint = bboxCenter(groundData.boundingBox);
        // this.focusPoint[1] = groundTopY;

        // NOTE: m4.translation(x, y, z) trasla rispetto all'ORIGINE GLOBALE (0, 0, 0)
        const groundMatrices = [m4.identity()];

        const fireMatrices = [
            m4.multiply(
                m4.translation(0, groundTopY, 0),
                m4.multiply(
                    m4.yRotation(90),
                    m4.scaling(1.0, 1.0, 1.0)
                )
            )
        ];

        const bigTreeMatrices = [
            m4.multiply(m4.translation(5, groundTopY, -6), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(7.8, groundTopY, -1), m4.multiply(m4.yRotation(30), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(-2.4, groundTopY, -8), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(-6, groundTopY, -6), m4.multiply(m4.yRotation(0.7), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(2.2, groundTopY, 7.7), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
        ];

        const smallTreeMatrices = [
            m4.multiply(m4.translation(6.5, groundTopY, -3), m4.multiply(m4.yRotation(15), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(1.2, groundTopY, -6), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(6.3, groundTopY, 2.8), m4.multiply(m4.yRotation(20), m4.scaling(1.0, 1.0, 1.0))), // bello a sinistra piccolo
            m4.multiply(m4.translation(-6.8, groundTopY, -0.5), m4.multiply(m4.yRotation(-1), m4.scaling(1.0, 1.0, 1.0))), 
            m4.multiply(m4.translation(-3.5, groundTopY, -4), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
        ];

        const rockMatrices = [
            m4.multiply(m4.translation(7.2, groundTopY, -6.7), m4.multiply(m4.yRotation(3.5), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(5.4, groundTopY, 6.3), m4.multiply(m4.yRotation(30), m4.scaling(0.6, 0.6, 0.6))),
            m4.multiply(m4.translation(-6.6, groundTopY, -3.8), m4.multiply(m4.yRotation(0), m4.scaling(0.6, 0.6, 0.6))),
        ];

        const bushMatrices = [
            m4.multiply(m4.translation(5, groundTopY, -5), m4.multiply(m4.yRotation(-0.5), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(5.4, groundTopY, 5.2), m4.multiply(m4.yRotation(-3), m4.scaling(1.1, 1.1, 1.1))),
            m4.multiply(m4.translation(-7.2, groundTopY, 0), m4.multiply(m4.yRotation(-0.5), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(2.5, groundTopY, 7.3), m4.multiply(m4.yRotation(1), m4.scaling(0.9, 0.9, 0.9))),
        ];

        const mouseMatrices = [
            m4.multiply(m4.translation(2, groundTopY, 2), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(-2, groundTopY, -2), m4.multiply(m4.yRotation(180), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(3, groundTopY, -3), m4.multiply(m4.yRotation(45), m4.scaling(0.8, 0.8, 0.8))),
        ];

        this.fireMatrices = fireMatrices;
        this.fireModel = buildModel(gl, fireData, fireMatrices, this.attribLocations); // Salva il modello del focolare per l'animazione del fuoco

        this.models = [
            buildModel(gl, groundData, groundMatrices, this.attribLocations),
            this.fireModel,
            buildModel(gl, bigTreeData, bigTreeMatrices, this.attribLocations),
            buildModel(gl, smallTreeData, smallTreeMatrices, this.attribLocations),
            buildModel(gl, rockData, rockMatrices, this.attribLocations),
            buildModel(gl, bushData, bushMatrices, this.attribLocations),
            buildModel(gl, mouseData, mouseMatrices, this.attribLocations),
        ];
    }

    setFireScale(scale) {
        this.fireScale = Math.max(0.1, scale);
    }

    render(viewMatrix, projectionMatrix) {
        // Esegue il rendering di tutti i modelli e le loro istanze.
        const gl = this.gl;
        const { uniformLocations } = this;

        // Imposta le matrici uniforme che vengono usate da TUTTI i vertici.
        gl.uniformMatrix4fv(uniformLocations.view, false, viewMatrix);
        gl.uniformMatrix4fv(uniformLocations.projection, false, projectionMatrix);

        // Itera tutti i modelli (terreno, fuoco, alberi, rocce).
        for (let modelIdx = 0; modelIdx < this.models.length; modelIdx++) {
            const model = this.models[modelIdx];
            
            // Itera tutti i renderables di questo modello (uno per materiale).
            for (const renderable of model.renderables) {
                // Se è il materiale 'Fire' del focolare, aggiorna le matrici istanza scalate.
                if (model === this.fireModel && renderable.materialName === 'Fire' && this.fireMatrices && renderable.instanceBuffer) {
                    // Calcola le matrici scalate del focolare.
                    const scaledMatrices = this.fireMatrices.map(m => 
                        m4.multiply(m, m4.scaling(this.fireScale, this.fireScale, this.fireScale))
                    );
                    // Flattena le matrici in un unico array.
                    const flatMatrices = new Float32Array(scaledMatrices.length * 16);
                    for (let i = 0; i < scaledMatrices.length; i++) {
                        flatMatrices.set(scaledMatrices[i], i * 16);
                    }
                    // Aggiorna il buffer istanza con le matrici scalate.
                    gl.bindBuffer(gl.ARRAY_BUFFER, renderable.instanceBuffer);
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, flatMatrices);
                }
                
                // Associa il VAO di questo materiale.
                gl.bindVertexArray(renderable.vao);
                // Imposta il colore base del materiale (RGB + alpha=1).
                gl.uniform4fv(uniformLocations.color, [...renderable.color, 1.0]);
                // Abilita/disabilita il campionamento delle texture.
                gl.uniform1i(uniformLocations.useTexture, renderable.useTexture ? 1 : 0);
                // Abilita/disabilita alpha clipping (per le foglie trasparenti).
                gl.uniform1i(uniformLocations.alphaClip, renderable.alphaClip ? 1 : 0);
                // Threshold per il discardamento dei pixel nel fragment shader.
                gl.uniform1f(uniformLocations.alphaThreshold, renderable.alphaThreshold ?? 0.5);

                // Associa la texture del materiale se presente.
                if (renderable.texture) {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, renderable.texture);
                } else {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, null);
                }

                // Informa il fragment shader su quale sampler leggere la texture.
                gl.uniform1i(uniformLocations.textureSampler, 0);
                // Esegue il draw instanced: disegna il triangolo per ogni istanza.
                gl.drawArraysInstanced(gl.TRIANGLES, 0, renderable.vertexCount, renderable.instanceCount);
            }
        }

        gl.bindVertexArray(null);
    }
}