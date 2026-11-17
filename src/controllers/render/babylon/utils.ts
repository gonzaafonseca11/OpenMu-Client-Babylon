import { Engine, Scene } from './exports';
import { devQuery } from '@/core/devSeams';
import { installBitmapDecode } from './bitmapDecode';
import { installGreasedLineBufferRelease } from './greasedLineBuffers';
import { deferDeletingCompilingPrograms } from './programDelete';
import { patientCompileWait } from './compileWait';

export async function addInspectorForScene(scene: Scene) {
  const switchDebugLayer = () => {
    //@ts-ignore
    if (scene.debugLayer.isVisible()) {
      //@ts-ignore
      scene.debugLayer.hide();
    } else {
      //@ts-ignore
      scene.debugLayer.show({ overlay: true });
    }
  };

  // hide/show the Inspector
  window.addEventListener('keydown', async ev => {
    // Shift+Ctrl+Alt+I
    if (ev.shiftKey && ev.ctrlKey && ev.altKey && ev.keyCode === 73) {
      const debuggerScript = document.querySelector('script[inspector]');

      if (!debuggerScript) {
        console.log(`Start loading inspector...`);
        const s = document.createElement('script');
        s.setAttribute('inspector', 'true');
        s.src =
          'https://cdn.babylonjs.com/inspector/babylon.inspector.bundle.js';

        s.onload = () => {
          console.log(`Inspector loaded!`);
          switchDebugLayer();
        };
        s.onerror = () => {
          console.log(`Inspector failed to load`);
        };
        document.body.appendChild(s);
        return;
      }

      switchDebugLayer();
    }
  });
}

function createCanvas() {
  const canvas = document.createElement('canvas');
  canvas.style.width = '400';
  canvas.style.height = '300';
  canvas.width = 400;
  canvas.height = 300;

  return canvas;
}

/**
 * The G-buffer pass keys its shader on `BonesPerMesh` even under BONETEXTURE,
 * where the count is never read, so each bone count linked its own copy of
 * the program. The materials and shadow passes already leave it out there.
 */
function shareGeometryPassAcrossBoneCounts(engine: Engine): void {
  // `?geoBones=1`: one program per bone count, as before, for the A/B.
  if (devQuery('geoBones') === '1') return;

  const original = engine.createEffect.bind(engine) as Engine['createEffect'];

  engine.createEffect = ((...args: Parameters<Engine['createEffect']>) => {
    const [baseName, options] = args;

    if (
      baseName === 'geometry' &&
      !Array.isArray(options) &&
      typeof options.defines === 'string' &&
      options.defines.includes('#define BONETEXTURE true')
    ) {
      options.defines = options.defines.replace(
        /^#define BonesPerMesh \d+\n?/m,
        ''
      );
    }

    return original(...args);
  }) as Engine['createEffect'];
}

export function createEngine(
  baseCanvas?: HTMLCanvasElement,
  enableAntialiasing?: boolean
) {
  // create the canvas html element and attach it to the webpage
  const canvas = baseCanvas || createCanvas();

  // initialize babylon scene and engine
  const shouldScale = true;
  const engine = new Engine(
    canvas,
    !!enableAntialiasing,
    {
      audioEngine: true,
      stencil: true,
      useHighPrecisionFloats: true,
      // Asks the browser for the discrete GPU on dual-GPU machines; 'low-power'
      // explicitly requests the integrated one.
      powerPreference: 'high-performance',
      doNotHandleContextLost: false,
      limitDeviceRatio: enableAntialiasing ? undefined : 1,
      failIfMajorPerformanceCaveat: false,
      premultipliedAlpha: false,
      alpha: false,
      preserveDrawingBuffer: false,
      forceSRGBBufferSupportState: false,
    },
    shouldScale
  );

  if (Engine.audioEngine) {
    Engine.audioEngine.useCustomUnlockedButton = true;
  }

  shareGeometryPassAcrossBoneCounts(engine);

  // WebGL: to support 'flat' varying
  const gl = engine._gl;
  const pvk = gl.getExtension('WEBGL_provoking_vertex');
  if (pvk) {
    pvk.provokingVertexWEBGL(pvk.FIRST_VERTEX_CONVENTION_WEBGL);
  }

  deferDeletingCompilingPrograms(engine);
  patientCompileWait();

  void installBitmapDecode(engine);
  installGreasedLineBufferRelease();

  return { engine, canvas };
}
