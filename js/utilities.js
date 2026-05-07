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
	if (textureCache.has(url)) return textureCache.get(url);

	const promise = (async () => {

		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

		const image = await loadImageResource(url);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Capovolgi l'asse Y (necessario perché le immagini web sono origin-top-left)
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

	textureCache.set(url, promise);
	return promise;
}

// ============================================================================
// MESH BOUNDING BOX UTILITIES 
// ============================================================================

function computeBoundingSphere(mesh) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 1; i <= mesh.nvert; i++) {
        const v = mesh.vert[i];
        if (!v) continue;
        if (v.x < minX) minX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.z < minZ) minZ = v.z;
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
        if (v.z > maxZ) maxZ = v.z;
    }

    const center = [(minX+maxX)*0.5, (minY+maxY)*0.5, (minZ+maxZ)*0.5];
    const radius = Math.max(maxX-minX, maxY-minY, maxZ-minZ) * 0.5;
    return { center, radius };
}

function raySphereIntersect(rayOrigin, rayDir, sphere, worldMatrix) {
   
    const worldCenter = m4.transformPoint(worldMatrix, sphere.center);
    // Stima il raggio in world space (approssimazione valida per scale uniformi)
    const scale = Math.hypot(worldMatrix[0], worldMatrix[1], worldMatrix[2]);
    const worldRadius = sphere.radius * scale;

    const oc = [
        rayOrigin[0] - worldCenter[0],
        rayOrigin[1] - worldCenter[1],
        rayOrigin[2] - worldCenter[2],
    ];
    const b = oc[0]*rayDir[0] + oc[1]*rayDir[1] + oc[2]*rayDir[2];
    const c = oc[0]*oc[0] + oc[1]*oc[1] + oc[2]*oc[2] - worldRadius * worldRadius;
    const discriminant = b * b - c;
    
    return discriminant >= 0; // true = colpito
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
	gl.vertexAttribPointer(attribLocations.position, 3, gl.FLOAT, false, 0, 0); // Ogni vertice ha 3 float (x, y, z)

	// ========== UV ATTRIBUTE ==========
	const uvBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, geometry.uvs, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(attribLocations.uv);
	gl.vertexAttribPointer(attribLocations.uv, 2, gl.FLOAT, false, 0, 0); // Ogni vertice ha 2 float (u, v)

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
	const instanceBuffer = gl.createBuffer(); // Una matrice 4x4 occupa 4 attribute locations (ogni riga è un vec4).
	gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
	// Flatten tutte le matrici istanza in un unico array Float32
	const flatMatrices = new Float32Array((instanceMatrices.length || 1) * 16);
	if (instanceMatrices.length === 0) {
		flatMatrices.set(m4.identity(), 0);
	} else {
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
		gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 64, i * 16); // Ogni riga della matrice: 4 float offset di i*16 bytes
		gl.vertexAttribDivisor(loc, 1); // Divisor = 1 significa che questo attribute avanza di 1 per ogni istanza
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
	return { renderables };
}

// ============================================================================
// OBJ/MTL LOADING
// ============================================================================

// Carica un modello OBJ ed il suo MTL, poi prepara i dati per il rendering.
// Ogni renderable corrisponde a un materiale diverso.
async function loadOBJModel(gl, objUrl, options = {}) {

	const objText = await loadTextResource(objUrl);
	const mesh = new subd_mesh();
	const result = glmReadOBJ(objText, mesh);

	if (result.fileMtl) {
		try {
			const mtlUrl = resolveAssetUrl(objUrl, result.fileMtl);
			const mtlText = await loadTextResource(mtlUrl);
			glmReadMTL(mtlText, mesh);
		} catch (error) {
			console.warn(error);
		}
	}

	const materialIndices = mesh.materials
        .map((mat, i) => (mat ? i : null))
        .filter(i => i !== null);
    if (materialIndices.length === 0) materialIndices.push(0);

	const renderables = [];

	// Per ogni materiale crea un renderable (VAO + texture + proprietà)
	for (const materialIndex of materialIndices) {
		const material = mesh.materials[materialIndex] || null;
	
		const geometry = meshToGeometry(mesh, [materialIndex]); // estrae solo le facce con il materiale corrente
		if (geometry.vertexCount === 0) continue;

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
		boundingSphere: options.computeBoundingSphere ? computeBoundingSphere(mesh) : null,
	};
}