"use client";

import { useCallback, useEffect, useState } from "react";

import type { Theme } from "@/components/charts/palette";

const STORAGE_KEY = "lln-theme";

function readInitialTheme(): Theme {
  if (typeof document === "undefined") {
    return "light";
  }
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Theme state, kept in sync with the class the inline bootstrap script puts on
 * `<html>`. The listener re-reads the OS preference so the app follows the
 * system unless the user has explicitly chosen a theme.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      if (localStorage.getItem(STORAGE_KEY) === null) {
        setTheme(event.matches ? "dark" : "light");
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const apply = useCallback((next: Theme) => {
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable; the class on <html> is what matters.
    }
    setTheme(next);
  }, []);

  const toggle = useCallback(() => {
    apply(readInitialTheme() === "dark" ? "light" : "dark");
  }, [apply]);

  return { theme, toggle };
}
