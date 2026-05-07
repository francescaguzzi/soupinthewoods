// ============================================================================
// ASSET LOADING UTILITIES - Caricamento risorse da URL
// ============================================================================

async function loadTextResource(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Unable to load resource: ${url}`);
	}
	return response.text();
}

function resolveAssetUrl(basePath, assetPath) {
	const path = String(assetPath || '').trim().replace(/\\/g, '/');
	if (!path) return null;
	if (path.startsWith('/')) return path.slice(1);
	if (path.startsWith('assets/')) return path;
	if (!basePath) return path;
	const normalizedBase = basePath.endsWith('/')
		? basePath
		: basePath.slice(0, basePath.lastIndexOf('/') + 1);
	return new URL(path, new URL(normalizedBase, window.location.href)).toString();
}

async function loadImageResource(url) {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`Unable to load image: ${url}`));
		image.src = url;
	});
}

// ============================================================================
// TEXTURE MANAGEMENT - Gestione delle texture WebGL
// ============================================================================

// Cache globale delle texture già caricate per evitare duplicati.
const textureCache = new Map();

function isPowerOfTwo(value) {
	return (value & (value - 1)) === 0;
}

// Carica una texture WebGL2 da URL.
// Crea una texture placeholder bianca e la carica asincronamente.
// Se la dimensione è potenza di 2, usa mipmapping; altrimenti usa CLAMP_TO_EDGE.
async function loadTexture(gl, url) {
	if (!url) return null;
	// Controlla se è già stata caricata
	if (textureCache.has(url)) return textureCache.get(url);

	const promise = (async () => {
		// Crea una texture WebGL vuota
		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		// Imposta pixel bianco placeholder mentre carica
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

		// Carica l'immagine dal disco
		const image = await loadImageResource(url);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		// Capovolgi l'asse Y (necessario perché le immagini web sono origin-top-left)
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
		// Carica l'immagine nella texture
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

		// Se l'immagine è potenza di 2, usa mipmapping per qualità migliore
		if (isPowerOfTwo(image.width) && isPowerOfTwo(image.height)) {
			gl.generateMipmap(gl.TEXTURE_2D);
		} else {
			// Altrimenti usa campionamento lineare e clipping ai bordi
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		}

		return texture;
	})();

	// Memorizza la promise nel cache per riutilizzo futuro
	textureCache.set(url, promise);
	return promise;
}

// ============================================================================
// MESH BOUNDING BOX UTILITIES - Calcolo limiti geometrici
// ============================================================================

// Calcola il bounding box (AABB) di una mesh 3D.
// Ritorna {min: [x,y,z], max: [x,y,z]} rappresentante i limiti X,Y,Z minoranti e majoranti.
function computeBoundingBox(mesh) {
	const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
	const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

	// Itera tutti i vertici della mesh
	for (let i = 1; i <= mesh.nvert; i += 1) {
		const v = mesh.vert[i];
		if (!v) continue;
		if (v.x < min[0]) min[0] = v.x;
		if (v.y < min[1]) min[1] = v.y;
		if (v.z < min[2]) min[2] = v.z;
		if (v.x > max[0]) max[0] = v.x;
		if (v.y > max[1]) max[1] = v.y;
		if (v.z > max[2]) max[2] = v.z;
	}

	return { min, max };
}

// Calcola il centro di un bounding box come media tra min e max.
function bboxCenter(bbox) {
	return [
		(bbox.min[0] + bbox.max[0]) * 0.5,
		(bbox.min[1] + bbox.max[1]) * 0.5,
		(bbox.min[2] + bbox.max[2]) * 0.5,
	];
}

// Calcola la dimensione (estensione) di un bounding box conteggiandone la larghezza, altezza, profondità.
function bboxSize(bbox) {
	return [
		bbox.max[0] - bbox.min[0],
		bbox.max[1] - bbox.min[1],
		bbox.max[2] - bbox.min[2],
	];
}

// ============================================================================
// MATERIAL PROPERTIES - Estrazione proprietà materiali da MTL
// ============================================================================

// Estrae il colore diffuse (Kd) o ambient (Ka) di un materiale MTL.
// Ritorna [R, G, B] normalizzati tra 0 e 1.
function materialColor(material) {
	const kd = material?.parameter?.get('Kd');
	const ka = material?.parameter?.get('Ka');
	const source = kd || ka || [1, 1, 1];
	return [source[0] ?? 1, source[1] ?? 1, source[2] ?? 1];
}

// Estrae il percorso della texture diffuse (map_Kd), displacement (map_d), o emissive (map_Ke) dal materiale.
// Ritorna il percorso come stringa o null se non presente.
function materialTexturePath(material) {
	return material?.parameter?.get('map_Kd') || material?.parameter?.get('map_d') || material?.parameter?.get('map_Ke') || null;
}

// Determina se un materiale deve avere alpha clipping (per foglie trasparenti, etc).
function shouldAlphaClip(material) {
	const name = String(material?.name || '').toLowerCase();
	return name.includes('leave');
}

// ============================================================================
// GEOMETRY EXTRACTION - Conversione mesh in geometria GPU-ready
// ============================================================================

// Estrae la geometria da una mesh OBJ filtrando solo su certi indici materiale.
// Ritorna {positions: Float32Array, uvs: Float32Array, vertexCount: number}.
// Triangola automaticamente i poligoni con più di 3 vertici.
function meshToGeometry(mesh, allowedMaterialIndices = null) {
	const positions = [];
	const uvs = [];
	const normals = [];

	const materialSet = allowedMaterialIndices ? new Set(allowedMaterialIndices) : null;

	for (let i = 1; i <= mesh.nface; i += 1) {
		const face = mesh.face[i];
		if (!face || face.n_v_e < 3) continue;

		if (materialSet && !materialSet.has(face.material ?? 0)) continue;

		// Triangola il poligono in fan (v0-v1-v2, v0-v2-v3, v0-v3-v4, ...)
		for (let t = 1; t < face.n_v_e - 1; t += 1) {
			for (const idx of [0, t, t + 1]) {
                const vertex = mesh.vert[face.vert[idx]];
                positions.push(vertex.x, vertex.y, vertex.z);

                const texCoord = mesh.textCoords[face.textCoordsIndex[idx]];
                uvs.push(texCoord ? texCoord.u : 0, texCoord ? texCoord.v : 0);

                const normal = mesh.normal[face.normalVertexIndex[idx]]; // lettura normali per Phong shading
                normals.push(
                    normal ? normal.i : 0,
                    normal ? normal.j : 1,
                    normal ? normal.k : 0
                );
            }
		}
	}

	return {
		positions: new Float32Array(positions),
		uvs: new Float32Array(uvs),
		normals: new Float32Array(normals),
		vertexCount: positions.length / 3,
	};
}

// ============================================================================
// INSTANCED RENDERING SETUP - Preparazione VAO per WebGL2 instancing
// ============================================================================

// Crea un VAO configurato per il rendering instanced.
// Setup:
// - VBO per posizioni (location 0)
// - VBO per UV (location 1)
// - VBO/divisor per matrici istanza come 4 vec4 (locations 2-5)
// Ritorna {vao, vertexCount, instanceCount}.
function createInstancedModel(gl, geometry, attribLocations, instanceMatrices) {
	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	// ========== POSITION ATTRIBUTE ==========
	const positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(attribLocations.position);
	// Ogni vertice ha 3 float (x, y, z)
	gl.vertexAttribPointer(attribLocations.position, 3, gl.FLOAT, false, 0, 0);

	// ========== UV ATTRIBUTE ==========
	const uvBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, geometry.uvs, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(attribLocations.uv);
	// Ogni vertice ha 2 float (u, v)
	gl.vertexAttribPointer(attribLocations.uv, 2, gl.FLOAT, false, 0, 0);

	// ========== NORMAL ATTRIBUTE ==========
	if (geometry.normals && attribLocations.normal !== undefined && attribLocations.normal !== -1) {
		const normalBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(attribLocations.normal);
		// Ogni vertice ha 3 float (x, y, z)
		gl.vertexAttribPointer(attribLocations.normal, 3, gl.FLOAT, false, 0, 0);
	}

	// ========== INSTANCE MATRIX ATTRIBUTE ==========
	// Una matrice 4x4 occupa 4 attribute locations (ogni riga è un vec4).
	const instanceBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
	// Flatten tutte le matrici istanza in un unico array Float32
	const flatMatrices = new Float32Array((instanceMatrices.length || 1) * 16);
	if (instanceMatrices.length === 0) {
		// Se nessuna matrice, usa identità
		flatMatrices.set(m4.identity(), 0);
	} else {
		// Copia ogni matrice nel buffer
		for (let i = 0; i < instanceMatrices.length; i += 1) {
			flatMatrices.set(instanceMatrices[i], i * 16);
		}
	}
	gl.bufferData(gl.ARRAY_BUFFER, flatMatrices, gl.STATIC_DRAW);

	// Configura i 4 attribute per la matrice istanza
	const baseLoc = attribLocations.instanceMatrix;
	for (let i = 0; i < 4; i += 1) {
		const loc = baseLoc + i;
		gl.enableVertexAttribArray(loc);
		// Ogni riga della matrice: 4 float offset di i*16 bytes
		gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 64, i * 16);
		// Divisor = 1 significa che questo attribute avanza di 1 per ogni istanza
		gl.vertexAttribDivisor(loc, 1);
	}

	gl.bindVertexArray(null);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);

	return {
		vao,
		vertexCount: geometry.vertexCount,
		instanceCount: Math.max(1, instanceMatrices.length),
		instanceBuffer,
	};
}

function buildModel(gl, modelData, instanceMatrices, attribLocations) {
	// Costruisce un modello da renderare come istanze.
	// Ogni materiale del modello riceve il suo VAO e renderables separati.
	const renderables = [];
	for (const renderable of modelData.renderables) {
		// Crea il VAO per questo materiale con tutti gli attributi necessari all'instancing.
		const vaoData = createInstancedModel(gl, renderable.geometry, attribLocations, instanceMatrices);

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

// ============================================================================
// OBJ/MTL LOADING - Caricamento e parsing di modelli 3D
// ============================================================================

// Carica un modello OBJ e il suo MTL, poi prepara i dati per il rendering.
// Ogni renderable corrisponde a un materiale diverso.
async function loadOBJModel(gl, objUrl, options = {}) {
	// Carica il file OBJ testuale
	const objText = await loadTextResource(objUrl);
	// Crea una mesh vuota e parsizza l'OBJ
	const mesh = new subd_mesh();
	const result = glmReadOBJ(objText, mesh);

	// Se l'OBJ referenzia un file MTL, caricalo
	if (result.fileMtl) {
		try {
			const mtlUrl = resolveAssetUrl(objUrl, result.fileMtl);
			const mtlText = await loadTextResource(mtlUrl);
			glmReadMTL(mtlText, mesh);
		} catch (error) {
			console.warn(error);
		}
	}

	// Raccogli gli indici dei materiali 
	const materialIndices = mesh.materials
        .map((mat, i) => (mat ? i : null))
        .filter(i => i !== null);
    if (materialIndices.length === 0) materialIndices.push(0);

	const renderables = [];

	// Per ogni materiale, crea un renderable (VAO + texture + proprietà)
	for (const materialIndex of materialIndices) {
		const material = mesh.materials[materialIndex] || null;
		// Estrai solo le facce di questo materiale
		const geometry = meshToGeometry(mesh, [materialIndex]);
		if (geometry.vertexCount === 0) continue;

		// Carica la texture del materiale se referenziata nel MTL
		const texturePath = materialTexturePath(material);
		const textureUrl = texturePath ? resolveAssetUrl(options.textureBaseDir || objUrl, texturePath) : null;
		let texture = null;
		if (textureUrl) {
			try {
				texture = await loadTexture(gl, textureUrl);
			} catch (error) {
				console.warn(error);
			}
		}

		// Assembla i dati del renderable
		renderables.push({
			materialName: material?.name || `material_${materialIndex}`,
			geometry,
			materialColor: materialColor(material),
			texture,
			useTexture: Boolean(texture),
			alphaClip: shouldAlphaClip(material),
			alphaThreshold: 0.9,
		});
	}

	return {
		renderables,
		boundingBox: computeBoundingBox(mesh)
	};
}