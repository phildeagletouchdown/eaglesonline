class PretextEngine {
  constructor(layer, options = {}) {
    this.layer = layer;
    this.paddingCells = options.paddingCells || 0;
    this.measureProbe = document.createElement("span");
    this.measureProbe.textContent = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    this.measureProbe.setAttribute("aria-hidden", "true");
    this.measureProbe.style.position = "fixed";
    this.measureProbe.style.left = "-9999px";
    this.measureProbe.style.top = "0";
    this.measureProbe.style.whiteSpace = "pre";
    this.measureProbe.style.pointerEvents = "none";
    document.body.appendChild(this.measureProbe);
  }

  measure() {
    const rect = this.layer.getBoundingClientRect();
    const styles = getComputedStyle(this.layer);
    const lineHeight = parseFloat(styles.lineHeight);
    this.measureProbe.style.font = styles.font;
    this.measureProbe.style.letterSpacing = styles.letterSpacing;
    const cellW = this.measureProbe.getBoundingClientRect().width / this.measureProbe.textContent.length;
    const cellH = lineHeight;

    return {
      rect,
      cellW,
      cellH,
      cols: Math.max(24, Math.floor(rect.width / cellW)),
      rows: Math.max(16, Math.floor(rect.height / cellH))
    };
  }

  createGrid(rows, cols) {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => ({
        char: " ",
        blocked: false
      }))
    );
  }

  reserve(grid, bounds, box) {
    const left = Math.floor(box.left / bounds.cellW) - this.paddingCells;
    const right = Math.ceil(box.right / bounds.cellW) - 1 + this.paddingCells;
    const top = Math.floor(box.top / bounds.cellH);
    const bottom = Math.ceil(box.bottom / bounds.cellH) - 1;

    for (let y = top; y <= bottom; y += 1) {
      if (y < 0 || y >= bounds.rows) continue;

      for (let x = left; x <= right; x += 1) {
        if (x < 0 || x >= bounds.cols) continue;
        grid[y][x].blocked = true;
        grid[y][x].char = " ";
      }
    }
  }

  reserveElements(grid, bounds, stage, elements) {
    const stageBox = stage.getBoundingClientRect();

    elements.forEach((element) => {
      const box = element.getBoundingClientRect();
      this.reserve(grid, bounds, {
        left: box.left - stageBox.left,
        right: box.right - stageBox.left,
        top: box.top - stageBox.top,
        bottom: box.bottom - stageBox.top
      });
    });
  }

  lineGlyph(dx, dy) {
    const slope = dy / (dx || 0.001);
    const steep = Math.abs(slope);

    if (steep < 0.28) return "-";
    if (steep > 2.8) return "|";
    return slope > 0 ? "\\" : "/";
  }

  drawLine(grid, bounds, start, end) {
    const x1 = Math.round(start.x / bounds.cellW);
    const y1 = Math.round(start.y / bounds.cellH);
    const x2 = Math.round(end.x / bounds.cellW);
    const y2 = Math.round(end.y / bounds.cellH);
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
    const glyph = this.lineGlyph(x2 - x1, y2 - y1);

    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round(x1 + (x2 - x1) * t);
      const y = Math.round(y1 + (y2 - y1) * t);

      if (x < 0 || x >= bounds.cols || y < 0 || y >= bounds.rows) continue;
      if (grid[y][x].blocked) continue;

      const current = grid[y][x].char;
      grid[y][x].char = current !== " " && current !== glyph ? "+" : glyph;
    }
  }

  drawNodeCircle(grid, bounds, node) {
    const radius = Math.min(node.width, node.height) * 0.47;
    const strokeWidth = Math.max(1.8, Math.min(bounds.cellW, bounds.cellH) * 0.82);
    const left = Math.max(0, Math.floor((node.x - radius - strokeWidth) / bounds.cellW));
    const right = Math.min(bounds.cols - 1, Math.ceil((node.x + radius + strokeWidth) / bounds.cellW));
    const top = Math.max(0, Math.floor((node.y - radius - strokeWidth) / bounds.cellH));
    const bottom = Math.min(bounds.rows - 1, Math.ceil((node.y + radius + strokeWidth) / bounds.cellH));
    const label = String(node.label || "");
    const labelRow = Math.round(node.y / bounds.cellH);
    const labelStart = Math.round(node.x / bounds.cellW - label.length / 2);
    const labelEnd = labelStart + label.length - 1;

    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const px = (x + 0.5) * bounds.cellW;
        const py = (y + 0.5) * bounds.cellH;
        const distance = Math.hypot(px - node.x, py - node.y);
        const inCircle = distance <= radius;
        const onCircle = Math.abs(distance - radius) <= strokeWidth;
        const inLabelGap = y === labelRow && x >= labelStart - 1 && x <= labelEnd + 1;

        if (inCircle) {
          grid[y][x].char = " ";
        }

        if (onCircle && !inLabelGap) {
          grid[y][x].char = "█";
        }
      }
    }
  }

  drawNodeLabel(grid, bounds, node) {
    const label = String(node.label || "");
    const labelRow = Math.round(node.y / bounds.cellH);
    const labelStart = Math.round(node.x / bounds.cellW - label.length / 2);

    for (let i = 0; i < label.length; i += 1) {
      const x = labelStart + i;

      if (x < 0 || x >= bounds.cols || labelRow < 0 || labelRow >= bounds.rows) continue;
      grid[labelRow][x].char = label[i];
    }
  }

  canPlaceWord(grid, bounds, word, x, y) {
    if (x + word.length > bounds.cols) return false;

    for (let i = 0; i < word.length; i += 1) {
      const cell = grid[y][x + i];
      if (cell.blocked || cell.char !== " ") return false;
    }

    return true;
  }

  nextOpenCell(grid, bounds, cursor) {
    for (let y = cursor.y; y < bounds.rows; y += 1) {
      const startX = y === cursor.y ? cursor.x : 0;

      for (let x = startX; x < bounds.cols; x += 1) {
        if (!grid[y][x].blocked && grid[y][x].char === " ") {
          return { x, y };
        }
      }
    }

    return null;
  }

  writeWord(grid, bounds, word, cursor) {
    let spot = this.nextOpenCell(grid, bounds, cursor);

    while (spot) {
      if (this.canPlaceWord(grid, bounds, word, spot.x, spot.y)) {
        for (let i = 0; i < word.length; i += 1) {
          grid[spot.y][spot.x + i].char = word[i];
        }

        const afterWord = spot.x + word.length;
        if (afterWord < bounds.cols && !grid[spot.y][afterWord].blocked) {
          grid[spot.y][afterWord].char = " ";
          return { x: afterWord + 1, y: spot.y };
        }

        return { x: afterWord, y: spot.y };
      }

      spot = this.nextOpenCell(grid, bounds, { x: spot.x + 1, y: spot.y });
    }

    return null;
  }

  flowText(grid, bounds, words, offset = 0) {
    let cursor = { x: 0, y: 0 };
    const count = bounds.cols * bounds.rows;

    for (let i = 0; i < count; i += 1) {
      const word = words[(i + offset) % words.length];
      cursor = this.writeWord(grid, bounds, word, cursor);

      if (!cursor) return;
      if (cursor.y >= bounds.rows) return;
    }
  }

  paintBackdrop(grid, bounds, rows) {
    for (let y = 0; y < bounds.rows; y += 1) {
      const row = rows[y] || "";

      for (let x = 0; x < bounds.cols; x += 1) {
        grid[y][x].char = row[x] || " ";
      }
    }
  }

  render({
    stage,
    exclusions = [],
    words = [],
    wordOffset = 0,
    connectors = [],
    nodes = [],
    backgroundRows
  }) {
    const bounds = this.measure();
    const grid = this.createGrid(bounds.rows, bounds.cols);
    const hasBackground = Array.isArray(backgroundRows) && backgroundRows.length > 0;

    if (hasBackground) {
      this.paintBackdrop(grid, bounds, backgroundRows);
    }

    this.reserveElements(grid, bounds, stage, exclusions);

    if (!hasBackground && words.length > 0) {
      this.flowText(grid, bounds, words, wordOffset);
    }

    connectors.forEach(([start, end]) => {
      this.drawLine(grid, bounds, start, end);
    });

    nodes.forEach((node) => {
      this.drawNodeCircle(grid, bounds, node);
    });

    nodes.forEach((node) => {
      this.drawNodeLabel(grid, bounds, node);
    });

    this.layer.textContent = grid
      .map((row) => row.map((cell) => cell.char).join("").trimEnd())
      .join("\n");
  }
}

window.PretextEngine = PretextEngine;
