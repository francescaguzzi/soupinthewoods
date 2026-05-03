class Scene {

    constructor(canvas, camera) {

        this.canvas = canvas;
        this.camera = camera;

        this.gl = canvas.getContext('webgl2');
        if (!this.gl) {
            throw new Error('WebGL2 non supportato dal browser.');
        }

        this.program = null;

        // Location degli attributi usati da VAO e instancing.
        this.attribLocations = null;

        // Location delle uniform usate nel fragment shader.
        this.uniformLocations = null;

        this.forest = null;
    }

    async init() {

        const gl = this.gl;
        this.program = webglUtils.createProgramFromScripts(gl, ['vertex-shader', 'fragment-shader']);

        // Legge le location degli attributi una sola volta.
        this.attribLocations = {
            position: gl.getAttribLocation(this.program, 'a_position'),
            uv: gl.getAttribLocation(this.program, 'a_uv'),
            instanceMatrix: gl.getAttribLocation(this.program, 'a_instanceMatrix'),
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
        };

        this.forest = new Forest(gl, this.attribLocations, this.uniformLocations, this.camera);
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

        // Aggiorna la dimensione del canvas e pulisce il frame buffer.
        this.resize();
        gl.clearColor(12/255, 8/255, 5/255, 1); // sfondo nero
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Matrice di proiezione prospettica classica.
        const aspect = this.canvas.width / this.canvas.height;
        const projectionMatrix = m4.perspective(Math.PI / 3, aspect, 0.1, 200.0);

        // View matrix ottenuta dalla camera istanziata.
        const viewMatrix = this.camera.getViewMatrix();

        // Usa il programma e lascia alla foresta il rendering delle istanze.
        gl.useProgram(this.program);
        this.forest.render(viewMatrix, projectionMatrix);
    }

    getFocusPoint() {
        // Punto utile per il reset/focus della camera.
        return this.forest ? this.forest.getFocusPoint() : [0, 0, 0];
    }
}
