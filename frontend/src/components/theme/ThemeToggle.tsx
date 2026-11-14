import { Moon, Sun } from "lucide-react";
import { Button } from "../ui/button";
import { useTheme } from "./themeContext";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <Button
      aria-label={label}
      className="text-muted-foreground"
      onClick={toggleTheme}
      size="icon"
      variant="ghost"
    >
      {theme === "dark" ? (
        <Sun aria-hidden="true" className="h-4 w-4" />
      ) : (
        <Moon aria-hidden="true" className="h-4 w-4" />
      )}
    </Button>
  );
}
