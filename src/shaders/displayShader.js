export const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const updateStateVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const updateStateFragmentShader = `
  uniform sampler2D uPrevState;
  uniform sampler2D uMaskTexture;
  uniform sampler2D uPatternTexture;
  uniform float uPatternIsRgb;

  varying vec2 vUv;

  void main() {
    float mask = texture2D(uMaskTexture, vUv).r;
    vec4 prev = texture2D(uPrevState, vUv);
    vec4 pat = texture2D(uPatternTexture, vUv);
    float maskPresent = step(0.5, mask);
    vec4 grayPat = vec4(vec3(pat.r), 1.0);
    vec4 next = mix(grayPat, pat, step(0.5, uPatternIsRgb));
    gl_FragColor = mix(prev, next, maskPresent);
  }
`

export const updateAccumulationFragmentShader = `
  uniform sampler2D uPrevAccum;
  uniform sampler2D uMaskTexture;
  uniform sampler2D uColorTexture;

  varying vec2 vUv;

  void main() {
    vec4 prev = texture2D(uPrevAccum, vUv);
    float mask = texture2D(uMaskTexture, vUv).r;

    vec3 nextColor = texture2D(uColorTexture, vUv).rgb;
    float maskPresent = step(0.5, mask);
    vec3 result = mix(prev.rgb, nextColor, maskPresent);

    gl_FragColor = vec4(result, 1.0);
  }
`

export const fragmentShader = `
  uniform sampler2D uMaskTexture;
  uniform sampler2D uNoiseTexture;
  uniform sampler2D uStateTexture;
  uniform sampler2D uAccumTexture;
  uniform sampler2D uCamoBase;
  uniform sampler2D uCamoAlt;
  uniform float uTime;
  uniform vec2 uNoiseResolution;
  uniform float uDebugMode;
  uniform float uBlendMode;
  uniform float uExperimentMode;
  uniform float uBackgroundMode;

  varying vec2 vUv;

  void main() {
    if (uDebugMode > 0.5) {
      vec4 maskColor = texture2D(uMaskTexture, vUv);
      gl_FragColor = maskColor;
      return;
    }

    if (uExperimentMode > 0.5) {
      vec3 accum = texture2D(uAccumTexture, vUv).rgb;
      gl_FragColor = vec4(accum, 1.0);
      return;
    }

    float mask = texture2D(uMaskTexture, vUv).r;
    vec2 gridCoord = floor(vUv * uNoiseResolution);
    vec2 noiseUv = (gridCoord + 0.5) / uNoiseResolution;
    float isMaskPresent = step(0.5, mask);

    if (uBlendMode < 0.5) {
      if (uBackgroundMode < 0.5) {
        float noise = texture2D(uNoiseTexture, noiseUv).r;
        float v = mix(noise, 1.0 - noise, isMaskPresent);
        gl_FragColor = vec4(vec3(v), 1.0);
      } else if (uBackgroundMode < 1.5) {
        gl_FragColor = vec4(vec3(mix(0.0, 1.0, isMaskPresent)), 1.0);
      } else {
        vec3 base = texture2D(uCamoBase, noiseUv).rgb;
        vec3 alt = texture2D(uCamoAlt, noiseUv).rgb;
        gl_FragColor = vec4(mix(base, alt, isMaskPresent), 1.0);
      }
      return;
    }

    vec4 st = texture2D(uStateTexture, noiseUv);
    if (uBackgroundMode > 1.5) {
      gl_FragColor = vec4(st.rgb, 1.0);
    } else {
      gl_FragColor = vec4(vec3(st.r), 1.0);
    }
  }
`
