void main() {
    // Create a circle by using the distance from the center
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);

    // Create a clean circle with minimal anti-aliasing
    // Only apply anti-aliasing in a very narrow band at the edge
    float alpha = 1.0 - smoothstep(0.495, 0.5, dist);
    
    // Discard pixels outside the circle entirely
    if (dist > 0.5) {
        discard;
    }
    
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha); // White particles
}
