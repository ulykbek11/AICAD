import React, { useState, useEffect, useRef } from 'react';
import './index.css';

// Helper to generate IDs
const uuid = () => Math.random().toString(36).substring(2, 10);

const defaultLayers = [
  { name: 'Стены',     visible: true, locked: false, lw: 0.35 },
  { name: 'Двери',     visible: true, locked: false, lw: 0.25 },
  { name: 'Окна',      visible: true, locked: false, lw: 0.25 },
  { name: 'Размеры',   visible: true, locked: false, lw: 0.13 },
  { name: 'Мебель',    visible: true, locked: false, lw: 0.18 },
  { name: 'Текст',     visible: true, locked: false, lw: 0.13 },
  { name: 'Штриховка', visible: false,locked: false, lw: 0.09 },
];

export default function App() {
  const [appState, setAppState] = useState({
    activeTool: 'select',
    activeLayer: 'Стены',
    zoom: 1.0,
    panOffset: { x: 400, y: 300 },
    selectedElements: [],
    elements: [],
    layers: defaultLayers,
    commandLog: ["Добро пожаловать в AICAD. Введите команду или выберите инструмент."],
    isDrawing: false,
    drawingPoints: [],
    chatMessages: [
      { role: 'assistant', text: 'Привет! Я AI-ассистент. Опишите что хотите нарисовать — я помогу создать чертёж.' }
    ],
    snapEnabled: true,
    gridEnabled: true,
    orthoEnabled: false,
    osnapEnabled: true,
  });

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState('ГЛАВНАЯ');
  const [chatInput, setChatInput] = useState('');
  const [cmdInput, setCmdInput] = useState('');

  // Undo/Redo stack
  const [history, setHistory] = useState([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Resizable panels
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(110);
  const [resizing, setResizing] = useState(null); // 'right' | 'bottom' | null

  const pushHistory = (newElements) => {
    const newHist = history.slice(0, historyIndex + 1);
    newHist.push(newElements);
    if (newHist.length > 50) newHist.shift();
    setHistory(newHist);
    setHistoryIndex(newHist.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setAppState(p => ({ ...p, elements: history[historyIndex - 1], selectedElements: [] }));
      logCmd("UNDO");
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setAppState(p => ({ ...p, elements: history[historyIndex + 1], selectedElements: [] }));
      logCmd("REDO");
    }
  };

  const svgRef = useRef(null);

  const draftRef = useRef({
    points: [],
    tempPoint: null,
    center: null,
    stringInput: "",
  });

  const stateRef = useRef(appState);
  useEffect(() => { stateRef.current = appState; }, [appState]);

  const logCmd = (msg) => {
    setAppState(p => ({ ...p, commandLog: [...p.commandLog, msg].slice(-8) }));
  };

  const executeAction = (actionName, cmdLog) => {
    logCmd(`_${cmdLog}`);
    switch(actionName) {
      case 'print': window.print(); break;
      case 'pdf':
        logCmd("Печать → выберите 'Сохранить как PDF' в диалоге.");
        window.print();
        break;
      case 'block': logCmd("Вставка блока — в разработке."); break;
      case 'image': logCmd("Вставка изображения — в разработке."); break;
      case 'pdfattach': logCmd("PDF подложка — в разработке."); break;
      case 'leader': logCmd("Выноска — в разработке."); break;
      case 'table': logCmd("Таблица — в разработке."); break;
      default: break;
    }
  };

  const setTool = (tool, logName) => {
    if (tool === 'erase' && stateRef.current.selectedElements.length > 0) {
      const idSet = new Set(stateRef.current.selectedElements);
      const newElements = stateRef.current.elements.filter(el => !idSet.has(el.id));
      setAppState(p => ({ ...p, elements: newElements, selectedElements: [], activeTool: 'select' }));
      pushHistory(newElements);
      if (logName) logCmd(`_${logName}`);
      return;
    }
    setAppState(p => ({
      ...p,
      activeTool: tool,
      isDrawing: false,
      selectedElements: ['select','move','copy','rotate','scale','erase'].includes(tool) ? p.selectedElements : []
    }));
    draftRef.current = { points: [], tempPoint: null, center: null, stringInput: "" };
    if (logName) logCmd(`_${logName}`);
  };

  // Math Helpers
  const dist = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y);

  const getSnapPoint = (cadX, cadY) => {
    const { elements, snapEnabled, osnapEnabled, zoom, gridEnabled } = appState;
    if (!snapEnabled) return { x: cadX, y: cadY, snapped: false };

    const SNAP_RADIUS = 10 / zoom;
    let closest = null;
    let minDist = SNAP_RADIUS;

    if (osnapEnabled) {
      elements.forEach(el => {
        const checkPoints = [];
        if (el.points) checkPoints.push(...el.points);
        if (el.type === 'circle' && el.points[0]) checkPoints.push(el.points[0]);
        if (el.type === 'line' && el.points.length === 2) {
          checkPoints.push({
            x: (el.points[0].x + el.points[1].x) / 2,
            y: (el.points[0].y + el.points[1].y) / 2
          });
        }
        checkPoints.forEach(pt => {
          const d = dist({x:cadX, y:cadY}, pt);
          if (d < minDist) { minDist = d; closest = { ...pt }; }
        });
      });
    }

    if (!closest && gridEnabled) {
      const gridStep = 10;
      const gx = Math.round(cadX / gridStep) * gridStep;
      const gy = Math.round(cadY / gridStep) * gridStep;
      if (dist({x:cadX, y:cadY}, {x:gx, y:gy}) < SNAP_RADIUS) {
        closest = { x: gx, y: gy };
      }
    }

    if (closest) return { ...closest, snapped: true };
    return { x: cadX, y: cadY, snapped: false };
  };

  const getCadCoords = (e) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const { zoom, panOffset, orthoEnabled } = stateRef.current;

    let x = (e.clientX - rect.left - panOffset.x) / zoom;
    let y = (e.clientY - rect.top - panOffset.y) / zoom;

    let snap = getSnapPoint(x, y);
    x = snap.x; y = snap.y;

    if (orthoEnabled && draftRef.current.points.length > 0) {
      const lastPt = draftRef.current.points[draftRef.current.points.length - 1];
      const dx = Math.abs(x - lastPt.x);
      const dy = Math.abs(y - lastPt.y);
      if (dx > dy) y = lastPt.y;
      else x = lastPt.x;
    }

    return { x, y, snapped: snap.snapped };
  };

  // Zoom Extents
  const zoomExtents = () => {
    if (appState.elements.length === 0) {
      setAppState(p => ({ ...p, zoom: 1.0, panOffset: {x: 400, y: 300} }));
    } else {
      let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
      appState.elements.forEach(el => {
        if (el.points) el.points.forEach(p => {
          if(p.x < minX) minX=p.x; if(p.x > maxX) maxX=p.x;
          if(p.y < minY) minY=p.y; if(p.y > maxY) maxY=p.y;
        });
        if (el.type === 'circle' && el.radius) {
          const c = el.points[0];
          if(c.x-el.radius < minX) minX=c.x-el.radius;
          if(c.x+el.radius > maxX) maxX=c.x+el.radius;
          if(c.y-el.radius < minY) minY=c.y-el.radius;
          if(c.y+el.radius > maxY) maxY=c.y+el.radius;
        }
      });
      if (minX === Infinity) return;
      const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
      const rect = svgRef.current.getBoundingClientRect();
      const scaleX = (rect.width - 100)/(maxX-minX || 1);
      const scaleY = (rect.height - 100)/(maxY-minY || 1);
      const scale = Math.min(scaleX, scaleY);
      setAppState(p => ({ ...p, zoom: Math.max(0.1, Math.min(scale, 20)), panOffset: { x: rect.width/2 - cx*scale, y: rect.height/2 - cy*scale } }));
    }
    logCmd("ZOOM EXTENTS");
  };

  // Handle Keyboard
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        setAppState(p => ({ ...p, activeTool: 'select', isDrawing: false, selectedElements: [] }));
        draftRef.current = { points: [], tempPoint: null, center: null };
      }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (stateRef.current.selectedElements.length > 0) {
          const idSet = new Set(stateRef.current.selectedElements);
          const newElements = stateRef.current.elements.filter(el => !idSet.has(el.id));
          setAppState(p => ({ ...p, elements: newElements, selectedElements: [] }));
          pushHistory(newElements);
          logCmd(`Удалено ${idSet.size} объектов`);
        }
      }
      else if (e.key.toLowerCase() === 'l') setTool('line', 'LINE');
      else if (e.key.toLowerCase() === 'c') setTool('circle', 'CIRCLE');
      else if (e.key.toLowerCase() === 'r') setTool('rect', 'RECT');
      else if (e.key.toLowerCase() === 'a') setTool('arc', 'ARC');
      else if (e.key.toLowerCase() === 'm') setTool('move', 'MOVE');
      else if (e.key.toLowerCase() === 'e') setTool('erase', 'ERASE');

      if (e.ctrlKey) {
        if (e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
        if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
        if (e.key.toLowerCase() === 'a') {
          e.preventDefault();
          setAppState(p => ({ ...p, selectedElements: p.elements.map(el => el.id) }));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  // Resize handler
  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e) => {
      if (resizing === 'right') {
        const newWidth = window.innerWidth - e.clientX;
        setRightPanelWidth(Math.max(260, Math.min(650, newWidth)));
      } else if (resizing === 'bottom') {
        const newHeight = window.innerHeight - e.clientY;
        setBottomPanelHeight(Math.max(50, Math.min(350, newHeight)));
      }
    };
    const handleMouseUp = () => setResizing(null);
    document.body.style.cursor = resizing === 'right' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing]);

  // SVG Mouse handlers
  const onMouseMove = (e) => {
    const cadPt = getCadCoords(e);
    setMousePos({ x: cadPt.x, y: cadPt.y });

    if (appState.activeTool === 'pan' && e.buttons === 1) {
      setAppState(p => ({
        ...p,
        panOffset: { x: p.panOffset.x + e.movementX, y: p.panOffset.y + e.movementY }
      }));
    } else if (e.buttons === 4) {
      setAppState(p => ({
        ...p,
        panOffset: { x: p.panOffset.x + e.movementX, y: p.panOffset.y + e.movementY }
      }));
    } else if (appState.activeTool === 'box_select' && appState.isDrawing) {
      draftRef.current.tempPoint = cadPt;
      setAppState(p => ({ ...p, drawingPoints: [...draftRef.current.points, cadPt] }));
    } else if (appState.isDrawing) {
      draftRef.current.tempPoint = cadPt;
      setAppState(p => ({ ...p, drawingPoints: [...draftRef.current.points, cadPt] }));
    }
  };

  const onMouseDown = (e) => {
    if (e.button !== 0 && appState.activeTool !== 'pan') return;
    if (appState.activeTool === 'pan') return;

    const pt = getCadCoords(e);

    if (appState.activeTool === 'select') {
      if (e.target.tagName === 'svg' || e.target.tagName === 'rect' || e.target.tagName === 'pattern') {
        setAppState(p => ({ ...p, activeTool: 'box_select', isDrawing: true, drawingPoints: [pt, pt] }));
        draftRef.current.points = [pt];
      }
      return;
    }

    // DRAWING LOGIC
    if (appState.activeTool === 'line') {
      if (!appState.isDrawing) {
        draftRef.current.points = [pt];
        setAppState(p => ({ ...p, isDrawing: true, drawingPoints: [pt, pt] }));
      } else {
        const newEl = {
          id: uuid(), type: 'line', layer: appState.activeLayer, points: [draftRef.current.points[0], pt]
        };
        const newElements = [...appState.elements, newEl];
        setAppState(p => ({ ...p, elements: newElements, isDrawing: true, drawingPoints: [pt, pt] }));
        draftRef.current.points = [pt];
        pushHistory(newElements);
        logCmd(`LINE (${newEl.points[0].x.toFixed(1)},${newEl.points[0].y.toFixed(1)}) → (${pt.x.toFixed(1)},${pt.y.toFixed(1)})`);
      }
    }
    else if (appState.activeTool === 'arc') {
      if (!appState.isDrawing) {
        draftRef.current.points = [pt];
        setAppState(p => ({ ...p, isDrawing: true, drawingPoints: [pt, pt] }));
      } else if (draftRef.current.points.length === 1) {
        draftRef.current.points.push(pt);
        setAppState(p => ({ ...p, drawingPoints: [...draftRef.current.points, pt] }));
      } else {
        const pts = [...draftRef.current.points, pt];
        const newEl = { id: uuid(), type: 'arc', layer: appState.activeLayer, points: pts };
        const newElements = [...appState.elements, newEl];
        setAppState(p => ({ ...p, elements: newElements, isDrawing: false, drawingPoints: [] }));
        pushHistory(newElements);
        logCmd("ARC завершён");
      }
    }
    else if (appState.activeTool === 'polygon' || appState.activeTool === 'spline') {
      const pts = [...draftRef.current.points, pt];
      draftRef.current.points = pts;
      setAppState(p => ({ ...p, isDrawing: true, drawingPoints: pts }));
    }
    else if (appState.activeTool === 'circle') {
      if (!appState.isDrawing) {
        draftRef.current.points = [pt];
        setAppState(p => ({ ...p, isDrawing: true, drawingPoints: [pt, pt] }));
      } else {
        const center = draftRef.current.points[0];
        const radius = dist(center, pt);
        const newEl = { id: uuid(), type: 'circle', layer: appState.activeLayer, points: [center], radius };
        const newElements = [...appState.elements, newEl];
        setAppState(p => ({ ...p, elements: newElements, isDrawing: false, drawingPoints: [] }));
        pushHistory(newElements);
        logCmd(`CIRCLE центр (${center.x.toFixed(1)},${center.y.toFixed(1)}) R=${radius.toFixed(1)}`);
      }
    }
    else if (appState.activeTool === 'rect') {
      if (!appState.isDrawing) {
        draftRef.current.points = [pt];
        setAppState(p => ({ ...p, isDrawing: true, drawingPoints: [pt, pt] }));
      } else {
        const p1 = draftRef.current.points[0];
        const p2 = pt;
        const newEl = {
          id: uuid(), type: 'rect', layer: appState.activeLayer,
          points: [ {x: p1.x, y: p1.y}, {x: p2.x, y: p1.y}, {x: p2.x, y: p2.y}, {x: p1.x, y: p2.y} ]
        };
        const newElements = [...appState.elements, newEl];
        setAppState(p => ({ ...p, elements: newElements, isDrawing: false, drawingPoints: [] }));
        pushHistory(newElements);
        logCmd(`RECT (${p1.x.toFixed(1)},${p1.y.toFixed(1)}) → (${p2.x.toFixed(1)},${p2.y.toFixed(1)})`);
      }
    }
    else if (appState.activeTool === 'text') {
      const textVal = window.prompt("Введите текст:");
      if (!textVal) { setTool('select', ''); return; }
      const newEl = { id: uuid(), type: 'text', layer: appState.activeLayer, points: [pt], text: textVal };
      const newElements = [...appState.elements, newEl];
      setAppState(p => ({ ...p, elements: newElements, isDrawing: false, drawingPoints: [], activeTool: 'select' }));
      pushHistory(newElements);
      logCmd(`TEXT "${textVal}" (${pt.x.toFixed(1)},${pt.y.toFixed(1)})`);
    }
    else if (appState.activeTool === 'dim') {
      if (!appState.isDrawing) {
        draftRef.current.points = [pt];
        setAppState(p => ({ ...p, isDrawing: true, drawingPoints: [pt, pt] }));
      } else {
        const p1 = draftRef.current.points[0];
        const p2 = pt;
        const newEl = { id: uuid(), type: 'dim', layer: appState.activeLayer, points: [p1, p2] };
        const newElements = [...appState.elements, newEl];
        setAppState(p => ({ ...p, elements: newElements, isDrawing: false, drawingPoints: [], activeTool: 'select' }));
        pushHistory(newElements);
        logCmd(`DIM ${dist(p1,p2).toFixed(2)}`);
      }
    }
    else if (appState.activeTool === 'erase') {
      // handled by element click
    }
    else if (appState.activeTool === 'move') {
      if (appState.selectedElements.length === 0) { logCmd("Сначала выберите объекты"); return; }
      if (!appState.isDrawing) {
        draftRef.current.points = [pt];
        setAppState(p => ({ ...p, isDrawing: true, drawingPoints: [pt, pt] }));
      } else {
        const p1 = draftRef.current.points[0];
        const dx = pt.x - p1.x;
        const dy = pt.y - p1.y;
        const selSet = new Set(appState.selectedElements);
        const newElements = appState.elements.map(el => {
          if (!selSet.has(el.id)) return el;
          const movedPts = el.points?.map(p => ({x: p.x + dx, y: p.y + dy}));
          return { ...el, points: movedPts };
        });
        setAppState(p => ({ ...p, elements: newElements, isDrawing: false, drawingPoints: [] }));
        pushHistory(newElements);
        logCmd(`MOVE (${dx.toFixed(1)}, ${dy.toFixed(1)})`);
      }
    }
    else if (appState.activeTool === 'copy') {
      if (appState.selectedElements.length === 0) { logCmd("Сначала выберите объекты"); return; }
      if (!appState.isDrawing) {
        draftRef.current.points = [pt];
        setAppState(p => ({ ...p, isDrawing: true, drawingPoints: [pt, pt] }));
      } else {
        const p1 = draftRef.current.points[0];
        const dx = pt.x - p1.x;
        const dy = pt.y - p1.y;
        const selSet = new Set(appState.selectedElements);
        const copied = appState.elements.filter(e => selSet.has(e.id)).map(el => {
          return { ...el, id: uuid(), points: el.points?.map(p => ({x: p.x + dx, y: p.y + dy})) };
        });
        const newElements = [...appState.elements, ...copied];
        setAppState(p => ({ ...p, elements: newElements, isDrawing: false, drawingPoints: [] }));
        pushHistory(newElements);
        logCmd(`COPY (${dx.toFixed(1)}, ${dy.toFixed(1)})`);
      }
    }
    else if (appState.activeTool === 'rotate') {
      if (appState.selectedElements.length === 0) { logCmd("Сначала выберите объекты"); return; }
      if (!appState.isDrawing) {
        draftRef.current.points = [pt];
        setAppState(p => ({ ...p, isDrawing: true, drawingPoints: [pt, pt] }));
      } else {
        const center = draftRef.current.points[0];
        const angle = Math.atan2(pt.y - center.y, pt.x - center.x);
        const selSet = new Set(appState.selectedElements);
        const newElements = appState.elements.map(el => {
          if (!selSet.has(el.id)) return el;
          const movedPts = el.points?.map(p => {
            const dx = p.x - center.x;
            const dy = p.y - center.y;
            return {
              x: center.x + dx * Math.cos(angle) - dy * Math.sin(angle),
              y: center.y + dx * Math.sin(angle) + dy * Math.cos(angle)
            };
          });
          return { ...el, points: movedPts };
        });
        setAppState(p => ({ ...p, elements: newElements, isDrawing: false, drawingPoints: [] }));
        pushHistory(newElements);
        logCmd(`ROTATE ${(angle * 180 / Math.PI).toFixed(1)}°`);
      }
    }
    else if (appState.activeTool === 'scale') {
      if (appState.selectedElements.length === 0) { logCmd("Сначала выберите объекты"); return; }
      if (!appState.isDrawing) {
        draftRef.current.points = [pt];
        setAppState(p => ({ ...p, isDrawing: true, drawingPoints: [pt, pt] }));
      } else {
        const center = draftRef.current.points[0];
        const distInitial = 50;
        const scaleFactor = Math.max(0.01, dist(center, pt) / distInitial);
        const selSet = new Set(appState.selectedElements);
        const newElements = appState.elements.map(el => {
          if (!selSet.has(el.id)) return el;
          const movedPts = el.points?.map(p => {
            const dx = p.x - center.x;
            const dy = p.y - center.y;
            return { x: center.x + dx * scaleFactor, y: center.y + dy * scaleFactor };
          });
          return { ...el, points: movedPts, radius: el.radius ? el.radius * scaleFactor : el.radius };
        });
        setAppState(p => ({ ...p, elements: newElements, isDrawing: false, drawingPoints: [] }));
        pushHistory(newElements);
        logCmd(`SCALE ${scaleFactor.toFixed(2)}x`);
      }
    }
  };

  const onMouseUp = (e) => {
    if (appState.activeTool === 'box_select' && appState.isDrawing) {
      const p1 = draftRef.current.points[0];
      const p2 = draftRef.current.tempPoint;
      if (!p2) { setTool('select'); return; }

      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      const mode = p1.x < p2.x ? 'inside' : 'crossing';

      const selected = appState.elements.filter(el => {
        const layer = appState.layers.find(l => l.name === el.layer);
        if (!layer || layer.locked || !layer.visible) return false;
        if (!el.points) return false;

        let insideCnt = 0;
        let crossCnt = 0;
        el.points.forEach(pt => {
          if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) insideCnt++;
        });

        if (el.type === 'circle') {
          const cx = el.points[0].x, cy = el.points[0].y, r = el.radius;
          if (cx-r >= minX && cx+r <= maxX && cy-r >= minY && cy+r <= maxY) insideCnt += 2;
          else if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) crossCnt++;
        }

        if (mode === 'inside') {
          return insideCnt === (el.points.length || 1);
        } else {
          return insideCnt > 0 || crossCnt > 0;
        }
      }).map(el => el.id);

      setAppState(p => ({
        ...p,
        activeTool: 'select',
        isDrawing: false,
        selectedElements: e.shiftKey ? [...new Set([...p.selectedElements, ...selected])] : selected
      }));
      if (selected.length>0) logCmd(`Выбрано ${selected.length} объектов`);
    }
  };

  const onDoubleClick = (e) => {
    if (['polyline', 'spline', 'polygon'].includes(appState.activeTool)) {
      const newEl = { id: uuid(), type: appState.activeTool, layer: appState.activeLayer, points: draftRef.current.points };
      const newElements = [...appState.elements, newEl];
      setAppState(p => ({ ...p, elements: newElements, isDrawing: false, drawingPoints: [] }));
      draftRef.current = { points: [] };
      pushHistory(newElements);
      logCmd(`${appState.activeTool.toUpperCase()} завершён`);
    }
  };

  // Zoom wheel
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const zoomStep = 0.1;
      const factor = e.deltaY < 0 ? 1 + zoomStep : 1 - zoomStep;
      setAppState(p => {
        const newZoom = Math.min(Math.max(p.zoom * factor, 0.05), 20.0);
        const rect = svgEl.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const newPanX = mouseX - (mouseX - p.panOffset.x) * (newZoom / p.zoom);
        const newPanY = mouseY - (mouseY - p.panOffset.y) * (newZoom / p.zoom);
        return { ...p, zoom: newZoom, panOffset: { x: newPanX, y: newPanY } };
      });
    };
    svgEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => svgEl.removeEventListener('wheel', handleWheel);
  }, []);

  const handleZoomButton = (isZoomIn) => {
    setAppState(p => {
      if (!svgRef.current) return p;
      const factor = isZoomIn ? 1.2 : 1 / 1.2;
      const newZoom = Math.min(Math.max(p.zoom * factor, 0.05), 20.0);
      const rect = svgRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const newPanX = centerX - (centerX - p.panOffset.x) * (newZoom / p.zoom);
      const newPanY = centerY - (centerY - p.panOffset.y) * (newZoom / p.zoom);
      return { ...p, zoom: newZoom, panOffset: { x: newPanX, y: newPanY } };
    });
  };

  // Click on element
  const handleObjectClick = (e, el) => {
    e.stopPropagation();
    const layerInfo = appState.layers.find(l => l.name === el.layer);
    if (!layerInfo || layerInfo.locked) return;

    if (appState.activeTool === 'erase') {
      const newElements = appState.elements.filter(x => x.id !== el.id);
      setAppState(p => ({ ...p, elements: newElements, activeTool: 'select' }));
      pushHistory(newElements);
      logCmd("ERASE");
      return;
    }

    if (appState.activeTool === 'trim') {
      const newElements = appState.elements.filter(x => x.id !== el.id);
      setAppState(p => ({ ...p, elements: newElements, activeTool: 'select' }));
      pushHistory(newElements);
      logCmd("TRIM");
      return;
    }

    if (['select', 'move', 'copy', 'rotate', 'scale'].includes(appState.activeTool)) {
      setAppState(p => ({
        ...p,
        selectedElements: e.shiftKey
          ? (p.selectedElements.includes(el.id) ? p.selectedElements.filter(id => id !== el.id) : [...p.selectedElements, el.id])
          : [el.id]
      }));
    }
  };

  const getCursor = () => {
    if (appState.activeTool === 'pan') return appState.isDrawing ? 'grabbing' : 'grab';
    if (['line','polyline','circle','rect','arc','polygon','box_select','text','dim'].includes(appState.activeTool)) return 'crosshair';
    if (appState.activeTool === 'erase' || appState.activeTool === 'trim') return 'cell';
    return 'default';
  };

  // AI Chat
  const handleChatEnter = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput;
    setChatInput('');
    setAppState(p => ({
      ...p,
      chatMessages: [...p.chatMessages, { role: 'user', text: userMsg }],
    }));
    logCmd("AI_GENERATE");
    setTimeout(() => {
      setAppState(p => ({
        ...p,
        chatMessages: [...p.chatMessages, { role: 'assistant', text: "Понял! Генерирую план...\nКогда бэкенд будет подключён, здесь появится готовый чертёж." }]
      }));
    }, 1500);
  };

  const toggleLayerAttr = (layerName, attr) => {
    setAppState(p => ({
      ...p,
      layers: p.layers.map(l => l.name === layerName ? { ...l, [attr]: !l[attr] } : l)
    }));
  };

  // Command input handler
  const handleCommand = (v) => {
    const cmd = v.trim().toUpperCase();
    if (!cmd) return;
    let handled = true;
    switch(cmd) {
      case 'L': case 'LINE': setTool('line', 'LINE'); break;
      case 'C': case 'CIRCLE': setTool('circle', 'CIRCLE'); break;
      case 'REC': case 'RECT': setTool('rect', 'RECT'); break;
      case 'A': case 'ARC': setTool('arc', 'ARC'); break;
      case 'M': case 'MOVE': setTool('move', 'MOVE'); break;
      case 'CO': case 'COPY': setTool('copy', 'COPY'); break;
      case 'RO': case 'ROTATE': setTool('rotate', 'ROTATE'); break;
      case 'SC': case 'SCALE': setTool('scale', 'SCALE'); break;
      case 'TR': case 'TRIM': setTool('trim', 'TRIM'); break;
      case 'E': case 'ERASE': setTool('erase', 'ERASE'); break;
      case 'T': case 'TEXT': case 'MTEXT': setTool('text', 'MTEXT'); break;
      case 'DIM': case 'D': case 'DIMALIGNED': setTool('dim', 'DIMALIGNED'); break;
      case 'U': case 'UNDO': undo(); break;
      case 'REDO': redo(); break;
      case 'Z': case 'ZOOM': case 'ZE': zoomExtents(); break;
      case 'PAN': setTool('pan', 'PAN'); break;
      case 'SELECT': case 'ESC': setTool('select'); break;
      case 'PRINT': case 'PLOT': window.print(); break;
      case 'HELP':
        logCmd("Команды: L=Линия, C=Круг, REC=Прямоуг., A=Дуга, M=Перемещ., CO=Копир., RO=Поворот, SC=Масштаб, TR=Обрезка, E=Удаление, T=Текст, DIM=Размер, U=Отмена, Z=Зум, PAN=Панорама, PRINT=Печать");
        break;
      default:
        handled = false;
        logCmd(`Неизвестная команда: ${cmd}. Введите HELP для списка.`);
        break;
    }
    if (handled && cmd !== 'HELP') logCmd(`> ${cmd}`);
  };

  // Render SVG Elements
  const renderElements = () => {
    const { elements, layers, selectedElements } = appState;

    return elements.map(el => {
      const layer = layers.find(l => l.name === el.layer);
      if (!layer || !layer.visible) return null;

      const isSelected = selectedElements.includes(el.id);
      const strokeWidth = layer.lw;

      let shape = null;
      if (el.type === 'line' && el.points.length >= 2) {
        shape = <line x1={el.points[0].x} y1={el.points[0].y} x2={el.points[1].x} y2={el.points[1].y} />;
      } else if (el.type === 'circle') {
        shape = <circle cx={el.points[0].x} cy={el.points[0].y} r={el.radius} />;
      } else if (el.type === 'rect' || el.type === 'polygon' || el.type === 'polyline') {
        const pts = el.points.map(p => `${p.x},${p.y}`).join(' ');
        shape = el.type === 'polyline' ? <polyline points={pts} fill="none" /> : <polygon points={pts} fill="none" />;
      } else if (el.type === 'arc') {
        const [p1, p2, p3] = el.points;
        shape = <path d={`M ${p1.x} ${p1.y} Q ${p2.x} ${p2.y} ${p3.x} ${p3.y}`} strokeWidth={strokeWidth} fill="none" />;
      } else if (el.type === 'text') {
        shape = <text x={el.points[0].x} y={el.points[0].y} fill={isSelected ? '#4a9eff' : '#ffffff'} fontSize={14/appState.zoom} fontFamily="Inter, sans-serif">{el.text}</text>;
      } else if (el.type === 'dim') {
        const [p1, p2] = el.points;
        const distance = dist(p1, p2).toFixed(2);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        shape = (
          <g>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} fill="none" stroke={isSelected ? '#4a9eff' : '#ffffff'} strokeWidth={strokeWidth} strokeDasharray="5,5" />
            <text x={midX} y={midY - 5/appState.zoom} fill={isSelected ? '#4a9eff' : '#ffffff'} fontSize={12/appState.zoom} textAnchor="middle" style={{ userSelect: 'none' }}>{distance}</text>
          </g>
        );
      }

      if (!shape) return null;

      const isTextOrDim = el.type === 'text' || el.type === 'dim';

      return (
        <g
          key={el.id}
          className={`cad-object ${layer.locked ? 'locked' : ''}`}
          style={{ pointerEvents: layer.locked ? 'none' : 'auto' }}
          onClick={(e) => handleObjectClick(e, el)}
        >
          {isTextOrDim ? null : React.cloneElement(shape, { stroke: "transparent", strokeWidth: 10/appState.zoom, pointerEvents: "stroke", fill: "none" })}
          {isTextOrDim ? shape : React.cloneElement(shape, { stroke: isSelected ? '#4a9eff' : '#ffffff', strokeWidth: strokeWidth, fill: "none" })}
          {isSelected && !layer.locked && (
            <g>
              {el.points.map((p, idx) => (
                <rect key={idx} x={p.x - 3/appState.zoom} y={p.y - 3/appState.zoom} width={6/appState.zoom} height={6/appState.zoom} className="cad-grip" strokeWidth={1/appState.zoom} />
              ))}
            </g>
          )}
        </g>
      );
    });
  };

  // Render Draft/Preview
  const renderDraft = () => {
    const { activeTool, drawingPoints } = appState;
    if (!appState.isDrawing || drawingPoints.length < 2) return null;

    const p1 = drawingPoints[0];
    const p2 = drawingPoints[drawingPoints.length - 1];

    if (activeTool === 'line') {
      return <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#4a9eff" strokeWidth="1" strokeDasharray="5,5" />;
    }
    if (activeTool === 'rect') {
      const w = p2.x - p1.x;
      const h = p2.y - p1.y;
      return <rect x={w>0?p1.x:p2.x} y={h>0?p1.y:p2.y} width={Math.abs(w)} height={Math.abs(h)} stroke="#4a9eff" fill="none" strokeWidth="1" strokeDasharray="5,5" />;
    }
    if (activeTool === 'circle') {
      return <circle cx={p1.x} cy={p1.y} r={dist(p1, p2)} stroke="#4a9eff" fill="none" strokeWidth="1" strokeDasharray="5,5" />;
    }
    if (['polyline', 'polygon', 'spline'].includes(activeTool)) {
      const pts = drawingPoints.map(p => `${p.x},${p.y}`).join(' ');
      return <polyline points={pts} stroke="#4a9eff" fill="none" strokeWidth="1" strokeDasharray="5,5" />;
    }
    if (activeTool === 'arc') {
      if (drawingPoints.length <= 2) {
        return <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#4a9eff" strokeWidth="1" strokeDasharray="5,5" />;
      } else {
        const mid = drawingPoints[1];
        return <path d={`M ${p1.x} ${p1.y} Q ${mid.x} ${mid.y} ${p2.x} ${p2.y}`} stroke="#4a9eff" fill="none" strokeWidth="1" strokeDasharray="5,5" />;
      }
    }
    if (activeTool === 'dim') {
      const distance = dist(p1, p2).toFixed(2);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      return (
        <g>
          <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#4a9eff" strokeWidth="1" strokeDasharray="5,5" />
          <text x={midX} y={midY - 5/appState.zoom} fill="#4a9eff" fontSize={12/appState.zoom} textAnchor="middle">{distance}</text>
        </g>
      );
    }
    if (['move', 'copy', 'rotate', 'scale'].includes(activeTool)) {
      const { selectedElements, elements } = appState;
      if (selectedElements.length === 0) return null;
      const selElements = elements.filter(e => selectedElements.includes(e.id));

      const center = drawingPoints[0];
      let dx = 0, dy = 0, scaleFactor = 1, angle = 0;
      if (activeTool === 'move' || activeTool === 'copy') {
        dx = p2.x - center.x;
        dy = p2.y - center.y;
      } else if (activeTool === 'rotate') {
        angle = Math.atan2(p2.y - center.y, p2.x - center.x);
      } else if (activeTool === 'scale') {
        const distInitial = 50;
        scaleFactor = Math.max(0.01, dist(center, p2) / distInitial);
      }

      return (
        <g opacity="0.6">
          <line x1={center.x} y1={center.y} x2={p2.x} y2={p2.y} stroke="#8888aa" strokeWidth={1/appState.zoom} strokeDasharray="5,5" />
          {selElements.map(el => {
            let movedPts = el.points;
            let newRadius = el.radius;
            if (activeTool === 'move' || activeTool === 'copy') {
              movedPts = el.points?.map(p => ({x: p.x + dx, y: p.y + dy}));
            } else if (activeTool === 'rotate') {
              movedPts = el.points?.map(p => {
                const dx0 = p.x - center.x;
                const dy0 = p.y - center.y;
                return {
                  x: center.x + dx0 * Math.cos(angle) - dy0 * Math.sin(angle),
                  y: center.y + dx0 * Math.sin(angle) + dy0 * Math.cos(angle)
                };
              });
            } else if (activeTool === 'scale') {
              movedPts = el.points?.map(p => {
                const dx0 = p.x - center.x;
                const dy0 = p.y - center.y;
                return { x: center.x + dx0 * scaleFactor, y: center.y + dy0 * scaleFactor };
              });
              newRadius = el.radius ? el.radius * scaleFactor : el.radius;
            }

            let shape = null;
            if (el.type === 'line' && movedPts && movedPts.length >= 2) {
              shape = <line x1={movedPts[0].x} y1={movedPts[0].y} x2={movedPts[1].x} y2={movedPts[1].y} />;
            } else if (el.type === 'circle' && movedPts && movedPts.length > 0) {
              shape = <circle cx={movedPts[0].x} cy={movedPts[0].y} r={newRadius} />;
            } else if ((el.type === 'rect' || el.type === 'polygon' || el.type === 'polyline') && movedPts) {
              const ptsStr = movedPts.map(p => `${p.x},${p.y}`).join(' ');
              shape = el.type === 'polyline' ? <polyline points={ptsStr} fill="none" /> : <polygon points={ptsStr} fill="none" />;
            } else if (el.type === 'arc' && movedPts && movedPts.length === 3) {
              const [mp1, mp2, mp3] = movedPts;
              shape = <path d={`M ${mp1.x} ${mp1.y} Q ${mp2.x} ${mp2.y} ${mp3.x} ${mp3.y}`} fill="none" />;
            }

            if (!shape) return null;
            return (
              <g key={`draft-${el.id}`} stroke="#4a9eff" strokeWidth={1/appState.zoom} strokeDasharray="5,5">
                {shape}
              </g>
            );
          })}
        </g>
      );
    }
    if (activeTool === 'box_select') {
      const w = p2.x - p1.x;
      const h = p2.y - p1.y;
      const isL2R = p1.x < p2.x;
      return <rect
        x={w>0?p1.x:p2.x} y={h>0?p1.y:p2.y}
        width={Math.abs(w)} height={Math.abs(h)}
        fill={isL2R ? "rgba(74, 158, 255, 0.2)" : "rgba(74, 255, 158, 0.2)"}
        stroke={isL2R ? "#4a9eff" : "#4aff4a"}
        strokeWidth={1/appState.zoom}
        strokeDasharray={isL2R ? "none" : "5,5"}
      />;
    }
    return null;
  };

  const hasElements = appState.elements.length > 0;

  // ──────────────────────────── RENDER ────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#0a0a16', color: '#d0d8e8', fontSize: '13px', fontFamily: "'Inter', sans-serif", userSelect: 'none' }}>

      {/* ═══ TITLE BAR ═══ */}
      <div style={{ height: 32, background: '#12121f', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', fontSize: 12, flexShrink: 0, borderBottom: '1px solid #1e2a3a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fa-brands fa-codepen" style={{ color: '#4a9eff' }}></i>
          <span style={{ fontWeight: 600, letterSpacing: '0.5px', color: '#c0d0e0' }}>AICAD — Drawing1.dwg</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#6070A0' }}>
          <i className="fa-solid fa-minus" style={{ cursor: 'pointer' }} onMouseEnter={e => e.target.style.color = '#fff'} onMouseLeave={e => e.target.style.color = '#6070A0'}></i>
          <i className="fa-solid fa-expand" style={{ cursor: 'pointer' }} onMouseEnter={e => e.target.style.color = '#fff'} onMouseLeave={e => e.target.style.color = '#6070A0'}
            onClick={() => {
              if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
              else document.exitFullscreen();
            }} title="Во весь экран"></i>
          <i className="fa-solid fa-xmark" style={{ cursor: 'pointer', fontSize: 14 }} onMouseEnter={e => e.target.style.color = '#ff4a4a'} onMouseLeave={e => e.target.style.color = '#6070A0'}></i>
        </div>
      </div>

      {/* ═══ TAB BAR ═══ */}
      <div style={{ height: 34, background: '#0e1220', display: 'flex', alignItems: 'flex-end', padding: '0 8px', flexShrink: 0, borderBottom: '1px solid #1e2a3a', gap: 2 }}>
        {['ГЛАВНАЯ', 'ВСТАВКА', 'АННОТАЦИИ', 'ВЫВОД'].map((tab) => (
          <div
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '6px 20px',
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
              fontSize: 11,
              fontWeight: activeTab === tab ? 700 : 500,
              letterSpacing: '0.8px',
              color: activeTab === tab ? '#ffffff' : '#6878A0',
              background: activeTab === tab ? '#1a2235' : 'transparent',
              borderTop: activeTab === tab ? '2px solid #4a9eff' : '2px solid transparent',
              borderLeft: activeTab === tab ? '1px solid #1e2a3a' : '1px solid transparent',
              borderRight: activeTab === tab ? '1px solid #1e2a3a' : '1px solid transparent',
              borderBottom: activeTab === tab ? '1px solid #1a2235' : 'none',
              marginBottom: activeTab === tab ? -1 : 0,
              transition: 'all 0.15s',
              position: 'relative',
              zIndex: activeTab === tab ? 2 : 1,
            }}
            onMouseEnter={e => { if (activeTab !== tab) e.currentTarget.style.color = '#a0b0d0'; }}
            onMouseLeave={e => { if (activeTab !== tab) e.currentTarget.style.color = '#6878A0'; }}
          >
            {tab}
          </div>
        ))}
      </div>

      {/* ═══ RIBBON TOOLBAR ═══ */}
      <div style={{ height: 78, background: '#131a28', display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #1e2a3a', flexShrink: 0, overflow: 'hidden', position: 'relative', zIndex: 10 }}>

        {activeTab === 'ГЛАВНАЯ' && (
          <>
            {/* Рисование */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRight: '1px solid #1e2a3a', padding: '4px 8px', minWidth: 260 }}>
              <div style={{ display: 'flex', gap: 2, paddingTop: 2, justifyContent: 'center' }}>
                <div className={`tool-btn ${appState.activeTool === 'line' ? 'active' : ''}`} onClick={() => setTool('line', 'LINE')} title="Отрезок [L]"><i className="fa-solid fa-minus"></i><span>Отрезок</span></div>
                <div className={`tool-btn ${appState.activeTool === 'circle' ? 'active' : ''}`} onClick={() => setTool('circle', 'CIRCLE')} title="Круг [C]"><i className="fa-regular fa-circle"></i><span>Круг</span></div>
                <div className={`tool-btn ${appState.activeTool === 'rect' ? 'active' : ''}`} onClick={() => setTool('rect', 'RECT')} title="Прямоугольник [R]"><i className="fa-regular fa-square"></i><span>Прямоуг.</span></div>
                <div className={`tool-btn ${appState.activeTool === 'arc' ? 'active' : ''}`} onClick={() => setTool('arc', 'ARC')} title="Дуга [A]"><i className="fa-solid fa-bezier-curve"></i><span>Дуга</span></div>
              </div>
              <div style={{ textAlign: 'center', fontSize: 10, color: '#5568A0', paddingBottom: 2, fontWeight: 500 }}>Рисование</div>
            </div>

            {/* Редактирование */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRight: '1px solid #1e2a3a', padding: '4px 8px', minWidth: 310 }}>
              <div style={{ display: 'flex', gap: 2, paddingTop: 2, justifyContent: 'center' }}>
                <div className={`tool-btn ${appState.activeTool === 'move' ? 'active' : ''}`} onClick={() => setTool('move', 'MOVE')} title="Переместить [M]"><i className="fa-solid fa-arrows-up-down-left-right"></i><span>Двигать</span></div>
                <div className={`tool-btn ${appState.activeTool === 'copy' ? 'active' : ''}`} onClick={() => setTool('copy', 'COPY')} title="Копировать"><i className="fa-regular fa-copy"></i><span>Копир.</span></div>
                <div className={`tool-btn ${appState.activeTool === 'rotate' ? 'active' : ''}`} onClick={() => setTool('rotate', 'ROTATE')} title="Повернуть"><i className="fa-solid fa-rotate"></i><span>Поворот</span></div>
                <div className={`tool-btn ${appState.activeTool === 'scale' ? 'active' : ''}`} onClick={() => setTool('scale', 'SCALE')} title="Масштаб"><i className="fa-solid fa-maximize"></i><span>Масштаб</span></div>
                <div className={`tool-btn ${appState.activeTool === 'trim' ? 'active' : ''}`} onClick={() => setTool('trim', 'TRIM')} title="Обрезать"><i className="fa-solid fa-scissors"></i><span>Обрезать</span></div>
              </div>
              <div style={{ textAlign: 'center', fontSize: 10, color: '#5568A0', paddingBottom: 2, fontWeight: 500 }}>Редактирование</div>
            </div>
          </>
        )}

        {activeTab === 'ВСТАВКА' && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRight: '1px solid #1e2a3a', padding: '4px 8px', minWidth: 260 }}>
            <div style={{ display: 'flex', gap: 2, paddingTop: 2, justifyContent: 'center' }}>
              <div className="tool-btn" onClick={() => executeAction('block', 'INSERT')}><i className="fa-solid fa-shapes"></i><span>Блок</span></div>
              <div className="tool-btn" onClick={() => executeAction('image', 'IMAGE')}><i className="fa-regular fa-image"></i><span>Изображ.</span></div>
              <div className="tool-btn" onClick={() => executeAction('pdfattach', 'PDFATTACH')}><i className="fa-regular fa-file-pdf"></i><span>PDF</span></div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 10, color: '#5568A0', paddingBottom: 2, fontWeight: 500 }}>Вставка</div>
          </div>
        )}

        {activeTab === 'АННОТАЦИИ' && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRight: '1px solid #1e2a3a', padding: '4px 8px', minWidth: 280 }}>
            <div style={{ display: 'flex', gap: 2, paddingTop: 2, justifyContent: 'center' }}>
              <div className={`tool-btn ${appState.activeTool === 'dim' ? 'active' : ''}`} onClick={() => setTool('dim', 'DIMALIGNED')}><i className="fa-solid fa-arrows-left-right-to-line"></i><span>Размер</span></div>
              <div className={`tool-btn ${appState.activeTool === 'text' ? 'active' : ''}`} onClick={() => setTool('text', 'MTEXT')}><i className="fa-solid fa-font"></i><span>Текст</span></div>
              <div className="tool-btn" onClick={() => executeAction('leader', 'MLEADER')}><i className="fa-solid fa-arrow-right"></i><span>Выноска</span></div>
              <div className="tool-btn" onClick={() => executeAction('table', 'TABLE')}><i className="fa-solid fa-table"></i><span>Таблица</span></div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 10, color: '#5568A0', paddingBottom: 2, fontWeight: 500 }}>Аннотации</div>
          </div>
        )}

        {activeTab === 'ВЫВОД' && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', borderRight: '1px solid #1e2a3a', padding: '4px 8px', minWidth: 220 }}>
            <div style={{ display: 'flex', gap: 2, paddingTop: 2, justifyContent: 'center' }}>
              <div className="tool-btn" onClick={() => executeAction('print', 'PLOT')}><i className="fa-solid fa-print"></i><span>Печать</span></div>
              <div className="tool-btn" onClick={() => executeAction('pdf', 'EXPORTPDF')}><i className="fa-solid fa-file-export"></i><span>PDF</span></div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 10, color: '#5568A0', paddingBottom: 2, fontWeight: 500 }}>Экспорт</div>
          </div>
        )}
      </div>

      {/* ═══ MAIN AREA (left bar + canvas + right panel) ═══ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: '#080810' }}>

        {/* Left Vertical Toolbar */}
        <div style={{ width: 42, background: '#111120', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 0', gap: 4, borderRight: '1px solid #1e2a3a', flexShrink: 0, zIndex: 5 }}>
          <div className={`left-btn ${appState.activeTool === 'select' ? 'active' : ''}`} title="Выбор [Esc]" onClick={() => setTool('select')}><i className="fa-solid fa-arrow-pointer"></i></div>
          <div className={`left-btn ${appState.activeTool === 'pan' ? 'active' : ''}`} title="Панорама" onClick={() => setTool('pan')}><i className="fa-solid fa-hand"></i></div>
          <div style={{ width: 22, height: 1, background: '#1e2a3a', margin: '4px 0' }}></div>
          <div className="left-btn" title="Отменить [Ctrl+Z]" onClick={undo}><i className="fa-solid fa-rotate-left"></i></div>
          <div className="left-btn" title="Повторить [Ctrl+Y]" onClick={redo}><i className="fa-solid fa-rotate-right"></i></div>
          <div style={{ width: 22, height: 1, background: '#1e2a3a', margin: '4px 0' }}></div>
          <div className={`left-btn ${appState.activeTool === 'erase' ? 'active' : ''}`} title="Удалить [E]" onClick={() => setTool('erase', 'ERASE')}><i className="fa-solid fa-eraser"></i></div>
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: getCursor() }}>
          <svg
            ref={svgRef}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            onMouseMove={onMouseMove}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onDoubleClick={onDoubleClick}
            onContextMenu={(e) => e.preventDefault()}
          >
            <defs>
              <pattern id="smallGrid" width={10 * appState.zoom} height={10 * appState.zoom} patternUnits="userSpaceOnUse" patternTransform={`translate(${appState.panOffset.x}, ${appState.panOffset.y})`}>
                <path d={`M ${10*appState.zoom} 0 L 0 0 0 ${10*appState.zoom}`} fill="none" stroke="#14142a" strokeWidth="0.5" opacity="0.8" />
              </pattern>
              <pattern id="grid" width={100 * appState.zoom} height={100 * appState.zoom} patternUnits="userSpaceOnUse" patternTransform={`translate(${appState.panOffset.x}, ${appState.panOffset.y})`}>
                <rect width="100%" height="100%" fill="url(#smallGrid)" />
                <path d={`M ${100*appState.zoom} 0 L 0 0 0 ${100*appState.zoom}`} fill="none" stroke="#1e1e38" strokeWidth="1" opacity="1.0" />
              </pattern>
            </defs>

            {appState.gridEnabled && <rect width="100%" height="100%" fill="url(#grid)" pointerEvents="none" />}

            <g transform={`translate(${appState.panOffset.x}, ${appState.panOffset.y}) scale(${appState.zoom})`}>
              {appState.gridEnabled && (
                <g pointerEvents="none">
                  <line x1="-10000" y1="0" x2="10000" y2="0" stroke="#ff4444" strokeWidth={1/appState.zoom} opacity="0.3" />
                  <line x1="0" y1="-10000" x2="0" y2="10000" stroke="#4444ff" strokeWidth={1/appState.zoom} opacity="0.3" />
                </g>
              )}
              {renderElements()}
              {renderDraft()}
              {appState.isDrawing && draftRef.current.tempPoint && appState.activeTool !== 'box_select' && (
                <circle cx={draftRef.current.tempPoint.x} cy={draftRef.current.tempPoint.y} r={3/appState.zoom} fill="none" stroke="#4a9eff" strokeWidth={1.5/appState.zoom} pointerEvents="none"/>
              )}
            </g>
          </svg>

          {/* Zoom Controls */}
          <div style={{ position: 'absolute', right: 16, bottom: 16, display: 'flex', flexDirection: 'column', gap: 4, zIndex: 20 }}>
            <button
              style={{ width: 36, height: 36, background: '#1a2030', border: '1px solid #2e3e54', borderRadius: 8, color: '#c0d0e0', cursor: 'pointer', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
              onClick={(e) => { e.stopPropagation(); handleZoomButton(true); }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2a3a50'; e.currentTarget.style.borderColor = '#4a9eff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1a2030'; e.currentTarget.style.borderColor = '#2e3e54'; }}
              title="Увеличить"
            >+</button>
            <button
              style={{ width: 36, height: 36, background: '#1a2030', border: '1px solid #2e3e54', borderRadius: 8, color: '#c0d0e0', cursor: 'pointer', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
              onClick={(e) => { e.stopPropagation(); handleZoomButton(false); }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2a3a50'; e.currentTarget.style.borderColor = '#4a9eff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1a2030'; e.currentTarget.style.borderColor = '#2e3e54'; }}
              title="Уменьшить"
            >−</button>
            <button
              style={{ width: 36, height: 36, background: '#1a2030', border: '1px solid #2e3e54', borderRadius: 8, color: '#c0d0e0', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}
              onClick={(e) => { e.stopPropagation(); zoomExtents(); }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2a3a50'; e.currentTarget.style.borderColor = '#4a9eff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1a2030'; e.currentTarget.style.borderColor = '#2e3e54'; }}
              title="Показать всё (Zoom Extents)"
            ><i className="fa-solid fa-compress"></i></button>
          </div>

          {/* Zoom percentage badge */}
          <div style={{ position: 'absolute', right: 60, bottom: 20, background: 'rgba(20,25,40,0.8)', border: '1px solid #1e2a3a', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: '#6878A0', fontWeight: 500, zIndex: 20 }}>
            {Math.round(appState.zoom * 100)}%
          </div>
        </div>

        {/* ═══ RIGHT PANEL ═══ */}
        <div style={{ width: rightPanelWidth, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #1e2a3a', background: '#10101e', flexShrink: 0, zIndex: 5, position: 'relative', boxShadow: '-4px 0 20px rgba(0,0,0,0.4)' }}>
          {/* Resize handle */}
          <div className={`resize-h ${resizing === 'right' ? 'active' : ''}`} onMouseDown={() => setResizing('right')}></div>

          {/* LAYER MANAGER */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderBottom: '1px solid #1e2a3a', minHeight: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e2a3a' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#e0e8f0', letterSpacing: '0.3px' }}>Слои</div>
              <div style={{ fontSize: 12, color: '#5568A0', marginTop: 2 }}>
                Текущий: <span style={{ color: '#4a9eff', fontWeight: 600 }}>{appState.activeLayer}</span>
              </div>
            </div>

            {hasElements ? (
              <>
                {/* Layer table header */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '6px 16px', fontSize: 11, color: '#5568A0', borderBottom: '1px solid #1a1a2e', fontWeight: 600 }}>
                  <div style={{ width: 32, textAlign: 'center' }}>Вид</div>
                  <div style={{ width: 32, textAlign: 'center' }}>Блок</div>
                  <div style={{ width: 44 }}>Толщ.</div>
                  <div style={{ flex: 1, marginLeft: 8 }}>Имя</div>
                </div>

                {/* Layer list */}
                <div style={{ flex: 1, overflowY: 'auto' }} className="no-scroll">
                  {appState.layers.map(layer => (
                    <div
                      key={layer.name}
                      onClick={() => setAppState(p => ({ ...p, activeLayer: layer.name }))}
                      style={{
                        display: 'flex', alignItems: 'center', padding: '7px 16px', cursor: 'pointer',
                        fontSize: 13, fontWeight: 400,
                        borderLeft: appState.activeLayer === layer.name ? '3px solid #4a9eff' : '3px solid transparent',
                        background: appState.activeLayer === layer.name ? 'rgba(74,158,255,0.08)' : 'transparent',
                        color: appState.activeLayer === layer.name ? '#e0e8f0' : '#8898b0',
                        transition: 'all 0.1s',
                      }}
                      onMouseEnter={e => { if (appState.activeLayer !== layer.name) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                      onMouseLeave={e => { if (appState.activeLayer !== layer.name) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ width: 32, textAlign: 'center' }} onClick={(e) => { e.stopPropagation(); toggleLayerAttr(layer.name, 'visible'); }}>
                        <i className={`fa-regular ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}`} style={{ color: layer.visible ? '#8898b0' : '#3a3a5a', fontSize: 13 }}></i>
                      </div>
                      <div style={{ width: 32, textAlign: 'center' }} onClick={(e) => { e.stopPropagation(); toggleLayerAttr(layer.name, 'locked'); }}>
                        <i className={`fa-solid ${layer.locked ? 'fa-lock' : 'fa-lock-open'}`} style={{ color: layer.locked ? '#e8a040' : '#3a3a5a', fontSize: 12 }}></i>
                      </div>
                      <div style={{ width: 44, fontSize: 11, color: '#5568A0', fontFamily: 'monospace' }}>{layer.lw.toFixed(2)}</div>
                      <div style={{ flex: 1, marginLeft: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{layer.name}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <div style={{ textAlign: 'center', color: '#3a4a6a' }}>
                  <i className="fa-solid fa-layer-group" style={{ fontSize: 28, marginBottom: 8, display: 'block', opacity: 0.5 }}></i>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Нет объектов</div>
                  <div style={{ fontSize: 11, marginTop: 4, color: '#2a3a5a' }}>Начните рисовать — слои появятся здесь</div>
                </div>
              </div>
            )}
          </div>

          {/* AI CHAT */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#0c0c1a' }}>
            <div style={{ height: 40, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #1e2a3a', background: '#121226', gap: 10 }}>
              <i className="fa-solid fa-robot" style={{ color: '#4a9eff', fontSize: 15 }}></i>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e0e8f0', lineHeight: 1.2 }}>AI Ассистент</div>
                <div style={{ fontSize: 10, color: '#4ade80', display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1.2, marginTop: 1 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }}></span>Online
                </div>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }} className="no-scroll">
              {appState.chatMessages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                  {msg.role === 'assistant' && (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #4a9eff, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, fontWeight: 700, fontSize: 10 }}>AI</div>
                  )}
                  <div style={{
                    padding: '10px 14px', fontSize: 13, lineHeight: 1.6, borderRadius: 10, maxWidth: '85%',
                    ...(msg.role === 'assistant'
                      ? { background: '#161630', border: '1px solid #1e2a3a', color: '#b0b8d0', borderTopLeftRadius: 2 }
                      : { background: '#1a2a4a', border: '1px solid #2a4a7a', color: '#d0e0f0', borderTopRightRadius: 2 }
                    )
                  }}>
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: 12, borderTop: '1px solid #1e2a3a', background: '#0a0a18' }}>
              <div style={{ display: 'flex', background: '#0e1020', border: '1px solid #1e2a3a', borderRadius: 10, overflow: 'hidden' }}
                onFocus={e => e.currentTarget.style.borderColor = '#4a9eff'}
                onBlur={e => e.currentTarget.style.borderColor = '#1e2a3a'}
              >
                <textarea
                  style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%', padding: '10px 12px', color: '#d0d8e8', resize: 'none', fontSize: 13, fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}
                  rows="2"
                  placeholder="Опишите чертёж..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatEnter(); } }}
                />
                <button
                  style={{ padding: '0 14px', background: 'transparent', border: 'none', color: '#4a9eff', cursor: 'pointer', fontSize: 15 }}
                  onClick={handleChatEnter}
                  onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                  onMouseLeave={e => e.currentTarget.style.color = '#4a9eff'}
                >
                  <i className="fa-solid fa-paper-plane"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ COMMAND LINE + STATUS BAR ═══ */}
      <div style={{ height: bottomPanelHeight, display: 'flex', flexDirection: 'column', borderTop: '1px solid #1e2a3a', flexShrink: 0, zIndex: 20, position: 'relative', background: '#0a0a14' }}>
        {/* Resize handle */}
        <div className={`resize-v ${resizing === 'bottom' ? 'active' : ''}`} onMouseDown={() => setResizing('bottom')}></div>

        {/* Command log */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '4px 12px', overflowY: 'auto', fontFamily: "'JetBrains Mono', 'Consolas', monospace" }} className="no-scroll">
          {appState.commandLog.map((log, i) => (
            <div key={i} style={{ fontSize: 12, color: '#5568A0', lineHeight: 1.6 }}>{log}</div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 2 }}>
            <span style={{ color: '#4a9eff', marginRight: 8, fontSize: 12, fontWeight: 600 }}>{'>'}</span>
            <input
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#d0d8e8', fontFamily: "'JetBrains Mono', 'Consolas', monospace", fontSize: 12, caretColor: '#4a9eff' }}
              type="text"
              autoComplete="off"
              placeholder="Введите команду (HELP для списка)..."
              value={cmdInput}
              onChange={e => setCmdInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCommand(cmdInput);
                  setCmdInput('');
                }
              }}
            />
          </div>
        </div>

        {/* Status Bar */}
        <div style={{ height: 24, background: '#060610', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', fontSize: 11, borderTop: '1px solid #12121e', color: '#5568A0', fontFamily: "'Inter', sans-serif", flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <span>X: {mousePos.x.toFixed(2)}</span>
            <span>Y: {mousePos.y.toFixed(2)}</span>
            {appState.selectedElements.length > 0 && <span style={{ color: '#4a9eff', fontWeight: 600 }}>Выбрано: {appState.selectedElements.length}</span>}
          </div>
          <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {[
              { label: 'Привязка', flag: appState.snapEnabled, attr: 'snapEnabled' },
              { label: 'Сетка', flag: appState.gridEnabled, attr: 'gridEnabled' },
              { label: 'Орто', flag: appState.orthoEnabled, attr: 'orthoEnabled' },
              { label: 'Объектная', flag: appState.osnapEnabled, attr: 'osnapEnabled' },
            ].map(item => (
              <div
                key={item.label}
                onClick={() => setAppState(p => ({ ...p, [item.attr]: !p[item.attr] }))}
                style={{
                  padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 11, fontWeight: 500,
                  color: item.flag ? '#8cc4ff' : '#3a4060',
                  background: item.flag ? 'rgba(74,158,255,0.12)' : 'transparent',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(74,158,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background = item.flag ? 'rgba(74,158,255,0.12)' : 'transparent'}
              >
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
