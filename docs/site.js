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
const circleGridSeed = Math.floor(Math.random() * 0x7fffffff);
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
let currentAsciiSize = window.innerWidth <= 700 ? 10 : 18;
let lastRenderedNodeSize = 0;
let lastNodeLayoutMode = "";
let circleGridSignature = "";
let circleGridShapes = [];
const nodeBorderTargets = new WeakMap();
const borderMeasureProbe = document.createElement("span");
borderMeasureProbe.textContent = "THEONLYWAYOUTISTHROUGH";
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
  const desktopSource = stage.dataset.backdrop || "backdrop_cash.mp4";
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
  const baseX = node.style.getPropertyValue("--x").trim();
  const baseY = node.style.getPropertyValue("--y").trim();
  let labelNode = node.querySelector(".node-label");

  node.querySelectorAll("pre").forEach((pre) => {
    pre.textContent = "";
  });

  if (!labelNode) {
    labelNode = document.createElement("span");
    labelNode.className = "node-label";
    labelNode.setAttribute("aria-hidden", "true");
    node.appendChild(labelNode);
  }

  labelNode.textContent = label;
  if (baseX) node.dataset.desktopX = baseX;
  if (baseY) node.dataset.desktopY = baseY;
});

function syncNodePositions() {
  if (usesCircleGrid() || usesSpreadsheet()) return;

  const compact = window.innerWidth <= 700;

  nodes.forEach((node) => {
    const x = compact ? node.dataset.mobileX || node.dataset.desktopX : node.dataset.desktopX;
    const y = compact ? node.dataset.mobileY || node.dataset.desktopY : node.dataset.desktopY;
    if (x) node.style.setProperty("--x", x);
    if (y) node.style.setProperty("--y", y);
  });
}

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

function usesCircleGrid() {
  return stage.dataset.nodeLayout === "grid";
}

function usesSpreadsheet() {
  return stage.dataset.nodeLayout === "spreadsheet";
}

function hashString(value) {
  let hash = 2166136261;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function randomFromSeed(seed) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(list, random) {
  const output = [...list];

  for (let i = output.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [output[i], output[j]] = [output[j], output[i]];
  }

  return output;
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
  const minSize = compact ? 4 : 6;
  const maxSize = compact ? 10 : 18;
  const influence = compact ? 300 : 560;
  const distance = nearestNodeDistance();
  const ratio = clamp(distance / influence, 0, 1);
  const target = mouse.active ? minSize + ratio * (maxSize - minSize) : maxSize;
  const quantized = Math.round(target);
  currentAsciiSize += (quantized - currentAsciiSize) * 0.28;
  const renderedSize = Math.round(currentAsciiSize);

  asciiLayer.style.setProperty("--bg-text-size", `${renderedSize}px`);
  stage.style.setProperty("--bg-text-size", `${renderedSize}px`);
  syncNodeBoxes(renderedSize);
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
  const baseCellWidth = measureBorderCell(baseSize, asciiLayer);
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

function circleGridDiameter(size) {
  const cellWidth = measureBorderCell(size, asciiLayer);
  const longestLabel = nodes.reduce((longest, node) => {
    const label = node.dataset.label || node.dataset.node || "";
    return label.length > longest.length ? label : longest;
  }, "");
  const labelWidth = longestLabel.length * cellWidth;
  const labelPadding = Math.max(size * 1.2, cellWidth * 1.5);
  const minimumDiameter = nodeLayoutMode() === "compact" ? size * 7.2 : size * 6.4;

  return Math.max(minimumDiameter, labelWidth + labelPadding);
}

function cellKey(cell) {
  return `${cell.col}:${cell.row}`;
}

function linkCellsForGrid(cells, count) {
  const selected = [];

  cells.forEach((cell) => {
    if (selected.length >= count) return;
    const hasNeighbor = selected.some((chosen) =>
      Math.abs(chosen.col - cell.col) <= 1 && Math.abs(chosen.row - cell.row) <= 1
    );

    if (!hasNeighbor) selected.push(cell);
  });

  cells.forEach((cell) => {
    if (selected.length >= count) return;
    if (!selected.includes(cell)) selected.push(cell);
  });

  return selected.slice(0, count);
}

function buildCircleGrid(size) {
  const stageBox = stage.getBoundingClientRect();
  const layoutSize = maxBorderSizeForLayout();
  const layoutDiameter = circleGridDiameter(layoutSize);
  const diameter = layoutDiameter;
  const gridWidth = stageBox.width;
  const gridHeight = stageBox.height;
  const gridTop = 0;
  let columns = Math.max(1, Math.floor(gridWidth / layoutDiameter));
  let rows = Math.max(1, Math.floor(gridHeight / layoutDiameter));

  while (columns * rows < nodes.length) {
    if (gridWidth / columns > gridHeight / rows) {
      columns += 1;
    } else {
      rows += 1;
    }
  }

  const cellWidth = gridWidth / columns;
  const cellHeight = gridHeight / rows;
  const cells = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      cells.push({
        col,
        row,
        x: (col + 0.5) * cellWidth,
        y: gridTop + (row + 0.5) * cellHeight
      });
    }
  }

  return {
    cells,
    columns,
    rows,
    diameter,
    width: stageBox.width,
    height: stageBox.height,
    signature: [
      Math.round(stageBox.width),
      Math.round(stageBox.height),
      Math.round(gridHeight),
      Math.round(layoutDiameter),
      Math.round(diameter),
      columns,
      rows,
      size
    ].join(":"),
    randomSignature: [
      Math.round(stageBox.width),
      Math.round(stageBox.height),
      Math.round(layoutDiameter),
      columns,
      rows
    ].join(":")
  };
}

function syncCircleGrid(size) {
  const grid = buildCircleGrid(size);

  if (grid.signature === circleGridSignature) return;

  const random = randomFromSeed(hashString(`${circleGridSeed}:${grid.randomSignature}`));
  const linkCells = linkCellsForGrid(shuffled(grid.cells, random), nodes.length);
  const linkCellKeys = new Set(linkCells.map(cellKey));
  const availableCells = grid.cells.filter((cell) => !linkCellKeys.has(cellKey(cell)));
  const fillCount = Math.min(availableCells.length, Math.round(grid.cells.length * 0.1));
  const totalOutlineCount = Math.max(nodes.length, Math.round(grid.cells.length * 0.25));
  const outlineCount = Math.min(
    availableCells.length - fillCount,
    totalOutlineCount - nodes.length
  );
  const visibleCells = shuffled(availableCells, random);
  const filledCellKeys = new Set(
    visibleCells
      .slice(0, fillCount)
      .map(cellKey)
  );
  const outlinedCellKeys = new Set(
    visibleCells
      .slice(fillCount, fillCount + outlineCount)
      .map(cellKey)
  );
  const nodeByCell = new Map();

  nodes.forEach((node, index) => {
    const cell = linkCells[index];
    nodeByCell.set(cellKey(cell), node);
    node.style.setProperty("--x", `${(cell.x / grid.width) * 100}`);
    node.style.setProperty("--y", `${(cell.y / grid.height) * 100}`);
    writeStableNodeBox(node, {
      width: grid.diameter,
      height: grid.diameter
    });
  });

  circleGridShapes = grid.cells.map((cell) => {
    const node = nodeByCell.get(cellKey(cell));
    const key = cellKey(cell);

    return {
      x: cell.x,
      y: cell.y,
      width: grid.diameter,
      height: grid.diameter,
      label: usesCircleGrid() ? "" : node ? node.dataset.label || node.dataset.node || "" : "",
      filled: filledCellKeys.has(key),
      visible: Boolean(node) || filledCellKeys.has(key) || outlinedCellKeys.has(key),
      outline: "█"
    };
  }).filter((shape) => shape.visible);
  circleGridSignature = grid.signature;
}

function resetNodeBorderTargets() {
  lastNodeLayoutMode = nodeLayoutMode();

  if (usesSpreadsheet()) {
    lastRenderedNodeSize = 0;
    return;
  }

  if (usesCircleGrid()) {
    circleGridSignature = "";
    lastRenderedNodeSize = 0;
    return;
  }

  nodes.forEach((node) => {
    nodeBorderTargets.set(node, calculateNodeBorderTarget(node));
  });

  lastRenderedNodeSize = 0;
}

function writeStableNodeBox(node, target) {
  node.style.setProperty("--node-border-width", `${target.width}px`);
  node.style.setProperty("--node-border-height", `${target.height}px`);
}

function syncNodeBoxes(size) {
  if (usesSpreadsheet()) return;

  if (lastNodeLayoutMode !== nodeLayoutMode()) {
    resetNodeBorderTargets();
  }

  if (usesCircleGrid()) {
    syncCircleGrid(size);
    lastRenderedNodeSize = size;
    return;
  }

  if (size === lastRenderedNodeSize) return;
  lastRenderedNodeSize = size;

  nodes.forEach((node) => {
    const target = nodeBorderTargets.get(node) || calculateNodeBorderTarget(node);
    nodeBorderTargets.set(node, target);
    writeStableNodeBox(node, target);
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

function nodeShape(node) {
  const stageBox = stage.getBoundingClientRect();
  const nodeBox = node.getBoundingClientRect();

  return {
    x: nodeBox.left - stageBox.left + nodeBox.width / 2,
    y: nodeBox.top - stageBox.top + nodeBox.height / 2,
    width: nodeBox.width,
    height: nodeBox.height,
    label: node.dataset.label || node.dataset.node || ""
  };
}

function renderAscii(time = 0) {
  const bounds = pretext.measure();
  const backgroundRows = backdropImage.getRows(bounds);
  const connectors = usesCircleGrid() || usesSpreadsheet()
    ? []
    : links.map(([from, to]) => [
      nodeCenter(nodeByName.get(from)),
      nodeCenter(nodeByName.get(to))
    ]);
  const renderedNodes = usesSpreadsheet() ? [] : usesCircleGrid() ? circleGridShapes : nodes.map(nodeShape);
  const wordOffset = Math.floor(time * 0.0016) % backdropWords.length;

  pretext.render({
    stage,
    exclusions: [],
    words: backdropWords,
    wordOffset,
    connectors,
    nodes: renderedNodes,
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
  syncNodePositions();
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

syncNodePositions();
resetNodeBorderTargets();
startAnimation();
