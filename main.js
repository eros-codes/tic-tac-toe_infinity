(() => {
  const BOARD_SIZE = 3;
  const WIN_LENGTH = 3;
  const MAX_PIECES = 3;
  let board = null;
  let queues = null;
  let moveId = 1;
  let gameOver = false;
  let lastWinningCells = [];
  let botPlacementTotal = 0;
  let currentPlayer = 'X';
  let pokerSuspended = false;
  const resetBtn = document.getElementById('resetBtn');
  const difficultySliderContainer = document.getElementById('botDifficultySliderContainer');
  const difficultySlider = document.getElementById('botDifficultySlider');
  const gridEl = document.getElementById('grid');
  const boardWrap = document.querySelector('.board-wrap');
  const botArch = document.querySelector('.bot-arch');
  const botArchInner = document.querySelector('.bot-arch-inner');
  const currentPlayerChip = document.getElementById('currentPlayerChip');
  const statusText = document.getElementById('statusText');
  const resultMsg = document.getElementById('resultMsg');
  const hintBtn = document.getElementById('hintBtn');
  const swapBtn = document.getElementById('swapBtn');
  const faceEl = document.getElementById('botFace');
  const leftPupil = document.getElementById('leftPupil');
  const rightPupil = document.getElementById('rightPupil');
  const leftPupilWrap = document.getElementById('leftPupilWrap');
  const rightPupilWrap = document.getElementById('rightPupilWrap');
  const smileEl = document.getElementById('smile');

  function cssVar(name, fallback){
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name);
      return (v && v.trim()) || fallback;
    } catch (err){
      return fallback;
    }
  }

  function initBoard() {
    board = new Array(BOARD_SIZE);
    for (let r = 0; r < BOARD_SIZE; r++) board[r] = new Array(BOARD_SIZE).fill(null);

    queues = { X: [], O: [] };
    moveId = 1;
    gameOver = false;
    lastWinningCells = [];
    botPlacementTotal = 0;
    pokerSuspended = false;
    renderGrid();
    markOldestForRemoval();
    setStatus('Game reset');
    resultMsg.style.display = 'none';
    updatePokerFaceState();
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
        if (botActive) {
          if (player === botSide) {
            triggerBotWinExpression();
          } else {
            triggerBotDefeatExpression();
          }
        }
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
      try { lookAtCell(old.r, old.c, 380); } catch (e) { }
      animateRemove(old.r, old.c, () => {
        board[old.r][old.c] = null;
        board[r][c] = player;
        try { lookAtCell(r, c, 240); } catch (e) { }
        const thisMove = { r, c, id: moveId++ };
        queues[player].push(thisMove);
        recordBotPlacementIfNeeded(player);
        finalizeAfterPlacement(r, c);
      });
    } else {
      board[r][c] = player;
      try { lookAtCell(r, c, 240); } catch (e) { }
      const thisMove = { r, c, id: moveId++ };
      queues[player].push(thisMove);
      recordBotPlacementIfNeeded(player);
      finalizeAfterPlacement(r, c);
    }
  }

  function animateRemove(r, c, cb) {
    try { lookAtCell(r, c, 380); } catch (e) { }
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
        const oldest = queues[player][0];
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
    resetFacePlacement();
  });

  swapBtn.addEventListener('click', () => {
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    updateMeta();
    setStatus(`Turn switched to ${currentPlayer}`);
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

  let _lookTimer = null;
  let _blinkTimer = null;
  let _hideTimer = null;
  let _bonkTimer = null;
  let _moodTimer = null;
  let _moodDropTimer = null;
  let _moodRecoverTimer = null;
  let _isLooking = false;
  const PREFERS_REDUCED = (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) || false;

  function _clearLookTimer() { if (_lookTimer) { clearTimeout(_lookTimer); _lookTimer = null; } }
  function _clearBlinkTimer() { if (_blinkTimer) { clearTimeout(_blinkTimer); _blinkTimer = null; } }
  function _clearHideTimer() { if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; } }
  function _clearBonkTimer() { if (_bonkTimer) { clearTimeout(_bonkTimer); _bonkTimer = null; } }

  function showFace() {
    if (!faceEl) { console.debug('showFace: faceEl is null'); return; }
    _clearHideTimer();
    _clearBonkTimer();
    console.debug('showFace: called, faceEl=', faceEl);
    try {
      const anchorEl = gridEl || document.querySelector('.board-wrap') || document.body;
      const anchorBg = getComputedStyle(anchorEl).backgroundColor || getComputedStyle(anchorEl).background || '';
      if (anchorBg) faceEl.style.setProperty('--face-bg', anchorBg);
      faceEl.style.transformOrigin = '50% 100%';
    } catch (e) { }
    try { faceEl.style.removeProperty('display'); } catch (e) {}
    try { faceEl.style.removeProperty('visibility'); } catch (e) {}
    faceEl.classList.add('visible');
    resetFaceMood();
    try { faceEl.setAttribute('aria-hidden', 'false'); } catch (e) {}
    if (boardWrap) boardWrap.classList.add('bot-curve');
    faceEl.style.left = '50%';
    faceEl.style.bottom = '';
    faceEl.style.top = '';
      faceEl.style.removeProperty('bottom');
      faceEl.style.top = '';
      faceEl.style.left = '';
    requestAnimationFrame(() => {
      try {
          const anchorEl = faceEl.parentElement || document.querySelector('.board-wrap') || document.body;
          const gridRect = gridEl.getBoundingClientRect();
          const parentRect = anchorEl.getBoundingClientRect();
          const faceRect = faceEl.getBoundingClientRect();
        const internalSpace = Math.max(0, gridRect.top - parentRect.top - 6);
        const viewportSpaceAboveGrid = Math.max(0, gridRect.top - 8);
        const minScale = 0.6;
        let desiredScale = Math.min(internalSpace / faceRect.height, viewportSpaceAboveGrid / faceRect.height);
        let scale = Math.min(1, Math.max(minScale, desiredScale));
        faceEl.style.setProperty('--face-scale', String(scale));
        requestAnimationFrame(() => {
          try {
            positionFace();
          } catch (e) {
            faceEl.style.top = '';
            faceEl.style.removeProperty('--face-scale');
          }
          try { faceEl.setAttribute('aria-hidden', 'false'); } catch (e) {}
          const finalRect = faceEl.getBoundingClientRect();
          console.debug('showFace: added .visible, final bbox:', finalRect);
        });
      } catch (err) {
        faceEl.style.top = '';
        faceEl.style.bottom = '100%';
        faceEl.style.removeProperty('--face-scale');
        faceEl.classList.add('visible');
        try { faceEl.style.removeProperty('display'); } catch (e) {}
        try { faceEl.setAttribute('aria-hidden', 'false'); } catch (e) {}
      }
    });
    lookCenter(180);
    if (smileEl) smileEl.classList.add('idle');
    scheduleBlink();
    scheduleTwitch();
  }

  function hideFace() {
    if (!faceEl) return;
    faceEl.classList.remove('visible');
    faceEl.classList.remove('face-bonk');
    resetFaceMood();
    try { faceEl.setAttribute('aria-hidden', 'true'); } catch (e) {}
    if (boardWrap) boardWrap.classList.remove('bot-curve');
    _clearLookTimer();
    _clearBlinkTimer();
    _clearHideTimer();
    _hideTimer = setTimeout(() => {
      try {
        if (faceEl && !faceEl.classList.contains('visible')) {
          try { faceEl.style.setProperty('visibility', 'hidden'); } catch (e) {}
        }
      } catch (e) {}
      _hideTimer = null;
    }, 260);
    if (smileEl) smileEl.classList.remove('idle');
    _clearTwitchTimer();
  }

  function scheduleBlink() {
    if (PREFERS_REDUCED || !faceEl) return;
    _clearBlinkTimer();
    const delay = 3000 + Math.floor(Math.random() * 4000);
    _blinkTimer = setTimeout(() => {
      if (_isLooking) return scheduleBlink();
      if (!leftPupil || !rightPupil || !leftPupilWrap || !rightPupilWrap) return scheduleBlink();
      leftPupilWrap.classList.add('eye-blink');
      rightPupilWrap.classList.add('eye-blink');
      setTimeout(() => { leftPupilWrap.classList.remove('eye-blink'); rightPupilWrap.classList.remove('eye-blink'); scheduleBlink(); }, 360);
    }, delay);
  }

  let _twitchTimer = null;
  function _clearTwitchTimer() { if (_twitchTimer) { clearTimeout(_twitchTimer); _twitchTimer = null; } }
  function scheduleTwitch() {
    if (PREFERS_REDUCED || !faceEl) return;
    _clearTwitchTimer();
    const delay = 1260 + Math.floor(Math.random() * 1820);
    _twitchTimer = setTimeout(() => {
      if (!leftPupil || !rightPupil) return scheduleTwitch();
      if (_isLooking) return scheduleTwitch();
      const tx = (Math.random() * 8 - 4);
      const ty = (Math.random() * 6 - 3);
      const dur = 420;
      leftPupil.style.transition = `transform ${Math.floor(dur * 0.6)}ms cubic-bezier(.22,.8,.28,1)`;
      rightPupil.style.transition = `transform ${Math.floor(dur * 0.6)}ms cubic-bezier(.22,.8,.28,1)`;
      leftPupil.style.transform = `translate(${tx}px, ${ty}px)`;
      rightPupil.style.transform = `translate(${tx * 0.82}px, ${ty * 0.88}px)`;
      if (smileEl) smileEl.style.transform = `translateY(${Math.min(3, Math.abs(ty))}px) scaleX(${1 + Math.abs(tx) / 140})`;
      setTimeout(() => {
        leftPupil.style.transition = `transform ${Math.floor(dur * 0.5)}ms cubic-bezier(.22,.8,.28,1)`;
        rightPupil.style.transition = `transform ${Math.floor(dur * 0.5)}ms cubic-bezier(.22,.8,.28,1)`;
        leftPupil.style.transform = `translate(0px, 0px)`;
        rightPupil.style.transform = `translate(0px, 0px)`;
        if (smileEl) smileEl.style.transform = `translateY(0px) scaleX(1)`;
        scheduleTwitch();
      }, dur);
    }, delay);
  }

  function _clearMoodTimer() {
    if (_moodTimer) {
      clearTimeout(_moodTimer);
      _moodTimer = null;
    }
    if (_moodDropTimer) {
      clearTimeout(_moodDropTimer);
      _moodDropTimer = null;
    }
    if (_moodRecoverTimer) {
      clearTimeout(_moodRecoverTimer);
      _moodRecoverTimer = null;
    }
  }

  function resetFaceMood() {
    _clearMoodTimer();
    if (!faceEl) return;
    faceEl.classList.remove('face-defeat', 'face-defeat-drop', 'face-win', 'face-bonk');
    if (smileEl && faceEl.classList.contains('visible')) {
      smileEl.classList.add('idle');
    }
    if (leftPupil) leftPupil.style.transition = '';
    if (rightPupil) rightPupil.style.transition = '';
    lookCenter(180);
    updatePokerFaceState();
  }

  function triggerBotDefeatExpression() {
    if (!faceEl) return;
    _clearMoodTimer();
    pokerSuspended = true;
    faceEl.classList.add('face-defeat');
    faceEl.classList.remove('face-defeat-drop');
    faceEl.classList.remove('face-poker');
    if (smileEl) smileEl.classList.remove('idle');
    const DROP_START_DELAY = 150;
    const DROP_ANIM_DURATION = 1960;
    const EXPRESSION_RECOVER_DELAY = 1500;

    _moodDropTimer = setTimeout(() => {
      faceEl.classList.add('face-defeat-drop');
      _moodDropTimer = null;
      _moodRecoverTimer = setTimeout(() => {
        faceEl.classList.remove('face-defeat');
        if (smileEl) smileEl.classList.add('idle');
        _moodRecoverTimer = null;
      }, EXPRESSION_RECOVER_DELAY);
      _moodTimer = setTimeout(() => {
        _moodTimer = null;
        resetFaceMood();
        requestAnimationFrame(() => {
          try { positionFace(); } catch (e) {}
        });
      }, DROP_ANIM_DURATION + 160);
    }, DROP_START_DELAY);
  }

  function triggerBotWinExpression() {
    const botFace = document.getElementById('botFace');
    if (!botFace) return;

    const pupils = botFace.querySelectorAll('.pupil-wrap circle');
    pupils.forEach(pupil => {
      pupil.style.transition = 'none';
    });

    void botFace.offsetWidth;

    pokerSuspended = true;
    botFace.classList.remove('face-poker');
    botFace.classList.remove('face-bonk');
    botFace.classList.add('face-win');

    setTimeout(() => {
      resetFaceMood();
    }, 2000);
  }

  function lookCenter(duration = 250) {
    if (!faceEl) return;
    _isLooking = false;
    _clearLookTimer();
    if (leftPupil) leftPupil.style.transition = `transform ${duration}ms cubic-bezier(.2,.9,.3,1)`;
    if (rightPupil) rightPupil.style.transition = `transform ${duration}ms cubic-bezier(.2,.9,.3,1)`;
    if (leftPupil) leftPupil.style.transform = `translate(0px, 0px)`;
    if (rightPupil) rightPupil.style.transform = `translate(0px, 0px)`;
    if (smileEl) smileEl.style.transform = `translateY(0px)`;
  }

  function lookAtCell(r, c, duration = 320) {
    if (!faceEl || !_elementVisible(faceEl)) return;
    const cells = gridEl.children;
    const idx = r * BOARD_SIZE + c;
    const targetEl = cells[idx];
    if (!targetEl) { lookCenter(duration); return; }
    const faceRect = faceEl.getBoundingClientRect();
    const targetRect = targetEl.getBoundingClientRect();
    const faceCenter = { x: faceRect.left + faceRect.width/2, y: faceRect.top + faceRect.height/2 };
    const targetCenter = { x: targetRect.left + targetRect.width/2, y: targetRect.top + targetRect.height/2 };
    const dx = targetCenter.x - faceCenter.x;
    const dy = targetCenter.y - faceCenter.y;
    const tx = clamp(dx * 0.06, -10, 10);
    const ty = clamp(dy * 0.045, -6, 6);
    _isLooking = true;
    _clearLookTimer();
    if (leftPupil) leftPupil.style.transition = `transform ${Math.max(120, duration)}ms cubic-bezier(.15,.9,.15,1)`;
    if (rightPupil) rightPupil.style.transition = `transform ${Math.max(120, duration)}ms cubic-bezier(.15,.9,.15,1)`;
    if (leftPupil) leftPupil.style.transform = `translate(${tx}px, ${ty}px)`;
    if (rightPupil) rightPupil.style.transform = `translate(${tx}px, ${ty}px)`;
    if (smileEl) smileEl.style.transform = `translateY(${Math.min(3, Math.abs(ty))}px) scaleX(${1 + Math.abs(tx) / 120})`;
    _lookTimer = setTimeout(() => { lookCenter(Math.max(160, Math.floor(duration * 0.7))); }, duration + 20);
  }

  function _elementVisible(el) { return !!el && el.style && getComputedStyle(el).display !== 'none' && getComputedStyle(el).opacity !== '0'; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function positionFace() {
    if (!faceEl) return;
    faceEl.style.removeProperty('top');
    faceEl.style.removeProperty('left');
    faceEl.style.removeProperty('bottom');
    faceEl.style.transformOrigin = '50% 100%';
  }

  // Reposition on resize so face stays attached when viewport or layout changes
  window.addEventListener('resize', () => { try { positionFace(); } catch (e) {} });

  function resetFacePlacement() {
    if (!faceEl) return;
    resetFaceMood();
    faceEl.style.removeProperty('--face-scale');
    faceEl.style.removeProperty('left');
    faceEl.style.removeProperty('top');
    faceEl.style.removeProperty('bottom');
    requestAnimationFrame(() => {
      try { positionFace(); } catch (e) {}
    });
    lookCenter(120);
  }

  function recordBotPlacementIfNeeded(player) {
    if (botActive && player === botSide) {
      botPlacementTotal++;
      pokerSuspended = false;
    }
    updatePokerFaceState();
  }

  function updatePokerFaceState() {
    if (!faceEl) return;
    if (faceEl.classList.contains('face-win') || faceEl.classList.contains('face-defeat')) {
      faceEl.classList.remove('face-poker');
      return;
    }
    if (pokerSuspended) {
      faceEl.classList.remove('face-poker');
      return;
    }
    const shouldPoker = botPlacementTotal > 10;
    faceEl.classList.toggle('face-poker', shouldPoker);
  }

  function triggerFaceBonk() {
    if (!faceEl || !faceEl.classList.contains('visible')) return;
    if (faceEl.classList.contains('face-win') || faceEl.classList.contains('face-defeat')) return;
    const previousSuspended = pokerSuspended;
    const wasPoker = faceEl.classList.contains('face-poker');
    pokerSuspended = true;
    updatePokerFaceState();
    faceEl.classList.remove('face-bonk');
    void faceEl.offsetWidth;
    faceEl.classList.add('face-bonk');
    if (smileEl) smileEl.classList.remove('idle');
    _clearBonkTimer();
    _bonkTimer = setTimeout(() => {
      faceEl.classList.remove('face-bonk');
      pokerSuspended = previousSuspended;
      if (wasPoker) {
        faceEl.classList.add('face-poker');
      } else {
        updatePokerFaceState();
      }
      _bonkTimer = null;
    }, 560);
  }

  const bonkTargets = [botArch, botArchInner];
  bonkTargets.forEach(target => {
    if (!target) return;
    target.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      triggerFaceBonk();
    });
  });

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
  hintBtn.addEventListener('click', () => {
    botActive = !botActive;
    console.debug('hintBtn clicked -> botActive=', botActive, 'currentPlayer=', currentPlayer, 'faceEl=', faceEl);
    if (botActive) {
      botSide = currentPlayer === 'X' ? 'O' : 'X';
      hintBtn.textContent = 'Bot: ON';
      hintBtn.classList.add('bot-on');
      hintBtn.setAttribute('aria-pressed', 'true');
      difficultySliderContainer.style.display = 'flex';
      showFace();
      if (currentPlayer === botSide) {
        setTimeout(performBotMove, 120);
      }
    } else {
      hintBtn.textContent = 'Play Bot';
      hintBtn.classList.remove('bot-on');
      hintBtn.setAttribute('aria-pressed', 'false');
      hintBtn.style.backgroundColor = '';
      hintBtn.style.color = '';
      setStatus('Bot disabled');
      if (difficultySliderContainer) difficultySliderContainer.style.display = 'none';
      hideFace();
    }
  });
})();
