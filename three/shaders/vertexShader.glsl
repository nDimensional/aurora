uniform float pointSize;

void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    
    // Enhanced point sizing for extreme distances
    // Base size scaled by distance with a minimum size threshold
    float distanceScale = 1000.0 / -mvPosition.z;
    float minPointSize = 0.5; // Ensures points remain visible at extreme distances
    
    gl_PointSize = max(pointSize * distanceScale, minPointSize);
    gl_Position = projectionMatrix * mvPosition;
}
