import { useEffect, useRef, useState, useCallback } from 'react';
import { Canvas, PencilBrush, Circle, Rect, IText, classRegistry } from 'fabric';
import io from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid'; // npm install uuid

const SOCKET_SERVER_URL = 'http://localhost:4000';

export default function Whiteboard({
    roomId,
    password = '',
    role = 'editor',
    username = 'Guest'
}) {
    const canvasRef = useRef(null);
    const [canvas, setCanvas] = useState(null);
    const socketRef = useRef(null);

    // Tool state
    const [tool, setTool] = useState('pen');
    const [color, setColor] = useState('#000000');
    const [fontSize, setFontSize] = useState(24);
    const [fontFamily, setFontFamily] = useState('Arial');
    const [history, setHistory] = useState([]);
    const [redoStack, setRedoStack] = useState([]);

    // Use refs for socket handlers
    const historyRef = useRef(history);
    const redoStackRef = useRef(redoStack);
    const roomIdRef = useRef(roomId);

    useEffect(() => {
        historyRef.current = history;
        redoStackRef.current = redoStack;
        roomIdRef.current = roomId;
    }, [history, redoStack, roomId]);

    // Initialize Fabric.js canvas
    useEffect(() => {
        const fabricCanvas = new Canvas(canvasRef.current, {
            isDrawingMode: true,
            width: 800,
            height: 600,
            backgroundColor: '#fff'
        });

        // Initialize brush
        fabricCanvas.freeDrawingBrush = new PencilBrush(fabricCanvas);
        fabricCanvas.freeDrawingBrush.color = color;
        fabricCanvas.freeDrawingBrush.width = 2;

        setHistory([fabricCanvas.toJSON()]);
        setCanvas(fabricCanvas);

        return () => {
            fabricCanvas.dispose();
        };
    }, []);

    // Assign unique IDs to new objects
    useEffect(() => {
        if (!canvas) return;
        const assignId = (e) => {
            if (!e.target.id) {
                e.target.id = uuidv4();
            }
        };
        canvas.on('object:added', assignId);
        return () => {
            canvas.off('object:added', assignId);
        };
    }, [canvas]);

    // Update brush when tool/color changes
    useEffect(() => {
        if (!canvas) return;

        switch (tool) {
            case 'pen':
                canvas.isDrawingMode = true;
                canvas.freeDrawingBrush = new PencilBrush(canvas);
                canvas.freeDrawingBrush.color = color;
                canvas.freeDrawingBrush.width = 2;
                canvas.selection = true;
                canvas.forEachObject(obj => {
                    obj.selectable = true;
                    obj.evented = true;
                });
                canvas.defaultCursor = 'default';
                break;
            case 'eraser':
                canvas.isDrawingMode = false;
                canvas.selection = false;
                canvas.forEachObject(obj => {
                    obj.selectable = false;
                    obj.evented = true;
                });
                canvas.defaultCursor = 'pointer';
                break;
            case 'text':
                canvas.isDrawingMode = false;
                canvas.selection = true;
                canvas.forEachObject(obj => {
                    obj.selectable = true;
                    obj.evented = true;
                });
                canvas.defaultCursor = 'text';
                break;
            default:
                canvas.isDrawingMode = false;
        }
    }, [tool, color, canvas]);

    // Handle eraser clicks
    useEffect(() => {
        if (!canvas || tool !== 'eraser') return;

        const handleEraserClick = (e) => {
            const target = e.target;
            if (target) {
                // Emit remove event
                socketRef.current.emit('object:removed', { roomId, id: target.id });
                canvas.remove(target);
                canvas.discardActiveObject();
                canvas.requestRenderAll();
            }
        };

        canvas.on('mouse:down', handleEraserClick);
        return () => {
            canvas.off('mouse:down', handleEraserClick);
        };
    }, [canvas, tool]);

    // Handle text tool clicks
    useEffect(() => {
        if (!canvas || tool !== 'text') return;

        const handleTextClick = (e) => {
            if (e.target) return;
            const text = new IText('Type here...', {
                left: e.absolutePointer.x,
                top: e.absolutePointer.y,
                fontSize,
                fill: color,
                fontFamily,
                padding: 8,
                borderColor: '#4a90e2',
                cornerColor: '#4a90e2',
                cornerSize: 10,
                transparentCorners: false,
                id: uuidv4()
            });
            canvas.add(text);
            canvas.setActiveObject(text);
            text.enterEditing();
            text.selectAll();
            canvas.requestRenderAll();
            // Emit add event
            socketRef.current.emit('object:added', { roomId, obj: text.toObject(['id']) });
        };

        canvas.on('mouse:down', handleTextClick);
        return () => {
            canvas.off('mouse:down', handleTextClick);
        };
    }, [canvas, tool, color, fontSize, fontFamily]);

    // Update active text properties when style changes
    useEffect(() => {
        if (!canvas || tool !== 'text') return;

        const activeObject = canvas.getActiveObject();
        if (activeObject && activeObject.type === 'i-text') {
            activeObject.set({
                fill: color,
                fontSize,
                fontFamily
            });
            canvas.requestRenderAll();
        }
    }, [color, fontSize, fontFamily, canvas, tool]);

    // Socket.IO setup
    useEffect(() => {
        if (!canvas) return;

        socketRef.current = io(SOCKET_SERVER_URL);
        socketRef.current.emit('join-room', {
            roomId,
            password,
            role,
            username,
        });

        socketRef.current.on('room-joined', (data) => { });
        socketRef.current.on('access-denied', (msg) => {
            alert(msg);
        });

        // Add object
        socketRef.current.on('object:added', async ({ obj }) => {
            try {
                canvas._isRemote = true;
                const klass = classRegistry.getClass(obj.type);
                if (!klass) {
                    console.warn(`Unknown fabric object type: ${obj.type}`);
                    return;
                }
                const fabricObj = await klass.fromObject(obj);

                if (!canvas.getObjects().some(o => o.id === fabricObj.id)) {
                    canvas.add(fabricObj);
                }

            } catch (err) {
                console.error('Error restoring object:', err);
            } finally {
                canvas._isRemote = false;
            }
        });




        // Modify object
        socketRef.current.on('object:modified', ({ obj }) => {
            canvas._isRemote = true;
            const target = canvas.getObjects().find(o => o.id === obj.id);
            if (target) {
                target.set(obj);
                target.setCoords();
                canvas.renderAll();
            }
            canvas._isRemote = false;
        });

        // Remove object
        socketRef.current.on('object:removed', ({ id }) => {
            canvas._isRemote = true;
            const target = canvas.getObjects().find(o => o.id === id);
            if (target) {
                canvas.remove(target);
            }
            canvas._isRemote = false;
        });

        // When joining, load full canvas state
        socketRef.current.on('drawing', (data) => {
            canvas._isRemote = true;
            canvas.loadFromJSON(data, () => {
                canvas.renderAll();
                canvas._isRemote = false;
            });
        });

        return () => {
            socketRef.current.disconnect();
        };
    }, [canvas, roomId, password, role, username]);

    // Emit add/modify/remove events for objects
    useEffect(() => {
        if (!canvas) return;

        const emitAdded = (e) => {
            if (canvas._isRemote) return;
            socketRef.current.emit('object:added', { roomId, obj: e.target.toObject(['id']) });
        };
        const emitModified = (e) => {
            if (canvas._isRemote) return;
            socketRef.current.emit('object:modified', { roomId, obj: e.target.toObject(['id']) });
        };
        const emitRemoved = (e) => {
            if (canvas._isRemote) return;
            socketRef.current.emit('object:removed', { roomId, id: e.target.id });
        };

        canvas.on('object:added', emitAdded);
        canvas.on('object:modified', emitModified);
        canvas.on('object:removed', emitRemoved);

        return () => {
            canvas.off('object:added', emitAdded);
            canvas.off('object:modified', emitModified);
            canvas.off('object:removed', emitRemoved);
        };
    }, [canvas, roomId]);

    // Tool change handler
    const handleToolChange = (newTool) => {
        if (canvas && canvas.getActiveObject()?.isEditing) {
            canvas.getActiveObject().exitEditing();
        }
        setTool(newTool);
    };

    // Stable undo/redo handlers with refs
    const handleUndo = useCallback((remote = false) => {
        if (historyRef.current.length > 1) {
            // Capture current state BEFORE loading previous state
            const currentState = historyRef.current[historyRef.current.length - 1];
            const prevState = historyRef.current[historyRef.current.length - 2];

            if (canvas) {
                canvas._isRemote = true;
                canvas.loadFromJSON(prevState, () => {
                    canvas.renderAll();

                    // Update history and redo stack
                    const newHistory = historyRef.current.slice(0, -1);
                    const newRedoStack = [currentState, ...redoStackRef.current];

                    setHistory(newHistory);
                    setRedoStack(newRedoStack);
                    canvas._isRemote = false;
                });
            }
        }

        if (!remote && socketRef.current) {
            socketRef.current.emit('canvas-action', {
                roomId: roomIdRef.current,
                action: 'undo'
            });
        }
    }, [canvas]);

    const handleRedo = useCallback((remote = false) => {
        if (redoStackRef.current.length > 0) {
            const nextState = redoStackRef.current[0];

            if (canvas) {
                canvas._isRemote = true;
                canvas.loadFromJSON(nextState, () => {
                    canvas.renderAll();

                    // Update state
                    const newHistory = [...historyRef.current, nextState];
                    const newRedoStack = redoStackRef.current.slice(1);

                    setHistory(newHistory);
                    setRedoStack(newRedoStack);
                    canvas._isRemote = false;
                });
            }
        }

        if (!remote && socketRef.current) {
            socketRef.current.emit('canvas-action', {
                roomId: roomIdRef.current,
                action: 'redo'
            });
        }
    }, [canvas]);

    const handleClear = useCallback((remote = false) => {
        if (canvas) {
            // Set flag to skip history saving during clear
            canvas._isClearing = true;

            canvas.clear();
            canvas.backgroundColor = '#fff';

            // Save cleared state to history
            const clearedState = canvas.toJSON();
            const newHistory = [...historyRef.current, clearedState];

            setHistory(newHistory);
            setRedoStack([]);

            // Reset flag after clear
            canvas._isClearing = false;

            if (!remote && socketRef.current) {
                socketRef.current.emit('canvas-action', {
                    roomId: roomIdRef.current,
                    action: 'clear'
                });
            }
        }
    }, [canvas]);

    // Add shapes with unique IDs
    const addRectangle = () => {
        handleToolChange('select');
        if (canvas) {
            const rect = new Rect({
                fill: color,
                width: 100,
                height: 100,
                left: canvas.width / 2 - 50,
                top: canvas.height / 2 - 50,
                id: uuidv4()
            });
            canvas.add(rect);
            // Emit add event
            socketRef.current.emit('object:added', { roomId, obj: rect.toObject(['id']) });
            canvas.renderAll();
        }
    };

    const addCircle = () => {
        handleToolChange('select');
        if (canvas) {
            const circle = new Circle({
                fill: color,
                radius: 50,
                left: canvas.width / 2,
                top: canvas.height / 2,
                id: uuidv4()
            });
            canvas.add(circle);
            // Emit add event
            socketRef.current.emit('object:added', { roomId, obj: circle.toObject(['id']) });
            canvas.renderAll();
        }
    };

    return (
        <div className="flex flex-col items-center min-h-screen bg-gray-100 py-8">
            <div className="toolbar flex flex-wrap gap-3 mb-6 bg-white rounded shadow p-4">
                {/* Drawing Tools */}
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => handleToolChange('pen')}
                        className={`px-4 py-2 rounded transition ${tool === 'pen'
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                    >
                        Pen
                    </button>
                    <button
                        onClick={() => handleToolChange('eraser')}
                        className={`px-4 py-2 rounded transition ${tool === 'eraser'
                            ? 'bg-gray-600 text-white'
                            : 'bg-gray-500 text-white hover:bg-gray-600'
                            }`}
                    >
                        Eraser
                    </button>
                    <button
                        onClick={() => handleToolChange('text')}
                        className={`px-4 py-2 rounded transition ${tool === 'text'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-indigo-500 text-white hover:bg-indigo-600'
                            }`}
                    >
                        Text
                    </button>
                    <button
                        onClick={addRectangle}
                        className="px-4 py-2 rounded bg-green-500 text-white hover:bg-green-600 transition"
                    >
                        Rectangle
                    </button>
                    <button
                        onClick={addCircle}
                        className="px-4 py-2 rounded bg-yellow-500 text-white hover:bg-yellow-600 transition"
                    >
                        Circle
                    </button>
                </div>

                {/* Color Picker */}
                <div className="flex items-center gap-2">
                    <label className="text-gray-700">Color</label>
                    <input
                        type="color"
                        value={color}
                        onChange={e => setColor(e.target.value)}
                        className="w-8 h-8 border-0 p-0 bg-transparent"
                    />
                </div>

                {/* Text Controls */}
                {tool === 'text' && (
                    <div className="flex items-center gap-3">
                        <label className="text-gray-700">Font</label>
                        <select
                            value={fontFamily}
                            onChange={e => setFontFamily(e.target.value)}
                            className="border rounded px-2 py-1"
                        >
                            <option value="Arial">Arial</option>
                            <option value="Verdana">Verdana</option>
                            <option value="Georgia">Georgia</option>
                            <option value="Times New Roman">Times New Roman</option>
                            <option value="Courier New">Courier New</option>
                        </select>

                        <label className="text-gray-700">Size</label>
                        <select
                            value={fontSize}
                            onChange={e => setFontSize(Number(e.target.value))}
                            className="border rounded px-2 py-1"
                        >
                            <option value={12}>12</option>
                            <option value={18}>18</option>
                            <option value={24}>24</option>
                            <option value={32}>32</option>
                            <option value={48}>48</option>
                            <option value={64}>64</option>
                        </select>
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={handleUndo}
                        disabled={history.length <= 1}
                        className={`px-4 py-2 rounded transition ${history.length <= 1
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-purple-500 hover:bg-purple-600 text-white'
                            }`}
                    >
                        Undo
                    </button>
                    <button
                        onClick={handleRedo}
                        disabled={redoStack.length === 0}
                        className={`px-4 py-2 rounded transition ${redoStack.length === 0
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-pink-500 hover:bg-pink-600 text-white'
                            }`}
                    >
                        Redo
                    </button>
                    <button
                        onClick={handleClear}
                        className="px-4 py-2 rounded bg-red-500 text-white hover:bg-red-600 transition"
                    >
                        Clear
                    </button>
                    <button
                        onClick={() => {
                            if (canvas) {
                                const dataURL = canvas.toDataURL({ format: 'png' });
                                const link = document.createElement('a');
                                link.href = dataURL;
                                link.download = 'whiteboard.png';
                                link.click();
                            }
                        }}
                        className="px-4 py-2 rounded bg-teal-500 text-white hover:bg-teal-600 transition"
                    >
                        Export
                    </button>
                </div>
            </div>

            <div className="bg-white rounded shadow-lg p-2">
                <canvas
                    ref={canvasRef}
                    width={800}
                    height={600}
                    className="border border-gray-300 rounded"
                />
            </div>

            {/* Tool Instructions */}
            <div className="mt-4 text-sm text-gray-600">
                {tool === 'pen' && "Draw freely on the canvas with your mouse or touch"}
                {tool === 'eraser' && "Click on any object to remove it"}
                {tool === 'text' && "Click anywhere to add text. Click existing text to edit"}
            </div>
        </div>
    );
}
