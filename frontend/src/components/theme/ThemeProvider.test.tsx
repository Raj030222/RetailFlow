import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { ThemeProvider } from "./ThemeProvider";
import { useTheme } from "./themeContext";

function ThemeControls() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button onClick={toggleTheme} type="button">
      {theme}
    </button>
  );
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  });

  it("applies and persists light and dark theme classes for all themed components", () => {
    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "light" }));

    expect(screen.getByRole("button", { name: "dark" })).toBeInTheDocument();
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem("retailflow-theme")).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "dark" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(localStorage.getItem("retailflow-theme")).toBe("light");
  });
});
