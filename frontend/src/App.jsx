import React, { useState, useEffect, useRef } from 'react';
import './index.css';

// Helper to generate IDs
const uuid = () => Math.random().toString(36).substring(2, 10);

const defaultLayers = [
  { name: 'Стены',     visible: true, locked: false, lw: 3.5 },
  { name: 'Двери',     visible: true, locked: false, lw: 2.5 },
  { name: 'Окна',      visible: true, locked: false, lw: 2.5 },
  { name: 'Размеры',   visible: true, locked: false, lw: 3.0 },
  { name: 'Мебель',    visible: true, locked: false, lw: 2.0 },
  { name: 'Текст',     visible: true, locked: false, lw: 2.0 },
  { name: 'Штриховка', visible: false,locked: false, lw: 1.0 },
  { name: 'Подложка',  visible: true, locked: false, lw: 1.0 },
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
    blocks: [],
  });

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState('ГЛАВНАЯ');
  const [chatInput, setChatInput] = useState('');
  const [chatProgress, setChatProgress] = useState({ value: 0, message: '' });
  const [loading, setLoading] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('');
  const [cmdInput, setCmdInput] = useState('');
  const [contextMenu, setContextMenu] = useState(null); // { type: 'object'|'canvas', x, y, targetId? }
  const [selectionClipboard, setSelectionClipboard] = useState([]);
  const [measurementInfo, setMeasurementInfo] = useState(null);
  const lastMouseCadRef = useRef({ x: 0, y: 0 });

  // Insert Feature States
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [newBlockName, setNewBlockName] = useState('');
  const [pendingInsert, setPendingInsert] = useState(null); // { type: 'image'|'pdf'|'block', source: any, width, height, blockId }
  const fileInputRef = useRef(null);
  const pdfInputRef = useRef(null);

  // Layer assignment modal
  const [isLayerModalOpen, setIsLayerModalOpen] = useState(false);

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
  // (SVG URL cleanup removed — no longer using image-based rendering)

  const logCmd = (msg) => {
    setAppState(p => ({ ...p, commandLog: [...p.commandLog, msg].slice(-8) }));
  };

  // ─── Core: build a cleaned SVG string with only user objects on white bg ───
  const buildCleanSvgString = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return null;

    // ── 1. Compute bounding box of all user elements in CAD coordinates ──
    const { elements, layers, zoom, panOffset } = stateRef.current;
    const visibleEls = elements.filter(el => {
      const layer = layers.find(l => l.name === el.layer);
      return layer && layer.visible;
    });

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visibleEls.forEach(el => {
      if (el.points) {
        el.points.forEach(p => {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        });
      }
      if (el.type === 'circle' && el.radius) {
        const c = el.points ? el.points[0] : el.center;
        if (c) {
          if (c.x - el.radius < minX) minX = c.x - el.radius;
          if (c.x + el.radius > maxX) maxX = c.x + el.radius;
          if (c.y - el.radius < minY) minY = c.y - el.radius;
          if (c.y + el.radius > maxY) maxY = c.y + el.radius;
        }
      }
    });

    // If no elements, use current visible viewport
    const hasContent = minX !== Infinity;
    const pad = 40; // padding in CAD units
    const cadMinX = hasContent ? minX - pad : (-panOffset.x / zoom) - 50;
    const cadMinY = hasContent ? minY - pad : (-panOffset.y / zoom) - 50;
    const cadW    = hasContent ? (maxX - minX + pad * 2) : 400;
    const cadH    = hasContent ? (maxY - minY + pad * 2) : 300;

    // ── 2. Clone SVG ──
    const cloned = svgEl.cloneNode(true);

    // ── 3. Remove <defs> (grid patterns) ──
    const defs = cloned.querySelector('defs');
    if (defs) defs.remove();

    // ── 4. Remove grid background rect (fill="url(#grid)") ──
    cloned.querySelectorAll('rect').forEach(r => {
      const f = r.getAttribute('fill') || '';
      if (f.includes('url(#grid)') || f.includes('url(#smallGrid)')) r.remove();
    });

    // ── 5. Remove axis cross-hair lines and any element using grid pattern fills ──
    cloned.querySelectorAll('line').forEach(l => {
      const s = l.getAttribute('stroke') || '';
      if (s === '#ff4444' || s === '#4444ff') l.remove();
    });

    // ── 6. Remap dark-theme colors → engineering drawing colors ──
    // White strokes → dark navy
    const remapColor = (col) => {
      if (!col || col === 'none' || col === 'transparent') return col;
      const c = col.toLowerCase();
      if (c === '#ffffff' || c === 'white') return '#1a1a2e';
      if (c === '#4a9eff') return '#0055cc'; // selection/dim blue
      if (c === '#4aff4a') return '#008800'; // crossing selection green
      return col;
    };
    cloned.querySelectorAll('*').forEach(el => {
      ['stroke', 'fill'].forEach(attr => {
        const v = el.getAttribute(attr);
        if (v) {
          const remapped = remapColor(v);
          if (remapped !== v) el.setAttribute(attr, remapped);
        }
      });
      // Also handle inline style
      const style = el.getAttribute('style') || '';
      if (style) {
        const cleaned = style
          .replace(/stroke:\s*#ffffff/gi, 'stroke:#1a1a2e')
          .replace(/fill:\s*#ffffff/gi, 'fill:#1a1a2e')
          .replace(/stroke:\s*white/gi, 'stroke:#1a1a2e')
          .replace(/fill:\s*white/gi, 'fill:#1a1a2e');
        if (cleaned !== style) el.setAttribute('style', cleaned);
      }
    });

    // ── 7. Set viewBox so elements fill the output ──
    // viewBox is in CAD units; the transform g applies translate+scale
    // We need to account for panOffset & zoom: screen_x = cad_x * zoom + panX
    // So cad_x = (screen_x - panX) / zoom  ← already computed above
    cloned.setAttribute('viewBox', `${cadMinX * zoom + panOffset.x} ${cadMinY * zoom + panOffset.y} ${cadW * zoom} ${cadH * zoom}`);
    cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    cloned.removeAttribute('style');
    cloned.style.cssText = '';

    // ── 8. Insert white background rect as first child ──
    const ns = 'http://www.w3.org/2000/svg';
    const bgRect = document.createElementNS(ns, 'rect');
    bgRect.setAttribute('x', String(cadMinX * zoom + panOffset.x));
    bgRect.setAttribute('y', String(cadMinY * zoom + panOffset.y));
    bgRect.setAttribute('width', String(cadW * zoom));
    bgRect.setAttribute('height', String(cadH * zoom));
    bgRect.setAttribute('fill', '#ffffff');
    cloned.insertBefore(bgRect, cloned.firstChild);

    return new XMLSerializer().serializeToString(cloned);
  };

  // ─── Print: opens popup with ONLY the drawing, then browser print dialog ───
  const printCanvas = () => {
    logCmd('_PLOT');
    const svgString = buildCleanSvgString();
    if (!svgString) { logCmd('Нет чертежа для печати'); return; }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>AICAD — Печать чертежа</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #fff; }
    svg { display: block; width: 100%; height: 100%; }
    @media print {
      @page { margin: 10mm; size: A4 landscape; }
    }
  </style>
</head>
<body>${svgString}</body>
</html>`;

    const win = window.open('', '_blank', 'width=1200,height=900');
    if (!win) { logCmd('Разрешите всплывающие окна браузера'); return; }
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
    setTimeout(() => { try { win.focus(); win.print(); } catch(e) {} }, 700);
    logCmd('Диалог печати — только объекты, без сетки');
  };

  // ─── Export SVG: auto-downloads drawing.svg instantly ───────────────────
  const exportPDF = () => {
    logCmd('_EXPORTPDF');
    const svgString = buildCleanSvgString();
    if (!svgString) { logCmd('Нет объектов для экспорта'); return; }

    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'drawing.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    logCmd('Сохранено: drawing.svg (откройте в браузере для экспорта в PDF)');
  };

  const executeAction = (actionName, cmdLog) => {
    switch(actionName) {
      case 'print': printCanvas(); break;
      case 'pdf': exportPDF(); break;
      case 'block': 
        logCmd(`_${cmdLog}`);
        setIsBlockModalOpen(true); 
        break;
      case 'image': 
        logCmd(`_${cmdLog}`);
        if(fileInputRef.current) fileInputRef.current.click(); 
        break;
      case 'pdfattach': 
        logCmd(`_${cmdLog}`);
        if(pdfInputRef.current) pdfInputRef.current.click(); 
        break;
      case 'leader': logCmd(`_${cmdLog}`); setTool('leader', 'MLEADER'); break;
      case 'table': logCmd(`_${cmdLog}`); setTool('table', 'TABLE'); break;
      default: break;
    }
  };

  // Image Upload logic
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        setPendingInsert({ type: 'image', source: ev.target.result, width: img.width, height: img.height });
        setTool('insert_pending', 'INSERT_IMAGE');
        logCmd("Кликните на чертеж для вставки изображения");
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // PDF Upload logic
  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileReader = new FileReader();
    fileReader.onload = async function() {
      try {
        const typedarray = new Uint8Array(this.result);
        const pdf = await window.pdfjsLib.getDocument(typedarray).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        const dataUrl = canvas.toDataURL('image/png');
        setPendingInsert({ type: 'pdf', source: dataUrl, width: viewport.width, height: viewport.height });
        setTool('insert_pending', 'PDFATTACH');
        logCmd("Кликните на чертеж для вставки PDF подложки");
      } catch (err) {
        logCmd("Ошибка загрузки PDF: " + err.message);
      }
    };
    fileReader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Block Create logic
  const createBlock = () => {
    if (!newBlockName.trim()) { alert("Введите имя блока"); return; }
    if (appState.selectedElements.length === 0) { alert("Выберите элементы для блока"); return; }
    
    if (appState.blocks.some(b => b.name === newBlockName)) {
      alert("Блок с таким именем уже существует!");
      return;
    }

    const selSet = new Set(appState.selectedElements);
    const blockElements = appState.elements.filter(el => selSet.has(el.id)).map(el => JSON.parse(JSON.stringify(el)));

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    blockElements.forEach(el => {
      if (el.points) el.points.forEach(p => {
        if(p.x < minX) minX = p.x; if(p.x > maxX) maxX = p.x;
        if(p.y < minY) minY = p.y; if(p.y > maxY) maxY = p.y;
      });
      if (el.type === 'circle' && el.radius) {
        const c = el.points ? el.points[0] : el.center;
        if (c) {
          if(c.x-el.radius < minX) minX = c.x-el.radius;
          if(c.x+el.radius > maxX) maxX = c.x+el.radius;
          if(c.y-el.radius < minY) minY = c.y-el.radius;
          if(c.y+el.radius > maxY) maxY = c.y+el.radius;
        }
      }
    });
    
    const centerX = minX !== Infinity ? (minX + maxX)/2 : 0;
    const centerY = minY !== Infinity ? (minY + maxY)/2 : 0;
    const basePoint = { x: centerX, y: centerY };

    blockElements.forEach(el => {
      if(el.points) el.points.forEach(p => {
        p.x -= basePoint.x;
        p.y -= basePoint.y;
      });
    });

    setAppState(p => ({
      ...p,
      blocks: [...p.blocks, { id: uuid(), name: newBlockName, elements: blockElements, basePoint: {x:0, y:0} }]
    }));
    logCmd(`Блок "${newBlockName}" создан`);
    setNewBlockName('');
  };

  const startInsertBlock = (block) => {
    setPendingInsert({ type: 'block', blockId: block.id, blockData: block });
    setTool('insert_pending', `INSERT BLOCK ${block.name}`);
    setIsBlockModalOpen(false);
    logCmd("Кликните на чертеж для вставки блока");
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

  const getElementBounds = (el) => {
    if (!el) return null;
    if (el.type === 'circle' && Number.isFinite(el.radius)) {
      const c = el.points ? el.points[0] : el.center;
      if (c) return { minX: c.x - el.radius, minY: c.y - el.radius, maxX: c.x + el.radius, maxY: c.y + el.radius };
    }
    if ((el.type === 'image' || el.type === 'pdf' || el.type === 'table') && el.points?.[0]) {
      const p = el.points[0];
      const w = Number(el.width ?? (el.cellW * el.cols) ?? 0);
      const h = Number(el.height ?? (el.cellH * el.rows) ?? 0);
      return { minX: p.x, minY: p.y, maxX: p.x + w, maxY: p.y + h };
    }
    if (!el.points || el.points.length === 0) return null;
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    el.points.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });
    if (!Number.isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  };

  const getSelectionBounds = (selectedIds) => {
    if (!selectedIds || selectedIds.length === 0) return null;
    const idSet = new Set(selectedIds);
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    appState.elements.forEach((el) => {
      if (!idSet.has(el.id)) return;
      const b = getElementBounds(el);
      if (!b) return;
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    });
    if (!Number.isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
  };

  const showSelectionDimensions = () => {
    if (appState.selectedElements.length === 0) {
      logCmd('Для размера сначала выберите объекты');
      return;
    }
    const b = getSelectionBounds(appState.selectedElements);
    if (!b) {
      logCmd('Не удалось вычислить размер выбранных объектов');
      return;
    }
    const info = {
      x: +(b.maxX - b.minX).toFixed(2),
      y: +(b.maxY - b.minY).toFixed(2),
      z: 0,
      count: appState.selectedElements.length,
    };
    setMeasurementInfo(info);
    logCmd(`Размер: X=${info.x}, Y=${info.y}, Z=${info.z}`);
  };

  const copySelectionToClipboard = (cut = false) => {
    if (stateRef.current.selectedElements.length === 0) {
      logCmd('Сначала выберите объекты для копирования');
      return;
    }
    const selSet = new Set(stateRef.current.selectedElements);
    const copied = stateRef.current.elements
      .filter((el) => selSet.has(el.id))
      .map((el) => JSON.parse(JSON.stringify(el)));
    setSelectionClipboard(copied);
    if (cut) {
      const newElements = stateRef.current.elements.filter((el) => !selSet.has(el.id));
      setAppState((p) => ({ ...p, elements: newElements, selectedElements: [], activeTool: 'select' }));
      pushHistory(newElements);
      logCmd(`Вырезано ${copied.length} объектов`);
    } else {
      logCmd(`Скопировано ${copied.length} объектов`);
    }
  };

  const pasteClipboard = (targetPoint = null) => {
    if (selectionClipboard.length === 0) {
      logCmd('Буфер обмена пуст');
      return;
    }
    const srcBounds = (() => {
      let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
      selectionClipboard.forEach((el) => {
        const b = getElementBounds(el);
        if (!b) return;
        if (b.minX < minX) minX = b.minX;
        if (b.minY < minY) minY = b.minY;
        if (b.maxX > maxX) maxX = b.maxX;
        if (b.maxY > maxY) maxY = b.maxY;
      });
      if (!Number.isFinite(minX)) return null;
      return { minX, minY, maxX, maxY };
    })();
    if (!srcBounds) return;

    const srcCenter = {
      x: (srcBounds.minX + srcBounds.maxX) / 2,
      y: (srcBounds.minY + srcBounds.maxY) / 2,
    };
    const dst = targetPoint || { x: srcCenter.x + 20, y: srcCenter.y + 20 };
    const dx = dst.x - srcCenter.x;
    const dy = dst.y - srcCenter.y;

    const pasted = selectionClipboard.map((el) => {
      const newEl = JSON.parse(JSON.stringify(el));
      newEl.id = uuid();
      if (newEl.points) {
        newEl.points = newEl.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
      }
      return newEl;
    });
    const currentElements = stateRef.current.elements;
    const newElements = [...currentElements, ...pasted];
    setAppState((p) => ({
      ...p,
      elements: newElements,
      selectedElements: pasted.map((el) => el.id),
      activeTool: 'select',
    }));
    pushHistory(newElements);
    logCmd(`Вставлено ${pasted.length} объектов`);
  };

  const handleCanvasContextMenu = (e) => {
    e.preventDefault();
    if (appState.selectedElements.length > 0) {
      setContextMenu({ type: 'object', x: e.clientX, y: e.clientY, targetId: appState.selectedElements[0] });
    } else {
      setContextMenu({ type: 'canvas', x: e.clientX, y: e.clientY });
    }
  };

  const handleObjectContextMenu = (e, el) => {
    e.preventDefault();
    e.stopPropagation();
    setAppState((p) => ({
      ...p,
      selectedElements: p.selectedElements.includes(el.id) ? p.selectedElements : [el.id],
      activeTool: 'select',
    }));
    setContextMenu({ type: 'object', x: e.clientX, y: e.clientY, targetId: el.id });
  };

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, []);

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
        if (el.type === 'circle') {
          if (el.points && el.points[0]) checkPoints.push(el.points[0]);
          else if (el.center) checkPoints.push(el.center);
        }
        if (el.type === 'line' && el.points && el.points.length === 2) {
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
          const c = el.points ? el.points[0] : el.center;
          if (c) {
            if(c.x-el.radius < minX) minX=c.x-el.radius;
            if(c.x+el.radius > maxX) maxX=c.x+el.radius;
            if(c.y-el.radius < minY) minY=c.y-el.radius;
            if(c.y+el.radius > maxY) maxY=c.y+el.radius;
          }
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
        setContextMenu(null);
        setMeasurementInfo(null);
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
        if (e.key.toLowerCase() === 'c') { e.preventDefault(); copySelectionToClipboard(false); }
        if (e.key.toLowerCase() === 'x') { e.preventDefault(); copySelectionToClipboard(true); }
        if (e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(lastMouseCadRef.current); }
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
    lastMouseCadRef.current = cadPt;

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
    } else if (appState.activeTool === 'drag_objects' && appState.isDrawing) {
      draftRef.current.tempPoint = cadPt;
      draftRef.current.didDrag = true;
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

    if (appState.activeTool === 'insert_pending' && pendingInsert) {
      if (pendingInsert.type === 'block') {
        const { blockData } = pendingInsert;
        const newEls = blockData.elements.map(el => {
          const newEl = JSON.parse(JSON.stringify(el));
          newEl.id = uuid();
          newEl.groupId = blockData.id;
          newEl.layerAssigned = false;
          if(newEl.points) {
            newEl.points.forEach(p => { p.x += pt.x; p.y += pt.y; });
          }
          return newEl;
        });
        const newElements = [...appState.elements, ...newEls];
        setAppState(p => ({ ...p, elements: newElements, activeTool: 'select' }));
        pushHistory(newElements);
        logCmd(`Вставлен блок "${blockData.name}"`);
      } else if (pendingInsert.type === 'image' || pendingInsert.type === 'pdf') {
        const scale = 200 / pendingInsert.width;
        const newEl = {
          id: uuid(),
          type: pendingInsert.type,
          layer: pendingInsert.type === 'pdf' ? 'Подложка' : appState.activeLayer,
          layerAssigned: false,
          points: [pt],
          width: pendingInsert.width * scale,
          height: pendingInsert.height * scale,
          source: pendingInsert.source
        };
        const newElements = [...appState.elements, newEl];
        setAppState(p => ({ ...p, elements: newElements, activeTool: 'select' }));
        pushHistory(newElements);
        logCmd(`Вставлено ${pendingInsert.type === 'pdf' ? 'PDF-подложка' : 'Изображение'}`);
      }
      setPendingInsert(null);
      return;
    }

    // DRAWING LOGIC
    if (appState.activeTool === 'line') {
      if (!appState.isDrawing) {
        draftRef.current.points = [pt];
        setAppState(p => ({ ...p, isDrawing: true, drawingPoints: [pt, pt] }));
      } else {
        const newEl = {
          id: uuid(), type: 'line', layer: appState.activeLayer, layerAssigned: false, points: [draftRef.current.points[0], pt]
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
        const newEl = { id: uuid(), type: 'arc', layer: appState.activeLayer, layerAssigned: false, points: pts };
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
        const newEl = { id: uuid(), type: 'circle', layer: appState.activeLayer, layerAssigned: false, points: [center], radius };
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
          id: uuid(), type: 'rect', layer: appState.activeLayer, layerAssigned: false,
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
      const newEl = { id: uuid(), type: 'text', layer: appState.activeLayer, layerAssigned: false, points: [pt], text: textVal };
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
        const newEl = { id: uuid(), type: 'dim', layer: appState.activeLayer, layerAssigned: false, points: [p1, p2] };
        const newElements = [...appState.elements, newEl];
        setAppState(p => ({ ...p, elements: newElements, isDrawing: false, drawingPoints: [], activeTool: 'select' }));
        pushHistory(newElements);
        logCmd(`DIM ${dist(p1,p2).toFixed(2)}`);
      }
    }
    else if (appState.activeTool === 'leader') {
      if (!appState.isDrawing) {
        draftRef.current.points = [pt];
        setAppState(p => ({ ...p, isDrawing: true, drawingPoints: [pt, pt] }));
      } else {
        const p1 = draftRef.current.points[0];
        const p2 = pt;
        const textVal = window.prompt("Введите текст выноски:");
        if (textVal) {
          const newEl = { id: uuid(), type: 'leader', layer: appState.activeLayer, layerAssigned: false, points: [p1, p2], text: textVal };
          const newElements = [...appState.elements, newEl];
          setAppState(p => ({ ...p, elements: newElements, isDrawing: false, drawingPoints: [], activeTool: 'select' }));
          pushHistory(newElements);
          logCmd(`LEADER "${textVal}"`);
        } else {
          setAppState(p => ({ ...p, isDrawing: false, drawingPoints: [], activeTool: 'select' }));
        }
      }
    }
    else if (appState.activeTool === 'table') {
      const rowsStr = window.prompt("Введите количество строк:", "3");
      const colsStr = window.prompt("Введите количество столбцов:", "3");
      const rows = parseInt(rowsStr, 10);
      const cols = parseInt(colsStr, 10);
      if (!isNaN(rows) && !isNaN(cols) && rows > 0 && cols > 0) {
        const newEl = { id: uuid(), type: 'table', layer: appState.activeLayer, layerAssigned: false, points: [pt], rows, cols, cellW: 100, cellH: 30, cellData: {} };
        const newElements = [...appState.elements, newEl];
        setAppState(p => ({ ...p, elements: newElements, activeTool: 'select' }));
        pushHistory(newElements);
        logCmd(`TABLE ${rows}x${cols}`);
      } else {
        setAppState(p => ({ ...p, activeTool: 'select' }));
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
    const cadPt = getCadCoords(e);
    
    if (appState.activeTool === 'drag_objects') {
      const p1 = draftRef.current.points[0];
      const p2 = draftRef.current.tempPoint || cadPt;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;

      // If dragged enough to be a move
      if (draftRef.current.didDrag && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) {
        const selSet = new Set(appState.selectedElements);
        const newElements = appState.elements.map(el => {
          if (!selSet.has(el.id)) return el;
          const movedPts = el.points?.map(p => ({x: p.x + dx, y: p.y + dy}));
          return { ...el, points: movedPts };
        });
        setAppState(p => ({ ...p, elements: newElements, activeTool: 'select', isDrawing: false, drawingPoints: [] }));
        pushHistory(newElements);
        logCmd(`DRAG-MOVE (${dx.toFixed(1)}, ${dy.toFixed(1)})`);
      } else {
        // Just clicked on object, complete selection logic
        let newSelected = appState.selectedElements;
        if (e.shiftKey && !draftRef.current.clickedJustNow && draftRef.current.clickTarget) {
           newSelected = newSelected.filter(id => id !== draftRef.current.clickTarget);
        } else if (!e.shiftKey && !draftRef.current.clickedJustNow && newSelected.length > 1) {
           newSelected = [draftRef.current.clickTarget];
        }
        setAppState(p => ({ ...p, activeTool: 'select', isDrawing: false, drawingPoints: [], selectedElements: newSelected }));
      }
      draftRef.current.didDrag = false;
      draftRef.current.clickTarget = null;
      return;
    }

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

        let insideCnt = 0;
        let crossCnt = 0;
        if (el.points) {
          el.points.forEach(pt => {
            if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) insideCnt++;
          });
        }

        if (el.type === 'circle') {
          const c = el.points ? el.points[0] : el.center;
          if (c) {
            const cx = c.x, cy = c.y, r = el.radius || 0;
            if (cx-r >= minX && cx+r <= maxX && cy-r >= minY && cy+r <= maxY) insideCnt += 2;
            else if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) crossCnt++;
          }
        }

        if (!el.points && el.type !== 'circle') return false;

        if (mode === 'inside') {
          const ptCount = el.points ? el.points.length : (el.type === 'circle' ? 2 : 1);
          return insideCnt === (ptCount || 1);
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
      const newEl = { id: uuid(), type: appState.activeTool, layer: appState.activeLayer, layerAssigned: false, points: draftRef.current.points };
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

  const handleTableCellDoubleClick = (e, el, r, c) => {
    e.stopPropagation();
    const layerInfo = appState.layers.find(l => l.name === el.layer);
    if (!layerInfo || layerInfo.locked) return;

    const currentText = el.cellData?.[`${r},${c}`] || '';
    const newText = window.prompt("Введите текст ячейки:", currentText);
    if (newText !== null) {
      const newElements = appState.elements.map(x => {
        if (x.id === el.id) {
          return { ...x, cellData: { ...(x.cellData || {}), [`${r},${c}`]: newText } };
        }
        return x;
      });
      setAppState(p => ({ ...p, elements: newElements }));
      pushHistory(newElements);
      logCmd(`Изменена ячейка ${r + 1}x${c + 1}`);
    }
  };

  // Handle mouse down on a specific CAD element
  const handleObjectMouseDown = (e, el) => {
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
      if (appState.activeTool === 'select') {
        let newSelected = appState.selectedElements;
        let clickedJustNow = false;
        
        if (!newSelected.includes(el.id)) {
          newSelected = e.shiftKey ? [...newSelected, el.id] : [el.id];
          clickedJustNow = true;
        }

        const cadPt = getCadCoords(e);
        draftRef.current.points = [cadPt];
        draftRef.current.tempPoint = cadPt;
        draftRef.current.clickTarget = el.id;
        draftRef.current.clickedJustNow = clickedJustNow;
        draftRef.current.didDrag = false;

        setAppState(p => ({
          ...p,
          selectedElements: newSelected,
          activeTool: 'drag_objects',
          isDrawing: true,
          drawingPoints: [cadPt, cadPt]
        }));
      } else {
        setAppState(p => ({
          ...p,
          selectedElements: e.shiftKey
            ? (p.selectedElements.includes(el.id) ? p.selectedElements.filter(id => id !== el.id) : [...p.selectedElements, el.id])
            : [el.id]
        }));
      }
    }
  };

  const getCursor = () => {
    if (appState.activeTool === 'pan') return appState.isDrawing ? 'grabbing' : 'grab';
    if (['line','polyline','circle','rect','arc','polygon','box_select','text','dim','leader','table'].includes(appState.activeTool)) return 'crosshair';
    if (appState.activeTool === 'erase' || appState.activeTool === 'trim') return 'cell';
    return 'default';
  };

  const addMessage = (role, text) => {
    setAppState(p => ({ ...p, chatMessages: [...p.chatMessages, { role, text }] }));
  };

  const updateLastAiMessage = (text) => {
    setAppState(prev => {
      const messages = [...prev.chatMessages];
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].role === 'assistant') {
          messages[i] = { ...messages[i], text };
          return { ...prev, chatMessages: messages };
        }
      }
      return { ...prev, chatMessages: [...messages, { role: 'assistant', text }] };
    });
  };

  const updateProgress = (progress, message) => {
    setChatProgress({ value: progress ?? 0, message: message ?? '' });
    if (message) logCmd(`AI: ${message}`);
  };

  const clearCanvas = () => {
    setAppState(p => ({ ...p, elements: [], selectedElements: [] }));
    pushHistory([]);
  };

  // ═══ Handle backend response: convert elements to CAD objects ═══
  const handleBackendResponse = (data) => {
    if (!data.elements || data.elements.length === 0) return;

    const cadElements = data.elements.map(el => ({
      ...el,
      id: el.id || uuid(),
      selected: false,
      visible: true,
      layerAssigned: true,
      // Normalize points from [x,y] arrays to {x,y} objects
      points: el.points ? el.points.map(p => ({
        x: Array.isArray(p) ? p[0] : p.x,
        y: Array.isArray(p) ? p[1] : p.y,
      })) : undefined,
      // Normalize center from [x,y] to {x,y}
      center: el.center ? {
        x: Array.isArray(el.center) ? el.center[0] : el.center.x,
        y: Array.isArray(el.center) ? el.center[1] : el.center.y,
      } : undefined,
    }));

    setAppState(prev => {
      const newElements = [...prev.elements, ...cadElements];
      return { ...prev, elements: newElements, selectedElements: [] };
    });
    pushHistory([...stateRef.current.elements, ...cadElements]);

    // Center view on generated elements
    if (cadElements.length > 0) {
      setTimeout(() => fitViewToElements(cadElements), 50);
    }
  };

  // ═══ Fit view to a set of elements ═══
  const fitViewToElements = (elements) => {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    elements.forEach(el => {
      if (el.points) {
        el.points.forEach(p => {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        });
      }
      if (el.center) {
        const r = el.radius || 0;
        minX = Math.min(minX, el.center.x - r);
        minY = Math.min(minY, el.center.y - r);
        maxX = Math.max(maxX, el.center.x + r);
        maxY = Math.max(maxY, el.center.y + r);
      }
    });

    if (minX === Infinity) return;

    const padding = 100;
    const canvasWidth = svgRef.current?.clientWidth || 800;
    const canvasHeight = svgRef.current?.clientHeight || 600;

    const contentWidth = maxX - minX + padding * 2;
    const contentHeight = maxY - minY + padding * 2;

    const scaleX = canvasWidth / contentWidth;
    const scaleY = canvasHeight / contentHeight;
    const newZoom = Math.min(scaleX, scaleY, 3);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setAppState(p => ({
      ...p,
      zoom: newZoom,
      panOffset: {
        x: canvasWidth / 2 - centerX * newZoom,
        y: canvasHeight / 2 - centerY * newZoom,
      }
    }));
  };

  // ═══ Sync layers after AI generation ═══
  const syncLayersAfterGeneration = (data) => {
    const usedLayers = data.layers_used || [];

    setAppState(prevState => ({
      ...prevState,
      layers: prevState.layers.map(layer => {
        if (usedLayers.includes(layer.name)) {
          return { ...layer, visible: true, locked: false, hasContent: true };
        }
        if (layer.name === 'Штриховка') {
          return { ...layer, visible: false };
        }
        return layer;
      }),
      activeLayer: 'Стены',
    }));
  };

  const sendMessage = async (prompt) => {
    try {
      setLoading(true);
      setDownloadUrl('');
      addMessage('user', prompt);
      addMessage('assistant', 'Генерирую чертёж...');
      updateProgress(30, 'Генерация...');
      logCmd("AI_GENERATE");

      const response = await fetch("http://localhost:8011/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Ошибка сервера");
      }

      const data = await response.json();

      // Add CAD elements to canvas
      if (data.elements && data.elements.length > 0) {
        clearCanvas();
        handleBackendResponse(data);
        syncLayersAfterGeneration(data);
      }

      const engineLabel = data.engine_used ? ` Движок: ${data.engine_used}` : '';
      updateLastAiMessage(
        `Готово! ${data.rooms_count} комнат, ${data.total_area}м².${engineLabel} Чертёж отображён на канвасе.`
      );
      setDownloadUrl(`http://localhost:8011${data.download_url || ''}`);
      logCmd(`AI: готово, DXF ${data.download_url || ''}`);
      setChatProgress({ value: 100, message: 'Готово' });
    } catch (error) {
      updateLastAiMessage(`Ошибка: ${error.message}`);
      logCmd(`AI_ERROR: ${error.message}`);
      setChatProgress({ value: 0, message: '' });
    } finally {
      setLoading(false);
    }
  };

  const handleChatEnter = () => {
    if (!chatInput.trim() || loading) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    sendMessage(userMsg);
  };

  const toggleLayerAttr = (layerName, attr) => {
    setAppState(p => ({
      ...p,
      layers: p.layers.map(l => l.name === layerName ? { ...l, [attr]: !l[attr] } : l)
    }));
  };

  const updateLayerLineweight = (layerName, rawValue) => {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) return;
    const lw = Math.max(0, Math.min(5, numeric));
    setAppState(p => ({
      ...p,
      layers: p.layers.map(l => (l.name === layerName ? { ...l, lw } : l))
    }));
  };

  // Assign layer to all selected elements (marks layerAssigned: true so they appear in panel)
  const assignLayerToSelected = (layerName) => {
    if (appState.selectedElements.length === 0) return;
    const selSet = new Set(appState.selectedElements);
    const newElements = appState.elements.map(el =>
      selSet.has(el.id) ? { ...el, layer: layerName, layerAssigned: true } : el
    );
    setAppState(p => ({ ...p, elements: newElements }));
    pushHistory(newElements);
    logCmd(`Слой "${layerName}" назначен ${appState.selectedElements.length} объектам`);
    setIsLayerModalOpen(false);
  };

  // Ensure a layer exists (add it if missing)
  const ensureLayer = (layerName, lw = 0.25) => {
    setAppState(p => {
      if (p.layers.some(l => l.name === layerName)) return p;
      return { ...p, layers: [...p.layers, { name: layerName, visible: true, locked: false, lw }] };
    });
  };

  // Only show layers explicitly assigned (by user via modal OR by AI generation)
  const usedLayerNames = new Set(
    appState.elements.filter(el => el.layerAssigned === true).map(el => el.layer).filter(Boolean)
  );
  const visibleLayersInPanel = appState.layers.filter(l => usedLayerNames.has(l.name));
  const hasAssignedLayers = visibleLayersInPanel.length > 0;
  const currentLayerLabel = hasAssignedLayers ? appState.activeLayer : '—';

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
      case 'LEADER': case 'MLEADER': setTool('leader', 'MLEADER'); break;
      case 'TABLE': setTool('table', 'TABLE'); break;
      case 'U': case 'UNDO': undo(); break;
      case 'REDO': redo(); break;
      case 'Z': case 'ZOOM': case 'ZE': zoomExtents(); break;
      case 'PAN': setTool('pan', 'PAN'); break;
      case 'SELECT': case 'ESC': setTool('select'); break;
      case 'PRINT': case 'PLOT': printCanvas(); break;
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
  // ═══ Helper functions for arc/ellipse rendering ═══
  const polarToCartesian = (cx, cy, r, angleDeg) => {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const describeArc = (cx, cy, r, startAngle, endAngle) => {
    const start = polarToCartesian(cx, cy, r, endAngle);
    const end = polarToCartesian(cx, cy, r, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
    return ['M', start.x, start.y, 'A', r, r, 0, largeArcFlag, 0, end.x, end.y].join(' ');
  };

  const getLineweight = (layerName) => {
    const weights = {
      'Стены': 3.5,
      'Двери': 2.5,
      'Окна': 2.5,
      'Мебель': 2.0,
      'Размеры': 3.0,
      'Текст': 2.0,
      'Штриховка': 1.0,
    };
    return weights[layerName] || 2.0;
  };

  const renderElements = () => {
    const { elements, layers, selectedElements, zoom } = appState;

    return elements.map(el => {
      const layer = layers.find(l => l.name === el.layer);
      if (!layer || !layer.visible) return null;

      const isSelected = selectedElements.includes(el.id);
      const strokeWidth = layer.lw || getLineweight(el.layer) / zoom;
      const strokeColor = el.color || '#ffffff';
      const stroke = isSelected ? '#4a9eff' : strokeColor;

      let shape = null;

      if (el.type === 'line' && el.points && el.points.length >= 2) {
        shape = <line x1={el.points[0].x} y1={el.points[0].y} x2={el.points[1].x} y2={el.points[1].y} />;

      } else if (el.type === 'polyline' && el.points) {
        const polyPoints = el.points.map(p => `${p.x},${p.y}`).join(' ');
        shape = <polyline points={polyPoints} fill="none" />;

      } else if (el.type === 'circle') {
        // Support both center-based (from backend) and points-based (from drawing)
        const cx = el.center ? el.center.x : el.points?.[0]?.x;
        const cy = el.center ? el.center.y : el.points?.[0]?.y;
        if (cx != null && cy != null) {
          shape = <circle cx={cx} cy={cy} r={el.radius} />;
        }

      } else if (el.type === 'arc') {
        if (el.center && el.radius && el.start_angle != null && el.end_angle != null) {
          // Backend arc with center/radius/angles
          const arcPath = describeArc(el.center.x, el.center.y, el.radius, el.start_angle, el.end_angle);
          shape = <path d={arcPath} fill="none" />;
        } else if (el.points && el.points.length >= 3) {
          // User-drawn arc (3-point quadratic)
          const [p1, p2, p3] = el.points;
          shape = <path d={`M ${p1.x} ${p1.y} Q ${p2.x} ${p2.y} ${p3.x} ${p3.y}`} fill="none" />;
        }

      } else if (el.type === 'ellipse') {
        const cx = el.center ? el.center.x : el.points?.[0]?.x;
        const cy = el.center ? el.center.y : el.points?.[0]?.y;
        if (cx != null && cy != null) {
          shape = <ellipse cx={cx} cy={cy} rx={el.radius} ry={el.radius * (el.ratio || 1)} fill="none" />;
        }

      } else if (el.type === 'rect' || el.type === 'polygon') {
        if (el.points) {
          const pts = el.points.map(p => `${p.x},${p.y}`).join(' ');
          shape = <polygon points={pts} fill="none" />;
        }

      } else if (el.type === 'text') {
        const tx = el.points?.[0]?.x ?? (el.center?.x ?? 0);
        const ty = el.points?.[0]?.y ?? (el.center?.y ?? 0);
        shape = (
          <text x={tx} y={ty}
            fill={isSelected ? '#4a9eff' : (el.color || '#ffffff')}
            fontSize={(el.height || 14) / zoom}
            fontFamily="monospace"
            textAnchor="middle"
            style={{ userSelect: 'none' }}
          >{el.text}</text>
        );

      } else if (el.type === 'image' || el.type === 'pdf') {
        const isPdf = el.type === 'pdf';
        shape = (
          <image href={el.source} x={el.points[0].x} y={el.points[0].y} width={el.width} height={el.height} opacity={isPdf ? 0.4 : 1.0} />
        );
      } else if (el.type === 'dim') {
        const [p1, p2] = el.points;
        const distance = dist(p1, p2).toFixed(2);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        shape = (
          <g>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} fill="none" stroke={isSelected ? '#4a9eff' : '#ffffff'} strokeWidth={strokeWidth} strokeDasharray="5,5" />
            <text x={midX} y={midY - 5/zoom} fill={isSelected ? '#4a9eff' : '#ffffff'} fontSize={12/zoom} textAnchor="middle" style={{ userSelect: 'none' }}>{distance}</text>
          </g>
        );
      } else if (el.type === 'leader') {
        const [p1, p2] = el.points;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const arrowLen = 10 / zoom;
        const arrowPt1 = { x: p1.x + arrowLen * Math.cos(angle + Math.PI / 8), y: p1.y + arrowLen * Math.sin(angle + Math.PI / 8) };
        const arrowPt2 = { x: p1.x + arrowLen * Math.cos(angle - Math.PI / 8), y: p1.y + arrowLen * Math.sin(angle - Math.PI / 8) };
        const landingLen = 20 / zoom;
        const dir = p2.x > p1.x ? 1 : -1;
        const p3 = { x: p2.x + landingLen * dir, y: p2.y };
        shape = (
          <g>
            <polyline points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`} stroke={isSelected ? '#4a9eff' : '#ffffff'} strokeWidth={strokeWidth} fill="none" />
            <polygon points={`${p1.x},${p1.y} ${arrowPt1.x},${arrowPt1.y} ${arrowPt2.x},${arrowPt2.y}`} fill={isSelected ? '#4a9eff' : '#ffffff'} />
            <text x={p3.x + (dir > 0 ? 5/zoom : -5/zoom)} y={p3.y + 4/zoom} fill={isSelected ? '#4a9eff' : '#ffffff'} fontSize={12/zoom} textAnchor={dir > 0 ? "start" : "end"} style={{ userSelect: 'none' }}>{el.text}</text>
          </g>
        );
      } else if (el.type === 'table') {
        const pt = el.points[0];
        const lines = [];
        const cellTexts = [];
        const w = el.cellW;
        const h = el.cellH;
        for (let i = 0; i <= el.rows; i++) {
          lines.push(<line key={`h${i}`} x1={pt.x} y1={pt.y + i*h} x2={pt.x + el.cols*w} y2={pt.y + i*h} stroke={isSelected ? '#4a9eff' : '#ffffff'} strokeWidth={strokeWidth} />);
        }
        for (let j = 0; j <= el.cols; j++) {
          lines.push(<line key={`v${j}`} x1={pt.x + j*w} y1={pt.y} x2={pt.x + j*w} y2={pt.y + el.rows*h} stroke={isSelected ? '#4a9eff' : '#ffffff'} strokeWidth={strokeWidth} />);
        }
        for (let r = 0; r < el.rows; r++) {
          for (let c = 0; c < el.cols; c++) {
            const key = `${r},${c}`;
            const text = el.cellData?.[key] || '';
            const cx = pt.x + c * w;
            const cy = pt.y + r * h;
            cellTexts.push(
              <g key={`cell_${key}`}>
                <rect 
                  x={cx} y={cy} width={w} height={h} fill="transparent"
                  pointerEvents="all"
                  onDoubleClick={(e) => handleTableCellDoubleClick(e, el, r, c)}
                />
                <text x={cx + w/2} y={cy + h/2 + 4/zoom} fill={isSelected ? '#4a9eff' : '#ffffff'} fontSize={12/zoom} textAnchor="middle" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  {text}
                </text>
              </g>
            );
          }
        }
        shape = <g>{lines}{cellTexts}</g>;
      }

      if (!shape) return null;

      const isSpecial = ['text', 'dim', 'image', 'pdf', 'leader', 'table'].includes(el.type);

      // Compute grip points: use el.points if available, else center
      const gripPoints = el.points || (el.center ? [el.center] : []);

      return (
        <g
          key={el.id}
          className={`cad-object ${layer.locked ? 'locked' : ''}`}
          style={{ pointerEvents: layer.locked ? 'none' : 'auto', cursor: layer.locked ? 'default' : 'pointer' }}
          onMouseDown={(e) => handleObjectMouseDown(e, el)}
          onContextMenu={(e) => handleObjectContextMenu(e, el)}
        >
          {isSpecial ? null : React.cloneElement(shape, { stroke: "transparent", strokeWidth: 10/zoom, pointerEvents: "stroke", fill: "none" })}
          {isSpecial ? shape : React.cloneElement(shape, { stroke, strokeWidth, fill: "none" })}
          {isSelected && !layer.locked && (
            <g>
              {gripPoints.map((p, idx) => (
                <rect key={idx} x={p.x - 3/zoom} y={p.y - 3/zoom} width={6/zoom} height={6/zoom} className="cad-grip" strokeWidth={1/zoom} />
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
    if (activeTool === 'leader') {
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const arrowLen = 10 / appState.zoom;
      const arrowPt1 = { x: p1.x + arrowLen * Math.cos(angle + Math.PI / 8), y: p1.y + arrowLen * Math.sin(angle + Math.PI / 8) };
      const arrowPt2 = { x: p1.x + arrowLen * Math.cos(angle - Math.PI / 8), y: p1.y + arrowLen * Math.sin(angle - Math.PI / 8) };
      const landingLen = 20 / appState.zoom;
      const dir = p2.x > p1.x ? 1 : -1;
      const p3 = { x: p2.x + landingLen * dir, y: p2.y };
      return (
        <g>
          <polyline points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`} stroke="#4a9eff" strokeWidth="1" strokeDasharray="5,5" fill="none" />
          <polygon points={`${p1.x},${p1.y} ${arrowPt1.x},${arrowPt1.y} ${arrowPt2.x},${arrowPt2.y}`} fill="#4a9eff" />
        </g>
      );
    }
    if (['move', 'copy', 'rotate', 'scale', 'drag_objects'].includes(activeTool)) {
      const { selectedElements, elements } = appState;
      if (selectedElements.length === 0) return null;
      const selElements = elements.filter(e => selectedElements.includes(e.id));

      const center = drawingPoints[0];
      let dx = 0, dy = 0, scaleFactor = 1, angle = 0;
      if (activeTool === 'move' || activeTool === 'copy' || activeTool === 'drag_objects') {
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

        <div style={{ flex: 1 }}></div>

        {/* ═══ HORIZONTAL LAYER MANAGER ═══ */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', borderLeft: '1px solid #1e2a3a', gap: 12, minWidth: 350, overflowX: 'auto' }} className="no-scroll">
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', width: '100%' }}>
               <div style={{ fontSize: 10, color: '#5568A0', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4, display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                 Слои
                 {appState.selectedElements.length > 0 && (
                   <span style={{ color: '#4a9eff', cursor: 'pointer', textTransform: 'none' }} onClick={() => setIsLayerModalOpen(true)}>Назначить слой выделенным ({appState.selectedElements.length})</span>
                 )}
               </div>
               <div style={{ display: 'flex', gap: 6, minWidth: 'min-content' }}>
                 {hasAssignedLayers ? visibleLayersInPanel.map(layer => {
                    const isActive = appState.activeLayer === layer.name;
                    return (
                      <div
                        key={layer.name}
                        onClick={() => setAppState(p => ({ ...p, activeLayer: layer.name }))}
                        style={{
                          display: 'flex', alignItems: 'center', padding: '4px 8px', cursor: 'pointer',
                          fontSize: 12, fontWeight: isActive ? 600 : 400,
                          borderRadius: '4px',
                          background: isActive ? 'rgba(74,158,255,0.15)' : '#1a2030',
                          border: isActive ? '1px solid #4a9eff' : '1px solid #2e3e54',
                          color: isActive ? '#e0e8f0' : '#8898b0',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <i
                          className={`fa-regular ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}`}
                          style={{ color: layer.visible ? '#7a9eff' : '#5568A0', fontSize: 12, marginRight: 6 }}
                          onClick={(e) => { e.stopPropagation(); toggleLayerAttr(layer.name, 'visible'); }}
                        ></i>
                        <i
                          className={`fa-solid ${layer.locked ? 'fa-lock' : 'fa-lock-open'}`}
                          style={{ color: layer.locked ? '#e8a040' : '#5568A0', fontSize: 11, marginRight: 6 }}
                          onClick={(e) => { e.stopPropagation(); toggleLayerAttr(layer.name, 'locked'); }}
                        ></i>
                        {layer.name} <span style={{ opacity: 0.6, fontSize: 10, marginLeft: 6 }}>({appState.elements.filter(el => el.layer === layer.name).length})</span>
                      </div>
                    );
                 }) : (
                    <div style={{ fontSize: 12, color: '#4a5a7a', padding: '4px 8px', background: '#1a2030', borderRadius: 4, border: '1px solid #2e3e54' }}>
                       Нет слоев. Нарисуйте объекты или используйте AI.
                    </div>
                 )}
               </div>
            </div>
        </div>
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
            onContextMenu={handleCanvasContextMenu}
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

          {measurementInfo && (
            <div
              style={{
                position: 'absolute',
                left: 16,
                top: 16,
                zIndex: 30,
                background: 'rgba(10,16,30,0.95)',
                border: '1px solid #2e3e54',
                borderRadius: 8,
                padding: '10px 12px',
                minWidth: 190,
                boxShadow: '0 8px 22px rgba(0,0,0,0.35)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#8fb8ff', fontWeight: 700 }}>Размер выделения</span>
                <i
                  className="fa-solid fa-xmark"
                  style={{ cursor: 'pointer', color: '#6f84ad' }}
                  onClick={() => setMeasurementInfo(null)}
                />
              </div>
              <div style={{ fontSize: 12, color: '#d0d8e8', lineHeight: 1.7 }}>
                X: <span style={{ color: '#4a9eff' }}>{measurementInfo.x}</span><br />
                Y: <span style={{ color: '#4a9eff' }}>{measurementInfo.y}</span><br />
                Z: <span style={{ color: '#4a9eff' }}>{measurementInfo.z}</span><br />
                Объектов: <span style={{ color: '#8fb8ff' }}>{measurementInfo.count}</span>
              </div>
            </div>
          )}
        </div>

        {/* ═══ RIGHT PANEL ═══ */}
        <div style={{ width: rightPanelWidth, display: 'flex', flexDirection: 'column', borderLeft: '1px solid #1e2a3a', background: '#10101e', flexShrink: 0, zIndex: 5, position: 'relative', boxShadow: '-4px 0 20px rgba(0,0,0,0.4)' }}>
          {/* Resize handle */}
          <div className={`resize-h ${resizing === 'right' ? 'active' : ''}`} onMouseDown={() => setResizing('right')}></div>

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
              {chatProgress.value > 0 && chatProgress.value < 100 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: '#8ba0c2', marginBottom: 4 }}>
                    {chatProgress.message || 'Генерация...'} ({chatProgress.value}%)
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: '#121b2e', overflow: 'hidden' }}>
                    <div style={{ width: `${chatProgress.value}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #4a9eff)' }} />
                  </div>
                </div>
              )}
              {downloadUrl && (
                <div style={{ marginBottom: 8 }}>
                  <a
                    href={downloadUrl}
                    download="drawing.dxf"
                    style={{
                      display: "block",
                      marginTop: "8px",
                      padding: "6px 12px",
                      background: "#1a3a8a",
                      color: "white",
                      borderRadius: "4px",
                      textDecoration: "none",
                      fontSize: "12px"
                    }}
                  >
                    Скачать DXF
                  </a>
                </div>
              )}
              <div style={{ display: 'flex', background: '#0e1020', border: '1px solid #1e2a3a', borderRadius: 10, overflow: 'hidden' }}
                onFocus={e => e.currentTarget.style.borderColor = '#4a9eff'}
                onBlur={e => e.currentTarget.style.borderColor = '#1e2a3a'}
              >
                <textarea
                  style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%', padding: '10px 12px', color: '#d0d8e8', resize: 'none', fontSize: 13, fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}
                  rows="2"
                  placeholder="Опишите чертёж..."
                  value={chatInput}
                  disabled={loading}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatEnter(); } }}
                />
                <button
                  style={{ padding: '0 14px', background: 'transparent', border: 'none', color: '#4a9eff', cursor: 'pointer', fontSize: 15 }}
                  onClick={handleChatEnter}
                  disabled={loading}
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
            {appState.selectedElements.length > 0 && (() => {
              const selEl = appState.elements.find(e => e.id === appState.selectedElements[0]);
              const layerInfo = selEl ? selEl.layer : '';
              const typeInfo = selEl ? selEl.type : '';
              return (
                <span style={{ color: '#4a9eff', fontWeight: 600 }}>
                  {appState.selectedElements.length} объект{appState.selectedElements.length > 1 ? 'ов' : ''} выбран{appState.selectedElements.length === 1 ? '' : 'о'}
                  {selEl && <> | Слой: {layerInfo} | Тип: {typeInfo}</>}
                </span>
              );
            })()}
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

      {/* Hidden Inputs */}
      <input type="file" accept="image/*" style={{display: 'none'}} ref={fileInputRef} onChange={handleImageUpload} />
      <input type="file" accept="application/pdf" style={{display: 'none'}} ref={pdfInputRef} onChange={handlePdfUpload} />

      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: Math.min(contextMenu.x, window.innerWidth - 235),
            top: Math.min(contextMenu.y, window.innerHeight - 260),
            width: 225,
            zIndex: 1000,
          }}
          className="context-menu"
        >
          {contextMenu.type === 'object' ? (
            <>
              <button className="context-menu-item" onClick={() => {
                const el = appState.elements.find(e => e.id === contextMenu.targetId);
                if (el) {
                  const info = `Тип: ${el.type}\nСлой: ${el.layer}\nID: ${el.id}`;
                  alert(info);
                }
                setContextMenu(null);
              }}>
                <i className="fa-solid fa-circle-info"></i><span>Свойства</span>
              </button>
              <button className="context-menu-item" onClick={() => { copySelectionToClipboard(false); setContextMenu(null); }}>
                <i className="fa-regular fa-copy"></i><span>Копировать (Ctrl+C)</span>
              </button>
              <button className="context-menu-item" onClick={() => {
                const idSet = new Set(appState.selectedElements);
                if (idSet.size === 0) { setContextMenu(null); return; }
                const newElements = appState.elements.filter(el => !idSet.has(el.id));
                setAppState(p => ({ ...p, elements: newElements, selectedElements: [] }));
                pushHistory(newElements);
                logCmd(`Удалено ${idSet.size} объектов`);
                setContextMenu(null);
              }}>
                <i className="fa-solid fa-trash"></i><span>Удалить</span>
              </button>
              <div className="context-menu-separator"></div>
              <button className="context-menu-item" onClick={() => { setTool('rotate', 'ROTATE'); setContextMenu(null); }}>
                <i className="fa-solid fa-rotate"></i><span>Поворот</span>
              </button>
              <button className="context-menu-item" onClick={() => { setTool('scale', 'SCALE'); setContextMenu(null); }}>
                <i className="fa-solid fa-maximize"></i><span>Масштаб</span>
              </button>
              <button className="context-menu-item" onClick={() => { setTool('trim', 'TRIM'); setContextMenu(null); }}>
                <i className="fa-solid fa-scissors"></i><span>Обрезать</span>
              </button>
              <button className="context-menu-item" onClick={() => { showSelectionDimensions(); setContextMenu(null); }}>
                <i className="fa-solid fa-ruler-combined"></i><span>Размер (X/Y/Z)</span>
              </button>
              <div className="context-menu-separator"></div>
              {/* Move to Layer submenu */}
              {['Стены', 'Двери', 'Окна', 'Мебель', 'Текст', 'Размеры'].map(layerName => (
                <button key={layerName} className="context-menu-item" onClick={() => {
                  const selSet = new Set(appState.selectedElements);
                  const newElements = appState.elements.map(el =>
                    selSet.has(el.id) ? { ...el, layer: layerName, layerAssigned: true } : el
                  );
                  setAppState(p => ({ ...p, elements: newElements }));
                  pushHistory(newElements);
                  logCmd(`Перемещено на слой "${layerName}"`);
                  setContextMenu(null);
                }}>
                  <i className="fa-solid fa-layer-group" style={{ fontSize: 10 }}></i>
                  <span style={{ fontSize: 12 }}>→ {layerName}</span>
                </button>
              ))}
            </>
          ) : (
            <>
              <button className="context-menu-item" onClick={() => { setIsBlockModalOpen(true); setContextMenu(null); }}>
                <i className="fa-solid fa-shapes"></i><span>Вставить блок...</span>
              </button>
              <div className="context-menu-separator"></div>
              <button className="context-menu-item" onClick={() => { executeAction('image', 'IMAGE'); setContextMenu(null); }}>
                <i className="fa-regular fa-image"></i><span>Вставка изображения</span>
              </button>
              <button className="context-menu-item" onClick={() => { executeAction('pdfattach', 'PDFATTACH'); setContextMenu(null); }}>
                <i className="fa-regular fa-file-pdf"></i><span>Вставка PDF</span>
              </button>
              <button className="context-menu-item" onClick={() => { executeAction('table', 'TABLE'); setContextMenu(null); }}>
                <i className="fa-solid fa-table"></i><span>Создание таблиц</span>
              </button>
              <button className="context-menu-item" onClick={() => { executeAction('leader', 'MLEADER'); setContextMenu(null); }}>
                <i className="fa-solid fa-arrow-right"></i><span>Выноски</span>
              </button>
              <button className="context-menu-item" onClick={() => { setTool('text', 'MTEXT'); setContextMenu(null); }}>
                <i className="fa-solid fa-font"></i><span>Текст</span>
              </button>
              <button className="context-menu-item" onClick={() => { pasteClipboard(lastMouseCadRef.current); setContextMenu(null); }}>
                <i className="fa-solid fa-paste"></i><span>Вставить (Ctrl+V)</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Layer Assignment Modal */}
      {isLayerModalOpen && (
        <div className="modal-overlay" onClick={() => setIsLayerModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, margin: 0, color: '#e0e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
                <i className="fa-solid fa-layer-group" style={{ color: '#4a9eff' }}></i>
                Назначить слой
              </h3>
              <i className="fa-solid fa-xmark" style={{ cursor: 'pointer', color: '#8898b0', fontSize: 16 }} onClick={() => setIsLayerModalOpen(false)}></i>
            </div>
            <div style={{ fontSize: 13, color: '#8898b0', marginBottom: 16 }}>
              Выбрано объектов: <span style={{ color: '#4a9eff', fontWeight: 700 }}>{appState.selectedElements.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }} className="no-scroll">
              {appState.layers.map(layer => (
                <div
                  key={layer.name}
                  onClick={() => assignLayerToSelected(layer.name)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', background: '#1a2030', borderRadius: 8,
                    border: '1px solid #2a3a5a', cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#22304a'; e.currentTarget.style.borderColor = '#4a9eff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#1a2030'; e.currentTarget.style.borderColor = '#2a3a5a'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <i className="fa-solid fa-layer-group" style={{ color: '#4a9eff', fontSize: 13 }}></i>
                    <span style={{ color: '#e0e8f0', fontWeight: 500, fontSize: 14 }}>{layer.name}</span>
                    <span style={{ color: '#4a5a7a', fontSize: 11, fontFamily: 'monospace' }}>lw:{layer.lw.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {usedLayerNames.has(layer.name) && (
                      <span style={{ fontSize: 10, color: '#4ade80', background: 'rgba(74,222,128,0.12)', borderRadius: 4, padding: '1px 6px' }}>
                        {appState.elements.filter(el => el.layer === layer.name).length} объ.
                      </span>
                    )}
                    <i className="fa-solid fa-chevron-right" style={{ color: '#4a5a7a', fontSize: 11 }}></i>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Block Modal */}
      {isBlockModalOpen && (
        <div className="modal-overlay" onClick={() => setIsBlockModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
              <h3 style={{fontSize: 16, margin: 0, color: '#e0e8f0'}}>Менеджер блоков</h3>
              <i className="fa-solid fa-xmark" style={{cursor: 'pointer', color: '#8898b0'}} onClick={() => setIsBlockModalOpen(false)}></i>
            </div>
            
            <div style={{marginBottom: 20}}>
              <div style={{fontSize: 12, color: '#8898b0', marginBottom: 8}}>Создать новый блок из выделенных объектов:</div>
              <div style={{display: 'flex', gap: 8}}>
                <input 
                  type="text" 
                  placeholder="Имя блока..." 
                  value={newBlockName}
                  onChange={e => setNewBlockName(e.target.value)}
                  style={{flex: 1, padding: '8px 12px', background: '#12121f', border: '1px solid #2e3e54', borderRadius: 4, color: '#e0e8f0', outline: 'none'}}
                />
                <button 
                  onClick={createBlock}
                  style={{padding: '8px 16px', background: '#4a9eff', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600}}
                >
                  Создать
                </button>
              </div>
            </div>

            <div style={{borderTop: '1px solid #2e3e54', paddingTop: 16}}>
              <div style={{fontSize: 12, color: '#8898b0', marginBottom: 12}}>Библиотека блоков:</div>
              <div style={{maxHeight: 250, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8}} className="no-scroll">
                {appState.blocks.length === 0 ? (
                  <div style={{color: '#5568A0', fontSize: 13, textAlign: 'center', padding: '20px 0'}}>Нет сохраненных блоков</div>
                ) : (
                  appState.blocks.map(b => (
                    <div key={b.id} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#1a2030', borderRadius: 6, border: '1px solid #2a3a5a'}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                        <i className="fa-solid fa-shapes" style={{color: '#4a9eff'}}></i>
                        <span style={{color: '#e0e8f0', fontSize: 13, fontWeight: 500}}>{b.name}</span>
                        <span style={{color: '#5568A0', fontSize: 11}}>({b.elements.length} эл.)</span>
                      </div>
                      <button 
                        onClick={() => startInsertBlock(b)}
                        style={{padding: '4px 12px', background: 'transparent', color: '#4a9eff', border: '1px solid #4a9eff', borderRadius: 4, cursor: 'pointer', fontSize: 12}}
                      >
                        Вставить
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
