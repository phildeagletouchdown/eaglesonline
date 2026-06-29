const galleryRoot = document.querySelector("[data-gallery]");

const fallbackGalleryImages = [
  "/data/braedonlong.jpg",
  "/data/broedonlang.jpg"
];

const columnWidths = [4, 22, 22, 10];

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

function normalizeCell(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function fitCell(value, width) {
  const normalized = normalizeCell(value);

  return normalized.length > width
    ? normalized.slice(0, Math.max(0, width - 1)) + ">"
    : normalized.padEnd(width, " ");
}

function asciiCell(value, width) {
  return ` ${fitCell(value, Math.max(0, width - 2))} `;
}

function asciiRow(values) {
  return `|${values.map((value, index) => asciiCell(value, columnWidths[index])).join("|")}|`;
}

function asciiBorder() {
  return `+${columnWidths.map((width) => "-".repeat(width)).join("+")}+`;
}

function readTiffString(view, tiffStart, fieldOffset, littleEndian) {
  const type = view.getUint16(fieldOffset + 2, littleEndian);
  const count = view.getUint32(fieldOffset + 4, littleEndian);
  const inlineSize = 4;

  if (type !== 2 || count <= 0) return "";

  const valueOffset = count <= inlineSize
    ? fieldOffset + 8
    : tiffStart + view.getUint32(fieldOffset + 8, littleEndian);

  if (valueOffset < 0 || valueOffset + count > view.byteLength) return "";

  const bytes = new Uint8Array(view.buffer, valueOffset, count);
  return new TextDecoder("ascii")
    .decode(bytes)
    .replace(/\0+$/, "")
    .trim();
}

function readJpegIfd0Metadata(buffer) {
  const view = new DataView(buffer);
  let offset = 2;

  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
    return {};
  }

  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;

    const marker = view.getUint8(offset + 1);
    const length = view.getUint16(offset + 2, false);
    const segmentStart = offset + 4;
    const segmentEnd = segmentStart + length - 2;

    if (marker === 0xe1) {
      const signature = new TextDecoder("ascii")
        .decode(new Uint8Array(buffer, segmentStart, 6));

      if (signature === "Exif\0\0") {
        const tiffStart = segmentStart + 6;
        const endian = new TextDecoder("ascii")
          .decode(new Uint8Array(buffer, tiffStart, 2));
        const littleEndian = endian === "II";
        const ifd0Offset = tiffStart + view.getUint32(tiffStart + 4, littleEndian);
        const fields = view.getUint16(ifd0Offset, littleEndian);
        const metadata = {};

        for (let index = 0; index < fields; index += 1) {
          const fieldOffset = ifd0Offset + 2 + index * 12;
          if (fieldOffset + 12 > segmentEnd) break;

          const tag = view.getUint16(fieldOffset, littleEndian);
          if (tag === 0x010e) metadata.description = readTiffString(view, tiffStart, fieldOffset, littleEndian);
          if (tag === 0x8298) metadata.copyright = readTiffString(view, tiffStart, fieldOffset, littleEndian);
        }

        return metadata;
      }
    }

    offset = segmentEnd;
  }

  return {};
}

async function loadImageMetadata(path) {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error("Image unavailable");
    return readJpegIfd0Metadata(await response.arrayBuffer());
  } catch {
    return {};
  }
}

function normalizeGalleryImage(image) {
  const path = image.path;
  const copyright = image.copyright && image.copyright.toUpperCase() !== "UNKNOWN"
    ? image.copyright
    : "";

  return {
    path,
    filename: image.filename || path.split("/").pop(),
    description: image.description || humanizeStem(fileStem(path)),
    copyright,
    alt: image.description
      ? `photo labeled ${image.description}`
      : altText(path)
  };
}

async function fallbackItems() {
  return Promise.all(
    fallbackGalleryImages.map(async (path) => {
      const metadata = await loadImageMetadata(path);

      return normalizeGalleryImage({
        path,
        description: metadata.description,
        copyright: metadata.copyright
      });
    })
  );
}

async function fetchGalleryPayload(source) {
  const response = await fetch(source, { cache: "no-store" });
  if (!response.ok) throw new Error("Gallery data unavailable");

  const payload = await response.json();
  return Array.isArray(payload.images) ? payload.images : [];
}

async function galleryItemsFromPayload(images) {
  return Promise.all(
    images.map(async (image) => {
      const item = normalizeGalleryImage(image);

      if (item.copyright) return item;

      const metadata = await loadImageMetadata(item.path);
      return normalizeGalleryImage({
        ...item,
        description: item.description || metadata.description,
        copyright: metadata.copyright
      });
    })
  );
}

async function buildGalleryItems() {
  const sources = ["/api/gallery", "gallery-data.json"];

  for (const source of sources) {
    try {
      const images = await fetchGalleryPayload(source);
      if (images.length > 0) return galleryItemsFromPayload(images);
    } catch {}
  }

  try {
    const items = await fallbackItems();
    return items.length > 0 ? items : [];
  } catch {
    return [];
  }
}

function detailMarkup(item, index) {
  const detailId = `gallery-detail-${index}`;
  const detailBorder = asciiBorder();
  const credit = item.copyright || "unknown";

  return `
    <div
      class="gallery-detail-row"
      id="${detailId}"
      data-gallery-detail
      data-index="${index}"
      hidden
    >
      <div class="gallery-border-line" aria-hidden="true">${escapeHtml(detailBorder)}</div>
      <div class="gallery-detail-panel">
        <img
          class="gallery-detail-image"
          src="${escapeHtml(item.path)}"
          alt="${escapeHtml(item.alt)}"
          loading="lazy"
          decoding="async"
        >
        <dl class="gallery-detail-list">
          <dt>DESC</dt>
          <dd>${escapeHtml(item.description)}</dd>
          <dt>CREDIT</dt>
          <dd>${escapeHtml(credit)}</dd>
          <dt>FILE</dt>
          <dd>${escapeHtml(item.filename)}</dd>
        </dl>
      </div>
      <div class="gallery-border-line" aria-hidden="true">${escapeHtml(detailBorder)}</div>
    </div>
  `;
}

function mobileRowMarkup(item, row, credit) {
  return `
      <span class="gallery-row-mobile" aria-hidden="true">
        <span class="gallery-mobile-rule">+-- ${escapeHtml(row)} ----------------+</span>
        <span class="gallery-mobile-field">
          <span class="gallery-mobile-label">DESC</span>
          <span class="gallery-mobile-value">${escapeHtml(item.description)}</span>
        </span>
        <span class="gallery-mobile-field">
          <span class="gallery-mobile-label">CREDIT</span>
          <span class="gallery-mobile-value">${escapeHtml(credit)}</span>
        </span>
        <span class="gallery-mobile-action">[ VIEW ]</span>
      </span>
  `;
}

function rowMarkup(item, index) {
  const row = String(index + 1).padStart(2, "0");
  const credit = item.copyright || "-";
  const text = asciiRow([row, item.description, credit, "view"]);
  const detailId = `gallery-detail-${index}`;

  return `
    <button
      class="gallery-row"
      type="button"
      data-gallery-row
      data-index="${index}"
      data-row="${row}"
      aria-expanded="false"
      aria-controls="${detailId}"
      aria-label="View ${escapeHtml(item.description)}"
    >
      <span class="gallery-row-ascii">${escapeHtml(text)}</span>
      ${mobileRowMarkup(item, row, credit)}
    </button>
    ${detailMarkup(item, index)}
  `;
}

function emptyMarkup() {
  return `
    <div class="gallery-empty">
      <span class="gallery-row-ascii">${escapeHtml(asciiRow(["--", "no images", "-", "-"]))}</span>
      <span class="gallery-row-mobile" aria-hidden="true">
        <span class="gallery-mobile-rule">+-- -- ----------------+</span>
        <span class="gallery-mobile-field">
          <span class="gallery-mobile-label">DESC</span>
          <span class="gallery-mobile-value">NO IMAGES</span>
        </span>
      </span>
    </div>
  `;
}

function renderGallery(items) {
  const topBorder = asciiBorder();
  const header = asciiRow(["ID", "DESC", "CREDIT", "VIEW"]);
  const body = items.length > 0
    ? items.map(rowMarkup).join("")
    : emptyMarkup();

  galleryRoot.innerHTML = `
    <div class="gallery-menu" data-gallery-menu>
      <div class="gallery-scroll-port" data-gallery-scroll-port>
        <div class="gallery-table" data-gallery-table aria-label="Gallery files">
          <div class="gallery-border-line" aria-hidden="true">${escapeHtml(topBorder)}</div>
          <div class="gallery-header" aria-hidden="true">${escapeHtml(header)}</div>
          <div class="gallery-border-line" aria-hidden="true">${escapeHtml(topBorder)}</div>
          ${body}
          <div class="gallery-border-line" aria-hidden="true">${escapeHtml(topBorder)}</div>
        </div>
      </div>
      <pre class="gallery-ascii-scrollbar" data-gallery-scrollbar aria-hidden="true"></pre>
    </div>
  `;

  galleryRoot.__galleryItems = items;
}

function lineHeightFor(element) {
  const styles = getComputedStyle(element);
  return parseFloat(styles.lineHeight) || parseFloat(styles.fontSize) || 20;
}

function asciiScrollbarText(scrollPort) {
  const lineHeight = lineHeightFor(scrollPort);
  const totalRows = Math.max(3, Math.floor(scrollPort.clientHeight / lineHeight));
  const trackRows = Math.max(1, totalRows - 2);
  const maxScroll = Math.max(0, scrollPort.scrollHeight - scrollPort.clientHeight);
  const track = Array(trackRows).fill("|");
  const maxThumbRows = Math.max(1, trackRows - 1);
  const thumbRows = maxScroll <= 1
    ? trackRows
    : Math.max(
      1,
      Math.min(
        maxThumbRows,
        Math.floor((scrollPort.clientHeight / scrollPort.scrollHeight) * trackRows)
      )
    );
  const thumbStart = maxScroll <= 1
    ? 0
    : Math.round((scrollPort.scrollTop / maxScroll) * Math.max(0, trackRows - thumbRows));

  for (let index = thumbStart; index < thumbStart + thumbRows && index < track.length; index += 1) {
    track[index] = "#";
  }

  return ["^", ...track, "v"].join("\n");
}

function createAsciiScrollbar(scrollPort, scrollbar) {
  let frameId = 0;

  const update = () => {
    frameId = 0;
    scrollbar.textContent = asciiScrollbarText(scrollPort);
  };

  const requestUpdate = () => {
    if (frameId) return;
    frameId = requestAnimationFrame(update);
  };

  scrollPort.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate);
  scrollPort.querySelectorAll("img").forEach((image) => {
    image.addEventListener("load", requestUpdate, { once: true });
  });
  update();

  return requestUpdate;
}

function setActiveRow(rows, details, nextRow, focus = false) {
  if (!nextRow) return;

  rows.forEach((row) => {
    const isActive = row === nextRow;
    const detail = details.get(row.dataset.index);

    row.classList.toggle("is-active", isActive);
    row.setAttribute("aria-expanded", String(isActive));
    row.tabIndex = isActive ? 0 : -1;

    if (detail) detail.hidden = !isActive;
  });

  if (focus) {
    nextRow.focus({ preventScroll: true });
  }
}

function rowFromEvent(event, galleryTable) {
  const row = event.target.closest("[data-gallery-row]");
  return row && galleryTable.contains(row) ? row : null;
}

async function initGallery() {
  if (!galleryRoot) return;

  const items = await buildGalleryItems();
  renderGallery(items);

  const scrollPort = galleryRoot.querySelector("[data-gallery-scroll-port]");
  const scrollbar = galleryRoot.querySelector("[data-gallery-scrollbar]");
  const galleryTable = galleryRoot.querySelector("[data-gallery-table]");
  const rows = [...galleryRoot.querySelectorAll("[data-gallery-row]")];
  const details = new Map(
    [...galleryRoot.querySelectorAll("[data-gallery-detail]")]
      .map((detail) => [detail.dataset.index, detail])
  );
  const syncScrollbar = scrollPort && scrollbar
    ? createAsciiScrollbar(scrollPort, scrollbar)
    : () => {};

  if (rows.length === 0) return;

  setActiveRow(rows, details, rows[0]);
  syncScrollbar();

  galleryTable.addEventListener("pointerover", (event) => {
    const row = rowFromEvent(event, galleryTable);
    if (!row || row.contains(event.relatedTarget)) return;

    setActiveRow(rows, details, row);
    syncScrollbar();
  });

  galleryTable.addEventListener("click", (event) => {
    const row = rowFromEvent(event, galleryTable);
    if (!row) return;

    setActiveRow(rows, details, row, true);
    row.scrollIntoView({ block: "nearest", inline: "nearest" });
    syncScrollbar();
  });

  galleryTable.addEventListener("focusin", (event) => {
    const row = rowFromEvent(event, galleryTable);
    if (!row) return;

    setActiveRow(rows, details, row);
    syncScrollbar();
  });

  galleryTable.addEventListener("keydown", (event) => {
    const current = rowFromEvent(event, galleryTable);
    if (!current) return;

    const currentIndex = rows.indexOf(current);
    let nextIndex = currentIndex;

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      nextIndex += 1;
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      nextIndex -= 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = rows.length - 1;
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      setActiveRow(rows, details, current, true);
      return;
    } else {
      return;
    }

    event.preventDefault();
    const nextRow = rows[Math.max(0, Math.min(rows.length - 1, nextIndex))];
    setActiveRow(rows, details, nextRow, true);
    nextRow.scrollIntoView({ block: "nearest", inline: "nearest" });
    syncScrollbar();
  });
}

initGallery();
