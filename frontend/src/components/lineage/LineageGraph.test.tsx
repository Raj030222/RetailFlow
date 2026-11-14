import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LineageGraph } from "./LineageGraph";

describe("LineageGraph controls", () => {
  it("zooms in and out and fits back to the original view", () => {
    render(
      <LineageGraph
        selectedNodeId="source-customers"
        onSelectNode={vi.fn()}
      />,
    );
    const graph = screen.getByRole("img", {
      name: "Static RetailFlow data lineage from CSV sources to Parquet outputs",
    });
    const content = graph.querySelector("g");
    const scale = () =>
      Number(content?.getAttribute("transform")?.match(/scale\(([^)]+)\)/)?.[1]);

    expect(content).toHaveAttribute("transform", "translate(0 0) scale(1)");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(scale()).toBeCloseTo(1.15);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(scale()).toBeCloseTo(1);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(scale()).toBeCloseTo(0.85);
    fireEvent.click(screen.getByRole("button", { name: "Fit graph to screen" }));
    expect(scale()).toBeCloseTo(1);
  });

  it("selects output nodes and pans from the canvas background", () => {
    const onSelectNode = vi.fn();
    render(
      <LineageGraph
        selectedNodeId="source-customers"
        onSelectNode={onSelectNode}
      />,
    );
    const graph = screen.getByRole("img", {
      name: "Static RetailFlow data lineage from CSV sources to Parquet outputs",
    });
    const output = screen.getByRole("button", {
      name: "Select output dataset processed_transactions",
    });
    fireEvent.click(output);
    expect(onSelectNode).toHaveBeenCalledWith(
      expect.objectContaining({ id: "output-processed_transactions" }),
    );

    vi.spyOn(graph, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1000,
      bottom: 500,
      width: 1000,
      height: 500,
      toJSON: () => ({}),
    });
    const background = graph.querySelector('rect[fill="transparent"]');
    const canvas = within(
      screen.getByRole("region", {
        name: "Data flow graph. Scroll horizontally on small screens; drag the canvas background to pan.",
      }),
    ).getByRole("img", {
      name: "Static RetailFlow data lineage from CSV sources to Parquet outputs",
    });

    fireEvent.pointerDown(background!, {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(canvas, {
      clientX: 150,
      clientY: 130,
      pointerId: 1,
    });

    expect(canvas.querySelector("g")).not.toHaveAttribute(
      "transform",
      "translate(0 0) scale(1)",
    );
    fireEvent.pointerUp(canvas, { pointerId: 1 });
  });
});
