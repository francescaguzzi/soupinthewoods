window.Light = (() => {
	const fireLight = {
		position: [0, 0.5, 0],
		color: [1.0, 0.55, 0.2],
		intensity: 3.0,
		ambient: 0.3,
	};

	function getFireLight() {
		return fireLight;
	}

	return { getFireLight };
})();
