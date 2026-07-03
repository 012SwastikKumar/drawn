import React, { useRef, useEffect, useState } from 'react';
import { Stroke, Point, Player } from '../types.js';
import { Trash2, RotateCcw, Paintbrush, Eraser, Minus, Square, Circle, PaintBucket } from 'lucide-react';

interface DrawingCanvasProps {
  isDrawer: boolean;
  strokes: Stroke[];
  onDrawStroke: (stroke: Stroke) => void;
  onClearCanvas: () => void;
  onUndoStroke: () => void;
  isPip?: boolean;
  players?: Record<string, Player>;
  playerId?: string;
}

const BRUSH_COLORS = [
  '#000000', // Black
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#78350f', // Brown
  '#ffffff', // White (eraser)
];

const BRUSH_SIZES = [
  { label: 'S', value: 3 },
  { label: 'M', value: 8 },
  { label: 'L', value: 16 },
  { label: 'XL', value: 28 },
];

// High-speed queue-based flood fill algorithm with anti-alias color threshold tolerance
function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColorStr: string,
  width: number,
  height: number
) {
  // Convert fillColorStr (like #ef4444) to RGBA
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = 1;
  tempCanvas.height = 1;
  const tempCtx = tempCanvas.getContext('2d');
  if (!tempCtx) return;
  tempCtx.fillStyle = fillColorStr;
  tempCtx.fillRect(0, 0, 1, 1);
  const targetRGBA = tempCtx.getImageData(0, 0, 1, 1).data; // [R, G, B, A]

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const x = Math.floor(startX);
  const y = Math.floor(startY);
  if (x < 0 || x >= width || y < 0 || y >= height) return;

  const startPos = (y * width + x) * 4;
  const startR = data[startPos];
  const startG = data[startPos + 1];
  const startB = data[startPos + 2];
  const startA = data[startPos + 3];

  // If start color is already the target color, do nothing
  if (
    Math.abs(startR - targetRGBA[0]) < 10 &&
    Math.abs(startG - targetRGBA[1]) < 10 &&
    Math.abs(startB - targetRGBA[2]) < 10 &&
    Math.abs(startA - targetRGBA[3]) < 10
  ) {
    return;
  }

  // Pre-allocated flat queue arrays for optimal frame-rate performance
  const queueX = new Int32Array(width * height);
  const queueY = new Int32Array(width * height);
  const visited = new Uint8Array(width * height);

  let head = 0;
  let tail = 0;

  queueX[tail] = x;
  queueY[tail] = y;
  visited[y * width + x] = 1;
  tail++;

  while (head < tail) {
    const cx = queueX[head];
    const cy = queueY[head];
    head++;

    const idx = cy * width + cx;
    const pos = idx * 4;

    // Fill the current pixel
    data[pos] = targetRGBA[0];
    data[pos + 1] = targetRGBA[1];
    data[pos + 2] = targetRGBA[2];
    data[pos + 3] = targetRGBA[3];

    // Check 4-way neighbors
    const neighbors = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1]
    ];

    for (let i = 0; i < neighbors.length; i++) {
      const nx = neighbors[i][0];
      const ny = neighbors[i][1];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nIdx = ny * width + nx;
        if (!visited[nIdx]) {
          const nPos = nIdx * 4;
          const nr = data[nPos];
          const ng = data[nPos + 1];
          const nb = data[nPos + 2];
          const na = data[nPos + 3];

          // Compute color distance to starting pixel color (with anti-alias tolerance)
          const diff = Math.abs(nr - startR) +
                       Math.abs(ng - startG) +
                       Math.abs(nb - startB) +
                       Math.abs(na - startA);

          if (diff < 96) {
            visited[nIdx] = 1;
            queueX[tail] = nx;
            queueY[tail] = ny;
            tail++;
          }
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

export default function DrawingCanvas({
  isDrawer,
  strokes,
  onDrawStroke,
  onClearCanvas,
  onUndoStroke,
  isPip = false,
  players,
  playerId,
}: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentSize, setCurrentSize] = useState(8);
  const [currentTool, setCurrentTool] = useState<'brush' | 'line' | 'rect' | 'circle' | 'fill'>('brush');
  const [tempEndPoint, setTempEndPoint] = useState<Point | null>(null);

  const currentStrokeRef = useRef<Point[]>([]);
  const currentStrokeIdRef = useRef<string>('');
  const lastSentTimeRef = useRef<number>(0);
  const [dimensions, setDimensions] = useState({ width: 600, height: 450 });

  // Define layout states to show the leaderboard dynamically in empty areas
  const [showLeftLeaderboard, setShowLeftLeaderboard] = useState(false);
  const [showTopLeaderboard, setShowTopLeaderboard] = useState(false);

  // Handle resizing using ResizeObserver for fluid, responsive dimensions with locked aspect ratio
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        
        // Enforce a strict 4:3 aspect ratio across all screen sizes
        const ASPECT_RATIO = 4 / 3;
        const containerWidth = width || 300;
        const containerHeight = height || 225;
        
        let targetWidth = containerWidth;
        let targetHeight = containerWidth / ASPECT_RATIO;
        
        if (targetHeight > containerHeight) {
          targetHeight = containerHeight;
          targetWidth = containerHeight * ASPECT_RATIO;
        }
        
        // Clamp to sensible minimum boundaries (lower limits for PiP mode to avoid cropping)
        const minW = isPip ? 80 : 240;
        const minH = isPip ? 60 : 180;
        targetWidth = Math.max(targetWidth, minW);
        targetHeight = Math.max(targetHeight, minH);
        
        setDimensions({ width: targetWidth, height: targetHeight });

        // Calculate available empty space around the centered 4:3 canvas (only in normal view)
        if (!isPip) {
          const leftSpace = (containerWidth - targetWidth) / 2;
          const bottomSpace = (containerHeight - targetHeight) / 2;

          setShowLeftLeaderboard(leftSpace >= 150);
          setShowTopLeaderboard(leftSpace < 150 && bottomSpace >= 80);
        } else {
          setShowLeftLeaderboard(false);
          setShowTopLeaderboard(false);
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [isPip]);

  // Redraw the canvas whenever strokes, dimensions or temporary states change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous frame
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // Set brush round lines
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw all completed synced strokes in chronological order
    strokes.forEach((stroke) => {
      if (stroke.points.length < 1) return;

      ctx.beginPath();
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.thickness * (dimensions.width / 600);

      const type = stroke.type || 'brush';

      if (type === 'fill') {
        const startPt = stroke.points[0];
        const px = Math.floor(startPt.x * dimensions.width);
        const py = Math.floor(startPt.y * dimensions.height);
        floodFill(ctx, px, py, stroke.color, dimensions.width, dimensions.height);
      } else if (type === 'line' && stroke.points.length >= 2) {
        const p1 = stroke.points[0];
        const p2 = stroke.points[stroke.points.length - 1];
        ctx.moveTo(p1.x * dimensions.width, p1.y * dimensions.height);
        ctx.lineTo(p2.x * dimensions.width, p2.y * dimensions.height);
        ctx.stroke();
      } else if (type === 'rect' && stroke.points.length >= 2) {
        const p1 = stroke.points[0];
        const p2 = stroke.points[stroke.points.length - 1];
        const x1 = p1.x * dimensions.width;
        const y1 = p1.y * dimensions.height;
        const x2 = p2.x * dimensions.width;
        const y2 = p2.y * dimensions.height;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      } else if (type === 'circle' && stroke.points.length >= 2) {
        const p1 = stroke.points[0];
        const p2 = stroke.points[stroke.points.length - 1];
        const x1 = p1.x * dimensions.width;
        const y1 = p1.y * dimensions.height;
        const x2 = p2.x * dimensions.width;
        const y2 = p2.y * dimensions.height;
        const radius = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        ctx.arc(x1, y1, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else {
        const firstPoint = stroke.points[0];
        ctx.moveTo(firstPoint.x * dimensions.width, firstPoint.y * dimensions.height);

        for (let i = 1; i < stroke.points.length; i++) {
          const p = stroke.points[i];
          ctx.lineTo(p.x * dimensions.width, p.y * dimensions.height);
        }
        ctx.stroke();
      }
    });

    // Render active temporary shape preview or active brush stroke for drawer if dragging
    if (isDrawing && currentStrokeRef.current.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = currentSize * (dimensions.width / 600);

      if (currentTool === 'brush') {
        const firstPoint = currentStrokeRef.current[0];
        ctx.moveTo(firstPoint.x * dimensions.width, firstPoint.y * dimensions.height);
        for (let i = 1; i < currentStrokeRef.current.length; i++) {
          const p = currentStrokeRef.current[i];
          ctx.lineTo(p.x * dimensions.width, p.y * dimensions.height);
        }
        ctx.stroke();
      } else if (tempEndPoint) {
        const p1 = currentStrokeRef.current[0];
        const p2 = tempEndPoint;

        if (currentTool === 'line') {
          ctx.moveTo(p1.x * dimensions.width, p1.y * dimensions.height);
          ctx.lineTo(p2.x * dimensions.width, p2.y * dimensions.height);
          ctx.stroke();
        } else if (currentTool === 'rect') {
          const x1 = p1.x * dimensions.width;
          const y1 = p1.y * dimensions.height;
          const x2 = p2.x * dimensions.width;
          const y2 = p2.y * dimensions.height;
          ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        } else if (currentTool === 'circle') {
          const x1 = p1.x * dimensions.width;
          const y1 = p1.y * dimensions.height;
          const x2 = p2.x * dimensions.width;
          const y2 = p2.y * dimensions.height;
          const radius = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
          ctx.arc(x1, y1, radius, 0, 2 * Math.PI);
          ctx.stroke();
        }
      }
    }
  }, [strokes, dimensions, tempEndPoint, currentTool, isDrawing, currentColor, currentSize]);

  // Helper to extract normalized coordinates from pointer/touch events
  const getNormalizedCoordinates = (e: React.MouseEvent | React.TouchEvent): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    // Cap boundaries to [0, 1]
    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  };

  // Drawing event triggers (Only active if user is currently the drawer)
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawer) return;
    e.preventDefault();

    const pt = getNormalizedCoordinates(e);
    if (!pt) return;

    if (currentTool === 'fill') {
      const strokeId = Math.random().toString(36).substring(2, 9);
      const fillStroke: Stroke = {
        id: strokeId,
        points: [pt],
        color: currentColor,
        thickness: currentSize,
        type: 'fill',
      };
      onDrawStroke(fillStroke);
      return;
    }

    setIsDrawing(true);
    const strokeId = Math.random().toString(36).substring(2, 9);
    currentStrokeIdRef.current = strokeId;
    currentStrokeRef.current = [pt];
    setTempEndPoint(pt);
    lastSentTimeRef.current = Date.now();

    // Highlight active brush stroke immediately locally
    if (currentTool === 'brush') {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.beginPath();
          ctx.strokeStyle = currentColor;
          ctx.lineWidth = currentSize * (dimensions.width / 600);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.moveTo(pt.x * dimensions.width, pt.y * dimensions.height);
        }
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawer || !isDrawing) return;
    e.preventDefault();

    const pt = getNormalizedCoordinates(e);
    if (!pt) return;

    if (currentTool === 'brush') {
      const lastPt = currentStrokeRef.current[currentStrokeRef.current.length - 1];
      currentStrokeRef.current.push(pt);

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx && lastPt) {
          ctx.beginPath();
          ctx.strokeStyle = currentColor;
          ctx.lineWidth = currentSize * (dimensions.width / 600);
          ctx.moveTo(lastPt.x * dimensions.width, lastPt.y * dimensions.height);
          ctx.lineTo(pt.x * dimensions.width, pt.y * dimensions.height);
          ctx.stroke();
        }
      }

      // Smooth real-time update: send progress stroke every 60ms
      const now = Date.now();
      if (now - lastSentTimeRef.current > 60) {
        lastSentTimeRef.current = now;
        const progressStroke: Stroke = {
          id: currentStrokeIdRef.current,
          points: [...currentStrokeRef.current],
          color: currentColor,
          thickness: currentSize,
          type: 'brush',
        };
        onDrawStroke(progressStroke);
      }
    } else {
      setTempEndPoint(pt);

      // Dynamically broadcast the dragging shapes in real-time to other peers
      const now = Date.now();
      if (now - lastSentTimeRef.current > 60) {
        lastSentTimeRef.current = now;
        const progressStroke: Stroke = {
          id: currentStrokeIdRef.current,
          points: [currentStrokeRef.current[0], pt],
          color: currentColor,
          thickness: currentSize,
          type: currentTool,
        };
        onDrawStroke(progressStroke);
      }
    }
  };

  const stopDrawing = () => {
    if (!isDrawer || !isDrawing) return;
    setIsDrawing(false);

    if (currentStrokeRef.current.length > 0) {
      const finalPoints = currentTool === 'brush'
        ? [...currentStrokeRef.current]
        : [currentStrokeRef.current[0], tempEndPoint || currentStrokeRef.current[0]];

      const finalStroke: Stroke = {
        id: currentStrokeIdRef.current,
        points: finalPoints,
        color: currentColor,
        thickness: currentSize,
        type: currentTool,
      };
      onDrawStroke(finalStroke);
      currentStrokeRef.current = [];
      setTempEndPoint(null);
    }
  };

  const cursorSize = Math.max(16, currentSize);
  const halfSize = cursorSize / 2;
  const escapedColor = currentColor.startsWith('#') ? `%23${currentColor.slice(1)}` : currentColor;
  const cursorStyle = isDrawer
    ? {
        cursor: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${cursorSize}' height='${cursorSize}' viewBox='0 0 ${cursorSize} ${cursorSize}' fill='none'><circle cx='${halfSize}' cy='${halfSize}' r='${Math.max(1, currentSize / 2 - 0.5)}' stroke='white' stroke-width='1.5'/><circle cx='${halfSize}' cy='${halfSize}' r='${Math.max(1, currentSize / 2 - 1)}' stroke='${escapedColor}' stroke-width='1'/><circle cx='${halfSize}' cy='${halfSize}' r='1' fill='${escapedColor}'/></svg>") ${halfSize} ${halfSize}, crosshair`
      }
    : { cursor: 'not-allowed' };

  return (
    <div className="flex flex-col h-full gap-2 sm:gap-3" id="canvas-container-root">
      {/* Interactive drawing utility panel (Only displayed for drawer when not in PiP mode) */}
      {isDrawer && !isPip && (
        <div className="flex flex-col gap-2 p-2 bg-slate-50 border border-slate-200/80 rounded-2xl shadow-xs text-slate-700 w-full animate-fade-in order-2 sm:order-1" id="canvas-palette-bar">
          
          {/* ROW 1: Action Inputs (Tools + Board Commands) */}
          <div className="flex items-center justify-between gap-3 w-full flex-wrap sm:flex-nowrap">
            
            {/* Left: Unified Tools Segmented Control */}
            <div className="flex items-center bg-white border border-slate-200/80 rounded-xl p-1 gap-1 shadow-2xs" id="drawing-tools-switcher">
              <button
                onClick={() => {
                  setCurrentTool('brush');
                  if (currentColor === '#ffffff') {
                    setCurrentColor('#000000');
                  }
                }}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  currentTool === 'brush' && currentColor !== '#ffffff'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
                title="Pencil / Freehand Brush"
                aria-label="Brush tool"
              >
                <Paintbrush className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setCurrentTool('line');
                  if (currentColor === '#ffffff') setCurrentColor('#000000');
                }}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  currentTool === 'line'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
                title="Draw Straight Line"
                aria-label="Line tool"
              >
                <Minus className="w-3.5 h-3.5 rotate-45" />
              </button>
              <button
                onClick={() => {
                  setCurrentTool('rect');
                  if (currentColor === '#ffffff') setCurrentColor('#000000');
                }}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  currentTool === 'rect'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
                title="Draw Rectangle"
                aria-label="Rectangle tool"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setCurrentTool('circle');
                  if (currentColor === '#ffffff') setCurrentColor('#000000');
                }}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  currentTool === 'circle'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
                title="Draw Circle"
                aria-label="Circle tool"
              >
                <Circle className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setCurrentTool('fill');
                  if (currentColor === '#ffffff') setCurrentColor('#000000');
                }}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  currentTool === 'fill'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
                title="Paint Bucket (Flood Fill Area)"
                aria-label="Paint bucket fill tool"
              >
                <PaintBucket className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setCurrentTool('brush');
                  setCurrentColor('#ffffff'); // white acts as eraser
                }}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  currentColor === '#ffffff' && currentTool === 'brush'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
                title="Eraser Tool"
                aria-label="Eraser tool"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Right: Board Commands (Undo / Clear Canvas) */}
            <div className="flex items-center gap-2" id="canvas-actions-bar">
              <button
                onClick={onUndoStroke}
                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 bg-white rounded-xl transition-all cursor-pointer shadow-3xs flex items-center justify-center gap-1 text-[10px] font-bold px-2.5 active:scale-95"
                title="Undo last stroke"
                aria-label="Undo last stroke"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">UNDO</span>
              </button>
              <button
                onClick={onClearCanvas}
                className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-100 bg-white rounded-xl transition-all cursor-pointer shadow-3xs flex items-center justify-center gap-1 text-[10px] font-bold px-2.5 active:scale-95"
                title="Clear Board"
                aria-label="Clear drawing canvas"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden xs:inline text-red-650">CLEAR</span>
              </button>
            </div>
          </div>

          {/* ROW 2: Style Attributes (Colors Palette + Brush Sizes) */}
          <div className="flex items-center justify-between gap-3 w-full flex-wrap sm:flex-nowrap border-t border-slate-200/60 pt-2">
            
            {/* Left: Swatches selection grid */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5" id="color-palette-selection">
              {BRUSH_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => {
                    setCurrentColor(color);
                    if (color === '#ffffff') {
                      setCurrentTool('brush');
                    }
                  }}
                  style={{ backgroundColor: color }}
                  className={`w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-full border shadow-3xs transition-all active:scale-90 cursor-pointer flex items-center justify-center ${
                    currentColor === color
                      ? 'scale-125 border-2 border-slate-750 shadow-md z-10'
                      : 'border-slate-200 hover:scale-110 hover:shadow-2xs'
                  }`}
                  title={color === '#ffffff' ? 'Eraser Color' : `Color ${color}`}
                  aria-label={`Select ${color === '#ffffff' ? 'eraser' : `color ${color}`}`}
                >
                  {/* Selected Color Indicator Dot */}
                  {currentColor === color && (
                    <span className={`w-1.5 h-1.5 rounded-full ${color === '#ffffff' ? 'bg-slate-600' : 'bg-white'} shadow-xs`} />
                  )}
                </button>
              ))}

              {/* Beautiful Custom Color Gradient Picker */}
              <div className="relative flex items-center justify-center shrink-0">
                <button
                  onClick={() => document.getElementById('gradient-color-input')?.click()}
                  className={`w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-full border transition-all active:scale-90 cursor-pointer hover:scale-110 flex items-center justify-center ${
                    !BRUSH_COLORS.includes(currentColor)
                      ? 'scale-125 border-2 border-slate-750 shadow-md z-10'
                      : 'border-slate-200 shadow-3xs'
                  }`}
                  style={{
                    background: 'conic-gradient(from 180deg at 50% 50%, #ff0000 0deg, #ffff00 60deg, #00ff00 120deg, #00ffff 180deg, #0000ff 240deg, #ff00ff 300deg, #ff0000 360deg)'
                  }}
                  title="Custom Color"
                  aria-label="Custom Color Spectrum"
                >
                  {/* Selected Custom Color Indicator Dot */}
                  {!BRUSH_COLORS.includes(currentColor) && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
                  )}
                </button>
                <input
                  type="color"
                  id="gradient-color-input"
                  value={currentColor}
                  onChange={(e) => {
                    setCurrentColor(e.target.value);
                    if (currentTool === 'fill') {
                      // Keep fill tool
                    } else if (currentColor === '#ffffff') {
                      setCurrentTool('brush');
                    }
                  }}
                  className="sr-only absolute w-0 h-0 opacity-0"
                />
              </div>
            </div>

            {/* Right: Brush Sizing Segment controller */}
            <div className="flex items-center gap-1 shrink-0" id="brush-size-selection">
              {currentTool !== 'fill' ? (
                <div className="flex items-center bg-slate-200/50 border border-slate-250/70 rounded-xl p-0.5 gap-0.5 shadow-3xs" id="size-segmented-control">
                  {BRUSH_SIZES.map((size) => {
                    return (
                      <button
                        key={size.value}
                        onClick={() => setCurrentSize(size.value)}
                        className={`px-2.5 py-0.5 text-[9px] font-black uppercase rounded-lg transition-all cursor-pointer ${
                          currentSize === size.value
                            ? 'bg-brand-primary text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                        aria-label={`Brush size ${size.value} pixels`}
                        title={`Size ${size.value}px`}
                      >
                        {`${size.value}px`}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider px-1 bg-slate-100 rounded-lg py-0.5 border border-slate-200">FILL MODE</span>
              )}
            </div>

          </div>

        </div>
      )}

      {/* Actual Drawing Board Surface Frame */}
      <div
        ref={containerRef}
        style={cursorStyle}
        className={`relative flex-1 bg-slate-100 border border-slate-200 rounded-2xl shadow-drawn-sm overflow-hidden order-1 sm:order-2 ${
          isPip ? 'min-h-0' : 'min-h-[300px]'
        }`}
        id="canvas-drawing-wrapper"
      >
        <canvas
          ref={canvasRef}
          width={dimensions.width}
          height={dimensions.height}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{
            ...cursorStyle,
            width: `${dimensions.width}px`,
            height: `${dimensions.height}px`,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundImage: isPip ? 'none' : 'radial-gradient(#e2e8f0 1.5px, transparent 1.5px)',
            backgroundSize: '24px 24px',
          }}
          className="absolute block touch-none bg-white shadow-drawn-lg rounded-xl border border-slate-200"
          id="drawing-board-canvas"
        />

        {/* Guesser Mode Overlays */}
        {!isDrawer && !isPip && (
          <div className={`absolute left-3 flex items-center gap-1.5 px-3 py-1.5 bg-white/95 text-brand-primary text-[10px] font-black uppercase tracking-widest rounded-full border border-indigo-100 shadow-drawn-md backdrop-blur-xs select-none pointer-events-none animate-pulse ${showTopLeaderboard ? 'top-14' : 'top-3'}`} id="canvas-guesser-badge">
            <Paintbrush className="w-3.5 h-3.5" />
            <span>Watching Drawer...</span>
          </div>
        )}

        {/* Left Always-On Sidebar Leaderboard (Only shown if space permits) */}
        {!isPip && players && showLeftLeaderboard && (
          <div className="absolute left-3 top-3 bottom-3 w-32 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-xl p-2 shadow-drawn-sm flex flex-col z-20 animate-fade-in text-slate-800" id="canvas-left-leaderboard">
            <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest text-center border-b border-slate-100 pb-1 mb-1.5">
              Rankings
            </span>
            <div className="flex-1 overflow-y-auto space-y-1 scrollbar-none pr-0.5">
              {Object.values(players)
                .sort((a, b) => {
                  if (b.score !== a.score) return b.score - a.score;
                  return a.name.localeCompare(b.name);
                })
                .map((p) => {
                  const isSelf = p.id === playerId;
                  const higherScoringCount = Object.values(players).filter((other) => other.score > p.score).length;
                  const rank = higherScoringCount + 1;
                  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between p-1 rounded-lg text-[9px] border ${
                        isSelf ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50/50 border-slate-150'
                      } ${p.disconnected ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center gap-1 truncate max-w-[70%]">
                        <span className="shrink-0">{medal}</span>
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="font-extrabold truncate uppercase tracking-wide leading-none">{p.name}</span>
                      </div>
                      <span className="font-mono font-black text-indigo-650 shrink-0">{p.score}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Top Always-On Strip Leaderboard (Only shown if space permits in mobile/vertical layouts) */}
        {!isPip && players && showTopLeaderboard && (
          <div className="absolute top-2.5 left-2.5 right-2.5 h-10 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-xl p-1.5 shadow-drawn-sm flex items-center justify-start gap-1.5 z-20 animate-fade-in text-slate-800 overflow-x-auto scrollbar-none" id="canvas-top-leaderboard">
            <span className="text-[7.5px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-200 pr-1.5 mr-0.5 shrink-0 leading-none">
              Rankings
            </span>
            <div className="flex items-center gap-1.5 min-w-0">
              {Object.values(players)
                .sort((a, b) => {
                  if (b.score !== a.score) return b.score - a.score;
                  return a.name.localeCompare(b.name);
                })
                .map((p) => {
                  const isSelf = p.id === playerId;
                  const higherScoringCount = Object.values(players).filter((other) => other.score > p.score).length;
                  const rank = higherScoringCount + 1;
                  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[9px] border shrink-0 ${
                        isSelf ? 'bg-indigo-50 border-indigo-200' : 'bg-slate-50/50 border-slate-150'
                      } ${p.disconnected ? 'opacity-50' : ''}`}
                    >
                      <span>{medal}</span>
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      <span className="font-extrabold uppercase tracking-wide max-w-[40px] truncate leading-none">{p.name}</span>
                      <span className="font-mono font-black text-indigo-650 leading-none">{p.score}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
