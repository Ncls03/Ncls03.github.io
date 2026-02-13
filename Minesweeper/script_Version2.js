// Minesweeper - vanilla JS
(() => {
  const boardEl = document.getElementById('board');
  const rowsInput = document.getElementById('rows');
  const colsInput = document.getElementById('cols');
  const minesInput = document.getElementById('mines');
  const newGameBtn = document.getElementById('newGame');
  const messageEl = document.getElementById('message');
  const minesLeftEl = document.getElementById('minesLeft');
  const timerEl = document.getElementById('timer');

  let rows = 10, cols = 10, mines = 15;
  let board = []; // 2D array of cell objects
  let firstClick = true;
  let running = false;
  let revealedCount = 0;
  let flagsCount = 0;
  let timer = null;
  let timeSeconds = 0;
  let touchLongPressTimer = null;

  // cell: {r,c,mine,adj,revealed,flagged}

  function resetState() {
    board = [];
    firstClick = true;
    running = false;
    revealedCount = 0;
    flagsCount = 0;
    clearInterval(timer);
    timer = null;
    timeSeconds = 0;
    timerEl.textContent = '0';
    messageEl.textContent = '';
  }

  function init() {
    rows = clamp(parseInt(rowsInput.value) || 10, 5, 40);
    cols = clamp(parseInt(colsInput.value) || 10, 5, 40);
    const maxM = rows * cols - 1;
    mines = clamp(parseInt(minesInput.value) || 15, 1, maxM);
    minesInput.max = maxM;
    resetState();
    createEmptyBoard();
    renderBoard();
    updateMinesLeft();
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function createEmptyBoard() {
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push({r,c,mine:false,adj:0,revealed:false,flagged:false});
      }
      board.push(row);
    }
    // configure board grid CSS
    boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
  }

  function placeMinesAvoiding(safeR, safeC) {
    // ensure first click safe: avoid safe cell and its neighbors
    const forbidden = new Set();
    iterateNeighbors(safeR, safeC, (nr,nc) => forbidden.add(key(nr,nc)));
    forbidden.add(key(safeR, safeC));
    let placed = 0;
    const total = rows * cols;
    while (placed < mines) {
      const idx = Math.floor(Math.random() * total);
      const r = Math.floor(idx / cols);
      const c = idx % cols;
      if (forbidden.has(key(r,c))) continue;
      const cell = board[r][c];
      if (!cell.mine) {
        cell.mine = true;
        placed++;
      }
    }
    computeAdjacencies();
  }

  function computeAdjacencies() {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].mine) { board[r][c].adj = -1; continue; }
        let count = 0;
        iterateNeighbors(r,c,(nr,nc) => { if (board[nr][nc].mine) count++; });
        board[r][c].adj = count;
      }
    }
  }

  function iterateNeighbors(r,c,fn) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) fn(nr,nc);
      }
    }
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    boardEl.setAttribute('aria-rowcount', rows);
    boardEl.setAttribute('aria-colcount', cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = board[r][c];
        const el = document.createElement('button');
        el.className = 'cell';
        el.type = 'button';
        el.dataset.r = r;
        el.dataset.c = c;
        el.setAttribute('role','gridcell');
        el.setAttribute('aria-label', `Row ${r+1} Column ${c+1}`);
        el.tabIndex = 0;

        // event handlers
        el.addEventListener('click', onLeftClick);
        el.addEventListener('contextmenu', onRightClick);
        el.addEventListener('mousedown', onMouseDown);
        el.addEventListener('mouseup', onMouseUp);
        el.addEventListener('touchstart', onTouchStart, {passive:false});
        el.addEventListener('touchend', onTouchEnd, {passive:false});
        el.addEventListener('keydown', onKeyDown);

        el.addEventListener('dblclick', (e) => e.preventDefault()); // ignore double click default

        boardEl.appendChild(el);
      }
    }
    refreshAllCells();
  }

  function refreshAllCells() {
    // update minesLeft separately
    const cells = boardEl.querySelectorAll('.cell');
    cells.forEach(el => {
      const r = Number(el.dataset.r), c = Number(el.dataset.c);
      refreshCellElement(board[r][c], el);
    });
  }

  function refreshCellElement(cell, el) {
    el.className = 'cell';
    el.removeAttribute('data-adj');
    el.textContent = '';

    if (cell.revealed) {
      el.classList.add('revealed');
      if (cell.mine) {
        el.classList.add('mine');
        el.textContent = '💣';
      } else if (cell.adj > 0) {
        el.dataset.adj = cell.adj;
        el.textContent = String(cell.adj);
      }
      el.disabled = true;
    } else {
      el.disabled = false;
      if (cell.flagged) {
        el.classList.add('flagged');
        el.innerHTML = '<span class="flag">🚩</span>';
      }
    }
  }

  function getCellElement(r,c) {
    return boardEl.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  }

  function onLeftClick(e) {
    if (!running && firstClick) {
      // will place mines on first reveal
    }
    if (!running && !firstClick) {
      // after game over/win ignore
      return;
    }
    const el = e.currentTarget;
    const r = Number(el.dataset.r), c = Number(el.dataset.c);
    handleReveal(r,c);
  }

  function startTimer() {
    if (timer) return;
    running = true;
    timer = setInterval(() => {
      timeSeconds++;
      timerEl.textContent = String(timeSeconds);
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timer);
    timer = null;
    running = false;
  }

  function handleReveal(r,c) {
    const cell = board[r][c];
    if (cell.revealed || cell.flagged) return;

    if (firstClick) {
      // place mines avoiding clicked cell and neighbors
      placeMinesAvoiding(r,c);
      firstClick = false;
      startTimer();
    }

    // If cell is mine -> explode
    if (cell.mine) {
      cell.revealed = true;
      revealAllMines(r,c);
      gameOver(false);
      refreshAllCells();
      return;
    }

    floodReveal(r,c);
    refreshAllCells();
    checkWin();
  }

  function revealAllMines(explodedR, explodedC) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = board[r][c];
        if (cell.mine) cell.revealed = true;
      }
    }
    const explodedCell = board[explodedR][explodedC];
    const el = getCellElement(explodedR, explodedC);
    if (el) el.classList.add('exploded');
  }

  function floodReveal(r,c) {
    const stack = [{r,c}];
    const visited = new Set();
    while (stack.length) {
      const cur = stack.pop();
      const keyStr = key(cur.r,cur.c);
      if (visited.has(keyStr)) continue;
      visited.add(keyStr);
      const cell = board[cur.r][cur.c];
      if (cell.revealed || cell.flagged) continue;
      cell.revealed = true;
      revealedCount++;
      if (cell.adj === 0) {
        iterateNeighbors(cur.r,cur.c,(nr,nc) => {
          const neighbor = board[nr][nc];
          if (!neighbor.revealed && !neighbor.flagged && !neighbor.mine) stack.push({r:nr,c:nc});
        });
      }
    }
  }

  function onRightClick(e) {
    e.preventDefault();
    const el = e.currentTarget;
    const r = Number(el.dataset.r), c = Number(el.dataset.c);
    toggleFlag(r,c);
  }

  function toggleFlag(r,c) {
    const cell = board[r][c];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    flagsCount += cell.flagged ? 1 : -1;
    updateMinesLeft();
    refreshCellElement(cell, getCellElement(r,c));
  }

  function updateMinesLeft() {
    minesLeftEl.textContent = String(Math.max(0, mines - flagsCount));
  }

  function checkWin() {
    // win when all non-mine cells are revealed
    const totalSafe = rows * cols - mines;
    let revealed = 0;
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) if (board[r][c].revealed && !board[r][c].mine) revealed++;
    if (revealed >= totalSafe) {
      revealAllFlagsCorrect();
      gameOver(true);
    }
  }

  function revealAllFlagsCorrect() {
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
      const cell = board[r][c];
      if (cell.flagged && !cell.mine) {
        // optional: mark incorrect flags (not implemented visually)
      }
    }
  }

  function gameOver(win) {
    stopTimer();
    firstClick = false;
    running = false;
    messageEl.textContent = win ? 'You win! 🎉' : 'Boom! You hit a mine 💥';
    // disable further clicks by setting running false and not allowing actions
  }

  function key(r,c) { return `${r},${c}`; }

  // chord: when a revealed number is clicked with middle button or both buttons,
  // reveal neighbors if flags around == adj
  function onMouseDown(e) {
    // handle middle-click chord
    if (e.buttons === 1) return; // left only
    if (e.buttons === 2 || e.buttons === 3) {
      const el = e.currentTarget;
      const r = Number(el.dataset.r), c = Number(el.dataset.c);
      const cell = board[r][c];
      if (!cell.revealed || cell.adj <= 0) return;
      const flaggedAround = countFlagsAround(r,c);
      if (flaggedAround === cell.adj) {
        // reveal neighbors
        iterateNeighbors(r,c,(nr,nc) => {
          if (!board[nr][nc].flagged && !board[nr][nc].revealed) {
            handleReveal(nr,nc);
          }
        });
      }
    }
  }

  function onMouseUp(e) { /* placeholder to avoid text-selection issues */ }

  function countFlagsAround(r,c) {
    let cnt = 0;
    iterateNeighbors(r,c,(nr,nc) => { if (board[nr][nc].flagged) cnt++; });
    return cnt;
  }

  // Keyboard support: Enter / Space reveal, F flag, Arrow keys move focus
  function onKeyDown(e) {
    const el = e.currentTarget;
    const r = Number(el.dataset.r), c = Number(el.dataset.c);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleReveal(r,c);
    } else if (e.key.toLowerCase() === 'f') {
      e.preventDefault();
      toggleFlag(r,c);
    } else if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
      e.preventDefault();
      let nr = r, nc = c;
      if (e.key === 'ArrowUp') nr = Math.max(0, r-1);
      if (e.key === 'ArrowDown') nr = Math.min(rows-1, r+1);
      if (e.key === 'ArrowLeft') nc = Math.max(0, c-1);
      if (e.key === 'ArrowRight') nc = Math.min(cols-1, c+1);
      const nex = getCellElement(nr,nc);
      if (nex) nex.focus();
    } else if (e.key === 'm') {
      // chord with keyboard: attempt to chord if focused on revealed cell
      if (board[r][c].revealed && board[r][c].adj > 0) {
        const flaggedAround = countFlagsAround(r,c);
        if (flaggedAround === board[r][c].adj) {
          iterateNeighbors(r,c,(nr,nc) => {
            if (!board[nr][nc].flagged && !board[nr][nc].revealed) handleReveal(nr,nc);
          });
        }
      }
    }
  }

  // Touch: long-press to flag, tap to reveal
  function onTouchStart(e) {
    e.preventDefault();
    const el = e.currentTarget;
    const r = Number(el.dataset.r), c = Number(el.dataset.c);
    touchLongPressTimer = setTimeout(() => {
      toggleFlag(r,c);
      touchLongPressTimer = null;
    }, 500);
  }

  function onTouchEnd(e) {
    e.preventDefault();
    const el = e.currentTarget;
    const r = Number(el.dataset.r), c = Number(el.dataset.c);
    if (touchLongPressTimer) {
      clearTimeout(touchLongPressTimer);
      touchLongPressTimer = null;
      // treat as tap
      handleReveal(r,c);
    }
  }

  // New game button
  newGameBtn.addEventListener('click', () => {
    init();
  });

  // initialize UI values and start
  function updateMinesLeftAtStart() {
    minesLeftEl.textContent = String(mines);
  }

  // initialize at load
  (function start() {
    rowsInput.addEventListener('change', () => {
      rowsInput.value = clamp(parseInt(rowsInput.value)||10,5,40);
    });
    colsInput.addEventListener('change', () => {
      colsInput.value = clamp(parseInt(colsInput.value)||10,5,40);
    });
    minesInput.addEventListener('change', () => {
      const maxM = (parseInt(rowsInput.value)||10) * (parseInt(colsInput.value)||10) - 1;
      minesInput.value = clamp(parseInt(minesInput.value)||10,1,maxM);
      minesInput.max = maxM;
    });
    init();
    updateMinesLeftAtStart();
  })();

  // Expose functions for debugging
  window._minesweeper = {
    restart: init,
    board: () => board,
    revealAll: () => { revealAllMines(-1,-1); refreshAllCells(); }
  };
})();