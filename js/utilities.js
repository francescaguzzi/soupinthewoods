// ============================================================================
// ASSET LOADING UTILITIES - Caricamento risorse da URL
// ============================================================================

// Carica una risorsa testuale (OBJ, MTL) da un URL.
// Usa fetch per ottenere il contenuto e ritorna il testo.
// Lancia errore se la risorsa non viene caricata.
async function loadTextResource(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Unable to load resource: ${url}`);
	}
	return response.text();
}

// Risolve i percorsi degli asset relativi o assoluti in URL validi.
// Gestisce percorsi relativi, assoluti, data URL, e percorsi già prefissati con 'assets/'.
// Esempio: 'texture.png' + basePath 'assets/models/' -> 'assets/textures/texture.png'
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

// Carica un'immagine da URL e ritorna l'oggetto Image.
// Essenziale per il caricamento delle texture da disco.
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

// Controlla se un numero è una potenza di 2 (necessario per WebGL mipmapping).
// Numero è potenza di 2 se (n & (n-1)) == 0.
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
// Ritorna true se il nome del materiale contiene 'leave'/'leaf' oppure la texture è PNG.
function shouldAlphaClip(material, textureUrl) {
	const name = String(material?.name || '').toLowerCase();
	return name.includes('leave') || name.includes('leaf') || /\.png$/i.test(textureUrl || '');
}

// ============================================================================
// MATERIAL COLLECTION - Gestione della priorità dei materiali
// ============================================================================

// Raccoglie gli indici dei materiali di una mesh in ordine di priorità.
// Se c'è un preferredName, lo mette per primo, poi gli altri materiali.
// Se non ci sono materiali, ritorna [0] (materiale di default).
function collectMaterialIndices(mesh, preferredName = null) {
	const indices = [];
	const preferredIndex = preferredName
		? mesh.materials.findIndex((material) => material?.name === preferredName)
		: -1;

	// Metti il materiale preferito per primo se trovato
	if (preferredIndex >= 0) {
		indices.push(preferredIndex);
	}

	// Aggiungi tutti gli altri materiali
	for (let i = 0; i < mesh.materials.length; i += 1) {
		if (i === preferredIndex) continue;
		const material = mesh.materials[i];
		if (material) indices.push(i);
	}

	// Se nessun materiale trovato, usa il materiale 0 di default
	if (indices.length === 0) indices.push(0);
	return indices;
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
	// Se specificati, usa solo questi indici materiale
	const materialSet = allowedMaterialIndices ? new Set(allowedMaterialIndices) : null;

	// Itera tutte le facce della mesh
	for (let i = 1; i <= mesh.nface; i += 1) {
		const face = mesh.face[i];
		if (!face || face.n_v_e < 3) continue;
		// Salta la faccia se il suo materiale non è nella lista allowedMaterialIndices
		if (materialSet && !materialSet.has(face.material ?? 0)) continue;

		// Triangola il poligono in fan (v0-v1-v2, v0-v2-v3, v0-v3-v4, ...)
		for (let t = 1; t < face.n_v_e - 1; t += 1) {
			const indices = [0, t, t + 1];
			// Per ogni vertex del triangolo
			for (const idx of indices) {
				// Estrai la posizione 3D dal vertice
				const vertexIndex = face.vert[idx];
				const vertex = mesh.vert[vertexIndex];
				positions.push(vertex.x, vertex.y, vertex.z);

				// Estrai le coordinate UV dal vertice
				const texIndex = face.textCoordsIndex[idx];
				const texCoord = mesh.textCoords[texIndex];
				uvs.push(texCoord ? texCoord.u : 0, texCoord ? texCoord.v : 0);
			}
		}
	}

	return {
		positions: new Float32Array(positions),
		uvs: new Float32Array(uvs),
		normals: computeNormalsFromPositions(new Float32Array(positions)),
		vertexCount: positions.length / 3,
	};
}

// Calcola normali lisce per triangoli ordinate per posizione
function computeNormalsFromPositions(positions) {
	const n = positions.length;
	const normals = new Float32Array(n);
	const tempNormals = new Float32Array(n);

	// Accumula normali di faccia sui vertici
	for (let i = 0; i < n; i += 9) {
		// Vertici del triangolo
		const v0 = [positions[i + 0], positions[i + 1], positions[i + 2]];
		const v1 = [positions[i + 3], positions[i + 4], positions[i + 5]];
		const v2 = [positions[i + 6], positions[i + 7], positions[i + 8]];

		// Calcola edge vectors
		const u = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
		const v = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

		// Cross product: face normal (usando Cross da glm_utils.js)
		const faceNormal = Cross(u, v);
		Normalize(faceNormal);

		// Aggiungi normale di faccia ai 3 vertici
		for (let j = 0; j < 3; j++) {
			const idx = i + j * 3;
			tempNormals[idx + 0] += faceNormal[0];
			tempNormals[idx + 1] += faceNormal[1];
			tempNormals[idx + 2] += faceNormal[2];
		}
	}

	// Normalizza le normali per vertice (usando Normalize da glm_utils.js)
	for (let i = 0; i < n; i += 3) {
		const vertexNormal = [tempNormals[i + 0], tempNormals[i + 1], tempNormals[i + 2]];
		Normalize(vertexNormal);
		normals[i + 0] = vertexNormal[0];
		normals[i + 1] = vertexNormal[1];
		normals[i + 2] = vertexNormal[2];
	}

	return normals;
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

// ============================================================================
// MATRIX BUILDERS - Creazione di matrici di trasformazione per gli oggetti
// ============================================================================

// Crea una matrice per posizionare e scalare un oggetto allineato al terreno.
// Parametri:
// - bbox: bounding box dell'oggetto originale
// - x, z: posizione X,Z sul terreno
// - y: posizione Y (base del modello)
// - targetHeight: altezza desiderata dell'oggetto finale
// - rotationY: rotazione attorno all'asse Y (in radianti)
function createGroundAlignedMatrix(bbox, x, y, z, targetHeight, rotationY = 0) {
	// Calcolo centro e dimensioni della bbox originale
	const center = bboxCenter(bbox);
	const size = bboxSize(bbox);
	const maxDimension = Math.max(size[0], size[1], size[2]) || 1;
	// Scale per raggiungere l'altezza target partendo dall'altezza del modello
	const scale = targetHeight / maxDimension;

	// Composizione della matrice:
	// 1. Trasla il modello alla posizione finale (x, y, z)
	// 2. Ruota attorno a Y
	// 3. Scala per la dimensione target
	// 4. Trasla per centrare il modello (rimuove offset dal bounding box)
	return m4.multiply(
		m4.translation(x, y, z),
		m4.multiply(
			m4.yRotation(rotationY),
			m4.multiply(
				m4.scaling(scale, scale, scale),
				m4.translation(-center[0], -bbox.min[1], -center[2])
			)
		)
	);
}

// Crea una matrice per posizionare un oggetto centrato (non allineato al terreno).
// Simile a createGroundAlignedMatrix ma centra completamente l'oggetto.
function createCenteredMatrix(bbox, x, y, z, targetSize, rotationY = 0) {
	const center = bboxCenter(bbox);
	const size = bboxSize(bbox);
	const maxDimension = Math.max(size[0], size[1], size[2]) || 1;
	const scale = targetSize / maxDimension;

	return m4.multiply(
		m4.translation(x, y, z),
		m4.multiply(
			m4.yRotation(rotationY),
			m4.multiply(
				m4.scaling(scale, scale, scale),
				m4.translation(-center[0], -center[1], -center[2])
			)
		)
	);
}

// ============================================================================
// OBJ/MTL LOADING - Caricamento e parsing di modelli 3D
// ============================================================================

// Carica un modello OBJ e il suo MTL, poi prepara i dati per il rendering.
// Ritorna {renderables: [], boundingBox: {...}, preferredMaterialName: string}.
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

	// Raccogli gli indici dei materiali (priorità: preferredMaterialName primo)
	const materialIndices = collectMaterialIndices(mesh);
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
			alphaClip: shouldAlphaClip(material, textureUrl),
			alphaThreshold: 0.9,
		});
	}

	return {
		renderables,
		boundingBox: computeBoundingBox(mesh)
	};
}