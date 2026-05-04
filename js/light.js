window.Light = (() => {

	const moonLight = {
		position: [0.3, 1.0, 0.5], 
		color: [0.015, 0.018, 0.022], // colore freddo e tenue per simulare la luce lunare
		intensity: 10,
	};

	const fireLight = {
		position: [0, 0.4, 0],
		color: [1.0, 0.55, 0.2],
		intensity: 4.0,
		ambient: 0.4,
	};

	function getFireLight() {
		return fireLight;
	}

	function setFireIntensity(newIntensity) {
		fireLight.intensity = newIntensity;
		fireLight.ambient = Math.min(1.0, newIntensity / 5); // L'ambient aumenta con l'intensità, ma è limitato a 1.0
	}

	function getMoonLight() {
		return moonLight;
	}

	return { getFireLight, setFireIntensity, getMoonLight };
})();
