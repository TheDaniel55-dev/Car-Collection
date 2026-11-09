// On-device OCR (Tesseract.js, self-hosted under ./ocr). Loaded lazily; cached by the service worker.
let workerP;

const abs = (p) => new URL(p, document.baseURI).href;

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('ocr-missing'));
    document.head.appendChild(s);
  });
}

async function getWorker(onStatus) {
  if (!workerP) {
    workerP = (async () => {
      await loadScript(abs('ocr/tesseract.min.js'));
      return window.Tesseract.createWorker('eng', 1, {
        workerPath: abs('ocr/worker.min.js'),
        corePath: abs('ocr/core/'),
        langPath: abs('ocr/lang'),
        workerBlobURL: false,
        cacheMethod: 'none',
        logger: (m) => onStatus?.(m),
      });
    })().catch((e) => { workerP = null; throw e; });
  }
  return workerP;
}

/** Returns recognised text for an image canvas/blob/data URL. */
export async function recognize(image, onStatus) {
  const w = await getWorker(onStatus);
  const { data } = await w.recognize(image);
  return data.text || '';
}
