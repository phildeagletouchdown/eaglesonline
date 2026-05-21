const galleryRoot = document.querySelector("[data-gallery]");

const galleryImages = [
  "../data/braedonlong.jpg",
  "../data/broedonlang.jpg"
];

const transitionMs = 260;
const borderProbe = document.createElement("span");
borderProbe.textContent = "THEONLYWAYOUTISTHROUGH";
borderProbe.setAttribute("aria-hidden", "true");
borderProbe.style.position = "fixed";
borderProbe.style.left = "-9999px";
borderProbe.style.top = "0";
borderProbe.style.whiteSpace = "pre";
borderProbe.style.pointerEvents = "none";
document.body.appendChild(borderProbe);

function fileStem(path) {
  return path.split("/").pop().replace(/\.[^.]+$/, "");
}

function humanizeStem(stem) {
  return stem
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();
}

function altText(path) {
  return `photo labeled ${humanizeStem(fileStem(path))}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fitCell(value, width) {
  const normalized = String(value).toUpperCase();
  return normalized.length > width
    ? normalized.slice(0, Math.max(0, width - 1)) + ">"
    : normalized.padEnd(width, " ");
}

function rowMarkup(item, index) {
  const row = String(index + 1).padStart(2, "0");
  const file = fitCell(item.label, 20);
  const action = fitCell("view", 8);

  return `
    <button
      class="gallery-row"
      type="button"
      data-gallery-row
      data-index="${index}"
      data-row="${row}"
      aria-label="View ${escapeHtml(item.label)}"
    >
      <span class="gallery-row-file">${escapeHtml(` ${file} |`)}</span>
      <span class="gallery-row-action">${escapeHtml(` ${action} |`)}</span>
    </button>
  `;
}

function renderGallery(images) {
  const items = images.map((path) => ({
    path,
    label: humanizeStem(fileStem(path)),
    alt: altText(path)
  }));
  const rows = items.map(rowMarkup).join("");

  galleryRoot.innerHTML = `
    <div class="gallery-table" aria-label="Gallery files">
      ${rows}
    </div>

    <aside class="gallery-preview" data-gallery-preview aria-live="polite">
      <p class="gallery-preview-title" data-gallery-preview-title></p>
      <div class="gallery-preview-frame" data-gallery-frame>
        <pre class="gallery-card-border" data-gallery-border aria-hidden="true"></pre>
        <div class="gallery-preview-media">
          <img data-gallery-preview-image alt="">
        </div>
      </div>
      <p class="gallery-preview-caption" data-gallery-preview-caption></p>
    </aside>
  `;

  galleryRoot.__galleryItems = items;
}

function measureCharacterWidth(element) {
  const styles = getComputedStyle(element);
  borderProbe.style.font = [
    styles.fontStyle,
    styles.fontVariant,
    styles.fontWeight,
    `${styles.fontSize}/${styles.lineHeight}`,
    styles.fontFamily
  ].join(" ");

  return borderProbe.getBoundingClientRect().width / borderProbe.textContent.length;
}

function drawAsciiBorder(element) {
  const border = element.querySelector("[data-gallery-border]");
  if (!border) return;

  const styles = getComputedStyle(border);
  const charWidth = measureCharacterWidth(border) || 8;
  const lineHeight = parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) || 14;
  const cols = Math.max(10, Math.floor(element.clientWidth / charWidth));
  const rows = Math.max(5, Math.floor(element.clientHeight / lineHeight));
  const fill = Math.max(0, cols - 2);
  const top = `+${"-".repeat(fill)}+`;
  const middle = `|${" ".repeat(fill)}|`;
  const lines = [top];

  for (let index = 0; index < rows - 2; index += 1) {
    lines.push(middle);
  }

  lines.push(top);
  border.textContent = lines.join("\n");
}

function syncBorders(elements) {
  elements.forEach(drawAsciiBorder);
}

function rectMap(elements) {
  return new Map(elements.map((element) => [element, element.getBoundingClientRect()]));
}

function flip(elements, beforeRects) {
  elements.forEach((element) => {
    const before = beforeRects.get(element);
    const after = element.getBoundingClientRect();
    if (!before || !after.width || !after.height) return;

    const dx = before.left - after.left;
    const dy = before.top - after.top;
    const sx = before.width / after.width;
    const sy = before.height / after.height;

    if (!dx && !dy && sx === 1 && sy === 1) return;

    element.style.transition = "none";
    element.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  });

  void galleryRoot.offsetWidth;

  elements.forEach((element) => {
    element.style.transition = "";
    element.style.transform = "";
  });
}

if (galleryRoot) {
  renderGallery(galleryImages);

  const items = galleryRoot.__galleryItems;
  const rows = [...galleryRoot.querySelectorAll("[data-gallery-row]")];
  const table = galleryRoot.querySelector(".gallery-table");
  const preview = galleryRoot.querySelector("[data-gallery-preview]");
  const frame = galleryRoot.querySelector("[data-gallery-frame]");
  const previewImage = galleryRoot.querySelector("[data-gallery-preview-image]");
  const previewTitle = galleryRoot.querySelector("[data-gallery-preview-title]");
  const previewCaption = galleryRoot.querySelector("[data-gallery-preview-caption]");
  const animatedElements = [table, preview].filter(Boolean);
  const state = {
    activeRow: rows[0] || null,
    locked: false,
    queuedRow: undefined,
    timer: 0,
    lastPointerRow: null,
    lastPointerAt: 0
  };

  const resizeObserver = typeof ResizeObserver === "function" && frame
    ? new ResizeObserver(() => drawAsciiBorder(frame))
    : null;

  function writeState(nextRow) {
    const nextIndex = nextRow ? Number(nextRow.dataset.index) : 0;
    const item = items[nextIndex];

    galleryRoot.dataset.mode = "focus";
    galleryRoot.dataset.locked = "true";

    rows.forEach((row) => {
      const isActive = row === nextRow;
      row.classList.toggle("is-active", isActive);
      row.setAttribute("aria-pressed", String(isActive));
    });

    if (item && previewImage && previewTitle && previewCaption) {
      preview.classList.add("is-swapping");
      previewImage.src = item.path;
      previewImage.alt = item.alt;
      previewTitle.textContent = fitCell(item.label, 20);
      previewCaption.textContent = item.alt.toUpperCase();
      window.requestAnimationFrame(() => preview.classList.remove("is-swapping"));
    }

    if (frame) drawAsciiBorder(frame);
  }

  function finish() {
    state.locked = false;
    galleryRoot.dataset.locked = "false";
    animatedElements.forEach((element) => {
      element.style.transition = "";
      element.style.transform = "";
    });
    syncBorders(frame ? [frame] : []);

    if (state.queuedRow !== undefined && state.queuedRow !== state.activeRow) {
      const queued = state.queuedRow;
      state.queuedRow = undefined;
      transitionTo(queued);
      return;
    }

    state.queuedRow = undefined;
  }

  function transitionTo(nextRow) {
    if (!nextRow) return;

    if (state.locked) {
      state.queuedRow = nextRow;
      return;
    }

    if (state.activeRow === nextRow) return;

    window.clearTimeout(state.timer);
    state.locked = true;
    state.queuedRow = undefined;

    const beforeRects = rectMap(animatedElements);
    state.activeRow = nextRow;
    writeState(nextRow);
    flip(animatedElements, beforeRects);

    state.timer = window.setTimeout(finish, transitionMs + 40);
  }

  function rowFromEvent(event) {
    const row = event.target.closest("[data-gallery-row]");
    return row && galleryRoot.contains(row) ? row : null;
  }

  galleryRoot.addEventListener("pointerover", (event) => {
    const row = rowFromEvent(event);
    if (!row || row.contains(event.relatedTarget)) return;

    state.lastPointerRow = row;
    state.lastPointerAt = performance.now();
    transitionTo(row);
  });

  galleryRoot.addEventListener("focusin", (event) => {
    const row = rowFromEvent(event);
    if (!row) return;

    const followsPointer = row === state.lastPointerRow && performance.now() - state.lastPointerAt < 250;
    if (!followsPointer) transitionTo(row);
  });

  galleryRoot.addEventListener("click", (event) => {
    const row = rowFromEvent(event);
    if (!row) return;
    transitionTo(row);
  });

  galleryRoot.addEventListener("keydown", (event) => {
    const current = rowFromEvent(event);
    if (!current) return;

    const currentIndex = rows.indexOf(current);
    let nextIndex = currentIndex;

    if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex += 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex -= 1;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = rows.length - 1;
    else return;

    event.preventDefault();
    const nextRow = rows[Math.max(0, Math.min(rows.length - 1, nextIndex))];
    nextRow.focus({ preventScroll: true });
    transitionTo(nextRow);
  });

  if (resizeObserver) resizeObserver.observe(frame);

  galleryRoot.dataset.mode = "focus";
  galleryRoot.dataset.locked = "false";
  writeState(state.activeRow);
  galleryRoot.dataset.locked = "false";
  syncBorders(frame ? [frame] : []);
  window.addEventListener("resize", () => syncBorders(frame ? [frame] : []));
}
