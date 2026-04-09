# Technical Architecture - POV Effect

## System Overview

This project implements a sophisticated Persistence of Vision (POV) effect using a dual-scene rendering pipeline in React Three Fiber.

## Rendering Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    Frame Render Cycle                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────┐
        │     Pass 1: Mask Scene (FBO)        │
        │  Priority: -1 (renders first)       │
        └─────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                             │
        ▼                                             ▼
┌──────────────┐                            ┌──────────────┐
│ 3D Geometry  │                            │  Ortho Cam   │
│  - Box       │────────────────────────────│  Maps 3D to  │
│  - Torus     │    Renders white on        │   2D Grid    │
│  - Sphere    │      black BG              └──────────────┘
│  - Tetra     │
└──────────────┘
        │
        ▼
┌──────────────────────────┐
│  WebGLRenderTarget (FBO) │
│  Resolution: canvas size │
│    divided by pixelSize  │
└──────────────────────────┘
        │
        └────────────────────────────────┐
                                          │
                                          ▼
        ┌─────────────────────────────────────┐
        │   Pass 2: Display Scene (Screen)    │
        │    Priority: 0 (renders second)     │
        └─────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                             │
        ▼                                             ▼
┌──────────────┐                            ┌──────────────┐
│ Full-Screen  │                            │ Shader Logic │
│   Plane      │────────────────────────────│              │
│   (2x2)      │   Fragment shader          │  Step/Fract  │
└──────────────┘   combines textures        │  Functions   │
                                             └──────────────┘
        │
        ├──── Input: FBO Mask Texture (white where shape is)
        ├──── Input: Static Noise DataTexture (checkerboard)
        ├──── Input: Time uniform (for 5Hz toggle)
        │
        ▼
┌──────────────────────────┐
│   Final Frame Output     │
│  Noise inverts at 5Hz    │
│  where shape overlaps    │
└──────────────────────────┘
```

## Component Hierarchy

```
App.jsx
  └── Canvas
        └── POVScene.jsx
              ├── createPortal(maskSceneRef)
              │     ├── OrthographicCamera
              │     └── MaskScene.jsx
              │           ├── Geometry (Box/Torus/Sphere/Tetra)
              │           ├── MeshBasicMaterial (white)
              │           └── Wireframe (Drei)
              │
              └── DisplayPlane.jsx
                    ├── PlaneGeometry (2x2)
                    └── ShaderMaterial
                          ├── uMaskTexture (from FBO)
                          ├── uNoiseTexture (static DataTexture)
                          ├── uTime (5Hz toggle)
                          └── uPixelSize (grid resolution)
```

## Data Flow

### 1. Initialization Phase

```javascript
// POVScene.jsx - runs once on mount
useMemo(() => {
  // Convert CSS canvas size to drawing-buffer size for HiDPI correctness.
  // This keeps pixelSize behavior consistent on 1x and 2x displays.
  const dpr = gl.getPixelRatio()
  const bufferWidth = Math.round(cssWidth * dpr)
  const bufferHeight = Math.round(cssHeight * dpr)

  // Calculate FBO resolution based on drawing-buffer size and pixelSize
  fboResolution = {
    width: ceil(bufferWidth / pixelSize),
    height: ceil(bufferHeight / pixelSize)
  }
  
  // Create render target
  renderTarget = new WebGLRenderTarget(fboResolution)
  
  // Generate static noise texture
  noiseTexture = createNoiseTexture(pixelSize, width, height)
  
  // Calculate camera bounds for physics
  bounds = { left, right, top, bottom }
})
```

### 2. Frame Render Phase

```javascript
// Priority -1: Render to FBO first
useFrame(({ gl }) => {
  gl.setRenderTarget(renderTarget)
  gl.clear()
  gl.render(maskScene, orthoCam)
  gl.setRenderTarget(null)
}, -1)

// Physics update (MaskScene.jsx)
useFrame((state, delta) => {
  // Update position based on velocity
  position += velocity * delta
  
  // Bounce at boundaries
  if (outOfBounds) {
    velocity *= -1
  }
})

// Priority 0: Render display scene
useFrame((state) => {
  shaderUniforms.uTime = elapsedTime
  // Main render happens automatically
})
```

### 3. Shader Processing

```glsl
// Fragment Shader (displayShader.js)
void main() {
  // Sample mask (white = shape, black = background)
  float mask = texture2D(uMaskTexture, vUv).r;
  
  // Calculate grid-aligned UV for noise texture
  vec2 pixelCoord = floor(gl_FragCoord.xy / uPixelSize);
  vec2 noiseUv = pixelCoord / (uResolution / uPixelSize);
  float noise = texture2D(uNoiseTexture, noiseUv).r;
  
  // 5Hz toggle: fract(time * 5) gives 0-1 repeating wave
  // step(0.5, x) converts to 0 or 1 (square wave)
  float toggle = step(0.5, fract(uTime * uToggleFrequency));
  
  // Invert noise where mask is present
  float shouldInvert = step(0.5, mask) * toggle;
  float finalColor = mix(noise, 1.0 - noise, shouldInvert);
  
  gl_FragColor = vec4(vec3(finalColor), 1.0);
}
```

## Key Technical Decisions

### Why OrthographicCamera for Mask Scene?

An orthographic projection ensures that the 3D shape maps cleanly to the 2D grid without perspective distortion. This makes the mask texture align perfectly with the pixel grid of the noise texture.

### Why Low-Res FBO?

The FBO resolution matches the pixel grid (canvas size / pixelSize). This ensures:
- 1:1 mapping between mask pixels and noise squares
- Optimal performance (rendering fewer pixels)
- Clean pixel-aligned edges

### Why DataTexture for Noise?

`DataTexture` creates a texture from raw pixel data, giving us:
- Complete control over each pixel value
- Static pattern (no shader calculation per frame)
- Optimal performance (texture lookup vs. procedural generation)
- No unwanted filtering or interpolation (NearestFilter)

### Why Step/Fract Instead of If Statements?

GPU shader branching (if/else) can hurt performance. Using mathematical functions:
```glsl
// Instead of:
if (time % 0.2 < 0.1) { invert = 1.0; } else { invert = 0.0; }

// We use:
float invert = step(0.5, fract(time * 5.0));
```

This runs in parallel across all pixels without branching.

### Why createPortal?

`createPortal` renders the mask scene to a separate scene graph that never appears on screen directly. It only renders to the FBO, keeping the render pipeline clean and modular.

### Why Priority -1 for FBO Render?

The mask must be rendered before the display scene can use it as a texture. Setting priority to -1 ensures it runs first in the frame cycle.

## Performance Optimizations

1. **Memoization**
   - Noise texture: Created once, never regenerated
   - FBO: Only recreated when canvas size or pixelSize changes
   - Geometry: Only recreated when shapeType or size changes

2. **Minimal Texture Updates**
   - Noise texture is static (never updated)
   - FBO is reused every frame (not recreated)
   - Only uniforms are updated per frame

3. **Efficient Shaders**
   - Branch-free logic using step/mix
   - Texture lookups instead of procedural generation
   - Minimal uniform updates

4. **Smart Resolution**
   - FBO renders at grid resolution, not full canvas resolution
   - Automatic downscaling based on pixelSize parameter

## Physics System

Simple AABB (Axis-Aligned Bounding Box) collision:

```javascript
// Calculate approximate radius
const halfSize = shapeSize * 0.6

// Check boundaries and bounce
if (x + halfSize > bounds.right) {
  x = bounds.right - halfSize
  velocityX *= -1
}
// ... repeat for left, top, bottom
```

This creates a perfectly elastic collision (no energy loss).

## Coordinate Systems

1. **Mask Scene (Orthographic)**
   - Units: World space (-5 to 5 for typical setup)
   - Camera: OrthographicCamera with bounds matching aspect ratio
   - Renders to FBO at grid resolution

2. **Display Scene (Perspective)**
   - Units: Normalized device coordinates (-1 to 1)
   - Full-screen plane at z=0
   - UV coordinates (0 to 1) map to FBO texture

3. **Fragment Shader**
   - gl_FragCoord: Window space coordinates (pixels)
   - vUv: Texture coordinates (0 to 1)
   - Grid coordinates: floor(gl_FragCoord / pixelSize)

## Extension Points

Want to modify the effect? Here are the key extension points:

- **Different noise patterns**: Modify `createNoiseTexture.js`
- **Custom shapes**: Add cases to `MaskScene.jsx` geometry switch
- **Alternative effects**: Edit fragment shader in `displayShader.js`
- **Advanced physics**: Extend `useFrame` in `MaskScene.jsx`
- **Post-processing**: Chain additional passes after DisplayPlane
- **Multi-shape**: Render multiple MaskScene instances to the same FBO
