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

        // Punto centrale della scena (usato dalla camera per orbiting).
        this.focusPoint = [0, 0, 0];
        
        // dimensioni del fuoco (animazione)
        this.fireScale = 1.0;
        // Matrici istanza originali del focolare (memorizzate per poter scalare al runtime).
        this.fireMatrices = null;
        // Riferimento al buffer istanza del focolare per aggiornarlo al runtime.
        this.fireInstanceBuffer = null;
    }

    async init() {
        const gl = this.gl;

        // Carica il terreno (ground) dal file OBJ con il suo materiale principale.
        const groundData = await loadOBJModel(gl, 'assets/models/ground.obj', {
            preferredMaterialName: 'Ground',
            textureBaseDir: 'assets/textures/ground/',
        });

        const fireData = await loadOBJModel(gl, 'assets/models/fireplace.obj', {
            preferredMaterialName: 'Fire',
            textureBaseDir: 'assets/textures/fireplace/',
        });

        // Carica un albero grande come template per le istanze multiple.
        const bigTreeData = await loadOBJModel(gl, 'assets/models/big-tree.obj', {
            preferredMaterialName: 'leave-dark',
            textureBaseDir: 'assets/textures/tree/',
        });

        const smallTreeData = await loadOBJModel(gl, 'assets/models/small-tree.obj', {
            preferredMaterialName: 'leave-dark',
            textureBaseDir: 'assets/textures/tree/',
        });

        const bushData = await loadOBJModel(gl, 'assets/models/bush.obj', {
            preferredMaterialName: 'bush',
            textureBaseDir: 'assets/textures/tree/',
        });

        // Carica le rocce come elementi decorativi.
        const rockData = await loadOBJModel(gl, 'assets/models/rock.obj', {
            preferredMaterialName: 'lambert2',
            textureBaseDir: 'assets/textures/',
        });


        // Calcola l'altezza del terreno dal suo bounding box.
        const groundTopY = groundData.boundingBox.max[1];
        // Imposta il focus point al centro del terreno, sulla sua superficie.
        this.focusPoint = bboxCenter(groundData.boundingBox);
        this.focusPoint[1] = groundTopY;

        // ========== CONFIGURAZIONE MANUALE MATRICI ==========
        // Modifica questi valori direttamente per cambiare scale, posizione, rotazione.
        // Formato: m4.multiply(traslazione, m4.multiply(rotazione, scala))
        // NOTE: m4.translation(x, y, z) trasla rispetto all'ORIGINE GLOBALE (0, 0, 0)
        // Il focolare è posizionato a (0, groundTopY, 0), quindi gli alberi dovrebbero
        // avere coordinate x, z relative a questo punto (ad esempio -5, 5 lo mette a sinistra-dietro)
        
        // Terreno: identità (nessuna trasformazione)
        const groundMatrices = [m4.identity()];

        // Focolare: posizione (0, groundTopY, 0), scala 1.0 base (controllata da fireScale), rotazione 0
        const fireMatrices = [
            m4.multiply(
                m4.translation(0, groundTopY, 0),
                m4.multiply(
                    m4.yRotation(90),
                    m4.scaling(1.0, 1.0, 1.0)
                )
            )
        ];

        // Alberi: 6 istanze sparse naturalmente attorno al focolare (0, 0)
        // Posizioni relative al focolare per una distribuzione circolare
        const bigTreeMatrices = [
            m4.multiply(m4.translation(-8, groundTopY, 0), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(-2, groundTopY, 0), m4.multiply(m4.yRotation(1.5), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(1, groundTopY, -2), m4.multiply(m4.yRotation(-2), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(6, groundTopY, 5), m4.multiply(m4.yRotation(0.7), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(-10, groundTopY, 8), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
        ];

        const smallTreeMatrices = [
            m4.multiply(m4.translation(5, groundTopY, 0), m4.multiply(m4.yRotation(0.7), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(6, groundTopY, 4), m4.multiply(m4.yRotation(1), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(10, groundTopY, 10), m4.multiply(m4.yRotation(0.5), m4.scaling(1.0, 1.0, 1.0))), // bello a sinistra piccolo
            m4.multiply(m4.translation(0, groundTopY, 3), m4.multiply(m4.yRotation(-1), m4.scaling(1.0, 1.0, 1.0))), 
        ];

        // Rocce: 4 istanze sparse intorno al focolare
        const rockMatrices = [
            m4.multiply(m4.translation(-7, groundTopY, -4), m4.multiply(m4.yRotation(3.5), m4.scaling(0.7, 0.7, 0.7))),
            m4.multiply(m4.translation(0, groundTopY, 0), m4.multiply(m4.yRotation(0), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(7, groundTopY, -8), m4.multiply(m4.yRotation(0), m4.scaling(0.8, 0.8, 0.8))),
            m4.multiply(m4.translation(2, groundTopY, 6), m4.multiply(m4.yRotation(3), m4.scaling(0.6, 0.6, 0.6))),
        ];

        const bushMatrices = [
            m4.multiply(m4.translation(0, groundTopY, -5), m4.multiply(m4.yRotation(-0.5), m4.scaling(1.0, 1.0, 1.0))),
            m4.multiply(m4.translation(0, groundTopY, -3), m4.multiply(m4.yRotation(-3), m4.scaling(1.1, 1.1, 1.1))),
            m4.multiply(m4.translation(6, groundTopY, 8), m4.multiply(m4.yRotation(-0.5), m4.scaling(1.0, 1.0, 1.0))),
        ];

        // Memorizza le matrici del focolare per poterle scalare al runtime.
        this.fireMatrices = fireMatrices;
        
        // Assegna i modelli alla foresta: cada uno è un array di renderables (uno per materiale).
        this.models = [
            this.buildModel(gl, groundData, groundMatrices),
            this.buildModel(gl, fireData, fireMatrices),
            this.buildModel(gl, bigTreeData, bigTreeMatrices),
            this.buildModel(gl, smallTreeData, smallTreeMatrices),
            this.buildModel(gl, rockData, rockMatrices),
            this.buildModel(gl, bushData, bushMatrices),
        ];
        
        // Salva il buffer istanza del focolare per poterlo aggiornare al runtime.
        if (this.models[1] && this.models[1].renderables.length > 0) {
            this.fireInstanceBuffer = this.models[1].renderables[0].instanceBuffer;
        }
    }

    buildModel(gl, modelData, instanceMatrices) {
        // Costruisce un modello da renderare come istanze.
        // Ogni materiale del modello riceve il suo VAO e renderables separati.
        const renderables = [];
        for (const renderable of modelData.renderables) {
            // Crea il VAO per questo materiale con tutti gli attributi necessari all'instancing.
            const vaoData = createInstancedModel(gl, renderable.geometry, this.attribLocations, instanceMatrices);
            // Log debug: mostra se il materiale ha alpha clipping abilitato.
            if (renderable.alphaClip) {
                console.log(`Material "${renderable.materialName}" has alpha clipping enabled.`);
            }
            // Assembla l'oggetto renderable con geometria, texture, colori e metadati.
            const renderableObj = {
                ...vaoData,
                texture: renderable.texture,
                color: renderable.materialColor,
                useTexture: renderable.useTexture,
                materialName: renderable.materialName,
                alphaClip: renderable.alphaClip,
                alphaThreshold: renderable.alphaThreshold,
            };
            renderables.push(renderableObj);
        }

        return {
            renderables,
            boundingBox: modelData.boundingBox,
        };
    }

    getFocusPoint() {
        // Restituisce il punto centrale della scena per la camera.
        return this.focusPoint.slice();
    }

    setFireScale(scale) {
        // Imposta la scala del focolare (usata per l'animazione del fuoco).
        this.fireScale = Math.max(0.1, scale); // Limita la scala a un minimo di 0.1 per evitare valori negativi o zero.
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
            
            // Se è il focolare (modelIdx === 1) e la scala è diversa da 1.0, aggiorna le matrici istanza scalate.
            if (modelIdx === 1 && this.fireScale !== 1.0 && this.fireMatrices && this.fireInstanceBuffer) {
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
                gl.bindBuffer(gl.ARRAY_BUFFER, this.fireInstanceBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, flatMatrices);
            }
            
            // Itera tutti i renderables di questo modello (uno per materiale).
            for (const renderable of model.renderables) {
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