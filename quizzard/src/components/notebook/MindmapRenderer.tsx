'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Download, Copy, Check, Maximize2, Minimize2, FileText, Image, Brain } from 'lucide-react';

interface MindmapRendererProps {
  title: string;
  markdown: string;
  notebookId: string;
}

interface TreeNode {
  name: string;
  children: TreeNode[];
}

// Parse markdown headings into a tree structure
function parseMarkdownToTree(markdown: string, rootTitle: string): TreeNode {
  const lines = markdown.split('\n').filter(l => l.trim());
  const root: TreeNode = { name: rootTitle, children: [] };
  const stack: { node: TreeNode; level: number }[] = [{ node: root, level: 0 }];

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/);
    if (!match) continue;
    const level = match[1].length;
    const text = match[2].trim();
    const newNode: TreeNode = { name: text, children: [] };

    // Find proper parent
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    stack[stack.length - 1].node.children.push(newNode);
    stack.push({ node: newNode, level });
  }

  return root;
}

// Node colors by depth (pastel palette for dark background)
const NODE_COLORS = [
  { bg: 'rgba(140, 82, 255, 0.35)', border: 'rgba(140, 82, 255, 0.6)' },   // root purple
  { bg: 'rgba(81, 112, 255, 0.25)', border: 'rgba(81, 112, 255, 0.5)' },    // blue
  { bg: 'rgba(147, 168, 255, 0.2)', border: 'rgba(147, 168, 255, 0.45)' },   // light blue
  { bg: 'rgba(196, 169, 255, 0.2)', border: 'rgba(196, 169, 255, 0.45)' },   // light purple
  { bg: 'rgba(99, 179, 237, 0.2)', border: 'rgba(99, 179, 237, 0.45)' },     // cyan
  { bg: 'rgba(167, 139, 250, 0.2)', border: 'rgba(167, 139, 250, 0.45)' },   // violet
];

const LINE_COLORS = [
  '#8c52ff', '#5170ff', '#93a8ff', '#c4a9ff', '#63b3ed', '#a78bfa',
];

export default function MindmapRenderer({ title, markdown }: MindmapRendererProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [copiedType, setCopiedType] = useState<'image' | 'markdown' | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const svg = svgRef.current;
    const container = containerRef.current;
    const width = container.clientWidth || 700;
    const height = expanded ? 600 : 360;

    // Parse markdown into tree
    const tree = parseMarkdownToTree(markdown, title);

    // Clear previous
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const cx = width / 2;
    const cy = height / 2;

    // Flatten tree with positions using radial layout
    interface PositionedNode {
      name: string;
      x: number;
      y: number;
      depth: number;
      parentX?: number;
      parentY?: number;
    }

    const nodes: PositionedNode[] = [];

    function layoutNodes(
      node: TreeNode,
      depth: number,
      angleStart: number,
      angleEnd: number,
      parentX?: number,
      parentY?: number,
    ) {
      let x: number, y: number;

      if (depth === 0) {
        x = cx;
        y = cy;
      } else {
        const angle = (angleStart + angleEnd) / 2;
        const radius = depth === 1
          ? Math.min(width, height) * 0.3
          : Math.min(width, height) * (0.3 + depth * 0.14);
        x = cx + radius * Math.cos(angle);
        y = cy + radius * Math.sin(angle);
      }

      nodes.push({ name: node.name, x, y, depth, parentX, parentY });

      if (node.children.length > 0) {
        const angleRange = angleEnd - angleStart;
        const childAngleStep = angleRange / node.children.length;

        node.children.forEach((child, i) => {
          const childStart = angleStart + i * childAngleStep;
          const childEnd = childStart + childAngleStep;
          layoutNodes(child, depth + 1, childStart, childEnd, x, y);
        });
      }
    }

    layoutNodes(tree, 0, 0, 2 * Math.PI);

    // Draw connections first (behind nodes)
    nodes.forEach((node) => {
      if (node.parentX !== undefined && node.parentY !== undefined) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(node.parentX));
        line.setAttribute('y1', String(node.parentY));
        line.setAttribute('x2', String(node.x));
        line.setAttribute('y2', String(node.y));
        line.setAttribute('stroke', LINE_COLORS[(node.depth - 1) % LINE_COLORS.length]);
        line.setAttribute('stroke-width', String(Math.max(1.5, 3 - node.depth * 0.5)));
        line.setAttribute('stroke-opacity', '0.5');
        svg.appendChild(line);
      }
    });

    // Draw nodes
    nodes.forEach((node) => {
      const colors = NODE_COLORS[node.depth % NODE_COLORS.length];
      const isRoot = node.depth === 0;

      // Measure text to size ellipse
      const fontSize = isRoot ? 14 : Math.max(10, 13 - node.depth);
      const textLen = node.name.length;
      const rx = isRoot
        ? Math.max(50, textLen * 5 + 24)
        : Math.max(35, textLen * 3.5 + 16);
      const ry = isRoot ? 28 : Math.max(18, 22 - node.depth * 2);

      // Ellipse
      const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
      ellipse.setAttribute('cx', String(node.x));
      ellipse.setAttribute('cy', String(node.y));
      ellipse.setAttribute('rx', String(rx));
      ellipse.setAttribute('ry', String(ry));
      ellipse.setAttribute('fill', colors.bg);
      ellipse.setAttribute('stroke', colors.border);
      ellipse.setAttribute('stroke-width', isRoot ? '2' : '1.5');
      svg.appendChild(ellipse);

      // Text
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(node.x));
      text.setAttribute('y', String(node.y));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('fill', isRoot ? '#ede9ff' : 'rgba(237, 233, 255, 0.85)');
      text.setAttribute('font-size', String(fontSize));
      text.setAttribute('font-weight', isRoot ? '700' : '500');
      text.setAttribute('font-family', "'DM Sans', sans-serif");

      // Truncate long text
      const maxChars = isRoot ? 20 : Math.floor(rx / 3.5);
      const displayText = node.name.length > maxChars
        ? node.name.slice(0, maxChars - 1) + '…'
        : node.name;
      text.textContent = displayText;

      // Tooltip for truncated text
      if (node.name.length > maxChars) {
        const titleEl = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        titleEl.textContent = node.name;
        text.appendChild(titleEl);
      }

      svg.appendChild(text);
    });

    setLoaded(true);
  }, [markdown, title, expanded]);

  const copyImage = useCallback(async () => {
    if (!svgRef.current) return;
    try {
      const svgEl = svgRef.current;
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const viewBox = svgEl.getAttribute('viewBox')?.split(' ').map(Number) || [0, 0, 700, 360];
      const w = viewBox[2] * 2; // 2x for retina quality
      const h = viewBox[3] * 2;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      // Dark background
      ctx.fillStyle = '#0f0e1e';
      ctx.fillRect(0, 0, w, h);

      const img = new window.Image();
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = reject;
        img.src = url;
      });

      canvas.toBlob(async (pngBlob) => {
        if (pngBlob) {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': pngBlob }),
          ]);
          setCopiedType('image');
          setTimeout(() => setCopiedType(null), 2000);
        }
      }, 'image/png');
    } catch {
      // Fallback: copy markdown if image copy fails
      await navigator.clipboard.writeText(markdown);
      setCopiedType('markdown');
      setTimeout(() => setCopiedType(null), 2000);
    }
  }, [markdown]);

  const copyMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopiedType('markdown');
      setTimeout(() => setCopiedType(null), 2000);
    } catch { /* silent */ }
  }, [markdown]);

  const downloadHtml = useCallback(() => {
    const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeMarkdown = JSON.stringify(markdown);
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeTitle} — Mind Map</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0f0e1e; display: flex; align-items: center; justify-content: center; min-height: 100vh; font-family: 'Segoe UI', system-ui, sans-serif; }
  svg { width: 100vw; height: 100vh; display: block; }
</style>
</head>
<body>
<svg id="mindmap"></svg>
<script>
(function() {
  const markdown = ${safeMarkdown};
  const title = ${JSON.stringify(title)};

  const NODE_COLORS = [
    { bg: 'rgba(140,82,255,0.35)', border: 'rgba(140,82,255,0.6)' },
    { bg: 'rgba(81,112,255,0.25)', border: 'rgba(81,112,255,0.5)' },
    { bg: 'rgba(147,168,255,0.2)', border: 'rgba(147,168,255,0.45)' },
    { bg: 'rgba(196,169,255,0.2)', border: 'rgba(196,169,255,0.45)' },
    { bg: 'rgba(99,179,237,0.2)', border: 'rgba(99,179,237,0.45)' },
    { bg: 'rgba(167,139,250,0.2)', border: 'rgba(167,139,250,0.45)' },
  ];
  const LINE_COLORS = ['#8c52ff','#5170ff','#93a8ff','#c4a9ff','#63b3ed','#a78bfa'];

  function parseTree(md, rootTitle) {
    const lines = md.split('\\n').filter(l => l.trim());
    const root = { name: rootTitle, children: [] };
    const stack = [{ node: root, level: 0 }];
    for (const line of lines) {
      const m = line.match(/^(#{1,6})\\s+(.+)/);
      if (!m) continue;
      const level = m[1].length;
      const n = { name: m[2].trim(), children: [] };
      while (stack.length > 1 && stack[stack.length-1].level >= level) stack.pop();
      stack[stack.length-1].node.children.push(n);
      stack.push({ node: n, level });
    }
    return root;
  }

  const svg = document.getElementById('mindmap');
  const w = window.innerWidth, h = window.innerHeight;
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  const cx = w/2, cy = h/2;
  const tree = parseTree(markdown, title);
  const nodes = [];

  function layout(node, depth, aStart, aEnd, px, py) {
    let x, y;
    if (depth === 0) { x = cx; y = cy; }
    else {
      const a = (aStart + aEnd) / 2;
      const r = depth === 1 ? Math.min(w,h)*0.28 : Math.min(w,h)*(0.28 + depth*0.14);
      x = cx + r*Math.cos(a); y = cy + r*Math.sin(a);
    }
    nodes.push({ name: node.name, x, y, depth, px, py });
    if (node.children.length) {
      const step = (aEnd - aStart) / node.children.length;
      node.children.forEach((c, i) => layout(c, depth+1, aStart+i*step, aStart+(i+1)*step, x, y));
    }
  }
  layout(tree, 0, 0, 2*Math.PI);

  function el(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k,v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    return e;
  }

  nodes.forEach(n => {
    if (n.px !== undefined) {
      svg.appendChild(el('line', { x1:n.px, y1:n.py, x2:n.x, y2:n.y,
        stroke: LINE_COLORS[(n.depth-1)%LINE_COLORS.length],
        'stroke-width': Math.max(1.5, 3-n.depth*0.5), 'stroke-opacity': 0.5 }));
    }
  });

  nodes.forEach(n => {
    const c = NODE_COLORS[n.depth % NODE_COLORS.length];
    const isRoot = n.depth === 0;
    const fs = isRoot ? 15 : Math.max(11, 14-n.depth);
    const rx = isRoot ? Math.max(55, n.name.length*5+28) : Math.max(38, n.name.length*3.8+18);
    const ry = isRoot ? 30 : Math.max(19, 23-n.depth*2);
    svg.appendChild(el('ellipse', { cx:n.x, cy:n.y, rx, ry, fill:c.bg, stroke:c.border, 'stroke-width': isRoot?2:1.5 }));
    const maxC = isRoot ? 22 : Math.floor(rx/3.5);
    const txt = n.name.length > maxC ? n.name.slice(0,maxC-1)+'\\u2026' : n.name;
    const t = el('text', { x:n.x, y:n.y, 'text-anchor':'middle', 'dominant-baseline':'central',
      fill: isRoot?'#ede9ff':'rgba(237,233,255,0.85)', 'font-size':fs, 'font-weight':isRoot?'700':'500',
      'font-family': "'Segoe UI',system-ui,sans-serif" });
    t.textContent = txt;
    if (n.name.length > maxC) { const ti = el('title',{}); ti.textContent = n.name; t.appendChild(ti); }
    svg.appendChild(t);
  });
})();
<\/script>
</body>
</html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}_mindmap.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, [markdown, title]);

  const containerHeight = expanded ? '600px' : '360px';

  return (
    <div style={{
      width: '100%',
      borderRadius: '12px',
      border: '1px solid rgba(81,112,255,0.25)',
      background: 'linear-gradient(145deg, #1a1833 0%, #16152a 50%, #120f24 100%)',
      overflow: 'hidden',
      margin: '8px 0',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px',
        borderBottom: '1px solid rgba(81,112,255,0.12)',
        background: 'rgba(81,112,255,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            display: 'flex', alignItems: 'center', color: '#93a8ff',
          }}><Brain size={16} /></span>
          <span style={{
            fontSize: '13px', fontWeight: 600, color: '#93a8ff',
            fontFamily: "'Gliker', 'DM Sans', sans-serif",
          }}>
            {title}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <ToolbarButton
            onClick={() => setExpanded(v => !v)}
            icon={expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            tooltip={expanded ? 'Collapse' : 'Expand'}
          />
          <ToolbarButton
            onClick={copyImage}
            icon={copiedType === 'image' ? <Check size={12} /> : <Image size={12} />}
            tooltip={copiedType === 'image' ? 'Copied image!' : 'Copy as image'}
          />
          <ToolbarButton
            onClick={copyMarkdown}
            icon={copiedType === 'markdown' ? <Check size={12} /> : <FileText size={12} />}
            tooltip={copiedType === 'markdown' ? 'Copied!' : 'Copy markdown'}
          />
          <ToolbarButton
            onClick={downloadHtml}
            icon={<Download size={12} />}
            tooltip="Download interactive HTML"
          />
        </div>
      </div>

      {/* SVG container */}
      <div
        ref={containerRef}
        style={{
          height: containerHeight,
          transition: 'height 0.3s ease',
          position: 'relative',
          background: '#0f0e1e',
        }}
      >
        {!loaded && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(237,233,255,0.3)', fontSize: '13px',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            Rendering mind map...
          </div>
        )}
        <svg
          ref={svgRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        />
      </div>
    </div>
  );
}

function ToolbarButton({ onClick, icon, tooltip }: {
  onClick: () => void;
  icon: React.ReactNode;
  tooltip: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      title={tooltip}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '26px', height: '26px', borderRadius: '6px',
        border: '1px solid rgba(81,112,255,0.15)',
        background: hovered ? 'rgba(81,112,255,0.12)' : 'transparent',
        color: hovered ? '#93a8ff' : 'rgba(237,233,255,0.4)',
        cursor: 'pointer',
        transition: 'background 0.12s, color 0.12s',
      }}
    >
      {icon}
    </button>
  );
}
