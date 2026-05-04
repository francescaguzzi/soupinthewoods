window.Light = (() => {
	const fireLight = {
		position: [0, 0.5, 0],
		color: [1.0, 0.55, 0.2],
		intensity: 2.0,
		ambient: 0.3,
	};

	function getFireLight() {
		return fireLight;
	}

	function setFireIntensity(newIntensity) {
		fireLight.intensity = newIntensity;
		fireLight.ambient = Math.min(1.0, newIntensity / 5); // L'ambient aumenta con l'intensità, ma è limitato a 1.0
	}

	return { getFireLight, setFireIntensity };
})();
