import React, { useState, useEffect, useRef, useMemo } from 'react';
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
    panOffset: { x: 400, y: 300 }, // start somewhat centered
    selectedElements: [],
    elements: [],
    layers: defaultLayers,
    commandLog: ["Welcome to React 2D CAD"],
    isDrawing: false,
    drawingPoints: [],
    chatMessages: [
      { role: 'assistant', text: 'Привет! Я AI-ассистент для генерации чертежей.\nОпишите что вы хотите нарисовать, и я помогу создать чертёж.' }
    ],
    snapEnabled: true,
    gridEnabled: true,
    orthoEnabled: false,
    osnapEnabled: true,
    polarEnabled: false,
    otrackEnabled: false,
    dynEnabled: false,
    lwtEnabled: false,
  });

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 }); // CAD coordinates for UI
  const [activeTab, setActiveTab] = useState('ГЛАВНАЯ');
  const [chatInput, setChatInput] = useState('');
  
  // Undo/Redo stack
  const [history, setHistory] = useState([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const pushHistory = (newElements) => {
    const newHist = history.slice(0, historyIndex + 1);
    newHist.push(newElements);
    if (newHist.length > 50) newHist.shift(); // Max 50 steps
    setHistory(newHist);
    setHistoryIndex(newHist.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setAppState(p => ({ ...p, elements: history[historyIndex - 1], selectedElements: [] }));
      logCmd("Command: _UNDO");
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setAppState(p => ({ ...p, elements: history[historyIndex + 1], selectedElements: [] }));
      logCmd("Command: _REDO");
    }
  };

  const svgRef = useRef(null);
  
  const draftRef = useRef({
    points: [], 
    tempPoint: null, // the moving mouse point
    center: null,
    stringInput: "",
  });

  // Reference to quickly read state in event listeners without stale closures
  const stateRef = useRef(appState);
  useEffect(() => { stateRef.current = appState; }, [appState]);

  const logCmd = (msg) => {
    setAppState(p => ({ ...p, commandLog: [...p.commandLog, msg].slice(-5) }));
  };

  const setTool = (tool, logName) => {
    if (tool === 'erase' && stateRef.current.selectedElements.length > 0) {
      const idSet = new Set(stateRef.current.selectedElements);
      const newElements = stateRef.current.elements.filter(el => !idSet.has(el.id));
      setAppState(p => ({ ...p, elements: newElements, selectedElements: [], activeTool: 'select' }));
      pushHistory(newElements);
      if (logName) logCmd(`Command: _${logName}`);
      return;
    }
    setAppState(p => ({ ...p, activeTool: tool, isDrawing: false, selectedElements: tool === 'select' || tool === 'move' || tool === 'copy' || tool === 'rotate' || tool === 'scale' || tool === 'erase' ? p.selectedElements : [] }));
    draftRef.current = { points: [], tempPoint: null, center: null, stringInput: "" };
    if (logName) logCmd(`Command: _${logName}`);
  };

  // Math Helpers
  const dist = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y);
  
  // Calculate snapping point
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
        // Also add midpoints for lines
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

    // Grid snap
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

  // Convert Mouse Event point to CAD Viewport point
  const getCadCoords = (e) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const rect = svgRef.current.getBoundingClientRect();
    const { zoom, panOffset, orthoEnabled } = stateRef.current;
    
    let x = (e.clientX - rect.left - panOffset.x) / zoom;
    let y = (e.clientY - rect.top - panOffset.y) / zoom;

    // Apply snap
    let snap = getSnapPoint(x, y);
    x = snap.x; y = snap.y;

    // Add Ortho logically if drawing line
    if (orthoEnabled && draftRef.current.points.length > 0) {
      const lastPt = draftRef.current.points[draftRef.current.points.length - 1];
      const dx = Math.abs(x - lastPt.x);
      const dy = Math.abs(y - lastPt.y);
      if (dx > dy) y = lastPt.y;
      else x = lastPt.x;
    }

    return { x, y, snapped: snap.snapped };
  };

  // Handle Keyboard
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in input
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

  // SVG Mouse handlers
  const onMouseMove = (e) => {
    const cadPt = getCadCoords(e);
    setMousePos({ x: cadPt.x, y: cadPt.y });

    if (appState.activeTool === 'pan' && e.buttons === 1) {
      setAppState(p => ({
        ...p,
        panOffset: { x: p.panOffset.x + e.movementX, y: p.panOffset.y + e.movementY }
      }));
    } else if (e.buttons === 4) { // Middle click drag
      setAppState(p => ({
        ...p,
        panOffset: { x: p.panOffset.x + e.movementX, y: p.panOffset.y + e.movementY }
      }));
    } else if (appState.activeTool === 'box_select' && appState.isDrawing) {
      draftRef.current.tempPoint = cadPt;
      setAppState(p => ({ ...p, drawingPoints: [...draftRef.current.points, cadPt] }));
    } else if (appState.isDrawing) {
      draftRef.current.tempPoint = cadPt;
      // Force preview update
      setAppState(p => ({ ...p, drawingPoints: [...draftRef.current.points, cadPt] }));
    }
  };

  const onMouseDown = (e) => {
    if (e.button !== 0 && appState.activeTool !== 'pan') return; // only left click unless panning
    
    if (appState.activeTool === 'pan') {
      // handled by mouse movement smoothly
      return;
    }

    const pt = getCadCoords(e);

    if (appState.activeTool === 'select') {
      // Start window select if clicked empty space
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
        // commit line
        const newEl = {
           id: uuid(), type: 'line', layer: appState.activeLayer, points: [draftRef.current.points[0], pt]
        };
        const newElements = [...appState.elements, newEl];
        setAppState(p => ({ ...p, elements: newElements, isDrawing: true, drawingPoints: [pt, pt] }));
        draftRef.current.points = [pt]; // continue from here
        pushHistory(newElements);
        logCmd(`LINE от (${newEl.points[0].x.toFixed(1)}, ${newEl.points[0].y.toFixed(1)}) до (${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`);
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
        logCmd(`ARC завершен`);
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
        logCmd(`CIRCLE центр (${center.x.toFixed(1)}, ${center.y.toFixed(1)}) R=${radius.toFixed(1)}`);
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
        logCmd(`RECT (${p1.x.toFixed(1)}, ${p1.y.toFixed(1)}) (${p2.x.toFixed(1)}, ${p2.y.toFixed(1)})`);
      }
    }
    // Simple modifying tools
    else if (appState.activeTool === 'erase') {
       // Handled in onClick of elements usually, but if dragging we could do an erase Box.
    }
    else if (appState.activeTool === 'move') {
      if (appState.selectedElements.length === 0) { logCmd("Сначала выберите объекты для перемещения"); return; }
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
      if (appState.selectedElements.length === 0) { logCmd("Сначала выберите объекты для копирования"); return; }
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
      if (appState.selectedElements.length === 0) { logCmd("Сначала выберите объекты для поворота"); return; }
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
        logCmd(`ROTATE (${(angle * 180 / Math.PI).toFixed(1)} deg)`);
      }
    }
    else if (appState.activeTool === 'scale') {
      if (appState.selectedElements.length === 0) { logCmd("Сначала выберите объекты для масштабирования"); return; }
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
        logCmd(`SCALE (${scaleFactor.toFixed(2)}x)`);
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
       // determine mode: L2R = inside (blue), R2L = crossing (green)
       const mode = p1.x < p2.x ? 'inside' : 'crossing';
       
       const selected = appState.elements.filter(el => {
           // Skip locked layers
           const layer = appState.layers.find(l => l.name === el.layer);
           if (!layer || layer.locked || !layer.visible) return false;
           
           if (!el.points) return false;

           let insideCnt = 0;
           let crossCnt = 0;
           el.points.forEach(pt => {
               if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) insideCnt++;
           });
           
           // Simple circle check box
           if (el.type === 'circle') {
              const cx = el.points[0].x, cy = el.points[0].y, r = el.radius;
              if (cx-r >= minX && cx+r <= maxX && cy-r >= minY && cy+r <= maxY) insideCnt += 2;
              else if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) crossCnt++; 
           }

           if (mode === 'inside') {
               return insideCnt === (el.points.length || 1); // all points inside
           } else {
               // Crossing: any point inside, or mathematical intersection (simplified to any point inside for now)
               return insideCnt > 0 || crossCnt > 0;
           }
       }).map(el => el.id);

       setAppState(p => ({ 
           ...p, 
           activeTool: 'select', 
           isDrawing: false, 
           selectedElements: e.shiftKey ? [...new Set([...p.selectedElements, ...selected])] : selected 
       }));
       if (selected.length>0) logCmd(`${selected.length} объектов выбрано`);
    }
  };

  const onDoubleClick = (e) => {
    if (['polyline', 'spline', 'polygon'].includes(appState.activeTool)) {
       const newEl = { id: uuid(), type: appState.activeTool, layer: appState.activeLayer, points: draftRef.current.points };
       const newElements = [...appState.elements, newEl];
       setAppState(p => ({ ...p, elements: newElements, isDrawing: false, drawingPoints: [] }));
       draftRef.current = { points: [] };
       pushHistory(newElements);
       logCmd(`${appState.activeTool.toUpperCase()} завершен`);
    }
  };

  // Zoom logic using passive: false for standard browsers to prevent whole-page scrolling
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
    e.stopPropagation(); // prevent box select
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
       // Simplified Trim: Just delete it for now
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
    if (['line', 'polyline', 'circle', 'rect', 'arc', 'polygon', 'box_select'].includes(appState.activeTool)) return 'crosshair';
    if (appState.activeTool === 'erase' || appState.activeTool === 'trim') return 'cell';
    return 'default';
  };

  // UI Handlers
  const handleChatEnter = () => {
     if (!chatInput.trim()) return;
     const userMsg = chatInput;
     setChatInput('');
     setAppState(p => ({
       ...p,
       chatMessages: [...p.chatMessages, { role: 'user', text: userMsg }],
       commandLog: [...p.commandLog, "Command: _AI_GENERATE"].slice(-5)
     }));
     // Simulate response
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

  // Render SVG Elements
  const renderElements = () => {
      const { elements, layers, selectedElements } = appState;
      const isSelectMode = appState.activeTool === 'select';

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
          }

          if (!shape) return null;

          return (
             <g 
                key={el.id} 
                className={`cad-object ${layer.locked ? 'locked' : ''}`}
                style={{ pointerEvents: layer.locked ? 'none' : 'auto' }}
                onClick={(e) => handleObjectClick(e, el)}
             >
                {/* Invisible larger hit area for easier selection */}
                {React.cloneElement(shape, { stroke: "transparent", strokeWidth: 10/appState.zoom, pointerEvents: "stroke", fill: "none" })}
                
                {/* Visible shape */}
                {React.cloneElement(shape, { stroke: isSelected ? '#4a9eff' : '#ffffff', strokeWidth: strokeWidth, fill: "none" })}

                {/* Grips if selected */}
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

  // Render Drawings in progress (Previews)
  const renderDraft = () => {
      const { activeTool, drawingPoints } = appState;
      if (!appState.isDrawing || drawingPoints.length < 2) return null;
      
      const p1 = drawingPoints[0];
      const p2 = drawingPoints[drawingPoints.length - 1]; // temp mouse pos

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
                 {/* Draw guideline to mouse */}
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
      if (activeTool === 'box_select') { // UI overlay, actually absolute coords are better, but CAD space is fine
          const w = p2.x - p1.x;
          const h = p2.y - p1.y;
          const isL2R = p1.x < p2.x; // Left to right = blue, R2L = green dotted
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

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#0d0d1a] text-[#ddeeff] text-[13px] select-none font-[system-ui]">
      
      {/* 1. TITLE BAR */}
      <div className="h-[32px] bg-[#151525] flex items-center justify-between px-3 text-xs flex-shrink-0 border-b border-[#2a3a4a]">
          <div className="flex items-center gap-2">
              <i className="fa-brands fa-codepen text-[#4a9eff]"></i>
              <span className="font-semibold tracking-wide">Drawing1.dwg</span>
          </div>
          <div className="flex items-center gap-4 text-[#8888aa]">
              <i className="fa-solid fa-minus hover:text-white cursor-pointer"></i>
              <i className="fa-solid fa-expand hover:text-white cursor-pointer" onClick={() => {
                if (!document.fullscreenElement) {
                   document.documentElement.requestFullscreen().catch(e => console.log('Fullscreen rejected by browser.'));
                } else {
                   document.exitFullscreen();
                }
              }} title="Во весь экран"></i>
              <i className="fa-solid fa-xmark hover:text-[#ff4a4a] cursor-pointer text-sm"></i>
          </div>
      </div>

      {/* 2. MENU TABS */}
      <div className="h-[36px] bg-[#0d1525] flex items-end px-2 border-b border-[#2a3a4a] text-xs uppercase tracking-wider flex-shrink-0">
          {['ГЛАВНАЯ', 'ВСТАВКА', 'АННОТАЦИИ', 'ПАРАМЕТРИЗАЦИЯ', 'ВИД', 'УПРАВЛЕНИЕ', 'ВЫВОД', 'НАДСТРОЙКИ'].map((tab) => (
              <div 
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 cursor-pointer transition-colors ${
                  activeTab === tab 
                  ? 'border-b-2 border-[#4a9eff] text-[#4a9eff] font-semibold' 
                  : 'text-[#aaaacc] hover:text-[#ffffff]'
                }`}
              >
                  {tab}
              </div>
          ))}
      </div>

      {/* 3. RIBBON TOOLBAR */}
      <div className="h-[80px] bg-[#1a2535] flex items-stretch border-b border-[#2a3a4a] flex-shrink-0 overflow-hidden shadow-md z-20 relative">
          {activeTab === 'ГЛАВНАЯ' && (
            <>
              <div className="flex flex-col justify-between border-r border-[#2a3a4a] px-2 py-1 min-w-[280px]">
                  <div className="flex gap-1 pt-1 justify-center">
                      <div className={`tool-btn ${appState.activeTool === 'line' ? 'active' : ''}`} onClick={() => setTool('line', 'LINE')} title="Отрезок [L]"><i className="fa-solid fa-minus"></i><span>Отрезок</span></div>
                      <div className={`tool-btn ${appState.activeTool === 'circle' ? 'active' : ''}`} onClick={() => setTool('circle', 'CIRCLE')} title="Круг [C]"><i className="fa-regular fa-circle"></i><span>Круг</span></div>
                      <div className={`tool-btn ${appState.activeTool === 'rect' ? 'active' : ''}`} onClick={() => setTool('rect', 'RECT')} title="Прямоугольник [REC]"><i className="fa-regular fa-square"></i><span>Прямоуг.</span></div>
                      <div className={`tool-btn ${appState.activeTool === 'arc' ? 'active' : ''}`} onClick={() => setTool('arc', 'ARC')} title="Дуга [A]"><i className="fa-solid fa-bezier-curve"></i><span>Дуга</span></div>
                  </div>
                  <div className="text-center text-[11px] text-[#8888aa] pb-0.5">Рисование</div>
              </div>

              <div className="flex flex-col justify-between border-r border-[#2a3a4a] px-2 py-1 min-w-[320px]">
                  <div className="flex gap-1 pt-1 justify-center">
                      <div className={`tool-btn ${appState.activeTool === 'move' ? 'active' : ''}`} onClick={() => setTool('move', 'MOVE')} title="Переместить [M]"><i className="fa-solid fa-arrows-up-down-left-right"></i><span>Переместить</span></div>
                      <div className={`tool-btn ${appState.activeTool === 'copy' ? 'active' : ''}`} onClick={() => setTool('copy', 'COPY')} title="Копировать [CO]"><i className="fa-regular fa-copy"></i><span>Копир.</span></div>
                      <div className={`tool-btn ${appState.activeTool === 'rotate' ? 'active' : ''}`} onClick={() => setTool('rotate', 'ROTATE')} title="Повернуть [RO]"><i className="fa-solid fa-rotate"></i><span>Повернуть</span></div>
                      <div className={`tool-btn ${appState.activeTool === 'scale' ? 'active' : ''}`} onClick={() => setTool('scale', 'SCALE')} title="Масштаб [SC]"><i className="fa-solid fa-maximize"></i><span>Масштаб</span></div>
                      <div className={`tool-btn ${appState.activeTool === 'trim' ? 'active' : ''}`} onClick={() => setTool('trim', 'TRIM')} title="Обрезать [TR]"><i className="fa-solid fa-scissors"></i><span>Обрезать</span></div>
                  </div>
                  <div className="text-center text-[11px] text-[#8888aa] pb-0.5">Редактирование</div>
              </div>
            </>
          )}

          {activeTab === 'ВИД' && (
             <div className="flex flex-col justify-between border-r border-[#2a3a4a] px-2 py-1 min-w-[280px]">
                <div className="flex gap-1 pt-1 justify-center">
                   <div className={`tool-btn ${appState.gridEnabled ? 'active' : ''}`} onClick={() => setAppState(p => ({...p, gridEnabled: !p.gridEnabled}))}><i className="fa-solid fa-border-all"></i><span>Сетка</span></div>
                   <div className="tool-btn" onClick={() => {
                       // Zoom Extents (Fit All)
                       if (appState.elements.length === 0) {
                           setAppState(p => ({ ...p, zoom: 1.0, panOffset: {x: 400, y: 300} }));
                       } else {
                           let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
                           appState.elements.forEach(el => {
                               if (el.points) el.points.forEach(p => {
                                   if(p.x < minX) minX=p.x; if(p.x > maxX) maxX=p.x;
                                   if(p.y < minY) minY=p.y; if(p.y > maxY) maxY=p.y;
                               });
                           });
                           const cx = (minX+maxX)/2, cy = (minY+maxY)/2;
                           const rect = svgRef.current.getBoundingClientRect();
                           const scale = Math.min((rect.width - 100)/(maxX-minX), (rect.height - 100)/(maxY-minY));
                           setAppState(p => ({ ...p, zoom: Math.max(0.1, scale), panOffset: { x: rect.width/2 - cx*scale, y: rect.height/2 - cy*scale } }));
                       }
                       logCmd("ZOOM EXTENTS");
                   }}><i className="fa-solid fa-compress"></i><span>По размеру</span></div>
                </div>
                <div className="text-center text-[11px] text-[#8888aa] pb-0.5">Навигация</div>
             </div>
          )}
      </div>

      <div className="flex-1 flex flex-row overflow-hidden bg-[#0a0a18]">
          
          {/* LEFT VERTICAL TOOLBAR */}
          <div className="w-[44px] bg-[#151525] flex flex-col items-center py-2 gap-2 border-r border-[#2a3a4a] flex-shrink-0 z-10">
              <div className={`left-btn ${appState.activeTool === 'select' ? 'active' : ''}`} title="Выбор" onClick={() => setTool('select')}><i className="fa-solid fa-arrow-pointer"></i></div>
              <div className={`left-btn ${appState.activeTool === 'pan' ? 'active' : ''}`} title="Панорамирование" onClick={() => setTool('pan')}><i className="fa-solid fa-hand"></i></div>
              <div className="w-[24px] h-[1px] bg-[#2a3a4a] my-1"></div>
              <div className="left-btn" title="Отменить Ctrl+Z" onClick={undo}><i className="fa-solid fa-rotate-left"></i></div>
              <div className="left-btn" title="Повторить Ctrl+Y" onClick={redo}><i className="fa-solid fa-rotate-right text-[#555566]"></i></div>
          </div>

          {/* MAIN CANVAS WORKSPACE */}
          <div className="flex-1 relative overflow-hidden" 
               style={{ cursor: getCursor() }}>
              
              <svg 
                  ref={svgRef}
                  className="absolute inset-0 w-full h-full"
                  onMouseMove={onMouseMove}
                  onMouseDown={onMouseDown}
                  onMouseUp={onMouseUp}
                  onDoubleClick={onDoubleClick}
                  onContextMenu={(e) => e.preventDefault()}
              >
                  <defs>
                      <pattern id="smallGrid" width={10 * appState.zoom} height={10 * appState.zoom} patternUnits="userSpaceOnUse" patternTransform={`translate(${appState.panOffset.x}, ${appState.panOffset.y})`}>
                          <path d={`M ${10*appState.zoom} 0 L 0 0 0 ${10*appState.zoom}`} fill="none" stroke="#1a1a2a" strokeWidth="0.5" opacity="0.8" />
                      </pattern>
                      <pattern id="grid" width={100 * appState.zoom} height={100 * appState.zoom} patternUnits="userSpaceOnUse" patternTransform={`translate(${appState.panOffset.x}, ${appState.panOffset.y})`}>
                          <rect width="100%" height="100%" fill="url(#smallGrid)" />
                          <path d={`M ${100*appState.zoom} 0 L 0 0 0 ${100*appState.zoom}`} fill="none" stroke="#252535" strokeWidth="1" opacity="1.0" />
                      </pattern>
                  </defs>

                  {/* Draw Background Grid */}
                  {appState.gridEnabled && <rect width="100%" height="100%" fill="url(#grid)" pointerEvents="none" />}

                  {/* World space group */}
                  <g transform={`translate(${appState.panOffset.x}, ${appState.panOffset.y}) scale(${appState.zoom})`}>
                      
                      {/* Grid Central Axes */}
                      {appState.gridEnabled && (
                          <g pointerEvents="none">
                             <line x1="-10000" y1="0" x2="10000" y2="0" stroke="#ff4444" strokeWidth={1/appState.zoom} opacity="0.4" />
                             <line x1="0" y1="-10000" x2="0" y2="10000" stroke="#4444ff" strokeWidth={1/appState.zoom} opacity="0.4" />
                          </g>
                      )}

                      {/* Render Committed Elements */}
                      {renderElements()}

                      {/* Render Draft/Preview */}
                      {renderDraft()}
                      
                      {/* Reticle / Snap marker tracking mouse */}
                      {appState.isDrawing && draftRef.current.tempPoint && appState.activeTool !== 'box_select' && (
                         <circle cx={draftRef.current.tempPoint.x} cy={draftRef.current.tempPoint.y} r={3/appState.zoom} fill="none" stroke="#4a9eff" strokeWidth={1.5/appState.zoom} pointerEvents="none"/>
                      )}
                  </g>
              </svg>

              {/* Floating Zoom Controls */}
              <div className="absolute right-4 bottom-4 flex flex-col gap-2 z-20">
                  <button 
                      className="w-8 h-8 bg-[#151525] border border-[#2a3a4a] rounded shadow hover:bg-[#252535] text-white flex items-center justify-center font-bold text-lg"
                      onClick={(e) => { e.stopPropagation(); handleZoomButton(true); }}
                      title="Увеличить масштаб (+)"
                  >
                      +
                  </button>
                  <button 
                      className="w-8 h-8 bg-[#151525] border border-[#2a3a4a] rounded shadow hover:bg-[#252535] text-white flex items-center justify-center font-bold text-lg"
                      onClick={(e) => { e.stopPropagation(); handleZoomButton(false); }}
                      title="Уменьшить масштаб (-)"
                  >
                      -
                  </button>
              </div>
          </div>

          {/* RIGHT PANELS WRAPPER */}
          <div className="w-[300px] flex flex-col border-l border-[#2a3a4a] bg-[#151525] flex-shrink-0 z-10 shadow-[-2px_0_15px_rgba(0,0,0,0.5)]">
              
              {/* TOP: LAYER MANAGER */}
              <div className="flex-1 flex flex-col min-h-[50%] border-b border-[#2a3a4a]">
                  <div className="px-3 py-3 border-b border-[#2a3a4a]">
                      <div className="text-white font-bold text-[14px]">Менеджер слоёв</div>
                      <div className="text-[#8888aa] text-[12px]">Слоёв: {appState.layers.length}</div>
                      <div className="flex gap-2 mt-2">
                          <button className="px-2 py-1 bg-[#252535] border border-[#3a3a4a] text-xs rounded hover:bg-[#353545]"><i className="fa-solid fa-plus mr-1"></i>Новый</button>
                          <button className="px-2 py-1 bg-[#252535] border border-[#3a3a4a] text-xs rounded hover:border-[#ff4444] text-[#ff4444]"><i className="fa-solid fa-trash mr-1"></i>Удалить</button>
                      </div>
                  </div>
                  
                  <div className="px-2 pt-2 text-[12px] text-[#8888aa] border-b border-[#2a3a4a] flex font-semibold font-[system-ui]">
                      <div className="w-[30px] text-center">👁</div>
                      <div className="w-[30px] text-center">🔒</div>
                      <div className="w-[40px]">ЛВ</div>
                      <div className="w-[100px] ml-2">Имя слоя</div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto no-scroll">
                      {appState.layers.map(layer => (
                          <div 
                              key={layer.name} 
                              onClick={() => setAppState(p => ({ ...p, activeLayer: layer.name }))}
                              className={`flex items-center px-2 py-1.5 cursor-pointer text-sm font-[system-ui] border-l-[3px] transition-colors ${
                                  appState.activeLayer === layer.name 
                                  ? 'bg-[#1e3a5a] border-[#4a9eff] text-white' 
                                  : 'border-transparent text-white hover:bg-[#1a2535]'
                              }`}
                          >
                              <div className="w-[30px] text-center" onClick={(e) => { e.stopPropagation(); toggleLayerAttr(layer.name, 'visible'); }}>
                                  <i className={`fa-regular ${layer.visible ? 'fa-eye text-[#aaaacc]' : 'fa-eye-slash text-[#8888aa] opacity-30'}`}></i>
                              </div>
                              <div className="w-[30px] text-center" onClick={(e) => { e.stopPropagation(); toggleLayerAttr(layer.name, 'locked'); }}>
                                  <i className={`fa-solid ${layer.locked ? 'fa-lock text-[#ffaa44]' : 'fa-lock-open text-[#aaaacc] opacity-50'}`}></i>
                              </div>
                              <div className="w-[40px] text-[#8888aa] font-mono text-[11px]">{layer.lw.toFixed(2)}</div>
                              <div className="ml-2 truncate">{layer.name}</div>
                          </div>
                      ))}
                  </div>

                  <div className="p-2 border-t border-[#2a3a4a] text-xs">
                     <span className="text-[#8888aa]">Текущий слой: </span>
                     <span className="text-[#4a9eff] font-semibold">{appState.activeLayer}</span>
                  </div>
              </div>

              {/* BOTTOM: AI CHAT */}
              <div className="flex-1 flex flex-col min-h-[50%] bg-[#101020]">
                  <div className="h-[40px] flex items-center justify-between px-3 border-b border-[#2a3a4a] bg-[#1a2535]">
                      <div className="flex items-center gap-2">
                          <i className="fa-solid fa-robot text-[#4a9eff]"></i>
                          <div>
                              <div className="text-white font-bold text-[13px] leading-tight">AI Ассистент</div>
                              <div className="text-[#4ade80] text-[10px] flex items-center gap-1 leading-tight mt-0.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse"></span>Online
                              </div>
                          </div>
                      </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4 no-scroll">
                      {appState.chatMessages.map((msg, i) => (
                          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                              {msg.role === 'assistant' && (
                                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#4a9eff] to-[#3b82f6] flex items-center justify-center text-white flex-shrink-0 font-bold text-[10px] shadow-sm">AI</div>
                              )}
                              <div className={`p-2.5 text-[13px] leading-relaxed shadow-sm ${
                                  msg.role === 'assistant' 
                                  ? 'bg-[#1a2535] border border-[#2a3a4a] rounded-lg rounded-tl-sm text-[#ccccdd]' 
                                  : 'bg-[#1e3a5a] border border-[#2a5a8a] rounded-lg rounded-tr-sm text-[#ddeeff]'
                              }`}>
                                  {msg.text}
                              </div>
                          </div>
                      ))}
                  </div>
                  
                  <div className="p-3 border-t border-[#2a3a4a] bg-[#0d1525]">
                      <div className="flex gap-2 pb-2">
                          <button className="px-3 py-1 bg-[#151525] border border-[#2a3a4a] rounded-full text-xs text-[#aaaacc] hover:bg-[#1a2535] hover:border-[#4a9eff]" onClick={() => setChatInput('Квартира 60м²')}>📐 Квартира 60м²</button>
                          <button className="px-3 py-1 bg-[#151525] border border-[#2a3a4a] rounded-full text-xs text-[#aaaacc] hover:bg-[#1a2535] hover:border-[#4a9eff]" onClick={() => setChatInput('Офис 100м²')}>📋 Офис 100м²</button>
                      </div>
                      <div className="flex bg-[#0a0f1a] border border-[#2a3a4a] rounded-lg focus-within:border-[#4a9eff] overflow-hidden">
                          <textarea 
                              className="bg-transparent border-none outline-none w-full p-2 text-white resize-none text-[13px]" 
                              rows="2" 
                              placeholder="Опишите чертёж..."
                              value={chatInput}
                              onChange={e => setChatInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatEnter(); } }}
                          />
                          <button className="px-3 bg-transparent text-[#4a9eff] hover:text-white transition-colors" onClick={handleChatEnter}>
                              <i className="fa-solid fa-paper-plane"></i>
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      </div>

      {/* 4. COMMAND LINE AND STATUS BAR */}
      <div className="flex flex-col border-t border-[#2a3a4a] font-mono flex-shrink-0 z-20">
          
          <div className="h-[80px] bg-[#0a0a18] flex flex-col justify-end">
              <div className="overflow-y-auto px-3 py-1 text-[#aaaacc] text-[12px] leading-relaxed no-scroll flex-1 flex flex-col justify-end">
                  {appState.commandLog.map((log, i) => (
                      <div key={i}>{log}</div>
                  ))}
                  <div className="flex text-white mt-1">
                      <span className="mr-2">Command:</span>
                      <input 
                         className="flex-1 bg-transparent border-none outline-none text-white caret-white" 
                         type="text" 
                         autoComplete="off"
                         onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.target.value) {
                               const v = e.target.value.toUpperCase();
                               e.target.value = '';
                               if (v === 'LINE') setTool('line', 'LINE');
                               if (v === 'RECT') setTool('rect', 'RECT');
                               if (v === 'CIRCLE') setTool('circle', 'CIRCLE');
                               if (v === 'UNDO') undo();
                               logCmd(`Command: _${v}`);
                            }
                         }}
                      />
                  </div>
              </div>
          </div>
          
          <div className="h-[24px] bg-[#050510] flex items-center justify-between px-3 text-[#aaaacc] text-[11px] border-t border-[#1a1a2a]">
              <div>
                  <span className="w-[200px] inline-block">X: {mousePos.x.toFixed(2)} &nbsp; Y: {mousePos.y.toFixed(2)} &nbsp; Z: 0.00</span>
                  <span className="ml-4 text-[#8888aa]">| ZOOM: {Math.round(appState.zoom * 100)}%</span>
                  {appState.selectedElements.length > 0 && <span className="ml-4 text-[#4a9eff] font-bold">ОБЪЕКТОВ ВЫБРАНО: {appState.selectedElements.length}</span>}
              </div>
              <div className="flex gap-1 h-full items-center font-[system-ui]">
                  {['SNAP', 'СЕТКА', 'ОРТО', 'POLAR', 'OSNAP', 'OTRACK', 'ДИН', 'ЛВ'].map((key) => {
                      let flag = false;
                      let attr = '';
                      if (key === 'SNAP') { flag = appState.snapEnabled; attr = 'snapEnabled'; }
                      if (key === 'СЕТКА') { flag = appState.gridEnabled; attr = 'gridEnabled'; }
                      if (key === 'ОРТО') { flag = appState.orthoEnabled; attr = 'orthoEnabled'; }
                      if (key === 'OSNAP') { flag = appState.osnapEnabled; attr = 'osnapEnabled'; }
                      if (attr === '') return <div key={key} className="px-2 py-0.5 text-[#444455] cursor-not-allowed">{key}</div>;

                      return (
                          <div 
                              key={key} 
                              onClick={() => setAppState(p => ({ ...p, [attr]: !p[attr] }))}
                              className={`px-2 py-0.5 rounded cursor-pointer transition-colors ${
                                  flag ? 'bg-[#0a1a2a] text-[#aaddff] font-semibold tracking-wider' : 'text-[#444455] hover:bg-[#1a1a2a]'
                              }`}
                          >
                              {key}
                          </div>
                      );
                  })}
              </div>
          </div>
      </div>

    </div>
  );
}
