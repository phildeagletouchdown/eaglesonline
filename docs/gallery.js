const galleryRoot = document.querySelector("[data-gallery]");

const galleryImages = [
  "../data/braedonlong.jpg",
  "../data/broedonlang.jpg"
];

const transitionMs = 360;
const borderProbe = document.createElement("span");
borderProbe.textContent = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
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

function renderGallery(images) {
  const cards = images.map((path, index) => {
    const alt = altText(path);

    return `
      <article
        class="gallery-card"
        data-gallery-card
        data-index="${index}"
        data-alt="${alt}"
        tabindex="0"
        aria-label="${alt}"
      >
        <pre class="gallery-card-border" data-gallery-border aria-hidden="true"></pre>
        <div class="gallery-card-media">
          <img src="${path}" alt="${alt}" loading="lazy">
        </div>
      </article>
    `;
  }).join("");

  galleryRoot.innerHTML = `
    ${cards}
    <aside class="gallery-caption" data-gallery-caption aria-live="polite">
      <pre class="gallery-card-border" data-gallery-border aria-hidden="true"></pre>
      <p class="gallery-card-copy-label">alt text</p>
      <p class="gallery-card-copy-text" data-gallery-caption-text></p>
    </aside>
  `;
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

  const cards = [...galleryRoot.querySelectorAll("[data-gallery-card]")];
  const caption = galleryRoot.querySelector("[data-gallery-caption]");
  const captionText = galleryRoot.querySelector("[data-gallery-caption-text]");
  const animatedElements = [...cards, caption].filter(Boolean);
  const state = {
    activeCard: null,
    locked: false,
    queuedCard: undefined,
    timer: 0
  };

  const resizeObserver = typeof ResizeObserver === "function"
    ? new ResizeObserver((entries) => {
      entries.forEach((entry) => drawAsciiBorder(entry.target));
    })
    : null;

  function writeState(nextCard) {
    galleryRoot.dataset.mode = nextCard ? "focus" : "idle";
    galleryRoot.dataset.locked = "true";
    let railRow = 1;

    cards.forEach((card) => {
      const isActive = card === nextCard;
      card.classList.toggle("is-active", isActive);
      card.classList.toggle("is-rail", Boolean(nextCard) && !isActive);
      card.style.gridRow = nextCard && !isActive ? String(railRow++) : "";
    });

    if (caption && captionText) {
      caption.classList.toggle("is-visible", Boolean(nextCard));
      captionText.textContent = nextCard ? nextCard.dataset.alt : "";
    }

    syncBorders(animatedElements);
  }

  function finish() {
    state.locked = false;
    galleryRoot.dataset.locked = "false";
    animatedElements.forEach((element) => {
      element.style.transition = "";
      element.style.transform = "";
    });
    syncBorders(animatedElements);

    if (state.queuedCard !== undefined && state.queuedCard !== state.activeCard) {
      const queued = state.queuedCard;
      state.queuedCard = undefined;
      transitionTo(queued);
      return;
    }

    state.queuedCard = undefined;
  }

  function transitionTo(nextCard) {
    if (state.locked) {
      state.queuedCard = nextCard;
      return;
    }

    if (state.activeCard === nextCard) return;

    window.clearTimeout(state.timer);
    state.locked = true;
    state.queuedCard = undefined;

    const beforeRects = rectMap(animatedElements);
    state.activeCard = nextCard;
    writeState(nextCard);
    flip(animatedElements, beforeRects);

    state.timer = window.setTimeout(finish, transitionMs + 60);
  }

  cards.forEach((card) => {
    card.addEventListener("mouseenter", () => transitionTo(card));
    card.addEventListener("focus", () => transitionTo(card));

    if (resizeObserver) {
      resizeObserver.observe(card);
    }
  });

  if (caption && resizeObserver) {
    resizeObserver.observe(caption);
  }

  galleryRoot.addEventListener("mouseleave", () => transitionTo(null));
  galleryRoot.addEventListener("focusout", (event) => {
    if (galleryRoot.contains(event.relatedTarget)) return;
    transitionTo(null);
  });

  galleryRoot.dataset.mode = "idle";
  galleryRoot.dataset.locked = "false";
  syncBorders(animatedElements);
  window.addEventListener("resize", () => syncBorders(animatedElements));
}
