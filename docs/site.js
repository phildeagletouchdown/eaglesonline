const nodes = [...document.querySelectorAll(".node")];
const asciiLayer = document.querySelector(".ascii-layer");
const stage = document.querySelector(".stage");
const pretext = new window.PretextEngine(asciiLayer, { paddingCells: 0 });
const mobileBackdropQuery = window.matchMedia("(max-width: 700px)");
const backdropImage = new window.ImageAsciiSource("backdrop.png", {
  invert: true,
  charset: " .:-=+*#%@"
});
let backdropCandidates = [];
let backdropCandidateIndex = 0;

const nodeByName = new Map(nodes.map((node) => [node.dataset.node, node]));
const links = nodes.flatMap((node, index) =>
  nodes.slice(index + 1).map((target) => [node.dataset.node, target.dataset.node])
);
const fallbackBackdrop = `
THE ONLY WAY OUT IS THROUGH
`.trim();
let backdropWords = fallbackBackdrop.split(/\s+/);
let animationStarted = false;
let mouse = {
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  active: false
};
let currentAsciiSize = window.innerWidth <= 700 ? 16 : 22;
let lastRenderedNodeSize = 0;
let lastNodeLayoutMode = "";
const nodeBorderTargets = new WeakMap();
const borderMeasureProbe = document.createElement("span");
borderMeasureProbe.textContent = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
borderMeasureProbe.setAttribute("aria-hidden", "true");
borderMeasureProbe.style.position = "fixed";
borderMeasureProbe.style.left = "-9999px";
borderMeasureProbe.style.top = "0";
borderMeasureProbe.style.whiteSpace = "pre";
borderMeasureProbe.style.pointerEvents = "none";
document.body.appendChild(borderMeasureProbe);

function uniqueSources(...sources) {
  return sources.filter((source, index, list) => source && list.indexOf(source) === index);
}

function backdropSources() {
  const desktopSource = stage.dataset.backdrop || "backdrop.png";
  const mobileSource = stage.dataset.backdropMobile || desktopSource;
  const desktopFallback = stage.dataset.backdropFallback || "";
  const mobileFallback = stage.dataset.backdropMobileFallback || desktopFallback;

  if (mobileBackdropQuery.matches) {
    return uniqueSources(mobileSource, mobileFallback, desktopSource, desktopFallback);
  }

  return uniqueSources(desktopSource, desktopFallback);
}

function updateBackdropSource() {
  const nextCandidates = backdropSources();
  if (
    backdropCandidates.length === nextCandidates.length &&
    backdropCandidates.every((candidate, index) => candidate === nextCandidates[index])
  ) {
    return;
  }

  backdropCandidates = nextCandidates;
  backdropCandidateIndex = 0;
  backdropImage.setSource(backdropCandidates[backdropCandidateIndex]);
}

nodes.forEach((node) => {
  const label = node.dataset.label || node.dataset.node || "";
  let borderNode = node.querySelector(".node-border") || node.querySelector("pre");
  let fillNode = node.querySelector(".node-fill");
  let labelNode = node.querySelector(".node-label");

  if (!borderNode) {
    borderNode = document.createElement("pre");
    borderNode.setAttribute("aria-hidden", "true");
    node.prepend(borderNode);
  }

  borderNode.className = "node-border";

  if (!fillNode) {
    fillNode = document.createElement("pre");
    fillNode.className = "node-fill";
    fillNode.setAttribute("aria-hidden", "true");
    node.insertBefore(fillNode, borderNode);
  }

  if (!labelNode) {
    labelNode = document.createElement("span");
    labelNode.className = "node-label";
    labelNode.setAttribute("aria-hidden", "true");
    node.appendChild(labelNode);
  }

  labelNode.textContent = label;
});

fetch("backdrop.txt")
  .then((response) => {
    if (!response.ok) throw new Error("backdrop.txt not found");
    return response.text();
  })
  .then((text) => {
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length > 0) backdropWords = words;
  })
  .catch(() => {
    backdropWords = fallbackBackdrop.split(/\s+/);
  });

backdropImage.onchange = () => {
  if (backdropImage.failed && backdropCandidateIndex < backdropCandidates.length - 1) {
    backdropCandidateIndex += 1;
    backdropImage.setSource(backdropCandidates[backdropCandidateIndex]);
    return;
  }

  startAnimation();
};
updateBackdropSource();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distanceToBox(x, y, box) {
  const dx = Math.max(box.left - x, 0, x - box.right);
  const dy = Math.max(box.top - y, 0, y - box.bottom);
  return Math.hypot(dx, dy);
}

function nearestNodeDistance() {
  if (!mouse.active) return Number.POSITIVE_INFINITY;

  return nodes.reduce((nearest, node) => {
    const distance = distanceToBox(mouse.x, mouse.y, node.getBoundingClientRect());
    return Math.min(nearest, distance);
  }, Number.POSITIVE_INFINITY);
}

function updateAsciiSize() {
  const compact = window.innerWidth <= 700;
  const minSize = compact ? 5 : 6;
  const maxSize = compact ? 15 : 25;
  const influence = compact ? 300 : 560;
  const distance = nearestNodeDistance();
  const ratio = clamp(distance / influence, 0, 1);
  const target = mouse.active ? minSize + ratio * (maxSize - minSize) : maxSize;
  const quantized = Math.round(target);
  currentAsciiSize += (quantized - currentAsciiSize) * 0.28;
  const renderedSize = Math.round(currentAsciiSize);

  asciiLayer.style.setProperty("--bg-text-size", `${renderedSize}px`);
  stage.style.setProperty("--border-text-size", `${renderedSize}px`);
  renderNodeBorders(renderedSize);
}

function nodeLayoutMode() {
  return window.innerWidth <= 700 ? "compact" : "wide";
}

function maxBorderSizeForLayout() {
  return nodeLayoutMode() === "compact" ? 15 : 25;
}

function nodeWidthForSize(size) {
  if (size <= 7) return 24;
  if (size <= 10) return 20;
  if (size <= 16) return 16;
  if (size <= 24) return 12;
  return 10;
}

function measureBorderCell(size, element = document.body) {
  const styles = getComputedStyle(element);
  borderMeasureProbe.style.font = [
    styles.fontStyle,
    styles.fontVariant,
    styles.fontWeight,
    `${size}px/${size}px`,
    styles.fontFamily
  ].join(" ");
  const measuredWidth = borderMeasureProbe.getBoundingClientRect().width / borderMeasureProbe.textContent.length;
  return measuredWidth || size * 0.6;
}

function calculateNodeBorderTarget(node) {
  const baseSize = maxBorderSizeForLayout();
  const baseCellWidth = measureBorderCell(baseSize, node);
  const label = node.dataset.label || node.dataset.node || "";
  const labelNode = node.querySelector(".node-label");
  const labelBox = labelNode.getBoundingClientRect();
  const horizontalPadding = Math.max(12, baseSize * 0.8);
  const labelWidth = Math.max(label.length * baseCellWidth, labelBox.width);
  const contentColumns = Math.max(
    nodeWidthForSize(baseSize),
    Math.ceil((labelWidth + horizontalPadding * 2) / baseCellWidth)
  );
  const contentRows = Math.max(
    4,
    Math.ceil((labelBox.height + Math.min(8, baseSize)) / baseSize)
  );

  return {
    width: (contentColumns + 2) * baseCellWidth,
    height: (contentRows + 2) * baseSize
  };
}

function resetNodeBorderTargets() {
  lastNodeLayoutMode = nodeLayoutMode();

  nodes.forEach((node) => {
    nodeBorderTargets.set(node, calculateNodeBorderTarget(node));
  });

  lastRenderedNodeSize = 0;
}

function createBlankGrid(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => " "));
}

function clearCenteredGridGap(grid, cols, rows) {
  const left = Math.max(0, Math.floor((grid[0].length - cols) / 2));
  const right = Math.min(grid[0].length - 1, left + cols - 1);
  const top = Math.max(0, Math.floor((grid.length - rows) / 2));
  const bottom = Math.min(grid.length - 1, top + rows - 1);

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      grid[y][x] = " ";
    }
  }
}

function renderCircleLayers(totalColumns, totalRows, cellWidth, cellHeight, gapColumns, gapRows) {
  const borderGrid = createBlankGrid(totalRows, totalColumns);
  const fillGrid = createBlankGrid(totalRows, totalColumns);
  const width = totalColumns * cellWidth;
  const height = totalRows * cellHeight;
  const strokeWidth = Math.max(1.8, Math.min(cellWidth, cellHeight) * 0.82);
  const center = {
    x: width / 2,
    y: height / 2
  };
  const radius = Math.min(width, height) / 2 * 0.94;
  const centerColumn = (totalColumns - 1) / 2;

  for (let y = 0; y < totalRows; y += 1) {
    for (let x = Math.ceil(centerColumn); x < totalColumns; x += 1) {
      const point = {
        x: (x + 0.5) * cellWidth,
        y: (y + 0.5) * cellHeight
      };
      const distance = Math.hypot(point.x - center.x, point.y - center.y);
      const inCircle = distance <= radius;
      const onCircle = Math.abs(distance - radius) <= strokeWidth;
      const mirrorX = Math.round(centerColumn - (x - centerColumn));

      if (inCircle) {
        fillGrid[y][x] = "█";
        fillGrid[y][mirrorX] = "█";
      }

      if (onCircle) {
        borderGrid[y][x] = "*";
        borderGrid[y][mirrorX] = "*";
      }
    }
  }

  clearCenteredGridGap(borderGrid, gapColumns, gapRows);

  return {
    border: borderGrid.map((row) => row.join("")).join("\n"),
    fill: fillGrid.map((row) => row.join("")).join("\n")
  };
}

function writeStableNodeBox(node, target, size, borderCellWidth) {
  const totalColumns = Math.max(3, Math.round(target.width / borderCellWidth));
  const totalRows = Math.max(9, Math.round(target.height / size));
  const labelBox = node.querySelector(".node-label").getBoundingClientRect();
  const cellWidth = target.width / totalColumns;
  const cellHeight = target.height / totalRows;
  const gapColumns = Math.ceil((labelBox.width + 12) / cellWidth);
  const gapRows = Math.ceil((labelBox.height + 8) / cellHeight);
  const letterSpacing = totalColumns > 1
    ? (target.width - borderCellWidth * totalColumns) / (totalColumns - 1)
    : 0;
  const lineHeight = target.height / totalRows;

  node.style.setProperty("--node-border-width", `${target.width}px`);
  node.style.setProperty("--node-border-height", `${target.height}px`);
  node.style.setProperty("--node-border-letter-spacing", `${letterSpacing}px`);
  node.style.setProperty("--node-border-line-height", `${lineHeight}px`);
  const circle = renderCircleLayers(
    totalColumns,
    totalRows,
    cellWidth,
    cellHeight,
    gapColumns,
    gapRows
  );
  node.querySelector(".node-border").textContent = circle.border;
  node.querySelector(".node-fill").textContent = circle.fill;
}

function renderNodeBorders(size) {
  if (lastNodeLayoutMode !== nodeLayoutMode()) {
    resetNodeBorderTargets();
  }

  if (size === lastRenderedNodeSize) return;
  lastRenderedNodeSize = size;

  nodes.forEach((node) => {
    const borderCellWidth = measureBorderCell(size, node);
    const target = nodeBorderTargets.get(node) || calculateNodeBorderTarget(node);
    nodeBorderTargets.set(node, target);
    writeStableNodeBox(node, target, size, borderCellWidth);
  });
}

function nodeCenter(node) {
  const stageBox = stage.getBoundingClientRect();
  const nodeBox = node.getBoundingClientRect();

  return {
    x: nodeBox.left - stageBox.left + nodeBox.width / 2,
    y: nodeBox.top - stageBox.top + nodeBox.height / 2
  };
}

function renderAscii(time = 0) {
  const bounds = pretext.measure();
  const backgroundRows = backdropImage.getRows(bounds);
  const connectors = links.map(([from, to]) => [
    nodeCenter(nodeByName.get(from)),
    nodeCenter(nodeByName.get(to))
  ]);
  const wordOffset = Math.floor(time * 0.0016) % backdropWords.length;

  pretext.render({
    stage,
    exclusions: [],
    words: backdropWords,
    wordOffset,
    connectors,
    backgroundRows
  });
}

function renderFrame(time) {
  updateAsciiSize();
  renderAscii(time);
  requestAnimationFrame(renderFrame);
}

function startAnimation() {
  if (animationStarted) return;
  animationStarted = true;
  requestAnimationFrame(renderFrame);
}

window.addEventListener("pointermove", (event) => {
  mouse = {
    x: event.clientX,
    y: event.clientY,
    active: true
  };
});

window.addEventListener("pointerleave", () => {
  mouse.active = false;
});

window.addEventListener("blur", () => {
  mouse.active = false;
});

window.addEventListener("resize", () => {
  resetNodeBorderTargets();
});

if (typeof mobileBackdropQuery.addEventListener === "function") {
  mobileBackdropQuery.addEventListener("change", updateBackdropSource);
} else if (typeof mobileBackdropQuery.addListener === "function") {
  mobileBackdropQuery.addListener(updateBackdropSource);
}

if (document.fonts) {
  document.fonts.ready.then(() => {
    resetNodeBorderTargets();
  });
}

resetNodeBorderTargets();
startAnimation();
