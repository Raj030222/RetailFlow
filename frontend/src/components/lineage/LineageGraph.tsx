import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Minus, Plus, Scan } from "lucide-react";
import { getConnectedNodeIds, LINEAGE_EDGES, LINEAGE_NODES } from "../../lib/dataLineage";
import type { LineageNode, LineageNodeKind } from "../../types/lineage";
import { Button } from "../ui/button";

const WIDTH = 1400;
const HEIGHT = 680;
const SOURCE_WIDTH = 190;
const STAGE_WIDTH = 190;
const OUTPUT_WIDTH = 240;
const NODE_HEIGHT = 58;

const positions: Record<string, { x: number; y: number }> = {
  "source-customers": { x: 20, y: 112 },
  "source-products": { x: 20, y: 292 },
  "source-transactions": { x: 20, y: 472 },
  "stage-ingestion": { x: 250, y: 292 },
  "stage-classification": { x: 470, y: 292 },
  "stage-baseline": { x: 690, y: 177 },
  "stage-optimized": { x: 690, y: 407 },
  "stage-publication": { x: 910, y: 292 },
};

LINEAGE_NODES.filter((node) => node.kind === "output").forEach((node, index) => {
  positions[node.id] = { x: 1130, y: 20 + index * 70 };
});

function getPosition(nodeId: string): { x: number; y: number } {
  const position = positions[nodeId];
  if (!position) throw new Error(`Missing graph position for node ${nodeId}`);
  return position;
}

function nodeWidth(node: LineageNode): number {
  return node.kind === "source"
    ? SOURCE_WIDTH
    : node.kind === "output"
      ? OUTPUT_WIDTH
      : STAGE_WIDTH;
}

function nodeRight(node: LineageNode): { x: number; y: number } {
  const position = getPosition(node.id);
  return { x: position.x + nodeWidth(node), y: position.y + NODE_HEIGHT / 2 };
}

function nodeLeft(node: LineageNode): { x: number; y: number } {
  const position = getPosition(node.id);
  return { x: position.x, y: position.y + NODE_HEIGHT / 2 };
}

function shortDescription(node: LineageNode): string {
  if (node.kind === "source") return node.filePath ?? "Source dataset";
  if (node.kind === "output") return node.format ?? "Output dataset";
  return node.id === "stage-baseline"
    ? "Join and aggregate"
    : node.id === "stage-optimized"
      ? "Broadcast joins and aggregate"
      : node.id === "stage-publication"
        ? "Staged Parquet publication"
        : node.id === "stage-classification"
          ? "Valid, rejected, duplicate"
          : "Explicit schemas";
}

function TypeLegend({ kind }: { kind: LineageNodeKind }) {
  if (kind === "source") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-primary text-[9px] font-semibold text-primary">
        CSV
      </span>
    );
  }
  if (kind === "stage") {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center border border-ring text-[9px] font-semibold text-accent-foreground [clip-path:polygon(20%_0,80%_0,100%_50%,80%_100%,20%_100%,0_50%)]">
        T
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-[50%] border border-border text-[8px] font-semibold text-muted-foreground">
      OUT
    </span>
  );
}

function LineageNodeShape({
  node,
  selected,
  related,
  onSelect,
}: {
  node: LineageNode;
  selected: boolean;
  related: boolean;
  onSelect: (node: LineageNode) => void;
}) {
  const position = getPosition(node.id);
  const width = nodeWidth(node);
  const active = selected || related;
  const stroke = selected
    ? "hsl(var(--primary))"
    : node.kind === "stage"
      ? "hsl(var(--ring))"
      : node.kind === "source"
        ? "hsl(var(--primary) / 0.55)"
        : "hsl(var(--border))";
  const onKeyDown = (event: React.KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(node);
    }
  };

  return (
    <g
      aria-label={`Select ${node.kind === "source" ? "source dataset" : node.kind === "output" ? "output dataset" : "transformation"} ${node.name}`}
      className="cursor-pointer outline-none focus-visible:outline-none"
      onClick={() => onSelect(node)}
      onKeyDown={onKeyDown}
      opacity={active ? 1 : 0.34}
      role="button"
      tabIndex={0}
    >
      <title>{`${node.name}: ${node.description}`}</title>
      {node.kind === "source" ? (
        <>
          <rect
            fill="hsl(var(--card))"
            height={NODE_HEIGHT}
            rx="12"
            stroke={stroke}
            strokeWidth={selected ? 3 : 1.5}
            width={width}
            x={position.x}
            y={position.y}
          />
          <rect
            fill="hsl(var(--primary))"
            height={NODE_HEIGHT - 2}
            rx="4"
            width="5"
            x={position.x + 1}
            y={position.y + 1}
          />
          <circle
            cx={position.x + 24}
            cy={position.y + 20}
            fill="hsl(var(--accent))"
            r="10"
          />
          <text
            fill="hsl(var(--accent-foreground))"
            fontSize="7"
            fontWeight="700"
            textAnchor="middle"
            x={position.x + 24}
            y={position.y + 23}
          >
            CSV
          </text>
        </>
      ) : node.kind === "stage" ? (
        <path
          d={`M ${position.x + 12} ${position.y} H ${position.x + width - 12} L ${position.x + width} ${position.y + NODE_HEIGHT / 2} L ${position.x + width - 12} ${position.y + NODE_HEIGHT} H ${position.x + 12} L ${position.x} ${position.y + NODE_HEIGHT / 2} Z`}
          fill="hsl(var(--accent) / 0.45)"
          stroke={stroke}
          strokeWidth={selected ? 3 : 1.5}
        />
      ) : (
        <>
          <path
            d={`M ${position.x} ${position.y + 9} C ${position.x} ${position.y - 3}, ${position.x + width} ${position.y - 3}, ${position.x + width} ${position.y + 9} V ${position.y + NODE_HEIGHT - 9} C ${position.x + width} ${position.y + NODE_HEIGHT + 3}, ${position.x} ${position.y + NODE_HEIGHT + 3}, ${position.x} ${position.y + NODE_HEIGHT - 9} Z`}
            fill="hsl(var(--card))"
            stroke={stroke}
            strokeWidth={selected ? 3 : 1.5}
          />
          <path
            d={`M ${position.x} ${position.y + 9} C ${position.x} ${position.y + 21}, ${position.x + width} ${position.y + 21}, ${position.x + width} ${position.y + 9}`}
            fill="none"
            stroke={stroke}
            strokeWidth="1.5"
          />
        </>
      )}
      <text
        fill="hsl(var(--foreground))"
        fontSize="12"
        fontWeight="600"
        x={position.x + (node.kind === "source" ? 43 : 14)}
        y={position.y + 25}
      >
        {node.name.length > 25 ? `${node.name.slice(0, 23)}…` : node.name}
      </text>
      <text
        fill="hsl(var(--muted-foreground))"
        fontSize="9"
        x={position.x + (node.kind === "source" ? 43 : 14)}
        y={position.y + 42}
      >
        {shortDescription(node)}
      </text>
      {selected && (
        <circle
          cx={position.x + width - 12}
          cy={position.y + 12}
          fill="hsl(var(--primary))"
          r="4"
        />
      )}
    </g>
  );
}

export function LineageGraph({
  selectedNodeId,
  onSelectNode,
}: {
  selectedNodeId: string;
  onSelectNode: (node: LineageNode) => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const connected = getConnectedNodeIds(selectedNodeId);

  const handlePointerDown = (event: ReactPointerEvent<SVGRectElement>) => {
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
    if (svgRef.current?.setPointerCapture) {
      svgRef.current.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag.current || !svgRef.current) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const dx = ((event.clientX - drag.current.x) / bounds.width) * WIDTH;
    const dy = ((event.clientY - drag.current.y) / bounds.height) * HEIGHT;
    setOffset({
      x: drag.current.offsetX + dx,
      y: drag.current.offsetY + dy,
    });
  };

  const handlePointerUp = () => {
    drag.current = null;
  };

  const zoom = (amount: number) => {
    setScale((current) => Math.min(1.7, Math.max(0.7, current + amount)));
  };

  const fit = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">
          {(["source", "stage", "output"] as const).map((kind) => (
            <span className="inline-flex items-center gap-1.5" key={kind}>
              <TypeLegend kind={kind} />
              {kind === "stage"
                ? "Transformation"
                : `${kind[0]?.toUpperCase()}${kind.slice(1)} dataset`}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-5 bg-primary" />
            Selected node path
          </span>
          <span>Stage statuses are not exposed by the pipeline.</span>
        </div>
        <div aria-label="Lineage graph controls" className="flex items-center gap-1">
          <Button
            aria-label="Zoom out"
            onClick={() => zoom(-0.15)}
            size="icon"
            title="Zoom out"
            variant="outline"
          >
            <Minus aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Fit graph to screen"
            onClick={fit}
            size="sm"
            title="Fit graph to screen"
            variant="outline"
          >
            <Scan aria-hidden="true" className="h-3.5 w-3.5" />
            Fit
          </Button>
          <Button
            aria-label="Zoom in"
            onClick={() => zoom(0.15)}
            size="icon"
            title="Zoom in"
            variant="outline"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        aria-label="Data flow graph. Scroll horizontally on small screens; drag the canvas background to pan."
        className="overflow-auto rounded-md border border-border bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="region"
        tabIndex={0}
      >
        <svg
          aria-label="Static RetailFlow data lineage from CSV sources to Parquet outputs"
          className="h-auto min-w-[1050px] touch-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          ref={svgRef}
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width="100%"
        >
          <defs>
            <marker
              id="lineage-arrow"
              markerHeight="7"
              markerWidth="8"
              orient="auto"
              refX="7"
              refY="3.5"
            >
              <path d="M 0 0 L 8 3.5 L 0 7 Z" fill="hsl(var(--muted-foreground))" />
            </marker>
            <marker
              id="lineage-arrow-active"
              markerHeight="7"
              markerWidth="8"
              orient="auto"
              refX="7"
              refY="3.5"
            >
              <path d="M 0 0 L 8 3.5 L 0 7 Z" fill="hsl(var(--primary))" />
            </marker>
          </defs>
          <rect
            fill="transparent"
            height={HEIGHT}
            onPointerDown={handlePointerDown}
            width={WIDTH}
            x="0"
            y="0"
          />
          <g transform={`translate(${offset.x} ${offset.y}) scale(${scale})`}>
            {LINEAGE_EDGES.map((edge) => {
              const from = LINEAGE_NODES.find((node) => node.id === edge.source);
              const to = LINEAGE_NODES.find((node) => node.id === edge.target);
              if (!from || !to) return null;
              const start = nodeRight(from);
              const end = nodeLeft(to);
              const controlX = (start.x + end.x) / 2;
              const active =
                connected.has(edge.source) && connected.has(edge.target);
              return (
                <path
                  d={`M ${start.x} ${start.y} C ${controlX} ${start.y}, ${controlX} ${end.y}, ${end.x} ${end.y}`}
                  fill="none"
                  key={`${edge.source}-${edge.target}`}
                  markerEnd={`url(#lineage-arrow${active ? "-active" : ""})`}
                  opacity={active ? 0.9 : 0.35}
                  stroke={active ? "hsl(var(--primary))" : "hsl(var(--border))"}
                  strokeWidth={active ? 2 : 1.5}
                />
              );
            })}
            {LINEAGE_NODES.map((node) => (
              <LineageNodeShape
                key={node.id}
                node={node}
                onSelect={onSelectNode}
                related={connected.has(node.id)}
                selected={node.id === selectedNodeId}
              />
            ))}
          </g>
        </svg>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Static pipeline structure from the current source code. Execution status shown elsewhere applies to the selected job, not to individual stages.
      </p>
    </div>
  );
}
