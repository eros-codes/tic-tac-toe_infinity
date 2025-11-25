(() => {
  const BOARD_SIZE = 3;
  const WIN_LENGTH = 3;
  const MAX_PIECES = 3;

  let board = [];
  let currentPlayer = 'X';
  let queues = { X: [], O: [] };
  let moveId = 1;
  let gameOver = false;
  let lastWinningCells = [];

  const gridEl = document.getElementById('grid');
  const currentPlayerChip = document.getElementById('currentPlayerChip');
  const statusText = document.getElementById('statusText');
  const metaBoardInfo = document.getElementById('metaBoardInfo');
  const resultMsg = document.getElementById('resultMsg');
  const hintBtn = document.getElementById('hintBtn');
  const swapBtn = document.getElementById('swapBtn');
  const resetBtn = document.getElementById('resetBtn');
  const clearHighlightsBtn = document.getElementById('clearHighlights');
  const difficultySliderContainer = document.getElementById('botDifficultySliderContainer');
  const difficultySlider = document.getElementById('botDifficultySlider');

  function cssVar(name, fallback){
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return (v && v.trim()) || fallback;
    } catch (err){
      return fallback;
    }
  }

  function initBoard() {
    metaBoardInfo.textContent = `${BOARD_SIZE} × ${BOARD_SIZE}, win length: ${WIN_LENGTH}`;

    board = new Array(BOARD_SIZE);
    for (let r = 0; r < BOARD_SIZE; r++) board[r] = new Array(BOARD_SIZE).fill(null);

    queues = { X: [], O: [] };
    moveId = 1;
    gameOver = false;
    lastWinningCells = [];
    updateMeta();
    renderGrid();
    markOldestForRemoval();
    setStatus('Game reset');
    resultMsg.style.display = 'none';
  }

  function updateMeta() {
    currentPlayerChip.textContent = currentPlayer;
    currentPlayerChip.classList.toggle('o', currentPlayer === 'O');
    currentPlayerChip.classList.toggle('x', currentPlayer === 'X');
  }

  function renderGrid() {
    gridEl.innerHTML = '';
    gridEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, 1fr)`;
    gridEl.style.gridTemplateRows = `repeat(${BOARD_SIZE}, 1fr)`;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell empty';
        cell.dataset.r = r;
        cell.dataset.c = c;
        cell.setAttribute('role', 'button');
        cell.tabIndex = 0;
        cell.setAttribute('aria-label', `Cell ${r+1}, ${c+1}`);
        const span = document.createElement('span');
        span.className = 'glyph';
        span.innerHTML = '';
        cell.appendChild(span);

        cell.addEventListener('click', onCellClick);
        cell.addEventListener('keydown', (ev) => {
          const k = ev.key;
          if (k === 'Enter' || k === ' ' || k === 'Spacebar' || ev.code === 'Space') {
            ev.preventDefault();
            onCellClick(ev);
          }
        });

        gridEl.appendChild(cell);
      }
    }
    refreshCells();
  }

  function svgFor(player) {
    const strokeX = cssVar('--accent-x', '#ff6b6b');
    const strokeO = cssVar('--accent-o', '#4fd1c5');
    if (player === 'X') {
      return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <line x1="20" y1="20" x2="80" y2="80" stroke="${strokeX}" stroke-width="10" stroke-linecap="round"/>
        <line x1="80" y1="20" x2="20" y2="80" stroke="${strokeX}" stroke-width="10" stroke-linecap="round"/>
      </svg>`;
    } else {
      return `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle cx="50" cy="50" r="32" fill="none" stroke="${strokeO}" stroke-width="8" stroke-linecap="round"/>
      </svg>`;
    }
  }

  function refreshCells() {
    const cells = gridEl.children;
    for (let i = 0; i < cells.length; i++) {
      const el = cells[i];
      const r = +el.dataset.r;
      const c = +el.dataset.c;
      const val = board[r][c];
      el.classList.remove('x','o','win','removed','placed','will-remove');
      const span = el.querySelector('span.glyph');
      if (val === null) {
        if (span) span.innerHTML = '';
        el.classList.add('empty');
      } else {
        span.innerHTML = svgFor(val);
        el.classList.remove('empty');
        el.classList.add(val === 'X' ? 'x' : 'o');
        requestAnimationFrame(() => {
          el.classList.add('placed');
          setTimeout(()=> el.classList.remove('placed'), 240);
        });
      }
    }
    highlightWinningCells();
    if (!gameOver) markOldestForRemoval();
  }

  function onCellClick(e) {
    if (gameOver) return;
    const el = e.currentTarget || e.target;
    const r = +el.dataset.r;
    const c = +el.dataset.c;
    if (board[r][c] !== null) { setStatus('Cell occupied — choose an empty cell'); return; }
    playMove(r, c);
  }

  function playMove(r, c) {
    const player = currentPlayer;

    function finalizeAfterPlacement(rPlaced, cPlaced) {
      refreshCells();
      const winCells = checkWinFrom(player, rPlaced, cPlaced);
      if (winCells && winCells.length >= WIN_LENGTH) {
        gameOver = true;
        lastWinningCells = winCells;
        for (const el of gridEl.children) el.classList.remove('will-remove');
        refreshCells();
        resultMsg.textContent = `Player ${player} wins!`;
        resultMsg.style.display = 'inline-block';
        setStatus(`Player ${player} wins`, true);
        return;
      }
      currentPlayer = player === 'X' ? 'O' : 'X';
      updateMeta();
      setStatus(`Player ${currentPlayer}'s turn`);
      setTimeout(() => {
        if (botActive && !gameOver && currentPlayer === botSide) {
          performBotMove();
        }
      }, 160);
    }
    if (queues[player].length >= MAX_PIECES) {
      const old = queues[player].shift();
      // animate removal, then place the new piece
      animateRemove(old.r, old.c, () => {
        board[old.r][old.c] = null;
        // now place new
        board[r][c] = player;
        const thisMove = { r, c, id: moveId++ };
        queues[player].push(thisMove);
        finalizeAfterPlacement(r, c);
      });
    } else {      board[r][c] = player;
      const thisMove = { r, c, id: moveId++ };
      queues[player].push(thisMove);
      finalizeAfterPlacement(r, c);
    }
  }

  function animateRemove(r, c, cb) {
    const idx = r * BOARD_SIZE + c;
    const el = gridEl.children[idx];
    if (!el) { if (typeof cb === 'function') cb(); return; }
    el.classList.remove('will-remove');
    el.classList.add('removed');
    setTimeout(() => {
      el.classList.remove('removed');
      const span = el.querySelector('span.glyph');
      if (span) span.innerHTML = '';
      el.classList.add('empty');
      el.classList.remove('x','o');
      if (typeof cb === 'function') cb();
      markOldestForRemoval();
    }, 380);
  }

  function setStatus(text, important=false) {
    statusText.textContent = text;
    if (important) statusText.style.color = 'var(--success)';
    else statusText.style.color = 'var(--muted)';
  }

  function checkWinFrom(player, r, c) {
    const dirs = [ [1,0], [0,1], [1,1], [1,-1] ];
    for (const [dx,dy] of dirs) {
      const cells = [[r,c]];
      let i = 1;
      while (true) {
        const nr = r + dx * i, nc = c + dy * i;
        if (!inBounds(nr,nc) || board[nr][nc] !== player) break;
        cells.push([nr,nc]); i++;
      }
      i = 1;
      while (true) {
        const nr = r - dx * i, nc = c - dy * i;
        if (!inBounds(nr,nc) || board[nr][nc] !== player) break;
        cells.unshift([nr,nc]); i++;
      }
      if (cells.length >= WIN_LENGTH) return cells;
    }
    return null;
  }

  function inBounds(r,c){ return r >= 0 && c >= 0 && r < BOARD_SIZE && c < BOARD_SIZE; }

  function highlightWinningCells() {
    for (const el of gridEl.children) el.classList.remove('win');
    if (!lastWinningCells || lastWinningCells.length === 0) return;
    for (const [r,c] of lastWinningCells) {
      const idx = r * BOARD_SIZE + c;
      const el = gridEl.children[idx];
      if (el) el.classList.add('win');
    }
  for (const [r,c] of lastWinningCells) {
    const idx = r * BOARD_SIZE + c;
    const el = gridEl.children[idx];
    if (el && el.classList.contains('will-remove')) {
      el.classList.remove('will-remove');
      el.style.opacity = "1";
      el.style.filter = "none";
    }
  }
  }

  function markOldestForRemoval() {
    for (const el of gridEl.children) el.classList.remove('will-remove');

    ['X','O'].forEach(player => {
      if (queues[player] && queues[player].length >= MAX_PIECES) {
        const oldest = queues[player][0]; // oldest
        if (oldest) {
          const idx = oldest.r * BOARD_SIZE + oldest.c;
          const el = gridEl.children[idx];
          if (el) el.classList.add('will-remove');
        }
      }
    });
  }

  resetBtn.addEventListener('click', () => {
    currentPlayer = 'X';
    initBoard();
  });

  swapBtn.addEventListener('click', () => {
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    updateMeta();
    setStatus(`Turn switched to ${currentPlayer}`);
  });

  clearHighlightsBtn.addEventListener('click', () => {
    lastWinningCells = [];
    highlightWinningCells();
    resultMsg.style.display = 'none';
  });

  

  function findWinningMove(player) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] !== null) continue;
        board[r][c] = player;
        const win = checkWinFrom(player, r, c);
        board[r][c] = null;
        if (win) return [r,c];
      }
    }
    return null;
  }

  function findBlockingMove(player) {
    const opp = player === 'X' ? 'O' : 'X';
    const m = findWinningMove(opp);
    return m ? m : null;
  }
  function findForkMove(player) {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] !== null) continue;
        board[r][c] = player;
        let wins = 0;
        for (let r2 = 0; r2 < BOARD_SIZE; r2++) {
          for (let c2 = 0; c2 < BOARD_SIZE; c2++) {
            if (board[r2][c2] !== null) continue;
            board[r2][c2] = player;
            if (checkWinFrom(player, r2, c2)) wins++;
            board[r2][c2] = null;
            if (wins >= 2) break;
          }
          if (wins >= 2) break;
        }
        board[r][c] = null;
        if (wins >= 2) return [r,c];
      }
    }
    return null;
  }
  function findBlockingFork(player) {
    const opp = player === 'X' ? 'O' : 'X';
    const oppFork = findForkMove(opp);
    if (!oppFork) return null;

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (board[r][c] !== null) continue;
        board[r][c] = player;
        const winNow = checkWinFrom(player, r, c);
        board[r][c] = null;
        if (winNow) return [r,c];
      }
    }
    const [fr, fc] = oppFork;
    if (board[fr][fc] === null) return [fr, fc];
    return null;
  }

  function findCornerOrRandom() {
    const corners = [[0,0],[0,BOARD_SIZE-1],[BOARD_SIZE-1,0],[BOARD_SIZE-1,BOARD_SIZE-1]];
    const availCorners = corners.filter(([r,c]) => board[r][c] === null);
    if (availCorners.length) return availCorners[Math.floor(Math.random()*availCorners.length)];
    const empties = [];
    for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) if (board[r][c]===null) empties.push([r,c]);
    if (empties.length) return empties[Math.floor(Math.random()*empties.length)];
    return null;
  }

  function findCenterOrRandom() {
    const center = Math.floor(BOARD_SIZE/2);
    if (board[center][center] === null) return [center,center];
    const empties = [];
    for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) if (board[r][c]===null) empties.push([r,c]);
    if (empties.length) return empties[Math.floor(Math.random()*empties.length)];
    return null;
  }
  function cloneBoard(b) {
    return b.map(row => row.slice());
  }

  function cloneQueues(q) {
    return { X: q.X.map(m => ({ r: m.r, c: m.c })), O: q.O.map(m => ({ r: m.r, c: m.c })) };
  }

  function checkWinFromBoard(bd, player, r, c) {
    const dirs = [ [1,0], [0,1], [1,1], [1,-1] ];
    for (const [dx,dy] of dirs) {
      const cells = [[r,c]];
      let i = 1;
      while (true) {
        const nr = r + dx * i, nc = c + dy * i;
        if (nr < 0 || nc < 0 || nr >= BOARD_SIZE || nc >= BOARD_SIZE || bd[nr][nc] !== player) break;
        cells.push([nr,nc]); i++;
      }
      i = 1;
      while (true) {
        const nr = r - dx * i, nc = c - dy * i;
        if (nr < 0 || nc < 0 || nr >= BOARD_SIZE || nc >= BOARD_SIZE || bd[nr][nc] !== player) break;
        cells.unshift([nr,nc]); i++;
      }
      if (cells.length >= WIN_LENGTH) return cells;
    }
    return null;
  }

  function simulateMoveState(bd, q, player, r, c) {
    const nb = cloneBoard(bd);
    const nq = cloneQueues(q);
    nb[r][c] = player;
    nq[player].push({ r, c });
    if (nq[player].length > MAX_PIECES) {
      const old = nq[player].shift();
      nb[old.r][old.c] = null;
    }
    const win = checkWinFromBoard(nb, player, r, c);
    const nextPlayer = player === 'X' ? 'O' : 'X';
    return { board: nb, queues: nq, win: win, nextPlayer };
  }

  function boardIsFull(bd) {
    for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) if (bd[r][c] === null) return false;
    return true;
  }

  function minimax(bd, q, turn, maximizingPlayer, depth) {    if (depth <= 0) return { score: 0 };

    // generate all moves
    const empties = [];
    for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) if (bd[r][c] === null) empties.push([r,c]);
    if (empties.length === 0) return { score: 0 };

    let bestMove = null;
    if (turn === maximizingPlayer) {
      let bestScore = -Infinity;
      for (const [r,c] of empties) {
        const s = simulateMoveState(bd, q, turn, r, c);
        if (s.win) {
          const score = 1000 - (100 - depth);
          if (score > bestScore) { bestScore = score; bestMove = [r,c]; }
        } else {
          const res = minimax(s.board, s.queues, s.nextPlayer, maximizingPlayer, depth - 1);
          const score = res.score;
          if (score > bestScore) { bestScore = score; bestMove = [r,c]; }
        }
      }
      return { score: bestScore, move: bestMove };
    } else {
      // minimizing for opponent
      let bestScore = Infinity;
      for (const [r,c] of empties) {
        const s = simulateMoveState(bd, q, turn, r, c);
        if (s.win) {
          const score = -1000 + (100 - depth);
          if (score < bestScore) { bestScore = score; bestMove = [r,c]; }
        } else {
          const res = minimax(s.board, s.queues, s.nextPlayer, maximizingPlayer, depth - 1);
          const score = res.score;
          if (score < bestScore) { bestScore = score; bestMove = [r,c]; }
        }
      }
      return { score: bestScore, move: bestMove };
    }
  }

  function computeBestMoveFor(player) {    return computeBestMoveForDepth(player, 9);
  }

  function computeBestMoveForDepth(player, depth) {
    const res = minimax(board, queues, player, player, depth);
    return res.move || null;
  }

  function randomEmpty() {
    const empties = [];
    for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) if (board[r][c] === null) empties.push([r,c]);
    if (!empties.length) return null;
    return empties[Math.floor(Math.random() * empties.length)];
  }


  initBoard();
  let botActive = false;
  let botSide = 'O';
  let botDifficulty = 'normal';
  if (difficultySlider) {    const initMap = { easy: '0', normal: '1', hard: '2' };
    difficultySlider.value = initMap[botDifficulty] || '1';
    difficultySlider.addEventListener('input', (e) => {
      const v = e.target.value;
      const map = { '0': 'easy', '1': 'normal', '2': 'hard' };
      botDifficulty = map[v] || 'normal';
      setStatus(`Bot difficulty set to ${botDifficulty}`);
    });
  }

  function getHintFor(player) {
    return findWinningMove(player)
      || findBlockingMove(player)
      || findForkMove(player)
      || findBlockingFork(player)
      || findCenterOrRandom()
      || findCornerOrRandom();
  }

  function performBotMove() {
    if (gameOver || !botActive) return;

    let mv = null;    if (botDifficulty === 'easy') {
      mv = randomEmpty();
    } else if (botDifficulty === 'normal') {      mv = getHintFor(botSide);
      if (!mv) mv = computeBestMoveForDepth(botSide, 4);
    } else {      mv = computeBestMoveForDepth(botSide, 9);
    }

    if (!mv) { setStatus('Bot: no move available'); return; }
    const [r, c] = mv;
    setStatus(`Bot (${botDifficulty}) plays: cell (${r+1}, ${c+1})`);
    playMove(r, c);
  }
  hintBtn.addEventListener('click', () => {    botActive = !botActive;
    if (botActive) {      botSide = currentPlayer === 'X' ? 'O' : 'X';
      hintBtn.textContent = 'Bot: ON';
      hintBtn.classList.add('bot-on');
      hintBtn.setAttribute('aria-pressed', 'true');      hintBtn.style.backgroundColor = cssVar('--accent-o', '#4fd1c5');
      hintBtn.style.color = '#042';
      setStatus(`Bot enabled (playing as ${botSide})`);      if (difficultySliderContainer) difficultySliderContainer.style.display = 'flex';      if (currentPlayer === botSide && !gameOver) setTimeout(performBotMove, 120);
    } else {
      hintBtn.textContent = 'Play Bot';
      hintBtn.classList.remove('bot-on');
      hintBtn.setAttribute('aria-pressed', 'false');
      hintBtn.style.backgroundColor = '';
      hintBtn.style.color = '';
      setStatus('Bot disabled');
      if (difficultySliderContainer) difficultySliderContainer.style.display = 'none';
    }
  });
})();
