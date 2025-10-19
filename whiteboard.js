export class WhiteboardManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.isDrawing = false;
        this.currentTool = 'pen';
        this.currentColor = '#000000';
        this.lineWidth = 2;
        this.lastX = 0;
        this.lastY = 0;

        this.onDrawAction = null;

        this.setupCanvas();
        this.attachEventListeners();
    }

    setupCanvas() {
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.lineWidth = this.lineWidth;
    }

    attachEventListeners() {
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));

        this.canvas.addEventListener('touchstart', this.handleTouch.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouch.bind(this));
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
    }

    handleTouch(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent(e.type === 'touchstart' ? 'mousedown' : 'mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.canvas.dispatchEvent(mouseEvent);
    }

    startDrawing(e) {
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        this.lastX = e.clientX - rect.left;
        this.lastY = e.clientY - rect.top;
    }

    draw(e) {
        if (!this.isDrawing) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const action = {
            tool: this.currentTool,
            color: this.currentColor,
            lineWidth: this.lineWidth,
            startX: this.lastX,
            startY: this.lastY,
            endX: x,
            endY: y
        };

        this.executeDrawAction(action);

        if (this.onDrawAction) {
            this.onDrawAction(action);
        }

        this.lastX = x;
        this.lastY = y;
    }

    stopDrawing() {
        this.isDrawing = false;
    }

    executeDrawAction(action) {
        this.ctx.beginPath();
        this.ctx.moveTo(action.startX, action.startY);
        this.ctx.lineTo(action.endX, action.endY);

        if (action.tool === 'eraser') {
            this.ctx.globalCompositeOperation = 'destination-out';
            this.ctx.lineWidth = 20;
        } else {
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.strokeStyle = action.color;
            this.ctx.lineWidth = action.lineWidth;
        }

        this.ctx.stroke();
        this.ctx.closePath();

        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.lineWidth = this.lineWidth;
    }

    setTool(tool) {
        this.currentTool = tool;
    }

    setColor(color) {
        this.currentColor = color;
        this.ctx.strokeStyle = color;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.onDrawAction) {
            this.onDrawAction({ tool: 'clear' });
        }
    }

    handleRemoteAction(action) {
        if (action.tool === 'clear') {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        } else {
            this.executeDrawAction(action);
        }
    }
}
