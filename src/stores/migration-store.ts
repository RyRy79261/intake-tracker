import { create } from "zustand";

export type MigrationPhase =
  | "idle"
  | "backup"
  | "uploading"
  | "verifying"
  | "complete"
  | "cancelled"
  | "error";

export interface TableProgress {
  total: number;
  uploaded: number;
  lastBatchIndex: number;
}

export interface VerificationResult {
  clientHash: string;
  serverHash: string;
  match: boolean;
}

interface MigrationState {
  phase: MigrationPhase;
  currentTableIndex: number;
  tableProgress: Record<string, TableProgress>;
  error: string | null;
  verificationResults: Record<string, VerificationResult>;
}

interface MigrationActions {
  setPhase: (phase: MigrationPhase) => void;
  setCurrentTableIndex: (index: number) => void;
  setTableProgress: (table: string, progress: TableProgress) => void;
  setError: (error: string | null) => void;
  setVerificationResult: (table: string, result: VerificationResult) => void;
  reset: () => void;
}

const initialState: MigrationState = {
  phase: "idle",
  currentTableIndex: 0,
  tableProgress: {},
  error: null,
  verificationResults: {},
};

export const useMigrationStore = create<MigrationState & MigrationActions>()(
  (set) => ({
    ...initialState,
    setPhase: (phase) => set({ phase }),
    setCurrentTableIndex: (index) => set({ currentTableIndex: index }),
    setTableProgress: (table, progress) =>
      set((state) => ({
        tableProgress: { ...state.tableProgress, [table]: progress },
      })),
    setError: (error) => set({ error }),
    setVerificationResult: (table, result) =>
      set((state) => ({
        verificationResults: {
          ...state.verificationResults,
          [table]: result,
        },
      })),
    reset: () => set(initialState),
  }),
);
