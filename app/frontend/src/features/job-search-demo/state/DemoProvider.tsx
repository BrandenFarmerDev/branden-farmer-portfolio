import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { createInitialState } from "../model/fixtures";
import { emptyTextFilters, type TextFilters } from "../model/filters";
import { buildDashboard, reviewQueue } from "../model/selectors";
import type { DemoAction, Dashboard, DemoState, SourceMatch } from "../model/types";

export interface DemoContextValue {
  state: DemoState; dashboard: Dashboard; reviews: SourceMatch[]; error: string; notice: string;
  /** Runs one action against the latest state and reports its outcome in the shell. Returns the error message, or null on success. */
  perform: (action: DemoAction) => string | null;
  reset: () => void;
  /** Free-text filters stay in memory so typed text never reaches the URL or browser history. */
  text: TextFilters; setText: (changes: Partial<TextFilters>) => void;
  customRange: boolean; setCustomRange: (custom: boolean) => void;
}
const Context = createContext<DemoContextValue | null>(null);

export function useDemo(): DemoContextValue {
  const value = useContext(Context);
  if (!value) throw new Error("useDemo must be used inside DemoProvider");
  return value;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(createInitialState);
  const latest = useRef(state);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [text, setTextState] = useState(emptyTextFilters); const [customRange, setCustomRange] = useState(false);
  const perform = useCallback((action: DemoAction) => {
    const result = action(latest.current);
    if (!result.ok) { setError(result.error); setNotice(""); return result.error; }
    latest.current = result.state; setState(result.state); setError(""); setNotice(result.notice);
    return null;
  }, []);
  const reset = useCallback(() => {
    const initial = createInitialState();
    latest.current = initial; setState(initial); setTextState(emptyTextFilters); setCustomRange(false); setError(""); setNotice("Demo reset to its original sample data.");
  }, []);
  const setText = useCallback((changes: Partial<TextFilters>) => setTextState((current) => ({ ...current, ...changes })), []);
  const dashboard = useMemo(() => buildDashboard(state), [state]);
  const reviews = useMemo(() => reviewQueue(state), [state]);
  const value = useMemo(() => ({ state, dashboard, reviews, error, notice, perform, reset, text, setText, customRange, setCustomRange }), [state, dashboard, reviews, error, notice, perform, reset, text, setText, customRange]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
