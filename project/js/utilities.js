// ============================================================================
// ASSET LOADING UTILITIES
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
    return new URL(path, new URL(basePath, window.location.href)).toString();
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
// TEXTURE MANAGEMENT 
// ============================================================================

// Global texture cache to avoid redundant loads. Maps URL to Promise<Texture>.
const textureCache = new Map();

function isPowerOfTwo(value) {
	return (value & (value - 1)) === 0;
}

function degToRad(degrees) {
	return degrees * Math.PI / 180;
}

/**
 * Function to load a texture from a URL, with caching and proper WebGL setup.
 * Binds a placeholder white texture immediately, then updates it when the image loads.
 * If the image is a power of two, generates mipmaps for better scaling; otherwise, sets clamping and linear filtering.
 * @param {*} gl WebGL context
 * @param {*} url Texture URL
 * @returns WebGLTexture object wrapped in a Promise that resolves when the texture is fully loaded and ready.
 */
async function loadTexture(gl, url) {
	if (!url) return null;
	if (textureCache.has(url)) return textureCache.get(url);

	const promise = (async () => {

		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));

		const image = await loadImageResource(url);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); 
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

		if (isPowerOfTwo(image.width) && isPowerOfTwo(image.height)) {
			gl.generateMipmap(gl.TEXTURE_2D);
		} else {
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		}
		return texture;
	})();

	textureCache.set(url, promise);
	return promise;
}

/**
 * Function to load a skybox texture from an image URL to repeat on all faces of the cubemap.
 * @param {*} gl WebGL context
 * @param {*} url Texture URL
 * @returns WebGLTexture object wrapped in a Promise that resolves when the texture is fully loaded and ready.
 */
async function loadCubemap(gl, url) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

    const faces = [
        gl.TEXTURE_CUBE_MAP_POSITIVE_X,
        gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
        gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
        gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
        gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
        gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
    ];

    const image = await loadImageResource(url);
    for (const face of faces) {
        gl.texImage2D(face, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    }

    gl.generateMipmap(gl.TEXTURE_CUBE_MAP); 
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    return texture;
}

// ============================================================================
// MESH BOUNDING BOX UTILITIES - Used for raycasting and click detection
// ============================================================================

/**
 * Approximate bounding sphere derived from axis-aligned bounding box.
 * @param {*} mesh Mesh object
 * @returns {Object} An object containing the center and radius of the bounding sphere.
 */
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

/**
 * Checks if a ray intersects with a sphere.
 * @param {*} rayOrigin Origin of the ray.
 * @param {*} rayDir Direction of the ray.
 * @param {*} sphere Sphere to check intersection with.
 * @param {*} worldMatrix World matrix for transforming the sphere.
 * @returns {boolean} True if the ray intersects the sphere, false otherwise.
 */
function raySphereIntersect(rayOrigin, rayDir, sphere, worldMatrix) {
   
    const worldCenter = m4.transformPoint(worldMatrix, sphere.center);
	// Assume uniform scaling and extract the scale factor from the world matrix to adjust the radius accordingly.
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
    
    return discriminant >= 0; 
}

// ============================================================================
// MATERIAL PROPERTIES 
// ============================================================================

// Extracts the color of a material based on its type.
function materialColor(material, type) {
	if (type === 'diffuse') {
		const kd = material?.parameter?.get('Kd');
		const ka = material?.parameter?.get('Ka');
		const source = kd || ka || [1, 1, 1];
		return [source[0] ?? 1, source[1] ?? 1, source[2] ?? 1];
	}
	if (type === 'specular') {
		const ks = material?.parameter?.get('Ks');
		const source = ks || [0.5, 0.5, 0.5]; // gray default for specular
		return [source[0] ?? 0.5, source[1] ?? 0.5, source[2] ?? 0.5];
	}
}

// Extracts the texture path of a material based on its type.
function materialTexturePath(material, type) {
	if (type === 'diffuse') 
		return material?.parameter?.get('map_Kd') || material?.parameter?.get('map_d') || material?.parameter?.get('map_Ke') || null;
	
	if (type === 'bump') 
		return material?.parameter?.get('map_Bump') || null;
	
	if (type === 'specular') 
		return material?.parameter?.get('map_Ks') || null;
}

// Extracts bump map paths from MTL text and assigns them to the corresponding materials.
async function extractBumpMaps(mtlText, mesh) {
    const lines = mtlText.split('\n');
    let currentMaterial = null;
    for (const line of lines) {
        const buf = line.trim().split(/\s+/);
        if (buf[0] === 'newmtl') {
            currentMaterial = mesh.materials.find(m => m.name === buf[1]) || null;
        }
        if (buf[0].toLowerCase() === 'map_bump' && currentMaterial) {
            const filename = buf.slice(1).find(token => /\.(jpg|jpeg|png)$/i.test(token));
            if (filename) {
                currentMaterial.parameter.set('map_Bump', filename);
            }
        }
    }
}

function shouldAlphaClip(material) {
	const name = String(material?.name || '').toLowerCase();
	return name.includes('leave');
}

// ============================================================================
// GEOMETRY EXTRACTION - Converts mesh data to flat arrays for WebGL buffers
// ============================================================================

/**
 * Converts mesh data to flat arrays for WebGL buffers. Optionally filters faces by allowed material
 * indices and triangulates polygons with more than 3 vertices. Calculates tangents for bump mapping.
 * @param {*} mesh The mesh object.
 * @param {*} allowedMaterialIndices If provided, only faces with these material indices will be included in the output. If null, all faces are included.
 * @returns {Object} An object containing the geometry data (positions, uvs, normals, tangents) and vertex count.
 */
function meshToGeometry(mesh, allowedMaterialIndices = null) {
	const positions = [];
	const uvs = [];
	const normals = [];
	const tangents = [];

	// Creating a set for faster lookup if allowedMaterialIndices is provided
	// useful for large meshes with many faces and materials, to avoid multiple checks for each face against the allowed materials.
	const materialSet = allowedMaterialIndices ? new Set(allowedMaterialIndices) : null;
	
	for (let i = 1; i <= mesh.nface; i += 1) {
		const face = mesh.face[i];

		if (materialSet && !materialSet.has(face.material ?? 0)) continue;
		
		const vertexIndices = [0, 1, 2];
		const vertexData = vertexIndices.map(idx => {
			const v = mesh.vert[face.vert[idx]];
			const tc = mesh.textCoords[face.textCoordsIndex[idx]];
			return {
				pos: [v.x, v.y, v.z],
				uv: [tc ? tc.u : 0, tc ? tc.v : 0],
			};
		});
		// tangent calculation for bump mapping
		const e1 = m4.subtractVectors(vertexData[1].pos, vertexData[0].pos, []);
		const e2 = m4.subtractVectors(vertexData[2].pos, vertexData[0].pos, []);
		const du1 = vertexData[1].uv[0] - vertexData[0].uv[0];
		const dv1 = vertexData[1].uv[1] - vertexData[0].uv[1];
		const du2 = vertexData[2].uv[0] - vertexData[0].uv[0];
		const dv2 = vertexData[2].uv[1] - vertexData[0].uv[1];
		
		const denom = du1 * dv2 - du2 * dv1;
		const f = Math.abs(denom) > 0.0001 ? 1.0 / denom : 0;
		
		const tangent = [
			f * (dv2 * e1[0] - dv1 * e2[0]),
			f * (dv2 * e1[1] - dv1 * e2[1]),
			f * (dv2 * e1[2] - dv1 * e2[2]),
		]; 
		m4.normalize(tangent, tangent);

		for (let j = 0; j < 3; j++) {
			const idx = vertexIndices[j];
			positions.push(...vertexData[j].pos);
			uvs.push(...vertexData[j].uv);

			const normal = mesh.normal[face.normalVertexIndex[idx]];
			normals.push(
				normal ? normal.i : 0,
				normal ? normal.j : 1,
				normal ? normal.k : 0
			); // If the mesh doesn't have normals, we default to (0, 1, 0) 
			tangents.push(tangent[0], tangent[1], tangent[2]);
		}
	}

	return {
		positions: new Float32Array(positions),
		uvs: new Float32Array(uvs),
		normals: new Float32Array(normals),
		tangents: new Float32Array(tangents),
		vertexCount: positions.length / 3,
	};
}

// ============================================================================
// INSTANCED RENDERING SETUP 
// ============================================================================

/**
 * Creates an instanced model for rendering. Sets up VAO and VBOs for vertex attributes and instance matrices.
 * VBO for positions is bound to location 0, UVs to location 1, and instance matrices are sent as 4 vec4 attributes to locations 2-5 with divisor for instancing.
 * @param {*} gl WebGL context
 * @param {*} geometry Geometry data containing positions, uvs, normals, tangents, and vertex count.
 * @param {*} attribLocations An object mapping attribute names to their locations in the shader program 
 * @param {*} instanceMatrices VAO, vertex count, and instance count for rendering. 
 * @returns 
 */
function createInstancedModel(gl, geometry, attribLocations, instanceMatrices) {
	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);

	// ========== POSITION ATTRIBUTE ==========
	const positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(attribLocations.position);
	gl.vertexAttribPointer(attribLocations.position, 3, gl.FLOAT, false, 0, 0); 

	// ========== UV ATTRIBUTE ==========
	const uvBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, geometry.uvs, gl.STATIC_DRAW);
	gl.enableVertexAttribArray(attribLocations.uv);
	gl.vertexAttribPointer(attribLocations.uv, 2, gl.FLOAT, false, 0, 0); 

	// ========== NORMAL ATTRIBUTE ==========
	if (geometry.normals && attribLocations.normal !== undefined && attribLocations.normal !== -1) {
		const normalBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(attribLocations.normal);
		gl.vertexAttribPointer(attribLocations.normal, 3, gl.FLOAT, false, 0, 0);
	}

	// ========== TANGENT ATTRIBUTE ==========
	if (geometry.tangents && attribLocations.tangent !== undefined && attribLocations.tangent !== -1) {
		const tangentBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, tangentBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, geometry.tangents, gl.STATIC_DRAW);
		gl.enableVertexAttribArray(attribLocations.tangent);
		gl.vertexAttribPointer(attribLocations.tangent, 3, gl.FLOAT, false, 0, 0);
	}

	// ========== INSTANCE MATRIX ATTRIBUTE ==========
	const instanceBuffer = gl.createBuffer(); // a 4x4 matrix will be sent as 4 vec4 attributes
	gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
	// flatten the array of matrices into a single Float32Array for bufferData
	const flatMatrices = new Float32Array((instanceMatrices.length || 1) * 16);
	if (instanceMatrices.length === 0) {
		flatMatrices.set(m4.identity(), 0);
	} else {
		for (let i = 0; i < instanceMatrices.length; i += 1) {
			flatMatrices.set(instanceMatrices[i], i * 16);
		}
	}
	gl.bufferData(gl.ARRAY_BUFFER, flatMatrices, gl.STATIC_DRAW);

	// Each column of the matrix is sent as a separate attribute (vec4), so we need to set up 4 attributes for the instance matrix.
	const baseLoc = attribLocations.instanceMatrix;
	for (let i = 0; i < 4; i += 1) {
		const loc = baseLoc + i;
		gl.enableVertexAttribArray(loc);
		gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 64, i * 16); // 64 bytes per matrix, offset by column
		gl.vertexAttribDivisor(loc, 1); // This tells WebGL to advance to the next instance matrix after each instance, rather than each vertex.
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

/**
 * Builds a model for instanced rendering. For each renderable in the model data, it creates a VAO with the geometry 
 * and instance matrices, and assembles an object containing all necessary information for rendering (textures, 
 * colors, material properties). Returns an object with an array of renderables; each renderable corresponds to a 
 * different material in the model.
 * @param {*} gl WebGL context
 * @param {*} modelData Model data containing an array of renderables, each with geometry, texture, material properties, etc.
 * @param {*} instanceMatrices An array of transformation matrices for instancing. Each matrix corresponds to an instance of the model to be rendered.
 * @param {*} attribLocations An object mapping attribute names to their locations in the shader program, used for setting up the VAO.
 * @returns An array of renderable objects, each containing VAO, vertex count, instance count, textures, colors, and material properties for rendering. 
 */
function buildModel(gl, modelData, instanceMatrices, attribLocations) {
	
	// Each material in the model gets its own VAO and separate renderables, 
	// allowing for different textures and properties per material while still benefiting 
	// from instancing for all instances of that material.
	const renderables = [];
	for (const renderable of modelData.renderables) {

		const vaoData = createInstancedModel(gl, renderable.geometry, attribLocations, instanceMatrices);
		const renderableObj = {
			...vaoData,
			texture: renderable.texture,
			color: renderable.materialColor,
			specularColor: renderable.materialSpecularColor,
			useTexture: renderable.useTexture,
			materialName: renderable.materialName,
			alphaClip: renderable.alphaClip,
			bumpTexture: renderable.bumpTexture,
			useBumpMap: renderable.useBumpMap,
			bumpMapSize: renderable.bumpMapSize,
			specularTexture: renderable.specularTexture,
			useSpecularMap: renderable.useSpecularMap,
		};
		renderables.push(renderableObj);
	}
	return { renderables };
}

// ============================================================================
// OBJ/MTL LOADING
// ============================================================================

/**
 * Loads an OBJ model and its associated MTL file, then prepares the data for rendering.
 * Each renderable corresponds to a different material in the model.
 * @param {*} gl WebGL context
 * @param {*} objUrl URL of the OBJ file
 * @param {*} options Options for loading the model (base directory for textures, whether to compute bounding sphere)
 * @returns Promise resolving to the loaded model data
 */
async function loadOBJModel(gl, objUrl, options = {}) {

	const objText = await loadTextResource(objUrl);
	const mesh = new subd_mesh();
	const result = glmReadOBJ(objText, mesh);

	if (result.fileMtl) {
		try {
			const mtlUrl = resolveAssetUrl(objUrl, result.fileMtl);
			const mtlText = await loadTextResource(mtlUrl);
			glmReadMTL(mtlText, mesh);
			await extractBumpMaps(mtlText, mesh); 
		} catch (error) {
			console.warn('Error loading MTL file:', result.fileMtl, error);
		}
	}

	const materialIndices = mesh.materials
        .map((mat, i) => (mat ? i : null))
        .filter(i => i !== null);
    if (materialIndices.length === 0) materialIndices.push(0);

	const renderables = [];

	// Create a renderable for each material, extracting only the faces that use that material. 
	// This allows us to have different textures and properties per material while still benefiting 
	// from instancing for all instances of that material. If the mesh has no materials, we create 
	// a single renderable with all faces.
	for (const materialIndex of materialIndices) {
		const material = mesh.materials[materialIndex] || null;
	
		const geometry = meshToGeometry(mesh, [materialIndex]); 
		if (geometry.vertexCount === 0) continue;

		const texturePath = materialTexturePath(material, 'diffuse');
		const textureUrl = texturePath ? resolveAssetUrl(options.textureBaseDir || objUrl, texturePath) : null;
		let texture = null;
		if (textureUrl) {
			try {
				texture = await loadTexture(gl, textureUrl);
			} catch (error) {
				console.warn(error);
			}
		}

		const bumpPath = materialTexturePath(material, 'bump');
		const bumpUrl = bumpPath ? resolveAssetUrl(options.textureBaseDir || objUrl, bumpPath) : null;
		let bumpTexture = null;
		let bumpMapSize = [1024, 1024]; 
		if (bumpUrl) {
			try {
				const img = await loadImageResource(bumpUrl);
				bumpMapSize = [img.width, img.height];
				bumpTexture = await loadTexture(gl, bumpUrl);
			} catch (error) {
				console.warn('Error loading bump map:', material?.name, '-', bumpPath, error);
			}
		}

		const specularPath = materialTexturePath(material, 'specular');
		const specularUrl = specularPath ? resolveAssetUrl(options.textureBaseDir || objUrl, specularPath) : null;
		let specularTexture = null;
		if (specularUrl) {
			try {
				specularTexture = await loadTexture(gl, specularUrl);
			} catch (error) {
				console.warn('Error loading specular map:', material?.name, '-', specularPath, error);
			}
		}

		renderables.push({
			materialName: material?.name || `material_${materialIndex}`,
			geometry,
			materialColor: materialColor(material, 'diffuse'),
			materialSpecularColor: materialColor(material, 'specular'),
			texture,
			useTexture: Boolean(texture),
			bumpTexture,
			useBumpMap: Boolean(bumpTexture),
			bumpMapSize,
			specularTexture,
			useSpecularMap: Boolean(specularTexture),
			alphaClip: shouldAlphaClip(material),
		});
	}

	return {
		renderables,
		boundingSphere: options.computeBoundingSphere ? computeBoundingSphere(mesh) : null,
	};
}