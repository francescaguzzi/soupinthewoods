class Scene {

    constructor(canvas, camera) {

        this.canvas = canvas;
        this.camera = camera;

        this.gl = canvas.getContext('webgl2');
        if (!this.gl) {
            throw new Error('WebGL2 non supportato dal browser.');
        }

        this.program = null;
        this.attribLocations = null;
        this.uniformLocations = null;
        this.projectionMatrix = null;
        this.forest = null;
    }

    toggleBumpMapping() {
        if (this.forest) {
            return this.forest.toggleBumpMapping();
        }
    }

    toggleSpecularMapping() {
        if (this.forest) {
            return this.forest.toggleSpecularMapping();
        }
    }

    async init() {

        const gl = this.gl;

        /* ---------------------------------- */

        this.skyboxProgram = webglUtils.createProgramFromScripts(gl, ['skybox-vertex', 'skybox-fragment']);
        this.skyboxUniformLocations = {
            skybox: gl.getUniformLocation(this.skyboxProgram, 'u_skybox'),
            viewDirectionProjectionInverse: gl.getUniformLocation(this.skyboxProgram, 'u_viewDirectionProjectionInverse'),
        };

        const quadVertices = new Float32Array([
            -1, -1,
            1, -1,
            -1,  1,
            1,  1,
        ]);
        this.skyboxVAO = gl.createVertexArray();
        gl.bindVertexArray(this.skyboxVAO);
        const quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
        const posLoc = gl.getAttribLocation(this.skyboxProgram, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        this.skyboxTexture = await loadCubemap(gl,'assets/textures/skybox.png');

        /* ---------------------------------- */

        this.program = webglUtils.createProgramFromScripts(gl, ['vertex-shader', 'fragment-shader']);

        // Legge le location degli attributi una sola volta.
        this.attribLocations = {
            position: gl.getAttribLocation(this.program, 'a_position'),
            uv: gl.getAttribLocation(this.program, 'a_uv'),
            instanceMatrix: gl.getAttribLocation(this.program, 'a_instanceMatrix'),
            normal: gl.getAttribLocation(this.program, 'a_normal'),
            tangent: gl.getAttribLocation(this.program, 'a_tangent'), 
        };

        // Legge le uniform una sola volta per evitare lookup ogni frame.
        this.uniformLocations = {
            view: gl.getUniformLocation(this.program, 'u_view'),
            projection: gl.getUniformLocation(this.program, 'u_projection'),
            color: gl.getUniformLocation(this.program, 'u_color'),
            useTexture: gl.getUniformLocation(this.program, 'u_useTexture'),
            textureSampler: gl.getUniformLocation(this.program, 'u_texture'),
            alphaClip: gl.getUniformLocation(this.program, 'u_alphaClip'),
            alphaThreshold: gl.getUniformLocation(this.program, 'u_alphaThreshold'),
            // bump mapping
            useBumpMap: gl.getUniformLocation(this.program, 'u_useBumpMap'),
            bumpMapSampler: gl.getUniformLocation(this.program, 'u_bumpMap'),
            bumpMapSize: gl.getUniformLocation(this.program, 'u_bumpMapSize'),
            bumpMapStrength: gl.getUniformLocation(this.program, 'u_bumpMapStrength'),
            // specular mapping
            useSpecularMap: gl.getUniformLocation(this.program, 'u_useSpecularMap'),
            specularMapSampler: gl.getUniformLocation(this.program, 'u_specularMap'),
            specularColor: gl.getUniformLocation(this.program, 'u_specularColor'),

            // Fire light uniforms
            firePosition: gl.getUniformLocation(this.program, 'u_firePosition'),
            fireColor: gl.getUniformLocation(this.program, 'u_fireColor'),
            fireIntensity: gl.getUniformLocation(this.program, 'u_fireIntensity'),
            // Moon light uniforms
            moonDirection: gl.getUniformLocation(this.program, 'u_moonDirection'),
            moonColor: gl.getUniformLocation(this.program, 'u_moonColor'),
            moonIntensity: gl.getUniformLocation(this.program, 'u_moonIntensity'),
            // Camera position for specular
            viewPosition: gl.getUniformLocation(this.program, 'u_viewPosition'),
        };

        this.forest = new Forest(gl, this.attribLocations, this.uniformLocations);
        await this.forest.init();

        this.resize();
    }

    resize() {
        // Rende il canvas coerente con la dimensione del display.
        webglUtils.resizeCanvasToDisplaySize(this.canvas);
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    render() {
        const gl = this.gl;

        this.resize();
        // gl.clearColor(12/255, 8/255, 5/255, 1); 
        gl.clearColor(0, 0, 0, 1); // Colore di sfondo più scuro per evidenziare il fuoco
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Matrice di proiezione prospettica classica.
        const aspect = this.canvas.width / this.canvas.height;
        const projectionMatrix = m4.perspective(Math.PI / 3, aspect, 0.1, 200.0);
        this.projectionMatrix = projectionMatrix; // Salva per uso esterno (raycasting)

        // View matrix ottenuta dalla camera istanziata.
        const viewMatrix = this.camera.getViewMatrix();

        /* ---------------------------------- */

        const viewDirectionMatrix = [...viewMatrix];
        viewDirectionMatrix[12] = 0;
        viewDirectionMatrix[13] = 0;
        viewDirectionMatrix[14] = 0;

        const viewDirectionProjectionInverse = m4.inverse(
            m4.multiply(projectionMatrix, viewDirectionMatrix)
        );

        // Skybox prima di tutto — depthFunc LEQUAL come fa il tuo prof
        gl.depthFunc(gl.LEQUAL);
        gl.useProgram(this.skyboxProgram);
        gl.bindVertexArray(this.skyboxVAO);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.skyboxTexture);
        gl.uniform1i(this.skyboxUniformLocations.skybox, 0);
        gl.uniformMatrix4fv(this.skyboxUniformLocations.viewDirectionProjectionInverse, false, viewDirectionProjectionInverse);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);

        /* ---------------------------------- */

        // Ripristina depth test standard e renderizza la scena
        gl.depthFunc(gl.LESS);
        // Usa il programma e lascia alla foresta il rendering delle istanze.
        gl.useProgram(this.program);

        // Imposta le uniform della luce del fuoco
        if (typeof Light !== 'undefined' && Light.getFireLight) {
            const fire = Light.getFireLight();
            if (fire) {
                if (this.uniformLocations.firePosition) gl.uniform3fv(this.uniformLocations.firePosition, fire.position);
                if (this.uniformLocations.fireColor) gl.uniform3fv(this.uniformLocations.fireColor, fire.color);
                if (this.uniformLocations.fireIntensity) gl.uniform1f(this.uniformLocations.fireIntensity, fire.intensity || 1.0);
            }
        }

        // Imposta le uniform della luce lunare
        if (typeof Light !== 'undefined' && Light.getMoonLight) {
            const moon = Light.getMoonLight();
            if (moon) {
                if (this.uniformLocations.moonDirection) gl.uniform3fv(this.uniformLocations.moonDirection, moon.position); // Usa position come direzione
                if (this.uniformLocations.moonColor) gl.uniform3fv(this.uniformLocations.moonColor, moon.color);
                if (this.uniformLocations.moonIntensity) gl.uniform1f(this.uniformLocations.moonIntensity, moon.intensity || 0.5);
            }
        }

        // Imposta la posizione della camera per il calcolo speculare
        if (this.uniformLocations.viewPosition && this.camera.getPosition) {
            gl.uniform3fv(this.uniformLocations.viewPosition, this.camera.getPosition());
        }

        this.forest.render(viewMatrix, projectionMatrix);
    }
}
