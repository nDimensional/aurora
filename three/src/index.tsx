import React, { useRef, useMemo, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, extend, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { RenderPass, UnrealBloomPass } from "three-stdlib";

import fragmentShader from "../shaders/fragmentShader.glsl?raw";
import vertexShader from "../shaders/vertexShader.glsl?raw";

// Extend R3F with postprocessing effects
extend({
	EffectComposer: EffectComposer as any,
	RenderPass: RenderPass as any,
	UnrealBloomPass: UnrealBloomPass as any,
});

// Particle data interface
interface ParticleData {
	xPositions: Float32Array;
	yPositions: Float32Array;
}

// Component props interface
interface ParticleCloudProps {
	xPositions: Float32Array;
	yPositions: Float32Array;
}

// Generate sample data
function generateSampleData(): ParticleData {
	const count = 10_000_000; // 1 million particles for demo, adjust as needed

	const xPositions = new Float32Array(count);
	const yPositions = new Float32Array(count);

	for (let i = 0; i < count; i++) {
		xPositions[i] = (Math.random() - 0.5) * 100 * Math.sqrt(count); // Expanded to 100k x 100k area
		yPositions[i] = (Math.random() - 0.5) * 100 * Math.sqrt(count);
	}

	return { xPositions, yPositions };
}

// Main particle system component
const ParticleCloud: React.FC<ParticleCloudProps> = ({ xPositions, yPositions }) => {
	const particleCount = xPositions.length;
	const particles = useRef<THREE.Points>(null);

	// Create combined positions for the buffergeometry
	const positions = useMemo(() => {
		const positions = new Float32Array(particleCount * 3);

		for (let i = 0; i < particleCount; i++) {
			positions[i * 3] = xPositions[i];
			positions[i * 3 + 1] = yPositions[i];
			positions[i * 3 + 2] = 0;
		}

		return positions;
	}, [xPositions, yPositions, particleCount]);

	// Define uniforms in a format compatible with Three.js
	const uniforms = useMemo(() => ({ pointSize: { value: 10.0 } }), []);

	return (
		<points ref={particles}>
			<bufferGeometry>
				<bufferAttribute attach="attributes-position" args={[positions, 3]} />
			</bufferGeometry>
			<shaderMaterial
				transparent
				uniforms={uniforms as THREE.ShaderMaterialParameters["uniforms"]}
				vertexShader={vertexShader}
				fragmentShader={fragmentShader}
			/>
		</points>
	);
};

// Post-processing effects setup
const Effects: React.FC<{}> = () => {
	return (
		<EffectComposer>
			<Bloom intensity={1.5} luminanceThreshold={0.4} luminanceSmoothing={0.85} />
		</EffectComposer>
	);
};

// Camera controls with 2D pan and zoom
function CameraController(): null {
	const { camera, gl } = useThree();
	const initialZPos = 500;

	useEffect(() => {
		// Set initial camera position
		camera.position.z = initialZPos;

		// State to track drag
		let isDragging = false;
		let previousMousePosition = { x: 0, y: 0 };

		// Handle mouse down - start of drag
		const handleMouseDown = (e: MouseEvent) => {
			isDragging = true;
			previousMousePosition = { x: e.clientX, y: e.clientY };
		};

		// Handle mouse move - pan camera during drag
		const handleMouseMove = (e: MouseEvent) => {
			if (!isDragging) return;

			// Calculate mouse movement delta
			const deltaX = e.clientX - previousMousePosition.x;
			const deltaY = e.clientY - previousMousePosition.y;

			// Get viewport dimensions
			const viewportWidth = gl.domElement.clientWidth;
			const viewportHeight = gl.domElement.clientHeight;

			// Calculate how much world space is visible at current zoom
			const cameraFov = (camera as THREE.PerspectiveCamera).fov * (Math.PI / 180);
			const worldSpaceHeight = 2 * Math.tan(cameraFov / 2) * camera.position.z;
			const worldSpaceWidth = worldSpaceHeight * (viewportWidth / viewportHeight);

			// Scale mouse movement to world space
			const worldDeltaX = (deltaX / viewportWidth) * worldSpaceWidth;
			const worldDeltaY = (deltaY / viewportHeight) * worldSpaceHeight;

			// Move camera in opposite direction (to make it feel like dragging the scene)
			camera.position.x -= worldDeltaX;
			camera.position.y += worldDeltaY; // Invert Y axis

			// Update previous position
			previousMousePosition = { x: e.clientX, y: e.clientY };
		};

		// Handle mouse up - end of drag
		const handleMouseUp = () => {
			isDragging = false;
		};

		// Handle wheel - zoom in/out centered on mouse position
		const handleWheel = (e: WheelEvent) => {
			e.preventDefault();

			// Get mouse position in normalized device coordinates (-1 to +1)
			const rect = gl.domElement.getBoundingClientRect();
			const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
			const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

			// Convert to raycaster for accurate world point calculation
			const raycaster = new THREE.Raycaster();
			raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), camera);

			// Calculate the point on z=0 plane (our 2D space)
			const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
			const targetPoint = new THREE.Vector3();
			raycaster.ray.intersectPlane(plane, targetPoint);

			// Get current camera position and calculate zoom
			const zoomSpeed = 0.04; // Reduced to half speed
			const direction = e.deltaY > 0 ? 1 : -1; // 1 = zoom out, -1 = zoom in
			const factor = 1 + direction * zoomSpeed;

			// Calculate new z position - extreme max zoom for viewing massive point clouds (100,000 x 100,000)
			const newZ = Math.max(50, Math.min(150000, camera.position.z * factor));

			// Calculate the offset to maintain mouse position
			const currentX = camera.position.x;
			const currentY = camera.position.y;

			// Move camera toward/away from target point based on zoom direction
			camera.position.x = targetPoint.x + (currentX - targetPoint.x) * (newZ / camera.position.z);
			camera.position.y = targetPoint.y + (currentY - targetPoint.y) * (newZ / camera.position.z);
			camera.position.z = newZ;
		};

		// Add event listeners
		const canvas = gl.domElement;
		canvas.addEventListener("mousedown", handleMouseDown);
		canvas.addEventListener("mousemove", handleMouseMove);
		window.addEventListener("mouseup", handleMouseUp);
		canvas.addEventListener("wheel", handleWheel, { passive: false });

		// Clean up event listeners
		return () => {
			canvas.removeEventListener("mousedown", handleMouseDown);
			canvas.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
			canvas.removeEventListener("wheel", handleWheel);
		};
	}, [camera, gl]);

	return null;
}

// Create a context to share camera position data
const CameraContext = React.createContext<{
	position: { x: number; y: number; zoom: number };
}>({
	position: { x: 0, y: 0, zoom: 100 },
});

// Main app component
const App: React.FC<{}> = () => {
	// Generate or load your particle data here
	// For demonstration, we'll generate random points

	const { xPositions, yPositions } = useMemo<ParticleData>(() => generateSampleData(), []);

	// State to track camera position for display
	const [cameraPosition, setCameraPosition] = useState({ x: 0, y: 0, zoom: 100 });

	// Update camera position in UI
	const updateCameraPosition = (x: number, y: number, z: number) => {
		setCameraPosition({
			x: Math.round(x),
			y: Math.round(y),
			zoom: Math.round((500 / z) * 100),
		});
	};

	return (
		<main style={{ width: "100vw", height: "100vh", position: "relative" }}>
			<CameraContext.Provider value={{ position: cameraPosition }}>
				<Canvas
					gl={{
						powerPreference: "high-performance",
					}}
					camera={{ position: [0, 0, 500], far: 200000 }}
				>
					<CameraPositionTracker onPositionChange={updateCameraPosition} />
					<CameraController />
					<ParticleCloud xPositions={xPositions} yPositions={yPositions} />
					<Effects />
				</Canvas>

				{/* Simple UI overlay for pan/zoom info */}
				<div
					style={{
						position: "absolute",
						bottom: "10px",
						left: "10px",
						background: "rgba(0,0,0,0.5)",
						color: "white",
						padding: "8px",
						borderRadius: "4px",
						fontSize: "12px",
						fontFamily: "monospace",
					}}
				>
					X: {cameraPosition.x} | Y: {cameraPosition.y} | Zoom: {cameraPosition.zoom}%
				</div>
			</CameraContext.Provider>
		</main>
	);
};

// Component to track camera position and report it
function CameraPositionTracker({
	onPositionChange,
}: {
	onPositionChange: (x: number, y: number, z: number) => void;
}): null {
	const { camera } = useThree();

	useFrame(() => {
		onPositionChange(camera.position.x, camera.position.y, camera.position.z);
	});

	return null;
}

// Initialize react app
const rootElement = document.getElementById("root");
if (rootElement) {
	const root = createRoot(rootElement);
	root.render(<App />);
}
