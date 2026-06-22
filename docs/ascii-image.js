class ImageAsciiSource {
  constructor(src, options = {}) {
    this.src = "";
    this.charset = options.charset || "wholetamdis";
    this.invert = options.invert || true;
    this.cache = new Map();
    this.failed = false;
    this.ready = false;
    this.onchange = null;
    this.canvas = document.createElement("canvas");
    this.context = this.canvas.getContext("2d", { willReadFrequently: true });
    this.media = null;
    this.mediaKind = "image";
    this.loadToken = 0;
    this.lastAnimatedRows = null;
    this.lastAnimatedSignature = "";
    this.setSource(src);
  }

  isVideoSource(src) {
    return /\.(mp4|webm|ogv|ogg)(?:$|[?#])/i.test(src);
  }

  isLeftAlignedSource() {
    return /(^|\/)backdrop(?:mobile)?\.mp4(?:$|[?#])/i.test(this.src);
  }

  resetState() {
    this.ready = false;
    this.failed = false;
    this.cache.clear();
    this.lastAnimatedRows = null;
    this.lastAnimatedSignature = "";
  }

  notifyChange() {
    if (this.onchange) this.onchange();
  }

  attachImage(media, token) {
    media.decoding = "async";
    media.addEventListener("load", () => {
      if (token !== this.loadToken) return;
      this.ready = true;
      this.failed = false;
      this.cache.clear();
      this.notifyChange();
    });
    media.addEventListener("error", () => {
      if (token !== this.loadToken) return;
      this.ready = false;
      this.failed = true;
      this.notifyChange();
    });
  }

  attachVideo(media, token) {
    const markReady = () => {
      if (token !== this.loadToken) return;
      if (media.videoWidth <= 0 || media.videoHeight <= 0) return;
      this.ready = true;
      this.failed = false;
      this.notifyChange();
    };

    const markFailed = () => {
      if (token !== this.loadToken) return;
      this.ready = false;
      this.failed = true;
      this.notifyChange();
    };

    media.muted = true;
    media.loop = true;
    media.autoplay = true;
    media.playsInline = true;
    media.preload = "auto";
    media.addEventListener("loadeddata", markReady);
    media.addEventListener("canplay", markReady);
    media.addEventListener("playing", markReady);
    media.addEventListener("error", markFailed);
  }

  setSource(src) {
    if (this.src === src) return;

    this.loadToken += 1;
    this.src = src;
    this.resetState();

    if (this.media && this.mediaKind === "video") {
      this.media.pause();
      this.media.removeAttribute("src");
      this.media.load();
    }

    const token = this.loadToken;
    this.mediaKind = this.isVideoSource(src) ? "video" : "image";
    this.media = this.mediaKind === "video" ? document.createElement("video") : new Image();

    if (this.mediaKind === "video") {
      this.attachVideo(this.media, token);
      this.media.src = src;
      this.media.load();
      this.play();
      return;
    }

    this.attachImage(this.media, token);
    this.media.src = src;
  }

  reload() {
    this.cache.clear();
    this.lastAnimatedRows = null;
    this.lastAnimatedSignature = "";

    if (!this.media || this.mediaKind !== "video") return;

    this.ready = false;
    this.failed = false;

    try {
      this.media.pause();
      this.media.currentTime = 0;
    } catch {}

    this.media.load();
    this.play();
  }

  play() {
    if (!this.media || this.mediaKind !== "video") return;

    const playPromise = this.media.play();

    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  }

  currentSignature(bounds) {
    const sizeKey = `${bounds.cols}x${bounds.rows}`;
    if (this.mediaKind !== "video") return sizeKey;

    const frameTime = Number.isFinite(this.media.currentTime)
      ? this.media.currentTime.toFixed(3)
      : "0.000";
    return `${sizeKey}@${frameTime}`;
  }

  getRows(bounds) {
    if (!this.ready || this.failed || !this.context || !this.media) return null;

    const signature = this.currentSignature(bounds);

    if (this.mediaKind === "video") {
      if (this.lastAnimatedSignature !== signature) {
        this.lastAnimatedSignature = signature;
        this.lastAnimatedRows = this.convert(bounds);
      }

      return this.lastAnimatedRows;
    }

    if (!this.cache.has(signature)) {
      this.cache.set(signature, this.convert(bounds));
    }

    return this.cache.get(signature);
  }

  sourceDimensions() {
    if (!this.media) return { width: 0, height: 0 };

    if (this.mediaKind === "video") {
      return {
        width: this.media.videoWidth,
        height: this.media.videoHeight
      };
    }

    return {
      width: this.media.naturalWidth,
      height: this.media.naturalHeight
    };
  }

  sourceCrop(bounds) {
    const { width, height } = this.sourceDimensions();
    const imageAspect = width / height;
    const gridAspect = (bounds.cols * bounds.cellW) / (bounds.rows * bounds.cellH);
    let sx = 0;
    let sy = 0;
    let sw = width;
    let sh = height;

    if (imageAspect > gridAspect) {
      sw = sh * gridAspect;
      sx = this.isLeftAlignedSource() ? 0 : (width - sw) / 2;
    } else {
      sh = sw / gridAspect;
      sy = 0;
    }

    return { sx, sy, sw, sh };
  }

  convert(bounds) {
    const cols = bounds.cols;
    const rows = bounds.rows;
    const crop = this.sourceCrop(bounds);
    this.canvas.width = cols;
    this.canvas.height = rows;
    this.context.clearRect(0, 0, cols, rows);
    this.context.drawImage(
      this.media,
      crop.sx,
      crop.sy,
      crop.sw,
      crop.sh,
      0,
      0,
      cols,
      rows
    );

    const pixels = this.context.getImageData(0, 0, cols, rows).data;
    const output = [];

    for (let y = 0; y < rows; y += 1) {
      let line = "";

      for (let x = 0; x < cols; x += 1) {
        const index = (y * cols + x) * 4;
        const alpha = pixels[index + 3] / 255;
        const luminance =
          (0.2126 * pixels[index] +
            0.7152 * pixels[index + 1] +
            0.0722 * pixels[index + 2]) /
          255;
        const value = this.invert ? 1 - luminance : luminance;
        const adjusted = Math.max(0, Math.min(1, value * alpha));
        const charIndex = Math.round(adjusted * (this.charset.length - 1));
        line += this.charset[charIndex];
      }

      output.push(line);
    }

    return output;
  }
}

window.ImageAsciiSource = ImageAsciiSource;
